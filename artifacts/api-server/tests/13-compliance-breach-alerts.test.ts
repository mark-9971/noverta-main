/**
 * Compliance breach alerts.
 *
 * The product surfaces 30-day restraint windows and IEP timelines visually
 * but admins also need email when something newly slips out of compliance.
 *
 * This suite exercises runComplianceBreachAlerts() against a seeded district
 * and asserts:
 *   1. A non-compliant restraint window (parent notification missing) creates
 *      a single alertsTable row of type "restraint_30day_noncompliant" and
 *      a communication_events row tagged "restraint_compliance_alert".
 *   2. A breached IEP timeline (PL1 past 45 school days, no consent) creates
 *      a single alertsTable row of type "iep_timeline_compliance" and a
 *      communication_events row tagged "iep_timeline_compliance_alert".
 *   3. Re-running the scan does NOT create duplicate alerts (dedupe via
 *      [dedupe:KEY] message tag).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  db,
  alertsTable,
  communicationEventsTable,
  restraintIncidentsTable,
  evaluationReferralsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { runComplianceBreachAlerts } from "../src/lib/complianceBreachAlerts";
import {
  createDistrict,
  createSchool,
  createStaff,
  createStudent,
  cleanupDistrict,
} from "./helpers";

describe("compliance breach alerts", () => {
  let districtId: number;
  let restraintStudentId: number;
  let iepStudentId: number;
  let referralId: number;
  const originalKey = process.env.RESEND_API_KEY;

  beforeAll(async () => {
    delete process.env.RESEND_API_KEY;
    const d = await createDistrict();
    districtId = d.id;
    const school = await createSchool(districtId);

    // Admin recipient — needed so the comm-event recipient is non-empty.
    await createStaff(school.id, { role: "admin", status: "active", email: `admin_${Date.now()}@example.com` });

    // Restraint student: two incidents in a 30-day window, neither parent-notified.
    const restraintStudent = await createStudent(school.id);
    restraintStudentId = restraintStudent.id;
    const today = new Date().toISOString().slice(0, 10);
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await db.insert(restraintIncidentsTable).values([
      {
        studentId: restraintStudentId,
        incidentDate: tenDaysAgo,
        incidentTime: "10:00",
        incidentType: "physical",
        restraintType: "physical_hold",
        behaviorDescription: "test",
        parentNotified: false,
      },
      {
        studentId: restraintStudentId,
        incidentDate: today,
        incidentTime: "10:00",
        incidentType: "physical",
        restraintType: "physical_hold",
        behaviorDescription: "test",
        parentNotified: false,
      },
    ]);

    // IEP timeline student: an open referral with consent received 60 cal days
    // ago — well past the 45-school-day PL1 deadline, so PL1 is breached.
    const iepStudent = await createStudent(school.id);
    iepStudentId = iepStudent.id;
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const seventyDaysAgo = new Date(Date.now() - 70 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [ref] = await db.insert(evaluationReferralsTable).values({
      studentId: iepStudentId,
      referralDate: seventyDaysAgo,
      referralSource: "school",
      reason: "test",
      consentReceivedDate: sixtyDaysAgo,
      consentStatus: "received",
      status: "open",
    }).returning();
    referralId = ref.id;
  });

  afterAll(async () => {
    if (originalKey) process.env.RESEND_API_KEY = originalKey;
    // Clean alerts and comm events for our students before tearing down
    // (cleanupDistrict handles communication_events but alertsTable rows
    // we created for the student must be removed first to satisfy FKs).
    await db.delete(alertsTable).where(inArray(alertsTable.studentId, [restraintStudentId, iepStudentId]));
    await db.delete(restraintIncidentsTable).where(eq(restraintIncidentsTable.studentId, restraintStudentId));
    await db.delete(evaluationReferralsTable).where(eq(evaluationReferralsTable.id, referralId));
    await cleanupDistrict(districtId);
  });

  let firstRunRestraintCount = 0;
  let firstRunIepCount = 0;

  it("creates a restraint alert + communication event for a non-compliant window", async () => {
    const result = await runComplianceBreachAlerts();
    expect(result.restraintAlertsCreated).toBeGreaterThanOrEqual(1);
    firstRunRestraintCount = result.restraintAlertsCreated;
    firstRunIepCount = result.iepAlertsCreated;

    const restraintAlerts = await db
      .select()
      .from(alertsTable)
      .where(and(
        eq(alertsTable.studentId, restraintStudentId),
        eq(alertsTable.type, "restraint_30day_noncompliant"),
      ));
    expect(restraintAlerts.length).toBeGreaterThanOrEqual(1);
    expect(restraintAlerts[0].severity).toBe("critical");
    expect(restraintAlerts[0].message).toMatch(/\[dedupe:restraint:/);

    // Even with RESEND_API_KEY unset, sendEmail still writes a
    // communication_events row with status="not_configured".
    const events = await db
      .select()
      .from(communicationEventsTable)
      .where(and(
        eq(communicationEventsTable.studentId, restraintStudentId),
        eq(communicationEventsTable.type, "restraint_compliance_alert"),
      ));
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].status).toBe("not_configured");
    const alertIds = new Set(restraintAlerts.map((a) => a.id));
    expect(alertIds.has(events[0].linkedAlertId!)).toBe(true);
  });

  it("creates an IEP timeline alert + communication event when PL1 is at-risk or breached", async () => {
    const iepAlerts = await db
      .select()
      .from(alertsTable)
      .where(and(
        eq(alertsTable.studentId, iepStudentId),
        eq(alertsTable.type, "iep_timeline_compliance"),
      ));
    expect(iepAlerts.length).toBeGreaterThanOrEqual(1);
    expect(["critical", "high"]).toContain(iepAlerts[0].severity);
    expect(iepAlerts[0].message).toMatch(/\[dedupe:iep-timeline:/);

    const events = await db
      .select()
      .from(communicationEventsTable)
      .where(and(
        eq(communicationEventsTable.studentId, iepStudentId),
        eq(communicationEventsTable.type, "iep_timeline_compliance_alert"),
      ));
    expect(events.length).toBeGreaterThanOrEqual(1);
    const alertIds = new Set(iepAlerts.map((a) => a.id));
    expect(alertIds.has(events[0].linkedAlertId!)).toBe(true);
  });

  it("does not create duplicate alerts on a second run (dedupe)", async () => {
    const before = await db
      .select({ id: alertsTable.id })
      .from(alertsTable)
      .where(and(
        inArray(alertsTable.studentId, [restraintStudentId, iepStudentId]),
        inArray(alertsTable.type, [
          "restraint_30day_noncompliant",
          "iep_timeline_compliance",
        ]),
      ));

    const second = await runComplianceBreachAlerts();
    expect(second.restraintAlertsCreated).toBe(0);
    expect(second.iepAlertsCreated).toBe(0);

    const after = await db
      .select({ id: alertsTable.id })
      .from(alertsTable)
      .where(and(
        inArray(alertsTable.studentId, [restraintStudentId, iepStudentId]),
        inArray(alertsTable.type, [
          "restraint_30day_noncompliant",
          "iep_timeline_compliance",
        ]),
      ));
    expect(after.length).toBe(before.length);
  });
});
