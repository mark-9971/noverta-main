import { db, districtsTable, schoolsTable, staffTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { Resend } from "resend";

/**
 * Billing notifications go to district admins (staff.role='admin') and DO NOT
 * write to `communication_events` — that table is reserved for student/parent
 * communications under MA 603 CMR. Billing notices are operational.
 *
 * If RESEND_API_KEY is missing this function is a no-op and logs the intended
 * recipients so the failure is observable in dev/staging without crashing the
 * webhook (Stripe retries non-200 webhook responses, and we don't want
 * billing-state DB writes to be re-applied just because email is unconfigured).
 */
const FROM_EMAIL = "Noverta Billing <billing@noverta.education>";

export interface SendBillingNotificationParams {
  districtId: number;
  subject: string;
  html: string;
  text: string;
  /** Tag for log lines so different notifications are easy to grep. */
  notificationType:
    | "payment_failed"
    | "payment_succeeded"
    | "trial_ending"
    | "payment_method_removed"
    | "subscription_canceled";
}

export interface BillingNotificationResult {
  attempted: boolean;
  recipientCount: number;
  delivered: boolean;
  notConfigured?: boolean;
  error?: string;
}

/**
 * Look up active admin staff emails for a district. Joins through schools
 * because staff are scoped per-school, not per-district.
 */
export async function getDistrictAdminEmails(districtId: number): Promise<string[]> {
  const rows = await db
    .select({ email: staffTable.email })
    .from(staffTable)
    .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
    .where(
      and(
        eq(schoolsTable.districtId, districtId),
        eq(staffTable.role, "admin"),
        eq(staffTable.status, "active"),
        isNull(staffTable.deletedAt),
      ),
    );
  const emails = rows
    .map((r) => r.email)
    .filter((e): e is string => typeof e === "string" && e.length > 0);
  return Array.from(new Set(emails));
}

export async function sendBillingNotification(
  params: SendBillingNotificationParams,
): Promise<BillingNotificationResult> {
  const { districtId, subject, html, text, notificationType } = params;
  const recipients = await getDistrictAdminEmails(districtId);

  if (recipients.length === 0) {
    console.warn(
      `[billing] ${notificationType} for district ${districtId}: no admin recipients on file`,
    );
    return { attempted: false, recipientCount: 0, delivered: false };
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(
      `[billing] ${notificationType} for district ${districtId}: would notify ${recipients.length} admin(s); RESEND_API_KEY not configured`,
    );
    return {
      attempted: false,
      recipientCount: recipients.length,
      delivered: false,
      notConfigured: true,
    };
  }

  try {
    const resend = new Resend(key);
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: recipients,
      subject,
      html,
      text,
    });
    if (result.error) {
      console.error(
        `[billing] ${notificationType} for district ${districtId} send failed:`,
        result.error,
      );
      return {
        attempted: true,
        recipientCount: recipients.length,
        delivered: false,
        error: result.error.message,
      };
    }
    return {
      attempted: true,
      recipientCount: recipients.length,
      delivered: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[billing] ${notificationType} for district ${districtId} threw:`, msg);
    return {
      attempted: true,
      recipientCount: recipients.length,
      delivered: false,
      error: msg,
    };
  }
}

/**
 * Build the standard wrapper for billing notifications. Keeps copy
 * consistent (same logo strip, same sign-off) without duplicating HTML.
 */
export function buildBillingEmailHtml(opts: {
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const { heading, body, ctaLabel, ctaUrl } = opts;
  const cta =
    ctaLabel && ctaUrl
      ? `<p style="margin:24px 0"><a href="${ctaUrl}" style="background:#0d9488;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">${ctaLabel}</a></p>`
      : "";
  return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
<div style="background:#0d9488;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
<h2 style="margin:0;font-size:18px">Noverta Billing</h2>
</div>
<div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
<h3 style="margin:0 0 12px;font-size:16px;color:#111827">${heading}</h3>
<div style="color:#374151;font-size:14px;line-height:1.5">${body}</div>
${cta}
</div>
<div style="text-align:center;padding:12px;color:#9ca3af;font-size:11px">Noverta SPED Compliance Platform</div>
</div>`;
}
