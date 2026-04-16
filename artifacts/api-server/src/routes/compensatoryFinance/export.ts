import { Router } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, schoolsTable, serviceRequirementsTable, serviceTypesTable,
  compensatoryObligationsTable, staffTable,
} from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { getDistrictId, getContractedProviderIds, getRateMap, minutesToDollars, resolveRate } from "./shared";

const router = Router();

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

export default router;
