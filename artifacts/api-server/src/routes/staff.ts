import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { staffTable, staffAbsencesTable, coverageInstancesTable, staffAssignmentsTable, scheduleBlocksTable, studentsTable, serviceRequirementsTable, serviceTypesTable } from "@workspace/db";
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
  GetWorkloadSummaryQueryParams,
} from "@workspace/api-zod";
import { eq, and, sql, isNull, gte, lte } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../lib/minuteCalc";
import { requireRoles, getEnforcedDistrictId, type AuthedRequest } from "../middlewares/auth";
import { assertStaffInCallerDistrict, assertStaffAbsenceInCallerDistrict, assertSchoolInCallerDistrict, staffInCallerDistrict } from "../lib/districtScope";
import { getActiveSchoolYearId } from "../lib/activeSchoolYear";
import { getPublicMeta } from "../lib/clerkClaims";
import type { Request } from "express";

const requireAdmin = requireRoles("admin", "coordinator");

/** Resolve active school-year id for workload queries */
async function resolveWorkloadYearId(req: Request, districtIdHint?: number | null): Promise<number | null> {
  const did = districtIdHint ?? getPublicMeta(req).districtId;
  if (did) return getActiveSchoolYearId(did);
  if (process.env.NODE_ENV !== "production") {
    const { pool } = await import("@workspace/db");
    const result = await pool.query<{ id: number }>("SELECT id FROM school_years WHERE is_active = true ORDER BY id LIMIT 1");
    return result.rows[0]?.id ?? null;
  }
  return null;
}

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
  {
    const enforcedDid = getEnforcedDistrictId(req as AuthedRequest);
    if (enforcedDid !== null) {
      conditions.push(sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${enforcedDid})`);
    } else if (params.success && params.data.districtId) {
      conditions.push(sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${Number(params.data.districtId)})`);
    }
  }

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

// Workload summary — must appear BEFORE /staff/:id to avoid route conflict
router.get("/staff/workload-summary", requireAdmin, async (req, res): Promise<void> => {
  const params = GetWorkloadSummaryQueryParams.safeParse(req.query);
  const thresholdMinutes = (params.success && params.data.thresholdHours)
    ? params.data.thresholdHours * 60
    : 25 * 60;

  // Staff-level conditions (scope to school or district)
  const staffConditions: any[] = [isNull(staffTable.deletedAt)];
  if (params.success && params.data.schoolId) {
    staffConditions.push(eq(staffTable.schoolId, Number(params.data.schoolId)));
  }
  {
    const enforcedDid = getEnforcedDistrictId(req as AuthedRequest);
    if (enforcedDid !== null) {
      staffConditions.push(sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${enforcedDid})`);
    } else if (params.success && params.data.districtId) {
      staffConditions.push(sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${Number(params.data.districtId)})`);
    }
  }

  const enforcedDidForYear = getEnforcedDistrictId(req as AuthedRequest);
  const activeYearId = await resolveWorkloadYearId(req, enforcedDidForYear !== null ? enforcedDidForYear : (params.success ? (params.data.districtId ?? null) : null));

  // Block-level join conditions (only active recurring blocks in effective window)
  const blockJoinConditions = and(
    eq(scheduleBlocksTable.staffId, staffTable.id),
    eq(scheduleBlocksTable.isRecurring, true),
    isNull(scheduleBlocksTable.deletedAt),
    ...(activeYearId != null ? [eq(scheduleBlocksTable.schoolYearId, activeYearId)] : []),
    sql`(${scheduleBlocksTable.effectiveFrom} IS NULL OR ${scheduleBlocksTable.effectiveFrom} <= CURRENT_DATE)`,
    sql`(${scheduleBlocksTable.effectiveTo} IS NULL OR ${scheduleBlocksTable.effectiveTo} >= CURRENT_DATE)`,
  );

  // LEFT JOIN ensures staff with zero scheduled blocks still appear in the result
  const rows = await db
    .select({
      staffId: staffTable.id,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
      staffRole: staffTable.role,
      startTime: scheduleBlocksTable.startTime,
      endTime: scheduleBlocksTable.endTime,
      recurrenceType: scheduleBlocksTable.recurrenceType,
    })
    .from(staffTable)
    .leftJoin(scheduleBlocksTable, blockJoinConditions)
    .where(and(...staffConditions));

  const staffMap = new Map<number, { staffId: number; firstName: string; lastName: string; role: string; totalMinutes: number; blockCount: number }>();
  for (const row of rows) {
    if (!staffMap.has(row.staffId)) {
      staffMap.set(row.staffId, {
        staffId: row.staffId,
        firstName: row.staffFirst ?? "",
        lastName: row.staffLast ?? "",
        role: row.staffRole ?? "",
        totalMinutes: 0,
        blockCount: 0,
      });
    }
    // startTime/endTime are null for staff who have no matching blocks (LEFT JOIN null row)
    if (!row.startTime || !row.endTime) continue;
    const entry = staffMap.get(row.staffId)!;
    const [sh, sm] = row.startTime.split(":").map(Number);
    const [eh, em] = row.endTime.split(":").map(Number);
    const rawMinutes = (eh * 60 + em) - (sh * 60 + sm);
    // Biweekly blocks contribute half their minutes per average week
    const weeklyMultiplier = row.recurrenceType === "biweekly" ? 0.5 : 1;
    const blockMinutes = rawMinutes * weeklyMultiplier;
    if (blockMinutes > 0) entry.totalMinutes += blockMinutes;
    entry.blockCount++;
  }

  const summary = Array.from(staffMap.values()).map(s => ({
    staffId: s.staffId,
    staffName: `${s.firstName} ${s.lastName}`,
    role: s.role,
    scheduledMinutesPerWeek: s.totalMinutes,
    scheduledHoursPerWeek: Math.round(s.totalMinutes / 60 * 10) / 10,
    blockCount: s.blockCount,
    isOverloaded: s.totalMinutes > thresholdMinutes,
  })).sort((a, b) => b.scheduledMinutesPerWeek - a.scheduledMinutesPerWeek);

  res.json({ thresholdMinutes, thresholdHours: thresholdMinutes / 60, staff: summary });
});

