// tenant-scope: district (POST is district-scoped) + platform-admin (GET/PATCH on /support paths)
//
// Routes:
//   GET  /api/pilot-feedback/eligibility — current caller can see the widget?
//   POST /api/pilot-feedback             — create a submission (auth, district required)
//   GET  /api/support/pilot-feedback     — platform-admin list with filters
//   PATCH /api/support/pilot-feedback/:id — platform-admin update status/notes
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db, pilotFeedbackTable, districtsTable,
} from "@workspace/db";
import { and, eq, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { requirePlatformAdmin, type AuthedRequest } from "../middlewares/auth";
import { resolveDistrictIdForCaller } from "../lib/resolveDistrictForCaller";
import { sendAdminEmail, getAppBaseUrl } from "../lib/email";
import { getPublicMeta } from "../lib/clerkClaims";
import { getAuth, clerkClient } from "@clerk/express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Constants ──────────────────────────────────────────────────────────────
// 2 MB hard cap on the screenshot data URL. Larger captures get dropped on
// the client side before submission, but we re-enforce here to protect the
// DB row size.
const MAX_SCREENSHOT_BYTES = 2_000_000;
const MAX_DESCRIPTION_LEN = 10_000;
const MAX_CONSOLE_ERRORS = 25;

const consoleErrorSchema = z.object({
  at: z.string(),
  message: z.string().max(2000),
});

const submitSchema = z.object({
  type: z.enum(["bug", "suggestion", "question"]),
  description: z.string().min(3).max(MAX_DESCRIPTION_LEN),
  pageUrl: z.string().max(2000).optional(),
  userAgent: z.string().max(500).optional(),
  screenshotDataUrl: z.string().max(MAX_SCREENSHOT_BYTES).nullable().optional(),
  consoleErrors: z.array(consoleErrorSchema).max(MAX_CONSOLE_ERRORS).optional(),
  extraContext: z.record(z.string(), z.unknown()).optional(),
});

const updateSchema = z.object({
  status: z.enum(["new", "triaged", "in_progress", "closed"]).optional(),
  triageNotes: z.string().max(5000).nullable().optional(),
});

// ── GET /api/pilot-feedback/eligibility ────────────────────────────────────
// Lightweight check the floating widget calls on app load to decide whether
// to render itself. Returns isPilot=true only when the caller's resolved
// district has is_pilot=true. Demo districts also see the widget so we can
// dogfood it during demo prep.
router.get("/pilot-feedback/eligibility", async (req: Request, res: Response) => {
  try {
    const districtId = await resolveDistrictIdForCaller(req);
    if (!districtId) {
      res.json({ enabled: false, reason: "no_district" });
      return;
    }
    const [district] = await db
      .select({ isPilot: districtsTable.isPilot, isDemo: districtsTable.isDemo })
      .from(districtsTable)
      .where(eq(districtsTable.id, districtId))
      .limit(1);
    if (!district) {
      res.json({ enabled: false, reason: "district_not_found" });
      return;
    }
    res.json({
      enabled: district.isPilot || district.isDemo,
      isPilot: district.isPilot,
      isDemo: district.isDemo,
    });
  } catch (err) {
    logger.error({ err }, "[pilotFeedback] eligibility error");
    res.json({ enabled: false, reason: "error" });
  }
});

// ── POST /api/pilot-feedback ───────────────────────────────────────────────
// Create a new submission, auto-attach context, and email the assigned
// account manager (if configured) so they can act fast.
router.post("/pilot-feedback", async (req: Request, res: Response) => {
  const authed = req as AuthedRequest;
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid feedback payload", details: parsed.error.issues });
    return;
  }

  // Tighter byte-size enforcement on the screenshot. zod's max() above counts
  // characters; data URLs with multibyte chars still need a byte check.
  const screenshot = parsed.data.screenshotDataUrl ?? null;
  if (screenshot && Buffer.byteLength(screenshot, "utf8") > MAX_SCREENSHOT_BYTES) {
    res.status(413).json({ error: "Screenshot too large" });
    return;
  }

  // Pull the caller's email from Clerk if we don't already have it.
  // The widget submission may include extraContext.email if the user is a
  // dev-bypass test admin without a Clerk session.
  let userEmail: string | null = null;
  let userName: string | null = authed.displayName ?? null;
  try {
    const auth = getAuth(req);
    if (auth?.userId) {
      const u = await clerkClient.users.getUser(auth.userId);
      userEmail = u.emailAddresses.find(e => e.id === u.primaryEmailAddressId)?.emailAddress
        ?? u.emailAddresses[0]?.emailAddress
        ?? null;
      userName = u.fullName || u.firstName || userName;
    }
  } catch {
    // Best-effort — don't block submission on Clerk lookup failure.
  }

  const districtId = authed.tenantDistrictId ?? (await resolveDistrictIdForCaller(req));

  const [row] = await db.insert(pilotFeedbackTable).values({
    districtId: districtId ?? null,
    userId: authed.userId,
    userEmail,
    userRole: authed.trellisRole,
    userName,
    type: parsed.data.type,
    description: parsed.data.description.trim(),
    pageUrl: parsed.data.pageUrl ?? null,
    userAgent: parsed.data.userAgent ?? null,
    screenshotDataUrl: screenshot,
    consoleErrors: parsed.data.consoleErrors ?? null,
    extraContext: parsed.data.extraContext ?? null,
  }).returning();

  // Fire-and-forget email to the account manager. Failure does not block
  // the submission — the row is the source of truth and admins can also
  // pull from the admin page even when email is misconfigured.
  notifyAccountManager(row.id, districtId).catch((err) => {
    logger.warn({ err, feedbackId: row.id }, "[pilotFeedback] AM notify failed");
  });

  res.status(201).json({ id: row.id, status: row.status });
});

