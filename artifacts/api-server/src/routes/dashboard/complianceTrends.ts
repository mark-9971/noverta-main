import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, schoolsTable, sessionLogsTable,
  serviceRequirementsTable, compensatoryObligationsTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, sql, inArray, isNull } from "drizzle-orm";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";

const router: IRouter = Router();

/**
 * GET /api/dashboard/compliance-trends?months=12
 *
 * Single combined endpoint that returns four monthly time-series for the
 * compliance trend page:
 *
 *  1. serviceMinutes      — required vs delivered minutes per month
 *                           (interval-normalized to monthly), plus a
 *                           per-month student-level compliance percentage.
 *  2. atRiskStudents      — count of active students whose monthly delivered
 *                           minutes were < 70% of monthly required minutes.
 *                           Computed per-month from raw sessions; NOT a
 *                           stored snapshot (see "Limitations" below).
 *  3. compensatoryExposure — accrued vs delivered comp minutes by month, plus
 *                           cumulative open obligation (running balance).
 *  4. loggingCompletion   — % of completed sessions that were logged within
 *                           48h of the session date (the documented pilot
 *                           timeliness KPI).
 *
 * All series share the same `months` axis (oldest → newest, inclusive).
 *
 * Sparseness handling: months with zero requirements / zero sessions return
 * `null` instead of a misleading 100% or 0%, so the chart can render a gap.
 *
 * Limitations (also surfaced in the response under `notes`):
 *  - At-risk and compliance % are recomputed today from current
 *    requirements + historical sessions. If a requirement's `requiredMinutes`
 *    was edited, historical compliance shifts retroactively. We don't yet
 *    snapshot requirements over time.
 *  - Comp accrual month uses `compensatory_obligations.created_at`, which
 *    captures when the obligation was *recorded*, not necessarily when the
 *    underlying missed service occurred.
 *  - Soft-deleted sessions (`deleted_at IS NOT NULL`) are excluded from all
 *    series so deletes don't leave phantom credit.
 */
