import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { serviceTypesTable, serviceRequirementsTable, staffTable, studentsTable } from "@workspace/db";
import {
  CreateServiceTypeBody,
  UpdateServiceTypeParams,
  UpdateServiceTypeBody,
  ListServiceRequirementsQueryParams,
  CreateServiceRequirementBody,
  GetServiceRequirementParams,
  UpdateServiceRequirementParams,
  UpdateServiceRequirementBody,
  DeleteServiceRequirementParams,
  SupersedeServiceRequirementParams,
  SupersedeServiceRequirementBody,
} from "@workspace/api-zod";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { requireRoles, getEnforcedDistrictId, type AuthedRequest } from "../middlewares/auth";
import { ensureStaffAssignment } from "../lib/ensureStaffAssignment";
import { logAudit } from "../lib/auditLog";
import {
  assertNoCreditedSessions,
  materialFieldsChanging,
} from "../lib/serviceRequirementGuards";

const requireServiceAdmin = requireRoles("admin", "coordinator", "case_manager");

const router: IRouter = Router();

/**
 * Confirms the given student belongs to the caller's enforced district.
 * Returns true if access is allowed (platform admin or matching district).
 */
async function studentInCallerDistrict(req: AuthedRequest, studentId: number): Promise<boolean> {
  const enforcedDid = getEnforcedDistrictId(req);
  if (enforcedDid == null) return true; // platform admin
  const result = await db.execute(
    sql`SELECT 1 FROM students s JOIN schools sch ON sch.id = s.school_id
        WHERE s.id = ${studentId} AND sch.district_id = ${enforcedDid} LIMIT 1`,
  );
  return result.rows.length > 0;
}

router.get("/service-types", async (req, res): Promise<void> => {
  const types = await db.select().from(serviceTypesTable).orderBy(serviceTypesTable.name);
  res.json(types.map(t => ({ ...t, createdAt: t.createdAt.toISOString() })));
});

router.post("/service-types", requireServiceAdmin, async (req, res): Promise<void> => {
  const parsed = CreateServiceTypeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [type] = await db.insert(serviceTypesTable).values(parsed.data).returning();
  res.status(201).json({ ...type, createdAt: type.createdAt.toISOString() });
});

// Platform-admin-only endpoint: edits the global service type catalog row.
// District admins should configure per-district rates via POST /compensatory-finance/rates.
router.patch("/service-types/:id", requireServiceAdmin, async (req, res): Promise<void> => {
  // Only platform admins (no enforced district) may edit global service type rows.
  const enforcedDid = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (enforcedDid != null) {
    res.status(403).json({
      error: "District admins cannot edit global service types. Use POST /api/compensatory-finance/rates to configure district-specific billing rates.",
    });
    return;
  }

  const params = UpdateServiceTypeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateServiceTypeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Partial<typeof serviceTypesTable.$inferInsert> = {};
  if (parsed.data.name != null) updateData.name = parsed.data.name;
  if (parsed.data.category != null) updateData.category = parsed.data.category;
  if (parsed.data.color !== undefined) updateData.color = parsed.data.color ?? null;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description ?? null;
  if (parsed.data.defaultIntervalType !== undefined) updateData.defaultIntervalType = parsed.data.defaultIntervalType ?? null;
  if (parsed.data.cptCode !== undefined) updateData.cptCode = parsed.data.cptCode ?? null;
  if (parsed.data.defaultBillingRate !== undefined) {
    const rate = parsed.data.defaultBillingRate;
    if (rate !== null) {
      const parsed2 = parseFloat(rate);
      if (!Number.isFinite(parsed2) || parsed2 <= 0) {
        res.status(400).json({ error: "defaultBillingRate must be a positive number" });
        return;
      }
    }
    updateData.defaultBillingRate = rate;
  }

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [type] = await db.update(serviceTypesTable).set(updateData).where(eq(serviceTypesTable.id, params.data.id)).returning();
  if (!type) {
    res.status(404).json({ error: "Service type not found" });
    return;
  }
  res.json({ ...type, createdAt: type.createdAt.toISOString() });
});

