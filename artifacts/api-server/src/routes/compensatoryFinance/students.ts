import { Router } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, schoolsTable, serviceRequirementsTable, serviceTypesTable,
  compensatoryObligationsTable,
} from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { getDistrictId, getContractedProviderIds, getRateMap, minutesToDollars, resolveRate } from "./shared";

const router = Router();

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

export default router;
