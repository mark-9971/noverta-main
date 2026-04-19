/**
 * Provider activation nudges (Task #420)
 *
 * Daily job that catches providers who have stalled out during a pilot — i.e.
 * have not logged a session for several consecutive school days. Without
 * logging, none of the wedge metrics light up, so a stalled provider is the
 * single biggest reason a pilot fails.
 *
 * Cadence (delivered via the existing 6-hour reminder scheduler):
 *   - Day 3+ : friendly nudge to the provider, with a deep link to Today's
 *              Schedule and the minutes scheduled today.
 *   - Day 5+ : escalation email to the provider's supervisor (if configured)
 *              and to district admins who opt in via `receive_risk_alerts`.
 *
 * Snooze: a per-provider "snooze for one week" capability link in the email
 * footer suppresses both the direct nudge and the escalation for 7 days.
 *
 * "School days" is the simple definition used elsewhere in the product
 * (Mon–Fri; weekends excluded). Federal holidays are not excluded here — we
 * deliberately err toward more nudges rather than fewer because the cost of
 * a stalled provider during a pilot is much higher than the cost of one
 * extra email.
 */
import {
  db,
  districtsTable,
  staffTable,
  schoolsTable,
  scheduleBlocksTable,
  sessionLogsTable,
  communicationEventsTable,
} from "@workspace/db";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import crypto from "node:crypto";
import {
  sendEmail,
  getAppBaseUrl,
  buildProviderActivationNudgeEmail,
  buildProviderActivationEscalationEmail,
} from "./email";

const LOOKBACK_DAYS = 14;
const PROVIDER_THRESHOLD = 3;
const ESCALATION_THRESHOLD = 5;
const PROVIDER_ROLES = ["provider", "bcba", "sped_teacher", "case_manager"];
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Test-only override: pretend "now" is this Date if set. */
let nowOverride: Date | null = null;
export function __setNudgeClockForTest(d: Date | null): void {
  nowOverride = d;
}
function now(): Date {
  return nowOverride ?? new Date();
}

function isSchoolDay(d: Date): boolean {
  const day = d.getUTCDay();
  return day !== 0 && day !== 6;
}

function ymd(d: Date): string {
  return d.toISOString().substring(0, 10);
}

/** Compute the local hour-of-day for `d` in the given IANA timezone. */
function hourInTimeZone(d: Date, timeZone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hour12: false,
    });
    const parts = fmt.formatToParts(d);
    const hourPart = parts.find(p => p.type === "hour");
    return hourPart ? Number(hourPart.value) : NaN;
  } catch {
    // Unknown tz — fall back to UTC so we still send something rather than nothing.
    return d.getUTCHours();
  }
}

/**
 * Number of consecutive school days (working back from yesterday) where the
 * provider has NOT logged any session. Caps at LOOKBACK_DAYS; a provider with
 * no activity in the entire window is reported as `LOOKBACK_DAYS` (effectively
 * "very stalled").
 */
export function countConsecutiveMissedSchoolDays(opts: {
  reference: Date;
  loggedDates: Set<string>;
}): number {
  const { reference, loggedDates } = opts;
  let consecutive = 0;
  for (let i = 1; i <= LOOKBACK_DAYS * 2 && consecutive < LOOKBACK_DAYS; i++) {
    const d = new Date(reference);
    d.setUTCDate(reference.getUTCDate() - i);
    if (!isSchoolDay(d)) continue;
    if (loggedDates.has(ymd(d))) break;
    consecutive++;
  }
  return consecutive;
}

async function ensureSnoozeToken(staffId: number, existing: string | null): Promise<string> {
  if (existing) return existing;
  const token = crypto.randomBytes(24).toString("base64url");
  await db.update(staffTable)
    .set({ nudgeSnoozeToken: token })
    .where(eq(staffTable.id, staffId));
  return token;
}

type NudgeEventType = "provider_activation_nudge" | "provider_activation_escalation";

