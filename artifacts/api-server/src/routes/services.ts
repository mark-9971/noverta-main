import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { serviceTypesTable, serviceRequirementsTable, staffTable, studentsTable, auditLogsTable } from "@workspace/db";
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
  GetServiceRequirementChainParams,
} from "@workspace/api-zod";
import { eq, and, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { requireRoles, getEnforcedDistrictId, type AuthedRequest } from "../middlewares/auth";
import { ensureStaffAssignment } from "../lib/ensureStaffAssignment";
import { logAudit } from "../lib/auditLog";
import {
  assertNoCreditedSessions,
  materialFieldsChanging,
} from "../lib/serviceRequirementGuards";
import { getActiveRequirements } from "../lib/domain-service-delivery/activeRequirements";

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

// Service Requirement v1 (Batch 3) — Periodized read.
//   - Default mode (no asOfDate/rangeStart/rangeEnd): raw-list filtered
//     by the legacy params. Each row is decorated with `source` derived
//     from its supersede state so the UI can render history without a
//     second round-trip.
//   - asOfDate=YYYY-MM-DD (requires studentId): returns only the
//     requirements in force on that date, walking the supersede chain.
//   - rangeStart/rangeEnd (requires studentId): returns one row per
//     interval clipped to the range, again chain-aware.
//   See docs/architecture/active-requirements.md.
router.get("/service-requirements", async (req, res): Promise<void> => {
  const params = ListServiceRequirementsQueryParams.safeParse(req.query);
  const conditions: any[] = [];
  let studentIdFilter: number | null = null;
  let serviceTypeIdFilter: number | null = null;
  if (params.success) {
    if (params.data.studentId) {
      studentIdFilter = Number(params.data.studentId);
      conditions.push(eq(serviceRequirementsTable.studentId, studentIdFilter));
    }
    if (params.data.serviceTypeId) {
      serviceTypeIdFilter = Number(params.data.serviceTypeId);
      conditions.push(eq(serviceRequirementsTable.serviceTypeId, serviceTypeIdFilter));
    }
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

  // Periodized mode parsing.
  const asOfDate = typeof req.query.asOfDate === "string" ? req.query.asOfDate : null;
  const rangeStart = typeof req.query.rangeStart === "string" ? req.query.rangeStart : null;
  const rangeEnd = typeof req.query.rangeEnd === "string" ? req.query.rangeEnd : null;
  const periodized = asOfDate != null || rangeStart != null || rangeEnd != null;

  if (periodized) {
    if (studentIdFilter == null) {
      res.status(400).json({ error: "studentId is required when using asOfDate or rangeStart/rangeEnd" });
      return;
    }
    let range: { startDate: string; endDate: string };
    if (asOfDate != null) {
      range = { startDate: asOfDate, endDate: asOfDate };
    } else {
      if (rangeStart == null || rangeEnd == null) {
        res.status(400).json({ error: "rangeStart and rangeEnd must both be provided" });
        return;
      }
      range = { startDate: rangeStart, endDate: rangeEnd };
    }
    // District scope check (helper does not enforce it).
    if (enforcedDid != null && !(await studentInCallerDistrict(req as unknown as AuthedRequest, studentIdFilter))) {
      res.json([]);
      return;
    }
    const intervals = await getActiveRequirements(studentIdFilter, range, {
      serviceTypeId: serviceTypeIdFilter ?? undefined,
    });
    if (intervals.length === 0) {
      res.json([]);
      return;
    }
    // Hydrate the underlying rows with their joins, then project one
    // response item per interval (the same row may appear multiple
    // times if the queried range straddles a chain transition for the
    // same row, but `getActiveRequirements` clips to one interval per
    // chain link so this is at most once per requirementId).
    const reqIds = Array.from(new Set(intervals.map(i => i.requirementId)));
    const rows = await db
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
      .where(inArray(serviceRequirementsTable.id, reqIds));
    const rowById = new Map(rows.map(r => [r.id, r]));
    res.json(intervals.map(iv => {
      const r = rowById.get(iv.requirementId);
      if (!r) return null;
      return {
        ...r,
        // Clipped interval dates so the UI shows only the in-range
        // portion of the requirement (e.g. up to a mid-month
        // supersede).
        startDate: iv.startDate,
        endDate: iv.endDate,
        serviceTypeName: r.serviceTypeName,
        providerName: r.providerFirst ? `${r.providerFirst} ${r.providerLast}` : null,
        replacedAt: r.replacedAt ? r.replacedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        source: iv.source,
      };
    }).filter(Boolean));
    return;
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

  // Decorate each row with `source` so even legacy raw-list callers
  // can distinguish the live tail from a superseded predecessor. A row
  // is 'active' iff it is the live tail of its (student, service_type)
  // chain — `active=true` AND no other row in the same group declares
  // it as a predecessor via supersedes_id.
  const supersededIds = new Set<number>();
  if (reqs.length > 0) {
    const studentServicePairs = new Set(reqs.map(r => `${r.studentId}:${r.serviceTypeId}`));
    const sibsConditions = Array.from(studentServicePairs).map(p => {
      const [sid, stid] = p.split(":").map(Number);
      return sql`(${serviceRequirementsTable.studentId} = ${sid} AND ${serviceRequirementsTable.serviceTypeId} = ${stid})`;
    });
    const sibs = await db
      .select({ supersedesId: serviceRequirementsTable.supersedesId })
      .from(serviceRequirementsTable)
      .where(and(
        sql.join(sibsConditions, sql` OR `),
        sql`${serviceRequirementsTable.supersedesId} IS NOT NULL`,
      ));
    for (const s of sibs) {
      if (s.supersedesId != null) supersededIds.add(s.supersedesId);
    }
  }

  res.json(reqs.map(r => {
    const source: "active" | "superseded" =
      r.active && !supersededIds.has(r.id) ? "active" : "superseded";
    return {
      ...r,
      serviceTypeName: r.serviceTypeName,
      providerName: r.providerFirst ? `${r.providerFirst} ${r.providerLast}` : null,
      replacedAt: r.replacedAt ? r.replacedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      source,
    };
  }));
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
  // Decorate with `source` so the detail view can show whether this
  // row is the live tail of its supersede chain or a past entry.
  const successor = await db
    .select({ id: serviceRequirementsTable.id })
    .from(serviceRequirementsTable)
    .where(eq(serviceRequirementsTable.supersedesId, r.id))
    .limit(1);
  const source: "active" | "superseded" =
    r.active && successor.length === 0 ? "active" : "superseded";
  res.json({
    ...r,
    serviceTypeName: r.serviceTypeName,
    providerName: r.providerFirst ? `${r.providerFirst} ${r.providerLast}` : null,
    replacedAt: r.replacedAt ? r.replacedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    source,
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

/**
 * Service Requirement v1 — supersede chain history.
 *
 * Walks the chain belonging to the requested requirement (root → newest)
 * and joins each non-root entry with the audit-log row that recorded its
 * creation so the student-detail history view can show: who superseded
 * the prior row, when, what changed, and the correlation id to deep-link
 * into the audit log. The caller may pass ANY requirement in the chain;
 * the response is normalized to the chain root.
 */
router.get("/service-requirements/:id/chain", async (req, res): Promise<void> => {
  const params = GetServiceRequirementChainParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!(await requireServiceRequirementInDistrict(req as unknown as AuthedRequest, params.data.id, res))) return;

  const [seed] = await db
    .select()
    .from(serviceRequirementsTable)
    .where(eq(serviceRequirementsTable.id, params.data.id));
  if (!seed) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Walk backwards via supersedesId to find the chain root. Mirrors the
  // defensive cycle cap used by the supersede route.
  let rootId = seed.id;
  let cursor: number | null = seed.supersedesId ?? null;
  let hops = 0;
  while (cursor != null && hops < 100) {
    const [parent] = await db
      .select({ id: serviceRequirementsTable.id, supersedesId: serviceRequirementsTable.supersedesId })
      .from(serviceRequirementsTable)
      .where(eq(serviceRequirementsTable.id, cursor));
    if (!parent) break;
    rootId = parent.id;
    cursor = parent.supersedesId ?? null;
    hops += 1;
  }

  // Pull every row in the chain in one go using a recursive CTE — cheaper
  // than walking forward with one query per hop and naturally limits the
  // scan to the rows actually reachable from the root.
  const chainRows = await db.execute(sql`
    WITH RECURSIVE chain AS (
      SELECT * FROM service_requirements WHERE id = ${rootId}
      UNION ALL
      SELECT sr.* FROM service_requirements sr
      JOIN chain c ON sr.supersedes_id = c.id
    )
    SELECT * FROM chain ORDER BY created_at ASC, id ASC
  `);

  const requirements = chainRows.rows as Array<Record<string, unknown>>;

  // Look up the audit "create" rows for the supersede children to surface
  // actor + correlation id. The root row's create row may not have
  // metadata.correlation_id (it predates the chain), so we tolerate
  // missing lookups gracefully.
  const childIds = requirements
    .filter((r) => r.supersedes_id != null)
    .map((r) => String(r.id));
  const auditByTarget = new Map<string, { correlationId: string | null; actorUserId: string | null; actorRole: string | null; createdAt: string | null }>();
  if (childIds.length > 0) {
    const auditRows = await db
      .select({
        targetId: auditLogsTable.targetId,
        actorUserId: auditLogsTable.actorUserId,
        actorRole: auditLogsTable.actorRole,
        createdAt: auditLogsTable.createdAt,
        metadata: auditLogsTable.metadata,
      })
      .from(auditLogsTable)
      .where(and(
        eq(auditLogsTable.targetTable, "service_requirements"),
        eq(auditLogsTable.action, "create"),
        inArray(auditLogsTable.targetId, childIds),
      ));
    for (const row of auditRows) {
      if (!row.targetId) continue;
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const corr = typeof meta.correlation_id === "string" ? meta.correlation_id : null;
      auditByTarget.set(row.targetId, {
        correlationId: corr,
        actorUserId: row.actorUserId ?? null,
        actorRole: row.actorRole ?? null,
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      });
    }
  }

  // Material fields whose changes constitute a "supersede" — keep this in
  // sync with materialFieldsChanging in lib/serviceRequirementGuards.
  const MATERIAL_FIELDS = [
    "service_type_id",
    "provider_id",
    "delivery_type",
    "required_minutes",
    "interval_type",
    "start_date",
    "end_date",
    "priority",
    "notes",
    "delivery_model",
    "setting",
    "group_size",
    "school_id",
    "active",
  ] as const;
  const FIELD_LABEL: Record<string, string> = {
    service_type_id: "serviceTypeId",
    provider_id: "providerId",
    delivery_type: "deliveryType",
    required_minutes: "requiredMinutes",
    interval_type: "intervalType",
    start_date: "startDate",
    end_date: "endDate",
    priority: "priority",
    notes: "notes",
    delivery_model: "deliveryModel",
    setting: "setting",
    group_size: "groupSize",
    school_id: "schoolId",
    active: "active",
  };

  const toRequirementJson = (r: Record<string, unknown>) => ({
    id: r.id as number,
    studentId: r.student_id as number,
    serviceTypeId: r.service_type_id as number,
    providerId: (r.provider_id as number | null) ?? null,
    deliveryType: r.delivery_type as string,
    requiredMinutes: r.required_minutes as number,
    intervalType: r.interval_type as string,
    startDate: r.start_date as string,
    endDate: (r.end_date as string | null) ?? null,
    priority: (r.priority as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    active: r.active as boolean,
    schoolId: (r.school_id as number | null) ?? null,
    deliveryModel: (r.delivery_model as string | null) ?? null,
    supersedesId: (r.supersedes_id as number | null) ?? null,
    replacedAt: r.replaced_at instanceof Date ? r.replaced_at.toISOString() : (r.replaced_at as string | null) ?? null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  });

  const chain = requirements.map((row, idx) => {
    const prior = idx > 0 ? requirements[idx - 1] : null;
    const changed: string[] = [];
    if (prior) {
      for (const f of MATERIAL_FIELDS) {
        if (JSON.stringify(prior[f] ?? null) !== JSON.stringify(row[f] ?? null)) {
          changed.push(FIELD_LABEL[f]);
        }
      }
    }
    const audit = auditByTarget.get(String(row.id));
    return {
      requirement: toRequirementJson(row),
      supersedeCorrelationId: audit?.correlationId ?? null,
      supersededByActorUserId: audit?.actorUserId ?? null,
      supersededByActorRole: audit?.actorRole ?? null,
      supersededAt: audit?.createdAt ?? null,
      changedFields: changed,
    };
  });

  res.json({ chain });
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
