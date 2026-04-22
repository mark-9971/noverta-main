/**
 * Seed Overhaul V2 — Platform / Seed-run metadata.
 *
 * Captures the identity and timing of a single seed run so the
 * post-run summary artifact (see ../postRunSummary.ts) can report
 * honest "what happened" facts to operators after `POST /api/sample-data`.
 *
 * No DB writes here. The seed-runs table is a future wave's concern;
 * W1 keeps run metadata in-memory and lets the route surface it via
 * the response body.
 */

export interface SeedRunMetadata {
  /** Stable id for this single seed call. Currently `${districtId}-${epochMs}`. */
  runId: string;
  districtId: number;
  /** ISO-8601 wall-clock at the moment the seeder began executing. */
  startedAt: string;
  /** ISO-8601 wall-clock at the moment the seeder returned. */
  finishedAt: string;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Marker so consumers can tell V2-emitted summaries from later versions. */
  v2Version: string;
}

/** Bumped each time the V2 seed system's external contract changes. */
export const V2_SEED_VERSION = "v2.0.0-w1";

export function beginRun(districtId: number): { runId: string; startedAt: string; startedAtMs: number } {
  const now = Date.now();
  const startedAt = new Date(now).toISOString();
  const runId = `${districtId}-${now}`;
  return { runId, startedAt, startedAtMs: now };
}

export function endRun(
  begin: { runId: string; startedAt: string; startedAtMs: number },
  districtId: number,
): SeedRunMetadata {
  const finishedAtMs = Date.now();
  return {
    runId: begin.runId,
    districtId,
    startedAt: begin.startedAt,
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: finishedAtMs - begin.startedAtMs,
    v2Version: V2_SEED_VERSION,
  };
}
