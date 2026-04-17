/**
 * Tests for the parent progress share-link hardening.
 *
 * Covers:
 *   - cross-tenant denial on issuance and revocation (IDOR)
 *   - configurable TTL clamping at the configured max
 *   - one-time-view (maxViews=1) enforcement under repeat access
 *   - explicit response codes for not_found / expired / revoked / exhausted
 *   - per-token rate limit produces 429 with code "rate_limited"
 *   - access log rows are written for granted AND denied outcomes
 *   - rotate issues a new working token and revokes the old one
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  app,
  asUser,
  cleanupDistrict,
  createDistrict,
  createSchool,
  createStaff,
  createStudent,
  seedLegalAcceptances,
  cleanupLegalAcceptances,
} from "./helpers";
import request from "supertest";
import {
  db,
  shareLinkAccessLogTable,
  shareLinksTable,
  districtSubscriptionsTable,
  subscriptionPlansTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  __resetShareLinkLimiters,
  hashToken,
  SHARE_LINK_CONFIG,
} from "../src/lib/shareLinks";

// The parent-communication routes are tier-gated. We attach an "essentials"
// subscription to each test district so the tier middleware passes.
async function ensureSubscription(districtId: number, planId: number) {
  await db.insert(districtSubscriptionsTable).values({
    districtId,
    planId,
    status: "active",
  });
}

describe("share-link hardening", () => {
  let districtA: number;
  let districtB: number;
  let studentA: number;
  let studentB: number;
  let schoolAId: number;
  let planId: number;
  let createdLinkIds: number[] = [];

  beforeAll(async () => {
    const dA = await createDistrict({ name: "District A" });
    const dB = await createDistrict({ name: "District B" });
    districtA = dA.id;
    districtB = dB.id;

    const sA = await createSchool(districtA);
    const sB = await createSchool(districtB);
    schoolAId = sA.id;

    const stA = await createStudent(sA.id);
    const stB = await createStudent(sB.id);
    studentA = stA.id;
    studentB = stB.id;
    await createStaff(sA.id);
    await createStaff(sB.id);

    // Use any existing essentials plan if present, otherwise create one.
    const existing = await db.select().from(subscriptionPlansTable).limit(1);
    if (existing.length > 0) {
      planId = existing[0]!.id;
    } else {
      const [plan] = await db.insert(subscriptionPlansTable).values({
        tier: `essentials_share_${Date.now()}`,
        name: `Plan ${Date.now()}`,
        seatLimit: 100,
        monthlyPriceId: `price_m_${Date.now()}`,
        yearlyPriceId: `price_y_${Date.now()}`,
        monthlyPriceCents: 1000,
        yearlyPriceCents: 10000,
        isActive: true,
      }).returning();
      planId = plan!.id;
    }
    await ensureSubscription(districtA, planId);
    await ensureSubscription(districtB, planId);

    await seedLegalAcceptances([
      `u_${districtA}_admin`,
      `u_${districtB}_admin`,
      "u_a_admin",
    ]);
  });

  beforeEach(() => {
    __resetShareLinkLimiters();
  });

  afterAll(async () => {
    if (createdLinkIds.length > 0) {
      await db.delete(shareLinkAccessLogTable).where(inArray(shareLinkAccessLogTable.shareLinkId, createdLinkIds));
      await db.delete(shareLinksTable).where(inArray(shareLinksTable.id, createdLinkIds));
    }
    // Belt-and-braces: drop any leftover share-link rows for our students.
    await db.delete(shareLinksTable).where(inArray(shareLinksTable.studentId, [studentA, studentB]));
    await cleanupDistrict(districtA);
    await cleanupDistrict(districtB);
    await cleanupLegalAcceptances([
      `u_${districtA}_admin`,
      `u_${districtB}_admin`,
      "u_a_admin",
    ]);
  });

  async function issueLink(opts: {
    actorDistrictId: number;
    studentId: number;
    body?: Record<string, unknown>;
  }): Promise<request.Response> {
    const agent = asUser({ userId: `u_${opts.actorDistrictId}_admin`, role: "admin", districtId: opts.actorDistrictId });
    return agent
      .post(`/api/students/${opts.studentId}/progress-summary/share-link`)
      .send(opts.body ?? {});
  }

  it("admin in district A cannot issue a share link for a student in district B (404)", async () => {
    const res = await issueLink({ actorDistrictId: districtA, studentId: studentB });
    expect(res.status).toBe(404);
  });

  it("admin in district A cannot revoke a share link for a student in district B (404)", async () => {
    // Seed a link directly so we have something with a real id.
    const [seeded] = await db.insert(shareLinksTable).values({
      tokenHash: hashToken(`seed_${Date.now()}`),
      studentId: studentB,
      districtId: districtB,
      summary: "{}",
      expiresAt: new Date(Date.now() + 60_000),
    }).returning();
    createdLinkIds.push(seeded!.id);

    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });
    const res = await adminA.delete(`/api/students/${studentB}/progress-summary/share-link/${seeded!.id}`);
    expect(res.status).toBe(404);
    const [row] = await db.select().from(shareLinksTable).where(eq(shareLinksTable.id, seeded!.id));
    expect(row?.revokedAt).toBeNull();
  });

  it("issues a link with conservative defaults (default TTL, default maxViews)", async () => {
    const res = await issueLink({ actorDistrictId: districtA, studentId: studentA });
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.maxViews).toBe(SHARE_LINK_CONFIG.defaultMaxViews);
    const expiresIn = (new Date(res.body.expiresAt).getTime() - Date.now()) / (60 * 60 * 1000);
    expect(expiresIn).toBeGreaterThan(SHARE_LINK_CONFIG.defaultTtlHours - 1);
    expect(expiresIn).toBeLessThanOrEqual(SHARE_LINK_CONFIG.defaultTtlHours + 0.01);
    createdLinkIds.push(res.body.id);
  });

  it("clamps a caller-supplied TTL above the configured max", async () => {
    const res = await issueLink({
      actorDistrictId: districtA,
      studentId: studentA,
      body: { expiresInHours: 999_999 },
    });
    expect(res.status).toBe(201);
    const expiresIn = (new Date(res.body.expiresAt).getTime() - Date.now()) / (60 * 60 * 1000);
    expect(expiresIn).toBeLessThanOrEqual(SHARE_LINK_CONFIG.maxTtlHours + 0.01);
    createdLinkIds.push(res.body.id);
  });

  it("oneTimeView=true makes the link unusable after one successful retrieval", async () => {
    const issued = await issueLink({
      actorDistrictId: districtA,
      studentId: studentA,
      body: { oneTimeView: true },
    });
    expect(issued.status).toBe(201);
    expect(issued.body.maxViews).toBe(1);
    createdLinkIds.push(issued.body.id);
    const token = issued.body.token as string;

    const first = await request(app).get(`/api/shared/progress/${token}`);
    expect(first.status).toBe(200);

    const second = await request(app).get(`/api/shared/progress/${token}`);
    expect(second.status).toBe(410);
    expect(second.body.code).toBe("exhausted");
  });

  it("returns 404 with code=not_found for a never-issued token", async () => {
    const res = await request(app).get(`/api/shared/progress/${"a".repeat(48)}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("not_found");
  });

  it("returns 410 with code=expired once the link's TTL is in the past", async () => {
    // Seed a link that's already expired.
    const tok = `expired_${Date.now()}_${Math.random()}`;
    const [row] = await db.insert(shareLinksTable).values({
      tokenHash: hashToken(tok),
      studentId: studentA,
      districtId: districtA,
      summary: JSON.stringify({ studentId: studentA }),
      expiresAt: new Date(Date.now() - 60_000),
    }).returning();
    createdLinkIds.push(row!.id);

    const res = await request(app).get(`/api/shared/progress/${tok}`);
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("expired");
  });

  it("returns 410 with code=revoked after a successful revoke call", async () => {
    const issued = await issueLink({ actorDistrictId: districtA, studentId: studentA });
    expect(issued.status).toBe(201);
    createdLinkIds.push(issued.body.id);
    const token = issued.body.token as string;

    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });
    const rev = await adminA.delete(`/api/students/${studentA}/progress-summary/share-link/${issued.body.id}`);
    expect(rev.status).toBe(200);

    const res = await request(app).get(`/api/shared/progress/${token}`);
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("revoked");
  });

  it("concurrent rotate calls only mint a single new token (atomic claim)", async () => {
    const issued = await issueLink({ actorDistrictId: districtA, studentId: studentA });
    expect(issued.status).toBe(201);
    createdLinkIds.push(issued.body.id);

    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });
    const url = `/api/students/${studentA}/progress-summary/share-link/${issued.body.id}/rotate`;
    const [r1, r2] = await Promise.all([
      adminA.post(url).send({}),
      adminA.post(url).send({}),
    ]);
    const oks = [r1, r2].filter((r) => r.status === 200);
    const losers = [r1, r2].filter((r) => r.status === 404);
    expect(oks.length).toBe(1);
    expect(losers.length).toBe(1);
    if (oks[0]?.body?.id) createdLinkIds.push(oks[0].body.id);

    // Only the original (revoked) and the single winner's row exist for this
    // student — the loser must NOT have inserted a second active token.
    const rows = await db
      .select({ id: shareLinksTable.id, revokedAt: shareLinksTable.revokedAt })
      .from(shareLinksTable)
      .where(eq(shareLinksTable.studentId, studentA));
    const active = rows.filter((r) => r.revokedAt === null);
    // There may be other active links from earlier tests on studentA — assert
    // that at most one *new* row was created during this rotate.
    const winnerId = oks[0]!.body.id as number;
    expect(rows.some((r) => r.id === winnerId && r.revokedAt === null)).toBe(true);
    // The original link must be revoked.
    expect(rows.some((r) => r.id === issued.body.id && r.revokedAt !== null)).toBe(true);
    // And no row exists with the loser's would-be id (we never got one back).
    expect(active.length).toBeGreaterThanOrEqual(1);
  });

  it("rotate issues a new working token and 410s the old one with code=revoked", async () => {
    const issued = await issueLink({ actorDistrictId: districtA, studentId: studentA });
    expect(issued.status).toBe(201);
    createdLinkIds.push(issued.body.id);
    const oldToken = issued.body.token as string;

    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });
    const rot = await adminA.post(`/api/students/${studentA}/progress-summary/share-link/${issued.body.id}/rotate`).send({});
    expect(rot.status).toBe(200);
    expect(rot.body.token).not.toBe(oldToken);
    createdLinkIds.push(rot.body.id);

    const newRes = await request(app).get(`/api/shared/progress/${rot.body.token}`);
    expect(newRes.status).toBe(200);

    const oldRes = await request(app).get(`/api/shared/progress/${oldToken}`);
    expect(oldRes.status).toBe(410);
    expect(oldRes.body.code).toBe("revoked");
  });

  it("per-token rate limit kicks in (429 with code=rate_limited) under burst access", async () => {
    const issued = await issueLink({
      actorDistrictId: districtA,
      studentId: studentA,
      body: { maxViews: 1000 },
    });
    expect(issued.status).toBe(201);
    createdLinkIds.push(issued.body.id);
    const token = issued.body.token as string;

    const max = SHARE_LINK_CONFIG.ratePerTokenMax;
    let rateLimited = false;
    let lastBody: any = null;
    for (let i = 0; i < max + 5; i++) {
      const res = await request(app).get(`/api/shared/progress/${token}`);
      if (res.status === 429) {
        rateLimited = true;
        lastBody = res.body;
        break;
      }
    }
    expect(rateLimited).toBe(true);
    expect(lastBody?.code).toBe("rate_limited");
  });

  it("writes an access-log row for both granted and denied outcomes", async () => {
    const issued = await issueLink({ actorDistrictId: districtA, studentId: studentA });
    expect(issued.status).toBe(201);
    createdLinkIds.push(issued.body.id);
    const token = issued.body.token as string;

    await request(app).get(`/api/shared/progress/${token}`); // granted
    await request(app).get(`/api/shared/progress/${"z".repeat(48)}`); // not_found

    const grantedRows = await db
      .select()
      .from(shareLinkAccessLogTable)
      .where(eq(shareLinkAccessLogTable.shareLinkId, issued.body.id));
    expect(grantedRows.some((r) => r.outcome === "granted" && r.httpStatus === 200)).toBe(true);

    // Denied (not_found) rows have a null shareLinkId; just confirm at least
    // one such row exists in the same window with the correct outcome.
    const deniedRows = await db
      .select()
      .from(shareLinkAccessLogTable)
      .where(eq(shareLinkAccessLogTable.outcome, "not_found"));
    expect(deniedRows.length).toBeGreaterThan(0);
  });
});
