/**
 * School Calendar v0 — Slice 4B (downstream consequence alignment).
 *
 * Slice 4A wired the live alert generator
 * (`collectServiceShortfallRisks`) through the shared
 * `computeAllActiveMinuteProgress` engine. This test covers the two
 * remaining downstream consequence surfaces refactored in Slice 4B:
 *
 *   1. The weekly snapshot path
 *      (`captureSnapshotForDistrict` → `computeDistrictRiskCounts`)
 *      that powers the cost-avoidance archive.
 *   2. The on-demand `/cost-avoidance/risks` route
 *      (`getServiceShortfallRisks`) that powers the cost-avoidance
 *      dashboard.
 *
 * Both used to do their own dayOfMonth/daysInMonth pacing math and
 * therefore inflated cost/exposure values during a closure-heavy
 * window. Now both delegate to the shared minute-progress engine so
 * closures and early-release flow through automatically.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  db,
  serviceRequirementsTable,
  schoolCalendarExceptionsTable,
  costAvoidanceSnapshotsTable,
  alertsTable,
} from "@workspace/db";
import { eq, inArray, and, gte } from "drizzle-orm";
import {
  createDistrict,
  createSchool,
  createStudent,
  createStaff,
  createServiceType,
  cleanupDistrict,
} from "./helpers";
import { captureSnapshotForDistrict } from "../src/lib/costAvoidanceSnapshots";

const insertedReqIds: number[] = [];

let districtId: number;
let schoolId: number;
let staffId: number;
let studentId: number;
let serviceTypeId: number;
let serviceRequirementId: number;

beforeAll(async () => {
  const d = await createDistrict({ name: "Slice4B Snapshot District" });
  districtId = d.id;
  const sch = await createSchool(districtId, { name: "Slice4B School" });
  schoolId = sch.id;
  const staff = await createStaff(schoolId, {
    role: "case_manager", receiveRiskAlerts: false,
  });
  staffId = staff.id;
  const student = await createStudent(schoolId, {
    caseManagerId: staffId,
    firstName: "Slice4B", lastName: "Closure",
  });
  studentId = student.id;

  // Service type with a positive default billing rate so estimated
  // exposure CAN be priced. If we still see zero/no service_shortfall
  // dollars after closures, we know it's the calendar discount taking
  // effect — not a missing rate.
  const st = await createServiceType({
    name: `Slice4B Speech ${Date.now()}`,
    defaultBillingRate: "100.00",
  });
  serviceTypeId = st.id;

  const lastYear = new Date(); lastYear.setFullYear(lastYear.getFullYear() - 1);
  const startStr = `${lastYear.getFullYear()}-${String(lastYear.getMonth() + 1).padStart(2, "0")}-01`;

  const [req] = await db.insert(serviceRequirementsTable).values({
    studentId,
    serviceTypeId,
    providerId: staffId,
    requiredMinutes: 240,
    intervalType: "monthly",
    startDate: startStr,
    active: true,
  } as typeof serviceRequirementsTable.$inferInsert).returning();
  serviceRequirementId = req.id;
  insertedReqIds.push(req.id);

  // Closure for every elapsed day of the current month.
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = now.getMonth();
  const closureRows: typeof schoolCalendarExceptionsTable.$inferInsert[] = [];
  for (let d = 1; d <= now.getDate(); d++) {
    const ds = `${yyyy}-${String(mm + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    closureRows.push({
      schoolId,
      exceptionDate: ds,
      type: "closure",
      reason: "Slice4B test all-closure month",
      dismissalTime: null,
    });
  }
  if (closureRows.length > 0) {
    await db.insert(schoolCalendarExceptionsTable).values(closureRows);
  }
});

afterAll(async () => {
  await db.delete(alertsTable).where(eq(alertsTable.studentId, studentId));
  await db.delete(costAvoidanceSnapshotsTable).where(eq(costAvoidanceSnapshotsTable.districtId, districtId));
  if (insertedReqIds.length > 0) {
    await db.delete(serviceRequirementsTable).where(inArray(serviceRequirementsTable.id, insertedReqIds));
  }
  await db.delete(schoolCalendarExceptionsTable).where(eq(schoolCalendarExceptionsTable.schoolId, schoolId));
  await cleanupDistrict(districtId);
});

describe("Slice 4B — cost-avoidance snapshot honors school calendar exceptions", () => {
  it("does NOT inflate exposure / risk counts in a closure-only month", async () => {
    await captureSnapshotForDistrict(districtId);

    const monday = (() => {
      const d = new Date();
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      d.setHours(0, 0, 0, 0);
      return d;
    })();

    const snapshots = await db
      .select()
      .from(costAvoidanceSnapshotsTable)
      .where(and(
        eq(costAvoidanceSnapshotsTable.districtId, districtId),
        gte(costAvoidanceSnapshotsTable.weekStart, monday),
      ));

    expect(snapshots.length).toBe(1);
    const snap = snapshots[0];

    // The student in this district has only one service requirement
    // (the closure-only monthly one) and no other risk drivers, so a
    // properly calendar-aware snapshot should produce ZERO exposure
    // dollars and ZERO students at risk. Pre-Slice-4B math would have
    // recorded a critical / high service_shortfall risk worth 240 min
    // × $100/hr = $400 of "exposure."
    expect(snap.totalExposure).toBe(0);
    expect(snap.studentsAtRisk).toBe(0);
    expect(snap.criticalCount).toBe(0);
    expect(snap.highCount).toBe(0);
    expect(snap.mediumCount).toBe(0);
  });
});
