/**
 * Task #951 — shared, district-scoped Action Center dismiss/snooze.
 *
 * Tests the round-trip + isolation guarantees the Action Center now
 * depends on:
 *   - POST then GET round-trips dismissal state within a district.
 *   - A different user in the SAME district sees the same hidden item.
 *   - A user in a DIFFERENT district sees nothing for the same itemId.
 *   - Expired snoozes are filtered out by GET.
 *   - DELETE restores an item; restore-all wipes a district.
 *   - Malformed itemId / missing dismissedUntil for snooze are rejected.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@workspace/db";
import { actionItemDismissalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  asUser,
  createDistrict,
  cleanupDistrict,
  seedLegalAcceptances,
  cleanupLegalAcceptances,
} from "./helpers";

describe("Task #951 — action-item dismissals (shared, district-scoped)", () => {
  let districtA: number;
  let districtB: number;

  const USER_IDS = ["u_dis_a1", "u_dis_a2", "u_dis_b"];

  beforeAll(async () => {
    const dA = await createDistrict({ name: "Dismissal District A" });
    const dB = await createDistrict({ name: "Dismissal District B" });
    districtA = dA.id;
    districtB = dB.id;
    await seedLegalAcceptances(USER_IDS);
  });

  afterAll(async () => {
    await db.delete(actionItemDismissalsTable).where(eq(actionItemDismissalsTable.districtId, districtA));
    await db.delete(actionItemDismissalsTable).where(eq(actionItemDismissalsTable.districtId, districtB));
    await cleanupLegalAcceptances(USER_IDS);
    await cleanupDistrict(districtA);
    await cleanupDistrict(districtB);
  });

  it("POST then GET round-trips dismissal within a district", async () => {
    const u = asUser({ userId: "u_dis_a1", role: "admin", districtId: districtA });
    const itemId = "alert:1001:overdue";
    const until = new Date(Date.now() + 60_000).toISOString();

    const post = await u.post("/api/action-item-dismissals").send({
      itemId,
      state: "dismissed",
      dismissedUntil: until,
      durationLabel: "auto-restore in 7d",
      snapshot: { title: "Overdue meeting", detail: "Smith — 2 days late" },
    });
    expect(post.status).toBe(200);
    expect(post.body.data.itemId).toBe(itemId);
    expect(post.body.data.state).toBe("dismissed");

    const get = await u.get(`/api/action-item-dismissals?ids=${encodeURIComponent(itemId)}`);
    expect(get.status).toBe(200);
    expect(get.body.data).toHaveLength(1);
    expect(get.body.data[0].snapshot.title).toBe("Overdue meeting");
  });

  it("a different user IN the same district sees the same hidden item", async () => {
    const u = asUser({ userId: "u_dis_a2", role: "case_manager", districtId: districtA });
    const get = await u.get(`/api/action-item-dismissals?ids=${encodeURIComponent("alert:1001:overdue")}`);
    expect(get.status).toBe(200);
    expect(get.body.data).toHaveLength(1);
  });

  it("a user in a DIFFERENT district sees nothing for the same itemId", async () => {
    const u = asUser({ userId: "u_dis_b", role: "admin", districtId: districtB });
    const get = await u.get(`/api/action-item-dismissals?ids=${encodeURIComponent("alert:1001:overdue")}`);
    expect(get.status).toBe(200);
    expect(get.body.data).toHaveLength(0);
  });

  it("expired snoozes are filtered out of GET", async () => {
    const u = asUser({ userId: "u_dis_a1", role: "admin", districtId: districtA });
    const itemId = "risk:202:7";
    // Backdate via direct DB insert to avoid relying on clock skew.
    await db.insert(actionItemDismissalsTable).values({
      districtId: districtA,
      itemId,
      state: "snoozed",
      dismissedUntil: new Date(Date.now() - 60_000),
      durationLabel: "1 day",
      updatedByUserId: "u_dis_a1",
      updatedByName: null,
      snapshotTitle: "stale",
      snapshotDetail: "stale",
    });
    const get = await u.get(`/api/action-item-dismissals?ids=${encodeURIComponent(itemId)}`);
    expect(get.status).toBe(200);
    expect(get.body.data).toHaveLength(0);
  });

  it("DELETE restores an item", async () => {
    const u = asUser({ userId: "u_dis_a1", role: "admin", districtId: districtA });
    const itemId = "alert:1001:overdue";
    const del = await u.delete(`/api/action-item-dismissals/${encodeURIComponent(itemId)}`);
    expect(del.status).toBe(200);
    const get = await u.get(`/api/action-item-dismissals?ids=${encodeURIComponent(itemId)}`);
    expect(get.body.data).toHaveLength(0);
  });

  it("rejects snoozed without dismissedUntil", async () => {
    const u = asUser({ userId: "u_dis_a1", role: "admin", districtId: districtA });
    const r = await u.post("/api/action-item-dismissals").send({
      itemId: "alert:1:nowhere",
      state: "snoozed",
      snapshot: { title: "x", detail: "y" },
    });
    expect(r.status).toBe(400);
  });

  it("rejects malformed item ids on GET", async () => {
    const u = asUser({ userId: "u_dis_a1", role: "admin", districtId: districtA });
    const r = await u.get(`/api/action-item-dismissals?ids=${encodeURIComponent("not a valid id")}`);
    expect(r.status).toBe(400);
  });

  it("re-upsert refreshes expiration without creating duplicates", async () => {
    const u = asUser({ userId: "u_dis_a1", role: "admin", districtId: districtA });
    const itemId = "deadline:303:iep";
    const first = new Date(Date.now() + 60_000).toISOString();
    const second = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    await u.post("/api/action-item-dismissals").send({
      itemId, state: "snoozed", dismissedUntil: first, durationLabel: "1 day",
      snapshot: { title: "t", detail: "d" },
    });
    await u.post("/api/action-item-dismissals").send({
      itemId, state: "snoozed", dismissedUntil: second, durationLabel: "3 days",
      snapshot: { title: "t", detail: "d" },
    });
    const rows = await db
      .select()
      .from(actionItemDismissalsTable)
      .where(eq(actionItemDismissalsTable.itemId, itemId));
    expect(rows).toHaveLength(1);
    expect(rows[0].durationLabel).toBe("3 days");
  });

  it("restore-all wipes the caller's district only", async () => {
    const a = asUser({ userId: "u_dis_a1", role: "admin", districtId: districtA });
    const b = asUser({ userId: "u_dis_b", role: "admin", districtId: districtB });
    // Seed both districts.
    await a.post("/api/action-item-dismissals").send({
      itemId: "alert:777:a", state: "dismissed",
      dismissedUntil: new Date(Date.now() + 60_000).toISOString(),
      durationLabel: "x", snapshot: { title: "a", detail: "a" },
    });
    await b.post("/api/action-item-dismissals").send({
      itemId: "alert:777:b", state: "dismissed",
      dismissedUntil: new Date(Date.now() + 60_000).toISOString(),
      durationLabel: "x", snapshot: { title: "b", detail: "b" },
    });
    const wipe = await a.post("/api/action-item-dismissals/restore-all").send({});
    expect(wipe.status).toBe(200);

    const aRows = await db.select().from(actionItemDismissalsTable).where(eq(actionItemDismissalsTable.districtId, districtA));
    const bRows = await db.select().from(actionItemDismissalsTable).where(eq(actionItemDismissalsTable.districtId, districtB));
    expect(aRows).toHaveLength(0);
    expect(bRows.length).toBeGreaterThan(0);
  });
});
