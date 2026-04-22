/**
 * Seed Overhaul V2 — Simulator / Per-student plan derivation (W3).
 *
 * Translates the static `StudentDef` (scenario + school + grade band)
 * into the dynamic plan the day loop consumes:
 *
 *   - which services the student receives
 *   - per-service weekly cadence (sessions per week)
 *   - per-service required minutes per week
 *   - per-week target completion rate (a function of week index, since
 *     "sliding" / "recovered" / "crisis" need trend shaping)
 *
 * No DB I/O. Pure function of (StudentDef, SeedShape, RNG handle).
 *
 * Why this lives in the simulator and NOT in v2/domain:
 *   StudentDef is a *static* description (scenario, school, grades).
 *   The plan is a *time-shaped* artifact — week-by-week target rates,
 *   per-week cadence — which is the simulator's responsibility. Putting
 *   it under v2/domain would re-introduce the very back-derivation the
 *   simulator is meant to replace.
 */

import type { RngHandle } from "../platform/rng";
import {
  COMPLETION_RATE_RANGES,
  type Scenario,
} from "../scenarios";
import type { StudentDef } from "../domain";
import type { SeedShape } from "../domain";
import type { ServiceKey } from "./events";

/**
 * Per-service weekly plan. The day loop reads `dayPattern` to decide
 * whether today is a session day, then `targetRateAt(weekIdx)` to set
 * the completion probability for the roll.
 */
export interface ServicePlan {
  serviceKey: ServiceKey;
  /** Mandate from the IEP, in minutes per week. */
  weeklyRequiredMinutes: number;
  /** 30-min sessions per week derived from weeklyRequiredMinutes. 1..5. */
  sessionsPerWeek: number;
  /**
   * Which weekday(s) the service is scheduled on. Days are 1..5 = Mon..Fri.
   * Sessions are spread (Mon, Wed, Fri ordering for 3/wk; Mon, Wed for
   * 2/wk; Mon for 1/wk) so every student has a believable cadence.
   */
  dayPattern: ReadonlyArray<number>;
  /**
   * Returns the *target* completion probability for the given week
   * index. Caller multiplies by `shape.completionMultiplier` for the
   * district-level shaping. Values are bounded to [0, 1] by the
   * simulator before the roll.
   */
  targetRateAt: (weekIdx: number, totalWeeks: number) => number;
  /** Per-session duration. Fixed at 30 in W3 to mirror v1. */
  sessionMinutes: number;
}

/** Plan output for one simulated student. */
export interface StudentPlan {
  studentDefIdx: number;
  scenario: Scenario;
  services: ReadonlyArray<ServicePlan>;
}

/** Day spreading: choose Mon/Wed/Fri-style patterns for each cadence. */
const CADENCE_DAY_PATTERNS: Record<number, ReadonlyArray<number>> = {
  1: [1],          // Mon
  2: [1, 3],       // Mon, Wed
  3: [1, 3, 5],    // Mon, Wed, Fri
  4: [1, 2, 3, 5], // Mon, Tue, Wed, Fri
  5: [1, 2, 3, 4, 5],
};

/**
 * Map a scenario to the service categories that scenario typically
 * receives. Mirrors the v1 service-assignment shape from
 * `seed-sample-data.ts` but in pure form. The cardinality (1–3
 * services per student) matches what dashboards expect to render.
 */
