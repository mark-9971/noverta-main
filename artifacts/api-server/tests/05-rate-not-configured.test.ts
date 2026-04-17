/**
 * Rate-not-configured behavior.
 *
 * Two surfaces care about "we don't know what to charge":
 *
 *   1. Agency contracts: hourlyRate is optional. POST a contract without a
 *      rate must succeed (we don't fabricate a rate) but the contract row
 *      must store hourlyRate=NULL — we never silently coerce to 0 or "TBD".
 *   2. CPT mapping: POST /api/medicaid/generate-claims must skip sessions
 *      whose service type has no active mapping (reason: "no_cpt_mapping")
 *      and refuse to run at all when the district has zero active mappings.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  asUser, createDistrict, createSchool, createStaff, createStudent,
  createServiceType, createSessionLog, createAgency,
  cleanupDistrict, cleanupServiceType,
  seedLegalAcceptances, cleanupLegalAcceptances,
} from "./helpers";
import { db, agencyContractsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

describe("rate-not-configured behavior", () => {
  let districtId: number;
  let serviceTypeId: number;
  let agencyId: number;

  beforeAll(async () => {
    await seedLegalAcceptances(["u_admin"]);
    const d = await createDistrict();
    districtId = d.id;
    await createSchool(districtId);
    const svc = await createServiceType();
    serviceTypeId = svc.id;
    const ag = await createAgency(districtId);
    agencyId = ag.id;
  });

  afterAll(async () => {
    await cleanupDistrict(districtId);
    await cleanupServiceType(serviceTypeId);
    await cleanupLegalAcceptances(["u_admin"]);
  });

  it("POST agency contract with no hourlyRate stores NULL (not 0, not 'TBD')", async () => {
    const admin = asUser({ userId: "u_admin", role: "admin", districtId });
    const res = await admin.post(`/api/agencies/${agencyId}/contracts`).send({
      serviceTypeId,
      contractedHours: 100,
      startDate: "2025-09-01",
      endDate: "2026-06-30",
      // hourlyRate intentionally omitted
    });
    expect(res.status).toBe(201);

    const [contract] = await db
      .select()
      .from(agencyContractsTable)
      .where(eq(agencyContractsTable.id, res.body.id));
    expect(contract.hourlyRate).toBeNull();
  });

  it("POST agency contract with hourlyRate=0 still stores 0 (admin's explicit choice, not a fallback)", async () => {
    const admin = asUser({ userId: "u_admin", role: "admin", districtId });
    const svc2 = await createServiceType();
    try {
      const res = await admin.post(`/api/agencies/${agencyId}/contracts`).send({
        serviceTypeId: svc2.id,
        contractedHours: 50,
        hourlyRate: 0,
        startDate: "2025-09-01",
        endDate: "2026-06-30",
      });
      expect(res.status).toBe(201);
      const [contract] = await db
        .select()
        .from(agencyContractsTable)
        .where(eq(agencyContractsTable.id, res.body.id));
      // Numeric 0 is honored — we should not treat 0 as "no rate."
      expect(Number(contract.hourlyRate)).toBe(0);
    } finally {
      await cleanupServiceType(svc2.id);
    }
  });

  it("generate-claims refuses to run when district has zero active CPT mappings (400)", async () => {
    const admin = asUser({ userId: "u_admin", role: "admin", districtId });
    const res = await admin.post("/api/medicaid/generate-claims").send({
      dateFrom: "2025-04-01", dateTo: "2025-04-30",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/CPT/i);
  });

  it("generate-claims skips sessions whose service type has no active CPT mapping", async () => {
    // Add a CPT mapping for a DIFFERENT service type, then create a session
    // against the unmapped one. The mapped service unlocks generate-claims to
    // run, but the session for the unmapped service must be reported as
    // skipped with reason="no_cpt_mapping".
    const mappedSvc = await createServiceType();
    const unmappedSvc = await createServiceType();
    const { createCptMapping } = await import("./helpers");
    await createCptMapping(districtId, mappedSvc.id);

    const school = await createSchool(districtId);
    const staff = await createStaff(school.id);
    const student = await createStudent(school.id, { disabilityCategory: "F84.0" });
    await createSessionLog({
      studentId: student.id,
      staffId: staff.id,
      serviceTypeId: unmappedSvc.id,
      sessionDate: "2025-05-15",
      durationMinutes: 30,
    });

    try {
      const admin = asUser({ userId: "u_admin", role: "admin", districtId });
      const res = await admin.post("/api/medicaid/generate-claims").send({
        dateFrom: "2025-05-01", dateTo: "2025-05-31",
      });
      expect(res.status).toBe(200);
      const reasons = (res.body.skippedDetails as Array<{ reason: string }>).map((s) => s.reason);
      expect(reasons).toContain("no_cpt_mapping");
    } finally {
      // CPT mappings FK-reference service_types; the parent district cleanup
      // hook only knows to drop CPT rows under the test district. We dropped
      // a mapping above on `mappedSvc`, so delete it explicitly before the
      // service_types delete to keep the FK happy.
      const { db, cptCodeMappingsTable } = await import("@workspace/db");
      const { inArray } = await import("drizzle-orm");
      await db.delete(cptCodeMappingsTable).where(inArray(cptCodeMappingsTable.serviceTypeId, [mappedSvc.id, unmappedSvc.id]));
      await cleanupServiceType(mappedSvc.id);
      await cleanupServiceType(unmappedSvc.id);
    }
  });
});
