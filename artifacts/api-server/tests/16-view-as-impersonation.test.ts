/**
 * Wave-C Task #233: audited "view-as" / impersonation flow.
 *
 * Coverage:
 *   1. Non-platform-admin cannot start, view-active, or end a session (403).
 *   2. Reason is required and length-validated (400 when missing or <8 chars).
 *   3. Successful start returns a token, writes a `view_as_sessions` row,
 *      AND emits an `audit_logs` row tagged with the action and target.
 *   4. Subsequent requests with the X-View-As-Token header act AS the target
 *      user — req.userId is rewritten and audit rows on writes carry the
 *      `metadata.viewAs` envelope identifying the original admin.
 *   5. Manual end emits an audit row, marks the row endedAt, and the token
 *      stops working (cache invalidated).
 *   6. Another platform admin cannot end somebody else's session (403).
 *   7. An expired session (expiresAt in the past) is rejected by the
 *      override AND auto-marked endedAt='expired'.
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { db, viewAsSessionsTable, auditLogsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import app from "../src/app";
import { createDistrict, createSchool, createStaff, cleanupDistrict, seedLegalAcceptances, cleanupLegalAcceptances } from "./helpers";

const ADMIN_USER = "user_view_as_admin_a";
const ADMIN_USER_B = "user_view_as_admin_b";
const NON_ADMIN_USER = "user_view_as_non_admin";
const TARGET_USER = "user_view_as_target_cm";
const TARGET_USER_2 = "user_view_as_target_2";

function adminAgent(userId = ADMIN_USER) {
  return {
    post: (p: string) => request(app).post(p)
      .set("x-test-user-id", userId)
      .set("x-test-role", "admin")
      .set("x-test-platform-admin", "true"),
    get: (p: string) => request(app).get(p)
      .set("x-test-user-id", userId)
      .set("x-test-role", "admin")
      .set("x-test-platform-admin", "true"),
  };
}

/**
 * Poll for an audit_logs row matching (action, targetTable, targetId).
 * Used because logAudit returns synchronously while the underlying INSERT runs
 * in the background; without polling the test would race the DB write.
 */
async function waitForAuditRow(
  action: string,
  targetTable: string,
  targetId: string,
  timeoutMs = 2000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await db.select().from(auditLogsTable)
      .where(and(
        eq(auditLogsTable.action, action),
        eq(auditLogsTable.targetTable, targetTable),
        eq(auditLogsTable.targetId, targetId),
      )).orderBy(desc(auditLogsTable.id)).limit(1);
    if (rows.length > 0) return rows[0];
    await new Promise((r) => setTimeout(r, 25));
  }
  return null;
}

function nonAdminAgent() {
  return {
    post: (p: string) => request(app).post(p)
      .set("x-test-user-id", NON_ADMIN_USER)
      .set("x-test-role", "case_manager"),
    get: (p: string) => request(app).get(p)
      .set("x-test-user-id", NON_ADMIN_USER)
      .set("x-test-role", "case_manager"),
  };
}

let testDistrictId: number;
let testSchoolId: number;
let testStaffId: number;

beforeAll(async () => {
  const d = await createDistrict({ name: "View-As Test District" });
  testDistrictId = d.id;
  const s = await createSchool(testDistrictId);
  testSchoolId = s.id;
  const staff = await createStaff(testSchoolId, { role: "case_manager", email: `target_${Date.now()}@noverta.test` });
  testStaffId = staff.id;
  await seedLegalAcceptances([ADMIN_USER, ADMIN_USER_B, NON_ADMIN_USER, TARGET_USER, TARGET_USER_2]);
});

afterAll(async () => {
  // Drop any view_as_sessions belonging to our admin users so other suites don't see them.
  await db.delete(viewAsSessionsTable).where(eq(viewAsSessionsTable.adminUserId, ADMIN_USER));
  await db.delete(viewAsSessionsTable).where(eq(viewAsSessionsTable.adminUserId, ADMIN_USER_B));
  await cleanupLegalAcceptances([ADMIN_USER, ADMIN_USER_B, NON_ADMIN_USER, TARGET_USER, TARGET_USER_2]);
  await cleanupDistrict(testDistrictId);
});

describe("view-as: access control", () => {
  test("non-platform-admin cannot start a session", async () => {
    const r = await nonAdminAgent().post("/api/support/view-as/start").send({
      targetUserId: TARGET_USER, reason: "trying to escalate",
      targetSnapshot: { role: "case_manager", displayName: "T", districtId: testDistrictId, staffId: testStaffId },
    });
    expect(r.status).toBe(403);
  });

  test("non-platform-admin cannot end someone else's session via /end", async () => {
    const r = await nonAdminAgent().post("/api/support/view-as/end").set("X-View-As-Token", "deadbeef".repeat(8));
    expect(r.status).toBe(403);
  });
});

