/**
 * Durable job queue for SIS sync. Backed by the `sis_sync_jobs` Postgres
 * table — there is no external broker. The contract:
 *
 * - Enqueue inserts a row in status `queued` with `scheduledFor=now()`.
 * - A worker calls `claimNextJob(workerId)` which atomically promotes one
 *   queued job to `running`, recording `lockedAt`/`lockedBy`/`startedAt`
 *   and incrementing `attempts`. The claim uses
 *   `FOR UPDATE SKIP LOCKED` so multiple workers can poll the same table
 *   without stepping on each other.
 * - On success the worker calls `markCompleted(jobId, syncLogId)`.
 * - On failure the worker calls `markFailed(jobId, err)`. If the attempt
 *   counter is below `maxAttempts` the job is rescheduled with
 *   exponential backoff and returns to `queued`. Otherwise it terminates
 *   in `failed`.
 * - On startup `reapStaleJobs()` finds rows still in `running` whose
 *   `lockedAt` is older than the stale threshold (the worker that owned
 *   them died, e.g. API restart mid-sync) and treats them as a failure
 *   so retry/backoff applies. Without the reaper, an interrupted sync
 *   would be a permanent zombie that blocks dedupe forever.
 */

import { db } from "@workspace/db";
import { sisSyncJobsTable } from "@workspace/db";
import type { SisSyncJob, SyncJobError, SyncJobPayload, SyncJobProgress } from "@workspace/db";
import { sql, eq, and, inArray, lt, desc } from "drizzle-orm";

/**
 * Maximum time a job can sit in `running` before the reaper assumes the
 * worker that owned it crashed. Set conservatively above the longest
 * realistic sync duration so we don't reap a healthy long-running job.
 * Pilot scale rosters complete in <2 min; we use 15 min as the cutoff.
 */
const STALE_RUNNING_THRESHOLD_MS = 15 * 60 * 1000;

/**
 * Backoff schedule (ms) keyed by upcoming attempt index. Index 0 is the
 * first retry after a failure (i.e. attempts will be 2 when this delay is
 * applied). The schedule is intentionally short for pilot reliability —
 * the typical failure mode is a transient SIS API blip.
 */
const RETRY_BACKOFF_MS = [30_000, 2 * 60_000, 10 * 60_000];

export interface EnqueueArgs {
  connectionId: number;
  syncType: "full" | "students" | "staff" | "csv_students" | "csv_staff";
  triggeredBy: string;
  payload?: SyncJobPayload;
  /** Skip the dedupe check. Default false. */
  allowDuplicate?: boolean;
}

export interface EnqueueResult {
  job: SisSyncJob;
  duplicate: boolean;
}

/**
 * Enqueue a new sync job. By default, if there's already a `queued` or
 * `running` job for this connection we return the existing one rather
 * than piling on duplicates — the scheduler relies on this to be
 * idempotent across its 15-min check tick.
 *
 * Dedupe is enforced *atomically* by the partial unique index
 * `sync_jobs_one_active_per_conn_idx` (connection_id WHERE status IN
 * ('queued','running')). We INSERT … ON CONFLICT DO NOTHING; if the
 * insert is no-oped, we know a concurrent caller won the race and we
 * return their row. A read-only "is there one?" check followed by an
 * insert is *not* sufficient because two processes can both pass the
 * check, both insert, and end up running the same sync twice — exactly
 * what the durable queue is supposed to prevent.
 */
export async function enqueueSyncJob(args: EnqueueArgs): Promise<EnqueueResult> {
  // CSV jobs are excluded from the partial unique index by predicate
  // (`sync_type NOT LIKE 'csv_%'`), so each upload always inserts a new
  // row regardless of `allowDuplicate`. For non-CSV jobs the index
  // enforces single-flight atomically — we use INSERT … ON CONFLICT to
  // observe that and surface the existing row to the caller.
  const payloadSql = args.payload
    ? sql`${JSON.stringify(args.payload)}::jsonb`
    : sql`NULL`;
  const inserted = await db.execute(sql`
    INSERT INTO sis_sync_jobs (connection_id, sync_type, triggered_by, payload, status, scheduled_for)
    VALUES (${args.connectionId}, ${args.syncType}, ${args.triggeredBy},
            ${payloadSql}, 'queued', now())
    ON CONFLICT (connection_id) WHERE status IN ('queued','running') AND sync_type NOT LIKE 'csv_%'
    DO NOTHING
    RETURNING *
  `);
  const insertedRows = (inserted as unknown as { rows: unknown[] }).rows ?? (inserted as unknown as unknown[]);
  const insertedRow = Array.isArray(insertedRows) ? insertedRows[0] : undefined;
  if (insertedRow) return { job: coerceJobRow(insertedRow), duplicate: false };

  // No row inserted ⇒ another caller already owns the active slot for
  // this connection. Return their row so this request still gets a
  // usable jobId.
  const [existing] = await db
    .select()
    .from(sisSyncJobsTable)
    .where(
      and(
        eq(sisSyncJobsTable.connectionId, args.connectionId),
        inArray(sisSyncJobsTable.status, ["queued", "running"]),
      ),
    )
    .orderBy(desc(sisSyncJobsTable.createdAt))
    .limit(1);
  if (existing) return { job: existing, duplicate: true };

  // Pathological race (the conflicting row terminated between INSERT
  // and SELECT). One retry is safe.
  const [retry] = await db
    .insert(sisSyncJobsTable)
    .values({
      connectionId: args.connectionId,
      syncType: args.syncType,
      triggeredBy: args.triggeredBy,
      payload: args.payload ?? null,
      status: "queued",
      scheduledFor: new Date(),
    })
    .returning();
  return { job: retry, duplicate: false };
}

