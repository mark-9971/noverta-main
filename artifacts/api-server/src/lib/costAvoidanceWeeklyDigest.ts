import { db, pool } from "@workspace/db";
import {
  districtsTable,
  alertsTable,
  studentsTable,
  schoolsTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { sendAdminEmail } from "./email";
import { getDistrictAdminEmails } from "./billingEmail";
import { logger } from "./logger";

/**
 * Adds the weekly_risk_email_enabled column to districts if it does not exist.
 * Called once at startup so no migration file is required.
 */
export async function ensureWeeklyDigestColumn(): Promise<void> {
  try {
    await pool.query(`
      ALTER TABLE districts
        ADD COLUMN IF NOT EXISTS weekly_risk_email_enabled boolean NOT NULL DEFAULT true
    `);
    // Idempotency tracking: record when a digest was successfully dispatched for a
    // given district+week so server restarts don't cause duplicate sends.
    await pool.query(`
      ALTER TABLE cost_avoidance_snapshots
        ADD COLUMN IF NOT EXISTS weekly_digest_sent_at timestamptz
    `);
  } catch (err) {
    logger.warn({ err }, "ensureWeeklyDigestColumn: DDL failed (non-fatal)");
  }
}

interface TopRisk {
  studentName: string;
  severity: string;
  title: string;
  action: string | null;
}

interface SnapshotRow {
  id: number;
  totalExposure: number;
  totalRisks: number;
  criticalCount: number;
  highCount: number;
  weekStart: Date | string;
  weeklyDigestSentAt: Date | string | null;
}

async function fetchTopRisksForDistrict(districtId: number, limit = 3): Promise<TopRisk[]> {
  const activeStudents = await db
    .select({ id: studentsTable.id })
    .from(studentsTable)
    .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .where(
      and(
        eq(studentsTable.status, "active"),
        eq(schoolsTable.districtId, districtId),
      ),
    );

  if (activeStudents.length === 0) return [];
  const studentIds = activeStudents.map((s) => s.id);

  const rows = await db
    .select({
      severity: alertsTable.severity,
      message: alertsTable.message,
      suggestedAction: alertsTable.suggestedAction,
      studentId: alertsTable.studentId,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
    })
    .from(alertsTable)
    .innerJoin(studentsTable, eq(alertsTable.studentId, studentsTable.id))
    .where(
      and(
        eq(alertsTable.type, "cost_avoidance_risk"),
        eq(alertsTable.resolved, false),
        inArray(alertsTable.studentId, studentIds),
        inArray(alertsTable.severity, ["critical", "high"]),
      ),
    )
    .orderBy(
      sql`CASE ${alertsTable.severity}
        WHEN 'critical' THEN 0
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        ELSE 3 END`,
      desc(alertsTable.createdAt),
    )
    .limit(limit);

  return rows.map((r) => {
    const rawTitle = r.message?.replace(/\s*\[dedupe:[^\]]+\]/, "").replace(/^\[Cost Avoidance\]\s*/, "") ?? "Risk identified";
    return {
      studentName: `${r.firstName} ${r.lastName}`,
      severity: r.severity,
      title: rawTitle,
      action: r.suggestedAction ?? null,
    };
  });
}

async function fetchCurrentAndPriorSnapshot(
  districtId: number,
): Promise<{ current: SnapshotRow | null; prior: SnapshotRow | null }> {
  // Use pool.query so we can select the raw DDL-added column weekly_digest_sent_at
  // which is not present in the drizzle schema definition.
  const result = await pool.query<{
    id: number;
    total_exposure: number;
    total_risks: number;
    critical_count: number;
    high_count: number;
    week_start: Date;
    weekly_digest_sent_at: Date | null;
  }>(
    `SELECT id, total_exposure, total_risks, critical_count, high_count, week_start, weekly_digest_sent_at
     FROM cost_avoidance_snapshots
     WHERE district_id = $1
     ORDER BY week_start DESC
     LIMIT 2`,
    [districtId],
  );

  const toRow = (r: typeof result.rows[number]): SnapshotRow => ({
    id: r.id,
    totalExposure: r.total_exposure,
    totalRisks: r.total_risks,
    criticalCount: r.critical_count,
    highCount: r.high_count,
    weekStart: r.week_start,
    weeklyDigestSentAt: r.weekly_digest_sent_at ?? null,
  });

  const [raw0 = null, raw1 = null] = result.rows;
  return {
    current: raw0 ? toRow(raw0) : null,
    prior: raw1 ? toRow(raw1) : null,
  };
}

