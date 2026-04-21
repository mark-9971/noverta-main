/**
 * Phase 1E — shared, district-scoped action-item handling state.
 *
 * Tests the round-trip that the pilot wedge depends on: a PUT from
 * one user is visible to a GET from another user *in the same district*,
 * and is invisible to a user in a different district.
 *
 * Also covers:
 *   - Setting `needs_action` deletes the row but still emits a history event.
 *   - Malformed itemId is rejected with 400.
 *   - Aggregate-by-student returns the worst-non-default state per student.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@workspace/db";
import { actionItemHandlingTable, actionItemHandlingEventsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  asUser,
  createDistrict,
  cleanupDistrict,
  seedLegalAcceptances,
  cleanupLegalAcceptances,
} from "./helpers";

describe("Phase 1E — action-item handling state (shared, district-scoped)", () => {
  let districtA: number;
  let districtB: number;

  const USER_IDS = ["u_a_admin1", "u_a_admin2", "u_b_admin"];

  beforeAll(async () => {
    const dA = await createDistrict({ name: "District A" });
    const dB = await createDistrict({ name: "District B" });
    districtA = dA.id;
    districtB = dB.id;
    await seedLegalAcceptances(USER_IDS);
  });

  afterAll(async () => {
    // Wipe handling rows for both districts before cleanupDistrict so
    // the FK cascade doesn't surprise anyone debugging.
    await db.delete(actionItemHandlingTable).where(eq(actionItemHandlingTable.districtId, districtA));
    await db.delete(actionItemHandlingTable).where(eq(actionItemHandlingTable.districtId, districtB));
    await db.delete(actionItemHandlingEventsTable).where(eq(actionItemHandlingEventsTable.districtId, districtA));
    await db.delete(actionItemHandlingEventsTable).where(eq(actionItemHandlingEventsTable.districtId, districtB));
    await cleanupLegalAcceptances(USER_IDS);
    await cleanupDistrict(districtA);
    await cleanupDistrict(districtB);
  });

  it("PUT then GET round-trips state within a district", async () => {
    const admin1 = asUser({ userId: "u_a_admin1", role: "admin", districtId: districtA });
    const itemId = "risk:101:55";

    const put = await admin1.put(`/api/action-item-handling/${encodeURIComponent(itemId)}`).send({
      state: "awaiting_confirmation",
      note: "asked the SLP to confirm",
    });
    expect(put.status).toBe(200);
    expect(put.body.data.state).toBe("awaiting_confirmation");

    const get = await admin1.get(`/api/action-item-handling?ids=${encodeURIComponent(itemId)}`);
    expect(get.status).toBe(200);
    expect(get.body.data).toHaveLength(1);
    expect(get.body.data[0].state).toBe("awaiting_confirmation");
    expect(get.body.data[0].note).toBe("asked the SLP to confirm");
  });

  it("a different user IN the same district sees the same state", async () => {
    const admin2 = asUser({ userId: "u_a_admin2", role: "admin", districtId: districtA });
    const get = await admin2.get(`/api/action-item-handling?ids=${encodeURIComponent("risk:101:55")}`);
    expect(get.status).toBe(200);
    expect(get.body.data).toHaveLength(1);
    expect(get.body.data[0].state).toBe("awaiting_confirmation");
  });

  it("a user in a DIFFERENT district sees nothing for the same itemId", async () => {
    const otherAdmin = asUser({ userId: "u_b_admin", role: "admin", districtId: districtB });
    const get = await otherAdmin.get(`/api/action-item-handling?ids=${encodeURIComponent("risk:101:55")}`);
    expect(get.status).toBe(200);
    expect(get.body.data).toHaveLength(0);
  });

  it("PUT in district A does not leak into district B even with the same itemId", async () => {
    const otherAdmin = asUser({ userId: "u_b_admin", role: "admin", districtId: districtB });
    // District B writes the SAME itemId — should land in B's row, not A's.
    const put = await otherAdmin.put(`/api/action-item-handling/risk:101:55`).send({
      state: "handed_off",
    });
    expect(put.status).toBe(200);
    expect(put.body.data.state).toBe("handed_off");

    // District A still sees its own value.
    const adminA = asUser({ userId: "u_a_admin1", role: "admin", districtId: districtA });
    const getA = await adminA.get(`/api/action-item-handling?ids=risk:101:55`);
    expect(getA.body.data[0].state).toBe("awaiting_confirmation");
  });

  it("setting needs_action deletes the row but still records a history event", async () => {
    const admin1 = asUser({ userId: "u_a_admin1", role: "admin", districtId: districtA });
    const itemId = "alert:9001";

    await admin1.put(`/api/action-item-handling/${itemId}`).send({ state: "under_review" });
    const clear = await admin1.put(`/api/action-item-handling/${itemId}`).send({ state: "needs_action" });
    expect(clear.status).toBe(200);

    const get = await admin1.get(`/api/action-item-handling?ids=${itemId}`);
    expect(get.body.data).toHaveLength(0);

    const history = await admin1.get(`/api/action-item-handling/${itemId}/history`);
    expect(history.status).toBe(200);
    // At least two events: needs_action→under_review, then under_review→needs_action.
    expect(history.body.data.length).toBeGreaterThanOrEqual(2);
    expect(history.body.data[0].toState).toBe("needs_action");
  });

  it("malformed itemIds are rejected with 400", async () => {
    const admin = asUser({ userId: "u_a_admin1", role: "admin", districtId: districtA });
    const res = await admin.put(`/api/action-item-handling/${encodeURIComponent("no-prefix-here")}`).send({ state: "under_review" });
    expect(res.status).toBe(400);
  });

  it("aggregate-by-student returns the worst non-default state per student", async () => {
    const admin = asUser({ userId: "u_a_admin1", role: "admin", districtId: districtA });
    // Student 202 gets two surfaces marked: handed_off and awaiting_confirmation.
    // awaiting_confirmation has higher severity → it should win.
    await admin.put(`/api/action-item-handling/risk:202:1`).send({ state: "handed_off" });
    await admin.put(`/api/action-item-handling/student:202:next-step`).send({ state: "awaiting_confirmation" });
    // Resolved row should be excluded.
    await admin.put(`/api/action-item-handling/service-gap:203:1`).send({ state: "resolved" });

    const agg = await admin.post(`/api/action-item-handling/aggregate-by-student`).send({
      studentIds: [202, 203, 999],
    });
    expect(agg.status).toBe(200);
    const byStudent = new Map<number, string>(agg.body.data.map((r: any) => [r.studentId, r.state]));
    expect(byStudent.get(202)).toBe("awaiting_confirmation");
    expect(byStudent.has(203)).toBe(false); // resolved is excluded server-side
    expect(byStudent.has(999)).toBe(false); // nothing recorded
  });

  it("para role is forbidden from reading or writing handling state", async () => {
    const para = asUser({ userId: "u_a_admin1", role: "para", districtId: districtA });
    const get = await para.get(`/api/action-item-handling?ids=risk:1:1`);
    expect(get.status).toBe(403);
    const put = await para.put(`/api/action-item-handling/risk:1:1`).send({ state: "under_review" });
    expect(put.status).toBe(403);
  });
});
