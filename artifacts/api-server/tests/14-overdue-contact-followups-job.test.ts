/**
 * Tests for runOverdueContactFollowups — the scheduled job that emails the
 * student's primary guardian when a parent_contacts row has follow_up_needed=
 * 'yes' and follow_up_date is in the past.
 *
 * Covers:
 *  - A communication_events row of type=overdue_followup_reminder is created
 *    when an overdue follow-up has a guardian email.
 *  - No email is sent when the student has no guardian email (and no fallback
 *    parent email on the student row).
 *  - Deduplication: a second run within 24h doesn't insert a duplicate event.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  db,
  parentContactsTable,
  guardiansTable,
  communicationEventsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import {
  createDistrict,
  createSchool,
  createStudent,
  cleanupDistrict,
} from "./helpers";
import { runOverdueContactFollowups } from "../src/lib/reminders";

let districtId: number;
let schoolId: number;
const insertedStudentIds: number[] = [];
const insertedContactIds: number[] = [];
const insertedGuardianIds: number[] = [];

function pastDateStr(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 3);
  return d.toISOString().substring(0, 10);
}

beforeAll(async () => {
  const district = await createDistrict({ name: "Test District Overdue Followups" });
  districtId = district.id;
  const school = await createSchool(districtId);
  schoolId = school.id;
});

afterAll(async () => {
  if (insertedStudentIds.length > 0) {
    await db.delete(communicationEventsTable).where(inArray(communicationEventsTable.studentId, insertedStudentIds));
  }
  if (insertedContactIds.length > 0) {
    await db.delete(parentContactsTable).where(inArray(parentContactsTable.id, insertedContactIds));
  }
  if (insertedGuardianIds.length > 0) {
    await db.delete(guardiansTable).where(inArray(guardiansTable.id, insertedGuardianIds));
  }
  await cleanupDistrict(districtId);
});

async function makeOverdueContact(studentId: number) {
  const [c] = await db.insert(parentContactsTable).values({
    studentId,
    contactType: "phone_call",
    contactDate: pastDateStr(),
    contactMethod: "phone",
    subject: "Test follow-up",
    followUpNeeded: "yes",
    followUpDate: pastDateStr(),
    contactedBy: "Test Staff",
  }).returning();
  insertedContactIds.push(c.id);
  return c;
}

async function fetchReminderEvents(studentId: number) {
  return db
    .select()
    .from(communicationEventsTable)
    .where(
      and(
        eq(communicationEventsTable.studentId, studentId),
        eq(communicationEventsTable.type, "overdue_followup_reminder"),
      )
    );
}

describe("runOverdueContactFollowups", () => {
  it("creates an overdue_followup_reminder when a guardian email exists", async () => {
    const student = await createStudent(schoolId);
    insertedStudentIds.push(student.id);
    const [guardian] = await db.insert(guardiansTable).values({
      studentId: student.id,
      name: "Test Guardian",
      relationship: "parent",
      email: `guardian-${Date.now()}@example.com`,
      contactPriority: 1,
    }).returning();
    insertedGuardianIds.push(guardian.id);
    await makeOverdueContact(student.id);

    await runOverdueContactFollowups();

    const events = await fetchReminderEvents(student.id);
    expect(events.length).toBe(1);
    expect(events[0].toEmail).toBe(guardian.email);
    expect(events[0].guardianId).toBe(guardian.id);
  });

  it("does NOT send a reminder when the student has no guardian/parent email", async () => {
    const student = await createStudent(schoolId); // no parentEmail
    insertedStudentIds.push(student.id);
    await makeOverdueContact(student.id);

    await runOverdueContactFollowups();

    const events = await fetchReminderEvents(student.id);
    expect(events.length).toBe(0);
  });

  it("deduplicates within the 24h window per linkedContactId", async () => {
    const student = await createStudent(schoolId);
    insertedStudentIds.push(student.id);
    const [guardian] = await db.insert(guardiansTable).values({
      studentId: student.id,
      name: "Dedupe Guardian",
      relationship: "parent",
      email: `dedupe-${Date.now()}@example.com`,
      contactPriority: 1,
    }).returning();
    insertedGuardianIds.push(guardian.id);
    await makeOverdueContact(student.id);

    await runOverdueContactFollowups();
    await runOverdueContactFollowups();

    const events = await fetchReminderEvents(student.id);
    expect(events.length).toBe(1);
  });
});
