/**
 * Regression tests for POST /api/data-health/migration-report/:id/resolve.
 *
 * Pins the contract from task 912:
 *   - 200 happy path: sets resolvedAt and resolvedBy from the caller's
 *     tenantStaffId, returns alreadyResolved=false.
 *   - 200 idempotent re-call: returns alreadyResolved=true, the original
 *     resolvedAt is preserved (not bumped), and resolvedBy isn't rewritten.
 *   - 404 cross-district: a row owned by another district is invisible
 *     to the caller (district scoping enforced via the school join).
 *   - 400 non-numeric / non-positive id.
 *   - 403 caller has no district scope (missing x-test-district-id header).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
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
import {
  db,
  serviceRequirementsTable,
  migrationReportServiceRequirementsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const USER_ADMIN_A = "u_dh_resolve_admin_a";
const USER_ADMIN_B = "u_dh_resolve_admin_b";
const USER_ADMIN_NO_SCOPE = "u_dh_resolve_admin_noscope";

let districtAId: number;
let districtBId: number;
let staffAId: number;
let serviceTypeId: number;

const insertedReqIds: number[] = [];
const insertedReportIds: number[] = [];

async function makeReq(studentId: number): Promise<number> {
  const [row] = await db
    .insert(serviceRequirementsTable)
    .values({
      studentId,
      serviceTypeId,
      requiredMinutes: 30,
      intervalType: "monthly",
      startDate: "2025-01-01",
      active: true,
    })
    .returning({ id: serviceRequirementsTable.id });
  insertedReqIds.push(row.id);
  return row.id;
}

async function makeReport(requirementId: number, opts: { resolved?: boolean } = {}): Promise<number> {
  const [row] = await db
    .insert(migrationReportServiceRequirementsTable)
    .values({
      requirementId,
      reason: "overlapping_chain_uncoupled",
      detailsJson: { test: true },
      resolvedAt: opts.resolved ? new Date("2025-01-15T10:00:00Z") : null,
    })
    .returning({ id: migrationReportServiceRequirementsTable.id });
  insertedReportIds.push(row.id);
  return row.id;
}

let districtAStudentId: number;
let districtBStudentId: number;

beforeAll(async () => {
  await seedLegalAcceptances([USER_ADMIN_A, USER_ADMIN_B, USER_ADMIN_NO_SCOPE]);

  const dA = await createDistrict({ name: "Test District DH Resolve A" });
  districtAId = dA.id;
  const schA = await createSchool(districtAId);
  const sfA = await createStaff(schA.id, { role: "provider" });
  staffAId = sfA.id;
  const stuA = await createStudent(schA.id);
  districtAStudentId = stuA.id;

  const dB = await createDistrict({ name: "Test District DH Resolve B" });
  districtBId = dB.id;
  const schB = await createSchool(districtBId);
  const stuB = await createStudent(schB.id);
  districtBStudentId = stuB.id;

  const svc = await createServiceType();
  serviceTypeId = svc.id;
});

afterAll(async () => {
  if (insertedReportIds.length > 0) {
    await db
      .delete(migrationReportServiceRequirementsTable)
      .where(inArray(migrationReportServiceRequirementsTable.id, insertedReportIds));
  }
  if (insertedReqIds.length > 0) {
    await db
      .delete(serviceRequirementsTable)
      .where(inArray(serviceRequirementsTable.id, insertedReqIds));
  }
  await cleanupDistrict(districtAId);
  await cleanupDistrict(districtBId);
  await cleanupServiceType(serviceTypeId);
  await cleanupLegalAcceptances([USER_ADMIN_A, USER_ADMIN_B, USER_ADMIN_NO_SCOPE]);
});

describe("POST /api/data-health/migration-report/:id/resolve", () => {
  it("200: happy path — sets resolvedAt and resolvedBy, returns alreadyResolved=false", async () => {
    const reqId = await makeReq(districtAStudentId);
    const reportId = await makeReport(reqId);

    const adminA = asUser({ userId: USER_ADMIN_A, role: "admin", districtId: districtAId });
    const res = await adminA
      .post(`/api/data-health/migration-report/${reportId}/resolve`)
      .set("x-test-staff-id", String(staffAId));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(reportId);
    expect(res.body.alreadyResolved).toBe(false);
    expect(typeof res.body.resolvedAt).toBe("string");
    expect(Number.isFinite(Date.parse(res.body.resolvedAt))).toBe(true);

    const [persisted] = await db
      .select()
      .from(migrationReportServiceRequirementsTable)
      .where(eq(migrationReportServiceRequirementsTable.id, reportId));
    expect(persisted.resolvedAt).toBeTruthy();
    expect(persisted.resolvedBy).toBe(staffAId);
  });

  it("200: idempotent — re-resolving an already-resolved row returns alreadyResolved=true and preserves the original resolvedAt", async () => {
    const reqId = await makeReq(districtAStudentId);
    const originalResolvedAt = new Date("2025-01-15T10:00:00Z");
    const reportId = await makeReport(reqId, { resolved: true });

    const adminA = asUser({ userId: USER_ADMIN_A, role: "admin", districtId: districtAId });
    const res = await adminA
      .post(`/api/data-health/migration-report/${reportId}/resolve`)
      .set("x-test-staff-id", String(staffAId));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(reportId);
    expect(res.body.alreadyResolved).toBe(true);
    expect(res.body.resolvedAt).toBe(originalResolvedAt.toISOString());

    // Underlying row is untouched: resolvedAt stays at the original value
    // and resolvedBy is not rewritten with the second caller's staff id.
    const [persisted] = await db
      .select()
      .from(migrationReportServiceRequirementsTable)
      .where(eq(migrationReportServiceRequirementsTable.id, reportId));
    expect(persisted.resolvedAt?.toISOString()).toBe(originalResolvedAt.toISOString());
    expect(persisted.resolvedBy).toBeNull();
  });

  it("404: a report row belonging to another district is invisible to the caller", async () => {
    const reqId = await makeReq(districtBStudentId);
    const reportId = await makeReport(reqId);

    const adminA = asUser({ userId: USER_ADMIN_A, role: "admin", districtId: districtAId });
    const res = await adminA.post(`/api/data-health/migration-report/${reportId}/resolve`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Report row not found");

    // The cross-district row must still be unresolved — the caller could
    // not see it, so it could not have been mutated.
    const [persisted] = await db
      .select()
      .from(migrationReportServiceRequirementsTable)
      .where(eq(migrationReportServiceRequirementsTable.id, reportId));
    expect(persisted.resolvedAt).toBeNull();
    expect(persisted.resolvedBy).toBeNull();
  });

  it("400: non-numeric id is rejected before the DB is touched", async () => {
    const adminA = asUser({ userId: USER_ADMIN_A, role: "admin", districtId: districtAId });
    const res = await adminA.post(`/api/data-health/migration-report/not-a-number/resolve`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid report id");
  });

  it("400: zero / non-positive id is rejected", async () => {
    const adminA = asUser({ userId: USER_ADMIN_A, role: "admin", districtId: districtAId });
    const res = await adminA.post(`/api/data-health/migration-report/0/resolve`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid report id");
  });

  it("403: caller with no district scope is rejected", async () => {
    const reqId = await makeReq(districtAStudentId);
    const reportId = await makeReport(reqId);

    // No districtId → no x-test-district-id header is sent. The router-level
    // requireDistrictScope guard rejects this with 403 before our handler
    // runs (and our handler has its own getEnforcedDistrictId() == null
    // backstop returning the same status). Either way the contract is:
    // a caller with no district scope cannot resolve a report row.
    const adminNoScope = asUser({ userId: USER_ADMIN_NO_SCOPE, role: "admin", districtId: null });
    const res = await adminNoScope.post(`/api/data-health/migration-report/${reportId}/resolve`);

    expect(res.status).toBe(403);
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);

    // The unscoped call must not have flipped the row to resolved.
    const [persisted] = await db
      .select()
      .from(migrationReportServiceRequirementsTable)
      .where(eq(migrationReportServiceRequirementsTable.id, reportId));
    expect(persisted.resolvedAt).toBeNull();
    expect(persisted.resolvedBy).toBeNull();
  });
});
