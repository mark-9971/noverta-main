// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, alertsTable, sessionLogsTable,
  scheduleBlocksTable, staffTable, staffAssignmentsTable,
  agencyContractsTable, agenciesTable,
  coverageInstancesTable, errorLogsTable,
} from "@workspace/db";
import { eq, and, gte, lte, count, sql, asc, isNull, inArray, type SQL } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../../lib/minuteCalc";
import {
  resolveCallerDistrictId,
  parseSchoolDistrictFilters,
  buildStudentSubquery,
  buildSessionStudentFilter,
  buildAlertStudentFilter,
  CASELOAD_ROLES_SERVER,
  getEnforcedCaseloadStaffId,
  resolveCaseloadStudentIds,
} from "./shared";
import type { AuthedRequest } from "../../middlewares/auth";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const sdFilters = parseSchoolDistrictFilters(req, req.query);
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartStr = weekStart.toISOString().substring(0, 10);
  const todayStr = today.toISOString().substring(0, 10);

  // Caseload clamp: providers/case_managers/bcbas/sped_teachers see only their
  // own caseload's slice of every aggregate. District-wide roles
  // (admin/coordinator/etc.) get null and behave exactly as before.
  const caseloadStudentIds = await resolveCaseloadStudentIds(req);
  const isCaseloadScoped = caseloadStudentIds !== null;
  // Empty caseload (unlinked staff or no assignments) → fail-closed: every
  // aggregate must be zero. Short-circuit before touching any other query.
  if (isCaseloadScoped && caseloadStudentIds.length === 0) {
    res.json({
      totalActiveStudents: 0,
      trackedStudents: 0,
      onTrackStudents: 0,
      slightlyBehindStudents: 0,
      atRiskStudents: 0,
      outOfComplianceStudents: 0,
      noDataStudents: 0,
      studentsNeedingSetup: 0,
      missedSessionsThisWeek: 0,
      openMakeupObligations: 0,
      uncoveredBlocksToday: 0,
      scheduleConflictsToday: 0,
      openAlerts: 0,
      criticalAlerts: 0,
      contractRenewals: [],
      errorsLast24h: 0,
    });
    return;
  }

  const studentFilter = buildStudentSubquery(sdFilters);
  const sessionFilter = buildSessionStudentFilter(sdFilters);
  const alertFilter = buildAlertStudentFilter(sdFilters);

  const studentConditions: SQL[] = [eq(studentsTable.status, "active")];
  if (studentFilter) studentConditions.push(studentFilter);
  if (isCaseloadScoped) studentConditions.push(inArray(studentsTable.id, caseloadStudentIds));

  const missedConditions: SQL[] = [eq(sessionLogsTable.status, "missed"), gte(sessionLogsTable.sessionDate, weekStartStr), lte(sessionLogsTable.sessionDate, todayStr), isNull(sessionLogsTable.deletedAt)];
  if (sessionFilter) missedConditions.push(sessionFilter);
  if (isCaseloadScoped) missedConditions.push(inArray(sessionLogsTable.studentId, caseloadStudentIds));

  const makeupConditions: SQL[] = [eq(sessionLogsTable.status, "missed"), isNull(sessionLogsTable.deletedAt)];
  if (sessionFilter) makeupConditions.push(sessionFilter);
  if (isCaseloadScoped) makeupConditions.push(inArray(sessionLogsTable.studentId, caseloadStudentIds));

  const alertConditions: SQL[] = [eq(alertsTable.resolved, false)];
  if (alertFilter) alertConditions.push(alertFilter);
  if (isCaseloadScoped) alertConditions.push(inArray(alertsTable.studentId, caseloadStudentIds));

  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    [activeStudentsResult],
    allProgress,
    [missedThisWeek],
    [openMakeups],
    alertCounts,
    allBlocks,
    [errorCount24h],
  ] = await Promise.all([
    db.select({ count: count() }).from(studentsTable).where(and(...studentConditions)),
    computeAllActiveMinuteProgress({
      ...sdFilters,
      ...(isCaseloadScoped ? { studentIds: caseloadStudentIds } : {}),
    }),
    db.select({ count: count() }).from(sessionLogsTable).where(and(...missedConditions)),
    db.select({ count: count() }).from(sessionLogsTable).where(and(...makeupConditions)),
    db.select({
      total: count(),
      critical: sql<number>`count(*) filter (where ${alertsTable.severity} = 'critical')`,
    }).from(alertsTable).where(and(...alertConditions)),
    (() => {
      const blockConditions: any[] = [eq(scheduleBlocksTable.isRecurring, true)];
      if (sdFilters.schoolId) blockConditions.push(sql`${scheduleBlocksTable.staffId} IN (SELECT id FROM staff WHERE school_id = ${sdFilters.schoolId})`);
      if (sdFilters.districtId) blockConditions.push(sql`${scheduleBlocksTable.staffId} IN (SELECT id FROM staff WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId}))`);
      // Caseload roles only see their own schedule conflicts (their own staff row).
      if (isCaseloadScoped) {
        const enforcedStaffId = getEnforcedCaseloadStaffId(req);
        blockConditions.push(eq(scheduleBlocksTable.staffId, enforcedStaffId ?? -1));
      }
      return db.select({
        staffId: scheduleBlocksTable.staffId,
        dayOfWeek: scheduleBlocksTable.dayOfWeek,
        startTime: scheduleBlocksTable.startTime,
        endTime: scheduleBlocksTable.endTime,
      }).from(scheduleBlocksTable).where(and(...blockConditions));
    })(),
    // errorsLast24h is a tenant-wide operational metric; caseload roles see 0.
    isCaseloadScoped
      ? Promise.resolve([{ count: 0 }])
      : db.select({ count: count() }).from(errorLogsTable).where(gte(errorLogsTable.occurredAt, cutoff24h)),
  ]);

  const studentRisk = new Map<number, string>();
  for (const p of allProgress) {
    const current = studentRisk.get(p.studentId);
    const priority: Record<string, number> = {
      out_of_compliance: 4, at_risk: 3, slightly_behind: 2, on_track: 1, completed: 0,
    };
    if (!current || (priority[p.riskStatus] ?? 0) > (priority[current] ?? 0)) {
      studentRisk.set(p.studentId, p.riskStatus);
    }
  }

  const onTrack = [...studentRisk.values()].filter(v => v === "on_track" || v === "completed").length;
  const slightlyBehind = [...studentRisk.values()].filter(v => v === "slightly_behind").length;
  const atRisk = [...studentRisk.values()].filter(v => v === "at_risk").length;
  const outOfCompliance = [...studentRisk.values()].filter(v => v === "out_of_compliance").length;
  // Students whose only risk signal so far is "no_data" — i.e. requirement exists
  // but the interval is brand new and zero sessions are logged. We do NOT count
  // these as on-track; we surface them so the UI can show an honest empty state.
  const noDataStudents = [...studentRisk.values()].filter(v => v === "no_data").length;

  let conflictsCount = 0;
  const grouped = new Map<string, typeof allBlocks>();
  for (const b of allBlocks) {
    const key = `${b.staffId}-${b.dayOfWeek}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(b);
  }
  for (const [_, blocks] of grouped.entries()) {
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        if (blocks[i].startTime < blocks[j].endTime && blocks[j].startTime < blocks[i].endTime) {
          conflictsCount++;
        }
      }
    }
  }

  // trackedStudents = students with at least one definitive risk signal (excludes
  // "no_data" students whose interval has barely started). Using this as the
  // compliance denominator ensures the dashboard percentage reflects what we
  // actually know, not optimistic guesses about students with zero data.
  const trackedStudents = studentRisk.size - noDataStudents;
  // Active students with no active service requirements at all (setup gap).
  const studentsNeedingSetup = Math.max(0, (activeStudentsResult?.count ?? 0) - studentRisk.size);

  // Contract renewals + uncovered-block counts are tenant-wide operational
  // signals; caseload roles see [] / 0 rather than the district aggregate.
  let renewingContracts: { id: number; agencyName: string; endDate: string | null }[] = [];
  let uncoveredCount = 0;
  if (!isCaseloadScoped) {
    const callerDistrictId = await resolveCallerDistrictId(req);
    const renewalConditions = [
      eq(agencyContractsTable.status, "active"),
      isNull(agencyContractsTable.deletedAt),
      isNull(agenciesTable.deletedAt),
      sql`${agencyContractsTable.endDate}::date <= CURRENT_DATE + INTERVAL '30 days'`,
      sql`${agencyContractsTable.endDate}::date >= CURRENT_DATE`,
    ];
    if (callerDistrictId) {
      renewalConditions.push(eq(agenciesTable.districtId, callerDistrictId));
    } else {
      renewalConditions.push(sql`false`);
    }

    renewingContracts = await db.select({
      id: agencyContractsTable.id,
      agencyName: agenciesTable.name,
      endDate: agencyContractsTable.endDate,
    })
      .from(agencyContractsTable)
      .innerJoin(agenciesTable, eq(agenciesTable.id, agencyContractsTable.agencyId))
      .where(and(...renewalConditions))
      .orderBy(asc(agencyContractsTable.endDate));

    const uncoveredConditions: any[] = [
      eq(coverageInstancesTable.absenceDate, todayStr),
      eq(coverageInstancesTable.isCovered, false),
    ];
    if (sdFilters.schoolId) {
      uncoveredConditions.push(sql`${coverageInstancesTable.originalStaffId} IN (SELECT id FROM staff WHERE school_id = ${sdFilters.schoolId})`);
    } else if (sdFilters.districtId) {
      uncoveredConditions.push(sql`${coverageInstancesTable.originalStaffId} IN (SELECT id FROM staff WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId}))`);
    }
    const [uncoveredResult] = await db
      .select({ count: count() })
      .from(coverageInstancesTable)
      .where(and(...uncoveredConditions));
    uncoveredCount = uncoveredResult?.count ?? 0;
  }

  res.json({
    totalActiveStudents: activeStudentsResult?.count ?? 0,
    trackedStudents,
    onTrackStudents: onTrack,
    slightlyBehindStudents: slightlyBehind,
    atRiskStudents: atRisk,
    outOfComplianceStudents: outOfCompliance,
    noDataStudents,
    studentsNeedingSetup,
    missedSessionsThisWeek: missedThisWeek?.count ?? 0,
    openMakeupObligations: openMakeups?.count ?? 0,
    uncoveredBlocksToday: uncoveredCount,
    scheduleConflictsToday: conflictsCount,
    openAlerts: alertCounts[0]?.total ?? 0,
    criticalAlerts: alertCounts[0]?.critical ?? 0,
    contractRenewals: renewingContracts,
    errorsLast24h: errorCount24h?.count ?? 0,
  });
});

router.get("/dashboard/risk-overview", async (req, res): Promise<void> => {
  const sdFilters = parseSchoolDistrictFilters(req, req.query);
  // Caseload clamp: providers/case_managers/etc. only see their own caseload.
  const caseloadStudentIds = await resolveCaseloadStudentIds(req);
  if (caseloadStudentIds !== null && caseloadStudentIds.length === 0) {
    res.json({ onTrack: 0, slightlyBehind: 0, atRisk: 0, outOfCompliance: 0, completed: 0, total: 0 });
    return;
  }
  const allProgress = await computeAllActiveMinuteProgress({
    ...sdFilters,
    ...(caseloadStudentIds !== null ? { studentIds: caseloadStudentIds } : {}),
  });
  const counts = { on_track: 0, slightly_behind: 0, at_risk: 0, out_of_compliance: 0, completed: 0, total: 0 };
  for (const p of allProgress) {
    counts.total++;
    if (p.riskStatus === "on_track") counts.on_track++;
    else if (p.riskStatus === "slightly_behind") counts.slightly_behind++;
    else if (p.riskStatus === "at_risk") counts.at_risk++;
    else if (p.riskStatus === "out_of_compliance") counts.out_of_compliance++;
    else if (p.riskStatus === "completed") counts.completed++;
  }
  res.json({
    onTrack: counts.on_track,
    slightlyBehind: counts.slightly_behind,
    atRisk: counts.at_risk,
    outOfCompliance: counts.out_of_compliance,
    completed: counts.completed,
    total: counts.total,
  });
});

router.get("/dashboard/provider-summary", async (req, res): Promise<void> => {
  const sdFilters = parseSchoolDistrictFilters(req, req.query);
  // Caseload clamp: caseload roles see only their own row.
  const enforcedStaffId = getEnforcedCaseloadStaffId(req);
  const staffConditions: any[] = [eq(staffTable.status, "active")];
  if (sdFilters.schoolId) staffConditions.push(eq(staffTable.schoolId, sdFilters.schoolId));
  if (sdFilters.districtId) staffConditions.push(sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId})`);
  if (enforcedStaffId !== null) staffConditions.push(eq(staffTable.id, enforcedStaffId));
  const alertFilter = buildAlertStudentFilter(sdFilters);
  const alertConditions: any[] = [eq(alertsTable.resolved, false)];
  if (alertFilter) alertConditions.push(alertFilter);
  if (enforcedStaffId !== null) alertConditions.push(eq(alertsTable.staffId, enforcedStaffId));

  const [providers, allProgress, alertsByStaff] = await Promise.all([
    db.select().from(staffTable).where(and(...staffConditions)),
    computeAllActiveMinuteProgress({
      ...sdFilters,
      ...(enforcedStaffId !== null ? { staffId: enforcedStaffId } : {}),
    }),
    db.select({
      staffId: alertsTable.staffId,
      count: count(),
    }).from(alertsTable)
      .where(and(...alertConditions))
      .groupBy(alertsTable.staffId),
  ]);

  const alertCountMap = new Map<number, number>();
  for (const a of alertsByStaff) {
    if (a.staffId != null) alertCountMap.set(a.staffId, a.count);
  }

  const result = providers.map((p) => {
    const caseloadProgress = allProgress.filter(prog => prog.providerId === p.id);
    const assignedStudents = new Set(caseloadProgress.map(prog => prog.studentId)).size;
    const totalRequired = caseloadProgress.reduce((sum, prog) => sum + prog.requiredMinutes, 0);
    const totalDelivered = caseloadProgress.reduce((sum, prog) => sum + prog.deliveredMinutes, 0);
    const studentsAtRisk = caseloadProgress.filter(prog =>
      prog.riskStatus === "at_risk" || prog.riskStatus === "out_of_compliance"
    ).length;

    const utilizationPercent = totalRequired > 0 ? Math.round((totalDelivered / totalRequired) * 100) : 0;

    return {
      staffId: p.id,
      staffName: `${p.firstName} ${p.lastName}`,
      role: p.role,
      assignedStudents,
      totalRequiredMinutes: totalRequired,
      totalDeliveredMinutes: totalDelivered,
      studentsAtRisk,
      openAlerts: alertCountMap.get(p.id) ?? 0,
      utilizationPercent,
    };
  });

  res.json(result);
});