async function alreadySentToday(opts: { staffId: number; type: NudgeEventType; today: string }): Promise<boolean> {
  const cutoff = new Date(`${opts.today}T00:00:00Z`);
  const rows = await db
    .select({ id: communicationEventsTable.id })
    .from(communicationEventsTable)
    .where(
      and(
        eq(communicationEventsTable.staffId, opts.staffId),
        eq(communicationEventsTable.type, opts.type),
        gt(communicationEventsTable.createdAt, cutoff),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Report shape returned to callers (used by the Pilot Status stat endpoint and
 * the test suite). One row per provider that *would* be nudged in this run,
 * regardless of whether the email was actually sent (e.g. dedupe suppressed
 * a duplicate).
 */
export interface NudgeRun {
  districtId: number;
  staffId: number;
  staffEmail: string | null;
  consecutiveDays: number;
  scheduledMinutesToday: number;
  scheduledSessionsToday: number;
  nudgeSent: boolean;
  escalationSent: boolean;
  escalationRecipients: string[];
  suppressedReason?: "snoozed" | "no_email" | "already_sent_today";
}

interface RunOptions {
  /** Bypass the "is it 7am local?" gate. Only used by tests. */
  ignoreLocalHourGate?: boolean;
  /** Limit to a single district (test convenience). */
  onlyDistrictId?: number;
}

export async function runProviderActivationNudges(opts: RunOptions = {}): Promise<NudgeRun[]> {
  const reference = now();
  const todayStr = ymd(reference);
  const todayDayName = DAY_NAMES[reference.getUTCDay()];
  const earliest = new Date(reference);
  earliest.setUTCDate(reference.getUTCDate() - LOOKBACK_DAYS);
  const earliestStr = ymd(earliest);

  const districtFilter = opts.onlyDistrictId !== undefined
    ? and(eq(districtsTable.isPilot, true), eq(districtsTable.id, opts.onlyDistrictId))
    : eq(districtsTable.isPilot, true);

  const districts = await db
    .select({
      id: districtsTable.id,
      name: districtsTable.name,
      timeZone: districtsTable.timeZone,
    })
    .from(districtsTable)
    .where(districtFilter);

  const appBaseUrl = getAppBaseUrl();
  const todaysScheduleUrl = appBaseUrl ? `${appBaseUrl}/my-schedule` : "/my-schedule";
  const results: NudgeRun[] = [];

  for (const district of districts) {
    if (!opts.ignoreLocalHourGate) {
      // 7am local delivery window. Scheduler runs every 6 hours so we hit each
      // local 7am block at most twice; the per-staff "already sent today" gate
      // ensures we only send once per provider per day.
      const localHour = hourInTimeZone(reference, district.timeZone);
      if (localHour !== 7) continue;
    }

    // Active providers in this district who could plausibly need a nudge.
    const providers = await db
      .select({
        id: staffTable.id,
        firstName: staffTable.firstName,
        lastName: staffTable.lastName,
        email: staffTable.email,
        role: staffTable.role,
        supervisorStaffId: staffTable.supervisorStaffId,
        nudgeSnoozedUntil: staffTable.nudgeSnoozedUntil,
        nudgeSnoozeToken: staffTable.nudgeSnoozeToken,
      })
      .from(staffTable)
      .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
      .where(
        and(
          eq(schoolsTable.districtId, district.id),
          eq(staffTable.status, "active"),
          isNull(staffTable.deletedAt),
          inArray(staffTable.role, PROVIDER_ROLES),
        ),
      );

    if (providers.length === 0) continue;

    const providerIds = providers.map(p => p.id);

    // Pull all session logs in window for these providers in one query.
    const logs = await db
      .select({
        staffId: sessionLogsTable.staffId,
        sessionDate: sessionLogsTable.sessionDate,
      })
      .from(sessionLogsTable)
      .where(
        and(
          inArray(sessionLogsTable.staffId, providerIds),
          sql`${sessionLogsTable.sessionDate} BETWEEN ${earliestStr} AND ${todayStr}`,
          isNull(sessionLogsTable.deletedAt),
        ),
      );

    const logsByStaff = new Map<number, Set<string>>();
    for (const l of logs) {
      if (l.staffId == null) continue;
      let set = logsByStaff.get(l.staffId);
      if (!set) { set = new Set<string>(); logsByStaff.set(l.staffId, set); }
      set.add(l.sessionDate);
    }

    // Today's recurring schedule (per staff) — used to surface "you have N
    // minutes scheduled today" in the email body.
    const todayBlocks = await db
      .select({
        staffId: scheduleBlocksTable.staffId,
        startTime: scheduleBlocksTable.startTime,
        endTime: scheduleBlocksTable.endTime,
        effectiveFrom: scheduleBlocksTable.effectiveFrom,
        effectiveTo: scheduleBlocksTable.effectiveTo,
      })
      .from(scheduleBlocksTable)
      .where(
        and(
          inArray(scheduleBlocksTable.staffId, providerIds),
          eq(scheduleBlocksTable.dayOfWeek, todayDayName),
          eq(scheduleBlocksTable.isRecurring, true),
          eq(scheduleBlocksTable.blockType, "service"),
          isNull(scheduleBlocksTable.deletedAt),
        ),
      );

    const minutesByStaff = new Map<number, { minutes: number; sessions: number }>();
    for (const b of todayBlocks) {
      if (b.effectiveFrom && todayStr < b.effectiveFrom) continue;
      if (b.effectiveTo && todayStr > b.effectiveTo) continue;
      const start = parseHHMM(b.startTime);
      const end = parseHHMM(b.endTime);
      const minutes = Math.max(0, end - start);
      const cur = minutesByStaff.get(b.staffId) ?? { minutes: 0, sessions: 0 };
      cur.minutes += minutes;
      cur.sessions += 1;
      minutesByStaff.set(b.staffId, cur);
    }

    // Build a lookup of supervisor + admin emails for escalation routing.
    const allDistrictStaff = await db
      .select({
        id: staffTable.id,
        firstName: staffTable.firstName,
        lastName: staffTable.lastName,
        email: staffTable.email,
        role: staffTable.role,
        receiveRiskAlerts: staffTable.receiveRiskAlerts,
      })
      .from(staffTable)
      .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
      .where(
        and(
          eq(schoolsTable.districtId, district.id),
          eq(staffTable.status, "active"),
          isNull(staffTable.deletedAt),
        ),
      );
    const staffById = new Map(allDistrictStaff.map(s => [s.id, s]));
    const districtAdmins = allDistrictStaff.filter(s =>
      s.role === "admin" && !!s.email && s.receiveRiskAlerts,
    );

    for (const provider of providers) {
      const consecutive = countConsecutiveMissedSchoolDays({
        reference,
        loggedDates: logsByStaff.get(provider.id) ?? new Set<string>(),
      });
      if (consecutive < PROVIDER_THRESHOLD) continue;

      const today = minutesByStaff.get(provider.id) ?? { minutes: 0, sessions: 0 };
      const result: NudgeRun = {
        districtId: district.id,
        staffId: provider.id,
        staffEmail: provider.email,
        consecutiveDays: consecutive,
        scheduledMinutesToday: today.minutes,
        scheduledSessionsToday: today.sessions,
        nudgeSent: false,
        escalationSent: false,
        escalationRecipients: [],
      };

      if (provider.nudgeSnoozedUntil && provider.nudgeSnoozedUntil > reference) {
        result.suppressedReason = "snoozed";
        results.push(result);
        continue;
      }
      if (!provider.email) {
        result.suppressedReason = "no_email";
        results.push(result);
        continue;
      }
      if (await alreadySentToday({ staffId: provider.id, type: "provider_activation_nudge", today: todayStr })) {
        result.suppressedReason = "already_sent_today";
        results.push(result);
        continue;
      }

      const token = await ensureSnoozeToken(provider.id, provider.nudgeSnoozeToken);
      const snoozeUrl = appBaseUrl ? `${appBaseUrl}/api/nudges/snooze/${token}` : undefined;
      const providerName = `${provider.firstName} ${provider.lastName}`.trim();

      const email = buildProviderActivationNudgeEmail({
        providerName,
        consecutiveDays: consecutive,
        scheduledMinutesToday: today.minutes,
        scheduledSessionsToday: today.sessions,
        todaysScheduleUrl,
        snoozeUrl,
        districtName: district.name,
      });

      // sendEmail requires a studentId; activation nudges are not student-scoped.
      // Use 0 as a sentinel — studentId column is NOT NULL on communication_events
      // historically, but 0 is reserved as "no student" elsewhere in the schema
      // (see: how scheduledReports send-time uses any-row workarounds). If a real
      // FK is required, the row will fail and we surface that in logs.
      try {
        const sendResult = await sendEmail({
          studentId: 0,
          staffId: provider.id,
          type: "provider_activation_nudge",
          subject: email.subject,
          bodyHtml: email.html,
          bodyText: email.text,
          toEmail: provider.email,
          toName: providerName,
          metadata: {
            consecutiveDays: consecutive,
            scheduledMinutesToday: today.minutes,
            triggeredBy: "provider_activation_scheduler",
          },
        });
        result.nudgeSent = sendResult.success || sendResult.notConfigured === true;
      } catch (err) {
        console.error(`[ProviderActivationNudges] Failed to send provider nudge for staff ${provider.id}:`, err);
      }

      // Escalation
      if (consecutive >= ESCALATION_THRESHOLD) {
        const recipients = new Map<string, string>(); // email -> name
        if (provider.supervisorStaffId) {
          const sup = staffById.get(provider.supervisorStaffId);
          if (sup?.email) recipients.set(sup.email, `${sup.firstName} ${sup.lastName}`.trim());
        }
        for (const a of districtAdmins) {
          if (a.email && !recipients.has(a.email)) {
            recipients.set(a.email, `${a.firstName} ${a.lastName}`.trim());
          }
        }
        if (recipients.size > 0 && !(await alreadySentToday({
          staffId: provider.id,
          type: "provider_activation_escalation",
          today: todayStr,
        }))) {
          for (const [recipientEmail, recipientName] of recipients) {
            const esc = buildProviderActivationEscalationEmail({
              recipientName: recipientName || "Team",
              providerName,
              consecutiveDays: consecutive,
              todaysScheduleUrl,
              districtName: district.name,
            });
            try {
              const sendResult = await sendEmail({
                studentId: 0,
                staffId: provider.id,
                type: "provider_activation_escalation",
                subject: esc.subject,
                bodyHtml: esc.html,
                bodyText: esc.text,
                toEmail: recipientEmail,
                toName: recipientName || undefined,
                metadata: {
                  providerStaffId: provider.id,
                  consecutiveDays: consecutive,
                  triggeredBy: "provider_activation_scheduler",
                },
              });
              if (sendResult.success || sendResult.notConfigured) {
                result.escalationSent = true;
                result.escalationRecipients.push(recipientEmail);
              }
            } catch (err) {
              console.error(`[ProviderActivationNudges] Escalation send failed (${recipientEmail}) for staff ${provider.id}:`, err);
            }
          }
        }
      }

      results.push(result);
    }
  }

  console.log(`[ProviderActivationNudges] Run complete — ${results.length} provider(s) flagged across ${districts.length} pilot district(s)`);
  return results;
}

function parseHHMM(t: string | null | undefined): number {
  if (!t) return 0;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Apply a one-week snooze for the staff row that owns this token. Returns
 * the staff id and the new snoozed-until timestamp, or null if the token does
 * not match any provider.
 */
export async function applySnoozeForToken(token: string): Promise<{ staffId: number; snoozedUntil: Date } | null> {
  const [row] = await db.select({ id: staffTable.id }).from(staffTable).where(eq(staffTable.nudgeSnoozeToken, token)).limit(1);
  if (!row) return null;
  const snoozedUntil = new Date(now().getTime() + 7 * 24 * 60 * 60 * 1000);
  await db.update(staffTable).set({ nudgeSnoozedUntil: snoozedUntil }).where(eq(staffTable.id, row.id));
  return { staffId: row.id, snoozedUntil };
}

/**
 * "X providers nudged this week" — count of distinct providers in the given
 * district who received a nudge or escalation email in the trailing 7 days.
 */
export async function countProvidersNudgedThisWeek(districtId: number): Promise<number> {
  const cutoff = new Date(now().getTime() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db.execute(sql`
    SELECT COUNT(DISTINCT ce.staff_id)::int AS n
    FROM communication_events ce
    JOIN staff s    ON s.id = ce.staff_id
    JOIN schools sc ON sc.id = s.school_id
    WHERE sc.district_id = ${districtId}
      AND ce.type IN ('provider_activation_nudge', 'provider_activation_escalation')
      AND ce.created_at > ${cutoff.toISOString()}::timestamptz
  `);
  const first = rows.rows[0] as { n?: number } | undefined;
  return Number(first?.n ?? 0);
}
