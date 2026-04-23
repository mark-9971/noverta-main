// tenant-scope: public (unauthenticated demo-signup endpoint; each request creates its own NEW district via seedSampleDataForDistrict, so there is no caller-district to scope to)
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  demoRequestsTable, insertDemoRequestSchema, districtsTable,
  staffTable, guardiansTable, schoolsTable, studentsTable,
} from "@workspace/db";
import { desc, eq, isNotNull, and } from "drizzle-orm";
import { getPublicMeta } from "../lib/clerkClaims";
import { getAuth, clerkClient } from "@clerk/express";
import { getClientIp } from "../lib/clientIp";
import { SlidingWindowLimiter } from "../lib/rateLimiter";
import { seedSampleDataForDistrict } from "@workspace/db";
import { sendAdminEmail } from "../lib/email";
import { logger } from "../lib/logger";

// tenant-scope: public
const router: IRouter = Router();

/**
 * Per-IP rate limit for the public, unauthenticated demo-request submission.
 *
 * The /api global limiter (200 req/min) is too loose for a write endpoint
 * that anyone can hit and that can fill up the demo_requests table. 5 valid
 * submissions per IP per hour is plenty for legitimate use and stops trivial
 * spam without a captcha. Skipped in test so suite-wide tests don't trip it.
 */
const demoSubmitLimiter = new SlidingWindowLimiter(60 * 60 * 1000, 5);
export function __resetDemoLimiter(): void { demoSubmitLimiter.reset(); }

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Strict allowlist for demo roles — reject anything outside this set */
const ALLOWED_DEMO_ROLES = ["admin", "provider", "para", "guardian"] as const;
type DemoRole = (typeof ALLOWED_DEMO_ROLES)[number];

const ROLE_LABEL: Record<DemoRole, string> = {
  admin: "District Admin",
  provider: "Provider",
  para: "Paraprofessional",
  guardian: "Guardian / Parent",
};

function isAllowedRole(role: string): role is DemoRole {
  return (ALLOWED_DEMO_ROLES as readonly string[]).includes(role);
}

