/**
 * Tests for the spike-alert detector in generateAlertsForDistrict.
 *
 * Spike rules under digest mode:
 *  - A "newly critical" risk (no prior critical alert with the same baseKey)
 *    bypasses the digest and triggers an immediate individual email.
 *  - A risk that was already critical in a prior run stays in the digest.
 *  - When a single staff member has more spikes than the district threshold,
 *    none of them bypass — they all stay in the digest (anti-flood).
 *  - When spike detection is disabled at the district level, all critical
 *    risks go through the digest regardless of prior state.
 *
 * We exercise spike detection through evaluation_referrals because that path
 * has the simplest setup: one referral with an overdue deadline produces
 * exactly one critical risk.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  db,
  alertsTable,
  evaluationReferralsTable,
  communicationEventsTable,
  districtsTable,
  studentsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  createDistrict,
  createSchool,
  createStudent,
  createStaff,
  cleanupDistrict,
} from "./helpers";
import { generateAlertsForDistrict } from "../src/lib/costAvoidanceAlerts";

let districtId: number;
let schoolId: number;
let staffId: number;

const referralIds: number[] = [];
const studentIds: number[] = [];

function pastDate(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function createOverdueEvalStudent(opts: { caseManagerId: number; daysOverdue: number }) {
  const student = await createStudent(schoolId, { caseManagerId: opts.caseManagerId });
  const [ref] = await db.insert(evaluationReferralsTable).values({
    studentId: student.id,
    status: "in_progress",
    referralDate: pastDate(opts.daysOverdue + 60),
    referralSource: "school",
    reason: "Spike alert test",
    evaluationDeadline: pastDate(opts.daysOverdue),
    assignedEvaluatorId: opts.caseManagerId,
  } as typeof evaluationReferralsTable.$inferInsert).returning();
  referralIds.push(ref.id);
  studentIds.push(student.id);
  return student;
}

async function resetDistrictState() {
  // Wipe referrals, alerts, and comm events for this district's students/staff
  // between cases so each test starts from a clean slate. We also reset
  // referrals (not just alerts) so leftover overdue students from prior
  // tests don't keep generating critical risks in later runs.
  if (referralIds.length > 0) {
    await db.delete(evaluationReferralsTable).where(inArray(evaluationReferralsTable.id, referralIds));
    referralIds.length = 0;
  }
  if (studentIds.length > 0) {
    await db.delete(alertsTable).where(inArray(alertsTable.studentId, studentIds));
    await db.delete(communicationEventsTable).where(inArray(communicationEventsTable.studentId, studentIds));
  }
  await db.delete(communicationEventsTable).where(eq(communicationEventsTable.staffId, staffId));
}

beforeAll(async () => {
  // Digest mode ON, spike detection ON, threshold = 2 (default 3 for production)
  const d = await createDistrict({
    name: "Spike Alert Test District",
    alertDigestMode: true,
    spikeAlertEnabled: true,
    spikeAlertThreshold: 2,
  });
  districtId = d.id;
  const school = await createSchool(districtId);
  schoolId = school.id;
  const staff = await createStaff(schoolId, {
    role: "case_manager",
    email: `spike_${Date.now()}@example.com`,
    receiveRiskAlerts: true,
  });
  staffId = staff.id;
});

afterAll(async () => {
  if (studentIds.length > 0) {
    await db.delete(communicationEventsTable).where(inArray(communicationEventsTable.studentId, studentIds));
    await db.delete(alertsTable).where(inArray(alertsTable.studentId, studentIds));
    await db.delete(evaluationReferralsTable).where(inArray(evaluationReferralsTable.id, referralIds));
  }
  await cleanupDistrict(districtId);
});

describe("cost avoidance spike alerts", () => {
  it("sends an immediate individual email for a newly-critical risk under digest mode", async () => {
    await resetDistrictState();
    await createOverdueEvalStudent({ caseManagerId: staffId, daysOverdue: 3 });

    await generateAlertsForDistrict(districtId);

    // The newly-critical risk should have produced an individual alert
    // communication event (not a digest).
    const events = await db.select()
      .from(communicationEventsTable)
      .innerJoin(studentsTable, eq(communicationEventsTable.studentId, studentsTable.id))
      .where(inArray(communicationEventsTable.studentId, studentIds));

    const individual = events.filter(e => e.communication_events.type === "cost_avoidance_risk_alert");
    const digest = events.filter(e => e.communication_events.type === "cost_avoidance_digest");

    expect(individual.length).toBe(1);
    expect(digest.length).toBe(0);

    const meta = individual[0].communication_events.metadata as Record<string, unknown>;
    expect(meta.spike).toBe(true);
  });

  it("digests a risk that was already critical in a prior run", async () => {
    // First run already produced a critical alert from the previous test case.
    // Clear only the comm events; leave the prior critical alert in place so
    // the spike detector sees this risk as "previously critical".
    if (studentIds.length > 0) {
      await db.delete(communicationEventsTable).where(inArray(communicationEventsTable.studentId, studentIds));
    }

    await generateAlertsForDistrict(districtId);

    const events = await db.select({ type: communicationEventsTable.type })
      .from(communicationEventsTable)
      .where(inArray(communicationEventsTable.studentId, studentIds));

    // No new individual alerts — the existing critical alert dedupes the
    // insert, but if we had a *new* critical with the same baseKey it would
    // hit the digest path. Either way no individual spike email should fire.
    const individual = events.filter(e => e.type === "cost_avoidance_risk_alert");
    expect(individual.length).toBe(0);
  });

  it("re-spikes after a previously critical alert was resolved", async () => {
    // Scenario: a risk was critical in run N, the coordinator resolved the
    // alert (marking the situation as handled), and the same risk re-spikes
    // in a later run. The new spike must trigger an immediate individual
    // email — being critical historically should NOT permanently suppress
    // future spike detection.
    await resetDistrictState();
    await createOverdueEvalStudent({ caseManagerId: staffId, daysOverdue: 8 });

    // First run: produces the initial critical alert (and an immediate spike
    // email since this is a fresh baseKey).
    await generateAlertsForDistrict(districtId);

    // Coordinator resolves the alert; clear comm events so we can isolate
    // the second run's behavior. Leave the resolved alert row in place.
    await db.update(alertsTable)
      .set({ resolved: true })
      .where(inArray(alertsTable.studentId, studentIds));
    await db.delete(communicationEventsTable)
      .where(inArray(communicationEventsTable.studentId, studentIds));

    // Second run: same overdue referral still produces a critical risk, but
    // because the prior critical alert was resolved, this is treated as a
    // re-spike and should send an immediate individual email.
    await generateAlertsForDistrict(districtId);

    const events = await db.select({ type: communicationEventsTable.type, metadata: communicationEventsTable.metadata })
      .from(communicationEventsTable)
      .where(inArray(communicationEventsTable.studentId, studentIds));

    const spikeEvents = events.filter(e =>
      e.type === "cost_avoidance_risk_alert" &&
      (e.metadata as Record<string, unknown> | null)?.spike === true
    );
    expect(spikeEvents.length).toBe(1);
  });

  it("does NOT mark spike when newly-critical count exceeds the per-staff threshold", async () => {
    // Threshold = 2. Create 3 newly-critical risks for the same staff member.
    // Beyond threshold → all should fall through to the digest path
    // (no spike metadata).
    await resetDistrictState();
    await createOverdueEvalStudent({ caseManagerId: staffId, daysOverdue: 4 });
    await createOverdueEvalStudent({ caseManagerId: staffId, daysOverdue: 5 });
    await createOverdueEvalStudent({ caseManagerId: staffId, daysOverdue: 6 });

    await generateAlertsForDistrict(districtId);

    const events = await db.select({ type: communicationEventsTable.type, metadata: communicationEventsTable.metadata })
      .from(communicationEventsTable)
      .where(inArray(communicationEventsTable.studentId, studentIds));

    const spikeEvents = events.filter(e =>
      e.type === "cost_avoidance_risk_alert" &&
      (e.metadata as Record<string, unknown> | null)?.spike === true
    );
    const digestEvents = events.filter(e => e.type === "cost_avoidance_digest");

    // No risk should have been promoted to an immediate "spike" email.
    expect(spikeEvents.length).toBe(0);
    // The digest path was still attempted.
    expect(digestEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("respects spikeAlertEnabled=false and never marks spike", async () => {
    await db.update(districtsTable)
      .set({ spikeAlertEnabled: false })
      .where(eq(districtsTable.id, districtId));
    await resetDistrictState();
    await createOverdueEvalStudent({ caseManagerId: staffId, daysOverdue: 7 });

    await generateAlertsForDistrict(districtId);

    const events = await db.select({ type: communicationEventsTable.type, metadata: communicationEventsTable.metadata })
      .from(communicationEventsTable)
      .where(inArray(communicationEventsTable.studentId, studentIds));

    const spikeEvents = events.filter(e =>
      e.type === "cost_avoidance_risk_alert" &&
      (e.metadata as Record<string, unknown> | null)?.spike === true
    );
    const digestEvents = events.filter(e => e.type === "cost_avoidance_digest");

    expect(spikeEvents.length).toBe(0);
    expect(digestEvents.length).toBeGreaterThanOrEqual(1);
  });
});
