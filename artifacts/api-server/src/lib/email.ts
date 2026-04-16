import { db, communicationEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Resend } from "resend";

export type EmailType =
  | "incident_parent_notification"
  | "written_report"
  | "verbal_notification_confirmation"
  | "missed_service_alert"
  | "overdue_followup_reminder"
  | "incomplete_transition_reminder"
  | "overdue_evaluation_reminder"
  | "progress_report"
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

export interface SendEmailResult {
  success: boolean;
  communicationEventId: number;
  providerMessageId?: string;
  error?: string;
  notConfigured?: boolean;
}

const FROM_EMAIL = "Trellis SPED <noreply@trellis.education>";
const FROM_EMAIL_FALLBACK = "noreply@trellis.education";

function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
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
    return { success: false, communicationEventId: event.id, notConfigured: true, error: "Email provider not configured — add RESEND_API_KEY to enable real delivery" };
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
      await db.update(communicationEventsTable)
        .set({ status: "failed", failedAt: now, failedReason: errMsg, updatedAt: now })
        .where(eq(communicationEventsTable.id, pending.id));
      return { success: false, communicationEventId: pending.id, error: errMsg };
    }

    await db.update(communicationEventsTable)
      .set({ status: "sent", providerMessageId: result.data?.id ?? null, sentAt: now, updatedAt: now })
      .where(eq(communicationEventsTable.id, pending.id));

    return { success: true, communicationEventId: pending.id, providerMessageId: result.data?.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.update(communicationEventsTable)
      .set({ status: "failed", failedAt: now, failedReason: msg, updatedAt: now })
      .where(eq(communicationEventsTable.id, pending.id));
    return { success: false, communicationEventId: pending.id, error: msg };
  }
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