function buildDemoWelcomeEmail(opts: {
  name: string;
  email: string;
  districtName: string;
  role: DemoRole;
  tempPassword: string;
  loginUrl: string;
}): { subject: string; html: string; text: string } {
  const { name, districtName, role, tempPassword, loginUrl } = opts;
  const roleLabel = ROLE_LABEL[role];
  const subject = `Your Noverta demo is ready — log in now`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${subject}</title>
<style>
  body{font-family:system-ui,Arial,sans-serif;background:#f9fafb;margin:0;padding:0;color:#111}
  .wrapper{max-width:600px;margin:32px auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden}
  .header{background:#059669;padding:24px 32px}
  .header h1{color:#fff;margin:0;font-size:20px;font-weight:700}
  .header p{color:#d1fae5;margin:4px 0 0;font-size:13px}
  .body{padding:28px 32px}
  .creds{background:#f0fdf4;border:1px solid #6ee7b7;border-radius:8px;padding:16px 20px;margin:20px 0}
  .creds p{margin:6px 0;font-size:14px}
  .creds strong{font-weight:600}
  .cta{display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;margin-top:8px}
  .note{color:#6b7280;font-size:12px;margin-top:20px}
  .footer{background:#f3f4f6;padding:14px 32px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb}
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>Your demo is ready, ${name.split(" ")[0]}!</h1>
    <p>Noverta SPED Compliance Platform</p>
  </div>
  <div class="body">
    <p>We've created a fully-populated demo district — <strong>${districtName}</strong> — seeded with real-looking IEPs, session logs, compliance data, and more so you can explore the product immediately.</p>
    <div class="creds">
      <p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
      <p><strong>Email:</strong> ${opts.email}</p>
      <p><strong>Temporary password:</strong> <code style="background:#e5e7eb;padding:2px 6px;border-radius:4px;font-size:13px">${tempPassword}</code></p>
      <p><strong>Your role:</strong> ${roleLabel}</p>
    </div>
    <a class="cta" href="${loginUrl}">Open my demo</a>
    <p class="note">
      This demo district expires in 7 days. Your data is pre-populated with sample students, IEPs, service logs, and compliance scenarios — nothing is real student data.<br><br>
      Questions? Reply to this email or reach us at <a href="mailto:hello@trellis.education">hello@trellis.education</a>.
    </p>
  </div>
  <div class="footer">Noverta SPED Compliance Platform — Automated demo provisioning</div>
</div>
</body>
</html>`;

  const text = `Your Noverta demo is ready, ${name.split(" ")[0]}!\n\nWe've created a fully-populated demo district: ${districtName}.\n\nLogin URL: ${loginUrl}\nEmail: ${opts.email}\nTemporary password: ${tempPassword}\nYour role: ${roleLabel}\n\nThis demo expires in 7 days.\n\nQuestions? Reply to this email or reach hello@trellis.education`;
  return { subject, html, text };
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pw = "";
  for (let i = 0; i < 12; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  return pw;
}

/**
 * Resolve identity metadata for a seeded demo district based on the prospect's role.
 *
 * - admin: No staffId needed — district scope is enough for the admin dashboard.
 * - provider: Link to the first provider-role staff row in the district.
 * - para: Create a new para staff row (none are seeded by default).
 * - guardian: Find the first guardian in the district and return its ID.
 *
 * Returns { staffId?, guardianId? } to be merged into Clerk publicMetadata.
 */
async function resolveRoleIdentity(
  districtId: number,
  role: DemoRole,
  prospectName: string,
  prospectEmail: string,
): Promise<{ staffId?: number; guardianId?: number }> {
  if (role === "admin") {
    // Admin users operate at the district level — no staffId required.
    return {};
  }

  // Find the primary school for this district (created by the seeder)
  const [school] = await db.select({ id: schoolsTable.id })
    .from(schoolsTable)
    .where(eq(schoolsTable.districtId, districtId))
    .limit(1);

  const schoolId = school?.id;

  if (role === "guardian") {
    // Search district-wide: guardians → students → schools (districtId filter)
    const rows = await db
      .select({ guardianId: guardiansTable.id })
      .from(guardiansTable)
      .innerJoin(studentsTable, eq(guardiansTable.studentId, studentsTable.id))
      .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
      .where(eq(schoolsTable.districtId, districtId))
      .limit(1);
    const { guardianId } = rows[0] ?? {};
    return guardianId ? { guardianId } : {};
  }

  if (role === "provider") {
    // Search district-wide: staff → schools (districtId filter)
    const [staff] = await db
      .select({ id: staffTable.id })
      .from(staffTable)
      .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
      .where(and(eq(schoolsTable.districtId, districtId), eq(staffTable.role, "provider")))
      .limit(1);
    return staff ? { staffId: staff.id } : {};
  }

  if (role === "para") {
    if (!schoolId) return {};
    const [firstName, ...rest] = prospectName.trim().split(" ");
    const lastName = rest.join(" ") || "Demo";
    const [para] = await db.insert(staffTable).values({
      firstName: firstName ?? "Demo",
      lastName,
      role: "para",
      title: "Paraprofessional",
      qualifications: "",
      email: prospectEmail,
      schoolId,
      status: "active",
      isSample: true,
    }).returning();
    return para ? { staffId: para.id } : {};
  }

  return {};
}

async function provisionDemoAccount(requestId: number, opts: {
  name: string;
  email: string;
  districtName: string;
  role: DemoRole;
}): Promise<void> {
  const { name, email, districtName, role } = opts;

  // Map demo role to a Clerk-metadata role
  const clerkRole = role === "guardian" ? "sped_parent" : role;

  // 1. Create a demo district (tagged is_demo=true, expires in 7 days)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [district] = await db.insert(districtsTable).values({
    name: districtName,
    isDemo: true,
    hasSampleData: false,
    demoExpiresAt: expiresAt,
  }).returning();

  logger.info({ districtId: district.id, requestId }, "demo district created");

  // 2. Seed sample data for the district
  await seedSampleDataForDistrict(district.id);

  // 3. Resolve role-specific identity (staffId for staff roles, guardianId for guardian)
  const identityMeta = await resolveRoleIdentity(district.id, role, name, email);
  logger.info({ districtId: district.id, requestId, role, identityMeta }, "demo identity resolved");

  // 4. Create a Clerk user with temp password
  //    If Clerk creation fails, soft-delete the orphaned demo district so it doesn't
  //    accumulate as an unlinked record. The request row is marked "failed" by the outer
  //    catch, and the expiry scheduler will eventually clean it up regardless.
  const tempPassword = generateTempPassword();
  const [firstName, ...rest] = name.trim().split(" ");
  const lastName = rest.join(" ") || "";

  let clerkUser: Awaited<ReturnType<typeof clerkClient.users.createUser>>;
  try {
    clerkUser = await clerkClient.users.createUser({
      emailAddress: [email],
      password: tempPassword,
      firstName: firstName ?? name,
      lastName,
      publicMetadata: {
        role: clerkRole,
        districtId: district.id,
        isDemo: true,
        ...identityMeta,
      },
    });
  } catch (clerkErr) {
    // Compensating action: mark the orphaned district for soft-deletion
    const gracePeriod = new Date(Date.now() + 60 * 60 * 1000); // 1h grace
    await db.update(districtsTable).set({
      deleteInitiatedAt: new Date(),
      deleteScheduledAt: gracePeriod,
      deleteInitiatedBy: "demo-provisioner",
    }).where(eq(districtsTable.id, district.id)).catch(() => {});
    logger.error({ requestId, districtId: district.id, clerkErr }, "Clerk user creation failed; demo district queued for deletion");
    throw clerkErr; // re-throw so the outer catch marks the request "failed"
  }

  logger.info({ clerkUserId: clerkUser.id, districtId: district.id, requestId }, "demo Clerk user created");

  // 5. Mark district hasSampleData now that seed is done
  await db.update(districtsTable).set({ hasSampleData: true }).where(eq(districtsTable.id, district.id));

  // 6. Send welcome email
  const appOrigin = process.env.APP_ORIGIN ??
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://trellis.education");
  const loginUrl = `${appOrigin}/sign-in`;

  const { subject, html, text } = buildDemoWelcomeEmail({
    name, email, districtName, role, tempPassword, loginUrl,
  });

  const emailResult = await sendAdminEmail({ to: [email], subject, html, text, notificationType: "demo_welcome" });

  // Determine final status based on email outcome:
  // - "ready"        : Clerk user created + credentials sent successfully
  // - "email_failed" : Clerk user created but email delivery failed in production
  //                    (RESEND not configured = dev/staging, treat as ready)
  const emailDelivered = emailResult.success || emailResult.notConfigured;
  const finalStatus = emailDelivered ? "ready" : "email_failed";

  if (!emailDelivered) {
    logger.warn({ requestId, emailError: emailResult.error }, "demo welcome email failed to send");
  }

  // 7. Update the demo_requests row with provisioning outcome
  await db.update(demoRequestsTable).set({
    status: finalStatus,
    provisionedAt: new Date(),
    districtId: district.id,
    clerkUserId: clerkUser.id,
  }).where(eq(demoRequestsTable.id, requestId));
}

// ── Shared handler ─────────────────────────────────────────────────────────────
async function handleDemoRequest(req: Request, res: Response): Promise<void> {
  try {
    if (process.env.NODE_ENV !== "test") {
      const ip = getClientIp(req);
      if (ip && !demoSubmitLimiter.allow(ip)) {
        res.status(429).json({ error: "Too many demo requests from this address. Please try again later.", code: "rate_limited" });
        return;
      }
    }

    const parsed = insertDemoRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }

    const { email, role } = parsed.data;

    // Validate email format
    if (!EMAIL_REGEX.test(email)) {
      res.status(400).json({ error: "Invalid email address" });
      return;
    }

    // Enforce strict role allowlist — no arbitrary roles from unauthenticated callers
    if (!isAllowedRole(role)) {
      res.status(400).json({
        error: "Invalid role. Allowed values: admin, provider, para, guardian",
        code: "invalid_role",
      });
      return;
    }

    // Insert the request record immediately so the UI can show "processing"
    const [request] = await db
      .insert(demoRequestsTable)
      .values({ ...parsed.data, status: "provisioning" })
      .returning();

    // Provision asynchronously so the HTTP response returns quickly (~200ms)
    // The provisioning (seed + Clerk user + email) runs in background.
    provisionDemoAccount(request.id, {
      name: parsed.data.name,
      email: parsed.data.email,
      districtName: parsed.data.district,
      role,
    }).catch(async (err) => {
      logger.error({ err, requestId: request.id }, "demo provisioning failed");
      await db.update(demoRequestsTable)
        .set({ status: "failed" })
        .where(eq(demoRequestsTable.id, request.id))
        .catch(() => {});
    });

    res.status(202).json({
      ok: true,
      id: request.id,
      message: "Your demo is being provisioned — you'll receive login credentials by email within 60 seconds.",
    });
  } catch (err) {
    logger.error({ err }, "POST /demo-requests error");
    res.status(500).json({ error: "Failed to submit demo request" });
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Primary endpoint (existing)
router.post("/demo-requests", handleDemoRequest);

// Spec-aligned alias — POST /demo/request → same handler
router.post("/demo/request", handleDemoRequest);

router.get("/demo-requests", async (req: Request, res: Response): Promise<void> => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }
    const meta = getPublicMeta(req);
    if (!meta.platformAdmin) {
      res.status(403).json({ error: "Platform admin access required" });
      return;
    }

    const requests = await db
      .select()
      .from(demoRequestsTable)
      .orderBy(desc(demoRequestsTable.createdAt));

    res.json(requests);
  } catch (err) {
    logger.error({ err }, "GET /demo-requests error");
    res.status(500).json({ error: "Failed to fetch demo requests" });
  }
});

/**
 * GET /demo-districts — returns active demo districts for the platform-admin view.
 * Joins with demo_requests to surface requester info.
 */
router.get("/demo-districts", async (req: Request, res: Response): Promise<void> => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }
    const meta = getPublicMeta(req);
    if (!meta.platformAdmin) {
      res.status(403).json({ error: "Platform admin access required" });
      return;
    }

    const districts = await db
      .select({
        id: districtsTable.id,
        name: districtsTable.name,
        demoExpiresAt: districtsTable.demoExpiresAt,
        hasSampleData: districtsTable.hasSampleData,
        createdAt: districtsTable.createdAt,
      })
      .from(districtsTable)
      .where(eq(districtsTable.isDemo, true))
      .orderBy(desc(districtsTable.createdAt));

    const requests = await db
      .select({
        districtId: demoRequestsTable.districtId,
        name: demoRequestsTable.name,
        email: demoRequestsTable.email,
        role: demoRequestsTable.role,
        status: demoRequestsTable.status,
        provisionedAt: demoRequestsTable.provisionedAt,
      })
      .from(demoRequestsTable)
      .where(isNotNull(demoRequestsTable.districtId));

    const reqByDistrict = new Map(requests.map(r => [r.districtId, r]));

    const now = new Date();
    const result = districts.map(d => {
      const req = reqByDistrict.get(d.id);
      const expired = d.demoExpiresAt ? d.demoExpiresAt < now : false;
      return {
        ...d,
        expired,
        requester: req ? {
          name: req.name,
          email: req.email,
          role: req.role,
          status: req.status,
          provisionedAt: req.provisionedAt,
        } : null,
      };
    });

    res.json(result);
  } catch (err) {
    logger.error({ err }, "GET /demo-districts error");
    res.status(500).json({ error: "Failed to fetch demo districts" });
  }
});

export default router;
