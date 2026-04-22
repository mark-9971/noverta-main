/**
 * Seed Overhaul V2 — Simulator / Day-by-day orchestrator (W3).
 *
 * The single public entry point for the simulator. Given a fully
 * resolved domain context (district id, student defs, seed shape) it
 * walks 270 calendar days and emits a structured event stream:
 *
 *   sessions[]        — per scheduled service slot
 *   alerts[]          — derived from running aggregates
 *   handlingEvents[]  — alert state transitions
 *   makeupBlocks[]    — caused by handling-state transitions
 *   compEvents[]      — caused by accumulated shortfall
 *
 * The simulator OWNS the day clock. It does NOT own:
 *   - student definition (caller passes StudentDef[] from v2/domain)
 *   - SeedShape resolution (caller passes the resolved shape)
 *   - persistence (W4+ wires the result to the seeder)
 *
 * Determinism contract:
 *   - same `districtId` + same `studentDefs` (same length, same scenario
 *     order) + same `shape` → byte-identical SimulationResult, modulo
 *     `elapsedMillis`.
 *   - All RNG flows from `forkStream("v2-simulator")` so future changes
 *     to other simulator-adjacent streams (overlay, role profiles) do
 *     not shift the simulator's output.
 *   - Default `epochDate` is a fixed anchor (no wall clock).
 *
 * No-cheating guarantees enforced here:
 *   - `status === "makeup"` sessions ONLY emerge from materializing a
 *     previously emitted SimulatedMakeupBlock — never from a random
 *     roll inside the cadence loop. Each makeup session carries
 *     `fromMakeupBlockRef` pointing at its origin block.
 *   - Alerts/comp events come exclusively from policy functions reading
 *     running aggregates. The orchestrator never inserts them directly.
 */

import { forkStream, setSeed } from "../platform/rng";
import type { StudentDef, SeedShape } from "../domain";
import type {
  ServiceKey,
  SimulatedAlert,
  SimulatedCompEvent,
  SimulatedHandlingEvent,
  SimulatedHandlingState,
  SimulatedMakeupBlock,
  SimulatedSession,
  SimulationResult,
} from "./events";
import {
  buildStudentPlans,
  type ServicePlan,
  type StudentPlan,
} from "./studentPlan";
import {
  evaluateBehindOnMinutes,
  evaluateCompObligation,
  evaluateHandlingTransition,
  evaluateMissedSessions,
  buildMakeupBlock,
  type ServiceAggregate,
} from "./policies";
import {
  SIMULATION_DAYS,
  defaultEpochDate,
  dowForDay,
  isSchoolDay,
  weekIdxForDay,
} from "./time";

export interface RunSimulationInput {
  /** Mixed into the stream seed; same value → same output. */
  districtId: number;
  /** Per-student definitions from v2/domain.buildStudentDefs(). */
  studentDefs: ReadonlyArray<StudentDef>;
  /** Resolved seed shape from v2/domain.resolveSeedShape(). */
  shape: SeedShape;
  /**
   * Optional explicit epoch (YYYY-MM-DD). Defaults to a fixed
   * deterministic anchor (`DEFAULT_EPOCH_DATE`) so determinism does
   * NOT depend on wall-clock time. The seeder may pass an explicit
   * value to align the simulation window with "now".
   */
  epochDate?: string;
  /** Optional override for total simulated days (for perf tests). */
  totalDays?: number;
  /** Optional clock for elapsedMillis (defaults to Date.now). */
  clock?: () => number;
}

function aggKey(studentDefIdx: number, serviceIdx: number): string {
  return `${studentDefIdx}|${serviceIdx}`;
}

/**
 * Public entry point. Pure event emission — no DB writes, no I/O.
 */
