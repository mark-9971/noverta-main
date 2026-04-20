/**
 * School Calendar v0 — Slice 4 (compensatory / makeup / exposure
 * alignment).
 *
 * Proves that the cost-avoidance alert generator no longer produces a
 * "service shortfall" alert for a service requirement whose entire
 * elapsed window was excused by school-calendar exceptions. Before
 * Slice 4, `collectServiceShortfallRisks` had its own
 * `monthProgress = dayOfMonth/daysInMonth` math that ignored closures,
 * so a closure-only month created false comp/exposure dollars.
 *
 * Now the function delegates to `computeAllActiveMinuteProgress`
 * (the same engine compliance UI uses), so closure-discounted
 * `expectedMinutesByNow` flows through automatically.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  db,
  alertsTable,
  serviceRequirementsTable,
  schoolCalendarExceptionsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  createDistrict,
  createSchool,
  createStudent,
  createStaff,
  createServiceType,
  cleanupDistrict,
} from "./helpers";
import { generateAlertsForDistrict } from "../src/lib/costAvoidanceAlerts";

const insertedReqIds: number[] = [];

let districtId: number;
let schoolId: number;
let staffId: number;
let studentId: number;
let serviceTypeId: number;
let serviceRequirementId: number;

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

beforeAll(async () => {
  const d = await createDistrict({ name: "Slice4 Cost Avoidance District" });
  districtId = d.id;
  const sch = await createSchool(districtId, { name: "Slice4 School" });
  schoolId = sch.id;
  const staff = await createStaff(schoolId, {
    role: "case_manager", receiveRiskAlerts: false,
  });
  staffId = staff.id;
  const student = await createStudent(schoolId, {
    caseManagerId: staffId,
    firstName: "Slice4", lastName: "Closure",
  });
  studentId = student.id;
  const st = await createServiceType({ name: `Slice4 Speech ${Date.now()}` });
  serviceTypeId = st.id;

  // Monthly mandate that started well in the past so the current
  // window is "this month" — the branch we want to exercise.
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

  // Insert a school-calendar closure for EVERY day from the start of
  // this month through today. With the entire elapsed slice of the
  // window excused, expectedMinutesByNow is ~0 and the
  // "trending short" trigger must NOT fire.
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
      reason: "Slice4 test all-closure month",
      dismissalTime: null,
    });
  }
  if (closureRows.length > 0) {
    await db.insert(schoolCalendarExceptionsTable).values(closureRows);
  }
});

afterAll(async () => {
  await db.delete(alertsTable).where(eq(alertsTable.studentId, studentId));
  if (insertedReqIds.length > 0) {
    await db.delete(serviceRequirementsTable).where(inArray(serviceRequirementsTable.id, insertedReqIds));
  }
  await db.delete(schoolCalendarExceptionsTable).where(eq(schoolCalendarExceptionsTable.schoolId, schoolId));
  await cleanupDistrict(districtId);
});

describe("Slice 4 — cost-avoidance honors school calendar exceptions", () => {
  it("does not create a service_shortfall alert when the entire elapsed window was a closure", async () => {
    // Run the real cost-avoidance generator for this district.
    await generateAlertsForDistrict(districtId);

    const monthlyDedupePart = `svc-mo:${studentId}:${serviceRequirementId}:`;
    const weeklyDedupePart = `svc-wk:${studentId}:${serviceRequirementId}:`;

    const studentAlerts = await db
      .select({ message: alertsTable.message, type: alertsTable.type })
      .from(alertsTable)
      .where(eq(alertsTable.studentId, studentId));

    const shortfallAlerts = studentAlerts.filter(a =>
      a.type === "cost_avoidance_risk" &&
      (a.message.includes(monthlyDedupePart) || a.message.includes(weeklyDedupePart)),
    );

    // The whole point of Slice 4: zero false service-shortfall alerts
    // when the period's expected math was fully discounted by the
    // school calendar. Before the alignment, this would have created
    // a "trending 240 min short" alert.
    expect(shortfallAlerts.length).toBe(0);

    // Belt-and-suspenders: if the calendar discount really worked, the
    // engine's `expectedMinutesByNow` for this requirement should be
    // ~zero. We re-derive it via the same helper the alert path now
    // uses to make sure we're testing the live wiring (not a stale
    // cache).
    const { computeAllActiveMinuteProgress } = await import("../src/lib/minuteCalc");
    const mp = await computeAllActiveMinuteProgress({
      studentIds: [studentId],
      asOfDate: new Date(),
    });
    const ours = mp.find(r => r.serviceRequirementId === serviceRequirementId);
    expect(ours).toBeDefined();
    expect(ours!.expectedMinutesByNow).toBeLessThan(1); // ~0 modulo rounding
    expect(ours!.closureDayCount).toBeGreaterThan(0);
  });
});
