/**
 * Runtime tenant-isolation matrix.
 *
 * Seeds District-A and District-B with entities (students, staff, imports,
 * schools), then drives HTTP requests through the running app to verify:
 *
 *   LIST routes: district-A admin sees only district-A entities (none from B).
 *   DETAIL routes: district-A admin gets 403 for district-B entity IDs.
 *   CROSS-DISTRICT BODY: response body for each list route must not contain
 *     any district-B entity IDs even when district-B has matching row types.
 *
 * This is the runtime complement to the static annotation contract in
 * 00-tenant-scope-contract.test.ts.  Both guards must pass; together they
 * enforce the "no annotation-only compliance" requirement.
 *
 * To add a new list route to the isolation matrix:
 *   1. Seed the entity in beforeAll using the appropriate createXxx helper.
 *   2. Add the entity IDs to entitiesA / entitiesB.
 *   3. Add a case to CROSS_DISTRICT_LIST_ROUTES below.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  asUser,
  createDistrict,
  createSchool,
  createStudent,
  createStaff,
  cleanupDistrict,
  seedLegalAcceptances,
  cleanupLegalAcceptances,
} from "./helpers";
import { db, importsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

let districtA: number;
let districtB: number;
let schoolA: number;
let schoolB: number;

// Entities created in each district
const entitiesA = { students: [] as number[], staff: [] as number[], importIds: [] as number[], schoolIds: [] as number[] };
const entitiesB = { students: [] as number[], staff: [] as number[], importIds: [] as number[], schoolIds: [] as number[] };

const ADMIN_A = "u_matrix_admin_a";
const LEGAL_USERS = [ADMIN_A];

async function seedImport(districtId: number): Promise<number> {
  const [row] = await db
    .insert(importsTable)
    .values({
      districtId,
      importType: "students",
      fileName: `district_${districtId}_test.csv`,
      status: "completed",
      rowsProcessed: 1,
      rowsImported: 1,
      rowsErrored: 0,
    })
    .returning();
  return row.id;
}

beforeAll(async () => {
  const dA = await createDistrict({ name: "Matrix District A" });
  const dB = await createDistrict({ name: "Matrix District B" });
  districtA = dA.id;
  districtB = dB.id;

  const sA = await createSchool(districtA);
  const sB = await createSchool(districtB);
  schoolA = sA.id;
  schoolB = sB.id;

  // Seed 2 students and 1 staff per district so list tests have something to verify.
  const stA1 = await createStudent(schoolA);
  const stA2 = await createStudent(schoolA);
  const stB1 = await createStudent(schoolB);
  const stB2 = await createStudent(schoolB);
  entitiesA.students.push(stA1.id, stA2.id);
  entitiesB.students.push(stB1.id, stB2.id);

  const staffA = await createStaff(schoolA);
  const staffB = await createStaff(schoolB);
  entitiesA.staff.push(staffA.id);
  entitiesB.staff.push(staffB.id);

  // Capture school IDs for cross-district school route check.
  entitiesA.schoolIds.push(sA.id);
  entitiesB.schoolIds.push(sB.id);

  const importA = await seedImport(districtA);
  const importB = await seedImport(districtB);
  entitiesA.importIds.push(importA);
  entitiesB.importIds.push(importB);

  await seedLegalAcceptances(LEGAL_USERS);
});

afterAll(async () => {
  await cleanupLegalAcceptances(LEGAL_USERS);
  // Clean up import rows before district teardown.
  if (entitiesA.importIds.length || entitiesB.importIds.length) {
    await db.delete(importsTable).where(
      or(
        ...entitiesA.importIds.map((id) => eq(importsTable.id, id)),
        ...entitiesB.importIds.map((id) => eq(importsTable.id, id)),
      ),
    );
  }
  await cleanupDistrict(districtA);
  await cleanupDistrict(districtB);
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function adminA() {
  return asUser({ userId: ADMIN_A, role: "admin", districtId: districtA });
}

// ---------------------------------------------------------------------------
// LIST route isolation — district-A admin must never see district-B entities
// ---------------------------------------------------------------------------

describe("LIST route isolation (district-A admin sees only district-A entities)", () => {
  it("GET /api/students — district-B students absent from response", async () => {
    const res = await adminA().get("/api/students");
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: number }>).map((r) => r.id);
    // District-A students must be present.
    for (const id of entitiesA.students) expect(ids).toContain(id);
    // District-B students must be absent.
    for (const id of entitiesB.students) expect(ids).not.toContain(id);
  });

  it("GET /api/staff — district-B staff absent from response", async () => {
    const res = await adminA().get("/api/staff");
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: number }>).map((r) => r.id);
    for (const id of entitiesA.staff) expect(ids).toContain(id);
    for (const id of entitiesB.staff) expect(ids).not.toContain(id);
  });

  it("GET /api/imports — district-B imports absent from response", async () => {
    const res = await adminA().get("/api/imports");
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: number }>).map((r) => r.id);
    for (const id of entitiesA.importIds) expect(ids).toContain(id);
    for (const id of entitiesB.importIds) expect(ids).not.toContain(id);
  });

  it("GET /api/sped-students — district-B students absent from response", async () => {
    const res = await adminA().get("/api/sped-students");
    // 200 or 204; either way district-B students must not appear.
    expect([200, 204]).toContain(res.status);
    if (res.status === 200 && Array.isArray(res.body)) {
      const ids = (res.body as Array<{ id: number }>).map((r) => r.id);
      for (const id of entitiesB.students) expect(ids).not.toContain(id);
    }
  });

  it("GET /api/schools — district-B schools absent from response", async () => {
    const res = await adminA().get("/api/schools");
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: number }>).map((r) => r.id);
    // District-A school must be present.
    for (const id of entitiesA.schoolIds) expect(ids).toContain(id);
    // District-B school must be absent.
    for (const id of entitiesB.schoolIds) expect(ids).not.toContain(id);
  });
});

// ---------------------------------------------------------------------------
// Cross-district response body isolation — structured route table
//
// For every route below, district-A admin's response body must not contain
// any of district-B's entity IDs (checked by scanning the full JSON payload).
// Routes are described as { path, districtBIds } where districtBIds is a
// function that returns the IDs to assert absent (evaluated at test time so
// beforeAll has completed).
// ---------------------------------------------------------------------------

describe("Cross-district body isolation — district-B IDs must not appear in district-A responses", () => {
  interface RouteCase {
    label: string;
    path: string;
    districtBIds: () => number[];
  }

  const cases: RouteCase[] = [
    {
      label: "GET /api/students",
      path: "/api/students",
      districtBIds: () => entitiesB.students,
    },
    {
      label: "GET /api/staff",
      path: "/api/staff",
      districtBIds: () => entitiesB.staff,
    },
    {
      label: "GET /api/imports",
      path: "/api/imports",
      districtBIds: () => entitiesB.importIds,
    },
    {
      label: "GET /api/schools",
      path: "/api/schools",
      districtBIds: () => entitiesB.schoolIds,
    },
  ];

  for (const { label, path, districtBIds } of cases) {
    it(`${label} — response body does not contain district-B entity IDs`, async () => {
      const res = await adminA().get(path);
      // Any 2xx response whose body contains a district-B ID is a failure.
      if (res.status >= 200 && res.status < 300) {
        const bodyStr = JSON.stringify(res.body);
        for (const id of districtBIds()) {
          // We look for the id as a standalone number in the JSON, not as a
          // substring (e.g. 12 must not match inside 123).
          const pattern = new RegExp(`(?<![\\d])${id}(?![\\d])`);
          expect(
            pattern.test(bodyStr),
            `${label}: district-B entity id ${id} found in response body`,
          ).toBe(false);
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// DETAIL route isolation — district-A admin must get 403 for district-B IDs
// ---------------------------------------------------------------------------

describe("DETAIL route isolation (district-A admin blocked from district-B IDs)", () => {
  it("GET /api/students/:id — district-B student ID returns 403", async () => {
    for (const id of entitiesB.students) {
      const res = await adminA().get(`/api/students/${id}`);
      expect(res.status, `Expected 403 for /api/students/${id}`).toBe(403);
    }
  });

  it("PATCH /api/students/:id — district-B student write returns 403", async () => {
    const res = await adminA()
      .patch(`/api/students/${entitiesB.students[0]}`)
      .send({ firstName: "Hacked" });
    expect(res.status).toBe(403);
  });

  it("DELETE /api/students/:id — district-B student delete returns 403", async () => {
    const res = await adminA().delete(`/api/students/${entitiesB.students[0]}`);
    expect(res.status).toBe(403);
  });

  it("GET /api/staff/:id — district-B staff ID returns 403 or 404 (not 200)", async () => {
    // assertStaffInCallerDistrict verifies the staff member's school→district
    // FK path. It returns 404 ("not found") to avoid revealing resource existence
    // to cross-district callers. Either 403 or 404 is acceptable; 200 is not.
    const res = await adminA().get(`/api/staff/${entitiesB.staff[0]}`);
    expect(res.status).not.toBe(200);
    expect([403, 404]).toContain(res.status);
  });

  it("GET /api/students/:id/sessions — district-B student sessions blocked (403)", async () => {
    const res = await adminA().get(
      `/api/students/${entitiesB.students[0]}/sessions`,
    );
    expect(res.status).toBe(403);
  });

  it("GET /api/students/:id/minute-progress — district-B student blocked (403)", async () => {
    const res = await adminA().get(
      `/api/students/${entitiesB.students[0]}/minute-progress`,
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// No-district-scope guard — a request with no district header must be blocked
// ---------------------------------------------------------------------------

describe("no-district-scope guard (fail-closed)", () => {
  const noScope = () => asUser({ userId: "u_no_district_matrix", role: "admin" });

  it("GET /api/students returns 403 without district scope", async () => {
    const res = await noScope().get("/api/students");
    expect(res.status).toBe(403);
  });

  it("GET /api/staff returns 403 without district scope", async () => {
    const res = await noScope().get("/api/staff");
    expect(res.status).toBe(403);
  });

  it("GET /api/imports returns 403 without district scope", async () => {
    // This is the fail-closed handler added in migration 019.
    // No legal acceptance seeded for u_no_district_matrix → 403 (legal gate).
    // Handler-level check returns 403 even after legal gate passes.
    const res = await noScope().get("/api/imports");
    expect(res.status).toBe(403);
  });
});
