import { Router } from "express";
import { db } from "@workspace/db";
import { serviceRateConfigsTable, serviceTypesTable, schoolsTable, programsTable } from "@workspace/db/schema";
import { eq, desc, sql, and, isNull } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { getDistrictId } from "./shared";

// tenant-scope: district-join
const router = Router();

router.get("/compensatory-finance/rates", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
  if (!districtId) { res.status(403).json({ error: "District context required" }); return; }

  const configs = await db.select({
    id: serviceRateConfigsTable.id,
    serviceTypeId: serviceRateConfigsTable.serviceTypeId,
    schoolId: serviceRateConfigsTable.schoolId,
    programId: serviceRateConfigsTable.programId,
    inHouseRate: serviceRateConfigsTable.inHouseRate,
    contractedRate: serviceRateConfigsTable.contractedRate,
    effectiveDate: serviceRateConfigsTable.effectiveDate,
    notes: serviceRateConfigsTable.notes,
  }).from(serviceRateConfigsTable).where(
    eq(serviceRateConfigsTable.districtId, districtId),
  ).orderBy(desc(serviceRateConfigsTable.effectiveDate));

  const [serviceTypes, schools, programs] = await Promise.all([
    db.select({ id: serviceTypesTable.id, name: serviceTypesTable.name, defaultBillingRate: serviceTypesTable.defaultBillingRate })
      .from(serviceTypesTable),
    db.select({ id: schoolsTable.id, name: schoolsTable.name })
      .from(schoolsTable)
      .where(and(eq(schoolsTable.districtId, districtId), isNull(schoolsTable.deletedAt))),
    db.select({ id: programsTable.id, name: programsTable.name, schoolId: programsTable.schoolId })
      .from(programsTable)
      .innerJoin(schoolsTable, eq(programsTable.schoolId, schoolsTable.id))
      .where(eq(schoolsTable.districtId, districtId)),
  ]);
  const svcTypeMap = new Map(serviceTypes.map(t => [t.id, t]));
  const schoolMap = new Map(schools.map(s => [s.id, s.name]));
  const programMap = new Map(programs.map(p => [p.id, p.name]));

  const result = configs.map(c => ({
    ...c,
    serviceTypeName: svcTypeMap.get(c.serviceTypeId)?.name || "Unknown",
    defaultRate: svcTypeMap.get(c.serviceTypeId)?.defaultBillingRate || null,
    schoolName: c.schoolId != null ? schoolMap.get(c.schoolId) ?? null : null,
    programName: c.programId != null ? programMap.get(c.programId) ?? null : null,
  }));

  res.json({
    configs: result,
    serviceTypes: serviceTypes.map(t => ({ id: t.id, name: t.name, defaultBillingRate: t.defaultBillingRate })),
    schools,
    programs,
  });
});

router.post("/compensatory-finance/rates", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
  if (!districtId) { res.status(403).json({ error: "District context required" }); return; }

  const { serviceTypeId, schoolId, programId, inHouseRate, contractedRate, effectiveDate, notes } = req.body;
  if (!serviceTypeId || !effectiveDate) {
    res.status(400).json({ error: "serviceTypeId and effectiveDate are required" });
    return;
  }
  if (typeof serviceTypeId !== "number" || serviceTypeId <= 0) {
    res.status(400).json({ error: "serviceTypeId must be a positive integer" });
    return;
  }
  if (schoolId !== undefined && schoolId !== null && (typeof schoolId !== "number" || schoolId <= 0)) {
    res.status(400).json({ error: "schoolId must be a positive integer" });
    return;
  }
  if (programId !== undefined && programId !== null && (typeof programId !== "number" || programId <= 0)) {
    res.status(400).json({ error: "programId must be a positive integer" });
    return;
  }
  if (schoolId != null && programId != null) {
    res.status(400).json({ error: "Specify either schoolId or programId, not both" });
    return;
  }
  if (inHouseRate !== undefined && inHouseRate !== null && (isNaN(Number(inHouseRate)) || Number(inHouseRate) <= 0)) {
    res.status(400).json({ error: "inHouseRate must be a positive number greater than zero" });
    return;
  }
  if (contractedRate !== undefined && contractedRate !== null && (isNaN(Number(contractedRate)) || Number(contractedRate) <= 0)) {
    res.status(400).json({ error: "contractedRate must be a positive number greater than zero" });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    res.status(400).json({ error: "effectiveDate must be YYYY-MM-DD format" });
    return;
  }

  // Verify school/program belong to this district.
  if (schoolId != null) {
    const [school] = await db.select({ id: schoolsTable.id })
      .from(schoolsTable)
      .where(and(eq(schoolsTable.id, schoolId), eq(schoolsTable.districtId, districtId)));
    if (!school) {
      res.status(400).json({ error: "schoolId does not belong to this district" });
      return;
    }
  }
  if (programId != null) {
    const [program] = await db.select({ id: programsTable.id })
      .from(programsTable)
      .innerJoin(schoolsTable, eq(programsTable.schoolId, schoolsTable.id))
      .where(and(eq(programsTable.id, programId), eq(schoolsTable.districtId, districtId)));
    if (!program) {
      res.status(400).json({ error: "programId does not belong to this district" });
      return;
    }
  }

  // Manual upsert: the partial-unique indexes mean onConflictDoUpdate can't pick a single
  // target across the three scopes. Look up the existing matching row and update or insert.
  const scopeWhere = and(
    eq(serviceRateConfigsTable.districtId, districtId),
    eq(serviceRateConfigsTable.serviceTypeId, serviceTypeId),
    eq(serviceRateConfigsTable.effectiveDate, effectiveDate),
    schoolId != null
      ? eq(serviceRateConfigsTable.schoolId, schoolId)
      : isNull(serviceRateConfigsTable.schoolId),
    programId != null
      ? eq(serviceRateConfigsTable.programId, programId)
      : isNull(serviceRateConfigsTable.programId),
  );

  const [existing] = await db.select({ id: serviceRateConfigsTable.id })
    .from(serviceRateConfigsTable)
    .where(scopeWhere);

  let config;
  if (existing) {
    [config] = await db.update(serviceRateConfigsTable).set({
      inHouseRate: inHouseRate != null ? String(inHouseRate) : null,
      contractedRate: contractedRate != null ? String(contractedRate) : null,
      notes: notes || null,
    }).where(eq(serviceRateConfigsTable.id, existing.id)).returning();
  } else {
    [config] = await db.insert(serviceRateConfigsTable).values({
      districtId,
      serviceTypeId,
      schoolId: schoolId ?? null,
      programId: programId ?? null,
      inHouseRate: inHouseRate != null ? String(inHouseRate) : null,
      contractedRate: contractedRate != null ? String(contractedRate) : null,
      effectiveDate,
      notes: notes || null,
    }).returning();
  }

  res.json(config);
});

