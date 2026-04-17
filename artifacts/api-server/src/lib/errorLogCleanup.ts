import { db } from "@workspace/db";
import { lt } from "drizzle-orm";
import { errorLogsTable } from "@workspace/db";
import { logger } from "./logger";

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 30;

async function pruneOldErrorLogs(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const deleted = await db
      .delete(errorLogsTable)
      .where(lt(errorLogsTable.occurredAt, cutoff))
      .returning({ id: errorLogsTable.id })
      .then((rows) => rows.length);
    if (deleted > 0) {
      logger.info({ deleted, retentionDays: RETENTION_DAYS }, "Pruned old error_log rows");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to prune error_log rows (non-fatal)");
  }
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startErrorLogCleanup(): void {
  if (cleanupInterval) return;
  void pruneOldErrorLogs();
  cleanupInterval = setInterval(() => {
    void pruneOldErrorLogs();
  }, CLEANUP_INTERVAL_MS);
  logger.info({ intervalHours: CLEANUP_INTERVAL_MS / 3_600_000, retentionDays: RETENTION_DAYS }, "error_log cleanup scheduler started");
}
