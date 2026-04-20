// DEPRECATED(batch-1): the `eq(serviceRequirementsTable.active, true)`
// filter in computeAllActiveMinuteProgress and the inline single-row read
// in computeMinuteProgress both bypass the supersede chain and silently
// lose mid-period transitions. Replace with
// `getActiveRequirements(studentId, intervalRange)` from
// `lib/domain-service-delivery` per the migration plan in
// docs/architecture/active-requirements.md (target: Batch 2).
import { db } from "@workspace/db";
import { sessionLogsTable, serviceRequirementsTable, serviceTypesTable, studentsTable, staffTable, schoolYearsTable, schoolsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, inArray, isNull } from "drizzle-orm";
import {
  getSchoolDayException,
  getSchoolDayExceptionsForRange,
  summarizeSchoolDayWeights,
  type SchoolDayException,
} from "./schoolCalendar";

export type RiskStatus = "on_track" | "slightly_behind" | "at_risk" | "out_of_compliance" | "completed" | "no_data";

// If no minutes have been delivered AND we are at least this far into the
// interval, surface a distinct "no_data" status instead of a cheery "on_track".
// This prevents a freshly-started period from showing green when the provider
// has not yet logged a single session.
const NO_DATA_ELAPSED_THRESHOLD = 0.10;

export function getIntervalDates(
  intervalType: string,
  startDate: string,
  endDate?: string | null,
  referenceDate?: Date
): { intervalStart: Date; intervalEnd: Date } {
  const now = referenceDate ?? new Date();

  if (intervalType === "monthly") {
    const intervalStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const intervalEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    if (endDate) {
      const reqEnd = new Date(endDate);
      return { intervalStart, intervalEnd: reqEnd < intervalEnd ? reqEnd : intervalEnd };
    }
    return { intervalStart, intervalEnd };
  }

  if (intervalType === "weekly") {
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { intervalStart: monday, intervalEnd: sunday };
  }

  if (intervalType === "quarterly") {
    const quarter = Math.floor(now.getMonth() / 3);
    const intervalStart = new Date(now.getFullYear(), quarter * 3, 1);
    const intervalEnd = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59);
    if (endDate) {
      const reqEnd = new Date(endDate);
      return { intervalStart, intervalEnd: reqEnd < intervalEnd ? reqEnd : intervalEnd };
    }
    return { intervalStart, intervalEnd };
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);
  return { intervalStart: today, intervalEnd: todayEnd };
}

export function computeRiskStatus(
  requiredMinutes: number,
  deliveredMinutes: number,
  expectedByNow: number,
  projectedMinutes: number
): RiskStatus {
  if (deliveredMinutes >= requiredMinutes) return "completed";

  // Distinguish "no data yet" from genuine on-track. If zero minutes delivered
  // and the interval has barely started, return "no_data" so dashboards do not
  // claim health that hasn't been demonstrated. Once the interval has elapsed
  // past NO_DATA_ELAPSED_THRESHOLD, the regular at-risk thresholds take over.
  if (deliveredMinutes === 0 && requiredMinutes > 0) {
    const elapsedRatio = requiredMinutes > 0 ? expectedByNow / requiredMinutes : 0;
    if (elapsedRatio < NO_DATA_ELAPSED_THRESHOLD) return "no_data";
  }

  if (projectedMinutes >= requiredMinutes * 0.95) return "on_track";
  if (deliveredMinutes < expectedByNow * 0.7) return "out_of_compliance";
  if (deliveredMinutes < expectedByNow * 0.85) return "at_risk";
  if (deliveredMinutes < expectedByNow * 0.95) return "slightly_behind";
  return "on_track";
}

