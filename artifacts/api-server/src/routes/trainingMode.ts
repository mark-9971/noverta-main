/**
 * Training Mode (task 423) — toggle, status, and per-user reset endpoints.
 *
 * The actual read/write rerouting is implemented by
 * `lib/trainingMode.ts`'s `applyTrainingModeOverride` middleware (mounted
 * globally in routes/index.ts) and by sandbox-aware branches in the
 * sessions routes. This file is just the control surface the profile-menu
 * UI talks to.
 */
import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { db, sessionLogsTable, staffTable, studentsTable, schoolsTable } from "@workspace/db";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { requireAuth } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import {
  findCallerStaffRow,
  getTrainingPersonaStaffId,
  invalidateTrainingFlagCache,
  trainingWriterUserId,
} from "../lib/trainingMode";

const router: IRouter = Router();

async function callerEmails(userId: string): Promise<string[]> {
  try {
    const user = await clerkClient.users.getUser(userId);
    return user.emailAddresses
      .map(e => e.emailAddress?.toLowerCase())
      .filter((e): e is string => !!e);
  } catch (err) {
    logger.warn({ err, userId }, "training-mode: clerk user lookup failed");
    return [];
  }
}

interface TrainingStatusResponse {
  enabled: boolean;
  /** True iff the caller's district has any sample students (i.e. a sandbox is available to enter). */
  sandboxAvailable: boolean;
  /** Number of session_logs the caller has written in training mode. Drives the "Reset" button's enabled state. */
  mySandboxSessions: number;
  /** Sample roster size in the caller's district (informational, mirrors GET /sample-data). */
  sampleStudents: number;
  sampleStaff: number;
}

router.get("/training-mode", requireAuth, async (req, res): Promise<void> => {
  const authed = req as unknown as AuthedRequest;
  // We need the *real* staff/district scope, not the override applied by the
  // global middleware. The override middleware sets req.realStaffId when it
  // swaps the persona; otherwise req.tenantStaffId is already the real one.
  const realStaffId = authed.realStaffId ?? authed.tenantStaffId;
  const realDistrictId = authed.tenantDistrictId;

  let enabled = false;
  if (realStaffId != null) {
    const [row] = await db
      .select({ enabled: staffTable.trainingModeEnabled })
      .from(staffTable)
      .where(eq(staffTable.id, realStaffId))
      .limit(1);
    enabled = !!row?.enabled;
  }

  let sampleStudents = 0;
  let sampleStaff = 0;
  if (realDistrictId != null) {
    const schoolRows = await db
      .select({ id: schoolsTable.id })
      .from(schoolsTable)
      .where(eq(schoolsTable.districtId, realDistrictId));
    const schoolIds = schoolRows.map(s => s.id);
    if (schoolIds.length > 0) {
      const [stuCount] = await db
        .select({ n: count() })
        .from(studentsTable)
        .where(and(eq(studentsTable.isSample, true), inArray(studentsTable.schoolId, schoolIds)));
      sampleStudents = Number(stuCount?.n ?? 0);
      const [staffCount] = await db
        .select({ n: count() })
        .from(staffTable)
        .where(and(eq(staffTable.isSample, true), inArray(staffTable.schoolId, schoolIds)));
      sampleStaff = Number(staffCount?.n ?? 0);
    }
  }

  let mySandboxSessions = 0;
  const writerId = trainingWriterUserId(authed);
  if (writerId) {
    const [c] = await db
      .select({ n: count() })
      .from(sessionLogsTable)
      .where(and(
        eq(sessionLogsTable.isSandbox, true),
        eq(sessionLogsTable.sandboxUserId, writerId),
        isNull(sessionLogsTable.deletedAt),
      ));
    mySandboxSessions = Number(c?.n ?? 0);
  }

  const body: TrainingStatusResponse = {
    enabled,
    sandboxAvailable: sampleStudents > 0,
    mySandboxSessions,
    sampleStudents,
    sampleStaff,
  };
  res.json(body);
});

