import { db } from "@workspace/db";
import { sessionLogsTable, serviceRequirementsTable, serviceTypesTable, studentsTable, staffTable, schoolYearsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, inArray, isNull } from "drizzle-orm";

export type RiskStatus = "on_track" | "slightly_behind" | "at_risk" | "out_of_compliance" | "completed" | "no_data";

// If no minutes have been delivered AND we are at least this far into the
// interval, surface a distinct "no_data" status instead of a cheery "on_track".
// This prevents a freshly-started period from showing green when the provider
// has not yet logged a single session.
const NO_DATA_ELAPSED_THRESHOLD = 0.10;

function getIntervalDates(
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
};

export async function computeMinuteProgress(serviceRequirementId: number): Promise<MinuteProgressResult | null> {
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
    })
    .from(serviceRequirementsTable)
    .leftJoin(studentsTable, eq(studentsTable.id, serviceRequirementsTable.studentId))
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
    .leftJoin(staffTable, eq(staffTable.id, serviceRequirementsTable.providerId))
    .where(eq(serviceRequirementsTable.id, serviceRequirementId));

  if (!req) return null;

  const { intervalStart, intervalEnd } = getIntervalDates(req.intervalType, req.startDate, req.endDate);
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

  return buildProgressFromSessions(req, sessions, intervalStart, intervalEnd, intervalStartStr, intervalEndStr);
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
  asOfDate?: Date
): MinuteProgressResult {
  const completedSessions = sessions.filter(s => s.status === "completed" || s.status === "makeup");
  const missedSessions = sessions.filter(s => s.status === "missed");
  const makeupSessions = sessions.filter(s => s.isMakeup);

  const deliveredMinutes = completedSessions.reduce((sum, s) => sum + s.durationMinutes, 0);

  const now = asOfDate ?? new Date();
  const totalDays = Math.max(1, (intervalEnd.getTime() - intervalStart.getTime()) / (1000 * 60 * 60 * 24));
  const elapsedDays = Math.max(0, (now.getTime() - intervalStart.getTime()) / (1000 * 60 * 60 * 24));
  const progressFraction = Math.min(1, elapsedDays / totalDays);

  const expectedByNow = req.requiredMinutes * progressFraction;

  const currentPacePerDay = elapsedDays > 0 ? deliveredMinutes / elapsedDays : 0;
  const remainingDays = Math.max(0, totalDays - elapsedDays);
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
    })
    .from(serviceRequirementsTable)
    .leftJoin(studentsTable, eq(studentsTable.id, serviceRequirementsTable.studentId))
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
    .leftJoin(staffTable, eq(staffTable.id, serviceRequirementsTable.providerId))
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

    results.push(buildProgressFromSessions(req, filteredSessions, iv.intervalStart, iv.intervalEnd, iv.startStr, iv.endStr, filters?.asOfDate));
  }

  if (filters?.riskStatus) {
    return results.filter(r => r.riskStatus === filters.riskStatus);
  }

  return results;
}