/**
 * Atomically claim the next runnable job. Returns null if nothing is
 * eligible. Uses `FOR UPDATE SKIP LOCKED` inside a CTE so concurrent
 * workers don't fight over the same row.
 */
export async function claimNextJob(workerId: string): Promise<SisSyncJob | null> {
  const result = await db.execute(sql`
    WITH next_job AS (
      SELECT id
      FROM sis_sync_jobs
      WHERE status = 'queued'
        AND scheduled_for <= now()
      ORDER BY priority DESC, scheduled_for ASC, id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE sis_sync_jobs j
    SET status = 'running',
        locked_at = now(),
        locked_by = ${workerId},
        started_at = COALESCE(j.started_at, now()),
        attempts = j.attempts + 1
    FROM next_job
    WHERE j.id = next_job.id
    RETURNING j.*
  `);
  const rows = (result as unknown as { rows: unknown[] }).rows ?? (result as unknown as unknown[]);
  const row = Array.isArray(rows) ? rows[0] : undefined;
  return row ? coerceJobRow(row) : null;
}

/**
 * Mark a running job as completed and link it to the sync log row. The
 * sync log retains the historical detail (per-record counters, error
 * blobs); the job table is the live queue + retry state.
 *
 * Guarded by `status='running'` (compare-and-set). If the reaper already
 * decided this job was dead and re-queued/failed it, this no-op is the
 * correct outcome — we don't want a late writer to clobber the newer
 * state and resurrect a zombie job.
 */
export async function markCompleted(jobId: number, syncLogId: number | null, expectedWorkerId?: string): Promise<void> {
  const conds = [eq(sisSyncJobsTable.id, jobId), eq(sisSyncJobsTable.status, "running")];
  if (expectedWorkerId) conds.push(eq(sisSyncJobsTable.lockedBy, expectedWorkerId));
  await db
    .update(sisSyncJobsTable)
    .set({
      status: "completed",
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      syncLogId: syncLogId ?? undefined,
      progress: {
        phase: "completed",
        message: "Sync finished successfully.",
        updatedAt: new Date().toISOString(),
      },
    })
    .where(and(...conds));
}

/**
 * Record a failure. If the job has retries left it is requeued with
 * backoff; otherwise it terminates in `failed`. Either way the lock is
 * released so the row is visible to the next claim or reaper.
 *
 * Like `markCompleted`, this is guarded by `status='running'` so a late
 * worker can't undo a reaper decision. If the row has already moved on
 * (reaped, completed, etc.) the call is a no-op and `retried=false`.
 */
export async function markFailed(jobId: number, err: unknown, expectedWorkerId?: string): Promise<{ retried: boolean }> {
  const [job] = await db
    .select()
    .from(sisSyncJobsTable)
    .where(eq(sisSyncJobsTable.id, jobId))
    .limit(1);
  if (!job) return { retried: false };

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const errorRecord: SyncJobError = {
    message,
    stack,
    attempt: job.attempts,
    failedAt: new Date().toISOString(),
  };

  const canRetry = job.attempts < job.maxAttempts;
  // CAS guard: only act if we still own a `running` row. The reaper
  // calls without `expectedWorkerId` because by definition the original
  // owner is gone — but it scopes its own SELECT so it knows the row
  // is still in the stale-running window.
  const conds = [eq(sisSyncJobsTable.id, jobId), eq(sisSyncJobsTable.status, "running")];
  if (expectedWorkerId) conds.push(eq(sisSyncJobsTable.lockedBy, expectedWorkerId));

  if (canRetry) {
    const backoffIdx = Math.min(job.attempts - 1, RETRY_BACKOFF_MS.length - 1);
    const delay = RETRY_BACKOFF_MS[Math.max(0, backoffIdx)];
    const updated = await db
      .update(sisSyncJobsTable)
      .set({
        status: "queued",
        scheduledFor: new Date(Date.now() + delay),
        lockedAt: null,
        lockedBy: null,
        lastError: errorRecord,
      })
      .where(and(...conds))
      .returning({ id: sisSyncJobsTable.id });
    return { retried: updated.length > 0 };
  }

  await db
    .update(sisSyncJobsTable)
    .set({
      status: "failed",
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: errorRecord,
    })
    .where(and(...conds));
  return { retried: false };
}

