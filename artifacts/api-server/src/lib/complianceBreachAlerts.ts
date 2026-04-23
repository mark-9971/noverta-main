import { db } from "@workspace/db";
import { alertsTable, districtsTable, studentsTable, schoolsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  compute30DayWindows,
  type Restraint30DayWindow,
} from "../routes/stateReporting/restraint30Day";
import {
  computeIepTimelines,
  type IepTimelineRow,
} from "../routes/stateReporting/iepTimeline";
import { sendEmail, getAppBaseUrl } from "./email";
import { getDistrictAdminEmails } from "./billingEmail";
import type { AuthedRequest } from "../middlewares/auth";
import { logger } from "./logger";

export const RESTRAINT_BREACH_ALERT_TYPE = "restraint_30day_noncompliant";
export const IEP_TIMELINE_BREACH_ALERT_TYPE = "iep_timeline_compliance";

export interface ComplianceBreachRunResult {
  districtsScanned: number;
  restraintAlertsCreated: number;
  iepAlertsCreated: number;
  emailsSent: number;
  emailsSkippedNoRecipient: number;
}

export async function runComplianceBreachAlerts(): Promise<ComplianceBreachRunResult> {
  const districts = await db
    .select({ id: districtsTable.id, name: districtsTable.name })
    .from(districtsTable);

  let restraintAlertsCreated = 0;
  let iepAlertsCreated = 0;
  let emailsSent = 0;
  let emailsSkippedNoRecipient = 0;

  for (const district of districts) {
    const r = await runDistrictBreachAlerts(district.id, district.name);
    restraintAlertsCreated += r.restraintAlertsCreated;
    iepAlertsCreated += r.iepAlertsCreated;
    emailsSent += r.emailsSent;
    emailsSkippedNoRecipient += r.emailsSkippedNoRecipient;
  }

  logger.info(
    `[ComplianceBreachAlerts] Scanned ${districts.length} districts: ` +
      `${restraintAlertsCreated} restraint, ${iepAlertsCreated} iep, ${emailsSent} emails sent, ` +
      `${emailsSkippedNoRecipient} emails skipped (no admin on file)`,
  );

  return {
    districtsScanned: districts.length,
    restraintAlertsCreated,
    iepAlertsCreated,
    emailsSent,
    emailsSkippedNoRecipient,
  };
}

