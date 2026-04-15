import { db } from "@workspace/db";
import { sisConnectionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { runSync } from "./syncEngine";

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
const NIGHTLY_HOUR = 2;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

async function runScheduledSyncs(): Promise<void> {
  const now = new Date();
  if (now.getHours() !== NIGHTLY_HOUR) return;

  try {
    const connections = await db.select()
      .from(sisConnectionsTable)
      .where(
        and(
          eq(sisConnectionsTable.enabled, true),
          eq(sisConnectionsTable.syncSchedule, "nightly"),
        ),
      );

    for (const conn of connections) {
      if (conn.provider === "csv") continue;

      const lastSync = conn.lastSyncAt ? new Date(conn.lastSyncAt).getTime() : 0;
      const hoursSinceSync = (now.getTime() - lastSync) / (1000 * 60 * 60);

      if (hoursSinceSync < 20) continue;

      console.log(`[SIS Scheduler] Running nightly sync for connection ${conn.id} (${conn.provider})`);
      try {
        await runSync(conn.id, "full", "scheduler:nightly");
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

  console.log("[SIS Scheduler] Started — nightly syncs at 2:00 AM");
  schedulerInterval = setInterval(runScheduledSyncs, CHECK_INTERVAL_MS);

  runScheduledSyncs();
}

export function stopSisScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[SIS Scheduler] Stopped");
  }
}
