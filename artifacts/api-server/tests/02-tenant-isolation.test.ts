/**
 * Tenant isolation regression suite.
 *
 * Every multi-tenant SaaS bug story starts with "user from tenant A read or
 * mutated a row owned by tenant B." This file covers the two attack shapes:
 *
 *   1. Route param: GET/PATCH/DELETE /api/students/:id where :id belongs to
 *      a different district. The studentIdParamGuard must return 403.
 *   2. Body id: POST /api/medicaid/generate-claims correctly ignores work
 *      that belongs to a different district (no cross-tenant claims created).
 *      Also: GET /api/students filters to caller's district even if a
 *      ?districtId= query param is supplied for another tenant.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  asUser,
  createDistrict,
  createSchool,
  createStudent,
  createStaff,
  createServiceType,
  createCptMapping,
  createSessionLog,
  cleanupDistrict,
  cleanupServiceType,
  seedLegalAcceptances,
  cleanupLegalAcceptances,
} from "./helpers";
import { db, medicaidClaimsTable, importsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

describe("tenant isolation", () => {
  let districtA: number;
  let districtB: number;
  let studentA: number;
  let studentB: number;
  let serviceTypeId: number;

  // Test user IDs that need to pass requireLegalAcceptance (any test expecting 200).
  const TEST_USER_IDS = ["u_a_admin", "u_a_import_admin", "u_a_xread"];

  beforeAll(async () => {
    const dA = await createDistrict({ name: "District A" });
    const dB = await createDistrict({ name: "District B" });
    districtA = dA.id;
    districtB = dB.id;

    const sA = await createSchool(districtA);
    const sB = await createSchool(districtB);

    const stA = await createStudent(sA.id, { disabilityCategory: "F84.0" });
    const stB = await createStudent(sB.id, { disabilityCategory: "F84.0" });
    studentA = stA.id;
    studentB = stB.id;

    const svc = await createServiceType();
    serviceTypeId = svc.id;

    // Seed legal acceptances so test users pass requireLegalAcceptance on data routes.
    await seedLegalAcceptances(TEST_USER_IDS);
  });

  afterAll(async () => {
    await cleanupLegalAcceptances(TEST_USER_IDS);
    await cleanupDistrict(districtA);
    await cleanupDistrict(districtB);
    await cleanupServiceType(serviceTypeId);
  });

  it("admin in district A cannot GET /api/students/:id of district B (403)", async () => {
    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });
    const res = await adminA.get(`/api/students/${studentB}`);
    expect(res.status).toBe(403);
  });

  it("admin in district A cannot PATCH /api/students/:id of district B (403)", async () => {
    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });
    const res = await adminA.patch(`/api/students/${studentB}`).send({ firstName: "Hacked" });
    expect(res.status).toBe(403);
  });

  it("admin in district A cannot DELETE /api/students/:id of district B (403)", async () => {
    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });
    const res = await adminA.delete(`/api/students/${studentB}`);
    expect(res.status).toBe(403);
  });

  it("admin in district A CAN access their own /api/students/:id (200)", async () => {
    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });
    const res = await adminA.get(`/api/students/${studentA}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(studentA);
  });

  it("/api/students list ignores a ?districtId= query param that names another tenant", async () => {
    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });
    const res = await adminA.get(`/api/students?districtId=${districtB}`);
    expect(res.status).toBe(200);
    // Must not surface district B's student.
    const ids = (res.body as Array<{ id: number }>).map((r) => r.id);
    expect(ids).not.toContain(studentB);
  });

  it("POST /api/medicaid/generate-claims for district A only creates claims for district A's sessions", async () => {
    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });

    // Set up a billable session for each district. Both have diagnosis + CPT
    // mapping; the only thing differentiating ownership is the school→district
    // join. If isolation is broken, district A's generate-claims call will
    // create a claim for studentB.
    const staffA = await createStaff(
      (await db.execute<{ id: number }>(`SELECT id FROM schools WHERE district_id = ${districtA} LIMIT 1`)).rows[0]!.id as number,
      { medicaidProviderId: "MA1", npiNumber: "1111111111" },
    );
    const staffB = await createStaff(
      (await db.execute<{ id: number }>(`SELECT id FROM schools WHERE district_id = ${districtB} LIMIT 1`)).rows[0]!.id as number,
      { medicaidProviderId: "MB1", npiNumber: "2222222222" },
    );

    await createCptMapping(districtA, serviceTypeId);
    await createCptMapping(districtB, serviceTypeId);

    await createSessionLog({
      studentId: studentA,
      staffId: staffA.id,
      serviceTypeId,
      sessionDate: "2025-02-10",
      durationMinutes: 30,
    });
    await createSessionLog({
      studentId: studentB,
      staffId: staffB.id,
      serviceTypeId,
      sessionDate: "2025-02-10",
      durationMinutes: 30,
    });

    const res = await adminA.post("/api/medicaid/generate-claims").send({
      dateFrom: "2025-02-01",
      dateTo: "2025-02-28",
    });
    expect(res.status).toBe(200);
    expect(res.body.generated).toBeGreaterThan(0);

    const districtAClaims = await db.select().from(medicaidClaimsTable).where(eq(medicaidClaimsTable.districtId, districtA));
    const districtBClaims = await db.select().from(medicaidClaimsTable).where(eq(medicaidClaimsTable.districtId, districtB));

    // District A should have received at least one claim, district B should
    // have received NONE from this call (admin A had no access to it).
    expect(districtAClaims.length).toBeGreaterThan(0);
    expect(districtBClaims.length).toBe(0);
  });

  it("GET /api/imports only returns imports belonging to the caller's district", async () => {
    // Seed one import record per district directly in the DB (bypassing the HTTP
    // import endpoint, which requires multipart CSV data).
    const [importA] = await db.insert(importsTable).values({
      districtId: districtA,
      importType: "students",
      fileName: "district_a_students.csv",
      status: "completed",
      rowsProcessed: 5,
      rowsImported: 5,
      rowsErrored: 0,
    }).returning();

    const [importB] = await db.insert(importsTable).values({
      districtId: districtB,
      importType: "students",
      fileName: "district_b_students.csv",
      status: "completed",
      rowsProcessed: 3,
      rowsImported: 3,
      rowsErrored: 0,
    }).returning();

    try {
      const adminA = asUser({ userId: "u_a_import_admin", role: "admin", districtId: districtA });
      const res = await adminA.get("/api/imports");
      expect(res.status).toBe(200);
      const ids = (res.body as Array<{ id: number }>).map((r) => r.id);

      // District A's import must be present; district B's import must be absent.
      expect(ids).toContain(importA.id);
      expect(ids).not.toContain(importB.id);
    } finally {
      // Clean up the import rows; they're not covered by cleanupDistrict.
      await db.delete(importsTable).where(eq(importsTable.id, importA.id));
      await db.delete(importsTable).where(eq(importsTable.id, importB.id));
    }
  });

  it("admin in district A cannot read district B student via GET /api/students/:id cross-district (repeat coverage)", async () => {
    const adminA = asUser({ userId: "u_a_xread", role: "admin", districtId: districtA });
    const res = await adminA.get(`/api/students/${studentB}`);
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty("error");
  });
});
