/**
 * Seed Overhaul V2 — Post-run summary artifact (W1 minimal version).
 *
 * Operator-facing record of what a single `POST /api/sample-data`
 * call actually produced. The route returns this verbatim alongside
 * its existing response body so PilotReadinessPanel / Demo Control
 * can surface honest "what happened" facts after a reset.
 *
 * W1 intentionally ships the *minimal* shape demanded by the
 * T-V2-01 prompt. Later waves enrich it:
 *   W3 — primitiveFactCounts.alerts/comp/iepEvents become real
 *   W4 — roleCoverage populated from operator role profile mix
 *   W5 — showcaseCases + sparseByDesign + validationResults
 */
import type { SeedRunMetadata } from "./platform/runMetadata";

export interface SeedSampleResultLite {
  studentsCreated: number;
  staffCreated: number;
  serviceRequirements: number;
  sessionsLogged: number;
  alerts: number;
  compensatoryObligations: number;
  sizeProfile: string;
}

/**
 * Ordered scenario-count map. Keyed by Scenario string but typed
 * loosely so callers don't have to import the Scenario union here.
 */
export type ScenarioCounts = Record<string, number>;

export interface PostRunSummary {
  runId: string;
  v2Version: string;
  districtId: number;
  districtName: string | null;

  /** True when the seeder no-op'd because data already existed. */
  alreadySeeded: boolean;

  /** ISO-8601 wall-clock for the seed run. */
  startedAt: string;
  finishedAt: string;
  durationMs: number;

  /** Headline counts. Match the existing SeedSampleResult fields. */
  studentsCreated: number;
  staffCreated: number;
  serviceRequirements: number;
  sessionsLogged: number;
  alerts: number;
  compensatoryObligations: number;
  sizeProfile: string;

  /**
   * Per-scenario student counts. Empty in the alreadySeeded path or
   * when the caller does not pass a scenarioCounts map. W2/W3 keep
   * this populated unconditionally.
   */
  scenarioCounts: ScenarioCounts;

  /**
   * Layer markers so consumers can introspect which V2 layers were
   * actually exercised. W1 lights up `platform` only; later waves
   * flip the others to true as they land.
   */
  layers: {
    platform: boolean;
    domain: boolean;
    simulator: boolean;
    overlay: boolean;
  };
}

export function buildPostRunSummary(args: {
  meta: SeedRunMetadata;
  districtName: string | null;
  alreadySeeded: boolean;
  result: SeedSampleResultLite;
  scenarioCounts?: ScenarioCounts;
}): PostRunSummary {
  return {
    runId: args.meta.runId,
    v2Version: args.meta.v2Version,
    districtId: args.meta.districtId,
    districtName: args.districtName,
    alreadySeeded: args.alreadySeeded,
    startedAt: args.meta.startedAt,
    finishedAt: args.meta.finishedAt,
    durationMs: args.meta.durationMs,
    studentsCreated: args.result.studentsCreated,
    staffCreated: args.result.staffCreated,
    serviceRequirements: args.result.serviceRequirements,
    sessionsLogged: args.result.sessionsLogged,
    alerts: args.result.alerts,
    compensatoryObligations: args.result.compensatoryObligations,
    sizeProfile: args.result.sizeProfile,
    scenarioCounts: args.scenarioCounts ?? {},
    layers: {
      platform: true,
      domain: false,
      simulator: false,
      overlay: false,
    },
  };
}
