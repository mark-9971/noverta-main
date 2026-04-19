import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { schoolYearsTable, complianceTrendSnapshotsTable } from "@workspace/db/schema";
import { eq, and, lte, desc, sql } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import { computeAllActiveMinuteProgress } from "../../lib/minuteCalc";

function resolveDistrictId(req: Request): number | null {
  const enforced = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (enforced !== null) return enforced;
  const qd = req.query.districtId;
  if (qd) {
    const n = Number(qd);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

async function resolveSchoolYearDates(
  schoolYearId: number | undefined
): Promise<{ startDate: string; endDate: string } | null> {
  if (!schoolYearId) return null;
  const [year] = await db
    .select({ startDate: schoolYearsTable.startDate, endDate: schoolYearsTable.endDate })
    .from(schoolYearsTable)
    .where(eq(schoolYearsTable.id, schoolYearId))
    .limit(1);
  return year ?? null;
}

const router = Router();

/**
 * GET /api/reports/compliance-week-trend
 *
 * Returns a lightweight prior-week compliance snapshot so the dashboard can
 * render week-over-week delta arrows next to the hero compliance rate and the
 * student count triplet (Out of Compliance / At Risk / On Track).
 *
 * Strategy: re-run the minute-progress calculation but cap the session window
 * at 7 days ago. This gives us the "delivered minutes as of last week", from
 * which we derive the same summary metrics the main report computes today.
 *
 * All filters (schoolId, schoolYearId) mirror the compliance-risk-report
 * endpoint so the WoW delta is always apples-to-apples with the current view.
 *
 * Student category logic matches compliance-risk-report exactly:
 *   - studentsOutOfCompliance: riskStatus === "out_of_compliance"
 *   - studentsAtRisk:          riskStatus === "at_risk"
 *   - studentsOnTrack:         riskStatus === "on_track" || "completed"
 *   (slightly_behind is not counted in any of the three buckets shown on the
 *    dashboard, matching the canonical report's own summary definition)
 */
router.get("/reports/compliance-week-trend", async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = resolveDistrictId(req);
    if (!districtId) {
      res.status(403).json({ error: "District context required" });
      return;
    }

    const rawSchoolId = req.query.schoolId ? Number(req.query.schoolId) : undefined;
    if (rawSchoolId !== undefined && (!Number.isInteger(rawSchoolId) || rawSchoolId <= 0)) {
      res.status(400).json({ error: "Invalid schoolId parameter" });
      return;
    }
    const schoolId = rawSchoolId;

    const rawSchoolYearId = req.query.schoolYearId ? Number(req.query.schoolYearId) : undefined;
    const yearDates = await resolveSchoolYearDates(rawSchoolYearId);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const priorWeekDateStr = sevenDaysAgo.toISOString().substring(0, 10);

    // Cap the session end date at 7 days ago, but also respect the school year
    // end date when a year filter is active (take the earlier of the two).
    const effectiveEndDate =
      yearDates?.endDate && yearDates.endDate < priorWeekDateStr
        ? yearDates.endDate
        : priorWeekDateStr;

    // Snapshot fast-path: when no school or school-year filter is applied, the
    // nightly per-district trend snapshot already captures these exact metrics.
    // Reading it is O(1) and immune to retroactive session edits. We accept the
    // most recent snapshot at-or-before the prior-week target date so a missed
    // nightly run still serves trend data.
    let overallComplianceRate = 100;
    let studentsOutOfCompliance = 0;
    let studentsAtRisk = 0;
    let studentsOnTrack = 0;
    let primaryAvailable = false;
    let priorWeekEndDateOut: string = effectiveEndDate;
    let primarySource: "snapshot" | "live" = "live";

    if (schoolId === undefined && rawSchoolYearId === undefined) {
      const [snapshot] = await db
        .select({
          snapshotDate: complianceTrendSnapshotsTable.snapshotDate,
          overallComplianceRate: complianceTrendSnapshotsTable.overallComplianceRate,
          studentsOutOfCompliance: complianceTrendSnapshotsTable.studentsOutOfCompliance,
          studentsAtRisk: complianceTrendSnapshotsTable.studentsAtRisk,
          studentsOnTrack: complianceTrendSnapshotsTable.studentsOnTrack,
        })
        .from(complianceTrendSnapshotsTable)
        .where(and(
          eq(complianceTrendSnapshotsTable.districtId, districtId),
          lte(complianceTrendSnapshotsTable.snapshotDate, effectiveEndDate),
        ))
        .orderBy(desc(complianceTrendSnapshotsTable.snapshotDate))
        .limit(1);

      if (snapshot) {
        const rate = typeof snapshot.overallComplianceRate === "string"
          ? parseFloat(snapshot.overallComplianceRate)
          : (snapshot.overallComplianceRate as unknown as number);
        overallComplianceRate = Number.isFinite(rate) ? rate : 100;
        studentsOutOfCompliance = snapshot.studentsOutOfCompliance;
        studentsAtRisk = snapshot.studentsAtRisk;
        studentsOnTrack = snapshot.studentsOnTrack;
        priorWeekEndDateOut = typeof snapshot.snapshotDate === "string"
          ? snapshot.snapshotDate
          : new Date(snapshot.snapshotDate as unknown as string).toISOString().substring(0, 10);
        primaryAvailable = true;
        primarySource = "snapshot";
      }
      // If no snapshot exists yet (e.g. fresh install before first nightly
      // run), fall through to the live-compute path below.
    }

    if (!primaryAvailable) {
      const progress = await computeAllActiveMinuteProgress({
        districtId,
        ...(schoolId ? { schoolId } : {}),
        ...(yearDates ? { startDate: yearDates.startDate } : {}),
        endDate: effectiveEndDate,
        asOfDate: sevenDaysAgo,
      });

      if (progress.length === 0) {
        res.json({ available: false });
        return;
      }

      let totalRequired = 0;
      let totalDelivered = 0;
      const studentWorstStatus = new Map<number, string>();

    const riskOrder: Record<string, number> = {
      out_of_compliance: 0,
      at_risk: 1,
      slightly_behind: 2,
      on_track: 3,
      completed: 4,
    };

    for (const p of progress) {
      totalRequired += p.requiredMinutes;
      totalDelivered += p.deliveredMinutes;

      const current = studentWorstStatus.get(p.studentId);
      const currentOrder = current !== undefined ? (riskOrder[current] ?? 99) : 99;
      const newOrder = riskOrder[p.riskStatus] ?? 99;
      if (newOrder < currentOrder) {
        studentWorstStatus.set(p.studentId, p.riskStatus);
      }
    }

      overallComplianceRate =
        totalRequired > 0 ? Math.round((totalDelivered / totalRequired) * 1000) / 10 : 100;

      // Match canonical compliance-risk-report bucket definitions exactly:
      //   out_of_compliance  → studentsOutOfCompliance
      //   at_risk            → studentsAtRisk
      //   on_track/completed → studentsOnTrack
      //   slightly_behind    → not counted in any displayed bucket (same as main report)
      for (const status of studentWorstStatus.values()) {
        if (status === "out_of_compliance") studentsOutOfCompliance++;
        else if (status === "at_risk") studentsAtRisk++;
        else if (status === "on_track" || status === "completed") studentsOnTrack++;
      }
      primarySource = "live";
    }

    // ── Secondary metrics: re-run the dashboard's date-anchored counts with
    // "today" rewound by 7 days. These mirror what /evaluations/dashboard,
    // /transitions/dashboard, /iep-meetings/dashboard, and
    // /accommodation-compliance compute today, so the dashboard cards can
    // render WoW deltas next to their headline numbers.
    //
    // Every secondary query is scoped to the caller's district through the
    // student → school join. We deliberately do NOT apply the optional
    // `?schoolId=` filter to secondary metrics, even though the primary
    // compliance trend above does, because the dashboard cards consuming
    // these deltas (accommodation, evaluations, transitions, meetings) fetch
    // their current values from district-wide endpoints with no school
    // filter. Matching the prior-week scope to that current scope keeps the
    // WoW comparison apples-to-apples; otherwise a school filter would make
    // prior-week numbers school-scoped while current numbers stayed broader.
    // Per-caseload (case_manager_id) scoping is similarly skipped — the
    // cards always show district totals.
    // If a query fails, we omit that field so the UI silently hides its
    // delta arrow rather than blocking the rest of the trend payload.
    const sevenDaysAgoDateStr = priorWeekDateStr;
    const sevenDaysAgoTimestamp = sevenDaysAgo;

    // District-scope filter applied to every secondary query: only students
    // whose school belongs to the caller's district. Without this, the
    // prior-week aggregates would leak across tenants.
    const districtStudentScope = sql`s.school_id IN (SELECT id FROM schools WHERE district_id = ${districtId})`;

    const secondary: {
      accommodation?: { overallComplianceRate: number };
      evaluations?: { overdueEvaluations: number; overdueReEvaluations: number };
      transitions?: { missingPlan: number; overdueFollowups: number };
      meetings?: { overdueCount: number };
      goalMastery?: { masteryRate: number | null };
    } = {};

    try {
      // Overdue evaluations & re-evals as of sevenDaysAgo, scoped to the
      // caller's district through the student → school join.
      const evalRows = await db.execute(sql`
        SELECT
          (
            SELECT COUNT(*)::int FROM evaluations e
            JOIN students s ON s.id = e.student_id
            WHERE e.deleted_at IS NULL
              AND e.status IN ('pending', 'in_progress')
              AND e.due_date::date <= ${sevenDaysAgoDateStr}::date
              AND ${districtStudentScope}
          ) AS overdue_evals,
          (
            SELECT COUNT(*)::int FROM eligibility_determinations ed
            JOIN students s ON s.id = ed.student_id
            WHERE ed.deleted_at IS NULL
              AND ed.next_re_eval_date::date <= ${sevenDaysAgoDateStr}::date
              AND ${districtStudentScope}
          ) AS overdue_re_evals
      `);
      const row = evalRows.rows[0] as { overdue_evals: number; overdue_re_evals: number } | undefined;
      secondary.evaluations = {
        overdueEvaluations: Number(row?.overdue_evals ?? 0),
        overdueReEvaluations: Number(row?.overdue_re_evals ?? 0),
      };
    } catch (e) {
      console.warn("week-trend: prior evaluations counts failed", e);
    }

    try {
      // Transition-age (14+) active students in this district as of
      // sevenDaysAgo, minus those who already had a non-deleted transition
      // plan that existed at that point.
      const transitionRows = await db.execute(sql`
        WITH age_students AS (
          SELECT s.id
          FROM students s
          WHERE s.status = 'active'
            AND s.deleted_at IS NULL
            AND s.date_of_birth IS NOT NULL
            AND s.date_of_birth::date <= (${sevenDaysAgoDateStr}::date - INTERVAL '14 years')
            AND ${districtStudentScope}
        ),
        students_with_plan AS (
          SELECT DISTINCT tp.student_id
          FROM transition_plans tp
          WHERE tp.created_at <= ${sevenDaysAgoTimestamp}::timestamptz
            AND (tp.deleted_at IS NULL OR tp.deleted_at > ${sevenDaysAgoTimestamp}::timestamptz)
        )
        SELECT
          (SELECT COUNT(*)::int FROM age_students a WHERE a.id NOT IN (SELECT student_id FROM students_with_plan)) AS missing_plan,
          (
            SELECT COUNT(*)::int
            FROM transition_agency_referrals tar
            JOIN transition_plans tp ON tp.id = tar.transition_plan_id
            JOIN students s ON s.id = tp.student_id
            WHERE tar.deleted_at IS NULL
              AND tar.status = 'pending'
              AND tar.created_at <= ${sevenDaysAgoTimestamp}::timestamptz
              AND tar.follow_up_date IS NOT NULL
              AND tar.follow_up_date::date < ${sevenDaysAgoDateStr}::date
              AND ${districtStudentScope}
          ) AS overdue_followups
      `);
      const trow = transitionRows.rows[0] as { missing_plan: number; overdue_followups: number } | undefined;
      secondary.transitions = {
        missingPlan: Number(trow?.missing_plan ?? 0),
        overdueFollowups: Number(trow?.overdue_followups ?? 0),
      };
    } catch (e) {
      console.warn("week-trend: prior transitions counts failed", e);
    }

    try {
      // Meetings overdue 7d ago: scheduled meetings whose scheduledDate was
      // already past sevenDaysAgo and that existed at that point — scoped to
      // the caller's district through the student → school join.
      const meetingRows = await db.execute(sql`
        SELECT COUNT(*)::int AS overdue_count
        FROM team_meetings tm
        JOIN students s ON s.id = tm.student_id
        WHERE tm.status = 'scheduled'
          AND tm.scheduled_date::date < ${sevenDaysAgoDateStr}::date
          AND tm.created_at <= ${sevenDaysAgoTimestamp}::timestamptz
          AND ${districtStudentScope}
      `);
      const mrow = meetingRows.rows[0] as { overdue_count: number } | undefined;
      secondary.meetings = { overdueCount: Number(mrow?.overdue_count ?? 0) };
    } catch (e) {
      console.warn("week-trend: prior meetings count failed", e);
    }

    try {
      // Accommodation compliance % of students in this district whose
      // accommodations were all verified within the per-accommodation
      // window (default 30 days) ending sevenDaysAgo. Mirrors what
      // /accommodation-compliance computes today, district-scoped via the
      // student → school join.
      const accomRows = await db.execute(sql`
        WITH student_acc AS (
          SELECT
            ia.student_id,
            COUNT(*) FILTER (
              WHERE NOT EXISTS (
                SELECT 1 FROM accommodation_verifications av
                WHERE av.accommodation_id = ia.id
                  AND av.created_at >= (${sevenDaysAgoTimestamp}::timestamptz - MAKE_INTERVAL(days => COALESCE(ia.verification_schedule_days, 30)))
                  AND av.created_at <= ${sevenDaysAgoTimestamp}::timestamptz
                  AND av.status IN ('verified', 'partial', 'not_applicable')
              )
            ) AS overdue_count
          FROM iep_accommodations ia
          JOIN students s ON s.id = ia.student_id
          WHERE ia.active = true
            AND s.status = 'active'
            AND s.deleted_at IS NULL
            AND ${districtStudentScope}
          GROUP BY ia.student_id
        )
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE overdue_count = 0)::int AS fully_verified
        FROM student_acc
      `);
      const accRow = accomRows.rows[0] as { total: number; fully_verified: number } | undefined;
      const total = Number(accRow?.total ?? 0);
      const fully = Number(accRow?.fully_verified ?? 0);
      const accRate = total > 0 ? Math.round((fully * 100) / total) : 100;
      secondary.accommodation = { overallComplianceRate: accRate };
    } catch (e) {
      console.warn("week-trend: prior accommodation rate failed", e);
    }

    try {
      // Prior-week goal mastery rate. Mirrors /dashboard/goal-mastery-rate
      // but caps the progress_reports snapshot at sevenDaysAgo so we can
      // compute the same percentage as it would have been computed last
      // week. Goal scope is held constant (currently active goals) so the
      // delta reflects rating movement, not goal-roster churn.
      //
      // Unlike the other secondary metrics, the goal mastery card on the
      // dashboard DOES respect the schoolId filter, so we apply the same
      // school scope here for an apples-to-apples comparison. Per-caseload
      // staff scoping is intentionally skipped — admin views always see
      // district totals on this card.
      // Always enforce district scope. When `schoolId` is provided, the
      // school must ALSO belong to the caller's district — otherwise a
      // forged schoolId could pull goal mastery numbers from a different
      // tenant. Without an explicit schoolId, fall back to the caller's
      // entire district.
      const goalSchoolFilter = schoolId
        ? sql`AND g.student_id IN (
            SELECT id FROM students
            WHERE school_id = ${schoolId}
              AND school_id IN (SELECT id FROM schools WHERE district_id = ${districtId})
          )`
        : sql`AND g.student_id IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${districtId}))`;

      const masteryRows = await db.execute(sql`
        WITH latest_ratings AS (
          SELECT DISTINCT ON ((entry->>'iepGoalId')::int)
            (entry->>'iepGoalId')::int AS goal_id,
            entry->>'progressRating'   AS rating
          FROM progress_reports pr,
               LATERAL jsonb_array_elements(pr.goal_progress) AS entry
          WHERE jsonb_array_length(pr.goal_progress) > 0
            AND pr.created_at <= ${sevenDaysAgoTimestamp}::timestamptz
          ORDER BY (entry->>'iepGoalId')::int, pr.period_end DESC, pr.created_at DESC
        )
        SELECT
          COUNT(g.id)                                                                       AS total_goals,
          COUNT(lr.goal_id) FILTER (WHERE lr.rating IN ('mastered', 'sufficient_progress')) AS on_track_goals
        FROM iep_goals g
        LEFT JOIN latest_ratings lr ON lr.goal_id = g.id
        WHERE g.active = true
          AND g.status = 'active'
          AND g.created_at <= ${sevenDaysAgoTimestamp}::timestamptz
          ${goalSchoolFilter}
      `);
      const mrow = masteryRows.rows[0] as { total_goals: number; on_track_goals: number } | undefined;
      const totalGoals = Number(mrow?.total_goals ?? 0);
      const onTrackGoals = Number(mrow?.on_track_goals ?? 0);
      const masteryRate = totalGoals > 0 ? Math.round((onTrackGoals / totalGoals) * 100) : null;
      secondary.goalMastery = { masteryRate };
    } catch (e) {
      console.warn("week-trend: prior goal mastery rate failed", e);
    }

    res.json({
      available: true,
      priorWeekEndDate: priorWeekEndDateOut,
      overallComplianceRate,
      studentsOutOfCompliance,
      studentsAtRisk,
      studentsOnTrack,
      secondary,
      source: primarySource,
    });
  } catch (e: any) {
    console.error("GET /reports/compliance-week-trend error:", e);
    res.status(500).json({ error: "Failed to compute compliance week trend" });
  }
});

export default router;
