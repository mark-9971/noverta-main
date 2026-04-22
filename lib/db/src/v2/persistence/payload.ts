/**
 * Seed Overhaul V2 — Persistence payload (W4).
 *
 * Pure function. Takes the simulator output + a PersistenceMapping +
 * orchestration context and returns the FULL set of row arrays that
 * would be written to the operational tables. No DB calls happen here
 * — this is what makes the bridge testable end-to-end without a
 * Postgres instance.
 *
 * No-cheating contract enforced inside `buildPersistencePayload`:
 *   - Every session row originates from a SimulatedSession. Status,
 *     duration, isMakeup, and dates are copied verbatim. The builder
 *     never invents a session, never flips a completed → missed, and
 *     never patches a row after-the-fact.
 *   - Every alert row originates from a SimulatedAlert. The message
 *     text is templated from the alert's own `derivedFrom` snapshot —
 *     no static "behind" copy that could disagree with real numbers.
 *   - Every comp obligation row originates from a SimulatedCompEvent.
 *     `minutesOwed === simEvent.shortfallMinutes`. The builder never
 *     widens or narrows the gap.
 *   - Every schedule_block (makeup) row originates from a
 *     SimulatedMakeupBlock. The block's `forMissedDay` becomes part
 *     of the block notes for traceability.
 *   - Every action_item_handling row pairs 1:1 with an emitted
 *     SimulatedAlert and reflects the LAST handlingEvent's toState
 *     for that alert. action_item_handling_events mirror the
 *     SimulatedHandlingEvent stream, one event per transition.
 *
 * Determinism: same simulator output + same mapping + same context →
 * byte-identical payload. Tests pin a sha256 hash to lock this.
 *
 * Orphan handling: events whose symbolic refs (studentDefIdx,
 * serviceIdx, serviceKey) cannot be resolved in the mapping are
 * dropped and counted in `orphanedRefs`. The builder NEVER fabricates
 * a target row to make the count match the simulator. Operators see
 * the orphan count in PersistenceCounts and can investigate.
 */

import {
  sessionLogsTable,
  alertsTable,
  compensatoryObligationsTable,
  scheduleBlocksTable,
  actionItemHandlingTable,
} from "../../schema";

type InsertSessionLog = typeof sessionLogsTable.$inferInsert;
type InsertAlert = typeof alertsTable.$inferInsert;
type InsertCompensatoryObligation = typeof compensatoryObligationsTable.$inferInsert;
type InsertScheduleBlock = typeof scheduleBlocksTable.$inferInsert;
type InsertActionItemHandling = typeof actionItemHandlingTable.$inferInsert;
import type {
  SimulationResult,
  SimulatedAlert,
  SimulatedHandlingEvent,
  SimulatedHandlingState,
  SimulatedMakeupBlock,
  SimulatedSession,
  ServiceKey,
} from "../simulator";
import type { MappedServiceRequirement, MappedStudent, PersistenceMapping } from "./mapping";

export interface BuildPersistencePayloadInput {
  /** Simulator output — emitted by `runSimulation`. */
  simulation: SimulationResult;
  /** DB lookup tables resolved before this call. */
  mapping: PersistenceMapping;
  /** Identifier persisted on action_item_handling rows so the seeder
   *  attribution is consistent across runs. */
  systemUserId: string;
  /** Display name for the same. */
  systemUserName: string;
}

export interface InsertHandlingEventRow {
  districtId: number;
  itemId: string;
  fromState: string | null;
  toState: string;
  note: string | null;
  changedByUserId: string;
  changedByName: string | null;
  changedAt: Date;
}

export interface PersistencePayload {
  sessions: InsertSessionLog[];
  /** Index aligned with `sessions[]`; references the makeup block id
   *  (e.g. "d424242|mu|17") that produced the makeup session. Empty
   *  string for non-makeup rows. The DB writer dereferences these to
   *  the real schedule_blocks.id after blocks are inserted. */
  sessionMakeupRefs: string[];
  alerts: InsertAlert[];
  /** Per-alert ref string ("d<district>|...|severity") so the writer
   *  can backfill action_item_handling.itemId after alerts are
   *  inserted with their real DB ids. */
  alertRefs: string[];
  compObligations: InsertCompensatoryObligation[];
  /** Schedule blocks for makeup sessions, one per SimulatedMakeupBlock. */
  scheduleBlocks: InsertScheduleBlock[];
  /** Block ref strings (the simulator's blockId), aligned with `scheduleBlocks[]`. */
  scheduleBlockRefs: string[];
  /** One row per emitted alert that ever entered handling. The writer
   *  rewrites `itemId` to `alert:<dbId>` after alerts are persisted. */
  handlingState: Array<Omit<InsertActionItemHandling, "itemId"> & { alertRef: string }>;
  /** One row per SimulatedHandlingEvent. `itemId` rewritten same way. */
  handlingEvents: Array<Omit<InsertHandlingEventRow, "itemId"> & { alertRef: string }>;
  /** Diagnostic counters. Operators consume these to detect drift. */
  counts: PersistenceCounts;
}