// DEPRECATED(batch-1): this list endpoint returns raw rows filtered by
// `active=true|false` only — it does not honor the supersede chain. Add
// `?asOfDate=` and `?range=` modes that delegate to
// `getActiveRequirements` from `lib/domain-service-delivery` per
// docs/architecture/active-requirements.md (target: Batch 2). Preserve
// the raw-list mode for backward compat until the UI is updated.
router.get("/service-requirements", async (req, res): Promise<void> => {
  const params = ListServiceRequirementsQueryParams.safeParse(req.query);
  const conditions: any[] = [];
  if (params.success) {
    if (params.data.studentId) conditions.push(eq(serviceRequirementsTable.studentId, Number(params.data.studentId)));
    if (params.data.serviceTypeId) conditions.push(eq(serviceRequirementsTable.serviceTypeId, Number(params.data.serviceTypeId)));
    if (params.data.providerId) conditions.push(eq(serviceRequirementsTable.providerId, Number(params.data.providerId)));
    if (params.data.active === "true") conditions.push(eq(serviceRequirementsTable.active, true));
    else if (params.data.active === "false") conditions.push(eq(serviceRequirementsTable.active, false));
  }
  // District scope: limit to requirements whose student belongs to caller's district.
  const enforcedDid = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (enforcedDid != null) {
    conditions.push(sql`${serviceRequirementsTable.studentId} IN (
      SELECT s.id FROM students s JOIN schools sch ON sch.id = s.school_id
      WHERE sch.district_id = ${enforcedDid}
    )`);
  }

  const reqs = await db
    .select({
      id: serviceRequirementsTable.id,
      studentId: serviceRequirementsTable.studentId,
      serviceTypeId: serviceRequirementsTable.serviceTypeId,
      providerId: serviceRequirementsTable.providerId,
      deliveryType: serviceRequirementsTable.deliveryType,
      requiredMinutes: serviceRequirementsTable.requiredMinutes,
      intervalType: serviceRequirementsTable.intervalType,
      startDate: serviceRequirementsTable.startDate,
      endDate: serviceRequirementsTable.endDate,
      priority: serviceRequirementsTable.priority,
      notes: serviceRequirementsTable.notes,
      active: serviceRequirementsTable.active,
      schoolId: serviceRequirementsTable.schoolId,
      deliveryModel: serviceRequirementsTable.deliveryModel,
      supersedesId: serviceRequirementsTable.supersedesId,
      replacedAt: serviceRequirementsTable.replacedAt,
      createdAt: serviceRequirementsTable.createdAt,
      serviceTypeName: serviceTypesTable.name,
      providerFirst: staffTable.firstName,
      providerLast: staffTable.lastName,
    })
    .from(serviceRequirementsTable)
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
    .leftJoin(staffTable, eq(staffTable.id, serviceRequirementsTable.providerId))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  res.json(reqs.map(r => ({
    ...r,
    serviceTypeName: r.serviceTypeName,
    providerName: r.providerFirst ? `${r.providerFirst} ${r.providerLast}` : null,
    replacedAt: r.replacedAt ? r.replacedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/service-requirements", requireServiceAdmin, async (req, res): Promise<void> => {
  const parsed = CreateServiceRequirementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await studentInCallerDistrict(req as unknown as AuthedRequest, Number(parsed.data.studentId)))) {
    res.status(403).json({ error: "Student is not in your district" });
    return;
  }
  const insertValues: typeof serviceRequirementsTable.$inferInsert = {
    studentId: parsed.data.studentId,
    serviceTypeId: parsed.data.serviceTypeId,
    providerId: parsed.data.providerId ?? null,
    deliveryType: parsed.data.deliveryType,
    requiredMinutes: parsed.data.requiredMinutes,
    intervalType: parsed.data.intervalType,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate ?? null,
    priority: parsed.data.priority ?? null,
    notes: parsed.data.notes ?? null,
    active: parsed.data.active,
  };
  // Service Requirement v1 (Batch 1) — accept the new optional fields
  // but do not enforce the supersede guard yet (separate task).
  if (parsed.data.schoolId !== undefined) insertValues.schoolId = parsed.data.schoolId;
  if (parsed.data.deliveryModel !== undefined) insertValues.deliveryModel = parsed.data.deliveryModel;
  if (parsed.data.supersedesId !== undefined) insertValues.supersedesId = parsed.data.supersedesId;
  if (parsed.data.replacedAt !== undefined) insertValues.replacedAt = parsed.data.replacedAt ? new Date(parsed.data.replacedAt) : null;
  const [req2] = await db.insert(serviceRequirementsTable).values(insertValues).returning();
  // Mirror the new requirement's provider into staff_assignments so the
  // student doesn't appear unassigned on the Care Team / Assigned Providers
  // panel. Idempotent — safe if a row already exists from a prior requirement.
  await ensureStaffAssignment({
    staffId: req2.providerId,
    studentId: req2.studentId,
    assignmentType: "service_provider",
    startDate: req2.startDate ?? null,
  });
  res.status(201).json({
    ...req2,
    replacedAt: req2.replacedAt ? req2.replacedAt.toISOString() : null,
    createdAt: req2.createdAt.toISOString(),
  });
});

async function requireServiceRequirementInDistrict(
  req: AuthedRequest, id: number, res: import("express").Response,
): Promise<boolean> {
  const enforcedDid = getEnforcedDistrictId(req);
  if (enforcedDid == null) return true;
  const result = await db.execute(
    sql`SELECT 1 FROM service_requirements sr
        JOIN students s ON s.id = sr.student_id
        JOIN schools sch ON sch.id = s.school_id
        WHERE sr.id = ${id} AND sch.district_id = ${enforcedDid} LIMIT 1`,
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "Not found" });
    return false;
  }
  return true;
}

