import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { studentsTable, staffTable, sessionLogsTable, scheduleBlocksTable, schoolsTable, serviceTypesTable } from "@workspace/db";
import { eq, isNotNull, desc, and } from "drizzle-orm";
import { logAudit } from "../lib/auditLog";
import { requireRoles } from "../middlewares/auth";

// tenant-scope: district-join
const router: IRouter = Router();

router.get("/recently-deleted", requireRoles("admin", "coordinator"), async (_req, res): Promise<void> => {
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
      .where(isNotNull(studentsTable.deletedAt))
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
      .where(isNotNull(staffTable.deletedAt))
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
      .where(isNotNull(sessionLogsTable.deletedAt))
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
      .where(isNotNull(scheduleBlocksTable.deletedAt))
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

  let tableName: string;
  let rows: { id: number }[];
  switch (table) {
    case "students":
      rows = await db.update(studentsTable).set({ deletedAt: null }).where(and(eq(studentsTable.id, numId), isNotNull(studentsTable.deletedAt))).returning({ id: studentsTable.id });
      tableName = "students";
      break;
    case "staff":
      rows = await db.update(staffTable).set({ deletedAt: null }).where(and(eq(staffTable.id, numId), isNotNull(staffTable.deletedAt))).returning({ id: staffTable.id });
      tableName = "staff";
      break;
    case "sessions":
      rows = await db.update(sessionLogsTable).set({ deletedAt: null }).where(and(eq(sessionLogsTable.id, numId), isNotNull(sessionLogsTable.deletedAt))).returning({ id: sessionLogsTable.id });
      tableName = "session_logs";
      break;
    case "scheduleBlocks":
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