/**
 * Update the live progress field. Workers call this at phase boundaries
 * (e.g. "fetching students", "upserting students 50/200"). The UI polls
 * this so admins can see a sync that's mid-flight isn't stuck.
 *
 * Guarded by `status='running'` so progress writes from a worker that
 * was already reaped don't undo the failure record.
 */
export async function updateProgress(jobId: number, progress: Omit<SyncJobProgress, "updatedAt">, expectedWorkerId?: string): Promise<void> {
  const conds = [eq(sisSyncJobsTable.id, jobId), eq(sisSyncJobsTable.status, "running")];
  if (expectedWorkerId) conds.push(eq(sisSyncJobsTable.lockedBy, expectedWorkerId));
  await db
    .update(sisSyncJobsTable)
    .set({
      progress: { ...progress, updatedAt: new Date().toISOString() },
    })
    .where(and(...conds));
}

/**
 * Two-mode reaper. Both modes route stuck rows through `markFailed` so
 * normal retry/backoff applies — without this, an interrupted sync
 * would be a permanent zombie blocking dedupe forever.
 *
 *   `mode: "stale"` (default; called every poll tick) — reap any
 *     `running` row whose `lockedAt` is older than 15 min. Safe for
 *     multi-process deployments because a healthy worker's `lockedAt`
 *     is far more recent than the threshold.
 *
 *   `mode: "foreign"` (called once on worker startup) — *also* reap any
 *     `running` row whose `lockedBy` is not this worker's id, regardless
 *     of `lockedAt`. Rationale: in single-process deployments (the pilot
 *     model), no other live worker exists, so any row locked by a
 *     non-current id is by definition orphaned. This eliminates the
 *     15-minute window between a crash and the next reap. **Warning:
 *     do not use `foreign` mode if multiple API processes share this
 *     database** — it would reap healthy peer workers.
 */
export async function reapStaleJobs(
  workerId: string,
  mode: "stale" | "foreign" = "stale",
): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_THRESHOLD_MS);
  const baseRunning = eq(sisSyncJobsTable.status, "running");
  const predicate =
    mode === "foreign"
      ? and(
          baseRunning,
          // Either stale OR owned by a previous incarnation. Combined
          // because in single-process the previous workerId is always
          // gone after restart.
          sql`(${sisSyncJobsTable.lockedAt} < ${cutoff} OR ${sisSyncJobsTable.lockedBy} IS DISTINCT FROM ${workerId})`,
        )
      : and(baseRunning, lt(sisSyncJobsTable.lockedAt, cutoff));

  const stale = await db
    .select({ id: sisSyncJobsTable.id })
    .from(sisSyncJobsTable)
    .where(predicate);
  for (const row of stale) {
    await markFailed(
      row.id,
      new Error(
        `Worker died mid-sync (reaped by ${workerId}, mode=${mode})`,
      ),
    );
  }
  return stale.length;
}

/**
 * Drizzle's `db.execute(sql\`\`)` returns rows with snake_case keys (raw
 * driver result), not the camelCase shape `db.select()` produces. Map
 * what the queue publicly returns so callers always see the same shape.
 */
function toDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") return new Date(v);
  return null;
}

function coerceJobRow(row: unknown): SisSyncJob {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as number,
    connectionId: r.connection_id as number,
    syncType: r.sync_type as string,
    status: r.status as string,
    priority: r.priority as number,
    attempts: r.attempts as number,
    maxAttempts: r.max_attempts as number,
    lastError: r.last_error as SyncJobError | null,
    progress: r.progress as SyncJobProgress | null,
    payload: r.payload as SyncJobPayload | null,
    triggeredBy: r.triggered_by as string | null,
    scheduledFor: toDate(r.scheduled_for) as Date,
    lockedAt: toDate(r.locked_at),
    lockedBy: r.locked_by as string | null,
    startedAt: toDate(r.started_at),
    completedAt: toDate(r.completed_at),
    syncLogId: r.sync_log_id as number | null,
    createdAt: toDate(r.created_at) as Date,
  };
}

export const __test__ = { STALE_RUNNING_THRESHOLD_MS, RETRY_BACKOFF_MS };
