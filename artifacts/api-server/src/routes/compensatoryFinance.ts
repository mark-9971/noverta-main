import { Router } from "express";
import { db } from "@workspace/db";
import {
  studentsTable,
  serviceRequirementsTable,
  serviceTypesTable,
  compensatoryObligationsTable,
  sessionLogsTable,
  staffTable,
  schoolsTable,
  serviceRateConfigsTable,
  agencyContractsTable,
  agenciesTable,
  contractSessionLinksTable,
} from "@workspace/db/schema";
import { eq, and, sql, gte, lte, inArray, desc, asc, isNull } from "drizzle-orm";
import type { AuthedRequest } from "../middlewares/auth";
import { getEnforcedDistrictId } from "../middlewares/auth";

const router = Router();
const DEFAULT_HOURLY_RATE = 75;

function getDistrictId(req: AuthedRequest): number | null {
  return getEnforcedDistrictId(req);
}

async function getContractedProviderIds(districtId: number): Promise<Set<number>> {
  const contractedLinks = await db.selectDistinct({
    providerId: sessionLogsTable.providerId,
  }).from(contractSessionLinksTable)
    .innerJoin(sessionLogsTable, eq(contractSessionLinksTable.sessionLogId, sessionLogsTable.id))
    .innerJoin(studentsTable, eq(sessionLogsTable.studentId, studentsTable.id))
    .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .where(and(
      eq(schoolsTable.districtId, districtId),
      sql`${sessionLogsTable.providerId} IS NOT NULL`,
    ));
  return new Set(contractedLinks.map(c => c.providerId!));
}

function resolveRate(
  rateMap: Map<number, { inHouse: number; contracted: number }>,
  serviceTypeId: number,
  isContracted: boolean,
): number {
  const rates = rateMap.get(serviceTypeId) || { inHouse: DEFAULT_HOURLY_RATE, contracted: DEFAULT_HOURLY_RATE };
  return isContracted ? rates.contracted : rates.inHouse;
}

async function getRateMap(districtId: number): Promise<Map<number, { inHouse: number; contracted: number }>> {
  const configs = await db.select({
    serviceTypeId: serviceRateConfigsTable.serviceTypeId,
    inHouseRate: serviceRateConfigsTable.inHouseRate,
    contractedRate: serviceRateConfigsTable.contractedRate,
    effectiveDate: serviceRateConfigsTable.effectiveDate,
  }).from(serviceRateConfigsTable).where(
    eq(serviceRateConfigsTable.districtId, districtId),
  ).orderBy(desc(serviceRateConfigsTable.effectiveDate));

  const rateMap = new Map<number, { inHouse: number; contracted: number }>();
  for (const c of configs) {
    if (rateMap.has(c.serviceTypeId)) continue;
    rateMap.set(c.serviceTypeId, {
      inHouse: c.inHouseRate ? parseFloat(c.inHouseRate) : DEFAULT_HOURLY_RATE,
      contracted: c.contractedRate ? parseFloat(c.contractedRate) : DEFAULT_HOURLY_RATE,
    });
  }

  const agencyContracts = await db.select({
    serviceTypeId: agencyContractsTable.serviceTypeId,
    hourlyRate: agencyContractsTable.hourlyRate,
  }).from(agencyContractsTable)
    .innerJoin(agenciesTable, eq(agencyContractsTable.agencyId, agenciesTable.id))
    .where(and(
      eq(agenciesTable.districtId, districtId),
      eq(agencyContractsTable.status, "active"),
      isNull(agencyContractsTable.deletedAt),
    )).orderBy(desc(agencyContractsTable.startDate));

  const agencyRateMap = new Map<number, number>();
  for (const ac of agencyContracts) {
    if (!agencyRateMap.has(ac.serviceTypeId) && ac.hourlyRate) {
      agencyRateMap.set(ac.serviceTypeId, parseFloat(ac.hourlyRate));
    }
  }

  const serviceTypes = await db.select({
    id: serviceTypesTable.id,
    defaultBillingRate: serviceTypesTable.defaultBillingRate,
  }).from(serviceTypesTable);

  for (const st of serviceTypes) {
    if (!rateMap.has(st.id)) {
      const agencyRate = agencyRateMap.get(st.id);
      const defaultRate = st.defaultBillingRate ? parseFloat(st.defaultBillingRate) : DEFAULT_HOURLY_RATE;
      rateMap.set(st.id, {
        inHouse: defaultRate,
        contracted: agencyRate || defaultRate,
      });
    }
  }

  return rateMap;
}

