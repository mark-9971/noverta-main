/**
 * Background worker that drains the `sis_sync_jobs` queue.
 *
 * Lifecycle:
 *  1. `startSisWorker()` is called once during API boot. It first reaps
 *     any jobs left in `running` state by a previous (now-dead) process,
 *     then begins polling the queue every POLL_INTERVAL_MS.
 *  2. Each tick claims at most one job atomically. The worker invokes
 *     `runSync` with an `onProgress` callback that writes to the job's
 *     `progress` jsonb column so admins can see live phase changes.
 *  3. On success the job is marked `completed` and linked to its sync
 *     log row. On failure the queue applies retry/backoff or terminates.
 *  4. The worker keeps a single in-flight job at a time. SIS providers
 *     don't appreciate concurrent fetches against the same connection,
 *     and pilot scale doesn't need parallelism. Multiple workers across
 *     processes are still safe (claim is atomic) but unnecessary now.
 */

import { randomUUID } from "crypto";
import { runSync } from "./syncEngine";
import {
  claimNextJob,
  markCompleted,
  markFailed,
  reapStaleJobs,
  updateProgress,
} from "./jobQueue";
import type { SisSyncJob } from "@workspace/db";

const POLL_INTERVAL_MS = 5_000;
/**
 * How often (in poll ticks) to run the time-based stale reaper. Cheap
 * — a single indexed scan — but no need to do it every 5 s.
 */
const REAP_EVERY_TICKS = 12; // ≈ once per minute

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let stopped = true;
let ticksSinceReap = 0;
const workerId = `api-${process.pid}-${randomUUID().slice(0, 8)}`;

async function processOne(): Promise<boolean> {
  const job = await claimNextJob(workerId);
  if (!job) return false;

  console.log(
    `[SIS Worker] Claimed job ${job.id} (connection=${job.connectionId} type=${job.syncType} attempt=${job.attempts}/${job.maxAttempts})`,
  );

  try {
    const result = await runSync(job.connectionId, job.syncType as Parameters<typeof runSync>[1], job.triggeredBy ?? "worker", {
      csvData: job.payload?.csvText ? { csvText: job.payload.csvText } : undefined,
      onProgress: async (phase, info) => {
        await updateProgress(
          job.id,
          {
            phase,
            recordsProcessed: info?.recordsProcessed,
            totalRecords: info?.totalRecords,
            message: info?.message,
          },
          workerId,
        );
      },
    });
    await markCompleted(job.id, result.syncLogId, workerId);
    console.log(`[SIS Worker] Job ${job.id} completed (log=${result.syncLogId} records=${result.totalRecords})`);
  } catch (err) {
    const { retried } = await markFailed(job.id, err, workerId);
    console.error(
      `[SIS Worker] Job ${job.id} failed (${retried ? "will retry" : "terminal"}):`,
      err instanceof Error ? err.message : err,
    );
  }
  return true;
}

async function tick(): Promise<void> {
  if (stopped || running) {
    schedule();
    return;
  }
  running = true;
  try {
    // Periodic stale reaper. Catches jobs whose owning worker died but
    // whose `lockedAt` ages into the stale window only after this
    // process is already up. Without this, a job that goes stale
    // mid-uptime would never get rescued — only a restart would.
    ticksSinceReap++;
    if (ticksSinceReap >= REAP_EVERY_TICKS) {
      ticksSinceReap = 0;
      try {
        const reaped = await reapStaleJobs(workerId, "stale");
        if (reaped > 0) console.warn(`[SIS Worker] Periodic reaper recovered ${reaped} stale job(s)`);
      } catch (err) {
        console.error("[SIS Worker] Periodic reaper failed:", err);
      }
    }
    // Drain greedily — if a job completes quickly, pick the next one
    // immediately rather than waiting POLL_INTERVAL_MS. This keeps a
    // backlog from sitting around just because the poll cadence is slow.
    let processed = 0;
    while (!stopped && (await processOne())) {
      processed++;
      // Soft cap per tick so we yield back to the event loop and the
      // reaper / other timers get a chance to run.
      if (processed >= 5) break;
    }
  } catch (err) {
    console.error("[SIS Worker] Unexpected error in tick:", err);
  } finally {
    running = false;
    schedule();
  }
}

function schedule(): void {
  if (stopped) return;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
}

export async function startSisWorker(): Promise<void> {
  if (!stopped) return;
  stopped = false;
  console.log(`[SIS Worker] Starting (id=${workerId}, poll=${POLL_INTERVAL_MS}ms)`);
  try {
    // Startup uses `foreign` mode: reap any `running` row not owned
    // by this worker, even if its lock is recent. In single-process
    // pilot deployments this is the difference between "API restart
    // mid-sync recovers in seconds" and "stuck for 15 minutes until
    // the time-based threshold trips".
    const reaped = await reapStaleJobs(workerId, "foreign");
    if (reaped > 0) {
      console.warn(`[SIS Worker] Reaped ${reaped} stale running job(s) from a previous process`);
    }
  } catch (err) {
    console.error("[SIS Worker] Reaper failed on startup:", err);
  }
  // Kick the first tick on the next loop so callers don't block on it.
  setImmediate(tick);
}

export function stopSisWorker(): void {
  stopped = true;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  console.log("[SIS Worker] Stopped");
}

export const __test__ = {
  processOne,
  workerId: () => workerId,
  isStopped: () => stopped,
};

export type { SisSyncJob };
