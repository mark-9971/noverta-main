# Durable SIS Sync Architecture

**Status:** shipped
**Owner:** API / SIS
**Related code:** `artifacts/api-server/src/lib/sis/*`, `lib/db/src/schema/sisSyncJobs.ts`

## TL;DR

SIS (Student Information System) syncs no longer run inside the HTTP request that
triggered them. Every sync is now a row in `sis_sync_jobs` that a background
worker claims, executes, and marks complete or failed. The request returns
`202 Accepted` with a `jobId`; the UI polls `GET /api/sis/jobs/:id` for status
and progress.

This unblocks two things the pilot was hitting in production:

1. **Long-running PowerSchool/Skyward syncs** (>30s) timing out the proxy and
   leaving the sync in an unknown state.
2. **API restarts** (deploys, OOM kills) silently dropping in-flight syncs with
   no record of what happened.

## Architecture

### Job lifecycle

```
                ┌─────────┐  claimNextJob()      ┌─────────┐  markCompleted()   ┌───────────┐
  enqueueJob → │ queued  │ ───────────────────→ │ running │ ───────────────→  │ completed │
                └─────────┘  (locked, attempts++) └─────────┘                    └───────────┘
                     ▲                                │
                     │                                │ markFailed()
                     │                                ▼
                     │  attempts < maxAttempts?    ┌────────┐
                     └─────────────────────────── │ failed │ (terminal at max)
                          backoff: 30s/2m/10m     └────────┘
```

Stale `running` rows (whose worker died) are surfaced by `reapStaleJobs()` on
every worker startup and again on each poll tick. Stale = `lockedAt` older than
**15 min** (well above the longest pilot sync ~2 min).

### Components

| File | Responsibility |
|---|---|
| `lib/db/src/schema/sisSyncJobs.ts` | `sis_sync_jobs` table + indexes |
| `artifacts/api-server/src/lib/sis/jobQueue.ts` | `enqueueSyncJob`, `claimNextJob` (atomic CTE w/ `FOR UPDATE SKIP LOCKED`), `markCompleted`, `markFailed` (backoff), `updateProgress`, `reapStaleJobs` |
| `artifacts/api-server/src/lib/sis/worker.ts` | `startSisWorker` — polls every 5s, drains greedily, reaps on startup |
| `artifacts/api-server/src/lib/sis/syncEngine.ts` | `runSync` — accepts `onProgress` callback, returns `syncLogId`, re-throws on error so the worker can retry |
| `artifacts/api-server/src/lib/sis/scheduler.ts` | Cron-style scheduler — enqueues instead of executing inline; deduped against active jobs |
| `artifacts/api-server/src/routes/sisIntegration.ts` | `POST /sync` and `POST /upload-csv` return `202 { jobId }`; `GET /sis/jobs/:id` and `GET /sis/connections/:id/jobs` for status/history |
| `artifacts/api-server/src/index.ts` | Wires `startSisWorker()` on boot |
| `artifacts/api-server/tests/13-sis-durable-jobs.test.ts` | 18 tests covering enqueue/dedupe/claim atomicity/retry-backoff/two-mode reaper/CAS guards/route surface |

### Concurrency model

- **One worker per API process.** Polls every 5s, drains the queue greedily on
  each tick (`while (claim()) { run() }`).
- **Multiple processes are safe for claiming and running** — `claimNextJob`
  uses `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING …`,
  so two workers polling at the same time will never claim the same row.
- **One in-flight sync per connection — enforced atomically by the database.**
  A partial unique index `(connection_id) WHERE status IN ('queued','running')
  AND sync_type NOT LIKE 'csv_%'` makes a second concurrent enqueue fail with
  a conflict; `enqueueSyncJob` catches that, returns the existing row, and
  marks the result `duplicate: true`. A read-then-insert check would not be
  sufficient under multi-process load. CSV uploads are excluded from the
  predicate — each upload is its own run.
- **Compare-and-set on terminal writes.** `markCompleted`, `markFailed`, and
  `updateProgress` are all guarded by `WHERE status='running' AND locked_by =
  $worker`. A late writer (a worker whose job was already reaped) cannot
  clobber the newer state and resurrect a zombie.
- **Worker identity** is `api-${pid}-${shortuuid}` — recorded in `lockedBy` so
  the reaper can tell "this is mine and fresh" from "this was someone else and
  they died".

### Two-mode reaper

`reapStaleJobs(workerId, mode)` runs in two contexts:

- **`mode: "stale"`** — every poll tick (~once per minute via
  `REAP_EVERY_TICKS=12`). Reaps any `running` row whose `lockedAt` is older
  than 15 min. Multi-process safe: a healthy peer worker's lock is far more
  recent than the threshold.

