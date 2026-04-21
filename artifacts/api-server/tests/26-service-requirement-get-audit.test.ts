/**
 * Regression tests for the migration-report audit trail surfaced by
 * GET /api/service-requirements/:id (task 938).
 *
 * Pins the contract:
 *   - With no resolved migration_report_service_requirements rows, the
 *     endpoint omits/nullifies the audit fields and returns an empty
 *     reviewHistory.
 *   - With one resolved row, lastReviewedAt / lastReviewedByName reflect
 *     it and reviewHistory has length 1.
 *   - With multiple resolved rows, the most recent (by resolved_at, then
 *     id) is featured, and earlier rows appear later in reviewHistory.
 *   - Unresolved rows (resolved_at IS NULL) are ignored.
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
import { inArray } from "drizzle-orm";

const USER_ADMIN = "u_sr_get_audit_admin";

let districtId: number;
let schoolId: number;
let resolverAId: number;
let resolverBId: number;
let serviceTypeId: number;
let studentId: number;

const insertedReqIds: number[] = [];
const insertedReportIds: number[] = [];

async function makeReq(): Promise<number> {
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

async function makeReport(opts: {
  requirementId: number;
  resolverId?: number | null;
  resolvedAt?: Date | null;
}): Promise<number> {
  const [row] = await db
    .insert(migrationReportServiceRequirementsTable)
    .values({
      requirementId: opts.requirementId,
      reason: "missing_school_id",
      detailsJson: { test: true },
      resolvedAt: opts.resolvedAt ?? null,
      resolvedBy: opts.resolverId ?? null,
    })
    .returning({ id: migrationReportServiceRequirementsTable.id });
  insertedReportIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  await seedLegalAcceptances([USER_ADMIN]);
  const d = await createDistrict({ name: "Test District SR Get Audit" });
  districtId = d.id;
  const sch = await createSchool(districtId);
  schoolId = sch.id;
  const stf = await createStaff(schoolId, { role: "admin", firstName: "Riley", lastName: "Reviewer" });
  resolverAId = stf.id;
  const stf2 = await createStaff(schoolId, { role: "admin", firstName: "Sam", lastName: "Second" });
  resolverBId = stf2.id;
  const stu = await createStudent(schoolId);
  studentId = stu.id;
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
  await cleanupDistrict(districtId);
  await cleanupServiceType(serviceTypeId);
  await cleanupLegalAcceptances([USER_ADMIN]);
});

describe("GET /api/service-requirements/:id — migration-report audit trail", () => {
  it("returns null audit fields when no resolved rows exist", async () => {
    const reqId = await makeReq();
    // An UNresolved report row must not be surfaced.
    await makeReport({ requirementId: reqId, resolvedAt: null });

    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const res = await adm.get(`/api/service-requirements/${reqId}`);
    expect(res.status).toBe(200);
    expect(res.body.lastReviewedAt).toBeNull();
    expect(res.body.lastReviewedByName).toBeNull();
    expect(res.body.reviewHistory).toEqual([]);
  });

  it("surfaces the resolver name and date for a single resolved row", async () => {
    const reqId = await makeReq();
    await makeReport({
      requirementId: reqId,
      resolverId: resolverAId,
      resolvedAt: new Date("2025-03-10T12:00:00Z"),
    });

    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const res = await adm.get(`/api/service-requirements/${reqId}`);
    expect(res.status).toBe(200);
    expect(res.body.lastReviewedByName).toBe("Riley Reviewer");
    expect(res.body.lastReviewedAt).toBe("2025-03-10T12:00:00.000Z");
    expect(res.body.reviewHistory).toHaveLength(1);
    expect(res.body.reviewHistory[0]).toMatchObject({
      resolvedByName: "Riley Reviewer",
      resolvedAt: "2025-03-10T12:00:00.000Z",
    });
  });

  it("features the most recent resolved row and lists older ones in reviewHistory", async () => {
    const reqId = await makeReq();
    // Older (resolver A)
    await makeReport({
      requirementId: reqId,
      resolverId: resolverAId,
      resolvedAt: new Date("2025-02-01T09:00:00Z"),
    });
    // Newer (resolver B) — should be featured.
    await makeReport({
      requirementId: reqId,
      resolverId: resolverBId,
      resolvedAt: new Date("2025-04-20T15:30:00Z"),
    });
    // Unresolved row — must be ignored.
    await makeReport({ requirementId: reqId, resolvedAt: null });

    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const res = await adm.get(`/api/service-requirements/${reqId}`);
    expect(res.status).toBe(200);
    expect(res.body.lastReviewedByName).toBe("Sam Second");
    expect(res.body.lastReviewedAt).toBe("2025-04-20T15:30:00.000Z");
    expect(res.body.reviewHistory).toHaveLength(2);
    expect(res.body.reviewHistory[0].resolvedByName).toBe("Sam Second");
    expect(res.body.reviewHistory[1].resolvedByName).toBe("Riley Reviewer");
    expect(res.body.reviewHistory[1].resolvedAt).toBe("2025-02-01T09:00:00.000Z");
  });
});
