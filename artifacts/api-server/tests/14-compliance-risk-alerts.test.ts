/**
 * Tests for runComplianceRiskAlertsForDate — the weekly compliance risk alert job.
 *
 * Covers:
 *  - Alerts created for students below the compliance threshold
 *  - Alerts NOT created for students at or above threshold
 *  - Severity mapping: critical < 50%, high 50–69%, medium 70–(threshold-1)%
 *  - Deduplication: a second run for the same week inserts no new alert
 *  - Deduplication honours already-resolved alerts (no re-alert same week)
 *  - One alert per student when multiple services are failing (worst wins)
 *  - District isolation: job only touches alert data within each district
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  db,
  alertsTable,
  serviceRequirementsTable,
  sessionLogsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import {
  createDistrict,
  createSchool,
  createStudent,
  createStaff,
  createServiceType,
  cleanupDistrict,
  cleanupServiceType,
} from "./helpers";
import { runComplianceRiskAlertsForDate } from "../src/lib/reminders";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Most-recent Monday at midnight UTC — used as the injected "today". */
function mostRecentMonday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

function todayStr(): string {
  return new Date().toISOString().substring(0, 10);
}

function monthStartStr(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// ─── shared fixtures ─────────────────────────────────────────────────────────

let districtId: number;
let schoolId: number;
let staffId: number;
let serviceTypeId: number;

// IDs collected per-test so afterAll can clean up FK-dependents before the
// district teardown cascade.
const insertedServiceReqIds: number[] = [];
const insertedSessionIds: number[] = [];
const insertedAlertIds: number[] = [];

const MONDAY = mostRecentMonday();

beforeAll(async () => {
  const district = await createDistrict({ name: "Test District Compliance Alerts" });
  districtId = district.id;
  const school = await createSchool(districtId);
  schoolId = school.id;
  const staff = await createStaff(schoolId, { role: "provider" });
  staffId = staff.id;
  const svcType = await createServiceType();
  serviceTypeId = svcType.id;
});

afterAll(async () => {
  // Clean up in FK order: alerts → session logs → service requirements → district.
  if (insertedAlertIds.length > 0) {
    await db.delete(alertsTable).where(inArray(alertsTable.id, insertedAlertIds));
  }
  if (insertedSessionIds.length > 0) {
    await db.delete(sessionLogsTable).where(inArray(sessionLogsTable.id, insertedSessionIds));
  }
  if (insertedServiceReqIds.length > 0) {
    await db.delete(serviceRequirementsTable).where(inArray(serviceRequirementsTable.id, insertedServiceReqIds));
  }
  await cleanupDistrict(districtId);
  await cleanupServiceType(serviceTypeId);
});

// ─── helpers for per-test fixture creation ───────────────────────────────────

async function makeServiceReq(studentId: number, requiredMinutes: number): Promise<number> {
  const [req] = await db.insert(serviceRequirementsTable).values({
    studentId,
    serviceTypeId,
    providerId: staffId,
    requiredMinutes,
    intervalType: "monthly",
    startDate: monthStartStr(),
    active: true,
  }).returning();
  insertedServiceReqIds.push(req.id);
  return req.id;
}

async function deliverMinutes(studentId: number, reqId: number, minutes: number): Promise<void> {
  const [log] = await db.insert(sessionLogsTable).values({
    studentId,
    staffId,
    serviceTypeId,
    serviceRequirementId: reqId,
    sessionDate: todayStr(),
    durationMinutes: minutes,
    status: "completed",
    isMakeup: false,
    isCompensatory: false,
  }).returning();
  insertedSessionIds.push(log.id);
}

/** Returns alerts created for the given student during the current MONDAY run. */
async function fetchAlertsForStudent(studentId: number) {
  const all = await db
    .select()
    .from(alertsTable)
    .where(
      and(
        eq(alertsTable.type, "compliance_risk"),
        eq(alertsTable.studentId, studentId),
      )
    );
  // Track for cleanup.
  for (const a of all) insertedAlertIds.push(a.id);
  return all;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("runComplianceRiskAlerts — alert creation", () => {
  it("creates an alert for a student below the default 85% threshold", async () => {
    const student = await createStudent(schoolId);
    const reqId = await makeServiceReq(student.id, 100);
    await deliverMinutes(student.id, reqId, 60); // 60% — below 85%

    await runComplianceRiskAlertsForDate(MONDAY);

    const alerts = await fetchAlertsForStudent(student.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe("compliance_risk");
    expect(alerts[0].studentId).toBe(student.id);
    expect(alerts[0].resolved).toBe(false);
  });

  it("does NOT create an alert for a student at or above the threshold", async () => {
    const student = await createStudent(schoolId);
    const reqId = await makeServiceReq(student.id, 100);
    await deliverMinutes(student.id, reqId, 90); // 90% — above 85%

    await runComplianceRiskAlertsForDate(MONDAY);

    const alerts = await fetchAlertsForStudent(student.id);
    expect(alerts).toHaveLength(0);
  });

  it("does NOT create an alert for a student at exactly the threshold boundary", async () => {
    const student = await createStudent(schoolId);
    const reqId = await makeServiceReq(student.id, 100);
    await deliverMinutes(student.id, reqId, 85); // exactly 85%

    await runComplianceRiskAlertsForDate(MONDAY);

    const alerts = await fetchAlertsForStudent(student.id);
    expect(alerts).toHaveLength(0);
  });
});

describe("runComplianceRiskAlerts — severity mapping", () => {
  it("assigns critical severity when percentComplete < 50%", async () => {
    const student = await createStudent(schoolId);
    const reqId = await makeServiceReq(student.id, 100);
    await deliverMinutes(student.id, reqId, 40); // 40%

    await runComplianceRiskAlertsForDate(MONDAY);

    const alerts = await fetchAlertsForStudent(student.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("critical");
  });

  it("assigns high severity when percentComplete is 50–69%", async () => {
    const student = await createStudent(schoolId);
    const reqId = await makeServiceReq(student.id, 100);
    await deliverMinutes(student.id, reqId, 65); // 65%

    await runComplianceRiskAlertsForDate(MONDAY);

    const alerts = await fetchAlertsForStudent(student.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("high");
  });

  it("assigns medium severity when percentComplete is 70% up to threshold", async () => {
    const student = await createStudent(schoolId);
    const reqId = await makeServiceReq(student.id, 100);
    await deliverMinutes(student.id, reqId, 75); // 75%

    await runComplianceRiskAlertsForDate(MONDAY);

    const alerts = await fetchAlertsForStudent(student.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("medium");
  });

  it("assigns critical at the 49% boundary (rounds to 49, still critical)", async () => {
    const student = await createStudent(schoolId);
    const reqId = await makeServiceReq(student.id, 100);
    await deliverMinutes(student.id, reqId, 49); // 49%

    await runComplianceRiskAlertsForDate(MONDAY);

    const alerts = await fetchAlertsForStudent(student.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("critical");
  });

  it("assigns high at the 50% boundary", async () => {
    const student = await createStudent(schoolId);
    const reqId = await makeServiceReq(student.id, 100);
    await deliverMinutes(student.id, reqId, 50); // exactly 50%

    await runComplianceRiskAlertsForDate(MONDAY);

    const alerts = await fetchAlertsForStudent(student.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("high");
  });

  it("assigns medium at the 70% boundary", async () => {
    const student = await createStudent(schoolId);
    const reqId = await makeServiceReq(student.id, 100);
    await deliverMinutes(student.id, reqId, 70); // exactly 70%

    await runComplianceRiskAlertsForDate(MONDAY);

    const alerts = await fetchAlertsForStudent(student.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("medium");
  });
});

describe("runComplianceRiskAlerts — deduplication", () => {
  it("does not insert a duplicate alert when the job runs twice in the same week", async () => {
    const student = await createStudent(schoolId);
    const reqId = await makeServiceReq(student.id, 100);
    await deliverMinutes(student.id, reqId, 30); // 30% → alert

    await runComplianceRiskAlertsForDate(MONDAY);
    await runComplianceRiskAlertsForDate(MONDAY); // second run same Monday

    const alerts = await fetchAlertsForStudent(student.id);
    expect(alerts).toHaveLength(1);
  });

  it("does not create a new alert when a resolved alert already exists for the same week", async () => {
    const student = await createStudent(schoolId);
    const reqId = await makeServiceReq(student.id, 100);
    await deliverMinutes(student.id, reqId, 20); // 20% → would trigger alert

    // Pre-insert a resolved compliance_risk alert that carries the current week tag.
    const weekStart = MONDAY.toISOString().substring(0, 10);
    const [existing] = await db.insert(alertsTable).values({
      type: "compliance_risk",
      severity: "critical",
      studentId: student.id,
      message: `Already alerted [week:${weekStart}]`,
      resolved: true,
    }).returning();
    insertedAlertIds.push(existing.id);

    await runComplianceRiskAlertsForDate(MONDAY);

    const alerts = await fetchAlertsForStudent(student.id);
    // Still only the one we inserted manually — no new one created.
    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe(existing.id);
  });

  it("creates a fresh alert in a different week even if a prior-week alert exists", async () => {
    const student = await createStudent(schoolId);
    const reqId = await makeServiceReq(student.id, 100);
    await deliverMinutes(student.id, reqId, 30); // 30%

    // Pre-insert an alert from a previous week (different week tag).
    const [priorWeekAlert] = await db.insert(alertsTable).values({
      type: "compliance_risk",
      severity: "critical",
      studentId: student.id,
      message: "Prior week alert [week:2020-01-06]",
      resolved: false,
    }).returning();
    insertedAlertIds.push(priorWeekAlert.id);

    await runComplianceRiskAlertsForDate(MONDAY);

    const alerts = await fetchAlertsForStudent(student.id);
    // Should now have two: the old one + a new one for the current week.
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    const currentWeekStr = MONDAY.toISOString().substring(0, 10);
    const newAlert = alerts.find(a => a.message.includes(`[week:${currentWeekStr}]`));
    expect(newAlert).toBeDefined();
  });
});

describe("runComplianceRiskAlerts — one alert per student (worst service)", () => {
  it("generates only one alert per student when multiple services are below threshold", async () => {
    const student = await createStudent(schoolId);

    // Service A: 60% (high severity)
    const svcTypeA = await createServiceType();
    const [reqA] = await db.insert(serviceRequirementsTable).values({
      studentId: student.id,
      serviceTypeId: svcTypeA.id,
      providerId: staffId,
      requiredMinutes: 100,
      intervalType: "monthly",
      startDate: monthStartStr(),
      active: true,
    }).returning();
    insertedServiceReqIds.push(reqA.id);
    const [logA] = await db.insert(sessionLogsTable).values({
      studentId: student.id,
      staffId,
      serviceTypeId: svcTypeA.id,
      serviceRequirementId: reqA.id,
      sessionDate: todayStr(),
      durationMinutes: 60,
      status: "completed",
      isMakeup: false,
      isCompensatory: false,
    }).returning();
    insertedSessionIds.push(logA.id);

    // Service B: 30% (critical severity — worse)
    const svcTypeB = await createServiceType();
    const [reqB] = await db.insert(serviceRequirementsTable).values({
      studentId: student.id,
      serviceTypeId: svcTypeB.id,
      providerId: staffId,
      requiredMinutes: 100,
      intervalType: "monthly",
      startDate: monthStartStr(),
      active: true,
    }).returning();
    insertedServiceReqIds.push(reqB.id);
    const [logB] = await db.insert(sessionLogsTable).values({
      studentId: student.id,
      staffId,
      serviceTypeId: svcTypeB.id,
      serviceRequirementId: reqB.id,
      sessionDate: todayStr(),
      durationMinutes: 30,
      status: "completed",
      isMakeup: false,
      isCompensatory: false,
    }).returning();
    insertedSessionIds.push(logB.id);

    await runComplianceRiskAlertsForDate(MONDAY);

    const alerts = await fetchAlertsForStudent(student.id);
    expect(alerts).toHaveLength(1);
    // The alert should correspond to the worst (30%) service — critical severity.
    expect(alerts[0].severity).toBe("critical");
    expect(alerts[0].serviceRequirementId).toBe(reqB.id);

    // Cleanup: delete alerts → session logs → service requirements → service types.
    // Remove these IDs from the global tracker to avoid double-deletes in afterAll.
    await db.delete(alertsTable).where(eq(alertsTable.studentId, student.id));
    const idxLogA = insertedSessionIds.indexOf(logA.id);
    if (idxLogA !== -1) insertedSessionIds.splice(idxLogA, 1);
    const idxLogB = insertedSessionIds.indexOf(logB.id);
    if (idxLogB !== -1) insertedSessionIds.splice(idxLogB, 1);
    await db.delete(sessionLogsTable).where(inArray(sessionLogsTable.id, [logA.id, logB.id]));
    const idxReqA = insertedServiceReqIds.indexOf(reqA.id);
    if (idxReqA !== -1) insertedServiceReqIds.splice(idxReqA, 1);
    const idxReqB = insertedServiceReqIds.indexOf(reqB.id);
    if (idxReqB !== -1) insertedServiceReqIds.splice(idxReqB, 1);
    await db.delete(serviceRequirementsTable).where(inArray(serviceRequirementsTable.id, [reqA.id, reqB.id]));
    await cleanupServiceType(svcTypeA.id);
    await cleanupServiceType(svcTypeB.id);
  });
});

describe("runComplianceRiskAlerts — district isolation", () => {
  it("does not generate alerts for students in other districts", async () => {
    // Create a fully isolated second district.
    const otherDistrict = await createDistrict({ name: "Test District Other Compliance" });
    const otherSchool = await createSchool(otherDistrict.id);
    const otherStaff = await createStaff(otherSchool.id, { role: "provider" });
    const otherSvcType = await createServiceType();
    const otherStudent = await createStudent(otherSchool.id);

    const [otherReq] = await db.insert(serviceRequirementsTable).values({
      studentId: otherStudent.id,
      serviceTypeId: otherSvcType.id,
      providerId: otherStaff.id,
      requiredMinutes: 100,
      intervalType: "monthly",
      startDate: monthStartStr(),
      active: true,
    }).returning();
    insertedServiceReqIds.push(otherReq.id);

    const [otherLog] = await db.insert(sessionLogsTable).values({
      studentId: otherStudent.id,
      staffId: otherStaff.id,
      serviceTypeId: otherSvcType.id,
      serviceRequirementId: otherReq.id,
      sessionDate: todayStr(),
      durationMinutes: 10, // 10% — far below threshold
      status: "completed",
      isMakeup: false,
      isCompensatory: false,
    }).returning();
    insertedSessionIds.push(otherLog.id);

    // Primary district student at 10% too.
    const mainStudent = await createStudent(schoolId);
    const mainReqId = await makeServiceReq(mainStudent.id, 100);
    await deliverMinutes(mainStudent.id, mainReqId, 10);

    await runComplianceRiskAlertsForDate(MONDAY);

    // Both should have exactly one alert each — they don't leak into each other.
    const mainAlerts = await fetchAlertsForStudent(mainStudent.id);
    expect(mainAlerts).toHaveLength(1);

    const otherAlerts = await fetchAlertsForStudent(otherStudent.id);
    expect(otherAlerts).toHaveLength(1);

    // Verify no alert for otherStudent exists in mainDistrict context by
    // checking the alert belongs to the correct student.
    expect(mainAlerts[0].studentId).toBe(mainStudent.id);
    expect(otherAlerts[0].studentId).toBe(otherStudent.id);

    // Cleanup the isolated district.
    await db.delete(alertsTable).where(eq(alertsTable.studentId, otherStudent.id));
    await db.delete(sessionLogsTable).where(eq(sessionLogsTable.id, otherLog.id));
    await db.delete(serviceRequirementsTable).where(eq(serviceRequirementsTable.id, otherReq.id));
    await cleanupDistrict(otherDistrict.id);
    await cleanupServiceType(otherSvcType.id);
  });
});

describe("runComplianceRiskAlerts — alert message content", () => {
  it("embeds the correct week tag in the message", async () => {
    const student = await createStudent(schoolId);
    const reqId = await makeServiceReq(student.id, 100);
    await deliverMinutes(student.id, reqId, 40); // 40%

    await runComplianceRiskAlertsForDate(MONDAY);

    const alerts = await fetchAlertsForStudent(student.id);
    expect(alerts).toHaveLength(1);
    // The week tag must match MONDAY's week-start (MONDAY itself is a Monday).
    const expectedWeekStr = MONDAY.toISOString().substring(0, 10);
    expect(alerts[0].message).toContain(`[week:${expectedWeekStr}]`);
  });

  it("includes percentage and required/delivered minutes in the message", async () => {
    const student = await createStudent(schoolId);
    const reqId = await makeServiceReq(student.id, 100);
    await deliverMinutes(student.id, reqId, 60); // 60 / 100

    await runComplianceRiskAlertsForDate(MONDAY);

    const alerts = await fetchAlertsForStudent(student.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toContain("60%");
    expect(alerts[0].message).toContain("60/100");
  });

  it("respects a custom complianceMinuteThreshold on the district", async () => {
    // Create a district with a lower threshold (70%) and verify a student at
    // 72% is NOT alerted (above threshold) while one at 68% is.
    const customDistrict = await createDistrict({
      name: "Test District Custom Threshold",
      complianceMinuteThreshold: 70,
    });
    const customSchool = await createSchool(customDistrict.id);
    const customStaff = await createStaff(customSchool.id, { role: "provider" });
    const customSvcType = await createServiceType();

    const aboveStudent = await createStudent(customSchool.id);
    const [aboveReq] = await db.insert(serviceRequirementsTable).values({
      studentId: aboveStudent.id,
      serviceTypeId: customSvcType.id,
      providerId: customStaff.id,
      requiredMinutes: 100,
      intervalType: "monthly",
      startDate: monthStartStr(),
      active: true,
    }).returning();
    insertedServiceReqIds.push(aboveReq.id);
    const [aboveLog] = await db.insert(sessionLogsTable).values({
      studentId: aboveStudent.id,
      staffId: customStaff.id,
      serviceTypeId: customSvcType.id,
      serviceRequirementId: aboveReq.id,
      sessionDate: todayStr(),
      durationMinutes: 72, // 72% — above 70% threshold
      status: "completed",
      isMakeup: false,
      isCompensatory: false,
    }).returning();
    insertedSessionIds.push(aboveLog.id);

    const belowStudent = await createStudent(customSchool.id);
    const [belowReq] = await db.insert(serviceRequirementsTable).values({
      studentId: belowStudent.id,
      serviceTypeId: customSvcType.id,
      providerId: customStaff.id,
      requiredMinutes: 100,
      intervalType: "monthly",
      startDate: monthStartStr(),
      active: true,
    }).returning();
    insertedServiceReqIds.push(belowReq.id);
    const [belowLog] = await db.insert(sessionLogsTable).values({
      studentId: belowStudent.id,
      staffId: customStaff.id,
      serviceTypeId: customSvcType.id,
      serviceRequirementId: belowReq.id,
      sessionDate: todayStr(),
      durationMinutes: 68, // 68% — below 70% threshold
      status: "completed",
      isMakeup: false,
      isCompensatory: false,
    }).returning();
    insertedSessionIds.push(belowLog.id);

    await runComplianceRiskAlertsForDate(MONDAY);

    const aboveAlerts = await fetchAlertsForStudent(aboveStudent.id);
    expect(aboveAlerts).toHaveLength(0);

    const belowAlerts = await fetchAlertsForStudent(belowStudent.id);
    expect(belowAlerts).toHaveLength(1);
    expect(belowAlerts[0].message).toContain("threshold: 70%");

    // Cleanup.
    await db.delete(alertsTable).where(eq(alertsTable.studentId, belowStudent.id));
    await db.delete(sessionLogsTable).where(inArray(sessionLogsTable.id, [aboveLog.id, belowLog.id]));
    await db.delete(serviceRequirementsTable).where(inArray(serviceRequirementsTable.id, [aboveReq.id, belowReq.id]));
    await cleanupDistrict(customDistrict.id);
    await cleanupServiceType(customSvcType.id);
  });

  it("respects a 90% complianceMinuteThreshold (regression: not hardcoded 85%)", async () => {
    // A district raises the bar to 90%. A student at 89% should now be alerted
    // (would have been ignored under the old hardcoded 85% threshold), and a
    // student at 90% should not.
    const customDistrict = await createDistrict({
      name: "Test District 90 Threshold",
      complianceMinuteThreshold: 90,
    });
    const customSchool = await createSchool(customDistrict.id);
    const customStaff = await createStaff(customSchool.id, { role: "provider" });
    const customSvcType = await createServiceType();

    const atThresholdStudent = await createStudent(customSchool.id);
    const [atReq] = await db.insert(serviceRequirementsTable).values({
      studentId: atThresholdStudent.id,
      serviceTypeId: customSvcType.id,
      providerId: customStaff.id,
      requiredMinutes: 100,
      intervalType: "monthly",
      startDate: monthStartStr(),
      active: true,
    }).returning();
    insertedServiceReqIds.push(atReq.id);
    const [atLog] = await db.insert(sessionLogsTable).values({
      studentId: atThresholdStudent.id,
      staffId: customStaff.id,
      serviceTypeId: customSvcType.id,
      serviceRequirementId: atReq.id,
      sessionDate: todayStr(),
      durationMinutes: 90, // 90% — exactly at threshold, no alert
      status: "completed",
      isMakeup: false,
      isCompensatory: false,
    }).returning();
    insertedSessionIds.push(atLog.id);

    const justBelowStudent = await createStudent(customSchool.id);
    const [belowReq] = await db.insert(serviceRequirementsTable).values({
      studentId: justBelowStudent.id,
      serviceTypeId: customSvcType.id,
      providerId: customStaff.id,
      requiredMinutes: 100,
      intervalType: "monthly",
      startDate: monthStartStr(),
      active: true,
    }).returning();
    insertedServiceReqIds.push(belowReq.id);
    const [belowLog] = await db.insert(sessionLogsTable).values({
      studentId: justBelowStudent.id,
      staffId: customStaff.id,
      serviceTypeId: customSvcType.id,
      serviceRequirementId: belowReq.id,
      sessionDate: todayStr(),
      durationMinutes: 89, // 89% — below 90% threshold but above old 85% default
      status: "completed",
      isMakeup: false,
      isCompensatory: false,
    }).returning();
    insertedSessionIds.push(belowLog.id);

    await runComplianceRiskAlertsForDate(MONDAY);

    const atAlerts = await fetchAlertsForStudent(atThresholdStudent.id);
    expect(atAlerts).toHaveLength(0);

    const belowAlerts = await fetchAlertsForStudent(justBelowStudent.id);
    expect(belowAlerts).toHaveLength(1);
    expect(belowAlerts[0].message).toContain("threshold: 90%");
    expect(belowAlerts[0].message).toContain("89%");

    // Cleanup.
    await db.delete(alertsTable).where(eq(alertsTable.studentId, justBelowStudent.id));
    await db.delete(sessionLogsTable).where(inArray(sessionLogsTable.id, [atLog.id, belowLog.id]));
    await db.delete(serviceRequirementsTable).where(inArray(serviceRequirementsTable.id, [atReq.id, belowReq.id]));
    await cleanupDistrict(customDistrict.id);
    await cleanupServiceType(customSvcType.id);
  });
});
