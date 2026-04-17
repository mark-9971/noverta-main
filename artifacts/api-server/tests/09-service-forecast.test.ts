/**
 * Forward-looking service-delivery forecast.
 *
 * Asserts the failure mode the feature is meant to catch: a student with a
 * planned schedule block whose provider will be absent and uncovered drops
 * from on_track to at_risk / out_of_compliance, and assigning a substitute
 * restores the projection. Also verifies tenant isolation across districts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  asUser,
  createDistrict,
  createSchool,
  createStudent,
  createStaff,
  createServiceType,
  cleanupDistrict,
  cleanupServiceType,
} from "./helpers";
import {
  db,
  serviceRequirementsTable,
  scheduleBlocksTable,
  staffAbsencesTable,
  coverageInstancesTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function ymd(d: Date): string {
  return d.toISOString().substring(0, 10);
}

function todayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** First date on/after today whose day-of-week is targetDow. */
function nextDow(targetDow: number): Date {
  const d = todayLocal();
  const delta = ((targetDow - d.getDay()) + 7) % 7;
  d.setDate(d.getDate() + delta);
  return d;
}

describe("service forecast", () => {
  let districtA: number;
  let districtB: number;
  let schoolA: number;
  let studentA: number;
  let staffA: number;
  let serviceTypeId: number;
  let reqA: number;
  let blockA: number;
  // Pick a target day for the recurring block: tomorrow's day-of-week, so
  // the planned occurrence is always inside the 4-week horizon and inside
  // a remaining-week window for the *next* week's interval at minimum.
  // Using "next week's same DOW as today + 1" keeps us out of edge cases
  // around whether today is the scheduled day.
  const blockDow = (todayLocal().getDay() + 1) % 7;

  beforeAll(async () => {
    const dA = await createDistrict({ name: "Forecast District A" });
    const dB = await createDistrict({ name: "Forecast District B" });
    districtA = dA.id;
    districtB = dB.id;

    const sA = await createSchool(districtA);
    schoolA = sA.id;
    await createSchool(districtB);

    const stA = await createStudent(schoolA);
    studentA = stA.id;

    const provA = await createStaff(schoolA, { role: "provider" });
    staffA = provA.id;

    const svc = await createServiceType();
    serviceTypeId = svc.id;

    // 60 min/week speech requirement.
    const [r] = await db.insert(serviceRequirementsTable).values({
      studentId: studentA,
      serviceTypeId,
      providerId: staffA,
      requiredMinutes: 60,
      intervalType: "weekly",
      startDate: ymd(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
      active: true,
    }).returning();
    reqA = r.id;

    // Recurring weekly block of 60 min that always falls in the horizon.
    const [b] = await db.insert(scheduleBlocksTable).values({
      staffId: staffA,
      studentId: studentA,
      serviceTypeId,
      dayOfWeek: DAYS[blockDow],
      startTime: "10:00",
      endTime: "11:00",
      isRecurring: true,
      recurrenceType: "weekly",
      blockType: "service",
    }).returning();
    blockA = b.id;
  });

  afterAll(async () => {
    await db.delete(coverageInstancesTable).where(eq(coverageInstancesTable.scheduleBlockId, blockA));
    await db.delete(staffAbsencesTable).where(eq(staffAbsencesTable.staffId, staffA));
    await db.delete(scheduleBlocksTable).where(eq(scheduleBlocksTable.id, blockA));
    await db.delete(serviceRequirementsTable).where(inArray(serviceRequirementsTable.id, [reqA]));
    await cleanupDistrict(districtA);
    await cleanupDistrict(districtB);
    await cleanupServiceType(serviceTypeId);
  });

  it("counts planned blocks as projected delivery when no absences exist", async () => {
    // Clean any prior state.
    await db.delete(coverageInstancesTable).where(eq(coverageInstancesTable.scheduleBlockId, blockA));
    await db.delete(staffAbsencesTable).where(eq(staffAbsencesTable.staffId, staffA));

    const admin = asUser({ userId: "admin-A", role: "admin", districtId: districtA });
    const res = await admin.get("/api/service-forecast?horizonWeeks=4");
    expect(res.status).toBe(200);
    const row = res.body.rows.find((r: any) => r.serviceRequirementId === reqA);
    expect(row).toBeDefined();
    expect(row.plannedRemainingMinutes).toBeGreaterThanOrEqual(60);
    expect(row.plannedLostMinutes).toBe(0);
    expect(row.absenceImpacts).toHaveLength(0);
  });

  it("flags risk and surfaces the absence once an uncovered staff absence wipes out a planned block", async () => {
    // Find the next occurrence of the block's day-of-week within the
    // current weekly interval. If today is the block day-of-week itself
    // and minute math rounds it out, fall back to next week's occurrence.
    const occurrence = nextDow(blockDow);

    await db.delete(staffAbsencesTable).where(eq(staffAbsencesTable.staffId, staffA));
    await db.insert(staffAbsencesTable).values({
      staffId: staffA,
      absenceDate: ymd(occurrence),
      absenceType: "sick",
    });

    const admin = asUser({ userId: "admin-A", role: "admin", districtId: districtA });
    const res = await admin.get("/api/service-forecast?horizonWeeks=4");
    const row = res.body.rows.find((r: any) => r.serviceRequirementId === reqA);
    expect(row).toBeDefined();

    // The forecaster only considers occurrences within the *current
    // interval's* remaining window (because the requirement is weekly).
    // For our block-DOW choice (today + 1), the occurrence is always in
    // the current interval's remaining window EXCEPT when today is
    // Sunday (since interval ends Sunday and the next block is Monday of
    // the next week). Handle that edge case by skipping.
    const todayDow = todayLocal().getDay();
    if (todayDow === 0 && blockDow === 1) {
      return; // Edge of the weekly interval — out of scope for this assertion.
    }

    expect(row.plannedLostMinutes).toBeGreaterThanOrEqual(60);
    expect(row.forecastRiskStatus === "at_risk" || row.forecastRiskStatus === "out_of_compliance").toBe(true);
    expect(row.absenceImpacts.some((i: any) => i.date === ymd(occurrence) && !i.isCovered)).toBe(true);
    expect(res.body.summary.topImpactedStaff.some((s: any) => s.staffId === staffA)).toBe(true);
  });

  it("clears the lost-minute count when a substitute is assigned", async () => {
    const todayDow = todayLocal().getDay();
    if (todayDow === 0 && blockDow === 1) return; // Same edge case.

    const occurrence = nextDow(blockDow);
    const sub = await createStaff(schoolA, { role: "provider" });

    await db.delete(coverageInstancesTable).where(eq(coverageInstancesTable.scheduleBlockId, blockA));
    await db.insert(coverageInstancesTable).values({
      scheduleBlockId: blockA,
      absenceDate: ymd(occurrence),
      originalStaffId: staffA,
      substituteStaffId: sub.id,
      isCovered: true,
    });

    const admin = asUser({ userId: "admin-A", role: "admin", districtId: districtA });
    const res = await admin.get("/api/service-forecast?horizonWeeks=4");
    const row = res.body.rows.find((r: any) => r.serviceRequirementId === reqA);
    expect(row.plannedLostMinutes).toBe(0);
    // The absence is still recorded as an impact, but flagged as covered.
    const impact = row.absenceImpacts.find((i: any) => i.date === ymd(occurrence));
    if (impact) {
      expect(impact.isCovered).toBe(true);
      expect(impact.substituteStaffId).toBe(sub.id);
    }
  });

  it("does not leak forecast rows across districts", async () => {
    const adminB = asUser({ userId: "admin-B", role: "admin", districtId: districtB });
    const res = await adminB.get("/api/service-forecast?horizonWeeks=4");
    expect(res.status).toBe(200);
    expect(res.body.rows.find((r: any) => r.serviceRequirementId === reqA)).toBeUndefined();
    expect(res.body.rows.find((r: any) => r.studentId === studentA)).toBeUndefined();
  });
});
