/**
 * Seed Overhaul V2 — Simulator / Policy functions (W3).
 *
 * Pure threshold-based policies that decide when alerts, handling-state
 * transitions, makeup blocks, and compensatory obligations fire. They
 * accept the running simulator aggregates and return *new* event records
 * — they never mutate inputs.
 *
 * The "no cheating" rule (v2 plan §6) is enforced here mechanically:
 *
 *   - Every alert returned by `evaluateBehindOnMinutes()` includes
 *     `derivedFrom`, which is a snapshot of the live aggregate. If a
 *     test sees an alert whose `derivedFrom.completionPct` does not
 *     match the running totals, the policy was bypassed.
 *
 *   - `evaluateCompObligation()` requires `shortfallMinutes > 0` and
 *     refuses to emit when delivered ≥ required. The seeder cannot
 *     "pre-create" a comp obligation; it must arise from an actual
 *     simulated deficit.
 *
 *   - `evaluateHandlingTransition()` returns `null` when no eligible
 *     alert exists; it cannot manufacture a transition out of nothing.
 */

import type { RngHandle } from "../platform/rng";
import type {
  ServiceKey,
  SimulatedAlert,
  SimulatedAlertSeverity,
  SimulatedCompEvent,
  SimulatedHandlingEvent,
  SimulatedHandlingState,
  SimulatedMakeupBlock,
} from "./events";

/**
 * Per (student, service) running aggregate. Updated in place by the
 * day loop after every simulated session. The policies read it; they
 * never write.
 */
export interface ServiceAggregate {
  studentDefIdx: number;
  serviceIdx: number;
  serviceKey: ServiceKey;
  /** Sum of `durationMinutes` across `status === "completed" | "makeup"`. */
  deliveredMinutes: number;
  /** Sum of `durationMinutes` across `status === "missed"`. */
  missedMinutes: number;
  /** Cumulative *expected* minutes through today (sessionsPerWeek × elapsedWeeks × sessionMinutes). */
  requiredMinutes: number;
  /** Count of `status === "missed"` rows since the last missed_sessions alert fired. */
  missedSinceLastAlert: number;
  /**
   * Worst severity already emitted for this aggregate. `null` if no
   * behind_on_minutes alert has fired yet. The policy uses this to
   * deduplicate — once "high" has fired, a fresh dip into "high" range
   * does not re-fire; only an *escalation* to "critical" does.
   */
  worstBehindSeverityEmitted: SimulatedAlertSeverity | null;
  /** True once a comp obligation has been emitted for this aggregate. */
  compEmitted: boolean;
}

/** Severity rank used for monotonic-escalation checks. */
const SEVERITY_RANK: Record<SimulatedAlertSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Decide whether a behind_on_minutes alert should fire today for the
 * given aggregate. Mirrors the v1 thresholds:
 *
 *   pct < 0.50  → critical
 *   pct < 0.70  → high
 *   pct < 0.85  → medium
 *
 * Returns null when no alert is warranted *or* when the same-or-worse
 * severity has already been emitted (deduplication). When an escalation
 * does fire, the caller is responsible for updating
 * `agg.worstBehindSeverityEmitted` so the next tick observes the new
 * baseline.
 */
export function evaluateBehindOnMinutes(
  day: number,
  agg: ServiceAggregate,
  alertIdSeed: string,
): SimulatedAlert | null {
  // Need a meaningful denominator. Without enough required minutes the
  // pct ratio is noise, not signal.
  if (agg.requiredMinutes < 60) return null;
  const pct = agg.deliveredMinutes / agg.requiredMinutes;
  let severity: SimulatedAlertSeverity | null = null;
  if (pct < 0.50) severity = "critical";
  else if (pct < 0.70) severity = "high";
  else if (pct < 0.85) severity = "medium";
  if (severity === null) return null;
  // Dedup: only fire on a strict escalation past the last emitted tier.
  const prior = agg.worstBehindSeverityEmitted;
  if (prior !== null && SEVERITY_RANK[severity] <= SEVERITY_RANK[prior]) {
    return null;
  }
  return {
    day,
    type: "behind_on_minutes",
    severity,
    studentDefIdx: agg.studentDefIdx,
    serviceKey: agg.serviceKey,
    serviceIdx: agg.serviceIdx,
    derivedFrom: {
      deliveredMinutes: agg.deliveredMinutes,
      requiredMinutes: agg.requiredMinutes,
      missedSessions: Math.round(agg.missedMinutes / 30),
      completionPct: pct,
    },
    alertId: `${alertIdSeed}|behind|${agg.studentDefIdx}|${agg.serviceIdx}|${agg.serviceKey}|${severity}`,
  };
}

/**
 * Decide whether a missed_sessions alert should fire. Mirrors v1:
 * 3 misses on a single SR triggers "high". After firing, the caller
 * resets `agg.missedSinceLastAlert` to 0 so a *new* run of 3 misses
 * (not a stale total) is required for re-fire.
 */