router.get("/staff/:id", async (req, res): Promise<void> => {
  const params = GetStaffParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  // Verify the requested staff member belongs to the caller's district before
  // returning any data. assertStaffInCallerDistrict returns false and sends 403
  // when the staff member's school is in a different district.
  if (!(await assertStaffInCallerDistrict(req as AuthedRequest, params.data.id, res))) return;
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
  const [existingStaff] = await db
    .select({ id: staffTable.id })
    .from(staffTable)
    .where(and(eq(staffTable.id, params.data.id), isNull(staffTable.deletedAt)))
    .limit(1);
  if (!existingStaff) {
    res.status(404).json({ error: "Staff not found" });
    return;
  }
  if (!(await staffInCallerDistrict(req as AuthedRequest, params.data.id))) {
    res.status(403).json({ error: "Forbidden: staff member does not belong to your district" });
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
  if (parsed.data.schoolId !== undefined) {
    // Body-IDOR defense: cannot re-home a staff record into a school that
    // belongs to a different district.
    if (parsed.data.schoolId != null
      && !(await assertSchoolInCallerDistrict(req as AuthedRequest, Number(parsed.data.schoolId), res))) return;
    updateData.schoolId = parsed.data.schoolId;
  }
  if (parsed.data.status != null) updateData.status = parsed.data.status;
  if (parsed.data.qualifications !== undefined) updateData.qualifications = parsed.data.qualifications;
  if (parsed.data.npiNumber !== undefined) updateData.npiNumber = parsed.data.npiNumber;
  if (parsed.data.medicaidProviderId !== undefined) updateData.medicaidProviderId = parsed.data.medicaidProviderId;

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
  if (!(await assertStaffInCallerDistrict(req as AuthedRequest, params.data.id, res))) return;
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

// Staff Absences — admin/coordinator only

router.post("/staff/:id/absences", requireAdmin, async (req, res): Promise<void> => {
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

  // Determine day-of-week from absence date
  const absenceDay = new Date(parsed.data.absenceDate + "T12:00:00");
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayOfWeek = dayNames[absenceDay.getDay()];

  // Compute the Monday (ISO week start) of the absence date for weekOf matching
  const absenceDayNum = absenceDay.getDay(); // 0=Sun ... 6=Sat
  const daysToMonday = absenceDayNum === 0 ? 6 : absenceDayNum - 1;
  const mondayOfAbsenceWeek = new Date(absenceDay);
  mondayOfAbsenceWeek.setDate(absenceDay.getDate() - daysToMonday);
  const weekOfStr = mondayOfAbsenceWeek.toISOString().slice(0, 10);

  // Query 1: recurring blocks on this weekday (within effective date range)
  const recurringBlocks = await db
    .select({
      id: scheduleBlocksTable.id,
      startTime: scheduleBlocksTable.startTime,
      endTime: scheduleBlocksTable.endTime,
      effectiveFrom: scheduleBlocksTable.effectiveFrom,
      effectiveTo: scheduleBlocksTable.effectiveTo,
      recurrenceType: scheduleBlocksTable.recurrenceType,
    })
    .from(scheduleBlocksTable)
    .where(and(
      eq(scheduleBlocksTable.staffId, staffId),
      eq(scheduleBlocksTable.dayOfWeek, dayOfWeek),
      eq(scheduleBlocksTable.isRecurring, true),
      isNull(scheduleBlocksTable.deletedAt),
    ));

  // Query 2: non-recurring (date-specific) blocks for this staff on the specific absence week+day
  const nonRecurringBlocks = await db
    .select({
      id: scheduleBlocksTable.id,
      startTime: scheduleBlocksTable.startTime,
      endTime: scheduleBlocksTable.endTime,
      effectiveFrom: scheduleBlocksTable.effectiveFrom,
      effectiveTo: scheduleBlocksTable.effectiveTo,
      recurrenceType: scheduleBlocksTable.recurrenceType,
    })
    .from(scheduleBlocksTable)
    .where(and(
      eq(scheduleBlocksTable.staffId, staffId),
      eq(scheduleBlocksTable.dayOfWeek, dayOfWeek),
      eq(scheduleBlocksTable.isRecurring, false),
      eq(scheduleBlocksTable.weekOf, weekOfStr),
      isNull(scheduleBlocksTable.deletedAt),
    ));

  const candidateBlocks = [...recurringBlocks, ...nonRecurringBlocks];

  // If absence has a time range, only flag blocks that overlap with it
  const absenceStart = parsed.data.startTime ?? null;
  const absenceEnd = parsed.data.endTime ?? null;
  const absenceDateStr = parsed.data.absenceDate;

  function timeToMinutes(t: string) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }

  const blocksToCreate = candidateBlocks.filter(b => {
    // Respect effectiveFrom/effectiveTo range on the block
    if (b.effectiveFrom && absenceDateStr < b.effectiveFrom) return false;
    if (b.effectiveTo && absenceDateStr > b.effectiveTo) return false;
    // Biweekly parity: use effectiveFrom as anchor week to determine on/off weeks
    if (b.recurrenceType === "biweekly" && b.effectiveFrom) {
      const anchor = new Date(b.effectiveFrom + "T12:00:00");
      const target = new Date(absenceDateStr + "T12:00:00");
      const weeksDiff = Math.round((target.getTime() - anchor.getTime()) / (7 * 24 * 3600 * 1000));
      if (weeksDiff % 2 !== 0) return false; // off week — skip
    }
    // Time-window overlap: block.start < absenceEnd && absenceStart < block.end
    if (!absenceStart || !absenceEnd) return true;
    return timeToMinutes(b.startTime) < timeToMinutes(absenceEnd) &&
           timeToMinutes(absenceStart) < timeToMinutes(b.endTime);
  });

  // Create one coverage_instance per affected block (idempotent: skip if one already exists)
  let uncoveredCount = 0;
  for (const block of blocksToCreate) {
    const existing = await db
      .select({ id: coverageInstancesTable.id })
      .from(coverageInstancesTable)
      .where(and(
        eq(coverageInstancesTable.scheduleBlockId, block.id),
        eq(coverageInstancesTable.absenceDate, parsed.data.absenceDate),
      ));
    if (existing.length === 0) {
      await db.insert(coverageInstancesTable).values({
        scheduleBlockId: block.id,
        absenceDate: parsed.data.absenceDate,
        originalStaffId: staffId,
        substituteStaffId: null,
        isCovered: false,
        absenceId: absence.id,
      });
      uncoveredCount++;
    }
  }

  res.status(201).json({
    ...absence,
    createdAt: absence.createdAt.toISOString(),
    uncoveredBlockCount: uncoveredCount,
  });
});

router.get("/staff/:id/absences", requireAdmin, async (req, res): Promise<void> => {
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

  // Attach uncovered block count per absence from coverage_instances
  const absenceIds = absences.map(a => a.id);
  const instanceCounts: Record<number, number> = {};
  if (absenceIds.length > 0) {
    const { pool } = await import("@workspace/db");
    const countsResult = await pool.query<{ absence_id: number; cnt: string }>(
      `SELECT absence_id, COUNT(*)::text AS cnt FROM coverage_instances WHERE is_covered = false AND absence_id = ANY($1) GROUP BY absence_id`,
      [absenceIds]
    );
    for (const row of countsResult.rows) instanceCounts[row.absence_id] = Number(row.cnt);
  }

  res.json(absences.map(a => ({
    ...a,
    staffName: a.staffFirst ? `${a.staffFirst} ${a.staffLast}` : null,
    createdAt: a.createdAt.toISOString(),
    uncoveredBlockCount: instanceCounts[a.id] ?? 0,
  })));
});

router.delete("/absences/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteAbsenceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!(await assertStaffAbsenceInCallerDistrict(req as AuthedRequest, params.data.id, res))) return;

  const [absence] = await db.select().from(staffAbsencesTable).where(eq(staffAbsencesTable.id, params.data.id));
  if (!absence) { res.status(404).json({ error: "Absence not found" }); return; }

  // Delete all coverage instances for this absence (uncovered sessions go away)
  await db.delete(coverageInstancesTable).where(eq(coverageInstancesTable.absenceId, params.data.id));
  await db.delete(staffAbsencesTable).where(eq(staffAbsencesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
