import { Router } from "express";
import { db } from "@workspace/db";
import { serviceRateConfigsTable, serviceTypesTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
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
