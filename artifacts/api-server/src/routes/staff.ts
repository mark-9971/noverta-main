import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { staffTable, staffAssignmentsTable, scheduleBlocksTable, studentsTable, serviceRequirementsTable, serviceTypesTable } from "@workspace/db";
import {
  ListStaffQueryParams,
  CreateStaffBody,
  GetStaffParams,
  UpdateStaffParams,
  UpdateStaffBody,
  GetStaffCaseloadParams,
} from "@workspace/api-zod";
import { eq, and, sql } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../lib/minuteCalc";

const router: IRouter = Router();

function staffToJson(s: typeof staffTable.$inferSelect) {
  return { ...s, createdAt: s.createdAt.toISOString() };
}

router.get("/staff", async (req, res): Promise<void> => {
  const params = ListStaffQueryParams.safeParse(req.query);
  const conditions = [];
  if (params.success && params.data.role) conditions.push(eq(staffTable.role, params.data.role));
  if (params.success && params.data.status) conditions.push(eq(staffTable.status, params.data.status));
  if (params.success && (params.data as any).schoolId) conditions.push(eq(staffTable.schoolId, Number((params.data as any).schoolId)));
  if (params.success && (params.data as any).districtId) conditions.push(sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${Number((params.data as any).districtId)})`);

  const pageLimit = (params.success && params.data.limit) ? Math.min(Number(params.data.limit), 500) : 100;
  const pageOffset = (params.success && params.data.offset) ? Number(params.data.offset) : 0;

  const staff = conditions.length > 0
    ? await db.select().from(staffTable).where(and(...conditions)).orderBy(staffTable.lastName).limit(pageLimit).offset(pageOffset)
    : await db.select().from(staffTable).orderBy(staffTable.lastName).limit(pageLimit).offset(pageOffset);

  res.json(staff.map(staffToJson));
});

router.post("/staff", async (req, res): Promise<void> => {
  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [staff] = await db.insert(staffTable).values(parsed.data).returning();
  res.status(201).json(staffToJson(staff));
});

router.get("/staff/:id", async (req, res): Promise<void> => {
  const params = GetStaffParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [staff] = await db.select().from(staffTable).where(eq(staffTable.id, params.data.id));
  if (!staff) {
    res.status(404).json({ error: "Staff not found" });
    return;
  }

  const assignments = await db
    .select({
      id: staffAssignmentsTable.id,
      staffId: staffAssignmentsTable.staffId,
      studentId: staffAssignmentsTable.studentId,
      assignmentType: staffAssignmentsTable.assignmentType,
      startDate: staffAssignmentsTable.startDate,
      endDate: staffAssignmentsTable.endDate,
      notes: staffAssignmentsTable.notes,
      createdAt: staffAssignmentsTable.createdAt,
      studentFirst: studentsTable.firstName,
      studentLast: studentsTable.lastName,
    })
    .from(staffAssignmentsTable)
    .leftJoin(studentsTable, eq(studentsTable.id, staffAssignmentsTable.studentId))
    .where(eq(staffAssignmentsTable.staffId, params.data.id));

  const blocks = await db.select().from(scheduleBlocksTable).where(eq(scheduleBlocksTable.staffId, params.data.id));

  res.json({
    ...staffToJson(staff),
    assignedStudents: assignments.map(a => ({
      id: a.id,
      staffId: a.staffId,
      studentId: a.studentId,
      assignmentType: a.assignmentType,
      startDate: a.startDate,
      endDate: a.endDate,
      notes: a.notes,
      createdAt: a.createdAt.toISOString(),
      studentName: a.studentFirst ? `${a.studentFirst} ${a.studentLast}` : null,
    })),
    scheduleBlocks: blocks.map(b => ({ ...b, createdAt: b.createdAt.toISOString() })),
  });
});

router.patch("/staff/:id", async (req, res): Promise<void> => {
  const params = UpdateStaffParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Partial<typeof staffTable.$inferInsert> = {};
  if (parsed.data.firstName != null) updateData.firstName = parsed.data.firstName;
  if (parsed.data.lastName != null) updateData.lastName = parsed.data.lastName;
  if (parsed.data.email !== undefined) updateData.email = parsed.data.email;
  if (parsed.data.role != null) updateData.role = parsed.data.role;
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.schoolId !== undefined) updateData.schoolId = parsed.data.schoolId;
  if (parsed.data.status != null) updateData.status = parsed.data.status;
  if (parsed.data.qualifications !== undefined) updateData.qualifications = parsed.data.qualifications;

  const [staff] = await db.update(staffTable).set(updateData).where(eq(staffTable.id, params.data.id)).returning();
  if (!staff) {
    res.status(404).json({ error: "Staff not found" });
    return;
  }
  res.json(staffToJson(staff));
});

router.get("/staff/:id/caseload", async (req, res): Promise<void> => {
  const params = GetStaffCaseloadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const progress = await computeAllActiveMinuteProgress({ staffId: params.data.id });
  res.json(progress);
});

export default router;
