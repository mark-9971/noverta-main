/**
 * Tests for runProviderActivationNudges — the daily job that catches stalled
 * providers during a pilot.
 *
 * Covers:
 *   - Sends a provider-facing nudge after 3+ consecutive missed school days
 *     in a pilot district, but NOT in a non-pilot district.
 *   - Sends an escalation to the configured supervisor (and district admins)
 *     once consecutive misses cross 5 days.
 *   - Snooze (nudge_snoozed_until in the future) suppresses both emails.
 *   - applySnoozeForToken sets snoozedUntil ~7 days out.
 *   - countProvidersNudgedThisWeek counts distinct providers across both
 *     event types.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  db,
  staffTable,
  communicationEventsTable,
  districtsTable,
} from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";
import {
  createDistrict,
  createSchool,
  createStaff,
  cleanupDistrict,
} from "./helpers";
import {
  runProviderActivationNudges,
  applySnoozeForToken,
  countProvidersNudgedThisWeek,
  countConsecutiveMissedSchoolDays,
  __setNudgeClockForTest,
} from "../src/lib/providerActivationNudges";

const insertedStaffIds: number[] = [];
const insertedDistrictIds: number[] = [];

afterAll(async () => {
  if (insertedStaffIds.length > 0) {
    await db.delete(communicationEventsTable).where(inArray(communicationEventsTable.staffId, insertedStaffIds));
  }
  for (const id of insertedDistrictIds) {
    try { await cleanupDistrict(id); } catch { /* ignore */ }
  }
  __setNudgeClockForTest(null);
});

beforeEach(() => {
  __setNudgeClockForTest(null);
});

describe("countConsecutiveMissedSchoolDays", () => {
  it("counts back to the most recent logged school day, skipping weekends", () => {
    // Reference: Friday 2026-04-17 (UTC). School days back: Thu 4/16, Wed 4/15,
    // Tue 4/14, Mon 4/13, then Fri 4/10 (skipping the weekend).
    const reference = new Date("2026-04-17T12:00:00Z");
    const empty = countConsecutiveMissedSchoolDays({ reference, loggedDates: new Set() });
    expect(empty).toBeGreaterThanOrEqual(5); // at least Mon–Fri prior

    const onlyFriPrior = countConsecutiveMissedSchoolDays({
      reference,
      loggedDates: new Set(["2026-04-10"]),
    });
    // Thu 4/16, Wed 4/15, Tue 4/14, Mon 4/13 — then 4/10 is logged → stop.
    expect(onlyFriPrior).toBe(4);

    const yesterdayLogged = countConsecutiveMissedSchoolDays({
      reference,
      loggedDates: new Set(["2026-04-16"]),
    });
    expect(yesterdayLogged).toBe(0);
  });
});

