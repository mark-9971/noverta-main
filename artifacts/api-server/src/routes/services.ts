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
} from "@workspace/api-zod";
import { eq, and, sql } from "drizzle-orm";
import { requireRoles, getEnforcedDistrictId, type AuthedRequest } from "../middlewares/auth";

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
  const [req2] = await db.insert(serviceRequirementsTable).values(parsed.data).returning();
  res.status(201).json({ ...req2, createdAt: req2.createdAt.toISOString() });
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

  const [r] = await db.update(serviceRequirementsTable).set(updateData).where(eq(serviceRequirementsTable.id, params.data.id)).returning();
  if (!r) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ...r, createdAt: r.createdAt.toISOString() });
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
