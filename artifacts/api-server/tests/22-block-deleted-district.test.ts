/**
 * Regression suite: blockDeletedDistrict middleware.
 *
 * The middleware (artifacts/api-server/src/middlewares/auth.ts) is mounted
 * globally on the authenticated /api router. When a district has its
 * `delete_initiated_at` column set, all staff/admin requests must be
 * rejected with HTTP 403 and `code: "DISTRICT_SOFT_DELETED"`. Platform
 * admins must still get through so they can manage or cancel the deletion.
 *
 * Cancelling the deletion clears `delete_initiated_at`. Because the
 * middleware caches the per-district lookup with a 30s TTL, the production
 * cancel route (DELETE /api/district-data/soft-delete) calls
 * `invalidateDistrictDeleteCache(districtId)` to make the next request
 * succeed immediately rather than waiting for the TTL. This test simulates
 * that same invalidation step (waiting 30s would slow the suite).
 *
 * Route used as the probe: GET /api/schools — the simplest authenticated
 * district-scoped read. Going through it guarantees the request actually
 * traverses requireAuth → requireDistrictScope → blockDeletedDistrict.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import {
  app,
  asUser,
  createDistrict,
  createSchool,
  cleanupDistrict,
  seedLegalAcceptances,
  cleanupLegalAcceptances,
} from "./helpers";
import { db, districtsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { invalidateDistrictDeleteCache } from "../src/middlewares/auth";

describe("blockDeletedDistrict — staff/admin lockout for soft-deleted districts", () => {
  let districtId: number;
  const ADMIN_USER = "u_block_del_admin";
  const COORD_USER = "u_block_del_coord";
  const PLATFORM_USER = "u_block_del_platform";

  beforeAll(async () => {
    await seedLegalAcceptances([ADMIN_USER, COORD_USER, PLATFORM_USER]);
    const d = await createDistrict({ name: "Test District BlockDel" });
    districtId = d.id;
    // A school is needed so /api/schools returns a non-empty payload for the
    // positive-control assertions; the lockout assertions only care about the
    // 403 status, but seeding one row keeps the response shape realistic.
    await createSchool(districtId);
  });

  afterAll(async () => {
    // Clear any lingering cached "soft-deleted" entry so other suites running
    // after this one against the same in-process app aren't affected.
    invalidateDistrictDeleteCache(districtId);
    await cleanupDistrict(districtId);
    await cleanupLegalAcceptances([ADMIN_USER, COORD_USER, PLATFORM_USER]);
  });

  it("admin can reach district routes before the soft-delete is initiated (positive control)", async () => {
    const admin = asUser({ userId: ADMIN_USER, role: "admin", districtId });
    const res = await admin.get("/api/schools");
    expect(res.status).toBe(200);
  });

  it("admin gets 403 with code DISTRICT_SOFT_DELETED once delete_initiated_at is set", async () => {
    await db.update(districtsTable)
      .set({
        deleteInitiatedAt: new Date(),
        deleteScheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .where(eq(districtsTable.id, districtId));
    // Mirror the production routes (POST /district-data/soft-delete) which
    // call this immediately after flipping the column so the next request
    // sees the new state without waiting for the 30s cache TTL.
    invalidateDistrictDeleteCache(districtId);

    const admin = asUser({ userId: ADMIN_USER, role: "admin", districtId });
    const res = await admin.get("/api/schools");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("DISTRICT_SOFT_DELETED");
  });

  it("coordinator (non-admin staff role) is also blocked with the same code", async () => {
    const coord = asUser({ userId: COORD_USER, role: "coordinator", districtId });
    const res = await coord.get("/api/schools");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("DISTRICT_SOFT_DELETED");
  });

  it("platform admins still reach routes scoped to the soft-deleted district", async () => {
    // x-test-platform-admin: true is the test-mode equivalent of the
    // `meta.platformAdmin === true` Clerk claim that bypasses both
    // requireDistrictScope and blockDeletedDistrict in production.
    const res = await request(app)
      .get("/api/schools")
      .set("x-test-user-id", PLATFORM_USER)
      .set("x-test-role", "admin")
      .set("x-test-district-id", String(districtId))
      .set("x-test-platform-admin", "true");
    expect(res.status).toBe(200);
  });

  it("cancelling the deletion (clearing delete_initiated_at) restores access on the next request after the cache TTL", async () => {
    await db.update(districtsTable)
      .set({
        deleteInitiatedAt: null,
        deleteScheduledAt: null,
        deleteInitiatedBy: null,
      })
      .where(eq(districtsTable.id, districtId));
    // Production cancel route (DELETE /district-data/soft-delete) does the
    // same invalidation; calling it directly here is the in-test equivalent
    // of waiting for the 30s TTL to expire.
    invalidateDistrictDeleteCache(districtId);

    const admin = asUser({ userId: ADMIN_USER, role: "admin", districtId });
    const res = await admin.get("/api/schools");
    expect(res.status).toBe(200);
  });
});
