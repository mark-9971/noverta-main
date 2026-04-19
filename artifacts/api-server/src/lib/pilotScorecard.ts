import { db, pool } from "@workspace/db";
import { districtsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { sendAdminEmail, getAppBaseUrl } from "./email";
import { getDistrictAdminEmails } from "./billingEmail";
import { logger } from "./logger";

/**
 * Weekly "Pilot Success Scorecard" email — sent every Monday during a
 * district's pilot to keep the wedge value (compliance lift, exposure
 * surfaced, comp-ed flagged) top of mind for the renewal decision-maker.
 *
 * Modeled after costAvoidanceWeeklyDigest.ts.
 */

export async function ensurePilotScorecardSchema(): Promise<void> {
  try {
    await pool.query(`
      ALTER TABLE districts
        ADD COLUMN IF NOT EXISTS pilot_scorecard_email_enabled boolean NOT NULL DEFAULT true
    `);
    await pool.query(`
      ALTER TABLE districts
        ADD COLUMN IF NOT EXISTS pilot_scorecard_last_sent_week_start date
    `);
  } catch (err) {
    logger.warn({ err }, "ensurePilotScorecardSchema: DDL failed (non-fatal)");
  }
}

export interface PilotScorecardMetric {
  label: string;
  value: number;
  /** Pre-formatted display value (e.g. "$1,200" or "78%"). */
  display: string;
  /** Same metric for the prior week, or null if no prior data. */
  priorValue: number | null;
  /** Pre-formatted week-over-week delta (e.g. "+12%", "no change"). */
  deltaLabel: string | null;
  /** "up" | "down" | "neutral" — semantics depend on the metric (some
   *  improvements are increases, some are decreases). */
  deltaDir: "up" | "down" | "neutral" | null;
  /** True when an upward change is "good" for the recipient. */
  upwardIsGood: boolean;
  /** Deep link path into the relevant in-app view (no host). */
  link: string;
}

export interface PilotScorecardData {
  districtId: number;
  districtName: string;
  weekStart: string; // YYYY-MM-DD
  weekEnd: string;   // YYYY-MM-DD
  weekLabel: string;
  metrics: {
    minutesLogged: PilotScorecardMetric;
    pctDelivered: PilotScorecardMetric;
    exposureSurfacedCents: PilotScorecardMetric;
    compEdMinutesFlagged: PilotScorecardMetric;
    alertsActedOn: PilotScorecardMetric;
  };
}

function fmtDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Returns the [Mon, Sun] (UTC) bounds of the week immediately preceding `referenceDate`. */
export function getPriorWeekBounds(referenceDate: Date = new Date()): { start: Date; end: Date } {
  // Find this week's Monday in UTC
  const ref = new Date(Date.UTC(
    referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate(), 0, 0, 0, 0,
  ));
  const day = ref.getUTCDay(); // 0 = Sun
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const thisMonday = new Date(ref.getTime() - daysSinceMonday * 86400000);
  const lastMonday = new Date(thisMonday.getTime() - 7 * 86400000);
  const lastSunday = new Date(thisMonday.getTime() - 1);
  return { start: lastMonday, end: lastSunday };
}

function fmtCurrency(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString("en-US")}`;
}

function formatChangePercent(current: number, prior: number): string {
  if (prior === 0) return current > 0 ? "+100%" : "no change";
  const pct = Math.round(((current - prior) / prior) * 100);
  if (pct === 0) return "no change";
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

function deltaDir(current: number, prior: number | null): "up" | "down" | "neutral" | null {
  if (prior === null) return null;
  if (current === prior) return "neutral";
  return current > prior ? "up" : "down";
}

interface RawAggregates {
  minutesLogged: number;
  scheduledMinutes: number;
  exposureCents: number;
  compEdMinutes: number;
  alertsActedOn: number;
}

async function computeRawAggregates(districtId: number, weekStart: Date, weekEnd: Date): Promise<RawAggregates> {
  const startStr = fmtDateUTC(weekStart);
  const endStr = fmtDateUTC(weekEnd);

  // Minutes logged this week (completed + makeup, district-scoped via student → school).
  const minutesRes = await pool.query<{ minutes: string }>(
    `SELECT COALESCE(SUM(sl.duration_minutes), 0)::bigint AS minutes
       FROM session_logs sl
       JOIN students s  ON s.id = sl.student_id
       JOIN schools  sc ON sc.id = s.school_id
      WHERE sc.district_id = $1
        AND sl.deleted_at IS NULL
        AND sl.status IN ('completed','makeup')
        AND sl.session_date BETWEEN $2 AND $3`,
    [districtId, startStr, endStr],
  );
  const minutesLogged = Number(minutesRes.rows[0]?.minutes ?? 0);

  // Scheduled minutes this week — recurring blocks tied to district staff,
  // active during the week, excluding deleted. Biweekly halved as a coarse
  // approximation; matches the existing dashboard convention.
  const schedRes = await pool.query<{ minutes: string }>(
    `SELECT COALESCE(SUM(
        CASE
          WHEN sb.recurrence_type = 'biweekly' THEN
            EXTRACT(EPOCH FROM (sb.end_time::time - sb.start_time::time))::int / 60 / 2
          ELSE
            EXTRACT(EPOCH FROM (sb.end_time::time - sb.start_time::time))::int / 60
        END
      ), 0)::bigint AS minutes
      FROM schedule_blocks sb
      JOIN staff st   ON st.id = sb.staff_id
      JOIN schools sc ON sc.id = st.school_id
     WHERE sc.district_id = $1
       AND sb.deleted_at IS NULL
       AND sb.is_recurring = true
       AND sb.block_type = 'service'
       AND (sb.effective_from IS NULL OR sb.effective_from <= $3::date)
       AND (sb.effective_to   IS NULL OR sb.effective_to   >= $2::date)`,
    [districtId, startStr, endStr],
  );
  const scheduledMinutes = Number(schedRes.rows[0]?.minutes ?? 0);

  // Missed-session financial exposure surfaced this week =
  // sum(comp_obligation.minutes_owed created this week) × district hourly rate.
  // Using the district default hourly rate as the simplest pricing model
  // available without per-service rate tables; same approximation as the
  // billing rates fallback elsewhere in the app.
  const expRes = await pool.query<{ minutes: string; rate: string | null }>(
    `SELECT COALESCE(SUM(co.minutes_owed), 0)::bigint AS minutes,
            d.default_hourly_rate AS rate
       FROM compensatory_obligations co
       JOIN students s  ON s.id = co.student_id
       JOIN schools  sc ON sc.id = s.school_id
       JOIN districts d ON d.id = sc.district_id
      WHERE sc.district_id = $1
        AND co.created_at >= $2::date
        AND co.created_at <  ($3::date + INTERVAL '1 day')
      GROUP BY d.default_hourly_rate`,
    [districtId, startStr, endStr],
  );
  const compEdMinutes = Number(expRes.rows[0]?.minutes ?? 0);
  const ratePerHour = expRes.rows[0]?.rate ? Number(expRes.rows[0].rate) : 0;
  // exposure expressed in cents to avoid float drift downstream
  const exposureCents = Math.round((compEdMinutes / 60) * ratePerHour * 100);

  // Compliance alerts acted on (resolved this week) — district-scoped via student→school.
  const alertsRes = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::bigint AS n
       FROM alerts a
       JOIN students s  ON s.id = a.student_id
       JOIN schools  sc ON sc.id = s.school_id
      WHERE sc.district_id = $1
        AND a.resolved = true
        AND a.resolved_at >= $2::date
        AND a.resolved_at <  ($3::date + INTERVAL '1 day')`,
    [districtId, startStr, endStr],
  );
  const alertsActedOn = Number(alertsRes.rows[0]?.n ?? 0);

  return { minutesLogged, scheduledMinutes, exposureCents, compEdMinutes, alertsActedOn };
}

