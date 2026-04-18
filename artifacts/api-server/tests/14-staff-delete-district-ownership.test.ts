/**
 * Regression suite: district ownership guard on DELETE /api/staff/:id and
 * DELETE /api/absences/:id.
 *
 * Both routes go through the `assertStaffInCallerDistrict` /
 * `assertStaffAbsenceInCallerDistrict` helpers in `lib/districtScope.ts`.
 * Per the convention in that module, the assert* helpers respond with 404
 * (not 403) on cross-district access to avoid leaking the existence of
 * out-of-tenant rows. These tests pin that behaviour so a future refactor
 * cannot silently remove the guard without breaking the suite.
 *
 * Scenarios covered for each endpoint:
 *   1. Coordinator in District A → 404 on a District B record (and the row
 *      is NOT deleted).
 *   2. Same coordinator → 2xx on a District A record (positive control).
 *   3. Platform admin (tenantDistrictId == null) → 2xx on any record.
 *
 * Note on routing: the staff-absence delete is mounted at
 * `DELETE /api/absences/:id` (not `/api/staff/:staffId/absences/:absenceId`
 * as the task brief mentioned) — confirmed against
 * `artifacts/api-server/src/routes/staff.ts`.
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
import { db, staffTable, staffAbsencesTable } from "@workspace/db";
import { eq, isNull, and } from "drizzle-orm";

describe("DELETE /api/staff/:id and DELETE /api/absences/:id — district ownership guard", () => {
  let districtA: number;
  let districtB: number;
  // Staff used by the staff-delete tests
  let staffA_forDelete: number;
  let staffB_forDelete: number;
  let staffB_platformDelete: number;
  // Staff that own the absences used by the absence-delete tests
  let staffA_forAbsence: number;
  let staffB_forAbsence: number;
  let staffB_platformAbsence: number;
  // Absence ids
  let absenceA_sameDistrict: number;
  let absenceB_crossDistrict: number;
  let absenceB_platform: number;

  const USER_COORD_A = "u_staff_del_coord_a";
  const USER_PLATFORM = "u_staff_del_platform";

  beforeAll(async () => {
    await seedLegalAcceptances([USER_COORD_A, USER_PLATFORM]);

    const dA = await createDistrict({ name: "StaffDel District A" });
    const dB = await createDistrict({ name: "StaffDel District B" });
    districtA = dA.id;
    districtB = dB.id;

    const schoolA = await createSchool(districtA);
    const schoolB = await createSchool(districtB);

    // Staff for the DELETE /api/staff/:id tests
    staffA_forDelete = (await createStaff(schoolA.id, { firstName: "DelA", lastName: "Same" })).id;
    staffB_forDelete = (await createStaff(schoolB.id, { firstName: "DelB", lastName: "Cross" })).id;
    // Platform-admin tests target a District B record so we explicitly prove
    // the platform admin can act cross-district (not just on its own district).
    staffB_platformDelete = (await createStaff(schoolB.id, { firstName: "DelB", lastName: "Platform" })).id;

    // Staff that own the absences used by the DELETE /api/absences/:id tests
    staffA_forAbsence = (await createStaff(schoolA.id, { firstName: "AbsA", lastName: "Same" })).id;
    staffB_forAbsence = (await createStaff(schoolB.id, { firstName: "AbsB", lastName: "Cross" })).id;
    staffB_platformAbsence = (await createStaff(schoolB.id, { firstName: "AbsB", lastName: "Platform" })).id;

    // Insert staff absences directly to bypass the coverage-instance side-effects
    // in POST /staff/:id/absences — these tests only care about the delete guard.
    const [absSame] = await db.insert(staffAbsencesTable).values({
      staffId: staffA_forAbsence,
      absenceDate: "2026-04-20",
      absenceType: "sick",
    }).returning();
    absenceA_sameDistrict = absSame.id;

    const [absCross] = await db.insert(staffAbsencesTable).values({
      staffId: staffB_forAbsence,
      absenceDate: "2026-04-20",
      absenceType: "sick",
    }).returning();
    absenceB_crossDistrict = absCross.id;

    const [absPlat] = await db.insert(staffAbsencesTable).values({
      staffId: staffB_platformAbsence,
      absenceDate: "2026-04-20",
      absenceType: "sick",
    }).returning();
    absenceB_platform = absPlat.id;
  });

  afterAll(async () => {
    // Clean up any absences that may have survived (cleanupDistrict does not
    // touch staff_absences). FK to staff is ON DELETE no-op, so remove first.
    await db.delete(staffAbsencesTable).where(
      eq(staffAbsencesTable.staffId, staffA_forAbsence),
    );
    await db.delete(staffAbsencesTable).where(
      eq(staffAbsencesTable.staffId, staffB_forAbsence),
    );
    await db.delete(staffAbsencesTable).where(
      eq(staffAbsencesTable.staffId, staffB_platformAbsence),
    );

    await cleanupDistrict(districtA);
    await cleanupDistrict(districtB);
    await cleanupLegalAcceptances([USER_COORD_A, USER_PLATFORM]);
  });

  // ------------------------------------------------------------------
  // DELETE /api/staff/:id
  // ------------------------------------------------------------------

  it("coordinator in District A gets 404 when DELETEing a staff member in District B", async () => {
    const coordA = asUser({ userId: USER_COORD_A, role: "coordinator", districtId: districtA });
    const res = await coordA.delete(`/api/staff/${staffB_forDelete}`);
    expect(res.status).toBe(404);
    // Confirm the row was NOT soft-deleted.
    const [row] = await db
      .select({ deletedAt: staffTable.deletedAt })
      .from(staffTable)
      .where(eq(staffTable.id, staffB_forDelete));
    expect(row?.deletedAt).toBeNull();
  });

  it("coordinator in District A gets 200 when DELETEing a staff member in District A", async () => {
    const coordA = asUser({ userId: USER_COORD_A, role: "coordinator", districtId: districtA });
    const res = await coordA.delete(`/api/staff/${staffA_forDelete}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    // Confirm the row WAS soft-deleted.
    const [row] = await db
      .select({ deletedAt: staffTable.deletedAt })
      .from(staffTable)
      .where(eq(staffTable.id, staffA_forDelete));
    expect(row?.deletedAt).not.toBeNull();
  });

  it("platform admin (no district) gets 200 when DELETEing a staff member in a different district", async () => {
    // Target a District B record while the platform admin has no enforced
    // district scope, proving the cross-district allowance (not just same-
    // district success).
    const res = await request(app)
      .delete(`/api/staff/${staffB_platformDelete}`)
      .set("x-test-user-id", USER_PLATFORM)
      .set("x-test-role", "admin")
      .set("x-test-platform-admin", "true");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    const [row] = await db
      .select({ deletedAt: staffTable.deletedAt })
      .from(staffTable)
      .where(eq(staffTable.id, staffB_platformDelete));
    expect(row?.deletedAt).not.toBeNull();
  });

  // ------------------------------------------------------------------
  // DELETE /api/absences/:id
  // ------------------------------------------------------------------

  it("coordinator in District A gets 404 when DELETEing an absence in District B", async () => {
    const coordA = asUser({ userId: USER_COORD_A, role: "coordinator", districtId: districtA });
    const res = await coordA.delete(`/api/absences/${absenceB_crossDistrict}`);
    expect(res.status).toBe(404);
    // Confirm the row was NOT deleted.
    const [row] = await db
      .select({ id: staffAbsencesTable.id })
      .from(staffAbsencesTable)
      .where(eq(staffAbsencesTable.id, absenceB_crossDistrict));
    expect(row?.id).toBe(absenceB_crossDistrict);
  });

  it("coordinator in District A gets 204 when DELETEing an absence in District A", async () => {
    const coordA = asUser({ userId: USER_COORD_A, role: "coordinator", districtId: districtA });
    const res = await coordA.delete(`/api/absences/${absenceA_sameDistrict}`);
    expect(res.status).toBe(204);
    const rows = await db
      .select({ id: staffAbsencesTable.id })
      .from(staffAbsencesTable)
      .where(eq(staffAbsencesTable.id, absenceA_sameDistrict));
    expect(rows).toHaveLength(0);
  });

  it("platform admin (no district) gets 204 when DELETEing an absence in a different district", async () => {
    // Same cross-district proof as above: target a District B absence row.
    const res = await request(app)
      .delete(`/api/absences/${absenceB_platform}`)
      .set("x-test-user-id", USER_PLATFORM)
      .set("x-test-role", "admin")
      .set("x-test-platform-admin", "true");
    expect(res.status).toBe(204);
    const rows = await db
      .select({ id: staffAbsencesTable.id })
      .from(staffAbsencesTable)
      .where(eq(staffAbsencesTable.id, absenceB_platform));
    expect(rows).toHaveLength(0);
  });
});
