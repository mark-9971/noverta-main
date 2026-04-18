import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { errorLogsTable, auditLogsTable } from "@workspace/db";
import { sql, gte, count, eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getErrorCount1h, sentryInitialized } from "../lib/sentry";

// tenant-scope: public
const router: IRouter = Router();
const startedAt = Date.now();

async function getErrorCount24h(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [row] = await db
      .select({ count: count() })
      .from(errorLogsTable)
      .where(gte(errorLogsTable.occurredAt, cutoff));
    return row?.count ?? 0;
  } catch (err) {
    logger.warn({ err }, "Failed to query error_log count");
    return 0;
  }
}

async function getRateLimitBreachCount24h(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [row] = await db
      .select({ count: count() })
      .from(auditLogsTable)
      .where(
        and(
          eq(auditLogsTable.action, "rate_limit_exceeded"),
          gte(auditLogsTable.createdAt, cutoff),
        ),
      );
    return row?.count ?? 0;
  } catch (err) {
    logger.warn({ err }, "Failed to query rate_limit breach count");
    return 0;
  }
}

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

  const [errors24h, rateLimitBreaches24h] = await Promise.all([
    getErrorCount24h(),
    getRateLimitBreachCount24h(),
  ]);

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
      last24h: errors24h,
    },
    rateLimits: {
      breachesLast24h: rateLimitBreaches24h,
    },
    sentry: sentryInitialized() ? "enabled" : "disabled",
  });
});

router.get("/healthz", async (_req, res) => {
  res.json({ status: "ok" });
});

export default router;
