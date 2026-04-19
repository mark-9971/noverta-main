import { db, communicationEventsTable, emailDeliveriesTable } from "@workspace/db";
import type { EmailDeliveryMessageType } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Resend } from "resend";

export interface SendReportEmailParams {
  toEmails: string[];
  reportLabel: string;
  frequency: string;
  recordCount: number;
  format: "csv" | "pdf";
  csvContent?: string;
  pdfBuffer?: Buffer;
  fileName: string;
}

export async function sendReportEmail(params: SendReportEmailParams): Promise<{ success: boolean; error?: string }> {
  const { toEmails, reportLabel, frequency, recordCount, format, csvContent, pdfBuffer, fileName } = params;
  const resend = getResendClient();
  if (!resend) {
    console.log(`[ScheduledReports] Email not configured — would send ${reportLabel} (${format.toUpperCase()}) to ${toEmails.join(", ")}`);
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const subject = `Trellis Scheduled Report: ${reportLabel} — ${dateStr}`;
  const formatLabel = format === "pdf" ? "PDF" : "CSV";
  const formatNote = format === "pdf"
    ? "The report is attached as a PDF file."
    : "The report is attached as a CSV file. Log in to Trellis to generate PDF versions or view export history.";
  const emailHtml = `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
<div style="background:#059669;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
<h2 style="margin:0;font-size:18px">Trellis — ${reportLabel}</h2>
</div>
<div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
<p>Your scheduled ${frequency} <strong>${reportLabel}</strong> report has been generated.</p>
<ul style="color:#374151">
<li><strong>Records:</strong> ${recordCount}</li>
<li><strong>Generated:</strong> ${dateStr}</li>
<li><strong>Format:</strong> ${formatLabel}</li>
</ul>
<p style="color:#6b7280;font-size:13px">${formatNote}</p>
</div>
<div style="text-align:center;padding:12px;color:#9ca3af;font-size:11px">Trellis SPED Compliance Platform — Confidential</div>
</div>`;

  try {
    let attachmentContent: Buffer;
    if (format === "pdf" && pdfBuffer) {
      attachmentContent = pdfBuffer;
    } else if (csvContent) {
      attachmentContent = Buffer.from(csvContent, "utf-8");
    } else {
      return { success: false, error: "No attachment content provided" };
    }

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: toEmails,
      subject,
      html: emailHtml,
      attachments: [{ filename: fileName, content: attachmentContent }],
    });
    if (result.error) {
      console.error(`[ScheduledReports] Email send failed:`, result.error);
      return { success: false, error: result.error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ScheduledReports] Email send error:`, msg);
    return { success: false, error: msg };
  }
}

export type EmailType =
  | "incident_parent_notification"
  | "written_report"
  | "verbal_notification_confirmation"
  | "missed_service_alert"
  | "overdue_followup_reminder"
  | "incomplete_transition_reminder"
  | "overdue_evaluation_reminder"
  | "overdue_session_log_reminder"
  | "progress_report"
  | "cost_avoidance_risk_alert"
  | "cost_avoidance_digest"
  | "restraint_compliance_alert"
  | "iep_timeline_compliance_alert"
  | "general";

export interface SendEmailParams {
  studentId: number;
  type: EmailType;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  toEmail: string;
  toName?: string;
  guardianId?: number;
  staffId?: number;
  linkedIncidentId?: number;
  linkedAlertId?: number;
  linkedContactId?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Public delivery-state values returned to API consumers and persisted in
 * `communication_events.status`. Match the lifecycle documented on the
 * schema. `sent` is kept as a read-side alias for legacy rows.
 */
export type EmailStatus =
  | "queued"
  | "accepted"
  | "delivered"
  | "bounced"
  | "complained"
  | "failed"
  | "not_configured"
  | "sent"; // legacy alias for `accepted`; never written by new code

export interface SendEmailResult {
  success: boolean;
  /** Lifecycle state at the moment sendEmail returned. Synchronous calls
   *  cannot reach `delivered` — that requires a provider webhook. */
  status: EmailStatus;
  communicationEventId: number;
  providerMessageId?: string;
  error?: string;
  notConfigured?: boolean;
}

const FROM_EMAIL = "Trellis SPED <hello@noreply.trellis.education>";
const FROM_EMAIL_FALLBACK = "hello@noreply.trellis.education";

/**
 * Resolve the base URL for deep links into the app from emails.
 * Prefers APP_BASE_URL; falls back to REPLIT_DEV_DOMAIN; returns null otherwise.
 */
export function getAppBaseUrl(): string | null {
  const raw =
    process.env.APP_BASE_URL ??
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
  return raw ? raw.replace(/\/+$/, "") : null;
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = [600, 1200];

function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTransientError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes("network") ||
    lower.includes("timeout") ||
    lower.includes("econnreset") ||
    lower.includes("enotfound") ||
    lower.includes("socket") ||
    lower.includes("rate_limit") ||
    lower.includes("429") ||
    lower.includes("503") ||
    lower.includes("502") ||
    lower.includes("500")
  );
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const {
    studentId, type, subject, bodyHtml, bodyText, toEmail, toName,
    guardianId, staffId, linkedIncidentId, linkedAlertId, linkedContactId, metadata,
  } = params;

  const resend = getResendClient();
  const now = new Date();

  if (!resend) {
    const [event] = await db.insert(communicationEventsTable).values({
      studentId,
      guardianId: guardianId ?? null,
      staffId: staffId ?? null,
      channel: "email",
      status: "not_configured",
      type,
      subject,
      bodyText: bodyText ?? null,
      toEmail,
      toName: toName ?? null,
      fromEmail: FROM_EMAIL_FALLBACK,
      linkedIncidentId: linkedIncidentId ?? null,
      linkedAlertId: linkedAlertId ?? null,
      linkedContactId: linkedContactId ?? null,
      metadata: { ...(metadata ?? {}), warning: "RESEND_API_KEY not configured — email not sent" } as Record<string, unknown>,
      sentAt: null,
      failedAt: now,
      failedReason: "RESEND_API_KEY not configured",
    }).returning();
    return { success: false, status: "not_configured", communicationEventId: event.id, notConfigured: true, error: "Email provider not configured — add RESEND_API_KEY to enable real delivery" };
  }

  const [pending] = await db.insert(communicationEventsTable).values({
    studentId,
    guardianId: guardianId ?? null,
    staffId: staffId ?? null,
    channel: "email",
    status: "queued",
    type,
    subject,
    bodyText: bodyText ?? null,
    toEmail,
    toName: toName ?? null,
    fromEmail: FROM_EMAIL_FALLBACK,
    linkedIncidentId: linkedIncidentId ?? null,
    linkedAlertId: linkedAlertId ?? null,
    linkedContactId: linkedContactId ?? null,
    metadata: metadata ?? null,
  }).returning();

  let lastError = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAY_MS[attempt - 1] ?? 1200);
    }
    try {
      const result = await resend.emails.send({
        from: FROM_EMAIL,
        to: toName ? `${toName} <${toEmail}>` : toEmail,
        subject,
        html: bodyHtml,
        text: bodyText,
      });

      if (result.error) {
        const errMsg = result.error.message ?? "Resend API error";
        if (attempt < MAX_RETRIES && isTransientError(errMsg)) {
          lastError = errMsg;
          continue;
        }
        const failNow = new Date();
        await db.update(communicationEventsTable)
          .set({ status: "failed", failedAt: failNow, failedReason: `${errMsg} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`, updatedAt: failNow })
          .where(eq(communicationEventsTable.id, pending.id));
        return { success: false, status: "failed", communicationEventId: pending.id, error: errMsg };
      }

      // Provider accepted the request. We are NOT yet "delivered" — that
      // requires the email.delivered webhook. Set both `acceptedAt` (the
      // honest term) and `sentAt` (legacy column kept in sync) so existing
      // reports continue to work while the new UI can prefer `acceptedAt`.
      const acceptedNow = new Date();
      await db.update(communicationEventsTable)
        .set({
          status: "accepted",
          providerMessageId: result.data?.id ?? null,
          acceptedAt: acceptedNow,
          sentAt: acceptedNow,
          updatedAt: acceptedNow,
        })
        .where(eq(communicationEventsTable.id, pending.id));
      return { success: true, status: "accepted", communicationEventId: pending.id, providerMessageId: result.data?.id };

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES && isTransientError(msg)) {
        lastError = msg;
        continue;
      }
      const failNow = new Date();
      await db.update(communicationEventsTable)
        .set({ status: "failed", failedAt: failNow, failedReason: `${msg} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`, updatedAt: failNow })
        .where(eq(communicationEventsTable.id, pending.id));
      return { success: false, status: "failed", communicationEventId: pending.id, error: msg };
    }
  }

  const failNow = new Date();
  await db.update(communicationEventsTable)
    .set({ status: "failed", failedAt: failNow, failedReason: `Max retries exceeded: ${lastError}`, updatedAt: failNow })
    .where(eq(communicationEventsTable.id, pending.id));
  return { success: false, status: "failed", communicationEventId: pending.id, error: `Delivery failed after ${MAX_RETRIES + 1} attempts: ${lastError}` };
}

export interface SendAdminEmailParams {
  /** One or more recipient email addresses. */
  to: string[];
  subject: string;
  html: string;
  text?: string;
  /** Optional tag used in log lines to identify the notification type. */
  notificationType?: string;
  /** Optional file attachments forwarded to the email provider. */
  attachments?: { filename: string; content: Buffer }[];
}

export interface SendAdminEmailResult {
  success: boolean;
  /** True when RESEND_API_KEY is absent — email was intentionally skipped. */
  notConfigured?: boolean;
  error?: string;
}

/**
 * Send an operational admin email (e.g. weekly digest) to one or more recipients.
 *
 * This function reuses the shared Resend client, retry logic, and transient-error
 * detection from sendEmail but does NOT write a communication_events row — admin
 * digest emails are operational, not student-record events (same policy as billingEmail.ts).
 */
export async function sendAdminEmail(params: SendAdminEmailParams): Promise<SendAdminEmailResult> {
  const { to, subject, html, text, notificationType = "admin_email", attachments } = params;

  const resend = getResendClient();
  if (!resend) {
    console.log(`[${notificationType}] RESEND_API_KEY not configured — would send to ${to.join(", ")}`);
    return { success: false, notConfigured: true };
  }

  let lastError = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAY_MS[attempt - 1] ?? 1200);
    }
    try {
      const result = await resend.emails.send({ from: FROM_EMAIL, to, subject, html, text, attachments });
      if (result.error) {
        const errMsg = result.error.message ?? "Resend API error";
        if (attempt < MAX_RETRIES && isTransientError(errMsg)) { lastError = errMsg; continue; }
        console.error(`[${notificationType}] Send failed (attempt ${attempt + 1}):`, errMsg);
        return { success: false, error: errMsg };
      }
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES && isTransientError(msg)) { lastError = msg; continue; }
      console.error(`[${notificationType}] Send threw (attempt ${attempt + 1}):`, msg);
      return { success: false, error: msg };
    }
  }

  return { success: false, error: `Max retries exceeded: ${lastError}` };
}

export function buildIncidentNotificationEmail(opts: {
  studentName: string;
  guardianName: string;
  incidentDate: string;
  incidentType: string;
  schoolName: string;
  notificationDraft: string;
  senderName: string;
  senderTitle: string;
}): { subject: string; html: string; text: string } {
  const { studentName, guardianName, incidentDate, incidentType, schoolName, notificationDraft, senderName, senderTitle } = opts;
  const typeLabel = incidentType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
  const subject = `Required Parent Notification — Protective Measure Used: ${studentName} on ${incidentDate}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 14px; color: #111; margin: 0; padding: 0; background: #f9fafb; }
    .wrapper { max-width: 640px; margin: 24px auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
    .header { background: #065f46; color: #fff; padding: 20px 28px; }
    .header h1 { font-size: 18px; margin: 0 0 4px; }
    .header p { margin: 0; font-size: 12px; opacity: 0.8; }
    .body { padding: 24px 28px; }
    .notice { background: #fef9c3; border: 1px solid #fde68a; border-radius: 6px; padding: 12px 16px; font-size: 13px; margin-bottom: 20px; }
    .content { white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: #374151; }
    .footer { background: #f3f4f6; padding: 16px 28px; font-size: 11px; color: #6b7280; border-top: 1px solid #e5e7eb; }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>Required Parent/Guardian Notification</h1>
    <p>Pursuant to 603 CMR 46.00 — Massachusetts Protective Measures</p>
  </div>
  <div class="body">
    <div class="notice">
      <strong>Notice to Parent/Guardian of ${studentName}</strong><br>
      This notification is required under Massachusetts 603 CMR 46.00 regarding the use of a ${typeLabel} on ${incidentDate} at ${schoolName}.
    </div>
    <div class="content">${notificationDraft.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</div>
    <hr class="divider">
    <p style="font-size:13px;color:#374151">Sincerely,<br><strong>${senderName}</strong><br>${senderTitle}</p>
  </div>
  <div class="footer">
    <p>This notification was sent electronically pursuant to 603 CMR 46.04. To exercise your rights as a parent/guardian, please contact the school's Special Education department.</p>
    <p>Sent by Trellis SPED Compliance Platform on behalf of ${schoolName}.</p>
  </div>
</div>
</body>
</html>`;

  const text = `Required Parent/Guardian Notification\nPursuant to 603 CMR 46.00\n\nDear ${guardianName},\n\n${notificationDraft}\n\nSincerely,\n${senderName}\n${senderTitle}\n\nThis notification was sent electronically pursuant to 603 CMR 46.04.`;

  return { subject, html, text };
}

export function buildMissedServiceAlertEmail(opts: {
  guardianName: string;
  studentName: string;
  serviceType: string;
  missedMinutes: number;
  requiredMinutes: number;
  schoolName: string;
}): { subject: string; html: string; text: string } {
  const { guardianName, studentName, serviceType, missedMinutes, requiredMinutes, schoolName } = opts;
  const subject = `Service Delivery Notification — ${studentName}: ${serviceType}`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${subject}</title>
<style>body{font-family:Arial,sans-serif;font-size:14px;color:#111;background:#f9fafb;margin:0;padding:0}.wrapper{max-width:600px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}.header{background:#065f46;color:#fff;padding:20px 24px}.body{padding:24px}.footer{background:#f3f4f6;padding:12px 24px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb}</style></head>
<body><div class="wrapper">
<div class="header"><h1 style="margin:0;font-size:17px">Service Delivery Notification</h1></div>
<div class="body">
<p>Dear ${guardianName},</p>
<p>We are writing to inform you that <strong>${studentName}</strong> has received fewer minutes of <strong>${serviceType}</strong> than mandated on their IEP for this period.</p>
<ul><li>Required minutes (this period): <strong>${requiredMinutes} minutes</strong></li>
<li>Missed minutes: <strong>${missedMinutes} minutes</strong></li></ul>
<p>Under Massachusetts 603 CMR 28.00, you have the right to be notified of any interruption in your child's special education services. We are working to address this shortfall and will provide a plan for making up missed services.</p>
<p>Please contact us if you have questions or would like to discuss this further.</p>
</div>
<div class="footer"><p>Sent by Trellis SPED Compliance Platform on behalf of ${schoolName}.</p></div>
</div></body></html>`;
  const text = `Dear ${guardianName},\n\nThis is to notify you that ${studentName} has missed ${missedMinutes} minutes of ${serviceType} (required: ${requiredMinutes} minutes) this period. Please contact the school if you have questions.\n\n${schoolName}`;
  return { subject, html, text };
}

export function buildOverdueFollowupEmail(opts: {
  guardianName: string;
  studentName: string;
  originalSubject: string;
  originalContactDate: string;
  followUpDate: string;
  staffName: string;
  schoolName: string;
}): { subject: string; html: string; text: string } {
  const { guardianName, studentName, originalSubject, originalContactDate, followUpDate, staffName, schoolName } = opts;
  const subject = `Follow-Up Reminder — ${studentName}: ${originalSubject}`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${subject}</title>
<style>body{font-family:Arial,sans-serif;font-size:14px;color:#111;background:#f9fafb;margin:0;padding:0}.wrapper{max-width:600px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}.header{background:#065f46;color:#fff;padding:20px 24px}.body{padding:24px}.footer{background:#f3f4f6;padding:12px 24px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb}</style></head>
<body><div class="wrapper">
<div class="header"><h1 style="margin:0;font-size:17px">Follow-Up Reminder</h1></div>
<div class="body">
<p>Dear ${guardianName},</p>
<p>This is a follow-up regarding our previous contact on <strong>${originalContactDate}</strong> about: <em>${originalSubject}</em>.</p>
<p>A follow-up was scheduled for <strong>${followUpDate}</strong>. Please contact <strong>${staffName}</strong> at your earliest convenience to discuss next steps for <strong>${studentName}</strong>.</p>
</div>
<div class="footer"><p>Sent by Trellis SPED Compliance Platform on behalf of ${schoolName}.</p></div>
</div></body></html>`;
  const text = `Dear ${guardianName},\n\nThis is a follow-up regarding our previous contact on ${originalContactDate} about: ${originalSubject}.\n\nA follow-up was scheduled for ${followUpDate}. Please contact ${staffName} to discuss next steps for ${studentName}.\n\n${schoolName}`;
  return { subject, html, text };
}

export function buildIncompleteTransitionEmail(opts: {
  coordinatorName: string;
  studentName: string;
  planDate: string;
  schoolName: string;
  studentId?: number;
  appBaseUrl?: string;
}): { subject: string; html: string; text: string } {
  const { coordinatorName, studentName, planDate, schoolName, studentId, appBaseUrl } = opts;
  const subject = `Action Required — Transition Plan Incomplete: ${studentName}`;
  const studentLink = appBaseUrl && studentId != null ? `${appBaseUrl}/students/${studentId}` : null;
  const linkHtml = studentLink
    ? `<p style="margin-top:20px"><a href="${studentLink}" style="background:#1e3a5f;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;font-size:14px">View Student Record →</a></p>`
    : "";
  const linkText = studentLink ? `\n\nView student record: ${studentLink}` : "";
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${subject}</title>
<style>body{font-family:Arial,sans-serif;font-size:14px;color:#111;background:#f9fafb;margin:0;padding:0}.wrapper{max-width:600px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}.header{background:#1e3a5f;color:#fff;padding:20px 24px}.body{padding:24px}.notice{background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:12px 16px;font-size:13px;margin-bottom:16px}.footer{background:#f3f4f6;padding:12px 24px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb}</style></head>
<body><div class="wrapper">
<div class="header"><h1 style="margin:0;font-size:17px">Transition Plan Reminder</h1><p style="margin:4px 0 0;font-size:11px;opacity:.8">603 CMR 28.05 — Massachusetts Transition Requirements</p></div>
<div class="body">
<div class="notice">A transition plan for <strong>${studentName}</strong> was created on <strong>${planDate}</strong> and is currently in <em>draft</em> status.</div>
<p>Dear ${coordinatorName},</p>
<p>Please review and complete the transition plan for <strong>${studentName}</strong> in Trellis. Under 603 CMR 28.05, transition plans must be completed and included in the IEP for students age 14 or older.</p>
<p>Key items to complete:</p>
<ul>
  <li>Graduation pathway and expected graduation date</li>
  <li>Post-secondary vision and transition goals</li>
  <li>Course of study aligned to post-secondary goals</li>
  <li>Age of majority notification (if applicable)</li>
</ul>
${linkHtml}
</div>
<div class="footer"><p>Sent by Trellis SPED Compliance Platform on behalf of ${schoolName}.</p></div>
</div></body></html>`;
  const text = `TRANSITION PLAN INCOMPLETE\n\nDear ${coordinatorName},\n\nA transition plan for ${studentName} (plan date: ${planDate}) is in draft status and requires completion.\n\nPlease complete the plan including graduation pathway, transition goals, and course of study.${linkText}\n\n${schoolName}`;
  return { subject, html, text };
}

export function buildOverdueEvaluationEmail(opts: {
  staffName: string;
  studentName: string;
  evaluationType: string;
  dueDate: string;
  daysOverdue: number;
  schoolName: string;
  studentId?: number;
  appBaseUrl?: string;
}): { subject: string; html: string; text: string } {
  const { staffName, studentName, evaluationType, dueDate, daysOverdue, schoolName, studentId, appBaseUrl } = opts;
  const typeLabel = evaluationType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
  const overduePart = daysOverdue >= 0 ? `${daysOverdue} day(s) overdue` : `due on ${dueDate}`;
  const subject = `Action Required — ${typeLabel} Evaluation Overdue: ${studentName}`;
  const studentLink = appBaseUrl && studentId != null ? `${appBaseUrl}/students/${studentId}` : null;
  const linkHtml = studentLink
    ? `<p style="margin-top:20px"><a href="${studentLink}" style="background:#7f1d1d;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;font-size:14px">View Student Record →</a></p>`
    : "";
  const linkText = studentLink ? `\n\nView student record: ${studentLink}` : "";
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${subject}</title>
<style>body{font-family:Arial,sans-serif;font-size:14px;color:#111;background:#f9fafb;margin:0;padding:0}.wrapper{max-width:600px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}.header{background:#7f1d1d;color:#fff;padding:20px 24px}.body{padding:24px}.alert{background:#fee2e2;border:1px solid #fca5a5;border-radius:6px;padding:12px 16px;font-size:13px;margin-bottom:16px}.footer{background:#f3f4f6;padding:12px 24px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb}</style></head>
<body><div class="wrapper">
<div class="header"><h1 style="margin:0;font-size:17px">Evaluation Overdue Alert</h1><p style="margin:4px 0 0;font-size:11px;opacity:.8">603 CMR 28.04 — Massachusetts Timeline Compliance</p></div>
<div class="body">
<div class="alert"><strong>Immediate Action Required:</strong> The ${typeLabel} evaluation for <strong>${studentName}</strong> is ${overduePart}.</div>
<p>Dear ${staffName},</p>
<p>This is an automated compliance alert. The evaluation listed below has reached or exceeded its required due date under 603 CMR 28.04:</p>
<ul>
  <li>Student: <strong>${studentName}</strong></li>
  <li>Evaluation type: <strong>${typeLabel}</strong></li>
  <li>Due date: <strong>${dueDate}</strong></li>
  <li>Status: <strong>${overduePart}</strong></li>
</ul>
<p>Please take immediate action to complete this evaluation or document the reason for the delay in Trellis.</p>
${linkHtml}
</div>
<div class="footer"><p>Sent by Trellis SPED Compliance Platform on behalf of ${schoolName}.</p></div>
</div></body></html>`;
  const text = `EVALUATION OVERDUE ALERT\n\nDear ${staffName},\n\nThe ${typeLabel} evaluation for ${studentName} is ${overduePart}.\n\nDue date: ${dueDate}\n\nPlease complete this evaluation or document the reason for the delay.${linkText}\n\n${schoolName}`;
  return { subject, html, text };
}

export function buildCostAvoidanceRiskEmail(opts: {
  staffName: string;
  studentName: string;
  studentId: number;
  riskTitle: string;
  riskDescription: string;
  daysRemaining: number;
  estimatedExposure: number | null;
  exposureBasis: string;
  actionNeeded: string;
  category: string;
  appBaseUrl?: string;
}): { subject: string; html: string; text: string } {
  const {
    staffName, studentName, studentId, riskTitle, riskDescription,
    daysRemaining, estimatedExposure, exposureBasis, actionNeeded,
    category, appBaseUrl,
  } = opts;

  const categoryLabel = category === "evaluation_deadline"
    ? "Evaluation Deadline"
    : category === "iep_annual_review"
    ? "IEP Annual Review"
    : "Service Shortfall";

  const overdue = daysRemaining < 0;
  const absDays = Math.abs(daysRemaining);
  const daysLabel = overdue
    ? `${absDays} day${absDays !== 1 ? "s" : ""} overdue`
    : daysRemaining === 0
    ? "Due today"
    : `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining`;

  const exposureRow = estimatedExposure != null
    ? `<li><strong>Estimated exposure:</strong> $${estimatedExposure.toLocaleString()}</li>`
    : `<li><strong>Risk basis:</strong> ${exposureBasis}</li>`;

  const studentLink = appBaseUrl
    ? `${appBaseUrl}/students/${studentId}`
    : null;
  const linkHtml = studentLink
    ? `<p style="margin-top:20px"><a href="${studentLink}" style="background:#dc2626;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;font-size:14px">View Student Record →</a></p>`
    : "";
  const linkText = studentLink ? `\nView student record: ${studentLink}\n` : "";

  const subject = `[Critical Risk] ${riskTitle} — ${studentName}`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${subject}</title>
<style>body{font-family:Arial,sans-serif;font-size:14px;color:#111;background:#f9fafb;margin:0;padding:0}.wrapper{max-width:600px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}.header{background:#7f1d1d;color:#fff;padding:20px 24px}.body{padding:24px}.alert{background:#fee2e2;border:1px solid #fca5a5;border-radius:6px;padding:14px 18px;margin-bottom:20px}.badge{display:inline-block;background:#dc2626;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:.5px;margin-bottom:8px}.footer{background:#f3f4f6;padding:12px 24px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb}</style></head>
<body><div class="wrapper">
<div class="header">
  <h1 style="margin:0;font-size:17px">Critical Cost Avoidance Risk</h1>
  <p style="margin:4px 0 0;font-size:11px;opacity:.8">Trellis SPED Compliance — Automated Risk Alert</p>
</div>
<div class="body">
<div class="alert">
  <span class="badge">CRITICAL</span>
  <p style="margin:0;font-size:15px;font-weight:600">${riskTitle}</p>
  <p style="margin:6px 0 0;color:#7f1d1d;font-size:13px">${categoryLabel} · ${daysLabel}</p>
</div>
<p>Dear ${staffName},</p>
<p>A critical compliance risk has been identified for one of your students that requires immediate attention:</p>
<ul>
  <li><strong>Student:</strong> ${studentName}</li>
  <li><strong>Risk type:</strong> ${categoryLabel}</li>
  <li><strong>Status:</strong> ${daysLabel}</li>
  ${exposureRow}
</ul>
<p style="background:#fef9c3;border:1px solid #fcd34d;border-radius:6px;padding:12px 16px;font-size:13px"><strong>Description:</strong> ${riskDescription}</p>
<p style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:12px 16px;font-size:13px"><strong>Action needed:</strong> ${actionNeeded}</p>
${linkHtml}
</div>
<div class="footer"><p>This is an automated alert from Trellis SPED Compliance Platform. Risk alerts are rate-limited to one email per item per 7 days. Manage alert preferences in Trellis Settings.</p></div>
</div></body></html>`;

  const text = `CRITICAL COST AVOIDANCE RISK ALERT\n\nDear ${staffName},\n\nA critical compliance risk has been identified:\n\nStudent: ${studentName}\nRisk: ${riskTitle}\nCategory: ${categoryLabel}\nStatus: ${daysLabel}\n${estimatedExposure != null ? `Estimated exposure: $${estimatedExposure.toLocaleString()}` : `Risk basis: ${exposureBasis}`}\n\nDescription: ${riskDescription}\n\nAction needed: ${actionNeeded}\n${linkText}\nThis is an automated alert from Trellis SPED Compliance Platform.`;

  return { subject, html, text };
}

export interface DigestRiskItem {
  studentName: string;
  studentId: number;
  riskTitle: string;
  category: string;
  daysRemaining: number;
  estimatedExposure: number | null;
  exposureBasis: string;
  actionNeeded: string;
}

export function buildCostAvoidanceDigestEmail(opts: {
  staffName: string;
  risks: DigestRiskItem[];
  digestDate: string;
  appBaseUrl?: string;
}): { subject: string; html: string; text: string } {
  const { staffName, risks, digestDate, appBaseUrl } = opts;
  const count = risks.length;
  const subject = `[Daily Digest] ${count} Critical Risk${count !== 1 ? "s" : ""} Require Your Attention — ${digestDate}`;

  const categoryLabel = (cat: string) =>
    cat === "evaluation_deadline" ? "Evaluation Deadline"
    : cat === "iep_annual_review" ? "IEP Annual Review"
    : "Service Shortfall";

  const daysLabel = (days: number) => {
    if (days < 0) {
      const abs = Math.abs(days);
      return `${abs} day${abs !== 1 ? "s" : ""} overdue`;
    }
    if (days === 0) return "Due today";
    return `${days} day${days !== 1 ? "s" : ""} remaining`;
  };

  const riskRows = risks.map((r, i) => {
    const studentLink = appBaseUrl ? `${appBaseUrl}/students/${r.studentId}` : null;
    const nameHtml = studentLink
      ? `<a href="${studentLink}" style="color:#1d4ed8;text-decoration:none;font-weight:600">${r.studentName}</a>`
      : `<strong>${r.studentName}</strong>`;
    const exposureText = r.estimatedExposure != null
      ? `$${r.estimatedExposure.toLocaleString()} est. exposure`
      : r.exposureBasis;
    return `<tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"}">
  <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6">${nameHtml}</td>
  <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:13px">${r.riskTitle}</td>
  <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px">${categoryLabel(r.category)}</td>
  <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:${r.daysRemaining < 0 ? "#b91c1c" : "#92400e"};font-size:12px;font-weight:600">${daysLabel(r.daysRemaining)}</td>
  <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:12px">${exposureText}</td>
</tr>`;
  }).join("");

  const textRows = risks.map((r, i) =>
    `${i + 1}. ${r.studentName}\n   Risk: ${r.riskTitle}\n   Category: ${categoryLabel(r.category)}\n   Status: ${daysLabel(r.daysRemaining)}\n   ${r.estimatedExposure != null ? `Estimated exposure: $${r.estimatedExposure.toLocaleString()}` : r.exposureBasis}\n   Action: ${r.actionNeeded}`
  ).join("\n\n");

  const dashboardLink = appBaseUrl
    ? `<p style="margin-top:20px"><a href="${appBaseUrl}/alerts" style="background:#dc2626;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;font-size:14px">View All Alerts in Trellis →</a></p>`
    : "";

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${subject}</title>
<style>body{font-family:Arial,sans-serif;font-size:14px;color:#111;background:#f9fafb;margin:0;padding:0}.wrapper{max-width:700px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}.header{background:#7f1d1d;color:#fff;padding:20px 24px}.body{padding:24px}.footer{background:#f3f4f6;padding:12px 24px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#f3f4f6;text-align:left;padding:8px 12px;font-size:12px;font-weight:600;color:#374151;border-bottom:2px solid #e5e7eb}</style></head>
<body><div class="wrapper">
<div class="header">
  <h1 style="margin:0;font-size:17px">Daily Critical Risk Digest — ${digestDate}</h1>
  <p style="margin:4px 0 0;font-size:11px;opacity:.8">Trellis SPED Compliance — ${count} item${count !== 1 ? "s" : ""} require your attention</p>
</div>
<div class="body">
<p>Hi ${staffName},</p>
<p>The following <strong>${count} critical compliance risk${count !== 1 ? "s" : ""}</strong> across your students require immediate attention today (${digestDate}):</p>
<table>
  <thead><tr>
    <th>Student</th>
    <th>Risk</th>
    <th>Category</th>
    <th>Status</th>
    <th>Exposure / Basis</th>
  </tr></thead>
  <tbody>${riskRows}</tbody>
</table>
${dashboardLink}
<p style="margin-top:16px;font-size:12px;color:#6b7280">This digest replaces individual alerts. You will receive one digest per day when multiple critical risks are active for your students.</p>
</div>
<div class="footer"><p>Sent by Trellis SPED Compliance Platform. Manage alert preferences in Trellis Settings.</p></div>
</div></body></html>`;

  const text = `DAILY CRITICAL RISK DIGEST — ${digestDate}\n\nHi ${staffName},\n\n${count} critical compliance risk${count !== 1 ? "s" : ""} require your attention:\n\n${textRows}\n\nLog in to Trellis to take action. This digest replaces individual per-alert emails.\n\nTrellis SPED Compliance Platform`;

  return { subject, html, text };
}

export function buildOverdueSessionLogEmail(opts: {
  staffName: string;
  missingLogs: { studentName: string; date: string; serviceTypeName?: string | null; studentId?: number }[];
  schoolName?: string;
  appBaseUrl?: string;
}): { subject: string; html: string; text: string } {
  const { staffName, missingLogs, schoolName, appBaseUrl } = opts;
  const count = missingLogs.length;
  const subject = `Reminder: ${count} session log${count !== 1 ? "s" : ""} need${count === 1 ? "s" : ""} to be completed`;

  const rows = missingLogs.map(m => {
    const link = appBaseUrl && m.studentId != null ? `${appBaseUrl}/students/${m.studentId}` : null;
    const nameCell = link
      ? `<a href="${link}" style="color:#1d4ed8;text-decoration:none;font-weight:600">${m.studentName}</a>`
      : m.studentName;
    return `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:600">${nameCell}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280">${m.date}${m.serviceTypeName ? ` · ${m.serviceTypeName}` : ""}</td>
  </tr>`;
  }).join("");

  const textRows = missingLogs.map(m => {
    const link = appBaseUrl && m.studentId != null ? ` — ${appBaseUrl}/students/${m.studentId}` : "";
    return `  • ${m.studentName} — ${m.date}${m.serviceTypeName ? ` (${m.serviceTypeName})` : ""}${link}`;
  }).join("\n");

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${subject}</title>
<style>body{font-family:Arial,sans-serif;font-size:14px;color:#111;background:#f9fafb;margin:0;padding:0}.wrapper{max-width:600px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}.header{background:#b45309;color:#fff;padding:20px 24px}.body{padding:24px}.alert{background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:12px 16px;font-size:13px;margin-bottom:16px}.footer{background:#f3f4f6;padding:12px 24px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb}table{width:100%;border-collapse:collapse;margin-top:8px}</style></head>
<body><div class="wrapper">
<div class="header"><h1 style="margin:0;font-size:17px">Session Logs Pending</h1></div>
<div class="body">
<p>Hi ${staffName},</p>
<div class="alert"><strong>${count}</strong> scheduled session${count !== 1 ? "s" : ""} from the past week ${count === 1 ? "is" : "are"} missing a log entry. Please log ${count === 1 ? "it" : "them"} or mark as missed with a reason.</div>
<table>${rows}</table>
<p style="margin-top:20px">Open Trellis to log these sessions. Sessions logged within the same school week count toward compliance — older entries may flag your students as out of compliance.</p>
</div>
<div class="footer"><p>Sent by Trellis SPED Compliance Platform${schoolName ? ` — ${schoolName}` : ""}.</p></div>
</div></body></html>`;
  const text = `Hi ${staffName},\n\n${count} scheduled session${count !== 1 ? "s" : ""} from the past week ${count === 1 ? "is" : "are"} missing a log entry:\n\n${textRows}\n\nPlease log them or mark as missed in Trellis.${schoolName ? `\n\n${schoolName}` : ""}`;
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Parent-facing email: signature requests, share links, IEP meeting invitations
// These are tracked in `email_deliveries` (not `communication_events`).
// ---------------------------------------------------------------------------

export interface SendParentFacingEmailParams {
  messageType: EmailDeliveryMessageType;
  toEmail: string;
  toName?: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  signatureRequestId?: number;
  shareLinkId?: number;
  iepMeetingId?: number;
}

export interface SendParentFacingEmailResult {
  success: boolean;
  emailDeliveryId: number;
  providerMessageId?: string;
  status: "accepted" | "not_configured" | "failed";
  error?: string;
}

export async function sendParentFacingEmail(
  params: SendParentFacingEmailParams,
): Promise<SendParentFacingEmailResult> {
  const { messageType, toEmail, toName, subject, bodyHtml, bodyText, signatureRequestId, shareLinkId, iepMeetingId } = params;
  const resend = getResendClient();
  const now = new Date();

  if (!resend) {
    console.warn(`[ParentEmail:${messageType}] RESEND_API_KEY not configured — email not sent to ${toEmail}`);
    const [row] = await db.insert(emailDeliveriesTable).values({
      messageType,
      recipientEmail: toEmail,
      recipientName: toName ?? null,
      subject,
      status: "not_configured",
      signatureRequestId: signatureRequestId ?? null,
      shareLinkId: shareLinkId ?? null,
      iepMeetingId: iepMeetingId ?? null,
      attemptedAt: now,
      failedAt: now,
      failedReason: "RESEND_API_KEY not configured",
    }).returning();
    return { success: false, emailDeliveryId: row.id, status: "not_configured", error: "Email provider not configured" };
  }

  const [pending] = await db.insert(emailDeliveriesTable).values({
    messageType,
    recipientEmail: toEmail,
    recipientName: toName ?? null,
    subject,
    status: "queued",
    signatureRequestId: signatureRequestId ?? null,
    shareLinkId: shareLinkId ?? null,
    iepMeetingId: iepMeetingId ?? null,
    attemptedAt: now,
  }).returning();

  let lastError = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS[attempt - 1] ?? 1200);
    try {
      const result = await resend.emails.send({
        from: FROM_EMAIL,
        to: toName ? `${toName} <${toEmail}>` : toEmail,
        subject,
        html: bodyHtml,
        text: bodyText,
      });

      if (result.error) {
        const errMsg = result.error.message ?? "Resend API error";
        if (attempt < MAX_RETRIES && isTransientError(errMsg)) { lastError = errMsg; continue; }
        const failNow = new Date();
        await db.update(emailDeliveriesTable)
          .set({ status: "failed", failedAt: failNow, failedReason: errMsg, updatedAt: failNow })
          .where(eq(emailDeliveriesTable.id, pending.id));
        return { success: false, emailDeliveryId: pending.id, status: "failed", error: errMsg };
      }

      const acceptedNow = new Date();
      await db.update(emailDeliveriesTable)
        .set({ status: "accepted", providerMessageId: result.data?.id ?? null, acceptedAt: acceptedNow, updatedAt: acceptedNow })
        .where(eq(emailDeliveriesTable.id, pending.id));
      return { success: true, emailDeliveryId: pending.id, providerMessageId: result.data?.id, status: "accepted" };

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES && isTransientError(msg)) { lastError = msg; continue; }
      const failNow = new Date();
      await db.update(emailDeliveriesTable)
        .set({ status: "failed", failedAt: failNow, failedReason: msg, updatedAt: failNow })
        .where(eq(emailDeliveriesTable.id, pending.id));
      return { success: false, emailDeliveryId: pending.id, status: "failed", error: msg };
    }
  }

  const failNow = new Date();
  await db.update(emailDeliveriesTable)
    .set({ status: "failed", failedAt: failNow, failedReason: `Max retries: ${lastError}`, updatedAt: failNow })
    .where(eq(emailDeliveriesTable.id, pending.id));
  return { success: false, emailDeliveryId: pending.id, status: "failed", error: `Delivery failed after ${MAX_RETRIES + 1} attempts` };
}

export function buildSignatureRequestEmail(opts: {
  recipientName: string;
  documentTitle: string;
  signUrl: string;
  expiresAt: string;
  schoolName?: string;
  senderName?: string;
}): { subject: string; html: string; text: string } {
  const { recipientName, documentTitle, signUrl, expiresAt, schoolName, senderName } = opts;
  const subject = `Signature Required: ${documentTitle}`;
  const expDate = new Date(expiresAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:14px;color:#111;background:#f9fafb;margin:0;padding:0}
    .wrapper{max-width:600px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
    .header{background:#065f46;color:#fff;padding:20px 28px}
    .body{padding:28px}
    .btn{display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;font-size:15px;margin:16px 0}
    .notice{background:#fef9c3;border:1px solid #fde68a;border-radius:6px;padding:10px 14px;font-size:12px;color:#92400e;margin-top:20px}
    .footer{background:#f3f4f6;padding:14px 28px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb}
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1 style="margin:0;font-size:18px">Signature Requested</h1>
    <p style="margin:4px 0 0;font-size:12px;opacity:.85">Trellis SPED Compliance Platform</p>
  </div>
  <div class="body">
    <p>Dear ${recipientName},</p>
    <p>Your signature is required on the following document${schoolName ? ` from <strong>${schoolName}</strong>` : ""}:</p>
    <p style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:12px 16px;font-weight:600;font-size:15px">${documentTitle}</p>
    <p>Please click the button below to review and sign the document:</p>
    <a href="${signUrl}" class="btn">Review &amp; Sign Document →</a>
    <div class="notice">
      <strong>This link expires on ${expDate}.</strong> If you did not expect this request or have questions, please contact the school directly.
    </div>
    <p style="margin-top:20px;font-size:12px;color:#6b7280">If the button doesn't work, copy and paste this link into your browser:<br><a href="${signUrl}" style="color:#059669;word-break:break-all">${signUrl}</a></p>
  </div>
  <div class="footer">
    <p>Sent by Trellis SPED Compliance Platform${schoolName ? ` on behalf of ${schoolName}` : ""}${senderName ? `. Requested by ${senderName}` : ""}.</p>
  </div>
</div>
</body>
</html>`;

  const text = `Dear ${recipientName},\n\nYour signature is required on: ${documentTitle}${schoolName ? ` (from ${schoolName})` : ""}.\n\nPlease visit the following link to review and sign:\n${signUrl}\n\nThis link expires on ${expDate}.\n\nIf you have questions, please contact the school directly.`;

  return { subject, html, text };
}

export function buildShareLinkEmail(opts: {
  recipientName?: string;
  studentName: string;
  shareUrl: string;
  expiresAt: string;
  schoolName?: string;
  senderName?: string;
}): { subject: string; html: string; text: string } {
  const { recipientName, studentName, shareUrl, expiresAt, schoolName, senderName } = opts;
  const subject = `Progress Report Available: ${studentName}`;
  const expDate = new Date(expiresAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const greeting = recipientName ? `Dear ${recipientName},` : "Hello,";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:14px;color:#111;background:#f9fafb;margin:0;padding:0}
    .wrapper{max-width:600px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
    .header{background:#065f46;color:#fff;padding:20px 28px}
    .body{padding:28px}
    .btn{display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;font-size:15px;margin:16px 0}
    .notice{background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:10px 14px;font-size:12px;color:#1e40af;margin-top:20px}
    .footer{background:#f3f4f6;padding:14px 28px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb}
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1 style="margin:0;font-size:18px">Progress Report Ready</h1>
    <p style="margin:4px 0 0;font-size:12px;opacity:.85">Trellis SPED Compliance Platform</p>
  </div>
  <div class="body">
    <p>${greeting}</p>
    <p>A progress report for <strong>${studentName}</strong> has been shared with you${schoolName ? ` by ${schoolName}` : ""}.</p>
    <p>Click the button below to view the report:</p>
    <a href="${shareUrl}" class="btn">View Progress Report →</a>
    <div class="notice">
      <strong>Access expires ${expDate}.</strong> This link is unique to you — please do not forward it. Contact the school for a new link if needed.
    </div>
    <p style="margin-top:20px;font-size:12px;color:#6b7280">If the button doesn't work, copy and paste this link into your browser:<br><a href="${shareUrl}" style="color:#059669;word-break:break-all">${shareUrl}</a></p>
  </div>
  <div class="footer">
    <p>Sent by Trellis SPED Compliance Platform${schoolName ? ` on behalf of ${schoolName}` : ""}${senderName ? `. Shared by ${senderName}` : ""}.</p>
  </div>
</div>
</body>
</html>`;

  const text = `${greeting}\n\nA progress report for ${studentName} has been shared with you${schoolName ? ` by ${schoolName}` : ""}.\n\nView the report here:\n${shareUrl}\n\nThis link expires on ${expDate}. Please do not forward — contact the school for a new link if needed.`;

  return { subject, html, text };
}

export function buildIepMeetingInvitationEmail(opts: {
  recipientName?: string;
  studentName: string;
  meetingType: string;
  scheduledDate: string;
  scheduledTime?: string | null;
  location?: string | null;
  meetingFormat?: string | null;
  agendaItems?: string[] | null;
  schoolName?: string;
  senderName?: string;
}): { subject: string; html: string; text: string } {
  const { recipientName, studentName, meetingType, scheduledDate, scheduledTime, location, meetingFormat, agendaItems, schoolName, senderName } = opts;

  const meetingTypeLabel = meetingType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const subject = `Meeting Invitation: ${meetingTypeLabel} — ${studentName} on ${scheduledDate}`;
  const greeting = recipientName ? `Dear ${recipientName},` : "Hello,";

  const timeRow = scheduledTime ? `<li><strong>Time:</strong> ${scheduledTime}</li>` : "";
  const locationRow = location ? `<li><strong>Location/Link:</strong> ${location}</li>` : "";
  const formatRow = meetingFormat ? `<li><strong>Format:</strong> ${meetingFormat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</li>` : "";

  const agendaHtml = agendaItems && agendaItems.length > 0
    ? `<p style="margin-top:16px"><strong>Agenda:</strong></p><ul style="color:#374151">${agendaItems.map(a => `<li>${a}</li>`).join("")}</ul>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:14px;color:#111;background:#f9fafb;margin:0;padding:0}
    .wrapper{max-width:600px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
    .header{background:#1e3a5f;color:#fff;padding:20px 28px}
    .body{padding:28px}
    .card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px 20px;margin:16px 0}
    .footer{background:#f3f4f6;padding:14px 28px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb}
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1 style="margin:0;font-size:18px">IEP Meeting Invitation</h1>
    <p style="margin:4px 0 0;font-size:12px;opacity:.85">${meetingTypeLabel}${schoolName ? ` — ${schoolName}` : ""}</p>
  </div>
  <div class="body">
    <p>${greeting}</p>
    <p>You are invited to a <strong>${meetingTypeLabel}</strong> for <strong>${studentName}</strong>.</p>
    <div class="card">
      <ul style="margin:0;padding-left:20px;line-height:2">
        <li><strong>Date:</strong> ${scheduledDate}</li>
        ${timeRow}
        ${locationRow}
        ${formatRow}
      </ul>
    </div>
    ${agendaHtml}
    <p>Please contact${senderName ? ` ${senderName}` : " the school"} if you have questions or need to reschedule.</p>
  </div>
  <div class="footer">
    <p>Sent by Trellis SPED Compliance Platform${schoolName ? ` on behalf of ${schoolName}` : ""}${senderName ? `. Contact: ${senderName}` : ""}.</p>
  </div>
</div>
</body>
</html>`;

  const timeText = scheduledTime ? `Time: ${scheduledTime}\n` : "";
  const locationText = location ? `Location/Link: ${location}\n` : "";
  const agendaText = agendaItems && agendaItems.length > 0 ? `\nAgenda:\n${agendaItems.map(a => `  • ${a}`).join("\n")}` : "";

  const text = `${greeting}\n\nYou are invited to a ${meetingTypeLabel} for ${studentName}.\n\nDate: ${scheduledDate}\n${timeText}${locationText}${agendaText}\n\nPlease contact ${senderName ?? "the school"} if you have questions.${schoolName ? `\n\n${schoolName}` : ""}`;

  return { subject, html, text };
}
