import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, schoolsTable, sessionLogsTable,
  serviceRequirementsTable, compensatoryObligationsTable,
} from "@workspace/db/schema";
import { eq, and, lte, sql, inArray, isNull } from "drizzle-orm";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";

const router: IRouter = Router();

/**
 * GET /api/dashboard/compliance-trends?granularity=month|week&months=12&weeks=26
 *
 * Single combined endpoint that returns four time-series for the compliance
 * trend page, bucketed by either calendar month (default) or ISO week
 * (Monday-start). All series share the same `periods` axis (oldest → newest).
 *
 * Series:
 *  1. serviceMinutes      — required vs delivered minutes per period
 *                           (interval-normalized to the chosen bucket size),
 *                           plus per-period compliance % (delivered / required).
 *  2. atRiskStudents      — count of students with delivered < 70% of required
 *                           in that period.
 *  3. compensatoryExposure — accrued vs delivered comp minutes per period plus
 *                           cumulative open obligation (running balance, seeded
 *                           with pre-window net so the chart starts honest).
 *  4. loggingCompletion   — % of completed/missed/makeup sessions logged within
 *                           48h of the session date.
 *
 * Sparseness: periods with zero requirements / zero sessions return `null` for
 * the percentage fields so the chart can render a gap rather than a fake 0/100.
 *
 * Caps: month windows up to 60 (5 yrs), week windows up to 156 (3 yrs). The
 * cap is enforced server-side so a malformed query can't blow up the bucket
 * arithmetic or the underlying queries.
 */