router.get("/dashboard/compliance-trends", async (req, res): Promise<void> => {
  const monthsRaw = parseInt(String(req.query.months ?? "12"), 10);
  const months = Math.max(3, Math.min(Number.isFinite(monthsRaw) ? monthsRaw : 12, 24));

  const enforcedDistrictId = getEnforcedDistrictId(req as unknown as AuthedRequest);

  // ---- 1. Resolve student pool (district-scoped, currently active) ----
  const studentConditions: any[] = [eq(studentsTable.status, "active")];
  if (enforcedDistrictId !== null) {
    studentConditions.push(
      sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${enforcedDistrictId})`
    );
  }

  const activeStudents = await db.select({ id: studentsTable.id })
    .from(studentsTable)
    .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
    .where(and(...studentConditions));

  const studentIds = activeStudents.map(s => s.id);

  // ---- Build the month axis (oldest → newest) ----
  // All month math is done in UTC via string manipulation to keep boundaries
  // consistent with how Postgres `timestamptz` values are returned (UTC ISO).
  // Mixing local-time Date construction with `toISOString()` was causing
  // off-by-one-day cutoffs in non-UTC deployments.
  const now = new Date();
  const curY = now.getUTCFullYear();
  const curM = now.getUTCMonth(); // 0-indexed
  const axis: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const ym = curM - i;
    const y = curY + Math.floor(ym / 12);
    const m = ((ym % 12) + 12) % 12;
    axis.push(`${y}-${String(m + 1).padStart(2, "0")}`);
  }
  const startStr = `${axis[0]}-01`;
  // Last day of the current UTC month.
  const lastDayOfMonth = new Date(Date.UTC(curY, curM + 1, 0)).getUTCDate();
  const endStr = `${axis[axis.length - 1]}-${String(lastDayOfMonth).padStart(2, "0")}`;

  // Empty-pool short circuit. Honest empty payload, axis still populated so the
  // UI can render the date range.
  if (studentIds.length === 0) {
    res.json(emptyPayload(axis, "no_active_students"));
    return;
  }

  // ---- Pull base data in parallel ----
  // Requirements: pull effective period (`startDate`/`endDate`) so we can
  // recompute *which* requirements were active in *each* historical month
  // rather than projecting today's active set backward.
  // Sessions: pull the full set including pre-window comp deliveries so
  // cumulative-owed seeding is accurate.
  const [requirements, sessions, obligations] = await Promise.all([
    db.select({
      studentId: serviceRequirementsTable.studentId,
      requiredMinutes: serviceRequirementsTable.requiredMinutes,
      intervalType: serviceRequirementsTable.intervalType,
      startDate: serviceRequirementsTable.startDate,
      endDate: serviceRequirementsTable.endDate,
    }).from(serviceRequirementsTable).where(and(
      inArray(serviceRequirementsTable.studentId, studentIds),
    )),
    db.select({
      studentId: sessionLogsTable.studentId,
      sessionDate: sessionLogsTable.sessionDate,
      durationMinutes: sessionLogsTable.durationMinutes,
      status: sessionLogsTable.status,
      isCompensatory: sessionLogsTable.isCompensatory,
      createdAt: sessionLogsTable.createdAt,
    }).from(sessionLogsTable).where(and(
      inArray(sessionLogsTable.studentId, studentIds),
      lte(sessionLogsTable.sessionDate, endStr),
      isNull(sessionLogsTable.deletedAt),
    )),
    db.select({
      studentId: compensatoryObligationsTable.studentId,
      minutesOwed: compensatoryObligationsTable.minutesOwed,
      createdAt: compensatoryObligationsTable.createdAt,
    }).from(compensatoryObligationsTable).where(and(
      inArray(compensatoryObligationsTable.studentId, studentIds),
    )),
  ]);

  // ---- Required minutes per student, normalized to MONTHLY ----
  // weekly  → ×4    (a 4-week month is the standard SPED scheduling unit)
  // monthly → ×1
  // quarterly → ÷3
  function toMonthly(min: number, interval: string): number {
    if (interval === "weekly") return min * 4;
    if (interval === "quarterly") return Math.round(min / 3);
    return min; // monthly or unknown — treat as already-monthly
  }
  // For each axis month, compute per-student required minutes from
  // requirements whose effective window (`startDate` … `endDate`) intersects
  // that month. This avoids projecting today's active set backward.
  // We intersect on YYYY-MM string boundaries since requirement startDate /
  // endDate are stored as plain dates.
  function reqMonthlyForMonth(month: string): Map<number, number> {
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-31`; // inclusive upper bound for string compare
    const out = new Map<number, number>();
    for (const r of requirements) {
      if (r.startDate > monthEnd) continue;
      if (r.endDate && r.endDate < monthStart) continue;
      const m = toMonthly(r.requiredMinutes, r.intervalType);
      if (m <= 0) continue;
      out.set(r.studentId, (out.get(r.studentId) ?? 0) + m);
    }
    return out;
  }
  const reqByMonth = new Map<string, Map<number, number>>();
  for (const m of axis) reqByMonth.set(m, reqMonthlyForMonth(m));

  // Tracked-this-month = students with any active requirement that month.
  // Tracked-overall = students who appear in *any* month of the window
  // (used for the header "students tracked" count).
  const trackedAny = new Set<number>();
  for (const map of reqByMonth.values()) for (const sid of map.keys()) trackedAny.add(sid);

  // ---- 1 + 2: per-month delivered minutes by student ----
  // We deliberately count completed + makeup sessions. Missed/cancelled/pending
  // do not count toward delivery. Sessions outside the axis window are still
  // returned by the query (we need pre-window comp for cumulative seeding) but
  // are bucketed by month and only contribute to in-window months here.
  type MonthBucket = Map<number, number>; // studentId → minutes delivered
  const deliveredByMonth = new Map<string, MonthBucket>();
  for (const s of sessions) {
    if (s.status !== "completed" && s.status !== "makeup") continue;
    const month = s.sessionDate.slice(0, 7);
    if (!deliveredByMonth.has(month)) deliveredByMonth.set(month, new Map());
    const bucket = deliveredByMonth.get(month)!;
    bucket.set(s.studentId, (bucket.get(s.studentId) ?? 0) + s.durationMinutes);
  }

  const RISK_THRESHOLD = 0.70; // <70% delivered → at risk

  const serviceMinutes = axis.map(month => {
    const bucket = deliveredByMonth.get(month);
    const reqMap = reqByMonth.get(month)!;
    const required = [...reqMap.values()].reduce((a, b) => a + b, 0);
    // Delivered restricted to students who were tracked this month, so the
    // ratio compares like-with-like.
    let delivered = 0;
    if (bucket) {
      for (const sid of reqMap.keys()) delivered += bucket.get(sid) ?? 0;
    }
    if (required === 0) {
      // No requirements active this month → can't compute a meaningful %.
      return { month, requiredMinutes: 0, deliveredMinutes: 0, compliancePercent: null };
    }
    return {
      month,
      requiredMinutes: required,
      deliveredMinutes: delivered,
      compliancePercent: Math.round((delivered / required) * 100),
    };
  });

  const atRiskStudents = axis.map(month => {
    const reqMap = reqByMonth.get(month)!;
    if (reqMap.size === 0) {
      return { month, atRiskCount: null, totalTracked: 0 };
    }
    const bucket = deliveredByMonth.get(month);
    let atRisk = 0;
    for (const [sid, required] of reqMap) {
      const delivered = bucket?.get(sid) ?? 0;
      if (delivered < required * RISK_THRESHOLD) atRisk++;
    }
    return { month, atRiskCount: atRisk, totalTracked: reqMap.size };
  });

  // ---- 3. Compensatory exposure ----
  // Accrued in month M = sum(minutesOwed) where created_at falls in M.
  // Delivered in month M = sum(durationMinutes) of comp sessions in M
  // (status completed/makeup, isCompensatory=true).
  // Cumulative owed = running (accrued − delivered), but seeded with the
  // pre-window balance so the chart starts honest, not at zero.
  const accruedByMonth = new Map<string, number>();
  let preWindowAccrued = 0;
  for (const o of obligations) {
    const m = o.createdAt.toISOString().slice(0, 7);
    if (m < axis[0]) {
      preWindowAccrued += o.minutesOwed;
    } else if (m <= axis[axis.length - 1]) {
      accruedByMonth.set(m, (accruedByMonth.get(m) ?? 0) + o.minutesOwed);
    }
  }
  const compDeliveredByMonth = new Map<string, number>();
  let preWindowDelivered = 0;
  for (const s of sessions) {
    if (!s.isCompensatory) continue;
    if (s.status !== "completed" && s.status !== "makeup") continue;
    const m = s.sessionDate.slice(0, 7);
    if (m < axis[0]) preWindowDelivered += s.durationMinutes;
    else if (m <= axis[axis.length - 1]) {
      compDeliveredByMonth.set(m, (compDeliveredByMonth.get(m) ?? 0) + s.durationMinutes);
    }
  }
  // Pre-window comp deliveries are now included in the sessions query (no
  // session_date >= startStr filter), so this correctly reflects historical
  // burndown that happened before the chart window began.
  let cumulative = preWindowAccrued - preWindowDelivered;
  const compensatoryExposure = axis.map(month => {
    const accrued = accruedByMonth.get(month) ?? 0;
    const delivered = compDeliveredByMonth.get(month) ?? 0;
    cumulative += accrued - delivered;
    return {
      month,
      accruedMinutes: accrued,
      deliveredMinutes: delivered,
      cumulativeOwedMinutes: Math.max(0, cumulative), // can't owe negative time
    };
  });

  // ---- 4. Provider logging completion (timeliness within 48h) ----
  // For each month M (by sessionDate), of completed/missed/makeup sessions,
  // how many had created_at within 48h of session midnight? This is the
  // documented pilot KPI. Pending/cancelled don't count toward the
  // denominator (they aren't a "completed log").
  const HOURS_48 = 48 * 60 * 60 * 1000;
  const loggingByMonth = new Map<string, { total: number; timely: number }>();
  for (const s of sessions) {
    if (s.status !== "completed" && s.status !== "missed" && s.status !== "makeup") continue;
    const month = s.sessionDate.slice(0, 7);
    if (!loggingByMonth.has(month)) loggingByMonth.set(month, { total: 0, timely: 0 });
    const bucket = loggingByMonth.get(month)!;
    bucket.total++;
    // Compare createdAt to end-of-session-day so a same-day log is always timely.
    const sessionDayEnd = new Date(`${s.sessionDate}T23:59:59Z`).getTime();
    const createdMs = s.createdAt.getTime();
    if (createdMs - sessionDayEnd <= HOURS_48) bucket.timely++;
  }
  const loggingCompletion = axis.map(month => {
    const b = loggingByMonth.get(month);
    if (!b || b.total === 0) {
      return { month, totalSessions: 0, timelySessions: 0, timelinessPercent: null };
    }
    return {
      month,
      totalSessions: b.total,
      timelySessions: b.timely,
      timelinessPercent: Math.round((b.timely / b.total) * 100),
    };
  });

  // ---- Data quality / sparseness assessment ----
  const monthsWithAnyData = axis.filter(m => {
    const sm = serviceMinutes.find(x => x.month === m)!;
    return sm.deliveredMinutes > 0 || (loggingByMonth.get(m)?.total ?? 0) > 0;
  }).length;

  const dataQuality =
    monthsWithAnyData === 0 ? "empty" :
    monthsWithAnyData < Math.ceil(months / 3) ? "sparse" :
    "ok";

  res.json({
    months: axis,
    studentsTracked: trackedAny.size,
    activeStudents: studentIds.length,
    serviceMinutes,
    atRiskStudents,
    compensatoryExposure,
    loggingCompletion,
    dataQuality,
    notes: {
      riskThreshold: RISK_THRESHOLD,
      timelinessWindowHours: 48,
      monthlyNormalization: { weekly: 4, monthly: 1, quarterly: 1 / 3 },
      excludesSoftDeleted: true,
      retroactiveCaveat: "Compliance % and at-risk counts are recomputed from current service requirements; if a requirement was edited, historical numbers will shift.",
    },
    generatedAt: new Date().toISOString(),
  });
});

function emptyPayload(axis: string[], reason: string) {
  return {
    months: axis,
    studentsTracked: 0,
    activeStudents: 0,
    serviceMinutes: axis.map(month => ({ month, requiredMinutes: 0, deliveredMinutes: 0, compliancePercent: null })),
    atRiskStudents: axis.map(month => ({ month, atRiskCount: null, totalTracked: 0 })),
    compensatoryExposure: axis.map(month => ({ month, accruedMinutes: 0, deliveredMinutes: 0, cumulativeOwedMinutes: 0 })),
    loggingCompletion: axis.map(month => ({ month, totalSessions: 0, timelySessions: 0, timelinessPercent: null })),
    dataQuality: "empty",
    notes: { reason },
    generatedAt: new Date().toISOString(),
  };
}

export default router;