export type MinuteProgressResult = {
  serviceRequirementId: number;
  studentId: number;
  studentName: string;
  serviceTypeId: number;
  serviceTypeName: string;
  providerId: number | null;
  providerName: string | null;
  intervalType: string;
  requiredMinutes: number;
  deliveredMinutes: number;
  remainingMinutes: number;
  percentComplete: number;
  expectedMinutesByNow: number;
  projectedMinutes: number;
  riskStatus: RiskStatus;
  intervalStart: string;
  intervalEnd: string;
  missedSessionsCount: number;
  makeupSessionsCount: number;
  /**
   * School Calendar v0 — Slice 2. Number of full-closure days for the
   * student's school that fall inside the elapsed slice of the current
   * interval. Surfaces the discount applied to expectedMinutesByNow so
   * the UI can show "2 closures this period" without a second query.
   */
  closureDayCount: number;
  /**
   * Same as `closureDayCount` but for early-release days. Each one
   * counts as 0.5 of a normal day in the denominator (see
   * lib/schoolCalendar.ts EARLY_RELEASE_DAY_WEIGHT) until time-of-day
   * proration ships in a later slice.
   */
  earlyReleaseDayCount: number;
};

export async function computeMinuteProgress(
  serviceRequirementId: number,
  /**
   * Slice 2 cleanup — optional deterministic clock so the single-row
   * path matches `computeAllActiveMinuteProgress({ asOfDate })`. Used
   * by historical reports, debug tooling, and tests that need stable
   * elapsed/expected math instead of `new Date()` at call time.
   */
  asOfDate?: Date,
): Promise<MinuteProgressResult | null> {
  const [req] = await db
    .select({
      id: serviceRequirementsTable.id,
      studentId: serviceRequirementsTable.studentId,
      serviceTypeId: serviceRequirementsTable.serviceTypeId,
      providerId: serviceRequirementsTable.providerId,
      requiredMinutes: serviceRequirementsTable.requiredMinutes,
      intervalType: serviceRequirementsTable.intervalType,
      startDate: serviceRequirementsTable.startDate,
      endDate: serviceRequirementsTable.endDate,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      serviceTypeName: serviceTypesTable.name,
      providerFirstName: staffTable.firstName,
      providerLastName: staffTable.lastName,
      // School Calendar v0 — needed to look up that school's closures /
      // early-release days for the requirement's interval. Nullable
      // because some legacy student rows still lack a school assignment.
      schoolId: studentsTable.schoolId,
      districtId: schoolsTable.districtId,
    })
    .from(serviceRequirementsTable)
    .leftJoin(studentsTable, eq(studentsTable.id, serviceRequirementsTable.studentId))
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
    .leftJoin(staffTable, eq(staffTable.id, serviceRequirementsTable.providerId))
    .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
    .where(eq(serviceRequirementsTable.id, serviceRequirementId));

  if (!req) return null;

  const { intervalStart, intervalEnd } = getIntervalDates(req.intervalType, req.startDate, req.endDate, asOfDate);
  const intervalStartStr = intervalStart.toISOString().substring(0, 10);
  const intervalEndStr = intervalEnd.toISOString().substring(0, 10);

  const sessions = await db
    .select({
      durationMinutes: sessionLogsTable.durationMinutes,
      status: sessionLogsTable.status,
      isMakeup: sessionLogsTable.isMakeup,
    })
    .from(sessionLogsTable)
    .where(
      and(
        eq(sessionLogsTable.studentId, req.studentId),
        eq(sessionLogsTable.serviceRequirementId, serviceRequirementId),
        gte(sessionLogsTable.sessionDate, intervalStartStr),
        lte(sessionLogsTable.sessionDate, intervalEndStr),
        eq(sessionLogsTable.isCompensatory, false),
        isNull(sessionLogsTable.deletedAt)
      )
    );

  // Slice 2: load this school's exceptions inside the requirement window
  // so expectedMinutesByNow honors closures and early-release days. If
  // the student isn't tied to a school, or the school has no district,
  // we leave the map empty and the math degrades to the legacy behavior.
  const exceptions = req.schoolId != null && req.districtId != null
    ? await getSchoolDayExceptionsForRange({
        districtId: req.districtId,
        schoolIds: [req.schoolId],
        startDate: intervalStartStr,
        endDate: intervalEndStr,
      })
    : new Map<string, SchoolDayException>();

  return buildProgressFromSessions(req, sessions, intervalStart, intervalEnd, intervalStartStr, intervalEndStr, asOfDate, {
    schoolId: req.schoolId,
    exceptions,
  });
}

