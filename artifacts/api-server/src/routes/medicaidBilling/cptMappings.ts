import { Router, type IRouter } from "express";
import { db, cptCodeMappingsTable, serviceTypesTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import type { AuthedRequest } from "../../middlewares/auth";
import { getDistrictId } from "./shared";

const router: IRouter = Router();

router.get("/medicaid/cpt-mappings", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }
  const mappings = await db
    .select({
      id: cptCodeMappingsTable.id,
      districtId: cptCodeMappingsTable.districtId,
      serviceTypeId: cptCodeMappingsTable.serviceTypeId,
      serviceTypeName: serviceTypesTable.name,
      serviceCategory: serviceTypesTable.category,
      cptCode: cptCodeMappingsTable.cptCode,
      modifier: cptCodeMappingsTable.modifier,
      description: cptCodeMappingsTable.description,
      minDurationMinutes: cptCodeMappingsTable.minDurationMinutes,
      maxDurationMinutes: cptCodeMappingsTable.maxDurationMinutes,
      unitDurationMinutes: cptCodeMappingsTable.unitDurationMinutes,
      ratePerUnit: cptCodeMappingsTable.ratePerUnit,
      placeOfService: cptCodeMappingsTable.placeOfService,
      isActive: cptCodeMappingsTable.isActive,
    })
    .from(cptCodeMappingsTable)
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, cptCodeMappingsTable.serviceTypeId))
    .where(eq(cptCodeMappingsTable.districtId, districtId))
    .orderBy(asc(serviceTypesTable.name), asc(cptCodeMappingsTable.cptCode));
  res.json(mappings);
});

router.post("/medicaid/cpt-mappings", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }
  const { serviceTypeId, cptCode, modifier, description, minDurationMinutes, maxDurationMinutes, unitDurationMinutes, ratePerUnit, placeOfService } = req.body;
  if (!serviceTypeId || !cptCode || !ratePerUnit) {
    res.status(400).json({ error: "serviceTypeId, cptCode, and ratePerUnit are required" });
    return;
  }
  const [mapping] = await db.insert(cptCodeMappingsTable).values({
    districtId,
    serviceTypeId: Number(serviceTypeId),
    cptCode,
    modifier: modifier || null,
    description: description || null,
    minDurationMinutes: minDurationMinutes ? Number(minDurationMinutes) : null,
    maxDurationMinutes: maxDurationMinutes ? Number(maxDurationMinutes) : null,
    unitDurationMinutes: unitDurationMinutes ? Number(unitDurationMinutes) : 15,
    ratePerUnit: String(ratePerUnit),
    placeOfService: placeOfService || "03",
  }).returning();
  logAudit(req, {
    action: "create",
    targetTable: "cpt_code_mappings",
    targetId: mapping.id,
    summary: `Created CPT mapping ${cptCode} for service type #${serviceTypeId}`,
    newValues: { cptCode, ratePerUnit, serviceTypeId } as Record<string, unknown>,
  });
  res.status(201).json(mapping);
});

router.put("/medicaid/cpt-mappings/:id", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }
  const id = Number(req.params.id);
  const { cptCode, modifier, description, minDurationMinutes, maxDurationMinutes, unitDurationMinutes, ratePerUnit, placeOfService, isActive } = req.body;
  const updates: Record<string, any> = {};
  if (cptCode !== undefined) updates.cptCode = cptCode;
  if (modifier !== undefined) updates.modifier = modifier || null;
  if (description !== undefined) updates.description = description || null;
  if (minDurationMinutes !== undefined) updates.minDurationMinutes = minDurationMinutes ? Number(minDurationMinutes) : null;
  if (maxDurationMinutes !== undefined) updates.maxDurationMinutes = maxDurationMinutes ? Number(maxDurationMinutes) : null;
  if (unitDurationMinutes !== undefined) updates.unitDurationMinutes = Number(unitDurationMinutes);
  if (ratePerUnit !== undefined) updates.ratePerUnit = String(ratePerUnit);
  if (placeOfService !== undefined) updates.placeOfService = placeOfService;
  if (isActive !== undefined) updates.isActive = String(isActive);
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  const [updated] = await db.update(cptCodeMappingsTable).set(updates).where(and(eq(cptCodeMappingsTable.id, id), eq(cptCodeMappingsTable.districtId, districtId))).returning();
  if (!updated) {
    res.status(404).json({ error: "Mapping not found" });
    return;
  }
  logAudit(req, {
    action: "update",
    targetTable: "cpt_code_mappings",
    targetId: id,
    summary: `Updated CPT mapping #${id}`,
    newValues: updates as Record<string, unknown>,
  });
  res.json(updated);
});

router.delete("/medicaid/cpt-mappings/:id", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }
  const id = Number(req.params.id);
  const [deleted] = await db.delete(cptCodeMappingsTable).where(and(eq(cptCodeMappingsTable.id, id), eq(cptCodeMappingsTable.districtId, districtId))).returning();
  if (!deleted) {
    res.status(404).json({ error: "Mapping not found" });
    return;
  }
  logAudit(req, {
    action: "delete",
    targetTable: "cpt_code_mappings",
    targetId: id,
    summary: `Deleted CPT mapping #${id} (${deleted.cptCode})`,
  });
  res.json({ success: true });
});

export default router;
