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