export interface PersistenceCounts {
  sessions: number;
  alerts: number;
  compObligations: number;
  scheduleBlocks: number;
  handlingState: number;
  handlingEvents: number;
  /** Simulator events dropped because their symbolic ref did not resolve. */
  orphanedRefs: {
    sessions: number;
    alerts: number;
    compObligations: number;
    scheduleBlocks: number;
    handlingEvents: number;
  };
}

const ZERO_COUNTS: PersistenceCounts = {
  sessions: 0,
  alerts: 0,
  compObligations: 0,
  scheduleBlocks: 0,
  handlingState: 0,
  handlingEvents: 0,
  orphanedRefs: { sessions: 0, alerts: 0, compObligations: 0, scheduleBlocks: 0, handlingEvents: 0 },
};

const DAY_MS = 24 * 60 * 60 * 1000;

function isoAt(epochDate: string, dayOffset: number): string {
  const epoch = new Date(`${epochDate}T00:00:00Z`);
  return new Date(epoch.getTime() + dayOffset * DAY_MS).toISOString().slice(0, 10);
}

function timestampAt(epochDate: string, dayOffset: number): Date {
  const epoch = new Date(`${epochDate}T00:00:00Z`);
  return new Date(epoch.getTime() + dayOffset * DAY_MS);
}