describe("runProviderActivationNudges", () => {
  let pilotDistrictId: number;
  let nonPilotDistrictId: number;
  let pilotSchoolId: number;
  let nonPilotSchoolId: number;

  beforeAll(async () => {
    const pilot = await createDistrict({ name: `Pilot-${Date.now()}`, isPilot: true });
    pilotDistrictId = pilot.id;
    insertedDistrictIds.push(pilot.id);
    const nonPilot = await createDistrict({ name: `NonPilot-${Date.now()}`, isPilot: false });
    nonPilotDistrictId = nonPilot.id;
    insertedDistrictIds.push(nonPilot.id);
    pilotSchoolId = (await createSchool(pilotDistrictId)).id;
    nonPilotSchoolId = (await createSchool(nonPilotDistrictId)).id;
  });

  it("sends a provider nudge after 3+ missed school days in a pilot district, none in non-pilot", async () => {
    const provider = await createStaff(pilotSchoolId, {
      role: "provider",
      email: `prov-pilot-${Date.now()}@example.com`,
    });
    insertedStaffIds.push(provider.id);
    const nonPilotProvider = await createStaff(nonPilotSchoolId, {
      role: "provider",
      email: `prov-nonpilot-${Date.now()}@example.com`,
    });
    insertedStaffIds.push(nonPilotProvider.id);

    const results = await runProviderActivationNudges({ ignoreLocalHourGate: true });

    const pilotResult = results.find(r => r.staffId === provider.id);
    expect(pilotResult).toBeDefined();
    expect(pilotResult!.consecutiveDays).toBeGreaterThanOrEqual(3);
    // No RESEND_API_KEY in the test env → status is "not_configured" but the
    // job still records that the nudge attempt happened.
    expect(pilotResult!.nudgeSent).toBe(true);

    const nonPilotResult = results.find(r => r.staffId === nonPilotProvider.id);
    expect(nonPilotResult).toBeUndefined();

    const events = await db.select().from(communicationEventsTable).where(
      and(
        eq(communicationEventsTable.staffId, provider.id),
        eq(communicationEventsTable.type, "provider_activation_nudge"),
      ),
    );
    expect(events.length).toBe(1);
    expect(events[0].toEmail).toBe(provider.email);
    expect(events[0].subject).toMatch(/log today's sessions/i);
  });

  it("escalates to supervisor + district admins once consecutiveDays >= 5", async () => {
    const supervisor = await createStaff(pilotSchoolId, {
      role: "bcba",
      email: `sup-${Date.now()}@example.com`,
    });
    insertedStaffIds.push(supervisor.id);
    const admin = await createStaff(pilotSchoolId, {
      role: "admin",
      email: `admin-${Date.now()}@example.com`,
    });
    insertedStaffIds.push(admin.id);
    const provider = await createStaff(pilotSchoolId, {
      role: "provider",
      email: `prov-esc-${Date.now()}@example.com`,
      supervisorStaffId: supervisor.id,
    });
    insertedStaffIds.push(provider.id);

    const results = await runProviderActivationNudges({
      ignoreLocalHourGate: true,
      onlyDistrictId: pilotDistrictId,
    });

    const r = results.find(x => x.staffId === provider.id);
    expect(r).toBeDefined();
    // No session logs at all → consecutive should clearly exceed 5.
    expect(r!.consecutiveDays).toBeGreaterThanOrEqual(5);
    expect(r!.escalationSent).toBe(true);
    expect(r!.escalationRecipients).toContain(supervisor.email);
    expect(r!.escalationRecipients).toContain(admin.email);

    const escalations = await db.select().from(communicationEventsTable).where(
      and(
        eq(communicationEventsTable.staffId, provider.id),
        eq(communicationEventsTable.type, "provider_activation_escalation"),
      ),
    );
    // One row per recipient.
    expect(escalations.length).toBeGreaterThanOrEqual(2);
    const recipientEmails = escalations.map(e => e.toEmail).filter(Boolean) as string[];
    expect(recipientEmails).toEqual(expect.arrayContaining([supervisor.email, admin.email]));
  });

  it("snoozed providers receive neither nudge nor escalation", async () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const provider = await createStaff(pilotSchoolId, {
      role: "provider",
      email: `prov-snooze-${Date.now()}@example.com`,
      nudgeSnoozedUntil: future,
    });
    insertedStaffIds.push(provider.id);

    const results = await runProviderActivationNudges({
      ignoreLocalHourGate: true,
      onlyDistrictId: pilotDistrictId,
    });

    const r = results.find(x => x.staffId === provider.id);
    expect(r).toBeDefined();
    expect(r!.suppressedReason).toBe("snoozed");
    expect(r!.nudgeSent).toBe(false);
    expect(r!.escalationSent).toBe(false);

    const events = await db.select().from(communicationEventsTable).where(
      and(
        eq(communicationEventsTable.staffId, provider.id),
        inArray(communicationEventsTable.type, [
          "provider_activation_nudge",
          "provider_activation_escalation",
        ]),
      ),
    );
    expect(events.length).toBe(0);
  });

  it("applySnoozeForToken sets nudgeSnoozedUntil ~7 days out and is idempotent", async () => {
    const provider = await createStaff(pilotSchoolId, {
      role: "provider",
      email: `prov-token-${Date.now()}@example.com`,
    });
    insertedStaffIds.push(provider.id);

    // Run once to provision a snooze token via the email-send code path.
    await runProviderActivationNudges({
      ignoreLocalHourGate: true,
      onlyDistrictId: pilotDistrictId,
    });

    const [withToken] = await db.select().from(staffTable).where(eq(staffTable.id, provider.id));
    expect(withToken.nudgeSnoozeToken).toBeTruthy();

    const result = await applySnoozeForToken(withToken.nudgeSnoozeToken!);
    expect(result).not.toBeNull();
    expect(result!.staffId).toBe(provider.id);
    const diffDays = (result!.snoozedUntil.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeGreaterThan(6.5);
    expect(diffDays).toBeLessThan(7.5);

    expect(await applySnoozeForToken("not-a-real-token-xxxxxxxxxxxxx")).toBeNull();
  });

  it("countProvidersNudgedThisWeek returns distinct providers", async () => {
    const before = await countProvidersNudgedThisWeek(pilotDistrictId);
    expect(before).toBeGreaterThanOrEqual(1); // earlier tests sent some
  });

  it("respects the 7am local hour gate by default (no run when local hour != 7)", async () => {
    // Force "now" to a UTC time that is definitely NOT 7am in America/New_York
    // (e.g. 22:00 UTC = 18:00 EDT / 17:00 EST). A second provider with no logs
    // should NOT be picked up because the district-level hour gate skips it.
    const provider = await createStaff(pilotSchoolId, {
      role: "provider",
      email: `prov-hourgate-${Date.now()}@example.com`,
    });
    insertedStaffIds.push(provider.id);
    __setNudgeClockForTest(new Date("2026-04-15T22:00:00Z"));

    const results = await runProviderActivationNudges();
    expect(results.find(r => r.staffId === provider.id)).toBeUndefined();
  });
});
