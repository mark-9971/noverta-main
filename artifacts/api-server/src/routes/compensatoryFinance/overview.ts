// tenant-scope: district-join
import { Router } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, schoolsTable, serviceRequirementsTable, serviceTypesTable,
  compensatoryObligationsTable, staffTable,
} from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { getDistrictId, getContractedProviderIds, getRateMap, minutesToDollars, resolveRate, summarizeRateConfig } from "./shared";

const router = Router();

router.get("/compensatory-finance/overview", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
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
    const emptyRateMap = await getRateMap(districtId);
    res.json({
      totalMinutesOwed: 0, totalMinutesDelivered: 0, totalDollarsOwed: 0,
      totalDollarsDelivered: 0, studentsAffected: 0,
      obligationCount: 0, pendingCount: 0, inProgressCount: 0, completedCount: 0,
      byServiceType: [], bySchool: [], byProvider: [],
      rateConfig: { ...summarizeRateConfig(emptyRateMap), unpricedMinutesOwed: 0, unpricedMinutesDelivered: 0 },
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
  let unpricedMinutesOwed = 0;
  let unpricedMinutesDelivered = 0;
  const affectedStudents = new Set<number>();
  const byServiceType: Record<number, { name: string; minutesOwed: number; minutesDelivered: number; dollarsOwed: number; dollarsDelivered: number; rateConfigured: boolean; count: number }> = {};
  const bySchool: Record<number, { name: string; minutesOwed: number; dollarsOwed: number; unpricedMinutes: number; count: number }> = {};
  const byProvider: Record<number, { name: string; minutesOwed: number; dollarsOwed: number; unpricedMinutes: number; count: number }> = {};

  for (const ob of obligations) {
    const svcReq = ob.serviceRequirementId ? svcReqMap.get(ob.serviceRequirementId) : null;
    const serviceTypeId = svcReq?.serviceTypeId || 0;
    const isContracted = svcReq?.providerId ? contractedProviders.has(svcReq.providerId) : false;
    const rate = resolveRate(rateMap, serviceTypeId, isContracted);

    const owedDollars = minutesToDollars(ob.minutesOwed, rate);
    const deliveredDollars = minutesToDollars(ob.minutesDelivered, rate);
    const priced = owedDollars != null;

    totalMinutesOwed += ob.minutesOwed;
    totalMinutesDelivered += ob.minutesDelivered;
    if (priced) {
      totalDollarsOwed += owedDollars;
      totalDollarsDelivered += deliveredDollars ?? 0;
    } else {
      unpricedMinutesOwed += ob.minutesOwed;
      unpricedMinutesDelivered += ob.minutesDelivered;
    }
    affectedStudents.add(ob.studentId);

    if (serviceTypeId > 0) {
      if (!byServiceType[serviceTypeId]) {
        byServiceType[serviceTypeId] = { name: svcTypeNameMap.get(serviceTypeId) || "Unknown", minutesOwed: 0, minutesDelivered: 0, dollarsOwed: 0, dollarsDelivered: 0, rateConfigured: priced, count: 0 };
      }
      byServiceType[serviceTypeId].minutesOwed += ob.minutesOwed;
      byServiceType[serviceTypeId].minutesDelivered += ob.minutesDelivered;
      if (priced) {
        byServiceType[serviceTypeId].dollarsOwed += owedDollars;
        byServiceType[serviceTypeId].dollarsDelivered += deliveredDollars ?? 0;
      } else {
        byServiceType[serviceTypeId].rateConfigured = false;
      }
      byServiceType[serviceTypeId].count++;
    }

    const schoolId = studentSchoolMap.get(ob.studentId);
    if (schoolId) {
      if (!bySchool[schoolId]) {
        bySchool[schoolId] = { name: schoolNameMap.get(schoolId) || "Unknown", minutesOwed: 0, dollarsOwed: 0, unpricedMinutes: 0, count: 0 };
      }
      bySchool[schoolId].minutesOwed += ob.minutesOwed;
      if (priced) bySchool[schoolId].dollarsOwed += owedDollars;
      else bySchool[schoolId].unpricedMinutes += ob.minutesOwed;
      bySchool[schoolId].count++;
    }

    const providerId = svcReq?.providerId;
    if (providerId) {
      if (!byProvider[providerId]) {
        byProvider[providerId] = { name: providerNameMap.get(providerId) || "Unknown", minutesOwed: 0, dollarsOwed: 0, unpricedMinutes: 0, count: 0 };
      }
      byProvider[providerId].minutesOwed += ob.minutesOwed;
      if (priced) byProvider[providerId].dollarsOwed += owedDollars;
      else byProvider[providerId].unpricedMinutes += ob.minutesOwed;
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
    byServiceType: Object.entries(byServiceType).map(([id, v]) => ({
      serviceTypeId: Number(id),
      name: v.name,
      minutesOwed: v.minutesOwed,
      minutesDelivered: v.minutesDelivered,
      dollarsOwed: v.rateConfigured ? Math.round(v.dollarsOwed * 100) / 100 : null,
      dollarsDelivered: v.rateConfigured ? Math.round(v.dollarsDelivered * 100) / 100 : null,
      rateConfigured: v.rateConfigured,
      count: v.count,
    })).sort((a, b) => (b.dollarsOwed ?? -1) - (a.dollarsOwed ?? -1)),
    bySchool: Object.entries(bySchool).map(([id, v]) => ({ schoolId: Number(id), ...v, dollarsOwed: Math.round(v.dollarsOwed * 100) / 100 })).sort((a, b) => b.dollarsOwed - a.dollarsOwed),
    byProvider: Object.entries(byProvider).map(([id, v]) => ({ providerId: Number(id), ...v, dollarsOwed: Math.round(v.dollarsOwed * 100) / 100 })).sort((a, b) => b.dollarsOwed - a.dollarsOwed),
    rateConfig: {
      ...summarizeRateConfig(rateMap),
      unpricedMinutesOwed,
      unpricedMinutesDelivered,
    },
  });
});

export default router;
