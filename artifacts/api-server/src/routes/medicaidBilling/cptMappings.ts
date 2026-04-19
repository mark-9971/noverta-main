import { Router, type IRouter } from "express";
import { db, cptCodeMappingsTable, serviceTypesTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import { requireRoles, type AuthedRequest } from "../../middlewares/auth";
import { getPublicMeta } from "../../lib/clerkClaims";
import { getDistrictId } from "./shared";

// Default CPT mapping rates by service-type name. Mirrors the seed module so
// new districts get sensible starting numbers when an admin clicks "Seed
// defaults" on the CPT Mappings tab.
const DEFAULT_RATES_BY_NAME: Record<string, { unit: number; rate: string; mod?: string }> = {
  "ABA Therapy":              { unit: 15, rate: "18.00" },
  "BCBA Consultation":        { unit: 15, rate: "21.25" },
  "Speech-Language Therapy":  { unit: 30, rate: "34.00" },
  "Occupational Therapy":     { unit: 15, rate: "16.25" },
  "Physical Therapy":         { unit: 15, rate: "17.50" },
  "Counseling":               { unit: 60, rate: "55.00" },
};
const DEFAULT_RATES_BY_CATEGORY: Record<string, { unit: number; rate: string }> = {
  aba:        { unit: 15, rate: "18.00" },
  speech:     { unit: 30, rate: "34.00" },
  ot:         { unit: 15, rate: "16.25" },
  pt:         { unit: 15, rate: "17.50" },
  counseling: { unit: 60, rate: "55.00" },
};

// tenant-scope: district-join
const router: IRouter = Router();

router.get("/medicaid/cpt-mappings", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
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

// Seed common Medicaid CPT mappings for the caller's district. Idempotent:
// service types already mapped in this district are skipped, so the action is
// safe to re-run after partial setup. Only district-/platform-admins can
// trigger it.
router.post("/medicaid/cpt-mappings/seed-defaults", requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }
  const allServiceTypes = await db.select().from(serviceTypesTable);
  const existing = await db
    .select({ stId: cptCodeMappingsTable.serviceTypeId })
    .from(cptCodeMappingsTable)
    .where(eq(cptCodeMappingsTable.districtId, districtId));
  const existingIds = new Set(existing.map(e => e.stId));

  const toInsert = [];
  for (const st of allServiceTypes) {
    if (!st.cptCode) continue;
    if (existingIds.has(st.id)) continue;
    const cfg = DEFAULT_RATES_BY_NAME[st.name] ?? DEFAULT_RATES_BY_CATEGORY[st.category] ?? { unit: 15, rate: "20.00" };
    toInsert.push({
      districtId,
      serviceTypeId: st.id,
      cptCode: st.cptCode,
      modifier: null,
      description: `${st.name} — ${st.cptCode}`,
      unitDurationMinutes: cfg.unit,
      ratePerUnit: cfg.rate,
      placeOfService: "03",
    });
  }

  let insertedCount = 0;
  if (toInsert.length > 0) {
    const inserted = await db.insert(cptCodeMappingsTable).values(toInsert).returning();
    insertedCount = inserted.length;
  }
  const skippedExisting = existingIds.size;
  logAudit(req, {
    action: "create",
    targetTable: "cpt_code_mappings",
    summary: `Seeded ${insertedCount} default CPT mapping(s) for district #${districtId}`,
    newValues: { source: "defaults", inserted: insertedCount, skippedExisting } as Record<string, unknown>,
  });
  res.status(201).json({ inserted: insertedCount, skippedExisting });
});

// Copy CPT mappings from another district that the caller can access.
// Platform admins may copy from any district; non-platform admins are limited
// to their own district context (so in practice this is mainly used by
// platform admins onboarding a fresh district from a known-good template).
router.post("/medicaid/cpt-mappings/copy-from/:sourceDistrictId", requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  const destDistrictId = getDistrictId(req as unknown as AuthedRequest);
  if (!destDistrictId) {
    res.status(403).json({ error: "District context required" });
    return;
  }
  const sourceDistrictId = Number(req.params.sourceDistrictId);
  if (!sourceDistrictId || Number.isNaN(sourceDistrictId)) {
    res.status(400).json({ error: "Invalid source district id" });
    return;
  }
  if (sourceDistrictId === destDistrictId) {
    res.status(400).json({ error: "Source and destination districts must differ" });
    return;
  }
  const meta = getPublicMeta(req);
  const canAccessSource = meta.platformAdmin === true || meta.districtId === sourceDistrictId;
  if (!canAccessSource) {
    res.status(403).json({ error: "No access to source district" });
    return;
  }

  const source = await db
    .select()
    .from(cptCodeMappingsTable)
    .where(eq(cptCodeMappingsTable.districtId, sourceDistrictId));
  if (source.length === 0) {
    res.status(400).json({ error: "Source district has no CPT mappings to copy" });
    return;
  }
  const existing = await db
    .select({ stId: cptCodeMappingsTable.serviceTypeId, code: cptCodeMappingsTable.cptCode })
    .from(cptCodeMappingsTable)
    .where(eq(cptCodeMappingsTable.districtId, destDistrictId));
  const existingKeys = new Set(existing.map(e => `${e.stId}:${e.code}`));

  const toInsert = source
    .filter(s => !existingKeys.has(`${s.serviceTypeId}:${s.cptCode}`))
    .map(s => ({
      districtId: destDistrictId,
      serviceTypeId: s.serviceTypeId,
      cptCode: s.cptCode,
      modifier: s.modifier,
      description: s.description,
      minDurationMinutes: s.minDurationMinutes,
      maxDurationMinutes: s.maxDurationMinutes,
      unitDurationMinutes: s.unitDurationMinutes,
      ratePerUnit: s.ratePerUnit,
      placeOfService: s.placeOfService,
    }));

  let copiedCount = 0;
  if (toInsert.length > 0) {
    const inserted = await db.insert(cptCodeMappingsTable).values(toInsert).returning();
    copiedCount = inserted.length;
  }
  const skippedDuplicates = source.length - copiedCount;
  logAudit(req, {
    action: "create",
    targetTable: "cpt_code_mappings",
    summary: `Copied ${copiedCount} CPT mapping(s) from district #${sourceDistrictId} to district #${destDistrictId}`,
    newValues: { source: "district", sourceDistrictId, copied: copiedCount, skippedDuplicates } as Record<string, unknown>,
  });
  res.status(201).json({ copied: copiedCount, skippedDuplicates });
});

router.post("/medicaid/cpt-mappings", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
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
  const districtId = getDistrictId(req as unknown as AuthedRequest);
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
  const districtId = getDistrictId(req as unknown as AuthedRequest);
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