export async function runDistrictBreachAlerts(
  districtId: number,
  districtName: string,
): Promise<{
  restraintAlertsCreated: number;
  iepAlertsCreated: number;
  emailsSent: number;
  emailsSkippedNoRecipient: number;
}> {
  const fakeReq = { tenantDistrictId: districtId } as AuthedRequest;

  const restraintReport = await compute30DayWindows(fakeReq, {});
  const nonCompliantWindows = restraintReport.windows.filter(
    (w) => !w.parentNotificationCompliant,
  );

  const iepRows = await computeIepTimelines(fakeReq, { phase: "all" });
  const iepBreaches = iepRows
    .map((row) => {
      const isPl1 = row.phase === "PL1" || row.phase === "pre-consent";
      const phase = isPl1 ? row.pl1 : row.pl2;
      const breached = isPl1 ? row.hasActivePl1Breach : row.hasActivePl2Breach;
      const atRisk = phase.status === "yellow" || phase.status === "red";
      if (!breached && !atRisk) return null;
      return {
        row,
        isPl1,
        breached,
        status: breached ? ("breached" as const) : ("at_risk" as const),
      };
    })
    .filter((x): x is { row: IepTimelineRow; isPl1: boolean; breached: boolean; status: "breached" | "at_risk" } => x !== null);

  // Load existing unresolved alerts of these types in this district to dedupe.
  const existing = await db
    .select({ message: alertsTable.message })
    .from(alertsTable)
    .innerJoin(studentsTable, eq(alertsTable.studentId, studentsTable.id))
    .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .where(
      and(
        eq(alertsTable.resolved, false),
        inArray(alertsTable.type, [
          RESTRAINT_BREACH_ALERT_TYPE,
          IEP_TIMELINE_BREACH_ALERT_TYPE,
        ]),
        eq(schoolsTable.districtId, districtId),
      ),
    );

  const existingKeys = new Set<string>();
  for (const a of existing) {
    const m = a.message?.match(/\[dedupe:([^\]]+)\]/);
    if (m) existingKeys.add(m[1]);
  }

  const adminEmails = await getDistrictAdminEmails(districtId);
  const appBaseUrl = getAppBaseUrl();

  let restraintAlertsCreated = 0;
  let iepAlertsCreated = 0;
  let emailsSent = 0;
  let emailsSkippedNoRecipient = 0;

  for (const window of nonCompliantWindows) {
    const dedupeKey = `restraint:${window.studentId}:${window.windowStart}`;
    if (existingKeys.has(dedupeKey)) continue;

    const message =
      `30-day restraint window non-compliant: ${window.studentName} — ` +
      `${window.parentNotifiedCount}/${window.incidentCount} incidents have parent notification on file ` +
      `(window ${window.windowStart} → ${window.windowEnd}). [dedupe:${dedupeKey}]`;

    const [inserted] = await db
      .insert(alertsTable)
      .values({
        type: RESTRAINT_BREACH_ALERT_TYPE,
        severity: "critical",
        studentId: window.studentId,
        message,
        suggestedAction:
          "Contact the student's parent/guardian for each restraint incident in this 30-day window and document notification.",
        resolved: false,
      })
      .returning({ id: alertsTable.id });

    restraintAlertsCreated++;
    existingKeys.add(dedupeKey);

    if (adminEmails.length === 0) {
      emailsSkippedNoRecipient++;
      continue;
    }

    const built = buildRestraintBreachEmail({ window, districtName, appBaseUrl });
    for (const email of adminEmails) {
      const result = await sendEmail({
        studentId: window.studentId,
        type: "restraint_compliance_alert",
        subject: built.subject,
        bodyHtml: built.html,
        bodyText: built.text,
        toEmail: email,
        linkedAlertId: inserted?.id,
        metadata: {
          dedupeKey,
          windowStart: window.windowStart,
          windowEnd: window.windowEnd,
          incidentCount: window.incidentCount,
          parentNotifiedCount: window.parentNotifiedCount,
        },
      });
      if (result.success) emailsSent++;
    }
  }

  for (const breach of iepBreaches) {
    const { row, isPl1, status } = breach;
    const phaseStatus = isPl1 ? row.pl1 : row.pl2;
    const phaseLabel = isPl1
      ? "PL1 — Evaluation (45 school days)"
      : "PL2 — IEP Development (30 calendar days)";
    const severity = status === "breached" ? "critical" : "high";

    const dedupeKey =
      `iep-timeline:${row.studentId}:${row.referralId ?? "noref"}:` +
      `${isPl1 ? "pl1" : "pl2"}:${status}`;
    if (existingKeys.has(dedupeKey)) continue;

    const headline =
      status === "breached"
        ? `IEP timeline BREACHED: ${row.studentName}`
        : `IEP timeline at risk: ${row.studentName}`;
    const message =
      `${headline} — ${phaseLabel}, ${phaseStatus.pctUsed ?? 0}% of allowed days used ` +
      `(${phaseStatus.daysElapsed ?? 0}/${phaseStatus.daysAllowed}). [dedupe:${dedupeKey}]`;
    const suggestedAction =
      status === "breached"
        ? `Issue a corrective action letter and complete the ${
            isPl1 ? "evaluation" : "IEP"
          } immediately.`
        : `Confirm the ${
            isPl1 ? "evaluation" : "IEP team meeting"
          } is on schedule before the ${phaseStatus.daysRemaining ?? 0} remaining days are used.`;

    const [inserted] = await db
      .insert(alertsTable)
      .values({
        type: IEP_TIMELINE_BREACH_ALERT_TYPE,
        severity,
        studentId: row.studentId,
        message,
        suggestedAction,
        resolved: false,
      })
      .returning({ id: alertsTable.id });

    iepAlertsCreated++;
    existingKeys.add(dedupeKey);

    if (adminEmails.length === 0) {
      emailsSkippedNoRecipient++;
      continue;
    }

    const built = buildIepTimelineBreachEmail({
      row,
      isPl1,
      status,
      districtName,
      appBaseUrl,
    });
    for (const email of adminEmails) {
      const result = await sendEmail({
        studentId: row.studentId,
        type: "iep_timeline_compliance_alert",
        subject: built.subject,
        bodyHtml: built.html,
        bodyText: built.text,
        toEmail: email,
        linkedAlertId: inserted?.id,
        metadata: {
          dedupeKey,
          phase: isPl1 ? "PL1" : "PL2",
          status,
          pctUsed: phaseStatus.pctUsed,
          daysElapsed: phaseStatus.daysElapsed,
          daysAllowed: phaseStatus.daysAllowed,
        },
      });
      if (result.success) emailsSent++;
    }
  }

  return { restraintAlertsCreated, iepAlertsCreated, emailsSent, emailsSkippedNoRecipient };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildRestraintBreachEmail(opts: {
  window: Restraint30DayWindow;
  districtName: string;
  appBaseUrl: string | null;
}): { subject: string; html: string; text: string } {
  const { window: w, districtName, appBaseUrl } = opts;
  const studentName = escapeHtml(w.studentName);
  const schoolName = escapeHtml(w.schoolName ?? "—");
  const subject = `[Compliance] 30-Day Restraint Window Out of Compliance — ${w.studentName}`;
  const link =
    appBaseUrl ? `${appBaseUrl}/students/${w.studentId}` : null;
  const linkHtml = link
    ? `<p style="margin:20px 0 0"><a href="${link}" style="background:#dc2626;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px">Review Student Record →</a></p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family:Arial,sans-serif;font-size:14px;color:#111;background:#f9fafb;margin:0;padding:0">
<div style="max-width:640px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
<div style="background:#991b1b;color:#fff;padding:18px 24px">
<h1 style="margin:0;font-size:17px">30-Day Restraint Compliance Alert</h1>
<p style="margin:4px 0 0;font-size:11px;opacity:.85">603 CMR 46.06 — Parent/Guardian Notification Required</p>
</div>
<div style="padding:24px">
<p style="margin:0 0 12px">A 30-day restraint window for <strong>${studentName}</strong> at <strong>${schoolName}</strong> is out of compliance. Parent/guardian notification is missing for one or more incidents in this window.</p>
<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px">
<tr><td style="padding:6px 0;color:#6b7280">Window</td><td style="padding:6px 0"><strong>${w.windowStart} → ${w.windowEnd}</strong></td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Incidents in window</td><td style="padding:6px 0"><strong>${w.incidentCount}</strong> (${escapeHtml(w.restraintTypesSummary)})</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Parent notified</td><td style="padding:6px 0;color:#dc2626"><strong>${w.parentNotifiedCount} of ${w.incidentCount}</strong></td></tr>
<tr><td style="padding:6px 0;color:#6b7280">SASID</td><td style="padding:6px 0">${escapeHtml(w.externalId ?? "—")}</td></tr>
</table>
<p style="margin:16px 0 0">Required action: contact the student's parent/guardian for each incident missing notification and document the contact in Noverta.</p>
${linkHtml}
</div>
<div style="background:#f3f4f6;padding:12px 24px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb">
Sent by Noverta SPED Compliance Platform on behalf of ${escapeHtml(districtName)}.
</div>
</div></body></html>`;

  const text =
    `30-Day Restraint Compliance Alert\n\n` +
    `Student: ${w.studentName}\n` +
    `School: ${w.schoolName ?? "—"}\n` +
    `Window: ${w.windowStart} → ${w.windowEnd}\n` +
    `Incidents: ${w.incidentCount} (${w.restraintTypesSummary})\n` +
    `Parent notified: ${w.parentNotifiedCount} of ${w.incidentCount}\n\n` +
    `Required action: contact the student's parent/guardian for each incident missing notification and document in Noverta.\n` +
    (link ? `\nReview student record: ${link}\n` : "") +
    `\nSent by Noverta SPED Compliance Platform on behalf of ${districtName}.`;

  return { subject, html, text };
}

