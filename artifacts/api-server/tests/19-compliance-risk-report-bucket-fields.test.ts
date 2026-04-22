/**
 * Focused contract test for GET /api/reports/compliance-risk-report (JSON).
 *
 * Verifies that each row in `studentDetail` carries the T03/T05 bucket
 * fields the client `MakeupMinutesPill` reads:
 *   - scheduledPendingMinutes  (server-computed pending-makeup minutes)
 *   - pendingMakeupBlocksCount (count of distinct future makeup blocks)
 *   - stillAtRiskMinutes       (honest at-risk = shortfall − scheduledPending)
 *
 * This test is intentionally narrow: the bucket math itself is unit-tested
 * via minuteCalc; here we only assert the wiring/contract from the route
 * to the JSON response so the UI primitive cannot silently regress to
 * defaulting all three to 0.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  db,
  serviceRequirementsTable,
  scheduleBlocksTable,
  sessionLogsTable,
} from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import {
  asUser,
  createDistrict,
  createSchool,
  createStudent,
  createStaff,
  createServiceType,
  cleanupDistrict,
  cleanupServiceType,
  seedLegalAcceptances,
  cleanupLegalAcceptances,
} from "./helpers";

const ADMIN_USER = "admin-risk-bucket-fields";

let districtId: number;
let schoolId: number;
let staffId: number;
let serviceTypeId: number;
let studentId: number;
let requirementId: number;
const insertedBlockIds: number[] = [];
const insertedSessionIds: number[] = [];

function todayStr(): string {
  return new Date().toISOString().substring(0, 10);
}

function dayOfWeekFor(date: Date): string {
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][date.getDay()];
}

beforeAll(async () => {
  // Defensive cleanup of any stale rows from earlier failed runs.
  await db.execute(sql`
    DELETE FROM schedule_blocks WHERE staff_id IN (
      SELECT id FROM staff WHERE school_id IN (
        SELECT id FROM schools WHERE district_id IN (
          SELECT id FROM districts WHERE name = 'Test District Risk Bucket'
        )
      )
    )
  `);
  await db.execute(sql`
    DELETE FROM service_requirements WHERE student_id IN (
      SELECT id FROM students WHERE school_id IN (
        SELECT id FROM schools WHERE district_id IN (
          SELECT id FROM districts WHERE name = 'Test District Risk Bucket'
        )
      )
    )
  `);

  const district = await createDistrict({ name: "Test District Risk Bucket" });
  districtId = district.id;
  const school = await createSchool(districtId, { name: "Test School Risk Bucket" });
  schoolId = school.id;

  const staff = await createStaff(schoolId, { firstName: "Pat", lastName: "Provider", role: "provider" });
  staffId = staff.id;

  const svcType = await createServiceType({ name: `Service RiskBucket_${Date.now()}` });
  serviceTypeId = svcType.id;

  const student = await createStudent(schoolId, {
    firstName: "Riley",
    lastName: "Risk",
    grade: "4",
    status: "active",
  });
  studentId = student.id;

  // 60 min/week required, no delivered → shortfall = 60 min.
  const [req] = await db.insert(serviceRequirementsTable).values({
    studentId,
    serviceTypeId,
    providerId: staffId,
    requiredMinutes: 60,
    intervalType: "weekly",
    startDate: todayStr(),
    active: true,
  }).returning();
  requirementId = req.id;

  // Seed a future scheduled makeup block with a sourceActionItemId pointing
  // at this requirement — this is what minuteCalc counts as "scheduled
  // pending" for the T03 bucket. A 30-min block tomorrow.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [block] = await db.insert(scheduleBlocksTable).values({
    staffId,
    studentId,
    serviceTypeId,
    dayOfWeek: dayOfWeekFor(tomorrow),
    startTime: "09:00",
    endTime: "09:30",
    blockType: "makeup",
    isRecurring: false,
    effectiveFrom: tomorrow.toISOString().substring(0, 10),
    effectiveTo: tomorrow.toISOString().substring(0, 10),
    sourceActionItemId: `risk:${studentId}:${req.id}`,
  }).returning();
  insertedBlockIds.push(block.id);

  await seedLegalAcceptances([ADMIN_USER]);
});

afterAll(async () => {
  if (insertedSessionIds.length > 0) {
    await db.delete(sessionLogsTable).where(inArray(sessionLogsTable.id, insertedSessionIds));
  }
  if (insertedBlockIds.length > 0) {
    await db.delete(scheduleBlocksTable).where(inArray(scheduleBlocksTable.id, insertedBlockIds));
  }
  if (requirementId) {
    await db.delete(serviceRequirementsTable).where(eq(serviceRequirementsTable.id, requirementId));
  }
  await cleanupLegalAcceptances([ADMIN_USER]);
  await cleanupDistrict(districtId);
  await cleanupServiceType(serviceTypeId);
});

describe("GET /reports/compliance-risk-report — T03 bucket fields are present in JSON", () => {
  it("studentDetail rows include scheduledPendingMinutes, pendingMakeupBlocksCount, stillAtRiskMinutes", async () => {
    const admin = asUser({ userId: ADMIN_USER, role: "admin", districtId });
    const res = await admin.get("/api/reports/compliance-risk-report");
    expect(res.status).toBe(200);

    const body = res.body as {
      studentDetail: Array<{
        studentId: number;
        serviceRequirementId: number;
        requiredMinutes: number;
        deliveredMinutes: number;
        shortfallMinutes: number;
        scheduledPendingMinutes: number;
        pendingMakeupBlocksCount: number;
        stillAtRiskMinutes: number;
      }>;
    };

    expect(Array.isArray(body.studentDetail)).toBe(true);
    const row = body.studentDetail.find(r => r.serviceRequirementId === requirementId);
    expect(row, "row for seeded requirement should exist").toBeDefined();
    if (!row) return;

    // Contract — fields exist with the right numeric type (not undefined).
    expect(typeof row.scheduledPendingMinutes).toBe("number");
    expect(typeof row.pendingMakeupBlocksCount).toBe("number");
    expect(typeof row.stillAtRiskMinutes).toBe("number");

    // Wiring — the seeded 30-min future makeup block must be reflected:
    expect(row.scheduledPendingMinutes).toBe(30);
    expect(row.pendingMakeupBlocksCount).toBe(1);

    // Honest at-risk math — shortfall (60) minus scheduled-pending (30) = 30.
    expect(row.shortfallMinutes).toBe(60);
    expect(row.stillAtRiskMinutes).toBe(30);
  });
});
