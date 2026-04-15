import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { staffTable, staffAbsencesTable, staffAssignmentsTable, scheduleBlocksTable, studentsTable, serviceRequirementsTable, serviceTypesTable } from "@workspace/db";
import {
  ListStaffQueryParams,
  CreateStaffBody,
  GetStaffParams,
  UpdateStaffParams,
  UpdateStaffBody,
  GetStaffCaseloadParams,
  CreateAbsenceParams,
  CreateAbsenceBody,
  ListAbsencesParams,
  ListAbsencesQueryParams,
  DeleteAbsenceParams,
} from "@workspace/api-zod";
import { eq, and, sql, isNull, gte, lte, between } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../lib/minuteCalc";

const router: IRouter = Router();

function staffToJson(s: typeof staffTable.$inferSelect) {
  return { ...s, createdAt: s.createdAt.toISOString() };
}

router.get("/staff", async (req, res): Promise<void> => {
  const params = ListStaffQueryParams.safeParse(req.query);
  const conditions: any[] = [isNull(staffTable.deletedAt)];
  if (params.success && params.data.role) conditions.push(eq(staffTable.role, params.data.role));
  if (params.success && params.data.status) conditions.push(eq(staffTable.status, params.data.status));
  if (params.success && params.data.schoolId) conditions.push(eq(staffTable.schoolId, Number(params.data.schoolId)));
  if (params.success && params.data.districtId) conditions.push(sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${Number(params.data.districtId)})`);

  const pageLimit = (params.success && params.data.limit) ? Math.min(Number(params.data.limit), 500) : 100;
  const pageOffset = (params.success && params.data.offset) ? Number(params.data.offset) : 0;

  const staff = await db.select().from(staffTable).where(and(...conditions)).orderBy(staffTable.lastName).limit(pageLimit).offset(pageOffset);

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
  const [staff] = await db.select().from(staffTable).where(and(eq(staffTable.id, params.data.id), isNull(staffTable.deletedAt)));
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

  const blocks = await db.select().from(scheduleBlocksTable).where(and(eq(scheduleBlocksTable.staffId, params.data.id), isNull(scheduleBlocksTable.deletedAt)));

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

router.delete("/staff/:id", async (req, res): Promise<void> => {
  const params = GetStaffParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [updated] = await db
    .update(staffTable)
    .set({ deletedAt: new Date() })
    .where(and(eq(staffTable.id, params.data.id), isNull(staffTable.deletedAt)))
    .returning({ id: staffTable.id });
  if (!updated) {
    res.status(404).json({ error: "Staff not found" });
    return;
  }
  res.json({ success: true });
});

// Staff Absences

router.post("/staff/:id/absences", async (req, res): Promise<void> => {
  const params = CreateAbsenceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = CreateAbsenceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const staffId = params.data.id;
  const [absence] = await db.insert(staffAbsencesTable).values({
    staffId,
    schoolId: parsed.data.schoolId ?? null,
    absenceDate: parsed.data.absenceDate,
    absenceType: parsed.data.absenceType,
    startTime: parsed.data.startTime ?? null,
    endTime: parsed.data.endTime ?? null,
    notes: parsed.data.notes ?? null,
    reportedBy: parsed.data.reportedBy ?? null,
  }).returning();

  // Determine the day of week for the absence date
  const absenceDay = new Date(parsed.data.absenceDate + "T12:00:00");
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayOfWeek = dayNames[absenceDay.getDay()];

  // Find schedule blocks for this staff on that day of week and flag them uncovered
  const blocksToFlag = await db
    .select({ id: scheduleBlocksTable.id })
    .from(scheduleBlocksTable)
    .where(and(
      eq(scheduleBlocksTable.staffId, staffId),
      eq(scheduleBlocksTable.dayOfWeek, dayOfWeek),
      eq(scheduleBlocksTable.isRecurring, true),
      isNull(scheduleBlocksTable.deletedAt),
    ));

  let uncoveredCount = 0;
  if (blocksToFlag.length > 0) {
    for (const block of blocksToFlag) {
      await db.update(scheduleBlocksTable).set({
        isUncovered: true,
        originalStaffId: staffId,
        absenceId: absence.id,
      }).where(and(
        eq(scheduleBlocksTable.id, block.id),
        eq(scheduleBlocksTable.isUncovered, false),
      ));
    }
    uncoveredCount = blocksToFlag.length;
  }

  res.status(201).json({
    ...absence,
    absenceDate: typeof absence.absenceDate === "string" ? absence.absenceDate : absence.absenceDate,
    createdAt: absence.createdAt.toISOString(),
    uncoveredBlockCount: uncoveredCount,
  });
});

router.get("/staff/:id/absences", async (req, res): Promise<void> => {
  const params = ListAbsencesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const query = ListAbsencesQueryParams.safeParse(req.query);
  const conditions: any[] = [eq(staffAbsencesTable.staffId, params.data.id)];
  if (query.success && query.data.startDate) conditions.push(gte(staffAbsencesTable.absenceDate, query.data.startDate));
  if (query.success && query.data.endDate) conditions.push(lte(staffAbsencesTable.absenceDate, query.data.endDate));

  const absences = await db
    .select({
      id: staffAbsencesTable.id,
      staffId: staffAbsencesTable.staffId,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
      schoolId: staffAbsencesTable.schoolId,
      absenceDate: staffAbsencesTable.absenceDate,
      absenceType: staffAbsencesTable.absenceType,
      startTime: staffAbsencesTable.startTime,
      endTime: staffAbsencesTable.endTime,
      notes: staffAbsencesTable.notes,
      reportedBy: staffAbsencesTable.reportedBy,
      createdAt: staffAbsencesTable.createdAt,
    })
    .from(staffAbsencesTable)
    .leftJoin(staffTable, eq(staffTable.id, staffAbsencesTable.staffId))
    .where(and(...conditions))
    .orderBy(staffAbsencesTable.absenceDate);

  res.json(absences.map(a => ({
    ...a,
    staffName: a.staffFirst ? `${a.staffFirst} ${a.staffLast}` : null,
    createdAt: a.createdAt.toISOString(),
    uncoveredBlockCount: 0,
  })));
});

router.delete("/absences/:id", async (req, res): Promise<void> => {
  const params = DeleteAbsenceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  // Find the absence to know which staff/date to restore
  const [absence] = await db.select().from(staffAbsencesTable).where(eq(staffAbsencesTable.id, params.data.id));
  if (!absence) { res.status(404).json({ error: "Absence not found" }); return; }

  // Clear uncovered flags on blocks linked to this absence
  await db.update(scheduleBlocksTable).set({
    isUncovered: false,
    originalStaffId: null,
    absenceId: null,
  }).where(eq(scheduleBlocksTable.absenceId, params.data.id));

  await db.delete(staffAbsencesTable).where(eq(staffAbsencesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
