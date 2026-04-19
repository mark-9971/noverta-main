import { db } from "@workspace/db";
import { sisConnectionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { enqueueSyncJob } from "./jobQueue";
import { withMonitor } from "../sentry";

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

const SCHEDULE_CONFIG: Record<string, { intervalHours: number }> = {
  nightly: { intervalHours: 24 },
  hourly: { intervalHours: 1 },
  every_6h: { intervalHours: 6 },
  every_12h: { intervalHours: 12 },
  manual: { intervalHours: Infinity },
};

async function runScheduledSyncs(): Promise<{ enqueueFailures: number }> {
  const now = new Date();
  let enqueueFailures = 0;

  // We deliberately let a top-level connection-query error escape this
  // function so the cron monitor wrapper signals a failed check-in for
  // it. Per-connection enqueue failures are counted and surfaced via the
  // return value (the caller decides whether to throw to fail the tick).
  const connections = await db.select()
    .from(sisConnectionsTable)
    .where(and(eq(sisConnectionsTable.enabled, true), eq(sisConnectionsTable.status, "connected")));

  for (const conn of connections) {
    if (conn.provider === "csv") continue;

    const schedule = SCHEDULE_CONFIG[conn.syncSchedule] ?? SCHEDULE_CONFIG.nightly;
    if (schedule.intervalHours === Infinity) continue;

    const lastSync = conn.lastSyncAt ? new Date(conn.lastSyncAt).getTime() : 0;
    const hoursSinceSync = (now.getTime() - lastSync) / (1000 * 60 * 60);

    if (hoursSinceSync < schedule.intervalHours) continue;

    // Enqueue rather than run inline. The job queue dedupes — if a
    // job is already queued or running for this connection, we get
    // back the existing one instead of stacking duplicates across the
    // 15-minute scheduler ticks.
    try {
      const { job, duplicate } = await enqueueSyncJob({
        connectionId: conn.id,
        syncType: "full",
        triggeredBy: `scheduler:${conn.syncSchedule}`,
      });
      if (duplicate) {
        console.log(`[SIS Scheduler] Skipped enqueue for connection ${conn.id}: existing job ${job.id} (${job.status})`);
      } else {
        console.log(`[SIS Scheduler] Enqueued sync job ${job.id} for connection ${conn.id} (${conn.provider}, schedule: ${conn.syncSchedule})`);
      }
    } catch (err) {
      enqueueFailures += 1;
      console.error(`[SIS Scheduler] Enqueue failed for connection ${conn.id}:`, err);
    }
  }

  return { enqueueFailures };
}

async function runMonitoredScheduledSyncs(): Promise<void> {
  await withMonitor(
    "sis-scheduler",
    { type: "interval", value: 15, unit: "minute" },
    { checkinMargin: 3, maxRuntime: 10 },
    async () => {
      const { enqueueFailures } = await runScheduledSyncs();
      if (enqueueFailures > 0) {
        // Throw so withMonitor signals a failed check-in. Per-connection
        // errors are already logged inside runScheduledSyncs.
        throw new Error(
          `SIS scheduler tick had ${enqueueFailures} enqueue failure(s) — see [SIS Scheduler] logs above for details.`,
        );
      }
    },
  );
}

export function startSisScheduler(): void {
  if (schedulerInterval) return;

  console.log("[SIS Scheduler] Started — checking every 15 minutes");
  schedulerInterval = setInterval(() => {
    runMonitoredScheduledSyncs().catch((err) =>
      console.error("[SIS Scheduler] Tick failed:", err),
    );
  }, CHECK_INTERVAL_MS);

  setTimeout(() => {
    runMonitoredScheduledSyncs().catch((err) =>
      console.error("[SIS Scheduler] Initial tick failed:", err),
    );
  }, 5000);
}

export function stopSisScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[SIS Scheduler] Stopped");
  }
}

export const VALID_SCHEDULES = Object.keys(SCHEDULE_CONFIG);
