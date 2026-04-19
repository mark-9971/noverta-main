import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, scheduledReportsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

export function buildScheduledReportUnsubscribeToken(scheduleId: number, email: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${scheduleId}:${email.toLowerCase()}`)
    .digest("hex")
    .slice(0, 40);
}

function tokensMatch(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

function htmlPage(opts: { title: string; message: string; ok: boolean }): string {
  const color = opts.ok ? "#059669" : "#b91c1c";
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${opts.title}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color:#111827; background:#f9fafb;
         margin:0; padding:48px 20px; }
  .card { max-width:520px; margin:0 auto; background:white; border:1px solid #e5e7eb; border-radius:12px;
          padding:32px; text-align:center; }
  h1 { margin:0 0 12px; font-size:20px; color:${color}; }
  p { margin:0; color:#374151; line-height:1.5; font-size:14px; }
  .brand { color:#6b7280; font-size:11px; margin-top:24px; }
</style></head>
<body><div class="card">
  <h1>${opts.title}</h1>
  <p>${opts.message}</p>
  <div class="brand">Trellis SPED Compliance Platform</div>
</div></body></html>`;
}

/**
 * Public unsubscribe endpoint for scheduled report emails.
 * Mounted before the auth middleware so recipients can unsubscribe directly
 * from a link in the email without logging in. Idempotent: safe to call
 * multiple times. Removes the recipient from the schedule's email list,
 * and disables the schedule entirely once the last recipient is removed.
 */
router.get("/email-unsubscribe/scheduled-report/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const email = String(req.query.email ?? "").trim().toLowerCase();
    const token = String(req.query.token ?? "").trim();

    if (Number.isNaN(id) || !email || !token) {
      res.status(400).type("html").send(htmlPage({
        title: "Invalid unsubscribe link",
        message: "This unsubscribe link is missing required information. Please use the link from a recent scheduled report email.",
        ok: false,
      }));
      return;
    }

    const [schedule] = await db.select().from(scheduledReportsTable).where(eq(scheduledReportsTable.id, id));
    if (!schedule || !schedule.unsubscribeSecret) {
      // Treat as already unsubscribed — don't leak existence.
      res.type("html").send(htmlPage({
        title: "You have been unsubscribed",
        message: "You will no longer receive this scheduled report.",
        ok: true,
      }));
      return;
    }

    const expected = buildScheduledReportUnsubscribeToken(id, email, schedule.unsubscribeSecret);
    if (!tokensMatch(expected, token)) {
      res.status(403).type("html").send(htmlPage({
        title: "Unsubscribe link expired",
        message: "This unsubscribe link is no longer valid. Please use the link from your most recent scheduled report email, or contact your district administrator.",
        ok: false,
      }));
      return;
    }

    const recipients = (schedule.recipientEmails ?? []) as string[];
    const remaining = recipients.filter(r => r.toLowerCase() !== email);

    const wasSubscribed = remaining.length !== recipients.length;
    if (remaining.length === 0) {
      await db.update(scheduledReportsTable)
        .set({ recipientEmails: [], enabled: false })
        .where(eq(scheduledReportsTable.id, id));
    } else if (wasSubscribed) {
      await db.update(scheduledReportsTable)
        .set({ recipientEmails: remaining })
        .where(eq(scheduledReportsTable.id, id));
    }

    res.type("html").send(htmlPage({
      title: "You have been unsubscribed",
      message: `${email} will no longer receive this scheduled report. If this was a mistake, ask your district administrator to re-add you.`,
      ok: true,
    }));
  } catch (err) {
    console.error("GET /email-unsubscribe/scheduled-report error:", err);
    res.status(500).type("html").send(htmlPage({
      title: "Something went wrong",
      message: "We couldn't process your unsubscribe request. Please try again later or contact your district administrator.",
      ok: false,
    }));
  }
});

export default router;
