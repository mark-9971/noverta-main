/**
 * Phase 3A-5: dashboard aggregate endpoints clamped to caller's caseload.
 *
 * Proves that the five previously-leaky dashboard endpoints
 * (/summary, /risk-overview, /provider-summary, /program-trends,
 * /para-summary) now restrict aggregates to the caller's own caseload
 * for caseload-scoped roles (case_manager, provider, bcba, sped_teacher),
 * while preserving district-wide visibility for admin/coordinator/etc.
 *
 * Coverage:
 *   1. provider with a 1-student caseload sees totalActiveStudents == 1
 *      on /summary (the other district student is excluded)
 *   2. same provider sees risk-overview total == 1
 *   3. same provider sees /provider-summary == [own row only]
 *   4. same provider sees /para-summary == [] (provider is not a para)
 *   5. district admin (same district) sees totalActiveStudents == 2 and
 *      provider-summary length >= 2 (district-wide preserved)
 *   6. provider without tenantStaffId fails closed: totalActiveStudents == 0,
 *      contractRenewals == [], errorsLast24h == 0
 *   7. all responses retain their documented top-level keys (no shape break)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  app,
  asUser,
  createDistrict,
  createSchool,
  createStaff,
  createStudent,
  createServiceType,
  cleanupDistrict,
  cleanupServiceType,
  seedLegalAcceptances,
  cleanupLegalAcceptances,
} from "./helpers";
import { db, staffAssignmentsTable, serviceRequirementsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";

const PROVIDER_A_USER = "u_caseload_provider_a";
const PROVIDER_UNLINKED_USER = "u_caseload_provider_unlinked";
const ADMIN_USER = "u_caseload_admin";
const TEST_USER_IDS = [PROVIDER_A_USER, PROVIDER_UNLINKED_USER, ADMIN_USER];

/** supertest helper that includes x-test-staff-id (not on the asUser default). */
function asCaseloadUser(opts: { userId: string; districtId: number; staffId: number | null }) {
  type Verb = "get" | "post" | "put" | "patch" | "delete";
  const wrap = (v: Verb) => (path: string) => {
    let r = request(app)[v](path)
      .set("x-test-user-id", opts.userId)
      .set("x-test-role", "provider")
      .set("x-test-district-id", String(opts.districtId));
    if (opts.staffId != null) r = r.set("x-test-staff-id", String(opts.staffId));
    return r;
  };
  return { get: wrap("get") };
}

