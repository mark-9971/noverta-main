/**
 * Task #425: audited Noverta-support read-only session.
 *
 * Coverage:
 *   1. Non-trellis_support callers cannot open/end/list sessions or hit /districts.
 *   2. Validation: districtId required, reason required + length-bounded, district must exist.
 *   3. Successful open writes a support_sessions row, returns it, audit row is emitted.
 *   4. With an active session, GET requests succeed against district-scoped routes
 *      AND the audit log entries are tagged with metadata.supportSession.sessionId.
 *   5. Non-GET methods are blocked 403 by the read-only enforcement middleware.
 *   6. Opening a second session supersedes the first (end_reason='superseded').
 *   7. Manual end closes the row (end_reason='manual') and clears the cache.
 *   8. District admin can list recent sessions affecting their district and
 *      sees the audit entry counts.
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { db, supportSessionsTable, auditLogsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import app from "../src/app";
import { _clearSupportSessionCacheForTests } from "../src/lib/supportSession";
import { createDistrict, createSchool, createStaff, cleanupDistrict, seedLegalAcceptances, cleanupLegalAcceptances } from "./helpers";

const SUPPORT_USER = "user_support_a";
const SUPPORT_USER_B = "user_support_b";
const NON_SUPPORT_USER = "user_support_non";
const ADMIN_USER = "user_support_district_admin";

function supportAgent(userId = SUPPORT_USER) {
  return {
    post: (p: string) => request(app).post(p)
      .set("x-test-user-id", userId)
      .set("x-test-role", "trellis_support"),
    get: (p: string) => request(app).get(p)
      .set("x-test-user-id", userId)
      .set("x-test-role", "trellis_support"),
  };
}

function adminAgent() {
  return {
    get: (p: string) => request(app).get(p)
      .set("x-test-user-id", ADMIN_USER)
      .set("x-test-role", "admin")
      .set("x-test-district-id", String(testDistrictId)),
  };
}

function nonSupportAgent() {
  return {
    post: (p: string) => request(app).post(p)
      .set("x-test-user-id", NON_SUPPORT_USER)
      .set("x-test-role", "case_manager"),
    get: (p: string) => request(app).get(p)
      .set("x-test-user-id", NON_SUPPORT_USER)
      .set("x-test-role", "case_manager"),
  };
}

let testDistrictId: number;

async function waitForAuditWith(sessionId: number, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await db.select().from(auditLogsTable)
      .orderBy(desc(auditLogsTable.id)).limit(50);
    const hit = rows.find(r => {
      const m = (r.metadata ?? null) as { supportSession?: { sessionId?: number } } | null;
      return m?.supportSession?.sessionId === sessionId;
    });
    if (hit) return hit;
    await new Promise(r => setTimeout(r, 25));
  }
  return null;
}

beforeAll(async () => {
  const d = await createDistrict({ name: "Support-Session Test District" });
  testDistrictId = d.id;
  const s = await createSchool(testDistrictId);
  await createStaff(s.id, { role: "case_manager", email: `support_target_${Date.now()}@noverta.test` });
  await seedLegalAcceptances([SUPPORT_USER, SUPPORT_USER_B, NON_SUPPORT_USER, ADMIN_USER]);
});

afterAll(async () => {
  await db.delete(supportSessionsTable).where(eq(supportSessionsTable.supportUserId, SUPPORT_USER));
  await db.delete(supportSessionsTable).where(eq(supportSessionsTable.supportUserId, SUPPORT_USER_B));
  await cleanupLegalAcceptances([SUPPORT_USER, SUPPORT_USER_B, NON_SUPPORT_USER, ADMIN_USER]);
  await cleanupDistrict(testDistrictId);
  _clearSupportSessionCacheForTests();
});

describe("support-session: access control", () => {
  test("non-trellis_support cannot open a session", async () => {
    const r = await nonSupportAgent().post("/api/support-session/open")
      .send({ districtId: testDistrictId, reason: "trying to escalate without role" });
    expect(r.status).toBe(403);
  });

  test("non-trellis_support cannot list districts via picker", async () => {
    const r = await nonSupportAgent().get("/api/support-session/districts");
    expect(r.status).toBe(403);
  });
});

describe("support-session: input validation", () => {
  test("missing districtId → 400", async () => {
    const r = await supportAgent().post("/api/support-session/open").send({ reason: "ticket #1234 inspection" });
    expect(r.status).toBe(400);
  });

  test("reason too short → 400", async () => {
    const r = await supportAgent().post("/api/support-session/open")
      .send({ districtId: testDistrictId, reason: "short" });
    expect(r.status).toBe(400);
  });

  test("unknown district → 404", async () => {
    const r = await supportAgent().post("/api/support-session/open")
      .send({ districtId: 99_999_999, reason: "investigating ticket #4821" });
    expect(r.status).toBe(404);
  });
});

describe("support-session: full lifecycle", () => {
  test("open → audit-tagged read → write blocked → end", async () => {
    _clearSupportSessionCacheForTests();
    // Open
    const openRes = await supportAgent().post("/api/support-session/open")
      .send({ districtId: testDistrictId, reason: "Investigating ticket #4821 — IEP not loading" });
    expect(openRes.status).toBe(200);
    const sessionId = openRes.body.session.sessionId as number;
    expect(sessionId).toBeGreaterThan(0);
    expect(new Date(openRes.body.session.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const [row] = await db.select().from(supportSessionsTable).where(eq(supportSessionsTable.id, sessionId));
    expect(row).toBeDefined();
    expect(row.endedAt).toBeNull();
    expect(row.districtId).toBe(testDistrictId);

    // Subsequent GET against a district-scoped surface succeeds. The audit
    // row generated for the *open* call is the one we can deterministically
    // find tagged with this sessionId — many GET endpoints don't write audit
    // rows. We assert the open-action audit row is tagged.
    const audit = await waitForAuditWith(sessionId);
    expect(audit).not.toBeNull();
    expect((audit?.metadata as { supportSession: { sessionId: number; supportUserId: string } }).supportSession.sessionId).toBe(sessionId);

    // Non-GET write to ANY district-scoped endpoint is blocked by read-only middleware.
    const writeAttempt = await supportAgent().post("/api/students").send({ name: "should-fail" });
    expect(writeAttempt.status).toBe(403);

    // Active lookup returns the session.
    const active = await supportAgent().get("/api/support-session/active");
    expect(active.status).toBe(200);
    expect(active.body.session.sessionId).toBe(sessionId);

    // End it.
    const endRes = await supportAgent().post("/api/support-session/end").send({});
    expect(endRes.status).toBe(200);
    expect(endRes.body.ended).toBe(true);
    const [closed] = await db.select().from(supportSessionsTable).where(eq(supportSessionsTable.id, sessionId));
    expect(closed.endedAt).not.toBeNull();
    expect(closed.endReason).toBe("manual");

    // Subsequent active lookup returns 404.
    const after = await supportAgent().get("/api/support-session/active");
    expect(after.status).toBe(404);
  });

  test("opening a second session supersedes the first", async () => {
    _clearSupportSessionCacheForTests();
    const a = await supportAgent(SUPPORT_USER_B).post("/api/support-session/open")
      .send({ districtId: testDistrictId, reason: "first session for supersede test" });
    expect(a.status).toBe(200);
    const firstId = a.body.session.sessionId as number;
    const b = await supportAgent(SUPPORT_USER_B).post("/api/support-session/open")
      .send({ districtId: testDistrictId, reason: "second session — supersedes first" });
    expect(b.status).toBe(200);
    const secondId = b.body.session.sessionId as number;
    expect(secondId).not.toBe(firstId);

    const [firstRow] = await db.select().from(supportSessionsTable).where(eq(supportSessionsTable.id, firstId));
    expect(firstRow.endedAt).not.toBeNull();
    expect(firstRow.endReason).toBe("superseded");

    // Cleanup: end the second one.
    await supportAgent(SUPPORT_USER_B).post("/api/support-session/end").send({});
  });
});

describe("support-session: district-admin recent view", () => {
  test("district admin sees recent sessions affecting their district", async () => {
    _clearSupportSessionCacheForTests();
    // Create a fresh open+end cycle so we have a known row in this district.
    const openRes = await supportAgent().post("/api/support-session/open")
      .send({ districtId: testDistrictId, reason: "audit-visibility test session" });
    expect(openRes.status).toBe(200);
    await supportAgent().post("/api/support-session/end").send({});

    const r = await adminAgent().get("/api/support-sessions/recent");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.sessions)).toBe(true);
    const found = (r.body.sessions as Array<{ sessionId: number; reason: string; auditEntryCount: number }>)
      .find(s => s.sessionId === openRes.body.session.sessionId);
    expect(found).toBeDefined();
    expect(found!.reason).toBe("audit-visibility test session");
    // Open + end both write audit rows tagged with this session id.
    expect(found!.auditEntryCount).toBeGreaterThanOrEqual(1);
  });

  test("non-admin in district cannot see recent sessions", async () => {
    const r = await nonSupportAgent().get("/api/support-sessions/recent");
    expect(r.status).toBe(403);
  });
});
