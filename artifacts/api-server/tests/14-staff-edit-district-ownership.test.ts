/**
 * Regression suite: district ownership guard on PATCH /api/staff/:id
 *
 * The `staffInCallerDistrict` helper in `lib/districtScope.ts` blocks
 * cross-district edits and returns 403. These tests pin that behaviour so a
 * future refactor cannot silently remove the guard without breaking the suite.
 *
 * Three scenarios are covered:
 *   1. Coordinator in District A → 403 on a District B staff member.
 *   2. Same coordinator → 200 on a District A staff member (positive control).
 *   3. Platform admin (tenantDistrictId == null) → 200 on any staff member.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import {
  asUser,
  app,
  createDistrict,
  createSchool,
  createStaff,
  cleanupDistrict,
  seedLegalAcceptances,
  cleanupLegalAcceptances,
} from "./helpers";
import { db, staffTable } from "@workspace/db";
import { eq } from "drizzle-orm";

describe("PATCH /api/staff/:id — district ownership guard", () => {
  let districtA: number;
  let districtB: number;
  let staffAId: number;
  let staffBId: number;

  const USER_COORD_A = "u_staff_perm_coord_a";
  const USER_PLATFORM = "u_staff_perm_platform";

  beforeAll(async () => {
    await seedLegalAcceptances([USER_COORD_A, USER_PLATFORM]);

    const dA = await createDistrict({ name: "StaffPerm District A" });
    const dB = await createDistrict({ name: "StaffPerm District B" });
    districtA = dA.id;
    districtB = dB.id;

    const schoolA = await createSchool(districtA);
    const schoolB = await createSchool(districtB);

    const sfA = await createStaff(schoolA.id, { firstName: "Alice", lastName: "DistrictA" });
    const sfB = await createStaff(schoolB.id, { firstName: "Bob", lastName: "DistrictB" });
    staffAId = sfA.id;
    staffBId = sfB.id;
  });

  afterAll(async () => {
    await cleanupDistrict(districtA);
    await cleanupDistrict(districtB);
    await cleanupLegalAcceptances([USER_COORD_A, USER_PLATFORM]);
  });

  it("coordinator in District A gets 403 when PATCHing a staff member in District B", async () => {
    const coordA = asUser({ userId: USER_COORD_A, role: "coordinator", districtId: districtA });
    const res = await coordA.patch(`/api/staff/${staffBId}`).send({ firstName: "PWNED" });
    expect(res.status).toBe(403);
    // Confirm the record was not mutated.
    const [row] = await db.select({ firstName: staffTable.firstName }).from(staffTable).where(eq(staffTable.id, staffBId));
    expect(row?.firstName).toBe("Bob");
  });

  it("coordinator in District A gets 200 when PATCHing a staff member in District A", async () => {
    const coordA = asUser({ userId: USER_COORD_A, role: "coordinator", districtId: districtA });
    const res = await coordA.patch(`/api/staff/${staffAId}`).send({ firstName: "AliceUpdated" });
    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe("AliceUpdated");
    const [row] = await db.select({ firstName: staffTable.firstName }).from(staffTable).where(eq(staffTable.id, staffAId));
    expect(row?.firstName).toBe("AliceUpdated");
  });

  it("platform admin (no district) gets 200 when PATCHing a staff member in any district", async () => {
    // Platform admins have tenantDistrictId == null, so staffInCallerDistrict skips
    // the district check (getEnforcedDistrictId returns null → returns true).
    // We use the x-test-platform-admin header to pass requireDistrictScope in test mode,
    // mirroring how real platform admins carry meta.platformAdmin == true in their Clerk token.
    const res = await request(app)
      .patch(`/api/staff/${staffBId}`)
      .set("x-test-user-id", USER_PLATFORM)
      .set("x-test-role", "admin")
      .set("x-test-platform-admin", "true")
      .send({ firstName: "BobPlatformEdited" });
    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe("BobPlatformEdited");
    const [row] = await db.select({ firstName: staffTable.firstName }).from(staffTable).where(eq(staffTable.id, staffBId));
    expect(row?.firstName).toBe("BobPlatformEdited");
  });
});