router.get("/dashboard/program-trends", async (req, res): Promise<void> => {
  const sdFilters = parseSchoolDistrictFilters(req, req.query);
  const districtId = sdFilters.districtId ?? await resolveCallerDistrictId(req);

  // Caseload clamp: providers/case_managers/etc. only see trends for their
  // own caseload; empty caseload → empty arrays (fail-closed).
  const caseloadStudentIds = await resolveCaseloadStudentIds(req);
  if (caseloadStudentIds !== null && caseloadStudentIds.length === 0) {
    res.json({ skillAcquisition: [], behaviorReduction: [] });
    return;
  }

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const startDate = twelveMonthsAgo.toISOString().slice(0, 10);

  const schoolFilter = districtId
    ? sql`AND s.school_id IN (SELECT id FROM schools WHERE district_id = ${districtId})`
    : sql``;
  const caseloadFilter = caseloadStudentIds !== null
    ? sql`AND s.id IN (${sql.join(caseloadStudentIds.map(id => sql`${id}`), sql`, `)})`
    : sql``;

  const [skillRows, behaviorRows] = await Promise.all([
    db.execute(sql`
      SELECT
        SUBSTRING(ds.session_date, 1, 7) AS month,
        ROUND(AVG(pd.percent_correct)::numeric, 1) AS avg_correct,
        COUNT(DISTINCT pt.id) AS active_programs,
        COUNT(DISTINCT ds.student_id) AS students
      FROM program_data pd
      JOIN data_sessions ds ON ds.id = pd.data_session_id
      JOIN program_targets pt ON pt.id = pd.program_target_id
      JOIN students s ON s.id = ds.student_id
      WHERE pd.percent_correct IS NOT NULL
        AND ds.session_date >= ${startDate}
        AND pt.program_type = 'discrete_trial'
        ${schoolFilter}
        ${caseloadFilter}
      GROUP BY month
      ORDER BY month
    `),
    db.execute(sql`
      SELECT
        SUBSTRING(ds.session_date, 1, 7) AS month,
        ROUND(AVG(bd.value)::numeric, 2) AS avg_value,
        COUNT(DISTINCT bd.behavior_target_id) AS active_targets,
        COUNT(DISTINCT ds.student_id) AS students
      FROM behavior_data bd
      JOIN data_sessions ds ON ds.id = bd.data_session_id
      JOIN students s ON s.id = ds.student_id
      WHERE ds.session_date >= ${startDate}
        ${schoolFilter}
        ${caseloadFilter}
      GROUP BY month
      ORDER BY month
    `),
  ]);

  res.json({
    skillAcquisition: skillRows.rows,
    behaviorReduction: behaviorRows.rows,
  });
});

