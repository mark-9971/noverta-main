/**
 * Tests for runOverdueSessionLogCheck — the scheduled job that scans recurring
 * weekly schedule_blocks and creates overdue_session_log alerts (and optional
 * digest emails) for sessions that should have been logged 2–7 weekdays ago
 * but weren't.
 *
 * Covers:
 *  - Creates an alert for a recurring weekly block with no matching session
 *    log inside the 2–7 weekday lookback window.
 *  - Sends a digest email (communication_events row) to the responsible staff
 *    when at least one log is missing.
 *  - Deduplication: a second run does not create a duplicate alert for the
 *    same (staffId, studentId, date) tuple.
 *  - Suppression: an existing recent (<24h) successful digest event prevents
 *    a second digest email from being sent.
 *  - No alert is created for a date that already has a session log.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  db,
  scheduleBlocksTable,
  alertsTable,
  sessionLogsTable,
  communicationEventsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import {
  createDistrict,
  createSchool,
  createStudent,
  createStaff,
  createServiceType,
  cleanupDistrict,
  cleanupServiceType,
} from "./helpers";
import { runOverdueSessionLogCheck } from "../src/lib/reminders";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

let districtId: number;
let schoolId: number;
let serviceTypeId: number;
const insertedBlockIds: number[] = [];
const insertedSessionIds: number[] = [];
const insertedStudentIds: number[] = [];
const insertedStaffIds: number[] = [];

/** The set of (date, weekday) tuples that the job will look at when it runs now. */
function expectedCheckWindow(): { date: string; dayName: string }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out: { date: string; dayName: string }[] = [];
  for (let i = 2; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dayName = DAY_NAMES[d.getDay()];
    if (dayName === "saturday" || dayName === "sunday") continue;
    out.push({ date: d.toISOString().substring(0, 10), dayName });
  }
  return out;
}

beforeAll(async () => {
  const district = await createDistrict({ name: "Test District Overdue SessionLogs" });
  districtId = district.id;
  const school = await createSchool(districtId);
  schoolId = school.id;
  const svc = await createServiceType();
  serviceTypeId = svc.id;
});

afterAll(async () => {
  if (insertedStaffIds.length > 0) {
    await db.delete(communicationEventsTable).where(inArray(communicationEventsTable.staffId, insertedStaffIds));
    await db.delete(alertsTable).where(inArray(alertsTable.staffId, insertedStaffIds));
  }
  if (insertedStudentIds.length > 0) {
    await db.delete(communicationEventsTable).where(inArray(communicationEventsTable.studentId, insertedStudentIds));
  }
  if (insertedSessionIds.length > 0) {
    await db.delete(sessionLogsTable).where(inArray(sessionLogsTable.id, insertedSessionIds));
  }
  if (insertedBlockIds.length > 0) {
    await db.delete(scheduleBlocksTable).where(inArray(scheduleBlocksTable.id, insertedBlockIds));
  }
  await cleanupServiceType(serviceTypeId);
  await cleanupDistrict(districtId);
});

async function makeRecurringBlocks(staffId: number, studentId: number) {
  // Create one weekly block per weekday so at least one falls in the lookback
  // window regardless of which weekday "today" happens to be.
  const longAgo = new Date();
  longAgo.setUTCFullYear(longAgo.getUTCFullYear() - 1);
  const effectiveFrom = longAgo.toISOString().substring(0, 10);

  for (const dayName of WEEKDAYS) {
    const [b] = await db.insert(scheduleBlocksTable).values({
      staffId,
      studentId,
      serviceTypeId,
      dayOfWeek: dayName,
      startTime: "09:00",
      endTime: "09:30",
      blockLabel: "Test Block",
      blockType: "service",
      isRecurring: true,
      recurrenceType: "weekly",
      effectiveFrom,
    }).returning();
    insertedBlockIds.push(b.id);
  }
}

async function fetchAlerts(staffId: number, studentId: number) {
  return db
    .select()
    .from(alertsTable)
    .where(
      and(
        eq(alertsTable.type, "overdue_session_log"),
        eq(alertsTable.staffId, staffId),
        eq(alertsTable.studentId, studentId),
      )
    );
}