export function evaluateMissedSessions(
  day: number,
  agg: ServiceAggregate,
  alertIdSeed: string,
): SimulatedAlert | null {
  if (agg.missedSinceLastAlert < 3) return null;
  return {
    day,
    type: "missed_sessions",
    severity: "high",
    studentDefIdx: agg.studentDefIdx,
    serviceKey: agg.serviceKey,
    serviceIdx: agg.serviceIdx,
    derivedFrom: {
      deliveredMinutes: agg.deliveredMinutes,
      requiredMinutes: agg.requiredMinutes,
      missedSessions: agg.missedSinceLastAlert,
      completionPct: agg.requiredMinutes === 0 ? 0 : agg.deliveredMinutes / agg.requiredMinutes,
    },
    alertId: `${alertIdSeed}|missed|${agg.studentDefIdx}|${agg.serviceIdx}|${agg.serviceKey}|d${day}`,
  };
}

/**
 * Decide whether a compensatory obligation should be emitted. Strict
 * "no cheating" guard: shortfall > 0 and not previously emitted for
 * this aggregate. Two trigger bands so the test suite can assert that
 * the more severe deficits hit the higher band.
 */
export function evaluateCompObligation(
  day: number,
  agg: ServiceAggregate,
): SimulatedCompEvent | null {
  if (agg.compEmitted) return null;
  if (agg.requiredMinutes < 360) return null; // need at least ~6 weeks of mandate
  const pct = agg.deliveredMinutes / agg.requiredMinutes;
  let trigger: SimulatedCompEvent["trigger"] | null = null;
  if (pct < 0.30) trigger = "shortfall_70pct";
  else if (pct < 0.50) trigger = "shortfall_50pct";
  if (trigger === null) return null;
  const shortfallMinutes = agg.requiredMinutes - agg.deliveredMinutes;
  if (shortfallMinutes <= 0) return null;
  return {
    day,
    studentDefIdx: agg.studentDefIdx,
    serviceIdx: agg.serviceIdx,
    serviceKey: agg.serviceKey,
    shortfallMinutes,
    deliveredMinutes: agg.deliveredMinutes,
    requiredMinutes: agg.requiredMinutes,
    trigger,
  };
}

/**
 * Pick the next handling-state for an open alert. Deterministic transition
 * model — the day loop calls this at end-of-week with a forked RNG so
 * the per-alert progression is reproducible.
 *
 * Transition graph (one step per call):
 *   needs_action → awaiting_confirmation | recovery_scheduled | handed_off | under_review
 *   awaiting_confirmation → resolved | needs_action
 *   recovery_scheduled    → resolved
 *   handed_off            → under_review | resolved
 *   under_review          → resolved | handed_off
 *   resolved              → resolved (terminal — caller should skip)
 *
 * Returns null when the alert is already terminal.
 */
export function evaluateHandlingTransition(
  day: number,
  alertRef: string,
  fromState: SimulatedHandlingState,
  rng: RngHandle,
): SimulatedHandlingEvent | null {
  if (fromState === "resolved") return null;
  let toState: SimulatedHandlingState;
  let actorRole: SimulatedHandlingEvent["actorRole"];
  const r = rng.srand();
  switch (fromState) {
    case "needs_action":
      if (r < 0.40) { toState = "awaiting_confirmation"; actorRole = "case_manager"; }
      else if (r < 0.65) { toState = "recovery_scheduled"; actorRole = "provider"; }
      else if (r < 0.85) { toState = "handed_off"; actorRole = "case_manager"; }
      else { toState = "under_review"; actorRole = "coordinator"; }
      break;
    case "awaiting_confirmation":
      if (r < 0.70) { toState = "resolved"; actorRole = "provider"; }
      else { toState = "needs_action"; actorRole = "case_manager"; }
      break;
    case "recovery_scheduled":
      toState = "resolved"; actorRole = "provider";
      break;
    case "handed_off":
      if (r < 0.60) { toState = "under_review"; actorRole = "coordinator"; }
      else { toState = "resolved"; actorRole = "case_manager"; }
      break;
    case "under_review":
      if (r < 0.75) { toState = "resolved"; actorRole = "admin"; }
      else { toState = "handed_off"; actorRole = "coordinator"; }
      break;
  }
  return { day, alertRef, fromState, toState, actorRole };
}

/**
 * When a handling transition lands on `recovery_scheduled`, the
 * downstream effect is that a makeup block hits the calendar. The
 * simulator emits exactly one makeup block per such transition; the
 * `forMissedDay` is the most-recent missed session day for that
 * (student, service) pair — surfaced from the day loop.
 */
export function buildMakeupBlock(
  day: number,
  studentDefIdx: number,
  serviceIdx: number,
  serviceKey: ServiceKey,
  forMissedDay: number,
  fromAlertRef: string,
  durationMinutes: number,
  blockId: string,
): SimulatedMakeupBlock {
  return { blockId, day, studentDefIdx, serviceIdx, serviceKey, durationMinutes, forMissedDay, fromAlertRef };
}