router.get("/dashboard/goal-mastery-rate", async (req, res): Promise<void> => {
  const sdFilters = parseSchoolDistrictFilters(req, req.query);
  const authed = req as AuthedRequest;
  const callerRole = authed.trellisRole;

  // Server-enforced caseload scoping: providers/case-managers see only their
  // own students regardless of any query params. Admins/coordinators always
  // get the district-wide view; the staffId query param is ignored entirely.
  const enforcedStaffId: number | null = CASELOAD_ROLES_SERVER.has(callerRole)
    ? (authed.tenantStaffId ?? null)
    : null;

  const schoolFilter = sdFilters.schoolId
    ? sql`AND g.student_id IN (SELECT id FROM students WHERE school_id = ${sdFilters.schoolId})`
    : sdFilters.districtId
      ? sql`AND g.student_id IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId}))`
      : sql``;
  const staffFilter = enforcedStaffId !== null
    ? sql`AND g.student_id IN (SELECT student_id FROM staff_assignments WHERE staff_id = ${enforcedStaffId})`
    : sql``;

  // Goal mastery rate is computed PER GOAL relative to where that goal's
  // student is in their IEP year, not as a flat "is the latest rating
  // mastered/sufficient" bucket. Logic:
  //
  //   progress_fraction (0..1) = numeric mapping of latest progress rating
  //   time_fraction (0..1)     = (today - iep_start) / (iep_end - iep_start)
  //                              clamped to [0,1], joined via iep_documents
  //
  //   on_pace = TRUE when rating is "mastered", OR
  //             progress_fraction >= time_fraction, OR
  //             time_fraction is NULL and rating is "sufficient/mastered"
  //
  // Example (user spec): a goal at 50% progress whose student is only 25%
  // through the IEP year is "ahead of schedule" → counts as on pace.
  //
  // Rating mapping handles both canonical machine codes and the human-readable
  // variants emitted by older progress-report seeds.
  const [result, breakdownResult] = await Promise.all([
    db.execute(sql`
      WITH latest_ratings AS (
        SELECT DISTINCT ON ((entry->>'iepGoalId')::int)
          (entry->>'iepGoalId')::int AS goal_id,
          entry->>'progressRating'   AS rating
        FROM progress_reports pr,
             LATERAL jsonb_array_elements(pr.goal_progress) AS entry
        WHERE jsonb_array_length(pr.goal_progress) > 0
        ORDER BY (entry->>'iepGoalId')::int, pr.period_end DESC, pr.created_at DESC
      ),
      goal_pace AS (
        SELECT
          g.id              AS goal_id,
          g.service_area    AS service_area,
          lr.rating         AS rating,
          CASE lr.rating
            WHEN 'mastered'                            THEN 1.00
            WHEN 'Mastered / Goal met'                 THEN 1.00
            WHEN 'sufficient_progress'                 THEN 0.75
            WHEN 'Sufficient progress to achieve goal' THEN 0.75
            WHEN 'some_progress'                       THEN 0.50
            WHEN 'Progressing toward goal'             THEN 0.50
            WHEN 'minimal_progress'                    THEN 0.20
            WHEN 'insufficient_progress'               THEN 0.10
            WHEN 'Insufficient progress at this time'  THEN 0.10
            ELSE 0.00
          END               AS progress_fraction,
          CASE
            WHEN d.iep_start_date IS NULL OR d.iep_end_date IS NULL THEN NULL
            WHEN d.iep_end_date::date <= d.iep_start_date::date THEN NULL
            ELSE LEAST(1.0, GREATEST(0.0,
              (CURRENT_DATE - d.iep_start_date::date)::numeric
              / NULLIF((d.iep_end_date::date - d.iep_start_date::date), 0)::numeric
            ))
          END               AS time_fraction
        FROM iep_goals g
        LEFT JOIN latest_ratings lr ON lr.goal_id = g.id
        LEFT JOIN iep_documents d   ON d.id = g.iep_document_id
        WHERE g.active = true
          ${schoolFilter}
          ${staffFilter}
      )
      SELECT
        COUNT(*)                                                              AS total_goals,
        COUNT(rating)                                                         AS rated_goals,
        COUNT(*) FILTER (
          WHERE rating IN ('mastered', 'Mastered / Goal met')
             OR (time_fraction IS NULL
                 AND rating IN ('sufficient_progress',
                                'Sufficient progress to achieve goal'))
             OR (time_fraction IS NOT NULL
                 AND progress_fraction >= time_fraction)
        )                                                                     AS on_track_goals
      FROM goal_pace
    `),
    db.execute(sql`
      WITH latest_ratings AS (
        SELECT DISTINCT ON ((entry->>'iepGoalId')::int)
          (entry->>'iepGoalId')::int AS goal_id,
          entry->>'progressRating'   AS rating
        FROM progress_reports pr,
             LATERAL jsonb_array_elements(pr.goal_progress) AS entry
        WHERE jsonb_array_length(pr.goal_progress) > 0
        ORDER BY (entry->>'iepGoalId')::int, pr.period_end DESC, pr.created_at DESC
      ),
      goal_pace AS (
        SELECT
          g.id              AS goal_id,
          COALESCE(NULLIF(TRIM(g.service_area), ''), 'Unspecified') AS service_area,
          lr.rating         AS rating,
          CASE lr.rating
            WHEN 'mastered'                            THEN 1.00
            WHEN 'Mastered / Goal met'                 THEN 1.00
            WHEN 'sufficient_progress'                 THEN 0.75
            WHEN 'Sufficient progress to achieve goal' THEN 0.75
            WHEN 'some_progress'                       THEN 0.50
            WHEN 'Progressing toward goal'             THEN 0.50
            WHEN 'minimal_progress'                    THEN 0.20
            WHEN 'insufficient_progress'               THEN 0.10
            WHEN 'Insufficient progress at this time'  THEN 0.10
            ELSE 0.00
          END               AS progress_fraction,
          CASE
            WHEN d.iep_start_date IS NULL OR d.iep_end_date IS NULL THEN NULL
            WHEN d.iep_end_date::date <= d.iep_start_date::date THEN NULL
            ELSE LEAST(1.0, GREATEST(0.0,
              (CURRENT_DATE - d.iep_start_date::date)::numeric
              / NULLIF((d.iep_end_date::date - d.iep_start_date::date), 0)::numeric
            ))
          END               AS time_fraction
        FROM iep_goals g
        LEFT JOIN latest_ratings lr ON lr.goal_id = g.id
        LEFT JOIN iep_documents d   ON d.id = g.iep_document_id
        WHERE g.active = true
          ${schoolFilter}
          ${staffFilter}
      )
      SELECT
        service_area,
        COUNT(*)                                                              AS total_goals,
        COUNT(rating)                                                         AS rated_goals,
        COUNT(*) FILTER (
          WHERE rating IN ('mastered', 'Mastered / Goal met')
             OR (time_fraction IS NULL
                 AND rating IN ('sufficient_progress',
                                'Sufficient progress to achieve goal'))
             OR (time_fraction IS NOT NULL
                 AND progress_fraction >= time_fraction)
        )                                                                     AS on_track_goals
      FROM goal_pace
      GROUP BY service_area
      ORDER BY service_area
    `),
  ]);

  const row = result.rows[0] as Record<string, unknown>;
  const totalGoals = Number(row?.total_goals ?? 0);
  const ratedGoals = Number(row?.rated_goals ?? 0);
  const onTrackGoals = Number(row?.on_track_goals ?? 0);
  // Denominator is ALL active goals (unrated goals are implicitly not on-track).
  // Null only when there are no active goals at all.
  const masteryRate = totalGoals > 0 ? Math.round((onTrackGoals / totalGoals) * 100) : null;

  const byServiceArea = (breakdownResult.rows as Record<string, unknown>[]).map(r => {
    const total = Number(r.total_goals ?? 0);
    const onTrack = Number(r.on_track_goals ?? 0);
    return {
      serviceArea: String(r.service_area ?? "Unspecified"),
      totalGoals: total,
      ratedGoals: Number(r.rated_goals ?? 0),
      onTrackGoals: onTrack,
      masteryRate: total > 0 ? Math.round((onTrack / total) * 100) : null,
    };
  });

  res.json({
    totalActiveGoals: totalGoals,
    ratedGoals,
    onTrackOrMasteredGoals: onTrackGoals,
    masteryRate,
    byServiceArea,
  });
});

