/**
 * Seed Overhaul V2 — Persistence overlay orchestrator (W4).
 *
 * Public entry point that wires the W3 simulator into the real DB
 * tables for a previously-seeded district.
 *
 * Contract:
 *   1. Caller has already run `seedSampleDataForDistrict(districtId)`
 *      so the roster (students, staff, SRs, school year) exists.
 *   2. This function then:
 *        a. Builds a PersistenceMapping by reading current sample-
 *           tagged students/staff/SRs.
 *        b. Runs the deterministic simulator for the district.
 *        c. DELETEs the legacy historical session_logs / alerts /
 *           comp_obligations / makeup schedule_blocks /
 *           action_item_handling rows scoped to the sample-tagged
 *           students for this district.
 *        d. INSERTs the simulator-derived payload row arrays.
 *
 * Determinism: same districtId + same upstream roster → byte-identical
 * row arrays (proven in payload-level tests).
 *
 * Rollback safety: scope the delete strictly to sample-tagged students
 * via `studentId IN (...)` so operator data is never touched. Staff,
 * districts, schools, SRs are NOT modified.
 */

import { and, eq, inArray } from "drizzle-orm";
import type { db as Db } from "../../db";
import {
  actionItemHandlingTable,
  actionItemHandlingEventsTable,
  alertsTable,
  compensatoryObligationsTable,
  scheduleBlocksTable,
  schoolYearsTable,
  sessionLogsTable,
  studentsTable,
  schoolsTable,
} from "../../schema";
import { chunkedInsert } from "../platform/tx";
import {
  buildStudentDefs,
  resolveSeedShape,
  type SizeProfile,
} from "../domain";
import { setSeed } from "../platform/rng";
import { runSimulation } from "../simulator";
import { buildPersistenceMapping } from "./mapping";
import { buildPersistencePayload, type PersistenceCounts } from "./payload";

export const PERSISTENCE_LAYER_VERSION = "w4";

export interface RunOverlayOptions {
  /** Defaults to "small" if the caller doesn't know which profile was
   *  used during seeding. The simulator builds plans from this profile. */
  sizeProfile?: SizeProfile;
  /** Optional explicit epoch override for the simulator (YYYY-MM-DD). */
  epochDate?: string;
  /** Operator/system user attribution for handling rows. */
  systemUserId?: string;
  systemUserName?: string;
}

export interface RunOverlayResult {
  districtId: number;
  layerVersion: typeof PERSISTENCE_LAYER_VERSION;
  studentsMapped: number;
  counts: PersistenceCounts;
  /** Counts of legacy rows wiped before the overlay landed. */
  cleanup: {
    sessions: number;
    alerts: number;
    compObligations: number;
    scheduleBlocks: number;
    handlingState: number;
    handlingEvents: number;
  };
}

/**
 * The overlay write path. Idempotent: safe to call repeatedly; the
 * cleanup step removes prior overlay output before re-inserting.
 */
