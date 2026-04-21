import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { clerkMiddleware, clerkClient } from "@clerk/express";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import healthRouter from "./routes/health";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./lib/webhookHandlers";
import { requireActiveSubscription } from "./middlewares/subscriptionGate";
import { enforceDistrictScope } from "./middlewares/auth";
import * as Sentry from "@sentry/node";
import { recordError5xx } from "./lib/sentry";
import { getPublicMeta, getClerkUserId } from "./lib/clerkClaims";
import { db } from "@workspace/db";
import { communicationEventsTable, emailDeliveriesTable, errorLogsTable, staffTable, schoolsTable, districtsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { Webhook as SvixWebhook } from "svix";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) { res.status(400).json({ error: 'Missing stripe-signature' }); return; }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!Buffer.isBuffer(req.body)) {
        logger.error('Stripe webhook: req.body is not a Buffer');
        res.status(500).json({ error: 'Webhook processing error' }); return;
      }
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Stripe webhook error');
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.post(
  '/webhooks/resend',
  express.raw({ type: 'application/json', limit: '1mb' }),
  async (req, res) => {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.warn('RESEND_WEBHOOK_SECRET not configured — Resend webhook rejected');
      res.status(501).json({ error: 'Webhook secret not configured' });
      return;
    }

    const svixId = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature = req.headers['svix-signature'];

    if (!svixId || !svixTimestamp || !svixSignature) {
      res.status(400).json({ error: 'Missing required Svix webhook headers' });
      return;
    }

    let event: { type?: string; data?: { email_id?: string } };
    try {
      const wh = new SvixWebhook(webhookSecret);
      const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf-8') : String(req.body);
      event = wh.verify(payload, {
        'svix-id': String(svixId),
        'svix-timestamp': String(svixTimestamp),
        'svix-signature': String(svixSignature),
      }) as { type?: string; data?: { email_id?: string } };
    } catch (err: unknown) {
      logger.warn({ err }, 'Resend webhook signature verification failed');
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    try {
      const providerMessageId = event?.data?.email_id ?? null;
      if (!providerMessageId) {
        res.status(200).json({ ok: true, note: 'no email_id' });
        return;
      }
      const now = new Date();
      const eventType = String(event.type ?? '');

      // --- Update email_deliveries rows (for parent-facing emails) ---
      const [existingDelivery] = await db
        .select({ id: emailDeliveriesTable.id, status: emailDeliveriesTable.status })
        .from(emailDeliveriesTable)
        .where(eq(emailDeliveriesTable.providerMessageId, providerMessageId))
        .limit(1);

      if (existingDelivery) {
        const PRE_TERMINAL_D = new Set(['queued', 'accepted']);
        const dBase = { lastWebhookEventType: eventType, lastWebhookAt: now, updatedAt: now };
        let dSet: Record<string, unknown> = { ...dBase };
        if (eventType === 'email.sent') {
          if (existingDelivery.status === 'queued') { dSet.status = 'accepted'; dSet.acceptedAt = now; }
        } else if (eventType === 'email.delivered') {
          if (PRE_TERMINAL_D.has(existingDelivery.status)) { dSet.status = 'delivered'; dSet.deliveredAt = now; }
        } else if (eventType === 'email.bounced') {
          dSet.failedAt = now;
          if (PRE_TERMINAL_D.has(existingDelivery.status)) { dSet.status = 'bounced'; dSet.failedReason = eventType; }
        } else if (eventType === 'email.complained') {
          if (PRE_TERMINAL_D.has(existingDelivery.status)) { dSet.status = 'complained'; dSet.failedAt = now; dSet.failedReason = eventType; }
        } else if (eventType === 'email.failed') {
          if (PRE_TERMINAL_D.has(existingDelivery.status)) { dSet.status = 'failed'; dSet.failedAt = now; dSet.failedReason = eventType; }
        }
        await db.update(emailDeliveriesTable).set(dSet).where(eq(emailDeliveriesTable.id, existingDelivery.id));
      }

      // --- Update communication_events rows (for incident/missed-service emails) ---
      // Look up the row first so we can enforce monotonic-state semantics
      // (a late `email.sent` after `email.delivered` must NOT downgrade us
      //  back to accepted).
      const [existing] = await db
        .select({ id: communicationEventsTable.id, status: communicationEventsTable.status })
        .from(communicationEventsTable)
        .where(eq(communicationEventsTable.providerMessageId, providerMessageId))
        .limit(1);

      if (!existing) {
        // The email may belong to email_deliveries only (parent-facing email).
        if (existingDelivery) {
          logger.info({ providerMessageId, eventType }, 'Resend webhook: updated email_deliveries row');
        } else {
          logger.info({ providerMessageId, eventType }, 'Resend webhook: no matching row in either table');
        }
        res.status(200).json({ ok: true, note: existingDelivery ? 'email_delivery_updated' : 'unknown email_id' });
        return;
      }

      // Strict monotonicity: once a row reaches a terminal state we DO NOT
      // overwrite the status field. Late or out-of-order webhooks (e.g. a
      // `email.bounced` arriving after `email.failed`, or a duplicate
      // `email.delivered`) only update auxiliary timestamps + lastWebhook*.
      // This is the legally important invariant: the visible status of a
      // delivered email cannot silently flip to "bounced", and vice versa.
      //
      // Exception: a `email.complained` after `email.delivered` keeps status
      // as `delivered` but records `complainedAt` so the UI can surface the
      // spam-flag without retroactively claiming non-delivery. The audit
      // log component reads `complainedAt`/`bouncedAt` independently of
      // `status` to render the correct badge.
      const TERMINAL = new Set(['delivered', 'bounced', 'complained', 'failed']);
      const PRE_TERMINAL = new Set(['queued', 'accepted', 'sent']); // 'sent' = legacy alias

      // Always stamp last-webhook fields so ops can see provider activity
      // even when we do not change status. updatedAt is bumped to make
      // activity visible in audit-log queries.
      const baseSet = { lastWebhookEventType: eventType, lastWebhookAt: now, updatedAt: now };

      if (eventType === 'email.sent') {
        // Resend's `email.sent` mirrors our synchronous accept; treat as a
        // no-op state-wise unless we somehow missed the API ack and the row
        // is still queued. Never downgrade a terminal status.
        const set: Record<string, unknown> = { ...baseSet };
        if (existing.status === 'queued') {
          set.status = 'accepted';
          set.acceptedAt = now;
          set.sentAt = now;
        }
        await db.update(communicationEventsTable).set(set).where(eq(communicationEventsTable.id, existing.id));
      } else if (eventType === 'email.delivered') {
        // Idempotent: only flip status from a pre-terminal state.
        const set: Record<string, unknown> = { ...baseSet };
        if (PRE_TERMINAL.has(existing.status)) {
          set.status = 'delivered';
          set.deliveredAt = now;
        }
        await db.update(communicationEventsTable).set(set).where(eq(communicationEventsTable.id, existing.id));
      } else if (eventType === 'email.delivery_delayed') {
        // Provider is still trying. Don't change status — just record activity.
        await db.update(communicationEventsTable).set(baseSet).where(eq(communicationEventsTable.id, existing.id));
      } else if (eventType === 'email.bounced') {
        // Terminal: never overwrite delivered, complained, or failed.
        const set: Record<string, unknown> = { ...baseSet };
        // bouncedAt is recorded regardless so ops can see the provider event,
        // but the visible status only flips from a pre-terminal state.
        set.bouncedAt = now;
        if (PRE_TERMINAL.has(existing.status)) {
          set.status = 'bounced';
          set.failedAt = now;
          set.failedReason = eventType;
        }
        await db.update(communicationEventsTable).set(set).where(eq(communicationEventsTable.id, existing.id));
      } else if (eventType === 'email.complained') {
        // Spam complaint — record complainedAt unconditionally so the UI can
        // surface a "Marked spam" badge even when the email was delivered
        // first. Status only flips from pre-terminal; we deliberately do
        // NOT downgrade `delivered` to `complained` (the email did reach
        // the inbox), the UI keys off complainedAt to show the warning.
        const set: Record<string, unknown> = { ...baseSet };
        set.complainedAt = now;
        if (PRE_TERMINAL.has(existing.status)) {
          set.status = 'complained';
          set.failedAt = now;
          set.failedReason = eventType;
        }
        await db.update(communicationEventsTable).set(set).where(eq(communicationEventsTable.id, existing.id));
      } else if (eventType === 'email.failed') {
        const set: Record<string, unknown> = { ...baseSet };
        if (PRE_TERMINAL.has(existing.status)) {
          set.status = 'failed';
          set.failedAt = now;
          set.failedReason = eventType;
        }
        await db.update(communicationEventsTable).set(set).where(eq(communicationEventsTable.id, existing.id));
      } else {
        // email.opened / email.clicked / unknown — don't change status,
        // just leave a trail.
        await db.update(communicationEventsTable).set(baseSet).where(eq(communicationEventsTable.id, existing.id));
        logger.info({ eventType }, 'Resend webhook: informational event — no status change');
      }

      res.status(200).json({ ok: true });
    } catch (err: unknown) {
      logger.error({ err }, 'Resend webhook DB update error');
      res.status(500).json({ error: 'Internal error processing webhook' });
    }
  }
);