router.get("/service-requirements/:id", async (req, res): Promise<void> => {
  const params = GetServiceRequirementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!(await requireServiceRequirementInDistrict(req as unknown as AuthedRequest, params.data.id, res))) return;
  const [r] = await db
    .select({
      id: serviceRequirementsTable.id,
      studentId: serviceRequirementsTable.studentId,
      serviceTypeId: serviceRequirementsTable.serviceTypeId,
      providerId: serviceRequirementsTable.providerId,
      deliveryType: serviceRequirementsTable.deliveryType,
      requiredMinutes: serviceRequirementsTable.requiredMinutes,
      intervalType: serviceRequirementsTable.intervalType,
      startDate: serviceRequirementsTable.startDate,
      endDate: serviceRequirementsTable.endDate,
      priority: serviceRequirementsTable.priority,
      notes: serviceRequirementsTable.notes,
      active: serviceRequirementsTable.active,
      schoolId: serviceRequirementsTable.schoolId,
      deliveryModel: serviceRequirementsTable.deliveryModel,
      supersedesId: serviceRequirementsTable.supersedesId,
      replacedAt: serviceRequirementsTable.replacedAt,
      createdAt: serviceRequirementsTable.createdAt,
      serviceTypeName: serviceTypesTable.name,
      providerFirst: staffTable.firstName,
      providerLast: staffTable.lastName,
    })
    .from(serviceRequirementsTable)
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
    .leftJoin(staffTable, eq(staffTable.id, serviceRequirementsTable.providerId))
    .where(eq(serviceRequirementsTable.id, params.data.id));

  if (!r) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({
    ...r,
    serviceTypeName: r.serviceTypeName,
    providerName: r.providerFirst ? `${r.providerFirst} ${r.providerLast}` : null,
    replacedAt: r.replacedAt ? r.replacedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  });
});