export async function runSimulationOverlayForDistrict(
  db: typeof Db,
  districtId: number,
  options: RunOverlayOptions = {},
): Promise<RunOverlayResult> {
  // Resolve school year — required for FK on session_logs/blocks.
  const [schoolYear] = await db.select().from(schoolYearsTable)
    .where(eq(schoolYearsTable.isActive, true))
    .limit(1);
  if (!schoolYear) {
    throw new Error(`[v2/persistence] no active school year; cannot overlay simulation for district ${districtId}`);
  }

  const mapping = await buildPersistenceMapping(db, districtId, schoolYear.id);
  if (mapping.students.length === 0) {
    throw new Error(`[v2/persistence] no sample students for district ${districtId}; run seedSampleDataForDistrict first`);
  }

  const sizeProfileOpt: SizeProfile = options.sizeProfile ?? "small";
  // resolveSeedShape only accepts the three concrete tiers; collapse
  // "random" callers to "small" for the simulator pass.
  const sizeProfile: "small" | "medium" | "large" =
    sizeProfileOpt === "random" ? "small" : sizeProfileOpt;
  // Mirror the seeder's call ordering so resolveSeedShape sees the
  // same RNG state. setSeed is also called inside runSimulation; that
  // resets the stream for the simulator's internal forks.
  setSeed(districtId);
  const studentDefs = buildStudentDefs(sizeProfile, 5);
  const shape = resolveSeedShape({ sizeProfile });
  const simulation = runSimulation({
    districtId,
    studentDefs,
    shape,
    ...(options.epochDate ? { epochDate: options.epochDate } : {}),
  });

  const payload = buildPersistencePayload({
    simulation,
    mapping,
    systemUserId: options.systemUserId ?? "system:v2-simulator",
    systemUserName: options.systemUserName ?? "Simulator (V2)",
  });

  // ── Cleanup: scope to sample-tagged students for the district ────
  const schoolIds = (
    await db.select({ id: schoolsTable.id }).from(schoolsTable)
      .where(eq(schoolsTable.districtId, districtId))
  ).map((r) => r.id);
  const sampleStudentIds = (await db.select({ id: studentsTable.id })
    .from(studentsTable)
    .where(eq(studentsTable.isSample, true))
  ).filter((s) => mapping.students.some((m) => m.studentId === s.id))
    .map((s) => s.id);
  void schoolIds;

  const cleanup = {
    sessions: 0,
    alerts: 0,
    compObligations: 0,
    scheduleBlocks: 0,
    handlingState: 0,
    handlingEvents: 0,
  };
  if (sampleStudentIds.length > 0) {
    // Capture the canonical itemIds for handling rows BEFORE we delete
    // the alerts they point at — so the handling cleanup is scoped to
    // exactly the rows tied to sample-tagged alerts in this district,
    // not every `alert:%` row in the district (which would clobber
    // operator-managed handling state for real, non-sample alerts).
    // Architect W4 R3 finding: prior LIKE-based wipe was destructive
    // to operator data.
    const sampleAlertIds = (await db.select({ id: alertsTable.id }).from(alertsTable)
      .where(inArray(alertsTable.studentId, sampleStudentIds))).map((r) => r.id);
    const sampleAlertItemIds = sampleAlertIds.map((id) => `alert:${id}`);

    if (sampleAlertItemIds.length > 0) {
      cleanup.handlingState = (await db.delete(actionItemHandlingTable)
        .where(and(
          eq(actionItemHandlingTable.districtId, districtId),
          inArray(actionItemHandlingTable.itemId, sampleAlertItemIds),
        ))).rowCount ?? 0;
      cleanup.handlingEvents = (await db.delete(actionItemHandlingEventsTable)
        .where(and(
          eq(actionItemHandlingEventsTable.districtId, districtId),
          inArray(actionItemHandlingEventsTable.itemId, sampleAlertItemIds),
        ))).rowCount ?? 0;
    }

    cleanup.sessions = (await db.delete(sessionLogsTable)
      .where(inArray(sessionLogsTable.studentId, sampleStudentIds))).rowCount ?? 0;
    cleanup.alerts = (await db.delete(alertsTable)
      .where(inArray(alertsTable.studentId, sampleStudentIds))).rowCount ?? 0;
    cleanup.compObligations = (await db.delete(compensatoryObligationsTable)
      .where(inArray(compensatoryObligationsTable.studentId, sampleStudentIds))).rowCount ?? 0;
    cleanup.scheduleBlocks = (await db.delete(scheduleBlocksTable)
      .where(and(
        inArray(scheduleBlocksTable.studentId, sampleStudentIds),
        eq(scheduleBlocksTable.blockType, "makeup"),
      ))).rowCount ?? 0;
  }

  // ── Insert payload ───────────────────────────────────────────────
  // 1. Sessions (no FK back-references needed yet).
  if (payload.sessions.length > 0) {
    await chunkedInsert(sessionLogsTable, payload.sessions);
  }
  // 2. Alerts. Capture inserted ids so we can convert each alertRef
  //    into a real `alert:<id>` itemId for the handling tables.
  const alertIdByRef = new Map<string, number>();
  if (payload.alerts.length > 0) {
    // chunkedInsert returns void in our platform helper, so insert in
    // batches manually here to capture returning() ids.
    for (let i = 0; i < payload.alerts.length; i += 200) {
      const slice = payload.alerts.slice(i, i + 200);
      const refs = payload.alertRefs.slice(i, i + 200);
      const ret = await db.insert(alertsTable).values(slice).returning({ id: alertsTable.id });
      for (let j = 0; j < ret.length; j++) {
        alertIdByRef.set(refs[j], ret[j].id);
      }
    }
  }
  // 3. Comp obligations.
  if (payload.compObligations.length > 0) {
    await chunkedInsert(compensatoryObligationsTable, payload.compObligations);
  }
  // 4. Schedule blocks.
  if (payload.scheduleBlocks.length > 0) {
    await chunkedInsert(scheduleBlocksTable, payload.scheduleBlocks);
  }
  // 5. Action item handling rows (state + events). Translate alertRef
  //    → real DB id; drop rows whose alert never landed (defensive —
  //    payload builder already filters on alertRefSet).
  if (payload.handlingState.length > 0) {
    const rows = payload.handlingState
      .map((r) => {
        const id = alertIdByRef.get(r.alertRef);
        if (id === undefined) return null;
        const { alertRef: _drop, ...rest } = r;
        return { ...rest, itemId: `alert:${id}` };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length > 0) await chunkedInsert(actionItemHandlingTable, rows);
  }
  if (payload.handlingEvents.length > 0) {
    const rows = payload.handlingEvents
      .map((r) => {
        const id = alertIdByRef.get(r.alertRef);
        if (id === undefined) return null;
        const { alertRef: _drop, ...rest } = r;
        return { ...rest, itemId: `alert:${id}` };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length > 0) await chunkedInsert(actionItemHandlingEventsTable, rows);
  }

  return {
    districtId,
    layerVersion: PERSISTENCE_LAYER_VERSION,
    studentsMapped: mapping.students.length,
    counts: payload.counts,
    cleanup,
  };
}
