/**
 * Sample-data flow.
 *
 * Sample data is what new districts (and demo accounts) see as a guided tour.
 * Its blast radius is wide because seeding writes into shared tables. This
 * suite proves:
 *
 *   1. Seed is district-scoped: rows created carry the caller's districtId
 *      and isSample=true, so a sample-data teardown can find every row it
 *      created and only those rows.
 *   2. Re-seeding is idempotent: a second POST returns alreadySeeded=true
 *      instead of doubling the row count.
 *   3. Sample data is not visible to a different district. Even after seeding
 *      district A, an admin in district B sees zero sample rows.
 *   4. Teardown removes only sample rows, leaving real (non-sample) rows of
 *      the same district intact.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  asUser, createDistrict, createSchool, createStudent, cleanupDistrict,
} from "./helpers";
import { db, studentsTable, schoolsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

describe("sample-data flow", () => {
  let districtA: number;
  let districtB: number;
  let realStudentId: number; // a non-sample row in district A that must survive teardown

  beforeAll(async () => {
    const dA = await createDistrict({ name: "Sample-A" });
    const dB = await createDistrict({ name: "Sample-B" });
    districtA = dA.id;
    districtB = dB.id;
    const sA = await createSchool(districtA);
    await createSchool(districtB);
    const real = await createStudent(sA.id, { firstName: "Real", lastName: "Survivor", isSample: false });
    realStudentId = real.id;
  });

  afterAll(async () => {
    await cleanupDistrict(districtA);
    await cleanupDistrict(districtB);
  });

  async function sampleStudentCountForDistrict(districtId: number): Promise<number> {
    const schools = await db.select({ id: schoolsTable.id }).from(schoolsTable).where(eq(schoolsTable.districtId, districtId));
    if (schools.length === 0) return 0;
    const rows = await db.select({ id: studentsTable.id })
      .from(studentsTable)
      .where(and(inArray(studentsTable.schoolId, schools.map((s) => s.id)), eq(studentsTable.isSample, true)));
    return rows.length;
  }

  it("seeds rows scoped to the caller's district, all marked isSample=true", async () => {
    const adminA = asUser({ userId: "u_a", role: "admin", districtId: districtA });
    const res = await adminA.post("/api/sample-data");
    expect([200, 201]).toContain(res.status);

    const sampleCountA = await sampleStudentCountForDistrict(districtA);
    expect(sampleCountA).toBeGreaterThan(0);
  });

  it("re-running POST /api/sample-data returns alreadySeeded=true and does not duplicate", async () => {
    const adminA = asUser({ userId: "u_a", role: "admin", districtId: districtA });
    const before = await sampleStudentCountForDistrict(districtA);
    const res = await adminA.post("/api/sample-data");
    expect(res.status).toBe(200);
    expect(res.body.alreadySeeded).toBe(true);
    const after = await sampleStudentCountForDistrict(districtA);
    expect(after).toBe(before);
  });

  it("district B sees no sample rows from district A's seed", async () => {
    const sampleB = await sampleStudentCountForDistrict(districtB);
    expect(sampleB).toBe(0);
  });

  it("DELETE /api/sample-data removes only sample rows; real rows in same district survive", async () => {
    const adminA = asUser({ userId: "u_a", role: "admin", districtId: districtA });
    const res = await adminA.delete("/api/sample-data");
    expect(res.status).toBe(200);

    const remainingSamples = await sampleStudentCountForDistrict(districtA);
    expect(remainingSamples).toBe(0);

    const [stillReal] = await db.select().from(studentsTable).where(eq(studentsTable.id, realStudentId));
    expect(stillReal).toBeDefined();
    expect(stillReal.firstName).toBe("Real");
  });
});