function servicesForScenario(scenario: Scenario, rng: RngHandle): ServiceKey[] {
  switch (scenario) {
    case "behavior_plan":
    case "incident_history":
    case "crisis":
      // Behavior-heavy: ABA + counseling.
      return ["aba", "counseling"];
    case "transition":
      // Transition planning typically pairs with counseling for
      // post-secondary readiness work.
      return ["counseling", "speech"];
    case "esy_eligible":
      return ["speech", "ot"];
    case "annual_review_due":
      // Annual-review students span the whole catalog; pick 2 at random
      // so the roster doesn't end up dominated by one service.
      return rng.srand() < 0.5 ? ["speech", "ot"] : ["counseling", "pt"];
    case "shortfall":
    case "urgent":
    case "compensatory_risk":
    case "recovered":
    case "sliding":
      // Compliance-driven scenarios: lean on the high-volume services
      // that drive the dashboards (speech / ot).
      return rng.srand() < 0.5 ? ["speech"] : ["ot"];
    case "healthy":
      // Healthy students get one service so the simulation has signal
      // without bloating the session count (~80% of roster).
      return [["speech", "ot", "counseling"][Math.floor(rng.srand() * 3)] as ServiceKey];
  }
}

/**
 * Per-scenario time-shaped target rate. Each shape stays inside
 * COMPLETION_RATE_RANGES[scenario] but with a deliberate trend so the
 * dashboard storylines actually appear in the simulated data:
 *
 *   recovered  — early window low, late window high
 *   sliding    — early high, late low
 *   crisis     — flat at the floor
 *   urgent     — flat near the floor
 *   default    — modest sinusoid around the midpoint to avoid an
 *                identical week-over-week curve
 */
function rateShaperFor(scenario: Scenario): (w: number, total: number) => number {
  const [lo, hi] = COMPLETION_RATE_RANGES[scenario];
  switch (scenario) {
    case "recovered":
      // Linear ramp lo→hi.
      return (w, total) => lo + (hi - lo) * (w / Math.max(1, total - 1));
    case "sliding":
      // Linear ramp hi→lo.
      return (w, total) => hi - (hi - lo) * (w / Math.max(1, total - 1));
    case "crisis":
      return () => lo;
    case "urgent":
      return () => lo + (hi - lo) * 0.2;
    default:
      // Mid-band with mild oscillation; deterministic in (w) only so
      // the simulator stays seedable.
      return (w) => {
        const mid = (lo + hi) / 2;
        const amp = (hi - lo) / 4;
        return mid + amp * Math.sin(w / 3);
      };
  }
}

/**
 * Build the per-student plans. RNG handle is forked at the call site
 * so the per-stream advancement does not leak into other simulator
 * sub-systems (alerts, handling).
 */
export function buildStudentPlans(
  studentDefs: ReadonlyArray<StudentDef>,
  shape: SeedShape,
  rng: RngHandle,
): StudentPlan[] {
  const plans: StudentPlan[] = [];
  const [reqMinLo, reqMinHi] = shape.reqMinutesMonthlyRange;
  // Convert the *monthly* range from SeedShape into a weekly mandate
  // by dividing by 4.345 weeks/month — same constant used inside
  // buildCadenceSessionRows in v1. Floor at 30 (the per-session length)
  // so a student always carries at least one session per week.
  for (let idx = 0; idx < studentDefs.length; idx++) {
    const def = studentDefs[idx];
    const services = servicesForScenario(def.scenario, rng);
    const planned: ServicePlan[] = services.map((serviceKey) => {
      // Sample a per-service required-minutes target inside the SeedShape band.
      const monthly = reqMinLo + rng.srand() * (reqMinHi - reqMinLo);
      const weeklyRequiredMinutes = Math.max(30, Math.round(monthly / 4.345));
      const sessionMinutes = 30;
      const sessionsPerWeek = Math.max(
        1,
        Math.min(5, Math.round(weeklyRequiredMinutes / sessionMinutes)),
      );
      return {
        serviceKey,
        weeklyRequiredMinutes,
        sessionsPerWeek,
        dayPattern: CADENCE_DAY_PATTERNS[sessionsPerWeek] ?? CADENCE_DAY_PATTERNS[1],
        targetRateAt: rateShaperFor(def.scenario),
        sessionMinutes,
      };
    });
    plans.push({
      studentDefIdx: idx,
      scenario: def.scenario,
      services: planned,
    });
  }
  return plans;
}