router.get("/dashboard/compliance-trends", async (req, res): Promise<void> => {
  const granularity = req.query.granularity === "week" ? "week" : "month";

  // Window size. Both `months` (back-compat) and `weeks` are accepted; the one
  // that matches the granularity wins, the other is ignored.
  let periodCount: number;
  if (granularity === "week") {
    const weeksRaw = parseInt(String(req.query.weeks ?? req.query.months ?? "26"), 10);
    periodCount = Math.max(4, Math.min(Number.isFinite(weeksRaw) ? weeksRaw : 26, 156));
  } else {
    const monthsRaw = parseInt(String(req.query.months ?? "12"), 10);
    periodCount = Math.max(3, Math.min(Number.isFinite(monthsRaw) ? monthsRaw : 12, 60));
  }

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

  // ---- Build the period axis (oldest → newest) ----
  // Each axis entry is a label key the rest of the code groups by:
  //   month  → "YYYY-MM"
  //   week   → "YYYY-MM-DD" (ISO Monday of that week, in UTC)
  // All math runs in UTC because session dates are stored as plain YYYY-MM-DD
  // strings; mixing local-time Date construction with toISOString() caused
  // off-by-one cutoffs in non-UTC deployments.
  const now = new Date();
  const axis: string[] = [];
  let startStr: string;
  let endStr: string;

  if (granularity === "month") {
    const curY = now.getUTCFullYear();
    const curM = now.getUTCMonth();
    for (let i = periodCount - 1; i >= 0; i--) {
      const ym = curM - i;
      const y = curY + Math.floor(ym / 12);
      const m = ((ym % 12) + 12) % 12;
      axis.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    }
    startStr = `${axis[0]}-01`;
    const last = axis[axis.length - 1];
    const [ly, lm] = last.split("-").map(Number);
    const lastDay = new Date(Date.UTC(ly, lm, 0)).getUTCDate();
    endStr = `${last}-${String(lastDay).padStart(2, "0")}`;
  } else {
    // ISO week: Monday is the first day. Walk back periodCount-1 weeks from
    // the Monday of the current week.
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dow = todayUtc.getUTCDay(); // 0=Sun..6=Sat
    const daysSinceMonday = (dow + 6) % 7; // Mon→0, Sun→6
    const thisMonday = new Date(todayUtc);
    thisMonday.setUTCDate(todayUtc.getUTCDate() - daysSinceMonday);
    for (let i = periodCount - 1; i >= 0; i--) {
      const d = new Date(thisMonday);
      d.setUTCDate(thisMonday.getUTCDate() - i * 7);
      axis.push(d.toISOString().slice(0, 10));
    }
    startStr = axis[0];
    const lastSunday = new Date(thisMonday);
    lastSunday.setUTCDate(thisMonday.getUTCDate() + 6);
    endStr = lastSunday.toISOString().slice(0, 10);
  }

  // Empty-pool short circuit. Honest empty payload, axis still populated so the
  // UI can render the date range.
  if (studentIds.length === 0) {
    res.json(emptyPayload(axis, granularity, "no_active_students"));
    return;
  }

  // ---- Pull base data in parallel ----
  // Requirements: pull effective period (`startDate`/`endDate`) so we can
  // recompute *which* requirements were active in *each* historical period.
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

  // ---- Required minutes per student, normalized to the bucket size ----
  // monthly bucket: weekly ×4, monthly ×1, quarterly ÷3
  // weekly bucket:  weekly ×1, monthly ÷4, quarterly ÷13
  function toBucket(min: number, interval: string): number {
    if (granularity === "week") {
      if (interval === "weekly") return min;
      if (interval === "monthly") return Math.round(min / 4);
      if (interval === "quarterly") return Math.round(min / 13);
      return min;
    }
    if (interval === "weekly") return min * 4;
    if (interval === "quarterly") return Math.round(min / 3);
    return min;
  }

  // For a given axis period, return [periodStartStr, periodEndStr] inclusive
  // YYYY-MM-DD bounds suitable for string comparison against session_date.
  function periodBounds(period: string): [string, string] {
    if (granularity === "month") {
      const [y, m] = period.split("-").map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return [`${period}-01`, `${period}-${String(lastDay).padStart(2, "0")}`];
    }
    const monday = new Date(`${period}T00:00:00Z`);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return [period, sunday.toISOString().slice(0, 10)];
  }

  // For each axis period, compute per-student required minutes from
  // requirements whose effective window overlaps that period.
  function reqForPeriod(period: string): Map<number, number> {
    const [pStart, pEnd] = periodBounds(period);
    const out = new Map<number, number>();
    for (const r of requirements) {
      if (r.startDate > pEnd) continue;
      if (r.endDate && r.endDate < pStart) continue;
      const m = toBucket(r.requiredMinutes, r.intervalType);
      if (m <= 0) continue;
      out.set(r.studentId, (out.get(r.studentId) ?? 0) + m);
    }
    return out;
  }

  // Bucket helper: which axis period does a given YYYY-MM-DD session fall into?
  // Returns null if the session is outside the window. For week mode we walk
  // back to that date's Monday; for month mode we slice the YYYY-MM prefix.
  function periodForDate(dateStr: string): string | null {
    if (granularity === "month") {
      const ym = dateStr.slice(0, 7);
      return axis.includes(ym) ? ym : null;
    }
    const d = new Date(`${dateStr}T00:00:00Z`);
    const dow = d.getUTCDay();
    const daysSinceMonday = (dow + 6) % 7;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - daysSinceMonday);
    const key = monday.toISOString().slice(0, 10);
    return axis.includes(key) ? key : null;
  }

  const reqByPeriod = new Map<string, Map<number, number>>();
  for (const p of axis) reqByPeriod.set(p, reqForPeriod(p));

  // Tracked-overall = students who appear in *any* period of the window
  // (used for the header "students tracked" count).
  const trackedAny = new Set<number>();
  for (const map of reqByPeriod.values()) for (const sid of map.keys()) trackedAny.add(sid);

  // ---- Per-period delivered minutes by student ----
  // We deliberately count completed + makeup sessions. Missed/cancelled/pending
  // do not count toward delivery.
  type PeriodBucket = Map<number, number>; // studentId → minutes delivered
  const deliveredByPeriod = new Map<string, PeriodBucket>();
  for (const s of sessions) {
    if (s.status !== "completed" && s.status !== "makeup") continue;
    const period = periodForDate(s.sessionDate);
    if (period == null) continue;
    if (!deliveredByPeriod.has(period)) deliveredByPeriod.set(period, new Map());
    const bucket = deliveredByPeriod.get(period)!;
    bucket.set(s.studentId, (bucket.get(s.studentId) ?? 0) + s.durationMinutes);
  }

  const RISK_THRESHOLD = 0.70;

  const serviceMinutes = axis.map(period => {
    const bucket = deliveredByPeriod.get(period);
    const reqMap = reqByPeriod.get(period)!;
    const required = [...reqMap.values()].reduce((a, b) => a + b, 0);
    let delivered = 0;
    if (bucket) {
      // Restrict to students who were tracked this period so the ratio
      // compares like-with-like (don't credit delivery to a student who
      // had no active requirement that period).
      for (const sid of reqMap.keys()) delivered += bucket.get(sid) ?? 0;
    }
    if (required === 0) {
      return { period, requiredMinutes: 0, deliveredMinutes: 0, compliancePercent: null };
    }
    return {
      period,
      requiredMinutes: required,
      deliveredMinutes: delivered,
      compliancePercent: Math.round((delivered / required) * 1000) / 10,
    };
  });

  const atRiskStudents = axis.map(period => {
    const reqMap = reqByPeriod.get(period)!;
    if (reqMap.size === 0) {
      return { period, atRiskCount: null, totalTracked: 0 };
    }
    const bucket = deliveredByPeriod.get(period);
    let atRisk = 0;
    for (const [sid, required] of reqMap) {
      const delivered = bucket?.get(sid) ?? 0;
      if (delivered < required * RISK_THRESHOLD) atRisk++;
    }
    return { period, atRiskCount: atRisk, totalTracked: reqMap.size };
  });

  // ---- Compensatory exposure ----
  function periodForDateUnclamped(dateStr: string): string {
    // Same bucket logic but without the in-axis clamp; used to detect
    // pre-window obligations/sessions for cumulative seeding.
    if (granularity === "month") return dateStr.slice(0, 7);
    const d = new Date(`${dateStr}T00:00:00Z`);
    const dow = d.getUTCDay();
    const daysSinceMonday = (dow + 6) % 7;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - daysSinceMonday);
    return monday.toISOString().slice(0, 10);
  }
  const accruedByPeriod = new Map<string, number>();
  let preWindowAccrued = 0;
  for (const o of obligations) {
    const p = periodForDateUnclamped(o.createdAt.toISOString().slice(0, 10));
    if (p < axis[0]) preWindowAccrued += o.minutesOwed;
    else if (p <= axis[axis.length - 1]) {
      accruedByPeriod.set(p, (accruedByPeriod.get(p) ?? 0) + o.minutesOwed);
    }
  }
  const compDeliveredByPeriod = new Map<string, number>();
  let preWindowDelivered = 0;
  for (const s of sessions) {
    if (!s.isCompensatory) continue;
    if (s.status !== "completed" && s.status !== "makeup") continue;
    const p = periodForDateUnclamped(s.sessionDate);
    if (p < axis[0]) preWindowDelivered += s.durationMinutes;
    else if (p <= axis[axis.length - 1]) {
      compDeliveredByPeriod.set(p, (compDeliveredByPeriod.get(p) ?? 0) + s.durationMinutes);
    }
  }
  let cumulative = preWindowAccrued - preWindowDelivered;
  const compensatoryExposure = axis.map(period => {
    const accrued = accruedByPeriod.get(period) ?? 0;
    const delivered = compDeliveredByPeriod.get(period) ?? 0;
    cumulative += accrued - delivered;
    return {
      period,
      accruedMinutes: accrued,
      deliveredMinutes: delivered,
      cumulativeOwedMinutes: Math.max(0, cumulative),
    };
  });

  // ---- Provider logging completion (timeliness within 48h) ----
  const HOURS_48 = 48 * 60 * 60 * 1000;
  const loggingByPeriod = new Map<string, { total: number; timely: number }>();
  for (const s of sessions) {
    if (s.status !== "completed" && s.status !== "missed" && s.status !== "makeup") continue;
    const period = periodForDate(s.sessionDate);
    if (period == null) continue;
    if (!loggingByPeriod.has(period)) loggingByPeriod.set(period, { total: 0, timely: 0 });
    const bucket = loggingByPeriod.get(period)!;
    bucket.total++;
    const sessionDayEnd = new Date(`${s.sessionDate}T23:59:59Z`).getTime();
    const createdMs = s.createdAt.getTime();
    if (createdMs - sessionDayEnd <= HOURS_48) bucket.timely++;
  }
  const loggingCompletion = axis.map(period => {
    const b = loggingByPeriod.get(period);
    if (!b || b.total === 0) {
      return { period, totalSessions: 0, timelySessions: 0, timelinessPercent: null };
    }
    return {
      period,
      totalSessions: b.total,
      timelySessions: b.timely,
      timelinessPercent: Math.round((b.timely / b.total) * 100),
    };
  });

  // ---- Data quality / sparseness assessment ----
  const periodsWithAnyData = axis.filter(p => {
    const sm = serviceMinutes.find(x => x.period === p)!;
    return sm.deliveredMinutes > 0 || (loggingByPeriod.get(p)?.total ?? 0) > 0;
  }).length;

  const dataQuality =
    periodsWithAnyData === 0 ? "empty" :
    periodsWithAnyData < Math.ceil(periodCount / 3) ? "sparse" :
    "ok";

  res.json({
    granularity,
    periods: axis,
    // Back-compat: legacy callers (leadership-packet, data-visualized)
    // still read `months` + `serviceMinutes[].month`. Mirror the axis under
    // those names when granularity is monthly so nothing breaks.
    ...(granularity === "month" ? {
      months: axis,
      serviceMinutes: serviceMinutes.map(p => ({ ...p, month: p.period })),
      atRiskStudents: atRiskStudents.map(p => ({ ...p, month: p.period })),
      compensatoryExposure: compensatoryExposure.map(p => ({ ...p, month: p.period })),
      loggingCompletion: loggingCompletion.map(p => ({ ...p, month: p.period })),
    } : {
      serviceMinutes,
      atRiskStudents,
      compensatoryExposure,
      loggingCompletion,
    }),
    studentsTracked: trackedAny.size,
    activeStudents: studentIds.length,
    dataQuality,
    notes: {
      riskThreshold: RISK_THRESHOLD,
      timelinessWindowHours: 48,
      bucketNormalization: granularity === "week"
        ? { weekly: 1, monthly: 1 / 4, quarterly: 1 / 13 }
        : { weekly: 4, monthly: 1, quarterly: 1 / 3 },
      excludesSoftDeleted: true,
      retroactiveCaveat: "Compliance % and at-risk counts are recomputed from current service requirements; if a requirement was edited, historical numbers will shift.",
    },
    generatedAt: new Date().toISOString(),
  });
});

