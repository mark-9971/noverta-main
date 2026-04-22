/**
 * Seed Overhaul V2 — Domain / Seed shape resolution.
 *
 * Extracted from `seed-sample-data.ts` (W2). Owns the public
 * `SeedSampleOptions` knob bundle, the resolved `SeedShape` the
 * generator branches on, and the Intensity-to-range tables that
 * translate the three-level slider knobs into concrete sampled
 * values. Pure code — only depends on the platform RNG and the
 * scenario / reference catalogs.
 *
 * Behavior is byte-identical to the pre-W2 inline definitions:
 *   - same per-knob clamps (schools 1–12, goals 1–25, weekly minutes
 *     30–300, backfill 6–12 months → ±15-day jitter floored at 180)
 *   - same intensity bands and the demoEmphasis 1.4× boosts
 *   - same scenario-weight defaults (urgent/shortfall always 1.0,
 *     crisis/comp_risk follow compensatoryExposure, etc.)
 */

import { randf } from "../../platform/rng";
import { type Intensity, type Scenario } from "../../scenarios";
import { SAMPLE_BOUNDS, type SizeProfile } from "../reference";

/** Demo narrative the seeded data should emphasize. */
export type DemoEmphasis =
  | "compliance"
  | "comp_ed"
  | "caseload"
  | "behavior"
  | "executive";

export interface SeedSampleOptions {
  /** District size profile. Defaults to "medium". See `SizeProfile` for details. */
  sizeProfile?: SizeProfile;
  /**
   * Optional override for total student count. Bypasses the per-profile cap
   * (small=20 / medium=60 / large=120) and the default 50-100 random range.
   * Special-scenario counts still come from the chosen sizeProfile; the
   * remainder is filled with healthy students. Useful for stress / load
   * scenarios where dashboards need to render against a much larger roster
   * (e.g. district-wide demos with ~2000 students). Staff count is NOT
   * auto-scaled — it follows the chosen `sizeProfile` (use "large" when
   * paired with a big `targetStudents` to get the fullest staff roster the
   * SAMPLE_STAFF_POOL allows).
   */
  targetStudents?: number;

  // ── v1 custom-seed inputs (admin "Custom sample data" form) ──
  // All fields are optional; omitting one keeps the existing default. Each
  // knob has a measurable effect on the seeded roster so the form can be
  // used to tailor a demo to a specific story (compliance crisis, comp-ed
  // exposure, behavior-heavy district, etc.).

  /** Display name when the seeder has to auto-provision the district stub. */
  districtName?: string;
  /** Number of schools to use (1–12). Defaults to 5. */
  schoolCount?: number;
  /** Override case-manager count. Without this, count auto-scales from roster size. */
  caseManagerCount?: number;
  /** Override total non-para provider count (split across SLP/OT/PT/Counselor). */
  providerCount?: number;
  /** Override paraprofessional count. */
  paraCount?: number;
  /** Override BCBA count. */
  bcbaCount?: number;
  /** Average IEP goals per student (1–25). Defaults to 15–20 random — matches
   *  realistic MA SPED IEPs which carry one goal per service area plus
   *  multiple objectives per area. */
  avgGoalsPerStudent?: number;
  /** Average required service minutes per week (30–300). Defaults to ~15–90/wk. */
  avgRequiredMinutesPerWeek?: number;
  /** How many months of session history to backfill (1–12). Defaults to ~8. */
  backfillMonths?: number;
  /** Compliance health: low → more shortfalls; high → mostly on-track. */
  complianceHealth?: Intensity;
  /** Staffing strain: low → light caseloads; high → over-stretched providers. */
  staffingStrain?: Intensity;
  /** Documentation quality: low → high logging lag; high → mostly on-time. */
  documentationQuality?: Intensity;
  /** Compensatory exposure: scales crisis + compensatory_risk scenarios. */
  compensatoryExposure?: Intensity;
  /** Behavior intensity: scales behavior_plan + incident_history scenarios. */
  behaviorIntensity?: Intensity;
  /** Demo story focus — boosts the headline scenarios for that narrative. */
  demoEmphasis?: DemoEmphasis;