router.get("/dashboard/para-summary", async (req, res): Promise<void> => {
  const sdFilters = parseSchoolDistrictFilters(req, req.query);
  // Caseload clamp: caseload roles see only their own row (which yields []
  // for non-paras like providers/case_managers — the typical case).
  const enforcedStaffId = getEnforcedCaseloadStaffId(req);
  const paraConditions: any[] = [eq(staffTable.status, "active"), eq(staffTable.role, "para")];
  if (sdFilters.schoolId) paraConditions.push(eq(staffTable.schoolId, sdFilters.schoolId));
  if (sdFilters.districtId) paraConditions.push(sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId})`);
  if (enforcedStaffId !== null) paraConditions.push(eq(staffTable.id, enforcedStaffId));

  const [paras, blockCounts, assignmentCounts] = await Promise.all([
    db.select().from(staffTable).where(and(...paraConditions)),
    db.select({
      staffId: scheduleBlocksTable.staffId,
      count: count(),
    }).from(scheduleBlocksTable)
      .where(eq(scheduleBlocksTable.isRecurring, true))
      .groupBy(scheduleBlocksTable.staffId),
    db.select({
      staffId: staffAssignmentsTable.staffId,
      count: count(),
    }).from(staffAssignmentsTable)
      .groupBy(staffAssignmentsTable.staffId),
  ]);

  const blockMap = new Map<number, number>();
  for (const b of blockCounts) blockMap.set(b.staffId, b.count);

  const assignMap = new Map<number, number>();
  for (const a of assignmentCounts) assignMap.set(a.staffId, a.count);

  const result = paras.map((p) => ({
    staffId: p.id,
    staffName: `${p.firstName} ${p.lastName}`,
    assignedBlocks: blockMap.get(p.id) ?? 0,
    coverageGaps: 0,
    conflictsToday: 0,
    assignedStudents: assignMap.get(p.id) ?? 0,
  }));

  res.json(result);
});

export default router;