async function notifyAccountManager(feedbackId: number, districtId: number | null): Promise<void> {
  if (!districtId) return;
  const [district] = await db
    .select({
      name: districtsTable.name,
      amEmail: districtsTable.pilotAccountManagerEmail,
    })
    .from(districtsTable)
    .where(eq(districtsTable.id, districtId))
    .limit(1);
  if (!district?.amEmail) return;

  const [feedback] = await db.select().from(pilotFeedbackTable)
    .where(eq(pilotFeedbackTable.id, feedbackId)).limit(1);
  if (!feedback) return;

  const baseUrl = getAppBaseUrl();
  const adminLink = baseUrl ? `${baseUrl}/pilot-feedback?id=${feedbackId}` : null;
  const typeLabel: Record<string, string> = {
    bug: "Bug report",
    suggestion: "Suggestion",
    question: "Question",
  };
  const subject = `[Noverta pilot] ${typeLabel[feedback.type] ?? feedback.type} from ${district.name}`;
  const truncatedDesc = feedback.description.length > 800
    ? `${feedback.description.slice(0, 800)}…`
    : feedback.description;

  const html = `<div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto">
<div style="background:#0ea5e9;color:white;padding:14px 20px;border-radius:8px 8px 0 0">
<h2 style="margin:0;font-size:16px">New pilot feedback — ${typeLabel[feedback.type] ?? feedback.type}</h2>
</div>
<div style="padding:18px 20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
<p style="margin:0 0 10px 0;color:#475569;font-size:13px">
<strong>${district.name}</strong> · ${feedback.userName ?? "Unknown user"} (${feedback.userRole ?? "unknown role"})
${feedback.userEmail ? ` · <a href="mailto:${feedback.userEmail}">${feedback.userEmail}</a>` : ""}
</p>
<div style="background:#f8fafc;border-left:3px solid #0ea5e9;padding:10px 14px;margin:12px 0;white-space:pre-wrap;font-size:14px;color:#0f172a">${escapeHtml(truncatedDesc)}</div>
${feedback.pageUrl ? `<p style="font-size:12px;color:#64748b;margin:4px 0"><strong>Page:</strong> ${escapeHtml(feedback.pageUrl)}</p>` : ""}
${feedback.userAgent ? `<p style="font-size:12px;color:#64748b;margin:4px 0"><strong>Browser:</strong> ${escapeHtml(feedback.userAgent)}</p>` : ""}
${(feedback.consoleErrors?.length ?? 0) > 0 ? `<p style="font-size:12px;color:#b91c1c;margin:8px 0 4px 0"><strong>${feedback.consoleErrors!.length} recent console error(s) captured</strong></p>` : ""}
${adminLink ? `<p style="margin:18px 0 0 0"><a href="${adminLink}" style="background:#0ea5e9;color:white;padding:8px 14px;border-radius:6px;text-decoration:none;font-size:13px">Open in Pilot Feedback admin</a></p>` : ""}
</div>
<div style="text-align:center;padding:10px;color:#9ca3af;font-size:11px">Noverta pilot feedback · do not reply</div>
</div>`;

  const text = [
    `New pilot feedback (${typeLabel[feedback.type] ?? feedback.type})`,
    `District: ${district.name}`,
    `User: ${feedback.userName ?? "Unknown"} (${feedback.userRole ?? "unknown role"})${feedback.userEmail ? ` <${feedback.userEmail}>` : ""}`,
    feedback.pageUrl ? `Page: ${feedback.pageUrl}` : null,
    feedback.userAgent ? `Browser: ${feedback.userAgent}` : null,
    "",
    feedback.description,
    "",
    adminLink ? `Open in admin: ${adminLink}` : null,
  ].filter(Boolean).join("\n");

  const result = await sendAdminEmail({
    to: [district.amEmail],
    subject, html, text,
    notificationType: "pilot_feedback_submission",
  });

  await db.update(pilotFeedbackTable)
    .set({
      emailNotifiedTo: district.amEmail,
      emailNotifiedAt: result.success ? new Date() : null,
    })
    .where(eq(pilotFeedbackTable.id, feedbackId));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// ── Platform-admin endpoints (path-scoped under /support) ──────────────────
router.use("/support/pilot-feedback", requirePlatformAdmin);

router.get("/support/pilot-feedback", async (req: Request, res: Response) => {
  try {
    const districtIdRaw = req.query.districtId;
    const typeRaw = req.query.type;
    const statusRaw = req.query.status;

    const filters: ReturnType<typeof eq>[] = [];
    if (typeof districtIdRaw === "string" && districtIdRaw !== "" && districtIdRaw !== "all") {
      const n = Number(districtIdRaw);
      if (Number.isInteger(n) && n > 0) filters.push(eq(pilotFeedbackTable.districtId, n));
    }
    if (typeof typeRaw === "string" && ["bug", "suggestion", "question"].includes(typeRaw)) {
      filters.push(eq(pilotFeedbackTable.type, typeRaw as "bug" | "suggestion" | "question"));
    }
    if (typeof statusRaw === "string" && ["new", "triaged", "in_progress", "closed"].includes(statusRaw)) {
      filters.push(eq(pilotFeedbackTable.status, statusRaw as "new" | "triaged" | "in_progress" | "closed"));
    }

    const baseSelect = {
      id: pilotFeedbackTable.id,
      districtId: pilotFeedbackTable.districtId,
      districtName: districtsTable.name,
      userId: pilotFeedbackTable.userId,
      userEmail: pilotFeedbackTable.userEmail,
      userRole: pilotFeedbackTable.userRole,
      userName: pilotFeedbackTable.userName,
      type: pilotFeedbackTable.type,
      description: pilotFeedbackTable.description,
      pageUrl: pilotFeedbackTable.pageUrl,
      userAgent: pilotFeedbackTable.userAgent,
      // Don't include screenshotDataUrl in list view — too large; fetched per-row on detail.
      hasScreenshot: sql<boolean>`${pilotFeedbackTable.screenshotDataUrl} IS NOT NULL`.mapWith(Boolean),
      consoleErrors: pilotFeedbackTable.consoleErrors,
      extraContext: pilotFeedbackTable.extraContext,
      status: pilotFeedbackTable.status,
      triageNotes: pilotFeedbackTable.triageNotes,
      triagedByUserId: pilotFeedbackTable.triagedByUserId,
      triagedAt: pilotFeedbackTable.triagedAt,
      emailNotifiedTo: pilotFeedbackTable.emailNotifiedTo,
      emailNotifiedAt: pilotFeedbackTable.emailNotifiedAt,
      createdAt: pilotFeedbackTable.createdAt,
      updatedAt: pilotFeedbackTable.updatedAt,
    };

    const where = filters.length > 0 ? and(...filters) : undefined;
    const rows = where
      ? await db.select(baseSelect).from(pilotFeedbackTable)
          .leftJoin(districtsTable, eq(pilotFeedbackTable.districtId, districtsTable.id))
          .where(where).orderBy(desc(pilotFeedbackTable.createdAt)).limit(500)
      : await db.select(baseSelect).from(pilotFeedbackTable)
          .leftJoin(districtsTable, eq(pilotFeedbackTable.districtId, districtsTable.id))
          .orderBy(desc(pilotFeedbackTable.createdAt)).limit(500);

    res.json({ feedback: rows });
  } catch (err) {
    logger.error({ err }, "[pilotFeedback] list error");
    res.status(500).json({ error: "Failed to load pilot feedback" });
  }
});

router.get("/support/pilot-feedback/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid feedback id" });
    return;
  }
  const [row] = await db.select({
    feedback: pilotFeedbackTable,
    districtName: districtsTable.name,
  })
    .from(pilotFeedbackTable)
    .leftJoin(districtsTable, eq(pilotFeedbackTable.districtId, districtsTable.id))
    .where(eq(pilotFeedbackTable.id, id)).limit(1);
  if (!row) {
    res.status(404).json({ error: "Feedback not found" });
    return;
  }
  res.json({ ...row.feedback, districtName: row.districtName });
});

router.patch("/support/pilot-feedback/:id", async (req: Request, res: Response) => {
  const authed = req as AuthedRequest;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid feedback id" });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid update payload", details: parsed.error.issues });
    return;
  }
  if (parsed.data.status === undefined && parsed.data.triageNotes === undefined) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  const updateValues: Partial<typeof pilotFeedbackTable.$inferInsert> = {};
  if (parsed.data.status !== undefined) {
    updateValues.status = parsed.data.status;
    // Stamp triagedAt/triagedBy the first time it leaves "new".
    if (parsed.data.status !== "new") {
      updateValues.triagedAt = new Date();
      updateValues.triagedByUserId = authed.userId;
    }
  }
  if (parsed.data.triageNotes !== undefined) {
    updateValues.triageNotes = parsed.data.triageNotes;
  }

  const [row] = await db.update(pilotFeedbackTable)
    .set(updateValues)
    .where(eq(pilotFeedbackTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Feedback not found" });
    return;
  }
  res.json({ id: row.id, status: row.status, triageNotes: row.triageNotes });
});

export default router;