  /**
   * T-V2-06-FOLLOWUP — when true, skips the W5 Demo Readiness Overlay
   * invocation at the end of the seed run, executing the literal V1
   * code path (no `runDemoReadinessOverlay`, no `buildShowcaseSummaryArg`,
   * no `showcase` arg passed into `buildPostRunSummary`). Used by the
   * real V1↔V2 parity bake to compare both paths against the same
   * districtId without git-checkout games or synthesized snapshots.
   * Defaults to undefined → V2 path (overlay runs).
   */
  disableV2Overlay?: boolean;
}

/**
 * Resolved knob bundle that the seeder body actually reads. Built once at the
 * top of `seedSampleDataForDistrict()` so every downstream insertion can
 * branch on the *same* config without re-deriving it.
 */
export interface SeedShape {
  schoolCount: number;
  goalsRange: readonly [number, number];
  reqMinutesMonthlyRange: readonly [number, number];
  backfillDays: number;
  completionMultiplier: number;
  onTimeLogProb: number;
  staffRatioMultiplier: number;
  scenarioWeights: Partial<Record<Exclude<Scenario, "healthy">, number>>;
  staffOverrides: {
    caseManager?: number;
    bcba?: number;
    provider?: number;
    paraprofessional?: number;
  };
}

// Intensity-tier multipliers as RANGES rather than fixed magic numbers.
// Each call to resolveSeedShape samples a single value from the appropriate
// band so successive seed runs don't pin to the same target. Bands overlap
// modestly between adjacent tiers (e.g. low.completion can graze medium)
// so a "low compliance" seed isn't always identifiably worse than a
// "medium" one — that's intentional realism, not a bug.
export const INTENSITY_TO_COMPLETION_RANGE: Record<Intensity, readonly [number, number]> = {
  low:    [0.55, 0.78],
  medium: [0.85, 1.10],
  high:   [1.10, 1.30],
};
export const INTENSITY_TO_ONTIME_RANGE: Record<Intensity, readonly [number, number]> = {
  low:    [0.35, 0.55],
  medium: [0.65, 0.85],
  high:   [0.88, 0.97],
};
export const INTENSITY_TO_STAFFRATIO_RANGE: Record<Intensity, readonly [number, number]> = {
  low:    [0.55, 0.85],
  medium: [0.90, 1.15],
  high:   [1.30, 1.70],
};
export const INTENSITY_TO_SCALE_RANGE: Record<Intensity, readonly [number, number]> = {
  low:    [0.30, 0.55],
  medium: [0.85, 1.20],
  high:   [1.55, 2.05],
};

