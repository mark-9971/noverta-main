import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { staffAssignmentsTable, staffTable, studentsTable } from "@workspace/db";
import {
  ListStaffAssignmentsQueryParams,
  CreateStaffAssignmentBody,
  DeleteStaffAssignmentParams,
} from "@workspace/api-zod";
import { eq, and, sql } from "drizzle-orm";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";

const router: IRouter = Router();

router.get("/staff-assignments", async (req, res): Promise<void> => {
  const params = ListStaffAssignmentsQueryParams.safeParse(req.query);
  const conditions: any[] = [];
  if (params.success) {
    if (params.data.staffId) conditions.push(eq(staffAssignmentsTable.staffId, Number(params.data.staffId)));
    if (params.data.studentId) conditions.push(eq(staffAssignmentsTable.studentId, Number(params.data.studentId)));
  }
  {
    const enforcedDid = getEnforcedDistrictId(req as unknown as AuthedRequest);
    if (enforcedDid !== null) {
      conditions.push(sql`${staffAssignmentsTable.studentId} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${enforcedDid}))`);
    }
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
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
      staffRole: staffTable.role,
      studentFirst: studentsTable.firstName,
      studentLast: studentsTable.lastName,
    })
    .from(staffAssignmentsTable)
    .leftJoin(staffTable, eq(staffTable.id, staffAssignmentsTable.staffId))
    .leftJoin(studentsTable, eq(studentsTable.id, staffAssignmentsTable.studentId))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  res.json(assignments.map(a => ({
    ...a,
    staffName: a.staffFirst ? `${a.staffFirst} ${a.staffLast}` : null,
    staffRole: a.staffRole,
    studentName: a.studentFirst ? `${a.studentFirst} ${a.studentLast}` : null,
    createdAt: a.createdAt.toISOString(),
  })));
});

router.post("/staff-assignments", async (req, res): Promise<void> => {
  const parsed = CreateStaffAssignmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [assignment] = await db.insert(staffAssignmentsTable).values(parsed.data).returning();
  res.status(201).json({ ...assignment, createdAt: assignment.createdAt.toISOString() });
});

router.delete("/staff-assignments/:id", async (req, res): Promise<void> => {
  const params = DeleteStaffAssignmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(staffAssignmentsTable).where(eq(staffAssignmentsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
