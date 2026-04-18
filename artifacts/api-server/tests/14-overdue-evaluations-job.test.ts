/**
 * Tests for runOverdueEvaluations — the scheduled job that emails the lead
 * evaluator when an evaluation's due date has passed and it isn't completed.
 *
 * Covers:
 *  - A communication_events row of type=overdue_evaluation_reminder is created
 *    for an overdue, non-completed evaluation that has a lead evaluator.
 *  - Skipping behavior: completed evaluations, missing leadEvaluatorId, and
 *    leadEvaluator without an email all suppress the email.
 *  - Deduplication: a second run within 24h does not create a duplicate event.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  db,
  evaluationsTable,
  communicationEventsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import {
  createDistrict,
  createSchool,
  createStudent,
  createStaff,
  cleanupDistrict,
} from "./helpers";
import { runOverdueEvaluations } from "../src/lib/reminders";

let districtId: number;
let schoolId: number;
const insertedEvalIds: number[] = [];
const insertedStudentIds: number[] = [];

function yesterdayStr(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 5);
  return d.toISOString().substring(0, 10);
}

beforeAll(async () => {
  const district = await createDistrict({ name: "Test District Overdue Evals" });
  districtId = district.id;
  const school = await createSchool(districtId);
  schoolId = school.id;
});

afterAll(async () => {
  if (insertedStudentIds.length > 0) {
    await db.delete(communicationEventsTable).where(inArray(communicationEventsTable.studentId, insertedStudentIds));
  }
  if (insertedEvalIds.length > 0) {
    await db.delete(evaluationsTable).where(inArray(evaluationsTable.id, insertedEvalIds));
  }
  await cleanupDistrict(districtId);
});

async function createOverdueEval(opts: { studentId: number; leadEvaluatorId: number | null; status?: string }) {
  const [ev] = await db.insert(evaluationsTable).values({
    studentId: opts.studentId,
    leadEvaluatorId: opts.leadEvaluatorId,
    evaluationType: "initial",
    dueDate: yesterdayStr(),
    status: opts.status ?? "pending",
  }).returning();
  insertedEvalIds.push(ev.id);
  return ev;
}

async function fetchReminderEvents(studentId: number) {
  return db
    .select()
    .from(communicationEventsTable)
    .where(
      and(
        eq(communicationEventsTable.studentId, studentId),
        eq(communicationEventsTable.type, "overdue_evaluation_reminder"),
      )
    );
}

beforeEach(() => {
  // Each test creates fresh entities; we just keep tracking them so cleanup works.
});

describe("runOverdueEvaluations", () => {
  it("creates an overdue_evaluation_reminder for an overdue, non-completed evaluation", async () => {
    const student = await createStudent(schoolId);
    insertedStudentIds.push(student.id);
    const staff = await createStaff(schoolId, { email: `eval-lead-${Date.now()}@example.com` });
    await createOverdueEval({ studentId: student.id, leadEvaluatorId: staff.id });

    await runOverdueEvaluations();

    const events = await fetchReminderEvents(student.id);
    expect(events.length).toBe(1);
    expect(events[0].toEmail).toBe(staff.email);
    expect(events[0].staffId).toBe(staff.id);
    // Without RESEND_API_KEY in tests, the row lands in "not_configured" — but
    // it still exists, which is what we care about for the dedupe contract.
    expect(["not_configured", "queued", "accepted", "sent"]).toContain(events[0].status);
  });

  it("does NOT email when the evaluation is already completed", async () => {
    const student = await createStudent(schoolId);
    insertedStudentIds.push(student.id);
    const staff = await createStaff(schoolId, { email: `eval-done-${Date.now()}@example.com` });
    await createOverdueEval({ studentId: student.id, leadEvaluatorId: staff.id, status: "completed" });

    await runOverdueEvaluations();

    const events = await fetchReminderEvents(student.id);
    expect(events.length).toBe(0);
  });

  it("does NOT email when there is no lead evaluator assigned", async () => {
    const student = await createStudent(schoolId);
    insertedStudentIds.push(student.id);
    await createOverdueEval({ studentId: student.id, leadEvaluatorId: null });

    await runOverdueEvaluations();

    const events = await fetchReminderEvents(student.id);
    expect(events.length).toBe(0);
  });

  it("does NOT email when the lead evaluator has no email address", async () => {
    const student = await createStudent(schoolId);
    insertedStudentIds.push(student.id);
    const staff = await createStaff(schoolId); // no email
    await createOverdueEval({ studentId: student.id, leadEvaluatorId: staff.id });

    await runOverdueEvaluations();

    const events = await fetchReminderEvents(student.id);
    expect(events.length).toBe(0);
  });

  it("deduplicates within the 24h window — second run creates no new event", async () => {
    const student = await createStudent(schoolId);
    insertedStudentIds.push(student.id);
    const staff = await createStaff(schoolId, { email: `eval-dedupe-${Date.now()}@example.com` });
    await createOverdueEval({ studentId: student.id, leadEvaluatorId: staff.id });

    await runOverdueEvaluations();
    await runOverdueEvaluations();

    const events = await fetchReminderEvents(student.id);
    expect(events.length).toBe(1);
  });
});
