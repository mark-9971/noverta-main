/**
 * Seed Overhaul V2 — Post-run summary artifact.
 *
 * Operator-facing record of what a single `POST /api/sample-data`
 * call actually produced. The route returns this verbatim alongside
 * its existing response body so PilotReadinessPanel / Demo Control
 * can surface honest "what happened" facts after a reset.
 *
 * Wave history:
 *   W1 — minimal headline + scenarioCounts + layer flags
 *   W3 — primitiveFactCounts.alerts/comp/iepEvents become real (still
 *        derived from result.* in the lite shape)
 *   W4 — roleCoverage populated from operator role profile mix (added
 *        as `roleProfileMix` here)
 *   W5 — showcase enrichment lands:
 *        - complianceDistribution: bucketed alert severity counts
 *        - showcaseCaseCounts: per-category counts of demo overlay rows
 *        - exampleShowcaseIds: a few subjectIds per category for the
 *          dashboard demo flow to deep-link into.
 *        - layers.overlay flips to true once runDemoReadinessOverlay
 *          has emitted at least one row.
 */
import type { SeedRunMetadata } from "./platform/runMetadata";
import type { ShowcaseCategory } from "./overlay";
import type { SizeContractOutcome } from "./domain/sizeContract";

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

/**
 * Bucketed severity distribution for behind_on_minutes / missed_sessions
 * alerts, plus a `resolved` bucket for the "we already handled it" view.
 */
export interface ComplianceDistribution {
  critical: number;
  high: number;
  medium: number;
  low: number;
  resolved: number;
}

/**
 * Per-category counts emitted by the W5 overlay. A district that
 * skipped the overlay reports zeros across the board (and the
 * `layers.overlay` flag stays false).
 */
export type ShowcaseCaseCounts = Record<ShowcaseCategory | "__fallback__", number>;

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
   * W5 — distribution of persisted alerts across severity buckets,
   * plus a separate `resolved` count. Empty (all-zero) when the
   * overlay didn't run.
   */
  complianceDistribution: ComplianceDistribution;

  /**
   * W5 — per-category counts of demo_showcase_cases rows the demo
   * overlay emitted. All-zero when the overlay didn't run.
   */
  showcaseCaseCounts: ShowcaseCaseCounts;

  /**
   * W5 — sample subjectIds per category (max 3 each) so the dashboard
   * Demo Readiness panel can deep-link without re-querying. Empty
   * arrays when the overlay didn't run.
   */
  exampleShowcaseIds: Partial<Record<ShowcaseCategory | "__fallback__", number[]>>;

  /**
   * Layer markers so consumers can introspect which V2 layers were
   * actually exercised. W1 lights up `platform` only; W5 lights up
   * `overlay` once runDemoReadinessOverlay has emitted at least one
   * showcase row.
   */
  layers: {
    platform: boolean;
    domain: boolean;
    simulator: boolean;
    overlay: boolean;
  };

  /**
   * T-V2-09 — Honest requested-vs-resolved size record. Reports both
   * what the operator asked for (`requestedTargetStudents` /
   * `requestedSizeProfile`) and what the seeder actually produced
   * (`actualStudentsCreated`, `actualStaffCreated`) against the
   * documented contract band (`contractRange`). `honoredTargetStudents`
   * is the truthful "did the data match the request?" boolean.
   *
   * Always populated for V2 runs; `null` only when the seeder is in the
   * `alreadySeeded` no-op branch (where no contract was resolved).
   */
  sizeContract: SizeContractOutcome | null;
}

const ZERO_COMPLIANCE_DISTRIBUTION: ComplianceDistribution = {
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  resolved: 0,
};

const ZERO_SHOWCASE_COUNTS: ShowcaseCaseCounts = {
  at_risk: 0,
  scheduled_makeup: 0,
  recently_resolved: 0,
  provider_overloaded: 0,
  evaluation_due: 0,
  parent_followup: 0,
  high_progress: 0,
  chronic_miss: 0,
  __fallback__: 0,
};

export interface BuildPostRunSummaryArgs {
  meta: SeedRunMetadata;
  districtName: string | null;
  alreadySeeded: boolean;
  result: SeedSampleResultLite;
  scenarioCounts?: ScenarioCounts;
  /** W5 — passed when the demo overlay ran. Omit otherwise. */
  showcase?: {
    complianceDistribution: ComplianceDistribution;
    showcaseCaseCounts: ShowcaseCaseCounts;
    exampleShowcaseIds: Partial<Record<ShowcaseCategory | "__fallback__", number[]>>;
  };
  /**
   * T-V2-09 — Resolved size contract + actual counts. Built by the
   * seeder via `buildSizeContractOutcome(...)` after the inserts
   * complete so the summary reflects truthful requested-vs-resolved.
   */
  sizeContract?: SizeContractOutcome;
}

export function buildPostRunSummary(args: BuildPostRunSummaryArgs): PostRunSummary {
  const showcase = args.showcase;
  const overlayLit = !!showcase
    && Object.values(showcase.showcaseCaseCounts).some((n) => n > 0);
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
    complianceDistribution: showcase?.complianceDistribution ?? { ...ZERO_COMPLIANCE_DISTRIBUTION },
    showcaseCaseCounts: showcase?.showcaseCaseCounts ?? { ...ZERO_SHOWCASE_COUNTS },
    exampleShowcaseIds: showcase?.exampleShowcaseIds ?? {},
    layers: {
      platform: true,
      domain: false,
      simulator: false,
      overlay: overlayLit,
    },
    sizeContract: args.sizeContract ?? null,
  };
}
