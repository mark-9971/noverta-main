import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { schoolYearsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
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

    const overallComplianceRate =
      totalRequired > 0 ? Math.round((totalDelivered / totalRequired) * 1000) / 10 : 100;

    // Match canonical compliance-risk-report bucket definitions exactly:
    //   out_of_compliance  → studentsOutOfCompliance
    //   at_risk            → studentsAtRisk
    //   on_track/completed → studentsOnTrack
    //   slightly_behind    → not counted in any displayed bucket (same as main report)
    let studentsOutOfCompliance = 0;
    let studentsAtRisk = 0;
    let studentsOnTrack = 0;
    for (const status of studentWorstStatus.values()) {
      if (status === "out_of_compliance") studentsOutOfCompliance++;
      else if (status === "at_risk") studentsAtRisk++;
      else if (status === "on_track" || status === "completed") studentsOnTrack++;
    }

    res.json({
      available: true,
      priorWeekEndDate: effectiveEndDate,
      overallComplianceRate,
      studentsOutOfCompliance,
      studentsAtRisk,
      studentsOnTrack,
    });
  } catch (e: any) {
    console.error("GET /reports/compliance-week-trend error:", e);
    res.status(500).json({ error: "Failed to compute compliance week trend" });
  }
});

export default router;