function buildProgressFromSessions(
  req: {
    id: number;
    studentId: number;
    serviceTypeId: number;
    providerId: number | null;
    requiredMinutes: number;
    intervalType: string;
    startDate: string;
    endDate: string | null;
    studentFirstName: string | null;
    studentLastName: string | null;
    serviceTypeName: string | null;
    providerFirstName: string | null;
    providerLastName: string | null;
  },
  sessions: { durationMinutes: number; status: string; isMakeup: boolean }[],
  intervalStart: Date,
  intervalEnd: Date,
  intervalStartStr: string,
  intervalEndStr: string,
  asOfDate?: Date,
  /**
   * Slice 2: optional school-day exception input. When supplied, the
   * elapsed/remaining day fractions are weighted by closures (=0) and
   * early-release days (=0.5 fallback) for the student's school. When
   * omitted (legacy callers / tests), the math falls back to the original
   * pure-calendar-day behavior so nothing else has to change at once.
   */
  schoolCalendarInput?: {
    schoolId: number | null;
    exceptions: Map<string, SchoolDayException>;
  },
): MinuteProgressResult {
  const completedSessions = sessions.filter(s => s.status === "completed" || s.status === "makeup");
  const missedSessions = sessions.filter(s => s.status === "missed");
  const makeupSessions = sessions.filter(s => s.isMakeup);

  const deliveredMinutes = completedSessions.reduce((sum, s) => sum + s.durationMinutes, 0);

  const now = asOfDate ?? new Date();
  const totalCalendarDays = Math.max(1, (intervalEnd.getTime() - intervalStart.getTime()) / (1000 * 60 * 60 * 24));
  const elapsedCalendarDays = Math.max(0, (now.getTime() - intervalStart.getTime()) / (1000 * 60 * 60 * 24));

  // Slice 2 — weight the day count by school-calendar exceptions so a
  // closure pulls expectedByNow toward zero for that day and an early
  // release counts as half a day. If no exception input is supplied, or
  // the school has no exceptions in this window, this collapses to the
  // legacy linear elapsedCalendarDays / totalCalendarDays.
  const haveExceptions =
    schoolCalendarInput != null && schoolCalendarInput.exceptions.size > 0;
  let progressFraction: number;
  let closureDayCount = 0;
  let earlyReleaseDayCount = 0;

  if (haveExceptions) {
    const summary = summarizeSchoolDayWeights({
      schoolId: schoolCalendarInput!.schoolId,
      exceptions: schoolCalendarInput!.exceptions,
      startDate: intervalStart,
      endDate: intervalEnd,
      asOf: now,
    });
    closureDayCount = summary.closureDays;
    earlyReleaseDayCount = summary.earlyReleaseDays;
    if (summary.totalWeight > 0) {
      progressFraction = Math.min(1, summary.elapsedWeight / summary.totalWeight);
    } else {
      // Every day in the interval is a closure: nothing was expected.
      progressFraction = 0;
    }
  } else {
    progressFraction = Math.min(1, elapsedCalendarDays / totalCalendarDays);
  }

  const expectedByNow = req.requiredMinutes * progressFraction;

  const currentPacePerDay = elapsedCalendarDays > 0 ? deliveredMinutes / elapsedCalendarDays : 0;
  const remainingDays = Math.max(0, totalCalendarDays - elapsedCalendarDays);
  const projectedMinutes = deliveredMinutes + (currentPacePerDay * remainingDays);

  const remainingMinutes = Math.max(0, req.requiredMinutes - deliveredMinutes);
  const percentComplete = req.requiredMinutes > 0 ? Math.min(100, (deliveredMinutes / req.requiredMinutes) * 100) : 100;

  const riskStatus = computeRiskStatus(req.requiredMinutes, deliveredMinutes, expectedByNow, projectedMinutes);

  return {
    serviceRequirementId: req.id,
    studentId: req.studentId,
    studentName: `${req.studentFirstName} ${req.studentLastName}`,
    serviceTypeId: req.serviceTypeId,
    serviceTypeName: req.serviceTypeName ?? "",
    providerId: req.providerId ?? null,
    providerName: req.providerFirstName ? `${req.providerFirstName} ${req.providerLastName}` : null,
    intervalType: req.intervalType,
    requiredMinutes: req.requiredMinutes,
    deliveredMinutes,
    remainingMinutes,
    percentComplete: Math.round(percentComplete * 10) / 10,
    expectedMinutesByNow: Math.round(expectedByNow * 10) / 10,
    projectedMinutes: Math.round(projectedMinutes * 10) / 10,
    riskStatus,
    intervalStart: intervalStartStr,
    intervalEnd: intervalEndStr,
    missedSessionsCount: missedSessions.length,
    makeupSessionsCount: makeupSessions.length,
    closureDayCount,
    earlyReleaseDayCount,
  };
}

