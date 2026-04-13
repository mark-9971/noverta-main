import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { serviceTypesTable, serviceRequirementsTable, staffTable, studentsTable } from "@workspace/db";
import {
  CreateServiceTypeBody,
  ListServiceRequirementsQueryParams,
  CreateServiceRequirementBody,
  GetServiceRequirementParams,
  UpdateServiceRequirementParams,
  UpdateServiceRequirementBody,
  DeleteServiceRequirementParams,
} from "@workspace/api-zod";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/service-types", async (req, res): Promise<void> => {
  const types = await db.select().from(serviceTypesTable).orderBy(serviceTypesTable.name);
  res.json(types.map(t => ({ ...t, createdAt: t.createdAt.toISOString() })));
});

router.post("/service-types", async (req, res): Promise<void> => {
  const parsed = CreateServiceTypeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [type] = await db.insert(serviceTypesTable).values(parsed.data).returning();
  res.status(201).json({ ...type, createdAt: type.createdAt.toISOString() });
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

router.post("/service-requirements", async (req, res): Promise<void> => {
  const parsed = CreateServiceRequirementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [req2] = await db.insert(serviceRequirementsTable).values(parsed.data).returning();
  res.status(201).json({ ...req2, createdAt: req2.createdAt.toISOString() });
});

router.get("/service-requirements/:id", async (req, res): Promise<void> => {
  const params = GetServiceRequirementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
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

router.patch("/service-requirements/:id", async (req, res): Promise<void> => {
  const params = UpdateServiceRequirementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
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

router.delete("/service-requirements/:id", async (req, res): Promise<void> => {
  const params = DeleteServiceRequirementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(serviceRequirementsTable).where(eq(serviceRequirementsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
