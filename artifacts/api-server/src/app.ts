import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import healthRouter from "./routes/health";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./lib/webhookHandlers";
import { requireActiveSubscription } from "./middlewares/subscriptionGate";
import { enforceDistrictScope } from "./middlewares/auth";
import { captureException, recordError5xx } from "./lib/sentry";
import { getPublicMeta, getClerkUserId } from "./lib/clerkClaims";
import { db } from "@workspace/db";
import { communicationEventsTable, errorLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

      // Look up the row first so we can enforce monotonic-state semantics
      // (a late `email.sent` after `email.delivered` must NOT downgrade us
      //  back to accepted).
      const [existing] = await db
        .select({ id: communicationEventsTable.id, status: communicationEventsTable.status })
        .from(communicationEventsTable)
        .where(eq(communicationEventsTable.providerMessageId, providerMessageId))
        .limit(1);

      if (!existing) {
        logger.info({ providerMessageId, eventType }, 'Resend webhook: no matching communication_event row');
        res.status(200).json({ ok: true, note: 'unknown email_id' });
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

app.use(healthRouter);
app.use("/api", requireActiveSubscription);
// Enforce tenant isolation: in production, overrides districtId query param from auth token
app.use("/api", enforceDistrictScope);
app.use("/api", router);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
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
    let userId: string | undefined;
    let districtId: string | undefined;
    try {
      userId = getClerkUserId(req) ?? undefined;
      const meta = getPublicMeta(req);
      districtId = meta.districtId != null ? String(meta.districtId) : undefined;
    } catch {}
    captureException(err, { method: req.method, url: req.url, status, userId, schoolId: districtId });
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
