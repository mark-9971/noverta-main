/**
 * SIS durable job model — restart-safety tests.
 *
 * The intent is to lock in the contract that survived API restarts and
 * the request lifecycle: enqueue, claim, progress, retry/backoff, and
 * stale-job reaping. We exercise the queue directly (not through the
 * worker poll loop) so the tests are deterministic and don't have to
 * sleep waiting for ticks.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { db } from "@workspace/db";
import { sisConnectionsTable, sisSyncJobsTable, sisSyncLogsTable } from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { createDistrict, cleanupDistrict, seedLegalAcceptances, cleanupLegalAcceptances } from "./helpers";
import {
  enqueueSyncJob,
  claimNextJob,
  markCompleted,
  markFailed,
  reapStaleJobs,
  updateProgress,
} from "../src/lib/sis/jobQueue";

let districtId: number;
const cleanupConnIds: number[] = [];

async function createConnection(): Promise<number> {
  const [conn] = await db
    .insert(sisConnectionsTable)
    .values({
      districtId,
      provider: "powerschool",
      label: `test-conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      enabled: true,
      status: "connected",
      syncSchedule: "manual",
    })
    .returning();
  cleanupConnIds.push(conn.id);
  return conn.id;
}

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test");
  const district = await createDistrict();
  districtId = district.id;
  await seedLegalAcceptances(["u_admin_own", "u_admin_other", "u_admin"]);
});

beforeEach(async () => {
  // The queue is a global table — earlier tests in this file leave queued
  // rows behind that would otherwise be picked up first by claimNextJob,
  // causing flaky cross-test contamination. Wipe rows tied to *this
  // suite's* connections only so other parallel suites are unaffected.
  if (cleanupConnIds.length > 0) {
    await db.delete(sisSyncJobsTable).where(inArray(sisSyncJobsTable.connectionId, cleanupConnIds));
  }
});

afterAll(async () => {
  if (cleanupConnIds.length > 0) {
    // Logs and jobs first (FK to connection), then connections, then district.
    await db.delete(sisSyncJobsTable).where(inArray(sisSyncJobsTable.connectionId, cleanupConnIds));
    await db.delete(sisSyncLogsTable).where(inArray(sisSyncLogsTable.connectionId, cleanupConnIds));
    await db.delete(sisConnectionsTable).where(inArray(sisConnectionsTable.id, cleanupConnIds));
  }
  if (districtId) await cleanupDistrict(districtId);
  await cleanupLegalAcceptances(["u_admin_own", "u_admin_other", "u_admin"]);
  vi.unstubAllEnvs();
});

describe("SIS durable job queue", () => {
  it("enqueueSyncJob inserts a queued row with the right defaults", async () => {
    const connectionId = await createConnection();
    const { job, duplicate } = await enqueueSyncJob({
      connectionId,
      syncType: "full",
      triggeredBy: "test:user",
    });
    expect(duplicate).toBe(false);
    expect(job.status).toBe("queued");
    expect(job.attempts).toBe(0);
    expect(job.maxAttempts).toBeGreaterThanOrEqual(1);
    expect(job.connectionId).toBe(connectionId);
    expect(job.triggeredBy).toBe("test:user");
    expect(job.scheduledFor).toBeInstanceOf(Date);
  });

  it("enqueue dedupes a second request when one is already queued", async () => {
    const connectionId = await createConnection();
    const first = await enqueueSyncJob({ connectionId, syncType: "full", triggeredBy: "t1" });
    const second = await enqueueSyncJob({ connectionId, syncType: "full", triggeredBy: "t2" });
    expect(second.duplicate).toBe(true);
    expect(second.job.id).toBe(first.job.id);
    // And only one row exists.
    const all = await db
      .select()
      .from(sisSyncJobsTable)
      .where(eq(sisSyncJobsTable.connectionId, connectionId));
    expect(all.length).toBe(1);
  });

  it("CSV uploads bypass dedupe so each upload becomes its own job", async () => {
    const connectionId = await createConnection();
    const first = await enqueueSyncJob({
      connectionId,
      syncType: "csv_students",
      triggeredBy: "t1",
      payload: { csvText: "name\nAlice" },
      allowDuplicate: true,
    });
    const second = await enqueueSyncJob({
      connectionId,
      syncType: "csv_students",
      triggeredBy: "t2",
      payload: { csvText: "name\nBob" },
      allowDuplicate: true,
    });
    expect(second.duplicate).toBe(false);
    expect(second.job.id).not.toBe(first.job.id);
  });

  it("claimNextJob atomically promotes queued → running and only returns it once", async () => {
    const connectionId = await createConnection();
    const { job } = await enqueueSyncJob({ connectionId, syncType: "full", triggeredBy: "t" });
    const claimedA = await claimNextJob("worker-A");
    expect(claimedA?.id).toBe(job.id);
    expect(claimedA?.status).toBe("running");
    expect(claimedA?.attempts).toBe(1);
    expect(claimedA?.lockedBy).toBe("worker-A");
    expect(claimedA?.startedAt).toBeInstanceOf(Date);

    // A second worker polling immediately must not get the same job — that
    // would let two workers run the same sync against the same SIS API.
    const claimedB = await claimNextJob("worker-B");
    // Could be null OR a different job from a previous test; must NOT be `job.id`.
    expect(claimedB?.id).not.toBe(job.id);
  });

  it("markCompleted terminates the job and links the sync log row", async () => {
    const connectionId = await createConnection();
    const { job } = await enqueueSyncJob({ connectionId, syncType: "full", triggeredBy: "t" });
    await claimNextJob("w");
    // Pretend the engine wrote a log row.
    const [log] = await db
      .insert(sisSyncLogsTable)
      .values({ connectionId, syncType: "full", status: "completed", triggeredBy: "t" })
      .returning();
    await markCompleted(job.id, log.id);
    const [after] = await db.select().from(sisSyncJobsTable).where(eq(sisSyncJobsTable.id, job.id));
    expect(after.status).toBe("completed");
    expect(after.completedAt).not.toBeNull();
    expect(after.lockedAt).toBeNull();
    expect(after.lockedBy).toBeNull();
    expect(after.syncLogId).toBe(log.id);
  });

  it("updateProgress writes to the progress column with a server-side timestamp", async () => {
    const connectionId = await createConnection();
    const { job } = await enqueueSyncJob({ connectionId, syncType: "full", triggeredBy: "t" });
    // updateProgress is CAS-guarded on status='running', so claim first.
    await claimNextJob("w");
    await updateProgress(job.id, { phase: "fetching_students", totalRecords: 200 });
    const [row] = await db.select().from(sisSyncJobsTable).where(eq(sisSyncJobsTable.id, job.id));
    expect(row.progress?.phase).toBe("fetching_students");
    expect(row.progress?.totalRecords).toBe(200);
    expect(typeof row.progress?.updatedAt).toBe("string");
  });

  it("updateProgress is a no-op once the row leaves running (CAS guard)", async () => {
    // If a worker writes progress after the reaper has already failed
    // its job, the late write must not overwrite the failure record —
    // otherwise we'd resurrect a zombie. Verify the guard.
    const connectionId = await createConnection();
    const { job } = await enqueueSyncJob({ connectionId, syncType: "full", triggeredBy: "t" });
    await claimNextJob("w");
    await markCompleted(job.id, null, "w");
    await updateProgress(job.id, { phase: "fetching_students", totalRecords: 999 });
    const [row] = await db.select().from(sisSyncJobsTable).where(eq(sisSyncJobsTable.id, job.id));
    expect(row.status).toBe("completed");
    expect(row.progress?.phase).toBe("completed"); // markCompleted's value, not the late write
  });

  it("markFailed retries with backoff while attempts < maxAttempts", async () => {
    const connectionId = await createConnection();
    const { job } = await enqueueSyncJob({ connectionId, syncType: "full", triggeredBy: "t" });
    await claimNextJob("w"); // attempts = 1
    const result = await markFailed(job.id, new Error("transient API timeout"));
    expect(result.retried).toBe(true);
    const [after] = await db.select().from(sisSyncJobsTable).where(eq(sisSyncJobsTable.id, job.id));
    expect(after.status).toBe("queued");
    expect(after.lockedAt).toBeNull();
    expect(after.lockedBy).toBeNull();
    expect(after.lastError?.message).toContain("transient");
    // Backoff: scheduledFor is in the future.
    expect(after.scheduledFor.getTime()).toBeGreaterThan(Date.now());
  });

  it("markFailed terminates after maxAttempts is exhausted", async () => {
    const connectionId = await createConnection();
    const { job } = await enqueueSyncJob({ connectionId, syncType: "full", triggeredBy: "t" });
    // Force attempts up to max so the next failure terminates.
    await db
      .update(sisSyncJobsTable)
      .set({ attempts: job.maxAttempts, status: "running", lockedAt: new Date(), lockedBy: "w" })
      .where(eq(sisSyncJobsTable.id, job.id));
    const result = await markFailed(job.id, new Error("permanent: bad credentials"));
    expect(result.retried).toBe(false);
    const [after] = await db.select().from(sisSyncJobsTable).where(eq(sisSyncJobsTable.id, job.id));
    expect(after.status).toBe("failed");
    expect(after.completedAt).not.toBeNull();
    expect(after.lastError?.message).toContain("permanent");
  });

  it("reapStaleJobs treats long-`running` rows as failures so an interrupted sync recovers", async () => {
    // This is the central restart-safety guarantee. A job whose worker died
    // (API restart, OOM kill) leaves a `running` row with an old `lockedAt`.
    // The reaper, called on worker startup, must surface that as a failure
    // so retry/backoff applies — otherwise the row would block dedupe
    // forever and the sync would never run again without manual SQL.
    const connectionId = await createConnection();
    const { job } = await enqueueSyncJob({ connectionId, syncType: "full", triggeredBy: "t" });
    await claimNextJob("dead-worker"); // attempts = 1
    // Backdate lockedAt past the stale threshold.
    const longAgo = new Date(Date.now() - 30 * 60 * 1000);
    await db.update(sisSyncJobsTable).set({ lockedAt: longAgo }).where(eq(sisSyncJobsTable.id, job.id));

    const reaped = await reapStaleJobs("new-worker");
    expect(reaped).toBeGreaterThanOrEqual(1);
    const [after] = await db.select().from(sisSyncJobsTable).where(eq(sisSyncJobsTable.id, job.id));
    // Either re-queued (if attempts < max) or failed (if exhausted). Either
    // way the lock is cleared and the job is no longer wedged in `running`.
    expect(["queued", "failed"]).toContain(after.status);
    expect(after.lockedAt).toBeNull();
    expect(after.lastError?.message).toMatch(/Worker died/i);
  });

  it("reapStaleJobs(mode=\"foreign\") recovers a fresh-locked job from a previous process in seconds, not minutes", async () => {
    // The whole point of foreign-mode startup reap: when the API
    // restarts after a crash, jobs locked by the *previous* incarnation
    // (workerId differs) are recovered immediately, without waiting for
    // the 15-min stale window. This is the central restart-safety
    // claim made in the doc.
    const connectionId = await createConnection();
    const { job } = await enqueueSyncJob({ connectionId, syncType: "full", triggeredBy: "t" });
    await claimNextJob("api-OLD-pid");
    const [before] = await db.select().from(sisSyncJobsTable).where(eq(sisSyncJobsTable.id, job.id));
    expect(before.status).toBe("running");
    expect(before.lockedBy).toBe("api-OLD-pid");
    // lockedAt is RIGHT NOW — far below the stale threshold. Default
    // `stale` mode would not touch it. `foreign` mode must.
    const reaped = await reapStaleJobs("api-NEW-pid", "foreign");
    expect(reaped).toBeGreaterThanOrEqual(1);
    const [after] = await db.select().from(sisSyncJobsTable).where(eq(sisSyncJobsTable.id, job.id));
    expect(["queued", "failed"]).toContain(after.status);
    expect(after.lockedBy).toBeNull();
  });

  it("reapStaleJobs(mode=\"stale\") does NOT touch a fresh-locked job from another worker (multi-process safety)", async () => {
    // Inverse guarantee: if multiple API processes ever share this DB,
    // the periodic stale reaper must not mistake a healthy peer for
    // a dead worker. Only the time-based threshold applies in stale mode.
    const connectionId = await createConnection();
    await enqueueSyncJob({ connectionId, syncType: "full", triggeredBy: "t" });
    const claimed = await claimNextJob("peer-worker");
    expect(claimed?.status).toBe("running");
    const reaped = await reapStaleJobs("self-worker", "stale");
    expect(reaped).toBe(0);
    const [after] = await db.select().from(sisSyncJobsTable).where(eq(sisSyncJobsTable.id, claimed!.id));
    expect(after.status).toBe("running");
    expect(after.lockedBy).toBe("peer-worker");
  });

  it("reapStaleJobs leaves freshly-running jobs alone", async () => {
    // A healthy in-flight sync (lockedAt is recent) must not be reaped —
    // that would interrupt a real running worker and produce duplicate
    // record writes.
    const connectionId = await createConnection();
    await enqueueSyncJob({ connectionId, syncType: "full", triggeredBy: "t" });
    const claimed = await claimNextJob("w-fresh");
    expect(claimed?.status).toBe("running");
    const before = await db
      .select()
      .from(sisSyncJobsTable)
      .where(and(eq(sisSyncJobsTable.id, claimed!.id), eq(sisSyncJobsTable.status, "running")));
    expect(before.length).toBe(1);
    await reapStaleJobs("reaper");
    const [after] = await db.select().from(sisSyncJobsTable).where(eq(sisSyncJobsTable.id, claimed!.id));
    expect(after.status).toBe("running");
  });

  it("scheduledFor in the future hides the job from claimNextJob until it's due", async () => {
    const connectionId = await createConnection();
    const { job } = await enqueueSyncJob({ connectionId, syncType: "full", triggeredBy: "t" });
    await db
      .update(sisSyncJobsTable)
      .set({ scheduledFor: new Date(Date.now() + 60_000) })
      .where(eq(sisSyncJobsTable.id, job.id));
    // Drain anything else that may be queued first; ensure our future-job is invisible.
    while (true) {
      const next = await claimNextJob("drainer");
      if (!next) break;
      if (next.id === job.id) {
        throw new Error("future-scheduled job was claimed prematurely");
      }
      // Mark unrelated drained jobs done so we don't leak them.
      await markCompleted(next.id, null);
    }
    // Move the schedule into the past — now it should claim.
    await db
      .update(sisSyncJobsTable)
      .set({ scheduledFor: new Date(Date.now() - 1000) })
      .where(eq(sisSyncJobsTable.id, job.id));
    const claimed = await claimNextJob("drainer");
    expect(claimed?.id).toBe(job.id);
  });
});

describe("/sis/jobs HTTP surface", () => {
  it("GET /sis/jobs/:id is district-scoped (other district can't peek)", async () => {
    // Set up a job in the seeded district.
    const connectionId = await createConnection();
    const { job } = await enqueueSyncJob({ connectionId, syncType: "full", triggeredBy: "t" });

    const { asUser } = await import("./helpers");
    const own = asUser({ userId: "u_admin_own", role: "admin", districtId });
    const ownRes = await own.get(`/api/sis/jobs/${job.id}`);
    expect(ownRes.status).toBe(200);
    expect(ownRes.body.id).toBe(job.id);

    // A different district must not see this job.
    const otherDistrict = await createDistrict();
    try {
      const intruder = asUser({ userId: "u_admin_other", role: "admin", districtId: otherDistrict.id });
      const intrudeRes = await intruder.get(`/api/sis/jobs/${job.id}`);
      expect(intrudeRes.status).toBe(404);
    } finally {
      await cleanupDistrict(otherDistrict.id);
    }
  });

  it("POST /sis/connections/:id/sync returns 202 with a jobId instead of running inline", async () => {
    const connectionId = await createConnection();
    const { asUser } = await import("./helpers");
    const admin = asUser({ userId: "u_admin", role: "admin", districtId });
    const res = await admin.post(`/api/sis/connections/${connectionId}/sync`).send({ syncType: "full" });
    expect(res.status).toBe(202);
    expect(typeof res.body.jobId).toBe("number");
    expect(res.body.status).toBe("queued");
    // And the row is queryable.
    const [row] = await db
      .select()
      .from(sisSyncJobsTable)
      .where(eq(sisSyncJobsTable.id, res.body.jobId))
      .limit(1);
    expect(row.status).toBe("queued");
  });

  it("POST /sis/connections/:id/sync coalesces a second click into the same job", async () => {
    const connectionId = await createConnection();
    const { asUser } = await import("./helpers");
    const admin = asUser({ userId: "u_admin", role: "admin", districtId });
    const r1 = await admin.post(`/api/sis/connections/${connectionId}/sync`).send({ syncType: "full" });
    const r2 = await admin.post(`/api/sis/connections/${connectionId}/sync`).send({ syncType: "full" });
    expect(r1.status).toBe(202);
    expect(r2.status).toBe(200);
    expect(r2.body.duplicate).toBe(true);
    expect(r2.body.jobId).toBe(r1.body.jobId);
  });

  it("GET /sis/connections/:id/jobs returns history newest-first", async () => {
    const connectionId = await createConnection();
    // Use csv_* sync types — they're excluded from the partial unique
    // index so two consecutive enqueues both create rows. (For a non-CSV
    // type the second call would dedupe, which is correct behavior but
    // not what this history-ordering test wants to exercise.)
    const a = await enqueueSyncJob({ connectionId, syncType: "csv_students", triggeredBy: "t1", allowDuplicate: true });
    const b = await enqueueSyncJob({ connectionId, syncType: "csv_students", triggeredBy: "t2", allowDuplicate: true });
    const { asUser } = await import("./helpers");
    const admin = asUser({ userId: "u_admin", role: "admin", districtId });
    const res = await admin.get(`/api/sis/connections/${connectionId}/jobs`);
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: number }>).map((j) => j.id);
    // b enqueued after a — must come first.
    expect(ids.indexOf(b.job.id)).toBeLessThan(ids.indexOf(a.job.id));
  });
});
