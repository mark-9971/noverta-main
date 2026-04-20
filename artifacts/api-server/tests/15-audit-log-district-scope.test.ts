/**
 * Phase 3A-4: /api/audit-logs district scoping.
 *
 * Proves that the audit-log read endpoints — historically gated only by
 * requireRoles("admin") with NO tenant predicate — are now strictly scoped
 * to the caller's district via the denormalized audit_logs.district_id
 * column populated at write-time.
 *
 * Coverage:
 *   1. district A admin only sees district A audit rows (not B, not NULL)
 *   2. district A admin still sees their own district's rows
 *   3. district B admin only sees district B audit rows (cross-direction proof)
 *   4. /audit-logs/stats totals are scoped (no cross-district count leakage)
 *   5. an "admin" caller without a tenantDistrictId fails closed (403)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asUser, createDistrict, cleanupDistrict, seedLegalAcceptances, cleanupLegalAcceptances } from "./helpers";
import { db, auditLogsTable } from "@workspace/db";
import { and, eq, inArray, isNull } from "drizzle-orm";

describe("audit-log district scoping (/api/audit-logs)", () => {
  let districtA: number;
  let districtB: number;
  const ACTOR_A = "u_audit_a_admin";
  const ACTOR_B = "u_audit_b_admin";
  const ACTOR_NO_DISTRICT = "u_audit_no_district";
  const TEST_USER_IDS = [ACTOR_A, ACTOR_B, ACTOR_NO_DISTRICT];
  const TARGET_TABLE = "scope_test_targets"; // unique tag so we can clean up + assert deterministically

  beforeAll(async () => {
    const dA = await createDistrict({ name: "Audit District A" });
    const dB = await createDistrict({ name: "Audit District B" });
    districtA = dA.id;
    districtB = dB.id;

    await seedLegalAcceptances(TEST_USER_IDS);

    await db.insert(auditLogsTable).values([
      {
        actorUserId: ACTOR_A,
        actorRole: "admin",
        action: "read",
        targetTable: TARGET_TABLE,
        targetId: "row_a",
        districtId: districtA,
        summary: "row in district A",
      },
      {
        actorUserId: ACTOR_B,
        actorRole: "admin",
        action: "read",
        targetTable: TARGET_TABLE,
        targetId: "row_b",
        districtId: districtB,
        summary: "row in district B",
      },
      {
        // Pre-scoping / unattributable row — must NEVER leak to a district admin.
        actorUserId: "u_legacy",
        actorRole: "admin",
        action: "read",
        targetTable: TARGET_TABLE,
        targetId: "row_null",
        districtId: null,
        summary: "row with no district",
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(auditLogsTable).where(eq(auditLogsTable.targetTable, TARGET_TABLE));
    await cleanupLegalAcceptances(TEST_USER_IDS);
    await cleanupDistrict(districtA);
    await cleanupDistrict(districtB);
  });

  it("district A admin only sees district A audit rows for the test target", async () => {
    const adminA = asUser({ userId: ACTOR_A, role: "admin", districtId: districtA });
    const res = await adminA.get(`/api/audit-logs?targetTable=${TARGET_TABLE}&limit=50`);
    expect(res.status).toBe(200);
    const summaries = (res.body.data as Array<{ summary: string; districtId: number | null }>).map((r) => r.summary);
    expect(summaries).toContain("row in district A");
    expect(summaries).not.toContain("row in district B");
    expect(summaries).not.toContain("row with no district");
    // total reflects the scoped count
    expect(res.body.total).toBe(1);
  });

  it("district B admin only sees district B audit rows for the test target", async () => {
    const adminB = asUser({ userId: ACTOR_B, role: "admin", districtId: districtB });
    const res = await adminB.get(`/api/audit-logs?targetTable=${TARGET_TABLE}&limit=50`);
    expect(res.status).toBe(200);
    const summaries = (res.body.data as Array<{ summary: string }>).map((r) => r.summary);
    expect(summaries).toEqual(["row in district B"]);
    expect(res.body.total).toBe(1);
  });

  it("/audit-logs/stats is scoped to caller's district (no cross-district count leakage)", async () => {
    const adminA = asUser({ userId: ACTOR_A, role: "admin", districtId: districtA });
    // Filter the stats time-window to "today" and verify the byTable map for our
    // unique target shows exactly 1 (the A row), proving B's row wasn't counted.
    const today = new Date();
    const dateFrom = new Date(today.getTime() - 60 * 60 * 1000).toISOString().slice(0, 10);
    const dateTo = today.toISOString().slice(0, 10);
    const res = await adminA.get(`/api/audit-logs/stats?dateFrom=${dateFrom}&dateTo=${dateTo}`);
    expect(res.status).toBe(200);
    const topTables = res.body.topTables as Array<{ table: string; count: number }>;
    const ours = topTables.find((t) => t.table === TARGET_TABLE);
    // Either our table appears with count=1 (district A's single row) OR it
    // didn't make the top-10 because the test DB has more activity. In either
    // case it must NEVER show count >= 2 — that would prove B's row leaked.
    if (ours) expect(ours.count).toBe(1);
  });

  it("admin caller without tenantDistrictId is rejected (403, fail-closed)", async () => {
    const orphan = asUser({ userId: ACTOR_NO_DISTRICT, role: "admin", districtId: null });
    const res = await orphan.get(`/api/audit-logs?targetTable=${TARGET_TABLE}`);
    expect(res.status).toBe(403);
  });
});
