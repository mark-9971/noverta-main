import { db } from "@workspace/db";
import { sessionLogsTable, serviceRequirementsTable, serviceTypesTable, studentsTable, staffTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";

export type RiskStatus = "on_track" | "slightly_behind" | "at_risk" | "out_of_compliance" | "completed";

function getIntervalDates(intervalType: string, startDate: string, endDate?: string | null): { intervalStart: Date; intervalEnd: Date } {
  const now = new Date();
  const start = new Date(startDate);

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

  // daily
  const today = new Date();
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
  const pct = deliveredMinutes / requiredMinutes;
  const expectedPct = expectedByNow / requiredMinutes;

  if (projectedMinutes >= requiredMinutes * 0.95) return "on_track";
  if (deliveredMinutes < expectedByNow * 0.7) return "out_of_compliance";
  if (deliveredMinutes < expectedByNow * 0.85) return "at_risk";
  if (deliveredMinutes < expectedByNow * 0.95) return "slightly_behind";
  return "on_track";
}

export async function computeMinuteProgress(serviceRequirementId: number) {
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

  // Get all sessions in the interval for this student and service requirement
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
        lte(sessionLogsTable.sessionDate, intervalEndStr)
      )
    );

  const completedSessions = sessions.filter(s => s.status === "completed" || s.status === "makeup");
  const missedSessions = sessions.filter(s => s.status === "missed");
  const makeupSessions = sessions.filter(s => s.isMakeup);

  const deliveredMinutes = completedSessions.reduce((sum, s) => sum + s.durationMinutes, 0);

  const now = new Date();
  const totalDays = (intervalEnd.getTime() - intervalStart.getTime()) / (1000 * 60 * 60 * 24);
  const elapsedDays = Math.max(0, (now.getTime() - intervalStart.getTime()) / (1000 * 60 * 60 * 24));
  const progressFraction = Math.min(1, elapsedDays / totalDays);

  const expectedByNow = req.requiredMinutes * progressFraction;
  const remainingDaysFraction = Math.max(0, 1 - progressFraction);

  // Simple projection: delivered + (current pace * remaining days)
  const currentPacePerDay = elapsedDays > 0 ? deliveredMinutes / elapsedDays : 0;
  const remainingDays = Math.max(0, totalDays - elapsedDays);
  const projectedMinutes = deliveredMinutes + (currentPacePerDay * remainingDays);

  const remainingMinutes = Math.max(0, req.requiredMinutes - deliveredMinutes);
  const percentComplete = Math.min(100, (deliveredMinutes / req.requiredMinutes) * 100);

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
  staffId?: number;
  serviceTypeId?: number;
  programId?: number;
  riskStatus?: string;
}) {
  const conditions = [eq(serviceRequirementsTable.active, true)];
  if (filters?.studentId) conditions.push(eq(serviceRequirementsTable.studentId, filters.studentId));
  if (filters?.serviceTypeId) conditions.push(eq(serviceRequirementsTable.serviceTypeId, filters.serviceTypeId));
  if (filters?.staffId) conditions.push(eq(serviceRequirementsTable.providerId, filters.staffId));

  const reqs = await db
    .select({ id: serviceRequirementsTable.id })
    .from(serviceRequirementsTable)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions));

  const results = await Promise.all(reqs.map(r => computeMinuteProgress(r.id)));
  const filtered = results.filter(Boolean) as NonNullable<typeof results[0]>[];

  if (filters?.riskStatus) {
    return filtered.filter(r => r.riskStatus === filters.riskStatus);
  }

  return filtered;
}
