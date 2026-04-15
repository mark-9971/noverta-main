import { db } from "@workspace/db";
import { sisConnectionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { runSync } from "./syncEngine";

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

const SCHEDULE_CONFIG: Record<string, { intervalHours: number }> = {
  nightly: { intervalHours: 24 },
  hourly: { intervalHours: 1 },
  every_6h: { intervalHours: 6 },
  every_12h: { intervalHours: 12 },
  manual: { intervalHours: Infinity },
};

async function runScheduledSyncs(): Promise<void> {
  const now = new Date();

  try {
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

      console.log(`[SIS Scheduler] Running scheduled sync for connection ${conn.id} (${conn.provider}, schedule: ${conn.syncSchedule})`);
      try {
        await runSync(conn.id, "full", `scheduler:${conn.syncSchedule}`);
        console.log(`[SIS Scheduler] Completed sync for connection ${conn.id}`);
      } catch (err) {
        console.error(`[SIS Scheduler] Sync failed for connection ${conn.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[SIS Scheduler] Failed to query connections:", err);
  }
}

export function startSisScheduler(): void {
  if (schedulerInterval) return;

  console.log("[SIS Scheduler] Started — checking every 15 minutes");
  schedulerInterval = setInterval(runScheduledSyncs, CHECK_INTERVAL_MS);

  setTimeout(runScheduledSyncs, 5000);
}

export function stopSisScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[SIS Scheduler] Stopped");
  }
}

export const VALID_SCHEDULES = Object.keys(SCHEDULE_CONFIG);