const rawOrigins = process.env.CORS_ALLOWED_ORIGINS;
const corsOrigin: cors.CorsOptions["origin"] = rawOrigins
  ? rawOrigins.split(",").map((o) => o.trim())
  : process.env.NODE_ENV === "production"
    ? false
    : true;
app.use(cors({ credentials: true, origin: corsOrigin }));

const readLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  skip: () => process.env.NODE_ENV === "test",
});

const mutationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many write requests, please slow down." },
  skip: (req) => process.env.NODE_ENV === "test" || ["GET", "HEAD", "OPTIONS"].includes(req.method),
});

app.use("/api", readLimiter);
app.use("/api", mutationLimiter);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.use(clerkMiddleware());

// ---------------------------------------------------------------------------
// E2E test provisioning — development/test environments only.
// Creates (or verifies) a dedicated admin staff record for the Clerk E2E test
// user and writes publicMetadata.staffId back to that Clerk user so that
// terminal-state incident transitions and parent-notification review
// endpoints can resolve an actor identity.
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV !== "production") {
  app.post("/api/e2e/setup", async (req: Request, res: Response) => {
    // Require a shared secret to prevent arbitrary callers from mutating Clerk
    // metadata and creating staff rows in non-production shared environments.
    // Falls back to "e2e-dev-local" when E2E_PROVISION_KEY is unset (pure local dev).
    const expectedKey = process.env.E2E_PROVISION_KEY ?? "e2e-dev-local";
    const sentKey = req.headers["x-e2e-key"];
    if (sentKey !== expectedKey) {
      res.status(403).json({ error: "Invalid or missing X-E2E-Key header." });
      return;
    }

    const { email, role: requestedRole, districtSlot: requestedSlot } = req.body as {
      email?: string;
      role?: string;
      districtSlot?: string;
    };
    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "email is required" });
      return;
    }
    // Whitelist the roles we let the e2e provisioner assign. "admin" is the
    // default (preserves existing behaviour); "sped_teacher" is used by the
    // non-admin checklist-visibility test.
    const ALLOWED_ROLES = ["admin", "sped_teacher"] as const;
    type AllowedRole = (typeof ALLOWED_ROLES)[number];
    const role: AllowedRole = ALLOWED_ROLES.includes(
      (requestedRole ?? "admin") as AllowedRole,
    )
      ? ((requestedRole ?? "admin") as AllowedRole)
      : "admin";
    // districtSlot lets the cross-district E2E spec pin Admin C into a
    // dedicated second district while Admin A/B share the existing primary.
    // Backwards-compatible: when omitted we default to "primary" and the
    // resolution rules match the original (single-district) behaviour.
    const SECONDARY_DISTRICT_NAME = "E2E Secondary District";
    const districtSlot: "primary" | "secondary" =
      requestedSlot === "secondary" ? "secondary" : "primary";
    try {
      const { data: users } = await clerkClient.users.getUserList({
        emailAddress: [email],
      });
      let user = users[0];
      if (!user) {
        // Auto-create Clerk testing users when the email matches Clerk's
        // reserved `+clerk_test@` testing pattern. This unblocks E2E
        // provisioning in fresh / shared dev environments without requiring
        // manual Clerk dashboard setup. Gated by NODE_ENV !== "production"
        // and the X-E2E-Key shared secret already enforced above.
        const isClerkTestEmail = /\+clerk_test@/.test(email);
        if (!isClerkTestEmail) {
          res
            .status(404)
            .json({ error: `No Clerk user found with email: ${email}` });
          return;
        }
        try {
          // Random 24-char password — never used; testing-token sign-in path
          // bypasses password verification for +clerk_test@ users.
          const tempPassword =
            Math.random().toString(36).slice(2) +
            Math.random().toString(36).slice(2).toUpperCase() +
            "!9";
          user = await clerkClient.users.createUser({
            emailAddress: [email],
            password: tempPassword,
            firstName: "E2E",
            lastName: role === "admin" ? "Admin" : "Teacher",
          });
        } catch (createErr) {
          res.status(502).json({
            error: `Failed to create Clerk testing user ${email}: ${
              createErr instanceof Error ? createErr.message : String(createErr)
            }`,
          });
          return;
        }
      }
      const meta = (user.publicMetadata ?? {}) as Record<string, unknown>;

      // Resolve or discover the district for this user up front, because the
      // alreadyProvisioned short-circuit must verify the existing scope still
      // matches the requested districtSlot (otherwise re-provisioning Admin C
      // into "secondary" after a stale Clerk metadata stamp could silently
      // leave them in the primary district).
      let districtId: number | null = null;
      if (districtSlot === "secondary") {
        const [existing] = await db
          .select({ id: districtsTable.id })
          .from(districtsTable)
          .where(eq(districtsTable.name, SECONDARY_DISTRICT_NAME))
          .limit(1);
        if (existing) {
          districtId = existing.id;
        } else {
          const [created] = await db
            .insert(districtsTable)
            .values({ name: SECONDARY_DISTRICT_NAME })
            .returning({ id: districtsTable.id });
          districtId = created.id;
        }
      } else {
        // Primary slot — prefer existing Clerk metadata when it points at a
        // district that is NOT the secondary one, otherwise pick the first
        // non-secondary district in the table.
        if (typeof meta.districtId === "number") {
          const [d] = await db
            .select({ id: districtsTable.id, name: districtsTable.name })
            .from(districtsTable)
            .where(eq(districtsTable.id, meta.districtId as number))
            .limit(1);
          if (d && d.name !== SECONDARY_DISTRICT_NAME) districtId = d.id;
        }
        if (!districtId) {
          const all = await db
            .select({ id: districtsTable.id, name: districtsTable.name })
            .from(districtsTable);
          const primary = all.find((d) => d.name !== SECONDARY_DISTRICT_NAME);
          if (!primary) {
            res.status(422).json({
              error:
                "No district found in the database. Complete onboarding first.",
            });
            return;
          }
          districtId = primary.id;
        }
      }

      // If staffId is already set, the DB record still exists, the role
      // matches the requested one, AND the existing district matches the
      // resolved one for the requested slot, return early.
      if (
        typeof meta.staffId === "number" &&
        meta.role === role &&
        meta.districtId === districtId
      ) {
        const [existing] = await db
          .select({ id: staffTable.id })
          .from(staffTable)
          .where(eq(staffTable.id, meta.staffId as number));
        if (existing) {
          res.json({
            staffId: meta.staffId,
            districtId: meta.districtId,
            alreadyProvisioned: true,
          });
          return;
        }
      }

      // Resolve or create a school in that district.
      let [school] = await db
        .select({ id: schoolsTable.id })
        .from(schoolsTable)
        .where(eq(schoolsTable.districtId, districtId))
        .limit(1);
      if (!school) {
        [school] = await db
          .insert(schoolsTable)
          .values({ districtId, name: "E2E Test School" })
          .returning({ id: schoolsTable.id });
      }

      // Find or create the E2E admin staff record scoped to this school.
      let [staff] = await db
        .select({ id: staffTable.id, role: staffTable.role })
        .from(staffTable)
        .where(
          and(
            eq(staffTable.email, email),
            eq(staffTable.schoolId, school.id),
          ),
        );
      if (!staff) {
        [staff] = await db
          .insert(staffTable)
          .values({
            firstName: "E2E",
            lastName: role === "admin" ? "Admin" : "Teacher",
            email,
            role,
            title:
              role === "admin"
                ? "System Administrator (E2E Test)"
                : "Special Education Teacher (E2E Test)",
            schoolId: school.id,
            status: "active",
          })
          .returning({ id: staffTable.id, role: staffTable.role });
      } else if (staff.role !== role) {
        // Existing staff row exists but with a different role — sync it so
        // the DB and Clerk metadata don't diverge.
        await db
          .update(staffTable)
          .set({
            role,
            title:
              role === "admin"
                ? "System Administrator (E2E Test)"
                : "Special Education Teacher (E2E Test)",
          })
          .where(eq(staffTable.id, staff.id));
      }

      // Persist staffId, districtId, and role back to Clerk. Always overwrite
      // role with the requested value so re-provisioning a user with a
      // different role (e.g. flipping admin→sped_teacher) takes effect.
      await clerkClient.users.updateUser(user.id, {
        publicMetadata: {
          ...meta,
          staffId: staff.id,
          districtId,
          role,
        },
      });

      logger.info(
        { email, role, staffId: staff.id, districtId },
        "E2E staff provisioned",
      );
      res.json({ staffId: staff.id, districtId });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "E2E setup failed");
      res.status(500).json({ error: `E2E setup failed: ${message}` });
    }
  });
}