function emptyPayload(axis: string[], granularity: "month" | "week", reason: string) {
  const sm = axis.map(period => ({ period, requiredMinutes: 0, deliveredMinutes: 0, compliancePercent: null }));
  const ar = axis.map(period => ({ period, atRiskCount: null, totalTracked: 0 }));
  const ce = axis.map(period => ({ period, accruedMinutes: 0, deliveredMinutes: 0, cumulativeOwedMinutes: 0 }));
  const lc = axis.map(period => ({ period, totalSessions: 0, timelySessions: 0, timelinessPercent: null }));
  return {
    granularity,
    periods: axis,
    ...(granularity === "month" ? {
      months: axis,
      serviceMinutes: sm.map(p => ({ ...p, month: p.period })),
      atRiskStudents: ar.map(p => ({ ...p, month: p.period })),
      compensatoryExposure: ce.map(p => ({ ...p, month: p.period })),
      loggingCompletion: lc.map(p => ({ ...p, month: p.period })),
    } : { serviceMinutes: sm, atRiskStudents: ar, compensatoryExposure: ce, loggingCompletion: lc }),
    studentsTracked: 0,
    activeStudents: 0,
    dataQuality: "empty",
    notes: { reason },
    generatedAt: new Date().toISOString(),
  };
}

export default router;