function buildMetric(opts: {
  label: string;
  current: number;
  prior: number | null;
  display: string;
  upwardIsGood: boolean;
  link: string;
}): PilotScorecardMetric {
  const { label, current, prior, display, upwardIsGood, link } = opts;
  const dir = deltaDir(current, prior);
  const delta = prior !== null ? formatChangePercent(current, prior) : null;
  return {
    label,
    value: current,
    display,
    priorValue: prior,
    deltaLabel: delta,
    deltaDir: dir,
    upwardIsGood,
    link,
  };
}

export async function computePilotScorecard(districtId: number, referenceDate: Date = new Date()): Promise<PilotScorecardData | null> {
  const districtRow = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM districts WHERE id = $1 LIMIT 1`,
    [districtId],
  );
  const district = districtRow.rows[0];
  if (!district) return null;

  const { start, end } = getPriorWeekBounds(referenceDate);
  const priorWeekStart = new Date(start.getTime() - 7 * 86400000);
  const priorWeekEnd = new Date(end.getTime() - 7 * 86400000);

  const [current, prior] = await Promise.all([
    computeRawAggregates(districtId, start, end),
    computeRawAggregates(districtId, priorWeekStart, priorWeekEnd),
  ]);

  const pctDelivered = current.scheduledMinutes > 0
    ? Math.min(100, Math.round((current.minutesLogged / current.scheduledMinutes) * 100))
    : 0;
  const priorPctDelivered = prior.scheduledMinutes > 0
    ? Math.min(100, Math.round((prior.minutesLogged / prior.scheduledMinutes) * 100))
    : null;

  const weekLabel = `Week of ${start.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}`;

  return {
    districtId,
    districtName: district.name,
    weekStart: fmtDateUTC(start),
    weekEnd: fmtDateUTC(end),
    weekLabel,
    metrics: {
      minutesLogged: buildMetric({
        label: "Minutes logged",
        current: current.minutesLogged,
        prior: prior.minutesLogged,
        display: current.minutesLogged.toLocaleString("en-US"),
        upwardIsGood: true,
        link: "/sessions",
      }),
      pctDelivered: buildMetric({
        label: "% of scheduled minutes delivered",
        current: pctDelivered,
        prior: priorPctDelivered,
        display: current.scheduledMinutes > 0 ? `${pctDelivered}%` : "—",
        upwardIsGood: true,
        link: "/compliance",
      }),
      exposureSurfacedCents: buildMetric({
        label: "Missed-session financial exposure surfaced",
        current: current.exposureCents,
        prior: prior.exposureCents,
        display: fmtCurrency(current.exposureCents),
        upwardIsGood: true, // surfacing more = better visibility into risk
        link: "/cost-avoidance",
      }),
      compEdMinutesFlagged: buildMetric({
        label: "Compensatory-ed minutes flagged",
        current: current.compEdMinutes,
        prior: prior.compEdMinutes,
        display: current.compEdMinutes.toLocaleString("en-US"),
        upwardIsGood: true, // surfacing comp-ed = better risk capture
        link: "/compensatory-finance",
      }),
      alertsActedOn: buildMetric({
        label: "Compliance alerts acted on",
        current: current.alertsActedOn,
        prior: prior.alertsActedOn,
        display: current.alertsActedOn.toLocaleString("en-US"),
        upwardIsGood: true,
        link: "/alerts",
      }),
    },
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function deltaBadge(metric: PilotScorecardMetric): string {
  if (!metric.deltaLabel || metric.deltaDir === null) return "";
  const isImprovement =
    metric.deltaDir === "neutral" ? false :
    (metric.deltaDir === "up") === metric.upwardIsGood;
  const color =
    metric.deltaDir === "neutral" ? "#6b7280" :
    isImprovement ? "#16a34a" : "#dc2626";
  return `<span style="display:inline-block;margin-left:6px;font-size:11px;font-weight:700;padding:1px 7px;border-radius:10px;background:${color};color:#fff">${escapeHtml(metric.deltaLabel)} vs prior week</span>`;
}

export function buildPilotScorecardEmail(opts: {
  data: PilotScorecardData;
  appBaseUrl: string | null;
  unsubscribeUrl: string | null;
}): { subject: string; html: string; text: string } {
  const { data, appBaseUrl, unsubscribeUrl } = opts;
  const { districtName, weekLabel, metrics } = data;

  const link = (path: string) => appBaseUrl ? `${appBaseUrl}${path}` : path;

  const subject = `This week on Trellis — ${districtName} — ${weekLabel}`;

  const metricRow = (m: PilotScorecardMetric, accent: string) => `
    <tr>
      <td style="padding:14px 16px;border:1px solid #e5e7eb;background:#fff;vertical-align:top">
        <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;font-weight:600">${escapeHtml(m.label)}</div>
        <div style="margin-top:4px;font-size:24px;font-weight:700;color:${accent}">${escapeHtml(m.display)}${deltaBadge(m)}</div>
      </td>
      <td style="padding:14px 16px;border:1px solid #e5e7eb;background:#fff;vertical-align:middle;width:140px;text-align:right">
        <a href="${escapeHtml(link(m.link))}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;font-size:12px;font-weight:600;padding:7px 12px;border-radius:6px">View →</a>
      </td>
    </tr>`;

  const unsubscribeFooter = unsubscribeUrl
    ? `You can opt out of this weekly scorecard at any time — <a href="${escapeHtml(unsubscribeUrl)}" style="color:#0f766e">manage email preferences</a>.`
    : `To opt out, ask your Trellis administrator to disable the weekly pilot scorecard in district notification settings.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;font-size:14px;color:#111">
<div style="max-width:640px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
  <div style="background:#0f766e;color:#fff;padding:22px 28px">
    <h1 style="margin:0 0 4px;font-size:19px">This week on Trellis</h1>
    <p style="margin:0;font-size:12px;opacity:.85">${escapeHtml(districtName)} &mdash; ${escapeHtml(weekLabel)}</p>
  </div>
  <div style="padding:20px 24px">
    <p style="margin:0 0 16px;font-size:13px;color:#374151">
      Here is the value Trellis surfaced for ${escapeHtml(districtName)} during the past week.
      Each metric links to the in-app view where you can dig deeper.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tbody>
        ${metricRow(metrics.minutesLogged, "#0f766e")}
        ${metricRow(metrics.pctDelivered, "#0f766e")}
        ${metricRow(metrics.exposureSurfacedCents, "#c2410c")}
        ${metricRow(metrics.compEdMinutesFlagged, "#ca8a04")}
        ${metricRow(metrics.alertsActedOn, "#1d4ed8")}
      </tbody>
    </table>
    <p style="margin:20px 0 0;font-size:12px;color:#6b7280">
      Numbers reflect activity from <strong>${escapeHtml(data.weekStart)}</strong> through <strong>${escapeHtml(data.weekEnd)}</strong>.
      Week-over-week changes compare to the prior 7 days.
    </p>
  </div>
  <div style="background:#f3f4f6;padding:14px 28px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb">
    <p style="margin:0">${unsubscribeFooter}</p>
    <p style="margin:6px 0 0">Trellis SPED Compliance Platform &mdash; Confidential</p>
  </div>
</div>
</body>
</html>`;

  const lines = [
    `THIS WEEK ON TRELLIS`,
    `${districtName} — ${weekLabel}`,
    ``,
    `Minutes logged:                       ${metrics.minutesLogged.display}${metrics.minutesLogged.deltaLabel ? `  (${metrics.minutesLogged.deltaLabel} vs prior week)` : ""}`,
    `% of scheduled minutes delivered:     ${metrics.pctDelivered.display}${metrics.pctDelivered.deltaLabel ? `  (${metrics.pctDelivered.deltaLabel} vs prior week)` : ""}`,
    `Missed-session exposure surfaced:     ${metrics.exposureSurfacedCents.display}${metrics.exposureSurfacedCents.deltaLabel ? `  (${metrics.exposureSurfacedCents.deltaLabel} vs prior week)` : ""}`,
    `Comp-ed minutes flagged:              ${metrics.compEdMinutesFlagged.display}${metrics.compEdMinutesFlagged.deltaLabel ? `  (${metrics.compEdMinutesFlagged.deltaLabel} vs prior week)` : ""}`,
    `Compliance alerts acted on:           ${metrics.alertsActedOn.display}${metrics.alertsActedOn.deltaLabel ? `  (${metrics.alertsActedOn.deltaLabel} vs prior week)` : ""}`,
    ``,
    `Coverage: ${data.weekStart} through ${data.weekEnd}.`,
    ``,
    unsubscribeUrl
      ? `Opt out: ${unsubscribeUrl}`
      : `To opt out, ask your Trellis administrator to disable the weekly pilot scorecard in district notification settings.`,
  ];

  return { subject, html, text: lines.join("\n") };
}

export interface PilotScorecardPreviewResult {
  ok: true;
  subject: string;
  html: string;
  text: string;
  data: PilotScorecardData;
}

export interface PilotScorecardPreviewError {
  ok: false;
  error: string;
}

export async function buildPilotScorecardPreviewForDistrict(
  districtId: number,
): Promise<PilotScorecardPreviewResult | PilotScorecardPreviewError> {
  const data = await computePilotScorecard(districtId);
  if (!data) return { ok: false, error: "district not found" };

  const appBaseUrl = getAppBaseUrl();
  const unsubscribeUrl = appBaseUrl ? `${appBaseUrl}/settings?tab=notifications` : null;
  const { subject, html, text } = buildPilotScorecardEmail({ data, appBaseUrl, unsubscribeUrl });

  return { ok: true, subject, html, text, data };
}

export interface PilotScorecardSendResult {
  sent: boolean;
  skipped: boolean;
  reason?: string;
}

interface DistrictGate {
  id: number;
  name: string;
  is_pilot: boolean;
  is_demo: boolean;
  pilot_scorecard_email_enabled: boolean;
  pilot_scorecard_last_sent_week_start: string | null;
}

async function loadDistrictGate(districtId: number): Promise<DistrictGate | null> {
  const r = await pool.query<DistrictGate>(
    `SELECT id, name, is_pilot, is_demo,
            pilot_scorecard_email_enabled,
            pilot_scorecard_last_sent_week_start::text AS pilot_scorecard_last_sent_week_start
       FROM districts WHERE id = $1 LIMIT 1`,
    [districtId],
  );
  return r.rows[0] ?? null;
}

export async function sendPilotScorecardForDistrict(districtId: number): Promise<PilotScorecardSendResult> {
  const gate = await loadDistrictGate(districtId);
  if (!gate) return { sent: false, skipped: true, reason: "district not found" };
  if (gate.is_demo) return { sent: false, skipped: true, reason: "demo district" };
  if (!gate.is_pilot) return { sent: false, skipped: true, reason: "district not in pilot" };
  if (!gate.pilot_scorecard_email_enabled) return { sent: false, skipped: true, reason: "scorecard disabled for district" };

  const data = await computePilotScorecard(districtId);
  if (!data) return { sent: false, skipped: true, reason: "no scorecard data" };

  // Idempotency: skip if we already sent this week's scorecard.
  if (gate.pilot_scorecard_last_sent_week_start === data.weekStart) {
    return { sent: false, skipped: true, reason: "already sent for this week" };
  }

  const recipients = await getDistrictAdminEmails(districtId);
  if (recipients.length === 0) {
    logger.warn({ districtId }, "[PilotScorecard] No admin recipients, skipping");
    return { sent: false, skipped: true, reason: "no admin recipients" };
  }

  const appBaseUrl = getAppBaseUrl();
  const unsubscribeUrl = appBaseUrl ? `${appBaseUrl}/settings?tab=notifications` : null;
  const { subject, html, text } = buildPilotScorecardEmail({ data, appBaseUrl, unsubscribeUrl });

  const result = await sendAdminEmail({
    to: recipients,
    subject,
    html,
    text,
    notificationType: "PilotScorecard",
  });

  if (result.notConfigured) {
    logger.info({ districtId, recipients }, "[PilotScorecard] RESEND_API_KEY not configured — would send to admins");
    return { sent: false, skipped: false, reason: "email provider not configured" };
  }
  if (!result.success) {
    logger.error({ districtId, error: result.error }, "[PilotScorecard] Send failed");
    return { sent: false, skipped: false, reason: result.error };
  }

  await pool.query(
    `UPDATE districts SET pilot_scorecard_last_sent_week_start = $1::date WHERE id = $2`,
    [data.weekStart, districtId],
  );

  logger.info(
    { districtId, recipientCount: recipients.length, weekLabel: data.weekLabel },
    "[PilotScorecard] Pilot scorecard sent",
  );
  return { sent: true, skipped: false };
}

export async function sendPilotScorecardsForAllPilotDistricts(): Promise<void> {
  // Only iterate pilot districts to avoid wasted aggregator work.
  const pilots = await db
    .select({ id: districtsTable.id })
    .from(districtsTable)
    .where(eq(districtsTable.isPilot, true));

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const d of pilots) {
    try {
      const r = await sendPilotScorecardForDistrict(d.id);
      if (r.sent) sent++;
      else if (r.skipped) skipped++;
      else failed++;
    } catch (err) {
      logger.warn({ err, districtId: d.id }, "[PilotScorecard] District scorecard failed (non-fatal)");
      failed++;
    }
  }

  logger.info(
    { sent, skipped, failed, total: pilots.length },
    "[PilotScorecard] Weekly pilot scorecard run complete",
  );
}
