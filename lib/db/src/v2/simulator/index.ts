/**
 * Seed Overhaul V2 — Simulator barrel (W3).
 *
 * Public surface for the W3 9-month event-loop simulator. This module
 * was a placeholder marker in W1; W3 promotes it into a real surface:
 *
 *   - `runSimulation()` — single deterministic entry point
 *   - event vocabulary types (SimulatedSession, SimulatedAlert,
 *     SimulatedHandlingEvent, SimulatedMakeupBlock, SimulatedCompEvent,
 *     SimulationResult)
 *   - `buildStudentPlans()` — pure plan-derivation helper, exposed so
 *     tests and W4 role-profile code can introspect cadence shaping
 *   - threshold policies (alert / comp / handling) — exposed so tests
 *     can pin no-cheating invariants in isolation
 *   - calendar helpers (SIMULATION_DAYS, isSchoolDay, dateForDay)
 *
 * Not in scope (deferred):
 *   - DB persistence — handled by the seeder when it consumes a
 *     SimulationResult in W4+
 *   - role-profile usage layer (logger fingerprints, paraprofessional
 *     check-ins) — W4
 *   - demo overlay tagging (pinned showcase cases) — W5
 */

export const SIMULATOR_LAYER_VERSION = "w3";

export * from "./events";
export {
  SIMULATION_DAYS,
  defaultEpochDate,
  dateForDay,
  isSchoolDay,
  weekIdxForDay,
  toIsoDate,
} from "./time";
export {
  buildStudentPlans,
  type ServicePlan,
  type StudentPlan,
} from "./studentPlan";
export {
  evaluateBehindOnMinutes,
  evaluateMissedSessions,
  evaluateCompObligation,
  evaluateHandlingTransition,
  buildMakeupBlock,
  type ServiceAggregate,
} from "./policies";
export {
  runSimulation,
  type RunSimulationInput,
} from "./runSimulation";
