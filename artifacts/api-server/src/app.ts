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
    } catch (error: any) {
      logger.error({ err: error }, 'Stripe webhook error');
      res.status(400).json({ error: 'Webhook processing error' });
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

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

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
  }

  const isProduction = process.env.NODE_ENV === "production";
  const message = isProduction ? "Internal server error" : err.message;
  res.status(status).json({ error: message });
});

export default app;
