import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { errorLogsTable } from "@workspace/db";
import { sql, gte, count } from "drizzle-orm";
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

  const errors24h = await getErrorCount24h();

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
    sentry: sentryInitialized() ? "enabled" : "disabled",
  });
});

router.get("/healthz", async (_req, res) => {
  res.json({ status: "ok" });
});

export default router;
