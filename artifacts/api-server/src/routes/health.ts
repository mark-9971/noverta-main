import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getErrorCount1h, sentryInitialized } from "../lib/sentry";

// tenant-scope: public
const router: IRouter = Router();
const startedAt = Date.now();

router.get("/health", async (_req, res) => {
  const uptime = Math.floor((Date.now() - startedAt) / 1000);
  const version = process.env.npm_package_version ?? "unknown";

  let dbStatus: "connected" | "error" = "connected";
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    logger.error({ err }, "Health check: database error");
    dbStatus = "error";
  }

  const status = dbStatus === "connected" ? "ok" : "degraded";
  const httpStatus = dbStatus === "connected" ? 200 : 503;

  res.status(httpStatus).json({
    status,
    db: dbStatus,
    uptime,
    version,
    timestamp: new Date().toISOString(),
    errors: {
      last1h: getErrorCount1h(),
    },
    sentry: sentryInitialized() ? "enabled" : "disabled",
  });
});

router.get("/healthz", async (_req, res) => {
  res.json({ status: "ok" });
});

export default router;