export function buildIepTimelineBreachEmail(opts: {
  row: IepTimelineRow;
  isPl1: boolean;
  status: "at_risk" | "breached";
  districtName: string;
  appBaseUrl: string | null;
}): { subject: string; html: string; text: string } {
  const { row, isPl1, status, districtName, appBaseUrl } = opts;
  const phase = isPl1 ? row.pl1 : row.pl2;
  const phaseLabel = isPl1
    ? "PL1 — Evaluation (45 school days)"
    : "PL2 — IEP Development (30 calendar days)";
  const headline = status === "breached" ? "IEP Timeline BREACHED" : "IEP Timeline At Risk";
  const subject = `[Compliance] ${headline} — ${row.studentName} (${isPl1 ? "PL1" : "PL2"})`;
  const studentName = escapeHtml(row.studentName);
  const schoolName = escapeHtml(row.schoolName ?? "—");
  const headerColor = status === "breached" ? "#991b1b" : "#b45309";

  const link = appBaseUrl ? `${appBaseUrl}/students/${row.studentId}` : null;
  const linkHtml = link
    ? `<p style="margin:20px 0 0"><a href="${link}" style="background:${headerColor};color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px">Review Student Record →</a></p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family:Arial,sans-serif;font-size:14px;color:#111;background:#f9fafb;margin:0;padding:0">
<div style="max-width:640px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
<div style="background:${headerColor};color:#fff;padding:18px 24px">
<h1 style="margin:0;font-size:17px">${headline}</h1>
<p style="margin:4px 0 0;font-size:11px;opacity:.85">603 CMR 28.05 / M.G.L. c.71B — IEP Timeline Compliance</p>
</div>
<div style="padding:24px">
<p style="margin:0 0 12px">The IEP timeline for <strong>${studentName}</strong> at <strong>${schoolName}</strong> ${
    status === "breached"
      ? "has <strong>breached</strong> the statutory deadline."
      : "has reached <strong>80% or more</strong> of the allowed days and is now at risk of breach."
  }</p>
<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px">
<tr><td style="padding:6px 0;color:#6b7280">Phase</td><td style="padding:6px 0"><strong>${phaseLabel}</strong></td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Days elapsed</td><td style="padding:6px 0"><strong>${phase.daysElapsed ?? 0} of ${phase.daysAllowed}</strong> (${phase.pctUsed ?? 0}% used)</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Days remaining</td><td style="padding:6px 0">${phase.daysRemaining ?? 0}</td></tr>
${
  isPl1
    ? `<tr><td style="padding:6px 0;color:#6b7280">Consent date</td><td style="padding:6px 0">${escapeHtml(row.consentDate ?? "Pending")}</td></tr>`
    : `<tr><td style="padding:6px 0;color:#6b7280">Evaluation completed</td><td style="padding:6px 0">${escapeHtml(row.evaluationCompletedDate ?? "—")}</td></tr>`
}
${phase.breachDate ? `<tr><td style="padding:6px 0;color:#6b7280">${status === "breached" ? "Breach date" : "Deadline"}</td><td style="padding:6px 0;color:${headerColor}"><strong>${escapeHtml(phase.breachDate)}</strong></td></tr>` : ""}
<tr><td style="padding:6px 0;color:#6b7280">SASID</td><td style="padding:6px 0">${escapeHtml(row.externalId ?? "—")}</td></tr>
</table>
<p style="margin:16px 0 0">${
    status === "breached"
      ? `Required action: issue a corrective action letter and complete the ${isPl1 ? "evaluation" : "IEP"} immediately.`
      : `Required action: confirm the ${isPl1 ? "evaluation" : "IEP team meeting"} is on schedule before the deadline is reached.`
  }</p>
${linkHtml}
</div>
<div style="background:#f3f4f6;padding:12px 24px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb">
Sent by Noverta SPED Compliance Platform on behalf of ${escapeHtml(districtName)}.
</div>
</div></body></html>`;

  const text =
    `${headline}\n\n` +
    `Student: ${row.studentName}\n` +
    `School: ${row.schoolName ?? "—"}\n` +
    `Phase: ${phaseLabel}\n` +
    `Days elapsed: ${phase.daysElapsed ?? 0} of ${phase.daysAllowed} (${phase.pctUsed ?? 0}% used)\n` +
    `Days remaining: ${phase.daysRemaining ?? 0}\n` +
    (phase.breachDate
      ? `${status === "breached" ? "Breach date" : "Deadline"}: ${phase.breachDate}\n`
      : "") +
    `\n` +
    (status === "breached"
      ? `Required action: issue a corrective action letter and complete the ${isPl1 ? "evaluation" : "IEP"} immediately.\n`
      : `Required action: confirm the ${isPl1 ? "evaluation" : "IEP team meeting"} is on schedule before the deadline.\n`) +
    (link ? `\nReview student record: ${link}\n` : "") +
    `\nSent by Noverta SPED Compliance Platform on behalf of ${districtName}.`;

  return { subject, html, text };
}
