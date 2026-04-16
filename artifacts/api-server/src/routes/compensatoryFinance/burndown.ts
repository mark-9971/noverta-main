import { Router } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, schoolsTable, serviceRequirementsTable,
  compensatoryObligationsTable, sessionLogsTable,
} from "@workspace/db/schema";
import { eq, and, sql, gte, inArray } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { getDistrictId, getContractedProviderIds, getRateMap, minutesToDollars, resolveRate } from "./shared";

const router = Router();

router.get("/compensatory-finance/burndown", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) { res.status(403).json({ error: "District context required" }); return; }

  const monthsRaw = parseInt(req.query.months as string) || 12;
  const months = Math.max(1, Math.min(monthsRaw, 60));
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const startStr = startDate.toISOString().slice(0, 10);

  const districtStudentIds = await db.select({ id: studentsTable.id })
    .from(studentsTable)
    .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .where(eq(schoolsTable.districtId, districtId));
  const studentIds = districtStudentIds.map(s => s.id);

  if (studentIds.length === 0) { res.json([]); return; }

  const [rateMap, contractedProviders] = await Promise.all([
    getRateMap(districtId),
    getContractedProviderIds(districtId),
  ]);

  const accrued = await db.select({
    month: sql<string>`to_char(${compensatoryObligationsTable.createdAt}, 'YYYY-MM')`,
    serviceReqId: compensatoryObligationsTable.serviceRequirementId,
    totalMinutes: sql<number>`coalesce(sum(${compensatoryObligationsTable.minutesOwed}), 0)::int`,
  }).from(compensatoryObligationsTable).where(and(
    inArray(compensatoryObligationsTable.studentId, studentIds),
    gte(compensatoryObligationsTable.createdAt, startDate),
  )).groupBy(
    sql`to_char(${compensatoryObligationsTable.createdAt}, 'YYYY-MM')`,
    compensatoryObligationsTable.serviceRequirementId,
  );

  const delivered = await db.select({
    month: sql<string>`to_char(${sessionLogsTable.sessionDate}::date, 'YYYY-MM')`,
    serviceTypeId: sessionLogsTable.serviceTypeId,
    providerId: sessionLogsTable.staffId,
    totalMinutes: sql<number>`coalesce(sum(${sessionLogsTable.durationMinutes}), 0)::int`,
  }).from(sessionLogsTable).where(and(
    inArray(sessionLogsTable.studentId, studentIds),
    eq(sessionLogsTable.isCompensatory, true),
    inArray(sessionLogsTable.status, ["completed", "makeup"]),
    gte(sessionLogsTable.sessionDate, startStr),
  )).groupBy(
    sql`to_char(${sessionLogsTable.sessionDate}::date, 'YYYY-MM')`,
    sessionLogsTable.serviceTypeId,
    sessionLogsTable.staffId,
  );

  const svcReqIds = [...new Set(accrued.filter(a => a.serviceReqId).map(a => a.serviceReqId!))];
  let svcReqInfo = new Map<number, { serviceTypeId: number; providerId: number | null }>();
  if (svcReqIds.length > 0) {
    const reqs = await db.select({
      id: serviceRequirementsTable.id,
      serviceTypeId: serviceRequirementsTable.serviceTypeId,
      providerId: serviceRequirementsTable.providerId,
    }).from(serviceRequirementsTable).where(
      and(
        inArray(serviceRequirementsTable.id, svcReqIds),
        inArray(serviceRequirementsTable.studentId, studentIds),
      )
    );
    svcReqInfo = new Map(reqs.map(r => [r.id, r]));
  }

  const monthlyData: Record<string, { accrued: number; delivered: number; accruedDollars: number; deliveredDollars: number }> = {};

  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
    const key = d.toISOString().slice(0, 7);
    monthlyData[key] = { accrued: 0, delivered: 0, accruedDollars: 0, deliveredDollars: 0 };
  }

  for (const a of accrued) {
    if (!monthlyData[a.month]) monthlyData[a.month] = { accrued: 0, delivered: 0, accruedDollars: 0, deliveredDollars: 0 };
    monthlyData[a.month].accrued += a.totalMinutes;
    const reqInfo = a.serviceReqId ? svcReqInfo.get(a.serviceReqId) : null;
    const svcTypeId = reqInfo?.serviceTypeId || 0;
    const isContracted = reqInfo?.providerId ? contractedProviders.has(reqInfo.providerId) : false;
    const rate = resolveRate(rateMap, svcTypeId, isContracted);
    monthlyData[a.month].accruedDollars += minutesToDollars(a.totalMinutes, rate);
  }

  for (const d of delivered) {
    if (!monthlyData[d.month]) monthlyData[d.month] = { accrued: 0, delivered: 0, accruedDollars: 0, deliveredDollars: 0 };
    monthlyData[d.month].delivered += d.totalMinutes;
    const isContracted = d.providerId ? contractedProviders.has(d.providerId) : false;
    const rate = resolveRate(rateMap, d.serviceTypeId, isContracted);
    monthlyData[d.month].deliveredDollars += minutesToDollars(d.totalMinutes, rate);
  }

  const result = Object.entries(monthlyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      accruedMinutes: data.accrued,
      deliveredMinutes: data.delivered,
      accruedDollars: Math.round(data.accruedDollars * 100) / 100,
      deliveredDollars: Math.round(data.deliveredDollars * 100) / 100,
    }));

  let cumAccrued = 0;
  let cumDelivered = 0;
  let cumAccruedDollars = 0;
  let cumDeliveredDollars = 0;
  const burndown = result.map(r => {
    cumAccrued += r.accruedMinutes;
    cumDelivered += r.deliveredMinutes;
    cumAccruedDollars += r.accruedDollars;
    cumDeliveredDollars += r.deliveredDollars;
    return {
      ...r,
      cumulativeOwed: cumAccrued - cumDelivered,
      cumulativeOwedDollars: Math.round((cumAccruedDollars - cumDeliveredDollars) * 100) / 100,
    };
  });

  res.json(burndown);
});

export default router;