router.post("/compensatory-finance/rates/import", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
  if (!districtId) { res.status(403).json({ error: "District context required" }); return; }

  const { rows, effectiveDate } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "rows must be a non-empty array" });
    return;
  }
  if (!effectiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    res.status(400).json({ error: "effectiveDate must be YYYY-MM-DD format" });
    return;
  }

  const byServiceTypeId = new Map<number, string>();
  for (const row of rows) {
    const stId = Number(row.serviceTypeId);
    const rate = Number(row.inHouseRate);
    if (!Number.isInteger(stId) || stId <= 0) {
      res.status(400).json({ error: `Invalid serviceTypeId: ${row.serviceTypeId}` });
      return;
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      res.status(400).json({ error: `Invalid inHouseRate: ${row.inHouseRate}` });
      return;
    }
    byServiceTypeId.set(stId, rate.toFixed(2));
  }

  const validated = Array.from(byServiceTypeId.entries()).map(([serviceTypeId, inHouseRate]) => ({ serviceTypeId, inHouseRate }));

  const submittedIds = validated.map(v => v.serviceTypeId);
  const existingTypes = await db.select({ id: serviceTypesTable.id })
    .from(serviceTypesTable)
    .where(sql`${serviceTypesTable.id} = ANY(ARRAY[${sql.join(submittedIds.map(id => sql`${id}`), sql`, `)}]::int[])`);
  const existingIdSet = new Set(existingTypes.map(t => t.id));
  const missingIds = submittedIds.filter(id => !existingIdSet.has(id));
  if (missingIds.length > 0) {
    res.status(400).json({ error: `Unknown serviceTypeId(s): ${missingIds.join(", ")}` });
    return;
  }

  // CSV import only sets district-wide rates (school_id IS NULL AND program_id IS NULL),
  // so it can keep using onConflictDoUpdate against the district-scoped partial unique index.
  const inserts = validated.map(v => ({
    districtId,
    serviceTypeId: v.serviceTypeId,
    schoolId: null as number | null,
    programId: null as number | null,
    inHouseRate: v.inHouseRate,
    contractedRate: null as string | null,
    effectiveDate,
    notes: "Imported from CSV" as string | null,
  }));

  await db.insert(serviceRateConfigsTable).values(inserts).onConflictDoUpdate({
    target: [serviceRateConfigsTable.districtId, serviceRateConfigsTable.serviceTypeId, serviceRateConfigsTable.effectiveDate],
    targetWhere: sql`school_id IS NULL AND program_id IS NULL`,
    set: {
      inHouseRate: sql`excluded.in_house_rate`,
      notes: sql`excluded.notes`,
    },
  });

  res.json({ imported: validated.length });
});

router.delete("/compensatory-finance/rates/:id", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as unknown as AuthedRequest);
  if (!districtId) { res.status(403).json({ error: "District context required" }); return; }

  const id = parseInt(req.params.id as string, 10);
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