function formatExposure(cents: number): string {
  return `$${cents.toLocaleString("en-US")}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function formatChangePercent(current: number, prior: number): string {
  if (prior === 0) return current > 0 ? "+100%" : "no change";
  const pct = Math.round(((current - prior) / prior) * 100);
  if (pct === 0) return "no change";
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

function severityColor(severity: string): string {
  if (severity === "critical") return "#dc2626";
  if (severity === "high") return "#ea580c";
  return "#ca8a04";
}

export function buildWeeklyRiskDigestEmail(opts: {
  districtName: string;
  weekLabel: string;
  currentExposure: number;
  priorExposure: number | null;
  totalRisks: number;
  criticalCount: number;
  highCount: number;
  topRisks: TopRisk[];
}): { subject: string; html: string; text: string } {
  const {
    districtName, weekLabel, currentExposure, priorExposure,
    totalRisks, criticalCount, highCount, topRisks,
  } = opts;

  const changeLabel = priorExposure != null
    ? formatChangePercent(currentExposure, priorExposure)
    : null;

  const changeDir =
    changeLabel == null ? null
    : changeLabel === "no change" ? "neutral"
    : changeLabel.startsWith("+") ? "up"
    : "down";

  const changeColor =
    changeDir === "up" ? "#dc2626"
    : changeDir === "down" ? "#16a34a"
    : "#6b7280";

  const changeBadge = changeLabel
    ? `<span style="display:inline-block;margin-left:8px;font-size:12px;font-weight:700;padding:2px 8px;border-radius:12px;background:${changeColor};color:#fff">${changeLabel} vs prior week</span>`
    : "";

  const topRisksHtml = topRisks.length === 0
    ? `<p style="color:#6b7280;font-size:13px">No open critical or high-severity risks at this time.</p>`
    : `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
        <thead>
          <tr style="background:#f3f4f6;text-align:left">
            <th style="padding:8px 10px;border:1px solid #e5e7eb;color:#374151">Student</th>
            <th style="padding:8px 10px;border:1px solid #e5e7eb;color:#374151">Risk</th>
            <th style="padding:8px 10px;border:1px solid #e5e7eb;color:#374151">Action Needed</th>
          </tr>
        </thead>
        <tbody>
          ${topRisks.map((r) => `
          <tr>
            <td style="padding:8px 10px;border:1px solid #e5e7eb;vertical-align:top">
              ${escapeHtml(r.studentName)}<br>
              <span style="display:inline-block;margin-top:4px;background:${severityColor(r.severity)};color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;text-transform:uppercase">${escapeHtml(r.severity)}</span>
            </td>
            <td style="padding:8px 10px;border:1px solid #e5e7eb;vertical-align:top;color:#374151">${escapeHtml(r.title)}</td>
            <td style="padding:8px 10px;border:1px solid #e5e7eb;vertical-align:top;color:#6b7280">${r.action != null ? escapeHtml(r.action) : "—"}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;

  const subject = `Weekly Risk Exposure Summary — ${districtName} — ${weekLabel}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;font-size:14px;color:#111">
<div style="max-width:620px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">

  <div style="background:#0f766e;color:#fff;padding:20px 28px">
    <h1 style="margin:0 0 4px;font-size:18px">Weekly Risk Exposure Summary</h1>
    <p style="margin:0;font-size:12px;opacity:.85">${districtName} &mdash; ${weekLabel}</p>
  </div>

  <div style="padding:24px 28px">

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr>
        <td style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:16px 20px;text-align:center;width:33%">
          <div style="font-size:22px;font-weight:700;color:#15803d">${formatExposure(currentExposure)}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">Total Exposure${changeBadge}</div>
        </td>
        <td style="width:8px"></td>
        <td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:16px 20px;text-align:center;width:29%">
          <div style="font-size:22px;font-weight:700;color:#c2410c">${totalRisks}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">Total Risks</div>
        </td>
        <td style="width:8px"></td>
        <td style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px 20px;text-align:center;width:29%">
          <div style="font-size:22px;font-weight:700;color:#dc2626">${criticalCount}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">Critical</div>
        </td>
      </tr>
    </table>

    <h2 style="font-size:15px;color:#374151;margin:0 0 10px;border-bottom:1px solid #e5e7eb;padding-bottom:6px">Top Risks This Week</h2>
    ${topRisksHtml}

    <p style="margin:24px 0 0;font-size:13px;color:#6b7280">
      Log in to Trellis to view all risks, resolve items, and track week-over-week trends on the Cost Avoidance Dashboard.
    </p>

  </div>

  <div style="background:#f3f4f6;padding:14px 28px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb">
    <p style="margin:0">This is a weekly digest sent to district administrators. To opt out, contact your Trellis administrator or ask them to disable weekly risk summaries in district settings.</p>
    <p style="margin:6px 0 0">Trellis SPED Compliance Platform &mdash; Confidential</p>
  </div>

</div>
</body>
</html>`;

  const topRisksText = topRisks.length === 0
    ? "No open critical or high-severity risks at this time."
    : topRisks.map((r, i) =>
        `${i + 1}. [${r.severity.toUpperCase()}] ${r.studentName} — ${r.title}\n   Action: ${r.action ?? "—"}`
      ).join("\n");

  const text = [
    `WEEKLY RISK EXPOSURE SUMMARY`,
    `${districtName} — ${weekLabel}`,
    ``,
    `Total Exposure:  ${formatExposure(currentExposure)}${changeLabel ? `  (${changeLabel} vs prior week)` : ""}`,
    `Total Risks:     ${totalRisks}`,
    `Critical:        ${criticalCount}`,
    `High:            ${highCount}`,
    ``,
    `TOP RISKS THIS WEEK`,
    topRisksText,
    ``,
    `Log in to Trellis to view all risks and manage the Cost Avoidance Dashboard.`,
    ``,
    `To opt out of weekly summaries, ask your Trellis administrator to update district notification settings.`,
  ].join("\n");

  return { subject, html, text };
}

export async function buildWeeklyRiskDigestPreviewForDistrict(districtId: number): Promise<
  | { ok: true; subject: string; html: string; text: string; sample: boolean }
  | { ok: false; error: string }
> {
  const districtResult = await pool.query<{ id: number; name: string }>(
    "SELECT id, name FROM districts WHERE id = $1 LIMIT 1",
    [districtId],
  );
  const district = districtResult.rows[0];
  if (!district) return { ok: false, error: "district not found" };

  const { current, prior } = await fetchCurrentAndPriorSnapshot(districtId);
  const topRisks = await fetchTopRisksForDistrict(districtId, 3);

  let weekLabel: string;
  let currentExposure: number;
  let priorExposure: number | null;
  let totalRisks: number;
  let criticalCount: number;
  let highCount: number;
  let sample = false;

  if (current) {
    const weekStart = new Date(current.weekStart);
    weekLabel = `Week of ${weekStart.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
    currentExposure = current.totalExposure;
    priorExposure = prior?.totalExposure ?? null;
    totalRisks = current.totalRisks;
    criticalCount = current.criticalCount;
    highCount = current.highCount;
  } else {
    sample = true;
    const today = new Date();
    weekLabel = `Week of ${today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} (sample preview — no snapshot yet)`;
    currentExposure = 0;
    priorExposure = null;
    totalRisks = 0;
    criticalCount = 0;
    highCount = 0;
  }

  const { subject, html, text } = buildWeeklyRiskDigestEmail({
    districtName: district.name,
    weekLabel,
    currentExposure,
    priorExposure,
    totalRisks,
    criticalCount,
    highCount,
    topRisks,
  });

  return { ok: true, subject, html, text, sample };
}

export async function sendWeeklyRiskDigestForDistrict(districtId: number): Promise<{
  sent: boolean;
  skipped: boolean;
  reason?: string;
}> {
  const districtResult = await pool.query<{
    id: number;
    name: string;
    weekly_risk_email_enabled: boolean;
  }>(
    "SELECT id, name, weekly_risk_email_enabled FROM districts WHERE id = $1 LIMIT 1",
    [districtId],
  );

  const district = districtResult.rows[0];
  if (!district) return { sent: false, skipped: true, reason: "district not found" };

  const enabled = district.weekly_risk_email_enabled ?? true;
  if (!enabled) return { sent: false, skipped: true, reason: "weekly digest disabled for district" };

  const { current, prior } = await fetchCurrentAndPriorSnapshot(districtId);
  if (!current) return { sent: false, skipped: true, reason: "no snapshot available" };

  // Idempotency: skip if this week's digest was already successfully sent.
  if (current.weeklyDigestSentAt != null) {
    logger.info(
      { districtId, weeklyDigestSentAt: current.weeklyDigestSentAt },
      "[WeeklyDigest] Already sent for this week — skipping",
    );
    return { sent: false, skipped: true, reason: "already sent for this week" };
  }

  const recipients = await getDistrictAdminEmails(districtId);
  if (recipients.length === 0) {
    logger.warn({ districtId }, "[WeeklyDigest] No admin recipients, skipping");
    return { sent: false, skipped: true, reason: "no admin recipients" };
  }

  const topRisks = await fetchTopRisksForDistrict(districtId, 3);

  const weekStart = new Date(current.weekStart);
  const weekLabel = weekStart.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const { subject, html, text } = buildWeeklyRiskDigestEmail({
    districtName: district.name,
    weekLabel: `Week of ${weekLabel}`,
    currentExposure: current.totalExposure,
    priorExposure: prior?.totalExposure ?? null,
    totalRisks: current.totalRisks,
    criticalCount: current.criticalCount,
    highCount: current.highCount,
    topRisks,
  });

  const result = await sendAdminEmail({
    to: recipients,
    subject,
    html,
    text,
    notificationType: "WeeklyRiskDigest",
  });

  if (result.notConfigured) {
    logger.info(
      { districtId, recipients },
      "[WeeklyDigest] RESEND_API_KEY not configured — would send to admins",
    );
    return { sent: false, skipped: false, reason: "email provider not configured" };
  }

  if (!result.success) {
    logger.error({ districtId, error: result.error }, "[WeeklyDigest] Send failed");
    return { sent: false, skipped: false, reason: result.error };
  }

  // Mark this snapshot row so duplicate sends are suppressed on server restart.
  await pool.query(
    `UPDATE cost_avoidance_snapshots SET weekly_digest_sent_at = now() WHERE id = $1`,
    [current.id],
  );

  logger.info(
    { districtId, recipientCount: recipients.length, weekLabel },
    "[WeeklyDigest] Weekly risk digest sent",
  );
  return { sent: true, skipped: false };
}

export async function sendWeeklyRiskDigestsForAllDistricts(): Promise<void> {
  const districts = await db
    .select({ id: districtsTable.id })
    .from(districtsTable);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const d of districts) {
    try {
      const result = await sendWeeklyRiskDigestForDistrict(d.id);
      if (result.sent) sent++;
      else if (result.skipped) skipped++;
      else failed++;
    } catch (err) {
      logger.warn({ err, districtId: d.id }, "[WeeklyDigest] District digest failed (non-fatal)");
      failed++;
    }
  }

  logger.info(
    { sent, skipped, failed, total: districts.length },
    "[WeeklyDigest] Weekly risk digest run complete",
  );
}