function minutesToDollars(minutes: number, hourlyRate: number): number {
  return Math.round((minutes / 60) * hourlyRate * 100) / 100;
}

router.get("/compensatory-finance/overview", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) { res.status(403).json({ error: "District context required" }); return; }

  const districtStudentIds = await db.select({ id: studentsTable.id })
    .from(studentsTable)
    .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .where(and(
      eq(studentsTable.status, "active"),
      eq(schoolsTable.districtId, districtId),
    ));
  const studentIds = districtStudentIds.map(s => s.id);

  if (studentIds.length === 0) {
    res.json({
      totalMinutesOwed: 0, totalMinutesDelivered: 0, totalDollarsOwed: 0,
      totalDollarsDelivered: 0, studentsAffected: 0,
      byServiceType: [], bySchool: [], byProvider: [],
    });
    return;
  }

  const [rateMap, contractedProviders] = await Promise.all([
    getRateMap(districtId),
    getContractedProviderIds(districtId),
  ]);

  const obligations = await db.select({
    id: compensatoryObligationsTable.id,
    studentId: compensatoryObligationsTable.studentId,
    serviceRequirementId: compensatoryObligationsTable.serviceRequirementId,
    minutesOwed: compensatoryObligationsTable.minutesOwed,
    minutesDelivered: compensatoryObligationsTable.minutesDelivered,
    status: compensatoryObligationsTable.status,
  }).from(compensatoryObligationsTable).where(
    inArray(compensatoryObligationsTable.studentId, studentIds),
  );

  const svcReqIds = [...new Set(obligations.filter(o => o.serviceRequirementId).map(o => o.serviceRequirementId!))];
  let svcReqMap = new Map<number, { serviceTypeId: number; providerId: number | null; studentId: number }>();
  if (svcReqIds.length > 0) {
    const reqs = await db.select({
      id: serviceRequirementsTable.id,
      serviceTypeId: serviceRequirementsTable.serviceTypeId,
      providerId: serviceRequirementsTable.providerId,
      studentId: serviceRequirementsTable.studentId,
    }).from(serviceRequirementsTable).where(
      and(
        inArray(serviceRequirementsTable.id, svcReqIds),
        inArray(serviceRequirementsTable.studentId, studentIds),
      )
    );
    svcReqMap = new Map(reqs.map(r => [r.id, r]));
  }

  const studentSchoolMap = new Map<number, number>();
  const schoolData = await db.select({
    studentId: studentsTable.id,
    schoolId: studentsTable.schoolId,
  }).from(studentsTable).where(inArray(studentsTable.id, studentIds));
  for (const s of schoolData) {
    if (s.schoolId) studentSchoolMap.set(s.studentId, s.schoolId);
  }

  const schools = await db.select({ id: schoolsTable.id, name: schoolsTable.name })
    .from(schoolsTable).where(eq(schoolsTable.districtId, districtId));
  const schoolNameMap = new Map(schools.map(s => [s.id, s.name]));

  const serviceTypes = await db.select({ id: serviceTypesTable.id, name: serviceTypesTable.name })
    .from(serviceTypesTable);
  const svcTypeNameMap = new Map(serviceTypes.map(t => [t.id, t.name]));

  const providerIds = [...new Set([...svcReqMap.values()].filter(v => v.providerId).map(v => v.providerId!))];
  let providerNameMap = new Map<number, string>();
  if (providerIds.length > 0) {
    const districtStaffIds = await db.select({ id: staffTable.id })
      .from(staffTable)
      .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
      .where(eq(schoolsTable.districtId, districtId))
      .then(r => new Set(r.map(s => s.id)));
    const scopedProviderIds = providerIds.filter(id => districtStaffIds.has(id));
    if (scopedProviderIds.length > 0) {
      const providers = await db.select({ id: staffTable.id, firstName: staffTable.firstName, lastName: staffTable.lastName })
        .from(staffTable).where(inArray(staffTable.id, scopedProviderIds));
      providerNameMap = new Map(providers.map(p => [p.id, `${p.firstName} ${p.lastName}`]));
    }
  }

  let totalMinutesOwed = 0;
  let totalMinutesDelivered = 0;
  let totalDollarsOwed = 0;
  let totalDollarsDelivered = 0;
  const affectedStudents = new Set<number>();
  const byServiceType: Record<number, { name: string; minutesOwed: number; minutesDelivered: number; dollarsOwed: number; dollarsDelivered: number; count: number }> = {};
  const bySchool: Record<number, { name: string; minutesOwed: number; dollarsOwed: number; count: number }> = {};
  const byProvider: Record<number, { name: string; minutesOwed: number; dollarsOwed: number; count: number }> = {};

  for (const ob of obligations) {
    const svcReq = ob.serviceRequirementId ? svcReqMap.get(ob.serviceRequirementId) : null;
    const serviceTypeId = svcReq?.serviceTypeId || 0;
    const isContracted = svcReq?.providerId ? contractedProviders.has(svcReq.providerId) : false;
    const rate = resolveRate(rateMap, serviceTypeId, isContracted);

    const owedDollars = minutesToDollars(ob.minutesOwed, rate);
    const deliveredDollars = minutesToDollars(ob.minutesDelivered, rate);

    totalMinutesOwed += ob.minutesOwed;
    totalMinutesDelivered += ob.minutesDelivered;
    totalDollarsOwed += owedDollars;
    totalDollarsDelivered += deliveredDollars;
    affectedStudents.add(ob.studentId);

    if (serviceTypeId > 0) {
      if (!byServiceType[serviceTypeId]) {
        byServiceType[serviceTypeId] = { name: svcTypeNameMap.get(serviceTypeId) || "Unknown", minutesOwed: 0, minutesDelivered: 0, dollarsOwed: 0, dollarsDelivered: 0, count: 0 };
      }
      byServiceType[serviceTypeId].minutesOwed += ob.minutesOwed;
      byServiceType[serviceTypeId].minutesDelivered += ob.minutesDelivered;
      byServiceType[serviceTypeId].dollarsOwed += owedDollars;
      byServiceType[serviceTypeId].dollarsDelivered += deliveredDollars;
      byServiceType[serviceTypeId].count++;
    }

    const schoolId = studentSchoolMap.get(ob.studentId);
    if (schoolId) {
      if (!bySchool[schoolId]) {
        bySchool[schoolId] = { name: schoolNameMap.get(schoolId) || "Unknown", minutesOwed: 0, dollarsOwed: 0, count: 0 };
      }
      bySchool[schoolId].minutesOwed += ob.minutesOwed;
      bySchool[schoolId].dollarsOwed += owedDollars;
      bySchool[schoolId].count++;
    }

    const providerId = svcReq?.providerId;
    if (providerId) {
      if (!byProvider[providerId]) {
        byProvider[providerId] = { name: providerNameMap.get(providerId) || "Unknown", minutesOwed: 0, dollarsOwed: 0, count: 0 };
      }
      byProvider[providerId].minutesOwed += ob.minutesOwed;
      byProvider[providerId].dollarsOwed += owedDollars;
      byProvider[providerId].count++;
    }
  }

  res.json({
    totalMinutesOwed,
    totalMinutesDelivered,
    totalDollarsOwed: Math.round(totalDollarsOwed * 100) / 100,
    totalDollarsDelivered: Math.round(totalDollarsDelivered * 100) / 100,
    studentsAffected: affectedStudents.size,
    obligationCount: obligations.length,
    pendingCount: obligations.filter(o => o.status === "pending").length,
    inProgressCount: obligations.filter(o => o.status === "in_progress").length,
    completedCount: obligations.filter(o => o.status === "completed").length,
    byServiceType: Object.entries(byServiceType).map(([id, v]) => ({ serviceTypeId: Number(id), ...v })).sort((a, b) => b.dollarsOwed - a.dollarsOwed),
    bySchool: Object.entries(bySchool).map(([id, v]) => ({ schoolId: Number(id), ...v })).sort((a, b) => b.dollarsOwed - a.dollarsOwed),
    byProvider: Object.entries(byProvider).map(([id, v]) => ({ providerId: Number(id), ...v })).sort((a, b) => b.dollarsOwed - a.dollarsOwed),
  });
});

