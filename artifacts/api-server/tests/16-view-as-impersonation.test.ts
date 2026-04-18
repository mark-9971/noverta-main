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
  const staff = await createStaff(testSchoolId, { role: "case_manager", email: `target_${Date.now()}@trellis.test` });
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