app.use(healthRouter);


app.use("/api", requireActiveSubscription);
// Enforce tenant isolation in EVERY environment: overrides any client-supplied
// districtId query param with the token-derived value and strips schoolId so
// crafted query strings cannot cross tenant boundaries. See enforceDistrictScope.
app.use("/api", enforceDistrictScope);
logger.info(
  { env: process.env.NODE_ENV ?? "development" },
  "tenant-scope clamping mounted globally on /api (enforceDistrictScope)",
);

// Enrich every request scope with Clerk user/district context so any event
// captured downstream (manual captureException, expressIntegration, the
// 5xx handler below) automatically carries those tags.
app.use((req: Request, _res: Response, next: NextFunction) => {
  try {
    const userId = getClerkUserId(req) ?? undefined;
    if (userId) Sentry.setUser({ id: userId });
    const meta = getPublicMeta(req);
    const districtId = meta.districtId != null ? String(meta.districtId) : undefined;
    if (districtId) Sentry.setTag("districtId", districtId);
    if (typeof meta.role === "string") Sentry.setTag("role", meta.role);
  } catch {}
  next();
});

app.use("/api", router);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Sentry's Express error handler: attaches request URL, method, route,
// headers, and active scope (user/district set above) to every captured
// event, then defers to our handler below to render the response and
// persist the error_log row.
Sentry.setupExpressErrorHandler(app, {
  shouldHandleError(err: any) {
    const status = err?.status ?? err?.statusCode ?? 500;
    return status >= 500;
  },
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const status = (err as any).status || (err as any).statusCode || 500;

  logger.error(
    {
      err,
      method: req.method,
      url: req.url,
      status,
    },
    "Unhandled error",
  );

  if (status >= 500) {
    recordError5xx();
    const rawPath = req.url?.split("?")[0] ?? "/";
    const errPath = rawPath.length > 500 ? rawPath.slice(0, 500) : rawPath;
    const rawMsg = err instanceof Error ? err.message : String(err);
    const errMsg = rawMsg.length > 1000 ? rawMsg.slice(0, 1000) : rawMsg;
    db.insert(errorLogsTable)
      .values({ httpStatus: status, path: errPath, message: errMsg })
      .execute()
      .catch((dbErr) => logger.warn({ err: dbErr }, "Failed to persist error_log row"));
  }

  const isProduction = process.env.NODE_ENV === "production";
  const message = isProduction ? "Internal server error" : err.message;
  res.status(status).json({ error: message });
});

export default app;