router.get("/compensatory-finance/students", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) { res.status(403).json({ error: "District context required" }); return; }

  const districtStudents = await db.select({
    id: studentsTable.id,
    firstName: studentsTable.firstName,
    lastName: studentsTable.lastName,
    schoolId: studentsTable.schoolId,
  })
    .from(studentsTable)
    .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .where(and(
      eq(studentsTable.status, "active"),
      eq(schoolsTable.districtId, districtId),
    ));
  const studentIds = districtStudents.map(s => s.id);
  if (studentIds.length === 0) { res.json([]); return; }

  const studentMap = new Map(districtStudents.map(s => [s.id, s]));

  const [rateMap, contractedProviders] = await Promise.all([
    getRateMap(districtId),
    getContractedProviderIds(districtId),
  ]);

  const obligations = await db.select({
    studentId: compensatoryObligationsTable.studentId,
    serviceRequirementId: compensatoryObligationsTable.serviceRequirementId,
    minutesOwed: compensatoryObligationsTable.minutesOwed,
    minutesDelivered: compensatoryObligationsTable.minutesDelivered,
    status: compensatoryObligationsTable.status,
    periodStart: compensatoryObligationsTable.periodStart,
    periodEnd: compensatoryObligationsTable.periodEnd,
  }).from(compensatoryObligationsTable).where(
    inArray(compensatoryObligationsTable.studentId, studentIds),
  );

  const svcReqIds = [...new Set(obligations.filter(o => o.serviceRequirementId).map(o => o.serviceRequirementId!))];
  let svcReqMap = new Map<number, { serviceTypeId: number; providerId: number | null }>();
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
    svcReqMap = new Map(reqs.map(r => [r.id, r]));
  }

  const serviceTypes = await db.select({ id: serviceTypesTable.id, name: serviceTypesTable.name })
    .from(serviceTypesTable);
  const svcTypeNameMap = new Map(serviceTypes.map(t => [t.id, t.name]));

  const schools = await db.select({ id: schoolsTable.id, name: schoolsTable.name })
    .from(schoolsTable).where(eq(schoolsTable.districtId, districtId));
  const schoolNameMap = new Map(schools.map(s => [s.id, s.name]));

  const perStudent: Record<number, {
    studentId: number; studentName: string; schoolName: string;
    totalMinutesOwed: number; totalMinutesDelivered: number;
    totalDollarsOwed: number; totalDollarsDelivered: number;
    obligationCount: number; pendingCount: number;
    services: Record<number, { name: string; minutesOwed: number; minutesDelivered: number; dollarsOwed: number }>;
  }> = {};

  for (const ob of obligations) {
    const student = studentMap.get(ob.studentId);
    if (!student) continue;

    if (!perStudent[ob.studentId]) {
      perStudent[ob.studentId] = {
        studentId: ob.studentId,
        studentName: `${student.firstName} ${student.lastName}`,
        schoolName: student.schoolId ? (schoolNameMap.get(student.schoolId) || "") : "",
        totalMinutesOwed: 0, totalMinutesDelivered: 0,
        totalDollarsOwed: 0, totalDollarsDelivered: 0,
        obligationCount: 0, pendingCount: 0,
        services: {},
      };
    }

    const entry = perStudent[ob.studentId];
    const svcReq = ob.serviceRequirementId ? svcReqMap.get(ob.serviceRequirementId) : null;
    const serviceTypeId = svcReq?.serviceTypeId || 0;
    const isContracted = svcReq?.providerId ? contractedProviders.has(svcReq.providerId) : false;
    const rate = resolveRate(rateMap, serviceTypeId, isContracted);

    const owedDollars = minutesToDollars(ob.minutesOwed, rate);
    const deliveredDollars = minutesToDollars(ob.minutesDelivered, rate);

    entry.totalMinutesOwed += ob.minutesOwed;
    entry.totalMinutesDelivered += ob.minutesDelivered;
    entry.totalDollarsOwed += owedDollars;
    entry.totalDollarsDelivered += deliveredDollars;
    entry.obligationCount++;
    if (ob.status === "pending" || ob.status === "in_progress") entry.pendingCount++;

    if (serviceTypeId > 0) {
      if (!entry.services[serviceTypeId]) {
        entry.services[serviceTypeId] = { name: svcTypeNameMap.get(serviceTypeId) || "Unknown", minutesOwed: 0, minutesDelivered: 0, dollarsOwed: 0 };
      }
      entry.services[serviceTypeId].minutesOwed += ob.minutesOwed;
      entry.services[serviceTypeId].minutesDelivered += ob.minutesDelivered;
      entry.services[serviceTypeId].dollarsOwed += owedDollars;
    }
  }

  const result = Object.values(perStudent)
    .map(s => ({
      ...s,
      totalDollarsOwed: Math.round(s.totalDollarsOwed * 100) / 100,
      totalDollarsDelivered: Math.round(s.totalDollarsDelivered * 100) / 100,
      remainingDollars: Math.round((s.totalDollarsOwed - s.totalDollarsDelivered) * 100) / 100,
      pctDelivered: s.totalMinutesOwed > 0 ? Math.round((s.totalMinutesDelivered / s.totalMinutesOwed) * 100) : 0,
      services: Object.entries(s.services).map(([id, v]) => ({ serviceTypeId: Number(id), ...v })),
    }))
    .sort((a, b) => b.remainingDollars - a.remainingDollars);

  res.json(result);
});

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
    providerId: sessionLogsTable.providerId,
    totalMinutes: sql<number>`coalesce(sum(${sessionLogsTable.durationMinutes}), 0)::int`,
  }).from(sessionLogsTable).where(and(
    inArray(sessionLogsTable.studentId, studentIds),
    eq(sessionLogsTable.isCompensatory, true),
    inArray(sessionLogsTable.status, ["completed", "makeup"]),
    gte(sessionLogsTable.sessionDate, startStr),
  )).groupBy(
    sql`to_char(${sessionLogsTable.sessionDate}::date, 'YYYY-MM')`,
    sessionLogsTable.serviceTypeId,
    sessionLogsTable.providerId,
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

router.get("/compensatory-finance/export.csv", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) { res.status(403).json({ error: "District context required" }); return; }

  const districtStudents = await db.select({
    id: studentsTable.id,
    firstName: studentsTable.firstName,
    lastName: studentsTable.lastName,
    schoolId: studentsTable.schoolId,
  })
    .from(studentsTable)
    .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .where(and(
      eq(studentsTable.status, "active"),
      eq(schoolsTable.districtId, districtId),
    ));
  const studentIds = districtStudents.map(s => s.id);
  const studentMap = new Map(districtStudents.map(s => [s.id, s]));

  const [rateMap, contractedProviders] = await Promise.all([
    getRateMap(districtId),
    getContractedProviderIds(districtId),
  ]);

  const schools = await db.select({ id: schoolsTable.id, name: schoolsTable.name })
    .from(schoolsTable).where(eq(schoolsTable.districtId, districtId));
  const schoolNameMap = new Map(schools.map(s => [s.id, s.name]));

  const serviceTypes = await db.select({ id: serviceTypesTable.id, name: serviceTypesTable.name })
    .from(serviceTypesTable);
  const svcTypeNameMap = new Map(serviceTypes.map(t => [t.id, t.name]));

  const obligations = studentIds.length > 0 ? await db.select({
    id: compensatoryObligationsTable.id,
    studentId: compensatoryObligationsTable.studentId,
    serviceRequirementId: compensatoryObligationsTable.serviceRequirementId,
    minutesOwed: compensatoryObligationsTable.minutesOwed,
    minutesDelivered: compensatoryObligationsTable.minutesDelivered,
    status: compensatoryObligationsTable.status,
    periodStart: compensatoryObligationsTable.periodStart,
    periodEnd: compensatoryObligationsTable.periodEnd,
    source: compensatoryObligationsTable.source,
    notes: compensatoryObligationsTable.notes,
  }).from(compensatoryObligationsTable).where(
    inArray(compensatoryObligationsTable.studentId, studentIds),
  ) : [];

  const svcReqIds = [...new Set(obligations.filter(o => o.serviceRequirementId).map(o => o.serviceRequirementId!))];
  let svcReqMap = new Map<number, { serviceTypeId: number; providerId: number | null }>();
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
    svcReqMap = new Map(reqs.map(r => [r.id, r]));
  }

  const providerIds = [...new Set([...svcReqMap.values()].filter(v => v.providerId).map(v => v.providerId!))];
  let providerNameMap = new Map<number, string>();
  if (providerIds.length > 0) {
    const providers = await db.select({ id: staffTable.id, firstName: staffTable.firstName, lastName: staffTable.lastName })
      .from(staffTable).where(inArray(staffTable.id, providerIds));
    providerNameMap = new Map(providers.map(p => [p.id, `${p.firstName} ${p.lastName}`]));
  }

  const escapeCSV = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return "";
    const str = String(val).trim();
    if (/^[=+\-@\t\r]/.test(str)) return `"'${str.replace(/"/g, '""')}"`;
    if (str.includes(",") || str.includes('"') || str.includes("\n")) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const headers = ["Student Name", "School", "Service Type", "Provider", "Period Start", "Period End",
    "Minutes Owed", "Minutes Delivered", "Minutes Remaining", "Hourly Rate", "Dollars Owed",
    "Dollars Delivered", "Dollars Remaining", "% Delivered", "Status", "Source", "Notes"];

  const rows = obligations.map(ob => {
    const student = studentMap.get(ob.studentId);
    const svcReq = ob.serviceRequirementId ? svcReqMap.get(ob.serviceRequirementId) : null;
    const serviceTypeId = svcReq?.serviceTypeId || 0;
    const isContracted = svcReq?.providerId ? contractedProviders.has(svcReq.providerId) : false;
    const rate = resolveRate(rateMap, serviceTypeId, isContracted);
    const dollarsOwed = minutesToDollars(ob.minutesOwed, rate);
    const dollarsDelivered = minutesToDollars(ob.minutesDelivered, rate);
    const remaining = ob.minutesOwed - ob.minutesDelivered;
    const pct = ob.minutesOwed > 0 ? Math.round((ob.minutesDelivered / ob.minutesOwed) * 100) : 0;

    return [
      escapeCSV(student ? `${student.firstName} ${student.lastName}` : ""),
      escapeCSV(student?.schoolId ? schoolNameMap.get(student.schoolId) || "" : ""),
      escapeCSV(svcTypeNameMap.get(serviceTypeId) || "Unknown"),
      escapeCSV(svcReq?.providerId ? providerNameMap.get(svcReq.providerId) || "" : ""),
      escapeCSV(ob.periodStart),
      escapeCSV(ob.periodEnd),
      ob.minutesOwed,
      ob.minutesDelivered,
      remaining,
      rate.toFixed(2),
      dollarsOwed.toFixed(2),
      dollarsDelivered.toFixed(2),
      (dollarsOwed - dollarsDelivered).toFixed(2),
      `${pct}%`,
      escapeCSV(ob.status),
      escapeCSV(ob.source),
      escapeCSV(ob.notes),
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="compensatory-obligations-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

router.get("/compensatory-finance/rates", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) { res.status(403).json({ error: "District context required" }); return; }

  const configs = await db.select({
    id: serviceRateConfigsTable.id,
    serviceTypeId: serviceRateConfigsTable.serviceTypeId,
    inHouseRate: serviceRateConfigsTable.inHouseRate,
    contractedRate: serviceRateConfigsTable.contractedRate,
    effectiveDate: serviceRateConfigsTable.effectiveDate,
    notes: serviceRateConfigsTable.notes,
  }).from(serviceRateConfigsTable).where(
    eq(serviceRateConfigsTable.districtId, districtId),
  ).orderBy(desc(serviceRateConfigsTable.effectiveDate));

  const serviceTypes = await db.select({ id: serviceTypesTable.id, name: serviceTypesTable.name, defaultBillingRate: serviceTypesTable.defaultBillingRate })
    .from(serviceTypesTable);
  const svcTypeMap = new Map(serviceTypes.map(t => [t.id, t]));

  const result = configs.map(c => ({
    ...c,
    serviceTypeName: svcTypeMap.get(c.serviceTypeId)?.name || "Unknown",
    defaultRate: svcTypeMap.get(c.serviceTypeId)?.defaultBillingRate || null,
  }));

  res.json({ configs: result, serviceTypes: serviceTypes.map(t => ({ id: t.id, name: t.name, defaultBillingRate: t.defaultBillingRate })) });
});

router.post("/compensatory-finance/rates", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) { res.status(403).json({ error: "District context required" }); return; }

  const { serviceTypeId, inHouseRate, contractedRate, effectiveDate, notes } = req.body;
  if (!serviceTypeId || !effectiveDate) {
    res.status(400).json({ error: "serviceTypeId and effectiveDate are required" });
    return;
  }
  if (typeof serviceTypeId !== "number" || serviceTypeId <= 0) {
    res.status(400).json({ error: "serviceTypeId must be a positive integer" });
    return;
  }
  if (inHouseRate !== undefined && inHouseRate !== null && (isNaN(Number(inHouseRate)) || Number(inHouseRate) < 0)) {
    res.status(400).json({ error: "inHouseRate must be a non-negative number" });
    return;
  }
  if (contractedRate !== undefined && contractedRate !== null && (isNaN(Number(contractedRate)) || Number(contractedRate) < 0)) {
    res.status(400).json({ error: "contractedRate must be a non-negative number" });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    res.status(400).json({ error: "effectiveDate must be YYYY-MM-DD format" });
    return;
  }

  const [config] = await db.insert(serviceRateConfigsTable).values({
    districtId,
    serviceTypeId,
    inHouseRate: inHouseRate ? String(inHouseRate) : null,
    contractedRate: contractedRate ? String(contractedRate) : null,
    effectiveDate,
    notes: notes || null,
  }).onConflictDoUpdate({
    target: [serviceRateConfigsTable.districtId, serviceRateConfigsTable.serviceTypeId, serviceRateConfigsTable.effectiveDate],
    set: {
      inHouseRate: inHouseRate ? String(inHouseRate) : null,
      contractedRate: contractedRate ? String(contractedRate) : null,
      notes: notes || null,
    },
  }).returning();

  res.json(config);
});

router.delete("/compensatory-finance/rates/:id", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) { res.status(403).json({ error: "District context required" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select({ districtId: serviceRateConfigsTable.districtId })
    .from(serviceRateConfigsTable).where(eq(serviceRateConfigsTable.id, id));

  if (!existing || existing.districtId !== districtId) {
    res.status(404).json({ error: "Rate config not found" });
    return;
  }

  await db.delete(serviceRateConfigsTable).where(eq(serviceRateConfigsTable.id, id));
  res.json({ success: true });
});

export default router;
