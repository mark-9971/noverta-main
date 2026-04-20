import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { studentsTable, staffTable, sessionLogsTable, scheduleBlocksTable, schoolsTable, serviceTypesTable } from "@workspace/db";
import { eq, isNotNull, desc, and, sql } from "drizzle-orm";
import { logAudit } from "../lib/auditLog";
import { requireRoles, getEnforcedDistrictId, type AuthedRequest } from "../middlewares/auth";
import {
  assertStudentInCallerDistrict,
  assertStaffInCallerDistrict,
  assertSessionLogInCallerDistrict,
  assertScheduleBlockInCallerDistrict,
} from "../lib/districtScope";

// tenant-scope: district-join
// Even district admins/coordinators must only see soft-deleted records from
// their OWN district. Without these predicates a district admin would see (and
// could restore) other districts' deleted students, staff, and sessions.
const router: IRouter = Router();

router.get("/recently-deleted", requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  const authed = req as unknown as AuthedRequest;
  const did = getEnforcedDistrictId(authed);

  // Predicates: NULL did = platform admin (all districts visible).
  const studentDistrict = did == null
    ? sql`TRUE`
    : sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${did})`;
  const staffDistrict = did == null
    ? sql`TRUE`
    : sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${did})`;
  const sessionDistrict = did == null
    ? sql`TRUE`
    : sql`${sessionLogsTable.studentId} IN (
        SELECT s.id FROM students s
        JOIN schools sch ON sch.id = s.school_id
        WHERE sch.district_id = ${did}
      )`;
  const blockDistrict = did == null
    ? sql`TRUE`
    : sql`${scheduleBlocksTable.staffId} IN (
        SELECT st.id FROM staff st
        JOIN schools sch ON sch.id = st.school_id
        WHERE sch.district_id = ${did}
      )`;

  const [students, staff, sessions, scheduleBlocks] = await Promise.all([
    db.select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      grade: studentsTable.grade,
      status: studentsTable.status,
      schoolName: schoolsTable.name,
      deletedAt: studentsTable.deletedAt,
    })
      .from(studentsTable)
      .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
      .where(and(isNotNull(studentsTable.deletedAt), studentDistrict))
      .orderBy(desc(studentsTable.deletedAt))
      .limit(50),

    db.select({
      id: staffTable.id,
      firstName: staffTable.firstName,
      lastName: staffTable.lastName,
      role: staffTable.role,
      email: staffTable.email,
      deletedAt: staffTable.deletedAt,
    })
      .from(staffTable)
      .where(and(isNotNull(staffTable.deletedAt), staffDistrict))
      .orderBy(desc(staffTable.deletedAt))
      .limit(50),

    // soft-delete-ok: this endpoint is the forensic "trash" viewer; it
    // intentionally queries only soft-deleted sessions (deletedAt IS NOT NULL).
    db.select({
      id: sessionLogsTable.id,
      studentId: sessionLogsTable.studentId,
      sessionDate: sessionLogsTable.sessionDate,
      durationMinutes: sessionLogsTable.durationMinutes,
      status: sessionLogsTable.status,
      studentFirst: studentsTable.firstName,
      studentLast: studentsTable.lastName,
      deletedAt: sessionLogsTable.deletedAt,
    })
      .from(sessionLogsTable)
      .leftJoin(studentsTable, eq(studentsTable.id, sessionLogsTable.studentId))
      .where(and(isNotNull(sessionLogsTable.deletedAt), sessionDistrict))
      .orderBy(desc(sessionLogsTable.deletedAt))
      .limit(50),

    db.select({
      id: scheduleBlocksTable.id,
      staffId: scheduleBlocksTable.staffId,
      dayOfWeek: scheduleBlocksTable.dayOfWeek,
      startTime: scheduleBlocksTable.startTime,
      endTime: scheduleBlocksTable.endTime,
      blockType: scheduleBlocksTable.blockType,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
      deletedAt: scheduleBlocksTable.deletedAt,
    })
      .from(scheduleBlocksTable)
      .leftJoin(staffTable, eq(staffTable.id, scheduleBlocksTable.staffId))
      .where(and(isNotNull(scheduleBlocksTable.deletedAt), blockDistrict))
      .orderBy(desc(scheduleBlocksTable.deletedAt))
      .limit(50),
  ]);

  res.json({
    students: students.map(s => ({ ...s, deletedAt: s.deletedAt?.toISOString() })),
    staff: staff.map(s => ({ ...s, deletedAt: s.deletedAt?.toISOString() })),
    sessions: sessions.map(s => ({ ...s, deletedAt: s.deletedAt?.toISOString() })),
    scheduleBlocks: scheduleBlocks.map(s => ({ ...s, deletedAt: s.deletedAt?.toISOString() })),
  });
});

router.post("/recently-deleted/restore", requireRoles("admin"), async (req, res): Promise<void> => {
  const { table, id } = req.body;
  if (!table || !id) {
    res.status(400).json({ error: "table and id are required" });
    return;
  }

  const numId = Number(id);
  if (isNaN(numId)) {
    res.status(400).json({ error: "id must be a number" });
    return;
  }

  // Body-IDOR defence: an admin in district A must not be able to undelete a
  // soft-deleted row in district B by guessing its id. Validate the target
  // belongs to the caller's district BEFORE touching it.
  const authed = req as unknown as AuthedRequest;
  let tableName: string;
  let rows: { id: number }[];
  switch (table) {
    case "students":
      if (!(await assertStudentInCallerDistrict(authed, numId, res))) return;
      rows = await db.update(studentsTable).set({ deletedAt: null }).where(and(eq(studentsTable.id, numId), isNotNull(studentsTable.deletedAt))).returning({ id: studentsTable.id });
      tableName = "students";
      break;
    case "staff":
      if (!(await assertStaffInCallerDistrict(authed, numId, res))) return;
      rows = await db.update(staffTable).set({ deletedAt: null }).where(and(eq(staffTable.id, numId), isNotNull(staffTable.deletedAt))).returning({ id: staffTable.id });
      tableName = "staff";
      break;
    case "sessions":
      if (!(await assertSessionLogInCallerDistrict(authed, numId, res))) return;
      rows = await db.update(sessionLogsTable).set({ deletedAt: null }).where(and(eq(sessionLogsTable.id, numId), isNotNull(sessionLogsTable.deletedAt))).returning({ id: sessionLogsTable.id });
      tableName = "session_logs";
      break;
    case "scheduleBlocks":
      if (!(await assertScheduleBlockInCallerDistrict(authed, numId, res))) return;
      rows = await db.update(scheduleBlocksTable).set({ deletedAt: null }).where(and(eq(scheduleBlocksTable.id, numId), isNotNull(scheduleBlocksTable.deletedAt))).returning({ id: scheduleBlocksTable.id });
      tableName = "schedule_blocks";
      break;
    default:
      res.status(400).json({ error: "Invalid table" });
      return;
  }

  if (rows.length === 0) {
    res.status(404).json({ error: "Record not found or already restored" });
    return;
  }

  logAudit(req, {
    action: "restore",
    targetTable: tableName,
    targetId: numId,
    summary: `Restored ${tableName} #${numId} from soft-delete`,
  });

  res.json({ success: true });
});

export default router;