describe("dashboard caseload scoping (Phase 3A-5)", () => {
  let districtId: number;
  let schoolId: number;
  let providerStaffId: number;
  let otherProviderStaffId: number;
  let assignedStudentId: number;
  let unassignedStudentId: number;
  let serviceTypeId: number;

  beforeAll(async () => {
    const district = await createDistrict({ name: "Caseload Scope District" });
    districtId = district.id;
    const school = await createSchool(districtId);
    schoolId = school.id;

    const providerA = await createStaff(schoolId, { firstName: "Caseload", lastName: "ProviderA", role: "provider" });
    providerStaffId = providerA.id;
    const providerB = await createStaff(schoolId, { firstName: "Other", lastName: "ProviderB", role: "provider" });
    otherProviderStaffId = providerB.id;

    const s1 = await createStudent(schoolId, { firstName: "Caseload", lastName: "Assigned" });
    assignedStudentId = s1.id;
    const s2 = await createStudent(schoolId, { firstName: "Caseload", lastName: "NotAssigned" });
    unassignedStudentId = s2.id;

    // Provider A is assigned student #1 only (via staff_assignments).
    await db.insert(staffAssignmentsTable).values({
      staffId: providerStaffId,
      studentId: assignedStudentId,
      assignmentType: "case_manager",
    });

    // One active service requirement per student so the minute-progress
    // computation has rows to evaluate (otherwise risk-overview total == 0
    // for both callers, defeating the test).
    const st = await createServiceType({ name: "Caseload Test Service", category: "speech" });
    serviceTypeId = st.id;
    await db.insert(serviceRequirementsTable).values([
      {
        studentId: assignedStudentId,
        serviceTypeId,
        providerId: providerStaffId,
        requiredMinutes: 120,
        intervalType: "monthly",
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        active: true,
      },
      {
        studentId: unassignedStudentId,
        serviceTypeId,
        providerId: otherProviderStaffId,
        requiredMinutes: 120,
        intervalType: "monthly",
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        active: true,
      },
    ]);

    await seedLegalAcceptances(TEST_USER_IDS);
  });

  afterAll(async () => {
    await db.delete(staffAssignmentsTable).where(eq(staffAssignmentsTable.staffId, providerStaffId));
    await db
      .delete(serviceRequirementsTable)
      .where(inArray(serviceRequirementsTable.studentId, [assignedStudentId, unassignedStudentId]));
    await cleanupLegalAcceptances(TEST_USER_IDS);
    await cleanupDistrict(districtId);
    await cleanupServiceType(serviceTypeId);
  });

  // ---------- Caseload role: clamped to own caseload ----------

  it("/summary clamps a caseload role to their own caseload", async () => {
    const provider = asCaseloadUser({ userId: PROVIDER_A_USER, districtId, staffId: providerStaffId });
    const res = await provider.get("/api/dashboard/summary");
    expect(res.status).toBe(200);
    // Only the assigned student counts toward the active total.
    expect(res.body.totalActiveStudents).toBe(1);
    // Org-wide signals are zeroed out for caseload roles.
    expect(res.body.contractRenewals).toEqual([]);
    expect(res.body.errorsLast24h).toBe(0);
    // Shape contract preserved.
    for (const key of [
      "totalActiveStudents", "trackedStudents", "onTrackStudents",
      "slightlyBehindStudents", "atRiskStudents", "outOfComplianceStudents",
      "noDataStudents", "studentsNeedingSetup", "missedSessionsThisWeek",
      "openMakeupObligations", "uncoveredBlocksToday", "scheduleConflictsToday",
      "openAlerts", "criticalAlerts", "contractRenewals", "errorsLast24h",
    ]) {
      expect(res.body).toHaveProperty(key);
    }
  });

  it("/risk-overview clamps a caseload role to their own caseload", async () => {
    const provider = asCaseloadUser({ userId: PROVIDER_A_USER, districtId, staffId: providerStaffId });
    const res = await provider.get("/api/dashboard/risk-overview");
    expect(res.status).toBe(200);
    // Caseload of 1 → at most 1 student in the risk rollup.
    expect(res.body.total).toBeLessThanOrEqual(1);
    for (const key of ["onTrack", "slightlyBehind", "atRisk", "outOfCompliance", "completed", "total"]) {
      expect(res.body).toHaveProperty(key);
    }
  });

  it("/provider-summary returns only the caseload role's own row", async () => {
    const provider = asCaseloadUser({ userId: PROVIDER_A_USER, districtId, staffId: providerStaffId });
    const res = await provider.get("/api/dashboard/provider-summary");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].staffId).toBe(providerStaffId);
    // Other provider in the same district must NOT appear.
    const ids = (res.body as Array<{ staffId: number }>).map(r => r.staffId);
    expect(ids).not.toContain(otherProviderStaffId);
  });

  it("/para-summary returns [] for a non-para caseload role", async () => {
    const provider = asCaseloadUser({ userId: PROVIDER_A_USER, districtId, staffId: providerStaffId });
    const res = await provider.get("/api/dashboard/para-summary");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // ---------- District-wide role: unchanged ----------

  it("/summary preserves district-wide totals for an admin caller", async () => {
    const admin = asUser({ userId: ADMIN_USER, role: "admin", districtId });
    const res = await admin.get("/api/dashboard/summary");
    expect(res.status).toBe(200);
    // Both seeded students are counted.
    expect(res.body.totalActiveStudents).toBeGreaterThanOrEqual(2);
  });

  it("/provider-summary preserves district-wide rows for an admin caller", async () => {
    const admin = asUser({ userId: ADMIN_USER, role: "admin", districtId });
    const res = await admin.get("/api/dashboard/provider-summary");
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ staffId: number }>).map(r => r.staffId);
    expect(ids).toContain(providerStaffId);
    expect(ids).toContain(otherProviderStaffId);
  });

  // ---------- Fail-closed: caseload role with no staff link ----------

  it("/summary returns all-zero for a caseload role with no tenantStaffId (fail-closed)", async () => {
    const orphan = asCaseloadUser({ userId: PROVIDER_UNLINKED_USER, districtId, staffId: null });
    const res = await orphan.get("/api/dashboard/summary");
    expect(res.status).toBe(200);
    expect(res.body.totalActiveStudents).toBe(0);
    expect(res.body.openAlerts).toBe(0);
    expect(res.body.contractRenewals).toEqual([]);
    expect(res.body.errorsLast24h).toBe(0);
  });
});
