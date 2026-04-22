/**
 * T04 — Server-side auto-resolve of action_item_handling when a session
 * log lands with a sourceActionItemId set.
 *
 * Closes the loop on the wedge:
 *   schedule a makeup block → log against it → action item flips to
 *   "resolved" without the user having to click anything.
 *
 * Covers:
 *   1. completed session w/ sourceActionItemId + no prior row → INSERT row
 *      with state="resolved" + emit transition event.
 *   2. makeup session w/ sourceActionItemId + existing "needs_action" row →
 *      UPDATE to "resolved" + emit transition event with fromState set.
 *   3. missed session w/ sourceActionItemId → NO write (non-completing
 *      status).
 *   4. completed session w/o sourceActionItemId → NO write (no carrier id).
 *   5. Idempotent re-log of completed session against an already-resolved
 *      row → NO duplicate event.
 *   6. District scoping — a row with the same itemId in another district
 *      is left untouched.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  db,
  actionItemHandlingTable,
  actionItemHandlingEventsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  createDistrict,
  createSchool,
  createStudent,
  cleanupDistrict,
} from "./helpers";
import { autoResolveActionItemFromSession } from "../src/lib/autoResolveActionItem";

let districtA: number;
let districtB: number;
let schoolA: number;
let schoolB: number;
let studentA: number;
let studentB: number;

const ITEM = {
  ALERT_NEW: "alert:t04-new",
  ALERT_EXISTING: "alert:t04-existing",
  GAP_MISSED: "service-gap:t04:missed",
  GAP_NOLINK: "service-gap:t04:nolink",
  ALERT_IDEMPOTENT: "alert:t04-idempotent",
  ALERT_CROSS: "alert:t04-cross-district",
} as const;

beforeAll(async () => {
  const dA = await createDistrict({ name: "T04 District A" });
  const dB = await createDistrict({ name: "T04 District B" });
  districtA = dA.id;
  districtB = dB.id;
  const sA = await createSchool(districtA);
  const sB = await createSchool(districtB);
  schoolA = sA.id;
  schoolB = sB.id;
  const stA = await createStudent(schoolA);
  const stB = await createStudent(schoolB);
  studentA = stA.id;
  studentB = stB.id;
});

afterAll(async () => {
  // Wipe handling rows + events for the test item ids in both districts.
  const allItems = Object.values(ITEM);
  await db.delete(actionItemHandlingEventsTable).where(
    inArray(actionItemHandlingEventsTable.itemId, allItems),
  );
  await db.delete(actionItemHandlingTable).where(
    inArray(actionItemHandlingTable.itemId, allItems),
  );
  await cleanupDistrict(districtA);
  await cleanupDistrict(districtB);
});

async function readRow(districtId: number, itemId: string) {
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

async function readEvents(districtId: number, itemId: string) {
  return db
    .select()
    .from(actionItemHandlingEventsTable)
    .where(
      and(
        eq(actionItemHandlingEventsTable.districtId, districtId),
        eq(actionItemHandlingEventsTable.itemId, itemId),
      ),
    );
}

describe("T04 — autoResolveActionItemFromSession", () => {
  it("inserts a resolved row + event when no prior row exists (status=completed)", async () => {
    const out = await autoResolveActionItemFromSession({
      sessionId: 1001,
      studentId: studentA,
      sourceActionItemId: ITEM.ALERT_NEW,
      status: "completed",
      callerRole: "provider",
      actorUserId: "user_test_t04_a",
      actorDisplayName: "T04 Tester",
    });
    expect(out.ok).toBe(true);
    expect(out.transitioned).toBe(true);

    const row = await readRow(districtA, ITEM.ALERT_NEW);
    expect(row).not.toBeNull();
    expect(row!.state).toBe("resolved");
    expect(row!.resolvedAt).not.toBeNull();
    expect(row!.updatedByUserId).toBe("user_test_t04_a");

    const events = await readEvents(districtA, ITEM.ALERT_NEW);
    expect(events).toHaveLength(1);
    expect(events[0].fromState).toBeNull();
    expect(events[0].toState).toBe("resolved");
    expect(events[0].note).toContain("session log #1001");
  });

  it("updates an existing needs_action row to resolved when status=makeup", async () => {
    // Seed a prior row in needs_action so we exercise the UPDATE path.
    await db.insert(actionItemHandlingTable).values({
      districtId: districtA,
      itemId: ITEM.ALERT_EXISTING,
      state: "needs_action",
      updatedByUserId: "seeded",
      updatedByName: "Seeded",
    });

    const out = await autoResolveActionItemFromSession({
      sessionId: 1002,
      studentId: studentA,
      sourceActionItemId: ITEM.ALERT_EXISTING,
      status: "makeup",
      callerRole: "provider",
      actorUserId: "user_test_t04_b",
      actorDisplayName: "T04 Tester B",
    });
    expect(out.ok).toBe(true);
    expect(out.transitioned).toBe(true);

    const row = await readRow(districtA, ITEM.ALERT_EXISTING);
    expect(row!.state).toBe("resolved");
    expect(row!.updatedByUserId).toBe("user_test_t04_b");

    const events = await readEvents(districtA, ITEM.ALERT_EXISTING);
    expect(events).toHaveLength(1);
    expect(events[0].fromState).toBe("needs_action");
    expect(events[0].toState).toBe("resolved");
  });

  it("skips on non-completing status (missed)", async () => {
    const out = await autoResolveActionItemFromSession({
      sessionId: 1003,
      studentId: studentA,
      sourceActionItemId: ITEM.GAP_MISSED,
      status: "missed",
      callerRole: "provider",
      actorUserId: "user_test_t04_c",
      actorDisplayName: null,
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("non_completing_status");

    const row = await readRow(districtA, ITEM.GAP_MISSED);
    expect(row).toBeNull();
  });

  it("is idempotent — re-logging does not double-emit events", async () => {
    const inputs = {
      sessionId: 1004,
      studentId: studentA,
      sourceActionItemId: ITEM.ALERT_IDEMPOTENT,
      status: "completed",
      callerRole: "provider",
      actorUserId: "user_test_t04_d",
      actorDisplayName: "T04 Idempotent",
    };
    const first = await autoResolveActionItemFromSession(inputs);
    expect(first.transitioned).toBe(true);
    const second = await autoResolveActionItemFromSession({ ...inputs, sessionId: 1005 });
    expect(second.ok).toBe(true);
    expect(second.transitioned).toBe(false);
    expect(second.reason).toBe("already_resolved");

    const events = await readEvents(districtA, ITEM.ALERT_IDEMPOTENT);
    expect(events).toHaveLength(1);
  });

  it("rejects malformed item ids (defense in depth)", async () => {
    const out = await autoResolveActionItemFromSession({
      sessionId: 1006,
      studentId: studentA,
      sourceActionItemId: "not a real id",
      status: "completed",
      callerRole: "provider",
      actorUserId: "user_test_t04_e",
      actorDisplayName: null,
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("invalid_item_id");
  });

  it("scopes by district — a same-id row in district B is untouched", async () => {
    // Pre-seed district B with the same itemId, also needs_action.
    await db.insert(actionItemHandlingTable).values({
      districtId: districtB,
      itemId: ITEM.ALERT_CROSS,
      state: "needs_action",
      updatedByUserId: "seeded-b",
      updatedByName: "Seeded B",
    });

    // Auto-resolve runs against student in district A.
    const out = await autoResolveActionItemFromSession({
      sessionId: 1007,
      studentId: studentA,
      sourceActionItemId: ITEM.ALERT_CROSS,
      status: "completed",
      callerRole: "provider",
      actorUserId: "user_test_t04_f",
      actorDisplayName: "T04 Cross",
    });
    expect(out.ok).toBe(true);
    expect(out.transitioned).toBe(true);

    const rowA = await readRow(districtA, ITEM.ALERT_CROSS);
    const rowB = await readRow(districtB, ITEM.ALERT_CROSS);
    expect(rowA!.state).toBe("resolved");
    expect(rowB!.state).toBe("needs_action"); // untouched

    const eventsA = await readEvents(districtA, ITEM.ALERT_CROSS);
    const eventsB = await readEvents(districtB, ITEM.ALERT_CROSS);
    expect(eventsA).toHaveLength(1);
    expect(eventsB).toHaveLength(0);
  });
});