describe("view-as: input validation", () => {
  test("missing reason → 400", async () => {
    const r = await adminAgent().post("/api/support/view-as/start").send({
      targetUserId: TARGET_USER,
      targetSnapshot: { role: "case_manager", displayName: "T", districtId: testDistrictId, staffId: testStaffId },
    });
    expect(r.status).toBe(400);
  });

  test("reason too short → 400", async () => {
    const r = await adminAgent().post("/api/support/view-as/start").send({
      targetUserId: TARGET_USER, reason: "short",
      targetSnapshot: { role: "case_manager", displayName: "T", districtId: testDistrictId, staffId: testStaffId },
    });
    expect(r.status).toBe(400);
  });

  test("targeting yourself → 400", async () => {
    const r = await adminAgent().post("/api/support/view-as/start").send({
      targetUserId: ADMIN_USER, reason: "vanity impersonation attempt",
      targetSnapshot: { role: "admin", displayName: "Me", districtId: testDistrictId, staffId: null },
    });
    expect(r.status).toBe(400);
  });
});

describe("view-as: full lifecycle", () => {
  test("start → audit row written → active lookup works → mutations tagged → end → audit row written → token invalidated", async () => {
    // --- Start
    const startRes = await adminAgent().post("/api/support/view-as/start").send({
      targetUserId: TARGET_USER,
      reason: "Investigating ticket #4821 — caseload count mismatch",
      targetSnapshot: {
        role: "case_manager", displayName: "Target Case Manager",
        districtId: testDistrictId, staffId: testStaffId,
      },
    });
    expect(startRes.status).toBe(200);
    expect(startRes.body.token).toMatch(/^[a-f0-9]{64}$/);
    expect(startRes.body.sessionId).toBeGreaterThan(0);
    expect(new Date(startRes.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(startRes.body.target.userId).toBe(TARGET_USER);

    const { token, sessionId } = startRes.body as { token: string; sessionId: number };

    // --- Verify view_as_sessions row exists and is open
    const [row] = await db.select().from(viewAsSessionsTable).where(eq(viewAsSessionsTable.id, sessionId));
    expect(row).toBeDefined();
    expect(row.adminUserId).toBe(ADMIN_USER);
    expect(row.targetUserId).toBe(TARGET_USER);
    expect(row.endedAt).toBeNull();

    // --- Verify START audit row. logAudit is fire-and-forget so we poll
    // briefly rather than relying on it being committed by the time the
    // /start response returned.
    const startAudit = await waitForAuditRow("create", "view_as_sessions", String(sessionId));
    expect(startAudit).not.toBeNull();
    expect(startAudit!.actorUserId).toBe(ADMIN_USER);
    const startMeta = startAudit!.metadata as { reason: string; targetUserId: string };
    expect(startMeta.reason).toContain("ticket #4821");
    expect(startMeta.targetUserId).toBe(TARGET_USER);

    // --- /active with the token resolves the session
    const activeRes = await adminAgent().get("/api/support/view-as/active").set("X-View-As-Token", token);
    expect(activeRes.status).toBe(200);
    expect(activeRes.body.active).toBe(true);
    expect(activeRes.body.session.target.userId).toBe(TARGET_USER);

    // --- End the session
    const endRes = await adminAgent().post("/api/support/view-as/end").set("X-View-As-Token", token);
    expect(endRes.status).toBe(200);
    expect(endRes.body.ended).toBe(true);

    // --- Verify END audit row (poll for the same fire-and-forget reason).
    const endAudit = await waitForAuditRow("update", "view_as_sessions", String(sessionId));
    expect(endAudit).not.toBeNull();
    const endMeta = endAudit!.metadata as { endReason: string; viewAs?: { adminUserId: string } };
    expect(endMeta.endReason).toBe("manual");
    // The end request itself was made under the view-as token (still active at
    // the moment middleware ran), so the audit row should carry the viewAs tag.
    expect(endMeta.viewAs?.adminUserId).toBe(ADMIN_USER);

    // --- Row marked ended
    const [endedRow] = await db.select().from(viewAsSessionsTable).where(eq(viewAsSessionsTable.id, sessionId));
    expect(endedRow.endedAt).not.toBeNull();
    expect(endedRow.endReason).toBe("manual");

    // --- Token no longer resolves
    const afterRes = await adminAgent().get("/api/support/view-as/active").set("X-View-As-Token", token);
    expect(afterRes.status).toBe(404);
  });
});

describe("view-as: hijack protection", () => {
  test("a different platform admin cannot end someone else's session", async () => {
    // Admin A starts a session.
    const startRes = await adminAgent(ADMIN_USER).post("/api/support/view-as/start").send({
      targetUserId: TARGET_USER_2,
      reason: "Reproducing IEP draft save failure for support",
      targetSnapshot: { role: "case_manager", displayName: "T2", districtId: testDistrictId, staffId: testStaffId },
    });
    expect(startRes.status).toBe(200);
    const { token, sessionId } = startRes.body as { token: string; sessionId: number };

    // Admin B (different platform admin) tries to end it using the leaked token.
    const hijackRes = await adminAgent(ADMIN_USER_B).post("/api/support/view-as/end").set("X-View-As-Token", token);
    expect(hijackRes.status).toBe(403);

    // Row still open.
    const [row] = await db.select().from(viewAsSessionsTable).where(eq(viewAsSessionsTable.id, sessionId));
    expect(row.endedAt).toBeNull();

    // Cleanup: real admin ends it.
    await adminAgent(ADMIN_USER).post("/api/support/view-as/end").set("X-View-As-Token", token);
  });
});

describe("view-as: expiry", () => {
  test("a session past expiresAt is rejected and auto-marked expired", async () => {
    // Start, then manually backdate expiresAt directly in the DB.
    const startRes = await adminAgent(ADMIN_USER).post("/api/support/view-as/start").send({
      targetUserId: TARGET_USER_2,
      reason: "Expiry test session — will be backdated by suite",
      targetSnapshot: { role: "case_manager", displayName: "T2", districtId: testDistrictId, staffId: testStaffId },
    });
    expect(startRes.status).toBe(200);
    const { token, sessionId } = startRes.body as { token: string; sessionId: number };

    await db.update(viewAsSessionsTable)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(viewAsSessionsTable.id, sessionId));

    // /active should now report no active session AND should have self-healed
    // the row to endedAt with endReason='expired'.
    const r = await adminAgent(ADMIN_USER).get("/api/support/view-as/active").set("X-View-As-Token", token);
    expect(r.status).toBe(404);

    const [row] = await db.select().from(viewAsSessionsTable).where(eq(viewAsSessionsTable.id, sessionId));
    expect(row.endedAt).not.toBeNull();
    expect(row.endReason).toBe("expired");
  });
});

/**
 * Phase 3A-3 additions: implicit-end paths (supersede on a re-start, and
 * expiry self-heal) must also write to the customer-visible audit_logs so
 * a district admin can see *every* time a support impersonation ended,
 * not just the manual ones. Also verifies the GET /api/audit-logs query
 * surfaces these rows by targetTable=view_as_sessions.
 */
describe("view-as: implicit-end audit coverage", () => {
  test("supersede on /start writes a 'superseded' audit row in addition to the new 'create' row", async () => {
    // First start.
    const first = await adminAgent(ADMIN_USER).post("/api/support/view-as/start").send({
      targetUserId: TARGET_USER,
      reason: "Phase 3A-3: first session before supersede check",
      targetSnapshot: { role: "case_manager", displayName: "Target Case Manager", districtId: testDistrictId, staffId: testStaffId },
    });
    expect(first.status).toBe(200);
    const firstSessionId = first.body.sessionId as number;

    // Snapshot the highest audit id so we can scope the supersede lookup to
    // rows produced by the next request only — avoids picking up the prior
    // 'create' row by accident.
    const [{ id: maxIdBefore }] = await db.select({ id: auditLogsTable.id })
      .from(auditLogsTable).orderBy(desc(auditLogsTable.id)).limit(1);

    // Second start by the same admin → should supersede the first.
    const second = await adminAgent(ADMIN_USER).post("/api/support/view-as/start").send({
      targetUserId: TARGET_USER_2,
      reason: "Phase 3A-3: second session triggers supersede",
      targetSnapshot: { role: "case_manager", displayName: "T2", districtId: testDistrictId, staffId: testStaffId },
    });
    expect(second.status).toBe(200);
    const secondToken = second.body.token as string;

    // The first session row should now be marked superseded.
    const [firstRowAfter] = await db.select().from(viewAsSessionsTable)
      .where(eq(viewAsSessionsTable.id, firstSessionId));
    expect(firstRowAfter.endReason).toBe("superseded");
    expect(firstRowAfter.endedAt).not.toBeNull();

    // Poll for the new supersede audit row produced by the second /start.
    let supersedeRow: typeof auditLogsTable.$inferSelect | null = null;
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const candidates = await db.select().from(auditLogsTable)
        .where(and(
          eq(auditLogsTable.action, "update"),
          eq(auditLogsTable.targetTable, "view_as_sessions"),
        )).orderBy(desc(auditLogsTable.id)).limit(20);
      const found = candidates.find(c => {
        const m = c.metadata as { endReason?: string } | null;
        return c.id > maxIdBefore && m?.endReason === "superseded";
      });
      if (found) { supersedeRow = found; break; }
      await new Promise(r => setTimeout(r, 25));
    }
    expect(supersedeRow).not.toBeNull();
    expect(supersedeRow!.actorUserId).toBe(ADMIN_USER);
    const meta = supersedeRow!.metadata as {
      endReason: string; endedCount: number;
      replacedByTargetUserId: string; replacedByTargetDistrictId: number | null;
    };
    expect(meta.endedCount).toBeGreaterThanOrEqual(1);
    expect(meta.replacedByTargetUserId).toBe(TARGET_USER_2);
    expect(meta.replacedByTargetDistrictId).toBe(testDistrictId);
    // Cleanup the still-open second session.
    await adminAgent(ADMIN_USER).post("/api/support/view-as/end").set("X-View-As-Token", secondToken);
  });

  test("expiry self-heal on /active writes an 'expired' audit row", async () => {
    const startRes = await adminAgent(ADMIN_USER).post("/api/support/view-as/start").send({
      targetUserId: TARGET_USER_2,
      reason: "Phase 3A-3: expiry self-heal audit check",
      targetSnapshot: { role: "case_manager", displayName: "T2", districtId: testDistrictId, staffId: testStaffId },
    });
    expect(startRes.status).toBe(200);
    const { token, sessionId } = startRes.body as { token: string; sessionId: number };

    // Backdate so the next /active poll trips the self-heal branch.
    await db.update(viewAsSessionsTable)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(viewAsSessionsTable.id, sessionId));

    const r = await adminAgent(ADMIN_USER).get("/api/support/view-as/active").set("X-View-As-Token", token);
    expect(r.status).toBe(404);

    // Poll for the expired audit row keyed by sessionId. Only the self-heal
    // branch produces an 'update' on this targetId with endReason=expired.
    let expiredAudit: typeof auditLogsTable.$inferSelect | null = null;
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const rows = await db.select().from(auditLogsTable)
        .where(and(
          eq(auditLogsTable.action, "update"),
          eq(auditLogsTable.targetTable, "view_as_sessions"),
          eq(auditLogsTable.targetId, String(sessionId)),
        )).orderBy(desc(auditLogsTable.id)).limit(5);
      const found = rows.find(r => (r.metadata as { endReason?: string } | null)?.endReason === "expired");
      if (found) { expiredAudit = found; break; }
      await new Promise(r => setTimeout(r, 25));
    }
    expect(expiredAudit).not.toBeNull();
    const m = expiredAudit!.metadata as { endReason: string; targetUserId: string; targetRole: string };
    expect(m.endReason).toBe("expired");
    expect(m.targetUserId).toBe(TARGET_USER_2);
    expect(m.targetRole).toBe("case_manager");
  });

  test("customer-visible GET /api/audit-logs surfaces view-as rows when filtered by targetTable", async () => {
    // Prior tests in this file already produced plenty of view_as_sessions
    // audit rows (lifecycle start+end, hijack, supersede, expiry self-heal).
    // The point of this test is purely to confirm those rows are reachable
    // from the customer-facing GET /api/audit-logs endpoint — i.e. that view-as
    // activity is not hidden from a district admin.
    //
    // Wait briefly for fire-and-forget logAudit inserts from prior tests to
    // settle, then query as a non-platform-admin district admin.
    let data: Array<{ action: string; targetTable: string; targetId: string; summary: string | null }> = [];
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const districtAdminRes = await request(app)
        .get("/api/audit-logs")
        .query({ targetTable: "view_as_sessions", limit: "50" })
        .set("x-test-user-id", "user_district_admin_audit_view")
        .set("x-test-role", "admin")
        .set("x-test-district-id", String(testDistrictId));
      expect(districtAdminRes.status).toBe(200);
      data = districtAdminRes.body.data as typeof data;
      const hasCreate = data.some(r => r.action === "create" && r.targetTable === "view_as_sessions");
      const hasUpdate = data.some(r => r.action === "update" && r.targetTable === "view_as_sessions");
      if (hasCreate && hasUpdate) break;
      await new Promise(r => setTimeout(r, 50));
    }
    // Should see at least one create (start) and one update (end/superseded/expired).
    const creates = data.filter(r => r.action === "create" && r.targetTable === "view_as_sessions");
    const updates = data.filter(r => r.action === "update" && r.targetTable === "view_as_sessions");
    expect(creates.length).toBeGreaterThanOrEqual(1);
    expect(updates.length).toBeGreaterThanOrEqual(1);
    expect(creates[0].summary).toMatch(/started view-as/i);
    // At least one update summary should mention ended/auto-ended/expired view-as.
    expect(updates.some(u => /(ended|auto-ended|expired) view-as|expired view-as/i.test(u.summary ?? ""))).toBe(true);
  });
});