const DOW_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function dayOfWeekName(epochDate: string, dayOffset: number): string {
  const d = new Date(`${epochDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return DOW_NAMES[d.getUTCDay()];
}

/**
 * Resolve (studentDefIdx, serviceKey, serviceIdx) → mapped SR.
 *
 * `serviceIdx` is the GLOBAL slot index in the simulator's per-student
 * plan (matches `studentScenarios[i].services` ordering). The mapping
 * preserves that same ordering when built from the inserted SR rows.
 *
 * STRICT: returns null on any miss — out-of-range index, mismatched
 * serviceKey, or null serviceKey on the slot (classifier failed).
 * Never falls back to "another slot that has the right key" because
 * that would silently re-route a simulated event onto the wrong SR
 * (architect W4 R1: misassociation = fabrication).
 */
function resolveService(
  student: MappedStudent | undefined,
  serviceKey: ServiceKey,
  serviceIdx: number,
): MappedServiceRequirement | null {
  if (!student) return null;
  if (serviceIdx < 0 || serviceIdx >= student.services.length) return null;
  const slot = student.services[serviceIdx];
  if (slot.serviceKey !== serviceKey) return null;
  return slot;
}

function severityToHandlingNote(state: SimulatedHandlingState): string {
  switch (state) {
    case "needs_action": return "Triaged from simulated alert; awaiting owner action.";
    case "awaiting_confirmation": return "Asked provider to confirm; waiting on response.";
    case "recovery_scheduled": return "Makeup block scheduled in response to gap.";
    case "handed_off": return "Handed off to coordinator for follow-up.";
    case "under_review": return "Escalated for compliance review.";
    case "resolved": return "Resolved after recovery actions completed.";
  }
}

function alertMessage(alert: SimulatedAlert): string {
  const { deliveredMinutes, requiredMinutes, missedSessions, completionPct } = alert.derivedFrom;
  const pct = Math.round(completionPct * 100);
  if (alert.type === "behind_on_minutes") {
    return `Behind on minutes: delivered ${deliveredMinutes} of ${requiredMinutes} required (${pct}% complete).`;
  }
  return `${missedSessions} missed sessions accumulated since last alert.`;
}

function alertSuggestedAction(alert: SimulatedAlert): string {
  if (alert.severity === "critical") return "Schedule makeup sessions immediately to address the deficit.";
  if (alert.severity === "high") return "Review schedule and add additional sessions to close the gap.";
  return "Monitor and ensure upcoming sessions are not missed.";
}

/**
 * Reduce the simulator's handlingEvents stream into a per-alert
 * snapshot containing the latest state and the full transition list.
 * Pure data shaping — no policy decisions live here.
 */
function reduceHandling(
  events: ReadonlyArray<SimulatedHandlingEvent>,
): Map<string, { latest: SimulatedHandlingEvent; ordered: SimulatedHandlingEvent[] }> {
  const out = new Map<string, { latest: SimulatedHandlingEvent; ordered: SimulatedHandlingEvent[] }>();
  for (const ev of events) {
    let entry = out.get(ev.alertRef);
    if (!entry) {
      entry = { latest: ev, ordered: [] };
      out.set(ev.alertRef, entry);
    }
    entry.ordered.push(ev);
    if (ev.day >= entry.latest.day) entry.latest = ev;
  }
  return out;
}

export function buildPersistencePayload(input: BuildPersistencePayloadInput): PersistencePayload {
  const { simulation, mapping, systemUserId, systemUserName } = input;
  const counts: PersistenceCounts = JSON.parse(JSON.stringify(ZERO_COUNTS));

  const studentByIdx = new Map<number, MappedStudent>();
  for (const s of mapping.students) studentByIdx.set(s.studentDefIdx, s);

  // ── Sessions ──────────────────────────────────────────────────────
  const sessions: InsertSessionLog[] = [];
  const sessionMakeupRefs: string[] = [];
  for (const sim of simulation.sessions) {
    const student = studentByIdx.get(sim.studentDefIdx);
    const svc = resolveService(student, sim.serviceKey, sim.serviceIdx);
    if (!student || !svc) {
      counts.orphanedRefs.sessions++;
      continue;
    }
    sessions.push(sessionRow(sim, student, svc, mapping, simulation.epochDate));
    sessionMakeupRefs.push(sim.fromMakeupBlockRef ?? "");
    counts.sessions++;
  }

  // ── Alerts ────────────────────────────────────────────────────────
  const alerts: InsertAlert[] = [];
  const alertRefs: string[] = [];
  for (const a of simulation.alerts) {
    const student = studentByIdx.get(a.studentDefIdx);
    if (!student) {
      counts.orphanedRefs.alerts++;
      continue;
    }
    const svc = a.serviceKey !== undefined && a.serviceIdx !== undefined
      ? resolveService(student, a.serviceKey, a.serviceIdx)
      : null;
    alerts.push({
      type: a.type,
      severity: a.severity,
      studentId: student.studentId,
      serviceRequirementId: svc?.serviceRequirementId ?? null,
      message: alertMessage(a),
      suggestedAction: alertSuggestedAction(a),
      resolved: false,
      createdAt: timestampAt(simulation.epochDate, a.day),
    });
    alertRefs.push(a.alertId);
    counts.alerts++;
  }

  // ── Compensatory obligations ──────────────────────────────────────
  const compObligations: InsertCompensatoryObligation[] = [];
  for (const c of simulation.compEvents) {
    const student = studentByIdx.get(c.studentDefIdx);
    const svc = resolveService(student, c.serviceKey, c.serviceIdx);
    if (!student || !svc) {
      counts.orphanedRefs.compObligations++;
      continue;
    }
    const periodStart = isoAt(simulation.epochDate, Math.max(0, c.day - 60));
    const periodEnd = isoAt(simulation.epochDate, c.day);
    compObligations.push({
      studentId: student.studentId,
      serviceRequirementId: svc.serviceRequirementId,
      periodStart,
      periodEnd,
      minutesOwed: c.shortfallMinutes,
      minutesDelivered: 0,
      status: "pending",
      notes: `Simulator-derived obligation (trigger=${c.trigger}); ${c.deliveredMinutes} of ${c.requiredMinutes} delivered through period end.`,
      source: "system",
    });
    counts.compObligations++;
  }

  // ── Schedule blocks (makeup) ──────────────────────────────────────
  const scheduleBlocks: InsertScheduleBlock[] = [];
  const scheduleBlockRefs: string[] = [];
  for (const block of simulation.makeupBlocks) {
    const student = studentByIdx.get(block.studentDefIdx);
    const svc = resolveService(student, block.serviceKey, block.serviceIdx);
    if (!student || !svc) {
      counts.orphanedRefs.scheduleBlocks++;
      continue;
    }
    const staffId = svc.providerStaffId ?? mapping.defaultStaffId;
    scheduleBlocks.push(scheduleBlockRow(block, student, svc, staffId, mapping, simulation.epochDate));
    scheduleBlockRefs.push(block.blockId);
    counts.scheduleBlocks++;
  }

  // ── Handling state + events ───────────────────────────────────────
  const handlingByRef = reduceHandling(simulation.handlingEvents);
  const handlingState: Array<Omit<InsertActionItemHandling, "itemId"> & { alertRef: string }> = [];
  const handlingEvents: Array<Omit<InsertHandlingEventRow, "itemId"> & { alertRef: string }> = [];

  // Index alerts by their ref for the FK back-fill below.
  const alertRefSet = new Set(alertRefs);

  for (const [alertRef, entry] of handlingByRef) {
    if (!alertRefSet.has(alertRef)) {
      // The simulator never emits handling events for non-existent
      // alerts (W3 invariant test guarantees this), so seeing this
      // here would indicate a builder bug.
      counts.orphanedRefs.handlingEvents += entry.ordered.length;
      continue;
    }
    handlingState.push({
      alertRef,
      districtId: mapping.districtId,
      state: entry.latest.toState,
      note: severityToHandlingNote(entry.latest.toState),
      recommendedOwnerRole: entry.latest.actorRole,
      assignedToRole: entry.latest.actorRole,
      assignedToUserId: null,
      updatedByUserId: systemUserId,
      updatedByName: systemUserName,
      resolvedAt: entry.latest.toState === "resolved"
        ? timestampAt(simulation.epochDate, entry.latest.day)
        : null,
    });
    counts.handlingState++;

    for (const ev of entry.ordered) {
      handlingEvents.push({
        alertRef,
        districtId: mapping.districtId,
        fromState: ev.fromState,
        toState: ev.toState,
        note: severityToHandlingNote(ev.toState),
        changedByUserId: systemUserId,
        changedByName: systemUserName,
        changedAt: timestampAt(simulation.epochDate, ev.day),
      });
      counts.handlingEvents++;
    }
  }

  return {
    sessions,
    sessionMakeupRefs,
    alerts,
    alertRefs,
    compObligations,
    scheduleBlocks,
    scheduleBlockRefs,
    handlingState,
    handlingEvents,
    counts,
  };
}

function sessionRow(
  sim: SimulatedSession,
  student: MappedStudent,
  svc: MappedServiceRequirement,
  mapping: PersistenceMapping,
  epochDate: string,
): InsertSessionLog {
  const sessionDate = isoAt(epochDate, sim.day);
  const minutes = sim.durationMinutes;
  // Default windows so the row passes UI rendering. Times do not need
  // to match real schedule_blocks for KPI math; the operational truth
  // is durationMinutes + status.
  const startTime = "09:00";
  const endHour = 9 + Math.floor(minutes / 60);
  const endMin = minutes % 60;
  const endTime = `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`;
  return {
    studentId: student.studentId,
    serviceRequirementId: svc.serviceRequirementId,
    serviceTypeId: svc.serviceTypeId,
    staffId: svc.providerStaffId ?? mapping.defaultStaffId,
    sessionDate,
    startTime,
    endTime,
    durationMinutes: minutes,
    status: sim.status,
    isMakeup: sim.isMakeup,
    isCompensatory: false,
    notes: sim.isMakeup
      ? `Simulator makeup (block=${sim.fromMakeupBlockRef ?? "?"})`
      : null,
    schoolYearId: mapping.schoolYearId,
  } as InsertSessionLog;
}

function scheduleBlockRow(
  block: SimulatedMakeupBlock,
  student: MappedStudent,
  svc: MappedServiceRequirement,
  staffId: number,
  mapping: PersistenceMapping,
  epochDate: string,
): InsertScheduleBlock {
  return {
    staffId,
    studentId: student.studentId,
    serviceTypeId: svc.serviceTypeId,
    dayOfWeek: dayOfWeekName(epochDate, block.day),
    startTime: "13:00",
    endTime: "13:30",
    location: "Resource Room",
    blockType: "makeup",
    blockLabel: `Makeup for ${isoAt(epochDate, block.forMissedDay)}`,
    notes: `Simulator-scheduled makeup (alert=${block.fromAlertRef}, missedDay=${block.forMissedDay})`,
    isRecurring: false,
    isAutoGenerated: true,
    schoolYearId: mapping.schoolYearId,
    sourceActionItemId: block.fromAlertRef,
  } as InsertScheduleBlock;
}
