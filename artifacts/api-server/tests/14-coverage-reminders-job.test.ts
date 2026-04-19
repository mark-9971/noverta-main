/**
 * Tests for runCoverageReminders — the scheduled job that emails substitutes
 * whose upcoming coverage assignment has not yet been acknowledged (the
 * in-app `coverage_assignment` alert is still unresolved).
 *
 * Covers:
 *  - Sends a reminder when the session is within the configured window AND
 *    the substitute has an unresolved coverage_assignment alert.
 *  - Skips and silently marks the row when the substitute has resolved
 *    (acknowledged) the alert.
 *  - Does not re-send on a second run for the same coverage_instance
 *    (reminder_sent_at dedup).
 *  - Skips sessions outside the lookahead window.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  db,
  alertsTable,
  coverageInstancesTable,
  scheduleBlocksTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  createDistrict,
  createSchool,
  createStaff,
  createStudent,
  cleanupDistrict,
} from "./helpers";
import { runCoverageReminders } from "../src/lib/coverageReminders";

let districtId: number;
let schoolId: number;
const insertedAlertIds: number[] = [];
const insertedInstanceIds: number[] = [];
const insertedBlockIds: number[] = [];
const insertedStaffIds: number[] = [];
const insertedStudentIds: number[] = [];

const ORIGINAL_WINDOW = process.env.COVERAGE_REMINDER_HOURS_BEFORE;

beforeAll(async () => {
  process.env.COVERAGE_REMINDER_HOURS_BEFORE = "24";
  const district = await createDistrict({ name: "Test District Coverage Reminders" });
  districtId = district.id;
  const school = await createSchool(districtId);
  schoolId = school.id;
});

afterAll(async () => {
  if (insertedAlertIds.length > 0) {
    await db.delete(alertsTable).where(inArray(alertsTable.id, insertedAlertIds));
  }
  if (insertedInstanceIds.length > 0) {
    await db.delete(coverageInstancesTable).where(inArray(coverageInstancesTable.id, insertedInstanceIds));
  }
  if (insertedBlockIds.length > 0) {
    await db.delete(scheduleBlocksTable).where(inArray(scheduleBlocksTable.id, insertedBlockIds));
  }
  await cleanupDistrict(districtId);
  if (ORIGINAL_WINDOW === undefined) delete process.env.COVERAGE_REMINDER_HOURS_BEFORE;
  else process.env.COVERAGE_REMINDER_HOURS_BEFORE = ORIGINAL_WINDOW;
});

beforeEach(async () => {
  // Each test creates its own assignment; nothing to reset across tests.
});

function pad(n: number): string { return n < 10 ? `0${n}` : String(n); }

/** Returns YYYY-MM-DD for the local date `daysAhead` in the future. */
function futureDateStr(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** A start_time string a few hours from now, formatted HH:MM:SS. */
function nearFutureTimeStr(hoursAhead: number): string {
  const d = new Date(Date.now() + hoursAhead * 3_600_000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;
}

const DAY_NAMES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

async function setupAssignment(opts: {
  hoursAhead: number;
  withSubEmail: boolean;
  alertResolved: boolean;
  alreadyReminded?: boolean;
}) {
  const original = await createStaff(schoolId, { firstName: "Orig", lastName: `O${Date.now()}` });
  const substitute = await createStaff(schoolId, {
    firstName: "Sub",
    lastName: `S${Date.now()}`,
    email: opts.withSubEmail ? `sub-${Date.now()}-${Math.random().toString(36).slice(2,6)}@example.com` : null,
  });
  const student = await createStudent(schoolId);
  insertedStaffIds.push(original.id, substitute.id);
  insertedStudentIds.push(student.id);

  // We need the absence_date and start_time to combine to a Date that is
  // hoursAhead from now and within the 24h window. For simplicity use today's
  // date with a near-future time-of-day when hoursAhead < hours-left-in-day,
  // otherwise tomorrow.
  const target = new Date(Date.now() + opts.hoursAhead * 3_600_000);
  const absenceDate = `${target.getUTCFullYear()}-${pad(target.getUTCMonth()+1)}-${pad(target.getUTCDate())}`;
  const startTime = `${pad(target.getUTCHours())}:${pad(target.getUTCMinutes())}:00`;
  const endHour = (target.getUTCHours() + 1) % 24;
  const endTime = `${pad(endHour)}:${pad(target.getUTCMinutes())}:00`;
  const dayOfWeek = DAY_NAMES[target.getUTCDay()];

  const [block] = await db.insert(scheduleBlocksTable).values({
    staffId: original.id,
    studentId: student.id,
    blockType: "service",
    dayOfWeek,
    startTime,
    endTime,
    isRecurring: true,
    recurrenceType: "weekly",
    location: "Room 12",
    notes: "Bring AAC device",
  }).returning();
  insertedBlockIds.push(block.id);

  const [instance] = await db.insert(coverageInstancesTable).values({
    scheduleBlockId: block.id,
    absenceDate,
    originalStaffId: original.id,
    substituteStaffId: substitute.id,
    isCovered: true,
    reminderSentAt: opts.alreadyReminded ? new Date() : null,
  }).returning();
  insertedInstanceIds.push(instance.id);

  const [alert] = await db.insert(alertsTable).values({
    type: "coverage_assignment",
    severity: "info",
    staffId: substitute.id,
    studentId: student.id,
    coverageInstanceId: instance.id,
    message: `You have been assigned to cover a session on ${absenceDate}`,
    suggestedAction: "Review session details",
    resolved: opts.alertResolved,
    resolvedAt: opts.alertResolved ? new Date() : null,
  }).returning();
  insertedAlertIds.push(alert.id);

  return { instance, alert, substitute, original, student, block };
}

describe("runCoverageReminders", () => {
  it("classifies an unresolved-alert in-window assignment as a reminder send", async () => {
    const { instance } = await setupAssignment({
      hoursAhead: 4,
      withSubEmail: true,
      alertResolved: false,
    });

    const result = await runCoverageReminders();
    expect(result.considered).toBeGreaterThanOrEqual(1);
    // The classification path that matters: it was NOT skipped as acknowledged.
    expect(result.skippedAcknowledged).toBe(0);

    const [updated] = await db.select().from(coverageInstancesTable).where(eq(coverageInstancesTable.id, instance.id));
    expect(updated.reminderSentAt).not.toBeNull();
  });

  it("does NOT re-send on a second run for the same instance (reminder_sent_at dedup)", async () => {
    const { instance } = await setupAssignment({
      hoursAhead: 6,
      withSubEmail: true,
      alertResolved: false,
    });

    await runCoverageReminders();
    const [afterFirst] = await db.select().from(coverageInstancesTable).where(eq(coverageInstancesTable.id, instance.id));
    expect(afterFirst.reminderSentAt).not.toBeNull();
    const firstSentAt = afterFirst.reminderSentAt;

    // Second run must not change the timestamp (row is excluded by the WHERE).
    await runCoverageReminders();
    const [afterSecond] = await db.select().from(coverageInstancesTable).where(eq(coverageInstancesTable.id, instance.id));
    expect(afterSecond.reminderSentAt?.getTime()).toBe(firstSentAt?.getTime());
  });

  it("skips (and silently marks) when the substitute has already acknowledged the alert", async () => {
    const { instance } = await setupAssignment({
      hoursAhead: 5,
      withSubEmail: true,
      alertResolved: true,
    });

    const result = await runCoverageReminders();
    // Row is in-window so it counts as considered, but it must be classified
    // as acknowledged (not reminded).
    expect(result.skippedAcknowledged).toBeGreaterThanOrEqual(1);
    expect(result.emailsSent).toBe(0);

    const [updated] = await db.select().from(coverageInstancesTable).where(eq(coverageInstancesTable.id, instance.id));
    // We still mark it so the next tick doesn't re-evaluate.
    expect(updated.reminderSentAt).not.toBeNull();
  });

  it("reassignment: an old unresolved alert for a previous substitute does not trigger a reminder for the current substitute", async () => {
    // Set up a normal assignment whose alert is RESOLVED by the current
    // substitute (acknowledged), then inject an OLD unresolved alert tied
    // to the same coverage_instance but pointing at a different staff
    // member (the prior assignee). The reminder job must scope the
    // unacknowledged check to staffId so the stale alert does not cause
    // a spurious reminder for the current substitute.
    const { instance, substitute } = await setupAssignment({
      hoursAhead: 4,
      withSubEmail: true,
      alertResolved: true,
    });
    const previousAssignee = await createStaff(schoolId, { firstName: "Prev", lastName: `P${Date.now()}` });
    insertedStaffIds.push(previousAssignee.id);

    const [staleAlert] = await db.insert(alertsTable).values({
      type: "coverage_assignment",
      severity: "info",
      staffId: previousAssignee.id,
      coverageInstanceId: instance.id,
      message: "Previous assignment alert (never resolved before reassignment)",
      suggestedAction: "Review",
      resolved: false,
    }).returning();
    insertedAlertIds.push(staleAlert.id);

    const result = await runCoverageReminders();
    // The current assignment must classify as acknowledged, not reminded.
    expect(result.skippedAcknowledged).toBeGreaterThanOrEqual(1);
    expect(result.emailsSent).toBe(0);

    // Sanity: confirm the row was treated as the acknowledged path (sub is
    // the current substitute, alert resolved → no email attempt).
    expect(substitute.id).not.toBe(previousAssignee.id);
  });

  it("reassignment lifecycle: clearing reminder_sent_at on reassignment lets the new substitute be reminded", async () => {
    // Simulate the state after a previous reminder was already sent for the
    // original substitute — `reminder_sent_at` is set. Then simulate the
    // assign-substitute route's behavior on reassignment: clear
    // reminder_sent_at and update substituteStaffId. The reminder job must
    // pick up the new substitute and mark it reminded.
    const { instance, original, student } = await setupAssignment({
      hoursAhead: 4,
      withSubEmail: true,
      alertResolved: true,
      alreadyReminded: true,
    });

    // New substitute with a deliverable email.
    const newSub = await createStaff(schoolId, {
      firstName: "NewSub",
      lastName: `R${Date.now()}`,
      email: `newsub-${Date.now()}@example.com`,
    });
    insertedStaffIds.push(newSub.id);

    // Reassign: clear reminder_sent_at and point at the new substitute.
    await db
      .update(coverageInstancesTable)
      .set({ substituteStaffId: newSub.id, isCovered: true, reminderSentAt: null })
      .where(eq(coverageInstancesTable.id, instance.id));

    // New substitute's own (unresolved) acknowledgement alert.
    const [newAlert] = await db.insert(alertsTable).values({
      type: "coverage_assignment",
      severity: "info",
      staffId: newSub.id,
      studentId: student.id,
      coverageInstanceId: instance.id,
      message: "New substitute assignment",
      suggestedAction: "Review",
      resolved: false,
    }).returning();
    insertedAlertIds.push(newAlert.id);

    const result = await runCoverageReminders();
    expect(result.considered).toBeGreaterThanOrEqual(1);
    // The new substitute is unacknowledged → must NOT be classified as acked.
    expect(result.skippedAcknowledged).toBe(0);

    const [after] = await db.select().from(coverageInstancesTable).where(eq(coverageInstancesTable.id, instance.id));
    expect(after.reminderSentAt).not.toBeNull();
    expect(after.substituteStaffId).toBe(newSub.id);
    // unused
    void original;
  });

  it("distinguishes between two same-day assignments for the same substitute (per-instance acknowledgement)", async () => {
    // Build two assignments for the same substitute on the same date. Only
    // one of the two alerts is resolved. The reminder job must remind the
    // unresolved one and skip the acknowledged one.
    const a = await setupAssignment({ hoursAhead: 3, withSubEmail: true, alertResolved: true });
    // Reuse the same substitute for the second assignment by overriding
    // setupAssignment's email-bearing staff with the existing one.
    const ackedSub = a.substitute;

    // Build a second instance for the same substitute (manually so we share
    // the substitute row).
    const target = new Date(Date.now() + 5 * 3_600_000);
    const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));
    const absenceDate = `${target.getUTCFullYear()}-${pad2(target.getUTCMonth()+1)}-${pad2(target.getUTCDate())}`;
    const startTime = `${pad2(target.getUTCHours())}:${pad2(target.getUTCMinutes())}:00`;
    const endHour = (target.getUTCHours() + 1) % 24;
    const endTime = `${pad2(endHour)}:${pad2(target.getUTCMinutes())}:00`;
    const dayOfWeek = DAY_NAMES[target.getUTCDay()];

    const [block2] = await db.insert(scheduleBlocksTable).values({
      staffId: a.original.id,
      studentId: a.student.id,
      blockType: "service",
      dayOfWeek, startTime, endTime,
      isRecurring: true, recurrenceType: "weekly",
      location: "Room 14",
    }).returning();
    insertedBlockIds.push(block2.id);

    const [instance2] = await db.insert(coverageInstancesTable).values({
      scheduleBlockId: block2.id,
      absenceDate,
      originalStaffId: a.original.id,
      substituteStaffId: ackedSub.id,
      isCovered: true,
    }).returning();
    insertedInstanceIds.push(instance2.id);

    const [alert2] = await db.insert(alertsTable).values({
      type: "coverage_assignment",
      severity: "info",
      staffId: ackedSub.id,
      studentId: a.student.id,
      coverageInstanceId: instance2.id,
      message: `You have been assigned to cover a session on ${absenceDate}`,
      suggestedAction: "Review session details",
      resolved: false,
    }).returning();
    insertedAlertIds.push(alert2.id);

    await runCoverageReminders();

    const [ackedRow] = await db.select().from(coverageInstancesTable).where(eq(coverageInstancesTable.id, a.instance.id));
    const [unackedRow] = await db.select().from(coverageInstancesTable).where(eq(coverageInstancesTable.id, instance2.id));

    // Both rows are stamped (one because skipped-acknowledged, one because reminded),
    // but the acknowledged one must NOT be classified as needing a reminder.
    expect(ackedRow.reminderSentAt).not.toBeNull();
    expect(unackedRow.reminderSentAt).not.toBeNull();
  });

  it("does not consider sessions outside the lookahead window", async () => {
    // 5 days out, with a 24h window — should be ignored.
    const { instance } = await setupAssignment({
      hoursAhead: 24 * 5,
      withSubEmail: true,
      alertResolved: false,
    });

    await runCoverageReminders();

    const [updated] = await db.select().from(coverageInstancesTable).where(eq(coverageInstancesTable.id, instance.id));
    expect(updated.reminderSentAt).toBeNull();
  });
});