router.post("/training-mode/enable", requireAuth, async (req, res): Promise<void> => {
  const authed = req as unknown as AuthedRequest;
  if (!authed.userId) { res.status(401).json({ error: "Authentication required" }); return; }

  // Resolve the staff row by Clerk email. We deliberately do NOT trust
  // tenantStaffId here — the global middleware may have swapped it for the
  // sample persona if training mode was already enabled, and we want to
  // toggle the *real* user's row.
  const emails = await callerEmails(authed.userId);
  const staffRow = await findCallerStaffRow(authed.userId, emails);
  if (!staffRow) {
    res.status(403).json({ error: "Your account isn't linked to a staff record yet. Ask your district admin to add your email to the staff list, then sign in again." });
    return;
  }
  if (staffRow.districtId == null) {
    res.status(403).json({ error: "Your staff record isn't assigned to a school yet. Ask your district admin to assign you to a school." });
    return;
  }

  const personaId = await getTrainingPersonaStaffId(staffRow.districtId);
  if (personaId == null) {
    res.status(409).json({ error: "Training Mode needs sample data. Ask a district admin to load sample data first." });
    return;
  }

  await db.update(staffTable)
    .set({ trainingModeEnabled: true })
    .where(eq(staffTable.id, staffRow.id));
  invalidateTrainingFlagCache(authed.userId);
  logger.info({ userId: authed.userId, staffId: staffRow.id }, "training mode enabled");
  res.json({ ok: true, enabled: true });
});

router.post("/training-mode/disable", requireAuth, async (req, res): Promise<void> => {
  const authed = req as unknown as AuthedRequest;
  if (!authed.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const emails = await callerEmails(authed.userId);
  const staffRow = await findCallerStaffRow(authed.userId, emails);
  if (!staffRow) {
    // Nothing to disable — treat as success rather than 403, so a stale
    // client clicking "Exit" never gets stuck.
    res.json({ ok: true, enabled: false });
    return;
  }
  await db.update(staffTable)
    .set({ trainingModeEnabled: false })
    .where(eq(staffTable.id, staffRow.id));
  invalidateTrainingFlagCache(authed.userId);
  logger.info({ userId: authed.userId, staffId: staffRow.id }, "training mode disabled");
  res.json({ ok: true, enabled: false });
});

router.post("/training-mode/reset", requireAuth, async (req, res): Promise<void> => {
  const authed = req as unknown as AuthedRequest;
  if (!authed.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const writerId = trainingWriterUserId(authed);
  // Hard-delete the caller's sandbox session writes. These rows are tagged
  // is_sandbox=true and reference sample students, so they're safely
  // disposable — no real student data lives in them. We do NOT touch the
  // shared sample roster (students/staff) so other trainees keep their view.
  const result = await db
    .delete(sessionLogsTable)
    .where(and(
      eq(sessionLogsTable.isSandbox, true),
      eq(sessionLogsTable.sandboxUserId, writerId),
    ))
    .returning({ id: sessionLogsTable.id });
  // Drizzle's pg adapter returns `{ rowCount }` on plain SQL but for
  // returning() we just count the rows. Either is fine.
  const removed = result.length;
  // Best-effort: also wipe any data_sessions / session_goal_data /
  // behavior_data / program_data rows that hung off the sandbox sessions.
  // The sessions table is the load-bearing surface for the provider
  // screens we care about (Today's Schedule, session log, missed-session
  // log) so the simple delete above is the meaningful reset; richer
  // clinical-data cleanup can be added later if/when those flows are
  // brought into Training Mode.
  if (removed > 0) {
    await db.execute(sql`
      DELETE FROM session_goal_data
      WHERE session_log_id IN (
        SELECT id FROM session_logs
        WHERE is_sandbox = true AND sandbox_user_id = ${writerId}
      )
    `);
  }
  logger.info({ userId: authed.userId, removed }, "training mode sandbox reset");
  res.json({ ok: true, removed });
});

export default router;