router.patch("/service-requirements/:id", requireServiceAdmin, async (req, res): Promise<void> => {
  const params = UpdateServiceRequirementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!(await requireServiceRequirementInDistrict(req as unknown as AuthedRequest, params.data.id, res))) return;
  const parsed = UpdateServiceRequirementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Partial<typeof serviceRequirementsTable.$inferInsert> = {};
  if (parsed.data.providerId !== undefined) updateData.providerId = parsed.data.providerId;
  if (parsed.data.deliveryType != null) updateData.deliveryType = parsed.data.deliveryType;
  if (parsed.data.requiredMinutes != null) updateData.requiredMinutes = parsed.data.requiredMinutes;
  if (parsed.data.intervalType != null) updateData.intervalType = parsed.data.intervalType;
  if (parsed.data.startDate != null) updateData.startDate = parsed.data.startDate;
  if (parsed.data.endDate !== undefined) updateData.endDate = parsed.data.endDate;
  if (parsed.data.priority !== undefined) updateData.priority = parsed.data.priority;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (parsed.data.active != null) updateData.active = parsed.data.active;
  // Service Requirement v1 (Batch 1) — accept the new optional fields.
  if (parsed.data.schoolId !== undefined) updateData.schoolId = parsed.data.schoolId;
  if (parsed.data.deliveryModel !== undefined) updateData.deliveryModel = parsed.data.deliveryModel;
  if (parsed.data.supersedesId !== undefined) updateData.supersedesId = parsed.data.supersedesId;
  if (parsed.data.replacedAt !== undefined) updateData.replacedAt = parsed.data.replacedAt ? new Date(parsed.data.replacedAt) : null;
  // Material fields exposed for parity with the supersede guard contract.
  // Mutating these on a credited row trips the 409 path below.
  if (parsed.data.serviceTypeId !== undefined && parsed.data.serviceTypeId !== null) updateData.serviceTypeId = parsed.data.serviceTypeId;
  if (parsed.data.setting !== undefined) updateData.setting = parsed.data.setting;
  if (parsed.data.groupSize !== undefined) updateData.groupSize = parsed.data.groupSize;

  // Service Requirement v1 (supersede flow): if the row already has any
  // credited session activity AND the patch touches anything outside
  // the explicit allowlist {priority, notes, active=false}, refuse the
  // in-place mutation. The client must re-issue against
  // POST /service-requirements/:id/supersede. The allowlist is enforced
  // by `materialFieldsChanging`, which also blocks silent attempts to
  // tamper with chain metadata (`supersedesId`, `replacedAt`).
  const [existing] = await db
    .select()
    .from(serviceRequirementsTable)
    .where(eq(serviceRequirementsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Feed the guard the raw PARSED request body (not the post-mapping
  // `updateData`), so a hostile or accidental payload like
  // `{ serviceTypeId: null }` on a credited row still trips 409 instead
  // of being silently dropped by the null-guards in updateData mapping.
  const changingMaterial = materialFieldsChanging(
    existing as unknown as Record<string, unknown>,
    parsed.data as Record<string, unknown>,
  );
  if (changingMaterial.length > 0) {
    const credited = await assertNoCreditedSessions(params.data.id);
    if (credited.requiresSupersede) {
      res.status(409).json({
        error:
          "This service requirement has delivered or partial sessions credited to it. Material edits must create a new requirement via the supersede endpoint.",
        code: "REQUIRES_SUPERSEDE",
        requires_supersede: true,
        credited_session_count: credited.count,
      });
      return;
    }
  }

  const [r] = await db.update(serviceRequirementsTable).set(updateData).where(eq(serviceRequirementsTable.id, params.data.id)).returning();
  if (!r) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Reflect any provider change in staff_assignments so the student's Care
  // Team panel stays in sync with who is actually delivering services.
  if (parsed.data.providerId !== undefined) {
    await ensureStaffAssignment({
      staffId: r.providerId,
      studentId: r.studentId,
      assignmentType: "service_provider",
      startDate: r.startDate ?? null,
    });
  }
  res.json({
    ...r,
    replacedAt: r.replacedAt ? r.replacedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  });
});

/**
 * Service Requirement v1 — supersede flow.
 *
 * Creates a NEW row that points back at the old one via `supersedes_id`,
 * end-dates the old row, and writes both records inside a single
 * transaction so the chain never gets half-applied. Use this whenever
 * `PATCH /service-requirements/:id` returns 409 with REQUIRES_SUPERSEDE.
 *
 * Body shape: any subset of CreateServiceRequirementBody fields (the new
 * row's payload), plus an OPTIONAL `supersedeDate` that becomes the new
 * row's startDate AND drives the old row's endDate (supersedeDate − 1d).
 * When omitted, the server defaults supersedeDate to today (UTC).
 * The old row's identity fields (studentId, schoolId) are ALWAYS
 * inherited; serviceTypeId is inherited unless explicitly overridden.
 */
router.post("/service-requirements/:id/supersede", requireServiceAdmin, async (req, res): Promise<void> => {
  const params = SupersedeServiceRequirementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!(await requireServiceRequirementInDistrict(req as unknown as AuthedRequest, params.data.id, res))) return;
  const parsed = SupersedeServiceRequirementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [oldRow] = await db
    .select()
    .from(serviceRequirementsTable)
    .where(eq(serviceRequirementsTable.id, params.data.id));
  if (!oldRow) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Compute period boundaries. The old row ends the day before the new
  // row starts so the chain is contiguous and non-overlapping. When the
  // body omits `supersedeDate` the server defaults it to today (UTC) so
  // a quick "supersede now" call doesn't require the client to format a
  // date — the field is still accepted for explicit (often future)
  // effective dates.
  const supersedeDate = parsed.data.supersedeDate ?? new Date().toISOString().slice(0, 10);
  const supersedeDateObj = new Date(`${supersedeDate}T00:00:00Z`);
  if (Number.isNaN(supersedeDateObj.getTime())) {
    res.status(400).json({ error: "Invalid supersedeDate" });
    return;
  }
  const oldEndObj = new Date(supersedeDateObj.getTime() - 24 * 60 * 60 * 1000);
  const oldEndDate = oldEndObj.toISOString().slice(0, 10);

  // Resolve the new row's columns. Identity fields (studentId, schoolId)
  // are ALWAYS inherited from the old row — the supersede flow rewrites
  // a requirement in place, it does NOT relocate it to another student
  // or school. Anything in the body for those fields is ignored. This
  // closes a cross-district IDOR vector where a caller could otherwise
  // re-target the new row at a foreign student or school.
  const next = parsed.data;
  const newRowValues: typeof serviceRequirementsTable.$inferInsert = {
    studentId: oldRow.studentId,
    serviceTypeId: next.serviceTypeId ?? oldRow.serviceTypeId,
    providerId: next.providerId !== undefined ? next.providerId : oldRow.providerId,
    deliveryType: next.deliveryType ?? oldRow.deliveryType,
    requiredMinutes: next.requiredMinutes ?? oldRow.requiredMinutes,
    intervalType: next.intervalType ?? oldRow.intervalType,
    startDate: supersedeDate,
    endDate: next.endDate !== undefined ? next.endDate : null,
    priority: next.priority !== undefined ? next.priority : oldRow.priority,
    notes: next.notes !== undefined ? next.notes : oldRow.notes,
    active: next.active ?? true,
    schoolId: oldRow.schoolId,
    deliveryModel: next.deliveryModel !== undefined ? next.deliveryModel : oldRow.deliveryModel,
    setting: next.setting !== undefined ? next.setting : oldRow.setting,
    groupSize: next.groupSize !== undefined ? next.groupSize : oldRow.groupSize,
    supersedesId: oldRow.id,
  };

  // Walk the chain root for audit metadata so multi-supersede chains
  // (R1→R2→R3) are still traceable to their origin.
  let chainRootId = oldRow.id;
  let cursor: number | null = oldRow.supersedesId ?? null;
  // Defensive cycle cap: chains should never exceed a few links in
  // practice; bail at 100 to avoid pathological loops.
  let hops = 0;
  while (cursor != null && hops < 100) {
    const [parent] = await db
      .select({ id: serviceRequirementsTable.id, supersedesId: serviceRequirementsTable.supersedesId })
      .from(serviceRequirementsTable)
      .where(eq(serviceRequirementsTable.id, cursor));
    if (!parent) break;
    chainRootId = parent.id;
    cursor = parent.supersedesId ?? null;
    hops += 1;
  }

  const now = new Date();
  const correlationId = randomUUID();

  let result: { oldUpdated: typeof serviceRequirementsTable.$inferSelect; newRow: typeof serviceRequirementsTable.$inferSelect };
  try {
    result = await db.transaction(async (tx) => {
      const [newRow] = await tx
        .insert(serviceRequirementsTable)
        .values(newRowValues)
        .returning();
      const [oldUpdated] = await tx
        .update(serviceRequirementsTable)
        .set({ endDate: oldEndDate, active: false, replacedAt: now })
        .where(eq(serviceRequirementsTable.id, oldRow.id))
        .returning();
      return { oldUpdated, newRow };
    });
  } catch (err) {
    console.error("Supersede transaction failed:", err);
    res.status(500).json({ error: "Failed to supersede service requirement" });
    return;
  }

  // Mirror provider change into staff_assignments — only against the new
  // row, and only when the provider actually changed. Keeping this out
  // of the transaction matches the existing PATCH behavior; the
  // assignment table is an idempotent cache, not a source of truth.
  if ((result.newRow.providerId ?? null) !== (oldRow.providerId ?? null)) {
    await ensureStaffAssignment({
      staffId: result.newRow.providerId,
      studentId: result.newRow.studentId,
      assignmentType: "service_provider",
      startDate: result.newRow.startDate ?? null,
    });
  }

  // Audit: two rows, shared correlation id + chain root for traceability.
  // Field names use the snake_case contract documented in the task spec
  // so downstream queries don't need to know about the in-memory casing.
  const auditMeta = { supersede_chain_root_id: chainRootId, correlation_id: correlationId };
  logAudit(req, {
    action: "update",
    targetTable: "service_requirements",
    targetId: oldRow.id,
    studentId: oldRow.studentId,
    summary: `Superseded service requirement #${oldRow.id} by #${result.newRow.id}`,
    oldValues: oldRow as unknown as Record<string, unknown>,
    newValues: result.oldUpdated as unknown as Record<string, unknown>,
    metadata: auditMeta,
  });
  logAudit(req, {
    action: "create",
    targetTable: "service_requirements",
    targetId: result.newRow.id,
    studentId: result.newRow.studentId,
    summary: `Created service requirement #${result.newRow.id} as supersede of #${oldRow.id}`,
    newValues: result.newRow as unknown as Record<string, unknown>,
    metadata: auditMeta,
  });

  res.status(201).json({
    old: {
      ...result.oldUpdated,
      replacedAt: result.oldUpdated.replacedAt ? result.oldUpdated.replacedAt.toISOString() : null,
      createdAt: result.oldUpdated.createdAt.toISOString(),
    },
    new: {
      ...result.newRow,
      replacedAt: result.newRow.replacedAt ? result.newRow.replacedAt.toISOString() : null,
      createdAt: result.newRow.createdAt.toISOString(),
    },
  });
});

router.delete("/service-requirements/:id", requireServiceAdmin, async (req, res): Promise<void> => {
  const params = DeleteServiceRequirementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!(await requireServiceRequirementInDistrict(req as unknown as AuthedRequest, params.data.id, res))) return;
  await db.delete(serviceRequirementsTable).where(eq(serviceRequirementsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