export function resolveSeedShape(opts: SeedSampleOptions): SeedShape {
  const schoolCount = Math.max(1, Math.min(12, opts.schoolCount ?? 5));

  // Goals/student: center on the requested mean, ±2. Default band 15–20
  // mirrors real MA SPED IEPs (one annual goal per service area + multiple
  // objectives per area). Hard cap 25 keeps insert volume bounded for the
  // 2,000-student demo (≤50k iep_goals rows).
  const g = opts.avgGoalsPerStudent != null
    ? Math.max(1, Math.min(25, Math.round(opts.avgGoalsPerStudent)))
    : null;
  const goalsRange: readonly [number, number] = g != null
    ? [Math.max(1, g - 2), Math.min(25, g + 2)]
    : [15, 20];

  // Weekly minutes → monthly minutes (×4.345). Range = ±40% around the mean.
  let reqMinutesMonthlyRange: readonly [number, number] = SAMPLE_BOUNDS.requiredMinutes;
  if (opts.avgRequiredMinutesPerWeek != null) {
    const w = Math.max(30, Math.min(300, opts.avgRequiredMinutesPerWeek));
    const monthly = Math.round(w * 4.345);
    reqMinutesMonthlyRange = [
      Math.max(30, Math.round(monthly * 0.6)),
      Math.min(600, Math.round(monthly * 1.4)),
    ];
  }

  // backfillDays: requested-months × 30 with ±15-day jitter so successive
  // seed runs don't always land on the exact same window length. Floor at
  // 180 to honor the validator's ≥6-month-history requirement; ceiling at
  // 365 to stay inside one school-year envelope.
  const baseBackfill = Math.round((opts.backfillMonths ?? 8) * 30);
  const backfillDays = Math.max(180, Math.min(365, baseBackfill + Math.round(randf(-15, 15))));

  const completionMultiplier = randf(...INTENSITY_TO_COMPLETION_RANGE[opts.complianceHealth ?? "medium"]);
  const onTimeLogProb        = randf(...INTENSITY_TO_ONTIME_RANGE[opts.documentationQuality ?? "medium"]);
  const staffRatioMultiplier = randf(...INTENSITY_TO_STAFFRATIO_RANGE[opts.staffingStrain ?? "medium"]);

  const compMul = randf(...INTENSITY_TO_SCALE_RANGE[opts.compensatoryExposure ?? "medium"]);
  const behMul  = randf(...INTENSITY_TO_SCALE_RANGE[opts.behaviorIntensity ?? "medium"]);
  const scenarioWeights: Partial<Record<Exclude<Scenario, "healthy">, number>> = {
    crisis: compMul,
    compensatory_risk: compMul,
    urgent: 1.0,
    shortfall: 1.0,
    behavior_plan: behMul,
    incident_history: behMul,
  };
  const emphasisBoost = 1.4;
  switch (opts.demoEmphasis) {
    case "compliance":
      scenarioWeights.shortfall = (scenarioWeights.shortfall ?? 1) * emphasisBoost;
      scenarioWeights.urgent    = (scenarioWeights.urgent ?? 1) * emphasisBoost;
      scenarioWeights.annual_review_due = (scenarioWeights.annual_review_due ?? 1) * emphasisBoost;
      break;
    case "comp_ed":
      scenarioWeights.crisis            = (scenarioWeights.crisis ?? 1) * emphasisBoost;
      scenarioWeights.compensatory_risk = (scenarioWeights.compensatory_risk ?? 1) * emphasisBoost;
      break;
    case "behavior":
      scenarioWeights.behavior_plan    = (scenarioWeights.behavior_plan ?? 1) * emphasisBoost;
      scenarioWeights.incident_history = (scenarioWeights.incident_history ?? 1) * emphasisBoost;
      break;
    case "caseload":
      // Caseload story = "we're drowning in students under-served." Push
      // shortfall + urgent so dashboards light up red, and add a behavior_plan
      // bump so case managers visibly carry complex kids on top of the volume.
      scenarioWeights.shortfall     = (scenarioWeights.shortfall ?? 1) * emphasisBoost;
      scenarioWeights.urgent        = (scenarioWeights.urgent ?? 1) * emphasisBoost;
      scenarioWeights.behavior_plan = (scenarioWeights.behavior_plan ?? 1) * emphasisBoost;
      break;
    case "executive":
      // Executive overview = balanced "win + risk + maintenance" snapshot.
      // Lift recovered (the green-checkmark story) and annual_review_due
      // (the calendar-driven workload metric) so leadership reports show
      // both progress and upcoming load instead of pure crisis.
      scenarioWeights.recovered          = (scenarioWeights.recovered ?? 1) * emphasisBoost;
      scenarioWeights.annual_review_due  = (scenarioWeights.annual_review_due ?? 1) * emphasisBoost;
      break;
  }

  return {
    schoolCount,
    goalsRange,
    reqMinutesMonthlyRange,
    backfillDays,
    completionMultiplier,
    onTimeLogProb,
    staffRatioMultiplier,
    scenarioWeights,
    staffOverrides: {
      caseManager: opts.caseManagerCount,
      bcba: opts.bcbaCount,
      provider: opts.providerCount,
      paraprofessional: opts.paraCount,
    },
  };
}