export function runSimulation(input: RunSimulationInput): SimulationResult {
  // Install the deterministic stream first so any helper that draws
  // from the shared state (e.g. plan-time service picks) sees the same
  // bits across invocations.
  setSeed(input.districtId);

  // Fork independent RNG streams so each sub-system advances without
  // disturbing the others. Future waves can add more streams without
  // shifting any pre-existing ones.
  const planRng = forkStream(`v2-sim-plan-${input.districtId}`);
  const sessionRng = forkStream(`v2-sim-session-${input.districtId}`);
  const handlingRng = forkStream(`v2-sim-handling-${input.districtId}`);

  const epochDate = input.epochDate ?? defaultEpochDate();
  const totalDays = input.totalDays ?? SIMULATION_DAYS;
  const clock = input.clock ?? Date.now;
  const startMs = clock();

  const plans = buildStudentPlans(input.studentDefs, input.shape, planRng);

  const sessions: SimulatedSession[] = [];
  const alerts: SimulatedAlert[] = [];
  const handlingEvents: SimulatedHandlingEvent[] = [];
  const makeupBlocks: SimulatedMakeupBlock[] = [];
  const compEvents: SimulatedCompEvent[] = [];

  // Per (student, serviceIdx) running aggregates the policies read.
  const aggregates = new Map<string, ServiceAggregate>();
  // Open alerts → current handling state. Resolved alerts are pruned
  // so the map stays small even on long runs.
  const openAlerts = new Map<
    string,
    {
      state: SimulatedHandlingState;
      studentDefIdx: number;
      serviceIdx: number | undefined;
      serviceKey: ServiceKey | undefined;
    }
  >();
  // Most recent missed-session day per (student, serviceIdx) so a
  // recovery_scheduled handling transition can build a makeup block
  // pointing at a real past miss (no "made up a session that never
  // happened" cheating).
  const lastMissDay = new Map<string, number>();
  // Scheduled makeup blocks indexed by day → list of pending block ids.
  // The day loop materializes these as makeup sessions when the day
  // arrives. This is the ONLY path that can emit a "makeup" status
  // session, satisfying the no-cheating contract.
  const pendingMakeupByDay = new Map<number, SimulatedMakeupBlock[]>();
  // Monotonic counter so each makeup block gets a unique id. Order is
  // deterministic because we iterate the open-alerts map in insertion
  // order, which mirrors emission order.
  let makeupBlockCounter = 0;

  function ensureAgg(studentDefIdx: number, serviceIdx: number, serviceKey: ServiceKey): ServiceAggregate {
    const key = aggKey(studentDefIdx, serviceIdx);
    let a = aggregates.get(key);
    if (!a) {
      a = {
        studentDefIdx,
        serviceIdx,
        serviceKey,
        deliveredMinutes: 0,
        missedMinutes: 0,
        requiredMinutes: 0,
        missedSinceLastAlert: 0,
        worstBehindSeverityEmitted: null,
        compEmitted: false,
      };
      aggregates.set(key, a);
    }
    return a;
  }

  // Incremental cadence tracking: per (student, serviceIdx), accrue
  // expected weekly minutes once per ISO-week so `requiredMinutes`
  // reflects the live "how much should you have delivered by today"
  // line dashboards show — not the lifetime goal. This is what makes
  // alert thresholds meaningful early in the run.
  const weekAccrued = new Map<string, number>();

  for (let day = 0; day < totalDays; day++) {
    const isWeekday = isSchoolDay(epochDate, day);
    const weekIdx = weekIdxForDay(day);
    const dow = dowForDay(epochDate, day); // 0..6, 1..5 = school
    const totalWeeks = Math.ceil(totalDays / 7);

    if (isWeekday) {
      // Step 1: weekly required-minutes accrual on the first school day
      // of each week we encounter the (student, service) pair.
      for (const plan of plans) {
        for (let svcIdx = 0; svcIdx < plan.services.length; svcIdx++) {
          const svc = plan.services[svcIdx];
          const key = aggKey(plan.studentDefIdx, svcIdx);
          const lastWeek = weekAccrued.get(key);
          if (lastWeek !== weekIdx) {
            const agg = ensureAgg(plan.studentDefIdx, svcIdx, svc.serviceKey);
            agg.requiredMinutes += svc.weeklyRequiredMinutes;
            weekAccrued.set(key, weekIdx);
          }
        }
      }

      // Step 2: materialize any pending makeup blocks scheduled for
      // today. These run BEFORE the cadence loop so a makeup landing
      // on a regular session day still gets recorded distinctly.
      const pending = pendingMakeupByDay.get(day);
      if (pending) {
        for (const block of pending) {
          const agg = ensureAgg(block.studentDefIdx, block.serviceIdx, block.serviceKey);
          // Makeup execution: assume providers actually deliver the
          // makeup (block existence already represents the scheduling
          // commitment). This counts toward delivered minutes and
          // closes the gap that motivated the original alert.
          const lagDays = sessionRng.srand() < input.shape.onTimeLogProb
            ? 0
            : Math.floor(sessionRng.srand() * 10) + 1;
          sessions.push({
            day,
            loggedDay: day + lagDays,
            lagDays,
            studentDefIdx: block.studentDefIdx,
            serviceIdx: block.serviceIdx,
            serviceKey: block.serviceKey,
            durationMinutes: block.durationMinutes,
            status: "makeup",
            cadenceWeekIdx: weekIdx,
            isMakeup: true,
            fromMakeupBlockRef: block.blockId,
          });
          agg.deliveredMinutes += block.durationMinutes;
        }
        pendingMakeupByDay.delete(day);
      }

      // Step 3: per (student, service slot), if today matches the
      // cadence pattern, roll a session outcome and emit the event.
      for (const plan of plans) {
        for (let svcIdx = 0; svcIdx < plan.services.length; svcIdx++) {
          const svc = plan.services[svcIdx];
          if (!svc.dayPattern.includes(dow)) continue;
          const targetRate = svc.targetRateAt(weekIdx, totalWeeks);
          const effectiveRate = clamp01(targetRate * input.shape.completionMultiplier);
          const completed = sessionRng.srand() < effectiveRate;
          const lagDays = sessionRng.srand() < input.shape.onTimeLogProb
            ? 0
            : Math.floor(sessionRng.srand() * 10) + 1;
          const status = completed ? "completed" : "missed";
          sessions.push({
            day,
            loggedDay: day + lagDays,
            lagDays,
            studentDefIdx: plan.studentDefIdx,
            serviceIdx: svcIdx,
            serviceKey: svc.serviceKey,
            durationMinutes: svc.sessionMinutes,
            status,
            cadenceWeekIdx: weekIdx,
            isMakeup: false,
          });

          // Update aggregates from the just-emitted fact.
          const agg = ensureAgg(plan.studentDefIdx, svcIdx, svc.serviceKey);
          if (completed) {
            agg.deliveredMinutes += svc.sessionMinutes;
          } else {
            agg.missedMinutes += svc.sessionMinutes;
            agg.missedSinceLastAlert += 1;
            lastMissDay.set(aggKey(plan.studentDefIdx, svcIdx), day);
          }

          // Per-tick missed_sessions check (≥3 misses since last alert).
          const missedAlert = evaluateMissedSessions(day, agg, `d${input.districtId}`);
          if (missedAlert) {
            alerts.push(missedAlert);
            openAlerts.set(missedAlert.alertId, {
              state: "needs_action",
              studentDefIdx: missedAlert.studentDefIdx,
              serviceIdx: missedAlert.serviceIdx,
              serviceKey: missedAlert.serviceKey,
            });
            agg.missedSinceLastAlert = 0;
          }
        }
      }
    }

    // Step 4: Friday checkpoint — behind_on_minutes alerts, comp
    // obligations, and step every open alert one notch along its
    // handling-state graph.
    if (dow === 5) {
      for (const agg of aggregates.values()) {
        const behindAlert = evaluateBehindOnMinutes(day, agg, `d${input.districtId}`);
        if (behindAlert) {
          alerts.push(behindAlert);
          agg.worstBehindSeverityEmitted = behindAlert.severity;
          openAlerts.set(behindAlert.alertId, {
            state: "needs_action",
            studentDefIdx: behindAlert.studentDefIdx,
            serviceIdx: behindAlert.serviceIdx,
            serviceKey: behindAlert.serviceKey,
          });
        }
        const compEvent = evaluateCompObligation(day, agg);
        if (compEvent) {
          compEvents.push(compEvent);
          agg.compEmitted = true;
        }
      }

      for (const [alertRef, entry] of [...openAlerts.entries()]) {
        const transition = evaluateHandlingTransition(day, alertRef, entry.state, handlingRng);
        if (!transition) continue;
        handlingEvents.push(transition);
        // recovery_scheduled → enqueue a makeup block. The block is
        // scheduled into the future (3–10 days out, capped at horizon)
        // and will materialize as a makeup session when its day arrives.
        if (
          transition.toState === "recovery_scheduled" &&
          entry.serviceKey !== undefined &&
          entry.serviceIdx !== undefined
        ) {
          const missDay = lastMissDay.get(aggKey(entry.studentDefIdx, entry.serviceIdx));
          if (missDay !== undefined && missDay < day) {
            const offset = 3 + Math.floor(handlingRng.srand() * 8);
            const makeupDay = Math.min(day + offset, totalDays - 1);
            const blockId = `d${input.districtId}|mu|${makeupBlockCounter++}`;
            const block = buildMakeupBlock(
              makeupDay,
              entry.studentDefIdx,
              entry.serviceIdx,
              entry.serviceKey,
              missDay,
              alertRef,
              30,
              blockId,
            );
            makeupBlocks.push(block);
            const dayList = pendingMakeupByDay.get(makeupDay) ?? [];
            dayList.push(block);
            pendingMakeupByDay.set(makeupDay, dayList);
          }
        }
        if (transition.toState === "resolved") {
          openAlerts.delete(alertRef);
        } else {
          entry.state = transition.toState;
        }
      }
    }
  }

  return {
    epochDate,
    totalDays,
    studentScenarios: plans.map((p) => ({
      studentDefIdx: p.studentDefIdx,
      scenario: p.scenario,
      services: p.services.map((s) => s.serviceKey),
    })),
    sessions,
    alerts,
    handlingEvents,
    makeupBlocks,
    compEvents,
    elapsedMillis: clock() - startMs,
  };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export type { ServicePlan, StudentPlan };
