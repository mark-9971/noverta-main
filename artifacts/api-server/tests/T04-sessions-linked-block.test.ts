/**
 * T04 — Linked-block path integration test.
 *
 * Proves the canonical wedge close-the-loop flow that the makeup-log
 * dialog uses: the client passes a `scheduleBlockId` (and NOT a raw
 * sourceActionItemId — the client generally doesn't know the carrier
 * id format), and the server:
 *
 *   1. Looks up the block.
 *   2. Verifies it belongs to the same student in the caller's district.
 *   3. Inherits the block's `sourceActionItemId` onto the session log.
 *   4. Auto-resolves the matching shared handling row.
 *
 * Also covers the cross-student safety check: a block that points at a
 * different student must be rejected.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  db,
  scheduleBlocksTable,
  actionItemHandlingTable,
  actionItemHandlingEventsTable,
  sessionLogsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  asUser,
  createDistrict,
  createSchool,
  createStaff,
  createStudent,
  createServiceType,
  cleanupDistrict,
  cleanupServiceType,
} from "./helpers";

let districtId: number;
let schoolId: number;
let serviceTypeId: number;
let providerStaffId: number;
let studentA: number;
let studentB: number;
let blockWithCarrier: number;
let blockWrongStudent: number;

const ITEM_LINKED = "alert:t04-linked-block";
const insertedSessionIds: number[] = [];

beforeAll(async () => {
  const d = await createDistrict({ name: "T04 Linked Block" });
  districtId = d.id;
  const sc = await createSchool(districtId);
  schoolId = sc.id;
  const svc = await createServiceType();
  serviceTypeId = svc.id;
  const provider = await createStaff(schoolId, { role: "provider" });
  providerStaffId = provider.id;
  const sA = await createStudent(schoolId);
  studentA = sA.id;
  const sB = await createStudent(schoolId);
  studentB = sB.id;

  // Block on studentA carrying the action-item id (the "makeup slot")
  const [b1] = await db.insert(scheduleBlocksTable).values({
    staffId: providerStaffId,
    studentId: studentA,
    serviceTypeId,
    dayOfWeek: "monday",
    startTime: "09:00",
    endTime: "09:30",
    blockLabel: "Makeup",
    blockType: "makeup",
    isRecurring: false,
    sourceActionItemId: ITEM_LINKED,
    effectiveFrom: "2026-04-01",
  }).returning();
  blockWithCarrier = b1.id;

  // Block on studentB — used for the cross-student rejection test
  const [b2] = await db.insert(scheduleBlocksTable).values({
    staffId: providerStaffId,
    studentId: studentB,
    serviceTypeId,
    dayOfWeek: "tuesday",
    startTime: "10:00",
    endTime: "10:30",
    blockLabel: "Other",
    blockType: "service",
    isRecurring: false,
    effectiveFrom: "2026-04-01",
  }).returning();
  blockWrongStudent = b2.id;
});

afterAll(async () => {
  if (insertedSessionIds.length > 0) {
    await db.delete(sessionLogsTable).where(inArray(sessionLogsTable.id, insertedSessionIds));
  }
  await db.delete(scheduleBlocksTable).where(
    inArray(scheduleBlocksTable.id, [blockWithCarrier, blockWrongStudent]),
  );
  await db.delete(actionItemHandlingEventsTable).where(eq(actionItemHandlingEventsTable.itemId, ITEM_LINKED));
  await db.delete(actionItemHandlingTable).where(eq(actionItemHandlingTable.itemId, ITEM_LINKED));
  await cleanupServiceType(serviceTypeId);
  await cleanupDistrict(districtId);
});

async function readRow(itemId: string) {
  const rows = await db
    .select()
    .from(actionItemHandlingTable)
    .where(
      and(
        eq(actionItemHandlingTable.districtId, districtId),
        eq(actionItemHandlingTable.itemId, itemId),
      ),
    );
  return rows[0] ?? null;
}

describe("T04 — POST /sessions linked-block path", () => {
  it("derives sourceActionItemId from scheduleBlockId, persists it on the log, and auto-resolves the item", async () => {
    const provider = asUser({ userId: "user_t04_linked", role: "provider", districtId });
    const res = await provider.post("/api/sessions").send({
      studentId: studentA,
      staffId: providerStaffId,
      serviceTypeId,
      sessionDate: "2026-04-20",
      durationMinutes: 30,
      status: "completed",
      isMakeup: true,
      // NOTE: client does NOT send sourceActionItemId — the server
      // must derive it from the linked block.
      scheduleBlockId: blockWithCarrier,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTypeOf("number");
    // Server-derived link must be persisted on the session log.
    expect(res.body.sourceActionItemId).toBe(ITEM_LINKED);
    insertedSessionIds.push(res.body.id);

    // And the corresponding shared handling row must have been
    // transitioned to "resolved" by the auto-resolve helper.
    const row = await readRow(ITEM_LINKED);
    expect(row).not.toBeNull();
    expect(row!.state).toBe("resolved");
    expect(row!.updatedByUserId).toBe("user_t04_linked");
  });

  it("rejects scheduleBlockId pointing at a different student", async () => {
    const provider = asUser({ userId: "user_t04_linked_xstudent", role: "provider", districtId });
    const res = await provider.post("/api/sessions").send({
      studentId: studentA,
      staffId: providerStaffId,
      serviceTypeId,
      sessionDate: "2026-04-21",
      durationMinutes: 30,
      status: "completed",
      isMakeup: true,
      scheduleBlockId: blockWrongStudent,
    });
    expect(res.status).toBe(400);
    expect(String(res.body.error || "")).toMatch(/different student/i);
  });
});
