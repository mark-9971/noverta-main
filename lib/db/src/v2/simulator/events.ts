/**
 * Seed Overhaul V2 — Simulator / Event vocabulary (W3).
 *
 * The simulator is a PURE event source. It never writes to the
 * database. It builds these typed event records and hands them to the
 * caller; the seeder (and, in W4+, the role-profile and overlay layers)
 * decides how to persist them. Keeping the event records database-free
 * is what makes the simulator unit-testable without a Postgres roundtrip
 * and what lets the W6 parity job hash simulator output directly.
 *
 * Naming convention:
 *   *Ref fields are *symbolic* references — `studentDefIdx`,
 *   `serviceKey` — that survive the simulator without ever knowing the
 *   real DB primary key. The persistence layer maps them to row IDs
 *   when it inserts.
 *
 * No-cheating invariants this vocabulary is designed to enforce:
 *   - SimulatedAlert.derivedFrom MUST point at a fact already present
 *     in the simulator's running aggregates (no "synthesize an alert
 *     because the scenario is named urgent").
 *   - SimulatedCompEvent.shortfallMinutes MUST equal a real running
 *     deficit; the policy rejects negative or zero shortfalls.
 *   - SimulatedHandlingEvent.alertRef MUST reference an alert emitted
 *     earlier or in the same tick.
 */

import type { Scenario } from "../scenarios";

/**
 * Stable per-service key. The simulator uses the service-type *category*
 * string (speech / ot / counseling / aba / pt) so it never needs the DB
 * row id. The persistence layer resolves the category to the real
 * `service_types.id` when it writes the rows.
 */
export type ServiceKey = "speech" | "ot" | "counseling" | "aba" | "pt";

/** Outcomes the day-loop assigns to each scheduled session slot. */
export type SimulatedSessionStatus = "completed" | "missed" | "makeup" | "scheduled";

/**
 * Single session emission. `day` is the 0-based offset from the
 * simulation epoch (`SimulationResult.epochDate`). `loggedDay` is the
 * day the documentation was actually entered — equal to `day` for
 * on-time logs and `day + lagDays` for late ones.
 *
 * `serviceIdx` is the per-student slot index (0-based) so even if a
 * student carries two services with the same `serviceKey` (e.g. two
 * speech requirements), the persistence layer in W4 can map each
 * session unambiguously to a service-requirement row.
 *
 * `fromMakeupBlockRef` is set ONLY when this session row originated
 * from a previously emitted SimulatedMakeupBlock (i.e. `status` is
 * "makeup"). This guarantees the no-cheating invariant: a makeup
 * session cannot exist without the upstream block that scheduled it.
 *
 * The `cadenceWeekIdx` field is exposed so tests can verify trend-shaped
 * scenarios (sliding/recovered) actually slide and recover at the
 * expected week boundaries.
 */
export interface SimulatedSession {
  day: number;
  loggedDay: number;
  lagDays: number;
  studentDefIdx: number;
  serviceIdx: number;
  serviceKey: ServiceKey;
  durationMinutes: number;
  status: SimulatedSessionStatus;
  cadenceWeekIdx: number;
  /** True when the row is a catch-up for a previously missed mandate. */
  isMakeup: boolean;
  /** Set iff `isMakeup === true`. References the block that scheduled it. */
  fromMakeupBlockRef?: string;
}

/** Severity ladder used by both behind_on_minutes and missed_sessions. */
export type SimulatedAlertSeverity = "low" | "medium" | "high" | "critical";

/** Distinct families. Mirrors the v1 alerts.type enum vocabulary. */
export type SimulatedAlertType =
  | "behind_on_minutes"
  | "missed_sessions"
  | "iep"
  | "compliance";

/**
 * Alert emission. Every alert MUST cite the running aggregate that
 * justified it via `derivedFrom`. The threshold-based policy refuses to
 * emit when `derivedFrom` would be a no-op (e.g. pct >= 0.85 cannot
 * generate any behind_on_minutes severity).
 */
export interface SimulatedAlert {
  day: number;
  type: SimulatedAlertType;
  severity: SimulatedAlertSeverity;
  studentDefIdx: number;
  serviceKey?: ServiceKey;
  /** Per-student service slot index, set when serviceKey is set. Disambiguates multi-SR cases for W4 FK mapping. */
  serviceIdx?: number;
  derivedFrom: {
    deliveredMinutes: number;
    requiredMinutes: number;
    missedSessions: number;
    completionPct: number;
  };
  /** Stable id within the run so handling events can reference it. */
  alertId: string;
}

/** UI vocabulary; keep in lock-step with `lib/action-recommendations.ts`. */
export type SimulatedHandlingState =
  | "needs_action"
  | "awaiting_confirmation"
  | "recovery_scheduled"
  | "handed_off"
  | "under_review"
  | "resolved";

/**
 * One transition event. The simulator never mutates an emitted alert;
 * it only emits transition records keyed by `alertRef`. Persistence /
 * downstream consumers reduce these to a current-state snapshot.
 */
export interface SimulatedHandlingEvent {
  day: number;
  alertRef: string;
  fromState: SimulatedHandlingState;
  toState: SimulatedHandlingState;
  actorRole: "case_manager" | "provider" | "coordinator" | "admin";
}

/**
 * Minimal makeup-schedule block. The simulator emits these only as a
 * downstream effect of a handling-state transition that resolves an
 * alert via "schedule_makeup". This is the no-cheating contract: blocks
 * cannot appear without the alert that motivated them.
 */
export interface SimulatedMakeupBlock {
  /** Stable id within the run so the corresponding makeup session can reference it. */
  blockId: string;
  day: number;
  studentDefIdx: number;
  serviceIdx: number;
  serviceKey: ServiceKey;
  durationMinutes: number;
  /** The session day the makeup is covering — must be in the past. */
  forMissedDay: number;
  /** Alert that triggered the scheduling decision. */
  fromAlertRef: string;
}

/**
 * Compensatory obligation. Emitted at most once per (student, service)
 * per simulation when the running shortfall crosses the policy
 * threshold (default ≥ 50% gap on a non-trivial requirement). The
 * `shortfallMinutes` MUST equal the live deficit at emission time —
 * no back-derivation, no scenario-name shortcuts.
 */
export interface SimulatedCompEvent {
  day: number;
  studentDefIdx: number;
  serviceIdx: number;
  serviceKey: ServiceKey;
  shortfallMinutes: number;
  deliveredMinutes: number;
  requiredMinutes: number;
  /** Threshold band that fired, useful for assertion in tests. */
  trigger: "shortfall_50pct" | "shortfall_70pct";
}

/**
 * Aggregate output. Pure data — safe to JSON.stringify, hash, diff.
 * Future waves snapshot this shape and assert byte-level equality.
 */
export interface SimulationResult {
  /** ISO date (YYYY-MM-DD) for day=0. */
  epochDate: string;
  /** Number of simulated days (always 270 in W3). */
  totalDays: number;
  /** One row per simulated student. Index aligns with input StudentDef[]. */
  studentScenarios: ReadonlyArray<{
    studentDefIdx: number;
    scenario: Scenario;
    services: ReadonlyArray<ServiceKey>;
  }>;
  sessions: ReadonlyArray<SimulatedSession>;
  alerts: ReadonlyArray<SimulatedAlert>;
  handlingEvents: ReadonlyArray<SimulatedHandlingEvent>;
  makeupBlocks: ReadonlyArray<SimulatedMakeupBlock>;
  compEvents: ReadonlyArray<SimulatedCompEvent>;
  /** Wall-clock millis the simulation took to run. Useful for perf assertions. */
  elapsedMillis: number;
}