async function fetchDigestEvents(staffId: number) {
  return db
    .select()
    .from(communicationEventsTable)
    .where(
      and(
        eq(communicationEventsTable.staffId, staffId),
        eq(communicationEventsTable.type, "overdue_session_log_reminder"),
      )
    );
}

describe("runOverdueSessionLogCheck", () => {
  it("creates an overdue_session_log alert for a recurring block with no matching session log", async () => {
    const student = await createStudent(schoolId);
    insertedStudentIds.push(student.id);
    const staff = await createStaff(schoolId, { email: `osl-${Date.now()}@example.com` });
    insertedStaffIds.push(staff.id);
    await makeRecurringBlocks(staff.id, student.id);

    await runOverdueSessionLogCheck();

    const alerts = await fetchAlerts(staff.id, student.id);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0].severity).toMatch(/medium|high|critical/);
    expect(alerts[0].message).toMatch(/\[ref:\d{4}-\d{2}-\d{2}\]/);
    expect(alerts[0].resolved).toBe(false);
  });

  it("sends a digest email (communication_events row) to the responsible staff", async () => {
    const student = await createStudent(schoolId);
    insertedStudentIds.push(student.id);
    const staff = await createStaff(schoolId, { email: `osl-digest-${Date.now()}@example.com` });
    insertedStaffIds.push(staff.id);
    await makeRecurringBlocks(staff.id, student.id);

    await runOverdueSessionLogCheck();

    const events = await fetchDigestEvents(staff.id);
    expect(events.length).toBe(1);
    expect(events[0].toEmail).toBe(staff.email);
  });

  it("does NOT create a duplicate alert when the job runs twice", async () => {
    const student = await createStudent(schoolId);
    insertedStudentIds.push(student.id);
    const staff = await createStaff(schoolId, { email: `osl-dedupe-${Date.now()}@example.com` });
    insertedStaffIds.push(staff.id);
    await makeRecurringBlocks(staff.id, student.id);

    await runOverdueSessionLogCheck();
    const after1 = await fetchAlerts(staff.id, student.id);
    await runOverdueSessionLogCheck();
    const after2 = await fetchAlerts(staff.id, student.id);

    expect(after2.length).toBe(after1.length);
  });

  it("does NOT create an alert for a date that already has a matching session log", async () => {
    const student = await createStudent(schoolId);
    insertedStudentIds.push(student.id);
    const staff = await createStaff(schoolId, { email: `osl-logged-${Date.now()}@example.com` });
    insertedStaffIds.push(staff.id);
    await makeRecurringBlocks(staff.id, student.id);

    // Pre-log a session for every (date, weekday) tuple in the lookback window.
    // Result: nothing should be missing for this tuple.
    for (const cd of expectedCheckWindow()) {
      const [log] = await db.insert(sessionLogsTable).values({
        studentId: student.id,
        staffId: staff.id,
        serviceTypeId,
        sessionDate: cd.date,
        durationMinutes: 30,
        status: "completed",
      }).returning();
      insertedSessionIds.push(log.id);
    }

    await runOverdueSessionLogCheck();

    const alerts = await fetchAlerts(staff.id, student.id);
    expect(alerts.length).toBe(0);
  });

  it("suppresses a second digest email when one was already sent in the last 24h", async () => {
    const student = await createStudent(schoolId);
    insertedStudentIds.push(student.id);
    const staff = await createStaff(schoolId, { email: `osl-suppress-${Date.now()}@example.com` });
    insertedStaffIds.push(staff.id);
    await makeRecurringBlocks(staff.id, student.id);

    // Pre-insert a successful digest event so the job's recent-sends gate
    // believes a digest already went out.
    const now = new Date();
    await db.insert(communicationEventsTable).values({
      studentId: student.id,
      staffId: staff.id,
      channel: "email",
      status: "sent",
      type: "overdue_session_log_reminder",
      subject: "Pre-existing digest",
      toEmail: staff.email,
      sentAt: now,
    });

    await runOverdueSessionLogCheck();

    // Only the pre-seeded one should exist; the job did not append a fresh row.
    const events = await fetchDigestEvents(staff.id);
    expect(events.length).toBe(1);
    expect(events[0].subject).toBe("Pre-existing digest");
  });
});
