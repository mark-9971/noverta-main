/**
 * Seed Overhaul V2 — Persistence overlay orchestrator (W4, W5 fold-ins).
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
 * W5 fold-ins (architect deferred MEDIUMs from W4):
 *   - Cleanup + insert run inside ONE transaction so a partial-write
 *     failure doesn't leave the district in a torn state.
 *   - schedule_blocks.sourceActionItemId carries the canonical
 *     `alert:<id>` after alerts are inserted (was: simulator-internal
 *     ref string).
 *   - Active school year lookup is district-scoped so multi-district
 *     test environments don't accidentally pick up another district's
 *     active year.
 *   - The chunkedInsert helper now accepts a db handle so it can run
 *     inside the orchestration transaction instead of the global db
 *     export.
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
  // FOLD-IN: scope the lookup to this district so a sibling district's
  // active year doesn't leak into the FK.
  const [schoolYear] = await db.select().from(schoolYearsTable)
    .where(and(
      eq(schoolYearsTable.districtId, districtId),
      eq(schoolYearsTable.isActive, true),
    ))
    .limit(1);
  if (!schoolYear) {
    throw new Error(`[v2/persistence] no active school year for district ${districtId}; cannot overlay simulation`);
  }

  const mapping = await buildPersistenceMapping(db, districtId, schoolYear.id);
  if (mapping.students.length === 0) {
    throw new Error(`[v2/persistence] no sample students for district ${districtId}; run seedSampleDataForDistrict first`);
  }

  const sizeProfileOpt: SizeProfile = options.sizeProfile ?? "small";
  const sizeProfile: "small" | "medium" | "large" =
    sizeProfileOpt === "random" ? "small" : sizeProfileOpt;
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

  // Resolve sample student id set BEFORE the transaction so the read
  // doesn't lock rows under the writer.
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

  // FOLD-IN: cleanup + insert wrapped in a single transaction so a
  // partial-write failure never leaves the district half-overlaid.
  await db.transaction(async (tx) => {
    if (sampleStudentIds.length > 0) {
      // Capture sample-alert itemIds BEFORE deleting alerts so handling
      // cleanup is scoped to exactly the sample alerts in this district
      // (not every `alert:%` in the district). Architect W4 R3 finding.
      const sampleAlertIds = (await tx.select({ id: alertsTable.id }).from(alertsTable)
        .where(inArray(alertsTable.studentId, sampleStudentIds))).map((r) => r.id);
      const sampleAlertItemIds = sampleAlertIds.map((id) => `alert:${id}`);

      if (sampleAlertItemIds.length > 0) {
        cleanup.handlingState = (await tx.delete(actionItemHandlingTable)
          .where(and(
            eq(actionItemHandlingTable.districtId, districtId),
            inArray(actionItemHandlingTable.itemId, sampleAlertItemIds),
          ))).rowCount ?? 0;
        cleanup.handlingEvents = (await tx.delete(actionItemHandlingEventsTable)
          .where(and(
            eq(actionItemHandlingEventsTable.districtId, districtId),
            inArray(actionItemHandlingEventsTable.itemId, sampleAlertItemIds),
          ))).rowCount ?? 0;
      }

      cleanup.sessions = (await tx.delete(sessionLogsTable)
        .where(inArray(sessionLogsTable.studentId, sampleStudentIds))).rowCount ?? 0;
      cleanup.alerts = (await tx.delete(alertsTable)
        .where(inArray(alertsTable.studentId, sampleStudentIds))).rowCount ?? 0;
      cleanup.compObligations = (await tx.delete(compensatoryObligationsTable)
        .where(inArray(compensatoryObligationsTable.studentId, sampleStudentIds))).rowCount ?? 0;
      cleanup.scheduleBlocks = (await tx.delete(scheduleBlocksTable)
        .where(and(
          inArray(scheduleBlocksTable.studentId, sampleStudentIds),
          eq(scheduleBlocksTable.blockType, "makeup"),
        ))).rowCount ?? 0;
    }

    // ── Insert payload ─────────────────────────────────────────────
    if (payload.sessions.length > 0) {
      await chunkedInsert(sessionLogsTable, payload.sessions, { db: tx });
    }
    // Alerts. Capture inserted ids so we can convert each alertRef
    // into a real `alert:<id>` itemId for the handling tables AND
    // backfill schedule_blocks.sourceActionItemId.
    const alertIdByRef = new Map<string, number>();
    if (payload.alerts.length > 0) {
      for (let i = 0; i < payload.alerts.length; i += 200) {
        const slice = payload.alerts.slice(i, i + 200);
        const refs = payload.alertRefs.slice(i, i + 200);
        const ret = await tx.insert(alertsTable).values(slice).returning({ id: alertsTable.id });
        for (let j = 0; j < ret.length; j++) {
          alertIdByRef.set(refs[j], ret[j].id);
        }
      }
    }
    if (payload.compObligations.length > 0) {
      await chunkedInsert(compensatoryObligationsTable, payload.compObligations, { db: tx });
    }
    // FOLD-IN: rewrite schedule_blocks.sourceActionItemId from the
    // simulator's internal alertRef into the canonical `alert:<dbId>`
    // form. Drop blocks whose source alert never landed.
    if (payload.scheduleBlocks.length > 0) {
      const blockRows = payload.scheduleBlocks.map((b) => {
        const ref = b.sourceActionItemId as string | null;
        if (!ref) return b;
        const id = alertIdByRef.get(ref);
        if (id === undefined) return { ...b, sourceActionItemId: null };
        return { ...b, sourceActionItemId: `alert:${id}` };
      });
      await chunkedInsert(scheduleBlocksTable, blockRows, { db: tx });
    }
    if (payload.handlingState.length > 0) {
      const rows = payload.handlingState
        .map((r) => {
          const id = alertIdByRef.get(r.alertRef);
          if (id === undefined) return null;
          const { alertRef: _drop, ...rest } = r;
          return { ...rest, itemId: `alert:${id}` };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (rows.length > 0) await chunkedInsert(actionItemHandlingTable, rows, { db: tx });
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
      if (rows.length > 0) await chunkedInsert(actionItemHandlingEventsTable, rows, { db: tx });
    }
  });

  return {
    districtId,
    layerVersion: PERSISTENCE_LAYER_VERSION,
    studentsMapped: mapping.students.length,
    counts: payload.counts,
    cleanup,
  };
}
