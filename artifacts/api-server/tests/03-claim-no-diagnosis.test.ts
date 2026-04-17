/**
 * Medicaid claim generation honesty: no diagnosis → no claim.
 *
 * A previous version of generate-claims silently substituted "F84.0"
 * (Autistic disorder) when a student had no disability category on file.
 * That is fraudulent billing and is the single highest-risk regression
 * possible in this product.
 *
 * This suite proves:
 *   1. A session for a student with NO disabilityCategory is skipped with
 *      reason "no_diagnosis_on_student" — no claim row is created.
 *   2. A session for a student WITH a real disabilityCategory IS billed,
 *      and the claim's diagnosisCode matches what's on the student record
 *      (i.e., we don't substitute or normalize it away).
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
} from "./helpers";
import { db, medicaidClaimsTable, studentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

describe("medicaid claim generation: diagnosis honesty", () => {
  let districtId: number;
  let serviceTypeId: number;
  let studentNoDx: number;
  let studentWithDx: number;

  beforeAll(async () => {
    const d = await createDistrict();
    districtId = d.id;
    const school = await createSchool(districtId);
    const svc = await createServiceType();
    serviceTypeId = svc.id;
    await createCptMapping(districtId, serviceTypeId);

    const staff = await createStaff(school.id, { medicaidProviderId: "MED1", npiNumber: "1234567890" });

    const sNoDx = await createStudent(school.id, { disabilityCategory: null, medicaidId: "MID-NO" });
    const sDx = await createStudent(school.id, { disabilityCategory: "F70", medicaidId: "MID-DX" });
    studentNoDx = sNoDx.id;
    studentWithDx = sDx.id;

    await createSessionLog({
      studentId: studentNoDx, staffId: staff.id, serviceTypeId,
      sessionDate: "2025-03-04", durationMinutes: 30,
    });
    await createSessionLog({
      studentId: studentWithDx, staffId: staff.id, serviceTypeId,
      sessionDate: "2025-03-04", durationMinutes: 30,
    });
  });

  afterAll(async () => {
    await cleanupDistrict(districtId);
    await cleanupServiceType(serviceTypeId);
  });

  it("skips session when student has no disabilityCategory and reports the reason", async () => {
    const admin = asUser({ userId: "u_admin", role: "admin", districtId });
    const res = await admin.post("/api/medicaid/generate-claims").send({
      dateFrom: "2025-03-01", dateTo: "2025-03-31",
    });
    expect(res.status).toBe(200);

    const skipReasons = (res.body.skippedDetails as Array<{ reason: string }>).map((s) => s.reason);
    expect(skipReasons).toContain("no_diagnosis_on_student");

    const claimsForNoDx = await db
      .select()
      .from(medicaidClaimsTable)
      .where(eq(medicaidClaimsTable.studentId, studentNoDx));
    expect(claimsForNoDx.length).toBe(0);
  });

  it("DOES create a claim for a student with a real diagnosis, and uses the student's actual code", async () => {
    const claimsForWithDx = await db
      .select()
      .from(medicaidClaimsTable)
      .where(eq(medicaidClaimsTable.studentId, studentWithDx));
    expect(claimsForWithDx.length).toBeGreaterThan(0);
    expect(claimsForWithDx[0].diagnosisCode).toBe("F70");

    // Sanity: confirm we did NOT mutate the student record to fill in a fake
    // diagnosis on the no-dx student as a side effect.
    const [stillNoDx] = await db.select().from(studentsTable).where(eq(studentsTable.id, studentNoDx));
    expect(stillNoDx.disabilityCategory).toBeNull();
  });
});