export async function computeAllActiveMinuteProgress(filters?: {
  studentId?: number;
  studentIds?: number[];
  staffId?: number;
  serviceTypeId?: number;
  programId?: number;
  riskStatus?: string;
  schoolId?: number;
  districtId?: number;
  startDate?: string;
  endDate?: string;
  asOfDate?: Date;
}): Promise<MinuteProgressResult[]> {
  const conditions: ReturnType<typeof eq>[] = [eq(serviceRequirementsTable.active, true) as any];
  if (filters?.studentId) conditions.push(eq(serviceRequirementsTable.studentId, filters.studentId) as any);
  if (filters?.studentIds && filters.studentIds.length > 0) conditions.push(inArray(serviceRequirementsTable.studentId, filters.studentIds) as any);
  if (filters?.serviceTypeId) conditions.push(eq(serviceRequirementsTable.serviceTypeId, filters.serviceTypeId) as any);
  if (filters?.staffId) conditions.push(eq(serviceRequirementsTable.providerId, filters.staffId) as any);
  if (filters?.schoolId) conditions.push(sql`${studentsTable.id} IN (SELECT id FROM students WHERE school_id = ${filters.schoolId})` as any);
  if (filters?.districtId) conditions.push(sql`${studentsTable.id} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${filters.districtId}))` as any);

  const reqs = await db
    .select({
      id: serviceRequirementsTable.id,
      studentId: serviceRequirementsTable.studentId,
      serviceTypeId: serviceRequirementsTable.serviceTypeId,
      providerId: serviceRequirementsTable.providerId,
      requiredMinutes: serviceRequirementsTable.requiredMinutes,
      intervalType: serviceRequirementsTable.intervalType,
      startDate: serviceRequirementsTable.startDate,
      endDate: serviceRequirementsTable.endDate,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      serviceTypeName: serviceTypesTable.name,
      providerFirstName: staffTable.firstName,
      providerLastName: staffTable.lastName,
      // Slice 2 — needed to honor school closures / early-release days
      // when computing expectedMinutesByNow. School → district join lets
      // us tenant-scope the exceptions lookup without a second query.
      schoolId: studentsTable.schoolId,
      schoolDistrictId: schoolsTable.districtId,
    })
    .from(serviceRequirementsTable)
    .leftJoin(studentsTable, eq(studentsTable.id, serviceRequirementsTable.studentId))
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
    .leftJoin(staffTable, eq(staffTable.id, serviceRequirementsTable.providerId))
    .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
    .where(conditions.length === 1 ? conditions[0] : and(...conditions));

  if (reqs.length === 0) return [];

  const reqIds = reqs.map(r => r.id);

  const intervalsByType = new Map<string, { intervalStart: Date; intervalEnd: Date; startStr: string; endStr: string }>();
  for (const r of reqs) {
    const key = `${r.intervalType}|${r.startDate}|${r.endDate ?? ""}`;
    if (!intervalsByType.has(key)) {
      const { intervalStart, intervalEnd } = getIntervalDates(r.intervalType, r.startDate, r.endDate, filters?.asOfDate);
      intervalsByType.set(key, {
        intervalStart,
        intervalEnd,
        startStr: intervalStart.toISOString().substring(0, 10),
        endStr: intervalEnd.toISOString().substring(0, 10),
      });
    }
  }

  let globalEarliestStr = "9999-12-31";
  let globalLatestStr = "0000-01-01";
  for (const iv of intervalsByType.values()) {
    if (iv.startStr < globalEarliestStr) globalEarliestStr = iv.startStr;
    if (iv.endStr > globalLatestStr) globalLatestStr = iv.endStr;
  }

  const sessionStartStr = filters?.startDate && filters.startDate > globalEarliestStr ? filters.startDate : globalEarliestStr;
  const sessionEndStr = filters?.endDate && filters.endDate < globalLatestStr ? filters.endDate : globalLatestStr;

  // Slice 2 — bulk-load every relevant school's exceptions across the
  // global window in a single query, grouped by district to keep the
  // tenant-scope check explicit. Reqs whose student has no school (legacy
  // data) are skipped — they get an empty map and the legacy math.
  const schoolsByDistrict = new Map<number, Set<number>>();
  for (const r of reqs) {
    if (r.schoolId == null || r.schoolDistrictId == null) continue;
    let set = schoolsByDistrict.get(r.schoolDistrictId);
    if (!set) {
      set = new Set();
      schoolsByDistrict.set(r.schoolDistrictId, set);
    }
    set.add(r.schoolId);
  }
  const exceptionsBySchool = new Map<number, Map<string, SchoolDayException>>();
  for (const [did, schoolSet] of schoolsByDistrict.entries()) {
    const map = await getSchoolDayExceptionsForRange({
      districtId: did,
      schoolIds: Array.from(schoolSet),
      startDate: globalEarliestStr,
      endDate: globalLatestStr,
    });
    // Re-bucket by schoolId so each requirement only sees its own school.
    for (const [k, v] of map.entries()) {
      const sid = v.schoolId;
      let perSchool = exceptionsBySchool.get(sid);
      if (!perSchool) {
        perSchool = new Map();
        exceptionsBySchool.set(sid, perSchool);
      }
      perSchool.set(k, v);
    }
  }

  const allSessions = await db
    .select({
      serviceRequirementId: sessionLogsTable.serviceRequirementId,
      durationMinutes: sessionLogsTable.durationMinutes,
      status: sessionLogsTable.status,
      isMakeup: sessionLogsTable.isMakeup,
      isCompensatory: sessionLogsTable.isCompensatory,
      sessionDate: sessionLogsTable.sessionDate,
    })
    .from(sessionLogsTable)
    .where(
      and(
        inArray(sessionLogsTable.serviceRequirementId, reqIds),
        gte(sessionLogsTable.sessionDate, sessionStartStr),
        lte(sessionLogsTable.sessionDate, sessionEndStr),
        eq(sessionLogsTable.isCompensatory, false),
        isNull(sessionLogsTable.deletedAt)
      )
    );

  const sessionsByReqId = new Map<number, typeof allSessions>();
  for (const s of allSessions) {
    if (s.serviceRequirementId == null) continue;
    if (!sessionsByReqId.has(s.serviceRequirementId)) sessionsByReqId.set(s.serviceRequirementId, []);
    sessionsByReqId.get(s.serviceRequirementId)!.push(s);
  }

  const results: MinuteProgressResult[] = [];
  for (const req of reqs) {
    const key = `${req.intervalType}|${req.startDate}|${req.endDate ?? ""}`;
    const iv = intervalsByType.get(key)!;

    const reqSessions = sessionsByReqId.get(req.id) ?? [];
    const filterStart = filters?.startDate && filters.startDate > iv.startStr ? filters.startDate : iv.startStr;
    const filterEnd = filters?.endDate && filters.endDate < iv.endStr ? filters.endDate : iv.endStr;
    const filteredSessions = reqSessions
      .filter(s => s.sessionDate >= filterStart && s.sessionDate <= filterEnd)
      .map(s => ({ durationMinutes: s.durationMinutes, status: s.status, isMakeup: s.isMakeup }));

    const perSchoolExceptions = req.schoolId != null
      ? exceptionsBySchool.get(req.schoolId) ?? new Map<string, SchoolDayException>()
      : new Map<string, SchoolDayException>();

    results.push(buildProgressFromSessions(
      req,
      filteredSessions,
      iv.intervalStart,
      iv.intervalEnd,
      iv.startStr,
      iv.endStr,
      filters?.asOfDate,
      { schoolId: req.schoolId, exceptions: perSchoolExceptions },
    ));
  }

  if (filters?.riskStatus) {
    return results.filter(r => r.riskStatus === filters.riskStatus);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Cached per-student worst-risk aggregation.
//
// The Students list and the dashboard both want the same answer: "for each
// active student, what is the worst risk tier across their requirements?"
// Recomputing that inline per request (previously a hand-written CTE in the
// students route) was expensive for large districts. This helper runs the
// shared JS pipeline (computeAllActiveMinuteProgress) once and caches the
// derived map for a short window so repeated filter clicks are near-instant.
// ---------------------------------------------------------------------------

export type AggregateRiskStatus = "on_track" | "slightly_behind" | "at_risk" | "out_of_compliance";

type RiskMapScope = { districtId?: number; schoolId?: number };

const RISK_PRIORITY: Record<string, number> = {
  out_of_compliance: 4,
  at_risk: 3,
  slightly_behind: 2,
  on_track: 1,
  completed: 0,
  no_data: 0,
};

const RISK_MAP_TTL_MS = 30_000;

type RiskMapCacheEntry = {
  expiresAt: number;
  promise: Promise<Map<number, AggregateRiskStatus>>;
};

const riskMapCache = new Map<string, RiskMapCacheEntry>();

function riskMapCacheKey(scope: RiskMapScope): string {
  return `d=${scope.districtId ?? ""}|s=${scope.schoolId ?? ""}`;
}

function aggregateFromProgress(
  all: MinuteProgressResult[]
): Map<number, AggregateRiskStatus> {
  const map = new Map<number, AggregateRiskStatus>();
  for (const p of all) {
    const candidate: AggregateRiskStatus =
      p.riskStatus === "out_of_compliance" ? "out_of_compliance"
      : p.riskStatus === "at_risk" ? "at_risk"
      : p.riskStatus === "slightly_behind" ? "slightly_behind"
      : "on_track";
    const cur = map.get(p.studentId);
    if (!cur || (RISK_PRIORITY[candidate] ?? 0) > (RISK_PRIORITY[cur] ?? 0)) {
      map.set(p.studentId, candidate);
    }
  }
  return map;
}

export async function getCachedStudentRiskMap(
  scope: RiskMapScope = {}
): Promise<Map<number, AggregateRiskStatus>> {
  const key = riskMapCacheKey(scope);
  const now = Date.now();
  const entry = riskMapCache.get(key);
  if (entry && entry.expiresAt > now) return entry.promise;

  const promise = (async () => {
    const all = await computeAllActiveMinuteProgress({
      districtId: scope.districtId,
      schoolId: scope.schoolId,
    });
    return aggregateFromProgress(all);
  })();

  riskMapCache.set(key, { expiresAt: now + RISK_MAP_TTL_MS, promise });
  promise.catch(() => {
    // Don't poison the cache with a failed request.
    const cur = riskMapCache.get(key);
    if (cur && cur.promise === promise) riskMapCache.delete(key);
  });
  return promise;
}

export function invalidateStudentRiskMapCache(): void {
  riskMapCache.clear();
}