- **`mode: "foreign"`** — once on worker startup. Also reaps any `running`
  row whose `lockedBy` is not the current worker's id, regardless of
  `lockedAt`. In single-process pilot deployments this is the difference
  between "API restart mid-sync recovers in seconds" and "stuck for 15 minutes
  until the time-based threshold trips". **Disable foreign-mode startup reap
  if multiple API processes share this database** — it would reap healthy
  peer workers.

### Schema (`sis_sync_jobs`)

| Column | Notes |
|---|---|
| `id` serial PK | |
| `connection_id` FK → `sis_connections.id` | |
| `sync_type` text | `full`, `incremental`, `csv_students`, `csv_iep`, … |
| `status` text | `queued` / `running` / `completed` / `failed` / `canceled` |
| `priority` int default 0 | higher = claimed first |
| `attempts` / `max_attempts` int | default max 3 |
| `last_error` jsonb | `{ message, stack?, code? }` |
| `progress` jsonb | `{ phase, recordsProcessed?, totalRecords?, updatedAt }` |
| `payload` jsonb | e.g. `{ csvText: "..." }` for CSV uploads |
| `triggered_by` text | `user:<id>`, `scheduler`, `csv-upload:<id>` |
| `scheduled_for` timestamptz | future = invisible to claimer (used for backoff) |
| `locked_at` / `locked_by` | set by `claimNextJob`, cleared on terminal/retry |
| `started_at` / `completed_at` | observability |
| `sync_log_id` FK → `sis_sync_logs.id` | links the job to the existing audit log |
| `created_at` timestamptz | |

**Indexes:**

- `(status, scheduled_for, priority)` — claim path
- `(connection_id, status)` — dedupe lookup on enqueue
- `(status, locked_at)` — reaper scan

## API surface

| Method | Path | Returns | Notes |
|---|---|---|---|
| POST | `/api/sis/connections/:id/sync` | `202 { jobId, status: "queued" }` | Returns `200 { jobId, duplicate: true }` if a sync is already queued/running for the connection |
| POST | `/api/sis/connections/:id/upload-csv` | `202 { jobId }` | Each upload always becomes its own job |
| GET  | `/api/sis/jobs/:id` | `{ id, status, attempts, progress, lastError, … }` | District-scoped (404 if cross-tenant) |
| GET  | `/api/sis/connections/:id/jobs` | newest-first list | History for a connection |

## Failure modes now prevented

| Failure | Before | After |
|---|---|---|
| **API restart mid-sync** (deploy, OOM) | Sync silently dies; record may be partially written; no row in `sis_sync_logs`; user sees "still syncing" forever in UI. | Row stays in `running` until the next worker startup. Reaper detects `lockedAt > 15 min` and either re-queues (with backoff) or marks `failed` with `lastError = "Worker died (stale lock)"`. |
| **Proxy 30s timeout on long syncs** | Frontend gets 504; sync may still complete server-side; UI desyncs. | `POST /sync` returns immediately with `jobId`. Frontend polls. Sync runs to completion regardless of how long it takes. |
| **Double-click "Sync now"** | Two parallel syncs against the same SIS, duplicate writes, rate-limit errors from PowerSchool. | Second click hits the dedupe path: returns the same `jobId` with `duplicate: true`. |
| **Two API instances racing the same scheduled tick** | Both ran the cron job. | Only one wins `claimNextJob` — the other gets `null` and moves on. |
| **Transient SIS API timeout** | Exception bubbled to user, sync marked `failed` permanently, manual retry required. | `markFailed` re-queues with backoff (30s → 2m → 10m). Only after 3 attempts does the job become terminal `failed`. |
| **Slow PowerSchool response with no UI feedback** | Spinner with no information. | `runSync` calls `updateProgress({ phase, recordsProcessed, totalRecords })` at each phase; UI shows real progress via `GET /sis/jobs/:id`. |
| **Cross-tenant job lookup** | (would have leaked across districts in a naive impl) | `GET /sis/jobs/:id` joins through `sis_connections` and 404s if the connection's district doesn't match the caller. |

## What we explicitly did **not** build (pilot scope)

- No external queue (Redis, SQS, Temporal). Postgres `FOR UPDATE SKIP LOCKED`
  is sufficient at pilot volume (~10 districts, 1–2 syncs/hour each) and keeps
  the ops surface small.
- No per-job cancellation API. `canceled` status is reserved in the enum but
  no route writes it yet.
- No exponential jitter — fixed 30s/2m/10m backoff steps. Good enough for
  pilot; revisit when we see thundering-herd behavior across many districts.
- No multi-worker-per-process parallelism. One poller per API process; horizontal
  scaling is via additional API processes (which is safe — see concurrency model).

## Verification

- Unit/integration: `artifacts/api-server/tests/13-sis-durable-jobs.test.ts` — 15 tests, all green.
- Full api-server suite: 118/118 passing.
- Worker boot confirmed in logs: `[SIS Worker] Starting (id=api-<pid>-<short>, poll=5000ms)`.
