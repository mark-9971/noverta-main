/**
 * Seed Overhaul V2 — Scenario registry.
 *
 * Extracted from `seed-sample-data.ts` (W1). Today this file holds the
 * Scenario type, the Intensity type, and the per-scenario completion
 * range table. W2 will promote this into a typed registry that also
 * carries presets, weights, simulation policies, and demo-overlay
 * eligibility (see .local/plans/seed-overhaul-v2.md §10.4).
 *
 * Behavior is byte-identical to the inline definitions before W1.
 */

export type Scenario =
  | "healthy"
  | "shortfall"
  | "urgent"
  | "compensatory_risk"
  | "recovered"
  | "sliding"
  | "crisis"
  | "transition"
  | "behavior_plan"
  | "incident_history"
  | "annual_review_due"
  | "esy_eligible";

export const ALL_SCENARIOS: ReadonlyArray<Scenario> = [
  "healthy",
  "shortfall",
  "urgent",
  "compensatory_risk",
  "recovered",
  "sliding",
  "crisis",
  "transition",
  "behavior_plan",
  "incident_history",
  "annual_review_due",
  "esy_eligible",
];

/** Three-level slider used by the v1 custom-seed inputs. */
export type Intensity = "low" | "medium" | "high";

/**
 * Per-scenario completion-rate band (delivered minutes ÷ required minutes)
 * used to drive session-history generation. `recovered` and `sliding`
 * specify their *recent* portion — the early-window override is applied
 * inside the session generator.
 */
/**
 * Per-profile breakdown of "narrative" students (the canonical scenarios
 * that drive dashboard storylines). Healthy students fill the remainder
 * up to the profile's total student count.
 *
 * Small profiles only get one of each scenario so storylines remain
 * recognizable without overflowing the small roster. Large profiles
 * scale specials modestly so dashboards still show a meaningful mix
 * even with 90+ healthy students.
 *
 * Promoted out of `seed-sample-data.ts` into the scenario registry in W2
 * so the future event-loop simulator (W3) and the demo-overlay layer
 * (W5) can share a single source of truth for scenario distributions
 * without re-importing from the legacy seeder file.
 */
export const SCENARIO_COUNTS_BY_PROFILE: Record<
  "small" | "medium" | "large",
  Partial<Record<Exclude<Scenario, "healthy">, number>>
> = {
  small: {
    shortfall: 2,
    urgent: 1,
    compensatory_risk: 1,
    recovered: 1,
    sliding: 1,
    crisis: 1,
    transition: 1,
    behavior_plan: 1,
    incident_history: 1,
    annual_review_due: 1,
    esy_eligible: 1,
  },
  medium: {
    shortfall: 8,
    urgent: 3,
    compensatory_risk: 4,
    recovered: 2,
    sliding: 2,
    crisis: 2,
    transition: 1,
    behavior_plan: 2,
    incident_history: 1,
    annual_review_due: 3,
    esy_eligible: 2,
  },
  large: {
    shortfall: 12,
    urgent: 4,
    compensatory_risk: 6,
    recovered: 3,
    sliding: 3,
    crisis: 3,
    transition: 2,
    behavior_plan: 3,
    incident_history: 2,
    annual_review_due: 4,
    esy_eligible: 3,
  },
};

export const COMPLETION_RATE_RANGES: Record<Scenario, readonly [number, number]> = {
  healthy:           [0.78, 0.98],
  shortfall:         [0.45, 0.78],
  urgent:            [0.15, 0.45],
  compensatory_risk: [0.30, 0.60],
  recovered:         [0.88, 0.98],
  sliding:           [0.30, 0.50],
  crisis:            [0.20, 0.32],
  transition:        [0.78, 0.95],
  behavior_plan:     [0.80, 0.95],
  incident_history:  [0.65, 0.85],
  annual_review_due: [0.72, 0.90],
  esy_eligible:      [0.70, 0.88],
};
