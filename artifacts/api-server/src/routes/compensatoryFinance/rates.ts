import { Router } from "express";
import { db } from "@workspace/db";
import { serviceRateConfigsTable, serviceTypesTable } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { getDistrictId } from "./shared";

// tenant-scope: district-join
const router = Router();

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

  const [config] = await db.insert(serviceRateConfigsTable).values({
    districtId,
    serviceTypeId,
    inHouseRate: inHouseRate != null ? String(inHouseRate) : null,
    contractedRate: contractedRate != null ? String(contractedRate) : null,
    effectiveDate,
    notes: notes || null,
  }).onConflictDoUpdate({
    target: [serviceRateConfigsTable.districtId, serviceRateConfigsTable.serviceTypeId, serviceRateConfigsTable.effectiveDate],
    set: {
      inHouseRate: inHouseRate != null ? String(inHouseRate) : null,
      contractedRate: contractedRate != null ? String(contractedRate) : null,
      notes: notes || null,
    },
  }).returning();

  res.json(config);
});

router.post("/compensatory-finance/rates/import", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
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

  const inserts = validated.map(v => ({
    districtId,
    serviceTypeId: v.serviceTypeId,
    inHouseRate: v.inHouseRate,
    contractedRate: null as string | null,
    effectiveDate,
    notes: "Imported from CSV" as string | null,
  }));

  await db.insert(serviceRateConfigsTable).values(inserts).onConflictDoUpdate({
    target: [serviceRateConfigsTable.districtId, serviceRateConfigsTable.serviceTypeId, serviceRateConfigsTable.effectiveDate],
    set: {
      inHouseRate: sql`excluded.in_house_rate`,
      notes: sql`excluded.notes`,
    },
  });

  res.json({ imported: validated.length });
});

router.delete("/compensatory-finance/rates/:id", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
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
