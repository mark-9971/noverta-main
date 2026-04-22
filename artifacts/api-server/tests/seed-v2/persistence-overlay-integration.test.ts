/**
 * V2 persistence (W4) — DB integration test for runSimulationOverlayForDistrict.
 *
 * Seeds a sample district end-to-end at the small profile, runs the
 * overlay, and asserts:
 *
 *   1. DB row counts for sessions / alerts / comp / makeup blocks /
 *      handling state / handling events match the payload counts that
 *      the overlay reports.
 *   2. Role-profile attribution lands in `assigned_to_user_id`
 *      (every persisted handling row carries `system:profile-*`),
 *      and the FNV bucketing exercises all 5 archetypes.
 *   3. The overlay's cleanup is sample-scoped: a non-sample alert +
 *      handling row created for the same district survives a re-run.
 *      This is the architect W4 R3 invariant — the simulator must
 *      never clobber operator-managed data.
 *   4. Re-running the overlay is idempotent: counts stay the same.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";
import { createDistrict, cleanupDistrict } from "../helpers";
import {
  db,
  schoolsTable,
  studentsTable,
  alertsTable,
  sessionLogsTable,
  compensatoryObligationsTable,
  scheduleBlocksTable,
  actionItemHandlingTable,
  actionItemHandlingEventsTable,
  seedSampleDataForDistrict,
  teardownSampleData,
} from "@workspace/db";
import { runSimulationOverlayForDistrict } from "@workspace/db/v2/persistence";

describe("v2/persistence — runSimulationOverlayForDistrict (DB integration)", () => {
  let districtId: number;
  let sampleStudentIds: number[] = [];
  /** Two operator-planted handling rows we plant to verify cleanup
   *  scoping. The overlay must NOT delete either of these.
   *
   *  - SYNTHETIC row guards against any LIKE-based wipe (`alert:%`).
   *  - CANONICAL row uses a real `alert:<id>` itemId tied to a
   *    non-sample alert in the SAME district. This guards against a
   *    future regression where cleanup is keyed on "every district
   *    alert id" instead of strictly the sample alert id set —
   *    a synthetic itemId alone could not catch that.
   *    Architect W4 R2 finding. */
  let operatorAlertId: number;
  let operatorCanonicalItemId: string;
  const OPERATOR_ITEM_ID = "alert:__operator_planted__";

  beforeAll(async () => {
    const d = await createDistrict({ name: `V2-Overlay-Integration-${Date.now()}` });
    districtId = d.id;
    await seedSampleDataForDistrict(districtId, { sizeProfile: "small" });

    // Capture sample student ids for cross-checks below.
    const schools = await db.select({ id: schoolsTable.id }).from(schoolsTable)
      .where(eq(schoolsTable.districtId, districtId));
    const schoolIds = schools.map((s) => s.id);
    sampleStudentIds = schoolIds.length === 0 ? [] : (await db.select({ id: studentsTable.id })
      .from(studentsTable)
      .where(and(inArray(studentsTable.schoolId, schoolIds), eq(studentsTable.isSample, true))))
      .map((r) => r.id);
    expect(sampleStudentIds.length).toBeGreaterThan(0);

    // Plant an operator alert (NOT tied to a sample student) and a
    // handling row whose itemId is OUTSIDE the sample alert space.
    // The overlay's cleanup is scoped via `inArray(itemId, sampleAlertItemIds)`
    // so this row must survive. We explicitly use a synthetic itemId
    // that no real `alert:<id>` would ever match.
    const [op] = await db.insert(alertsTable).values({
      type: "behind_on_minutes",
      severity: "medium",
      studentId: null, // null on purpose — operator-curated, not student-bound
      message: "Operator-planted alert (must survive overlay re-run).",
      resolved: false,
    }).returning({ id: alertsTable.id });
    operatorAlertId = op.id;
    operatorCanonicalItemId = `alert:${operatorAlertId}`;
    await db.insert(actionItemHandlingTable).values([
      {
        districtId,
        itemId: OPERATOR_ITEM_ID,
        state: "needs_action",
        note: "operator-planted-synthetic",
        updatedByUserId: "operator:planted",
        updatedByName: "Planted",
      },
      {
        districtId,
        itemId: operatorCanonicalItemId,
        state: "awaiting_confirmation",
        note: "operator-planted-canonical",
        updatedByUserId: "operator:planted",
        updatedByName: "Planted",
      },
    ]);
  }, 240_000);

  afterAll(async () => {
    // Clean operator-planted handling first so cleanupDistrict's
    // cascade chain doesn't trip on it.
    try {
      await db.delete(actionItemHandlingTable).where(and(
        eq(actionItemHandlingTable.districtId, districtId),
        eq(actionItemHandlingTable.itemId, OPERATOR_ITEM_ID),
      ));
      await db.delete(alertsTable).where(eq(alertsTable.id, operatorAlertId));
    } catch { /* swept by cleanupDistrict */ }
    try { await teardownSampleData(districtId); } catch { /* best-effort */ }
    await cleanupDistrict(districtId);
  }, 120_000);

  it("first overlay run — DB row counts mirror the reported payload counts", async () => {
    const result = await runSimulationOverlayForDistrict(db, districtId, { sizeProfile: "small" });

    expect(result.studentsMapped).toBe(sampleStudentIds.length);
    expect(result.layerVersion).toBe("w4");

    // ── Sessions ────────────────────────────────────────────────────
    const sessions = await db.select({ id: sessionLogsTable.id }).from(sessionLogsTable)
      .where(inArray(sessionLogsTable.studentId, sampleStudentIds));
    expect(sessions.length).toBe(result.counts.sessions);

    // ── Alerts ──────────────────────────────────────────────────────
    const alerts = await db.select({ id: alertsTable.id }).from(alertsTable)
      .where(inArray(alertsTable.studentId, sampleStudentIds));
    expect(alerts.length).toBe(result.counts.alerts);

    // ── Comp obligations ────────────────────────────────────────────
    const comp = await db.select({ id: compensatoryObligationsTable.id })
      .from(compensatoryObligationsTable)
      .where(inArray(compensatoryObligationsTable.studentId, sampleStudentIds));
    expect(comp.length).toBe(result.counts.compObligations);

    // ── Makeup schedule blocks ──────────────────────────────────────
    const blocks = await db.select({ id: scheduleBlocksTable.id })
      .from(scheduleBlocksTable)
      .where(and(
        inArray(scheduleBlocksTable.studentId, sampleStudentIds),
        eq(scheduleBlocksTable.blockType, "makeup"),
      ));
    expect(blocks.length).toBe(result.counts.scheduleBlocks);

    // ── Handling state + events (scoped to the inserted sample alerts) ──
    const sampleAlertItemIds = alerts.map((a) => `alert:${a.id}`);
    const handlingRows = await db.select().from(actionItemHandlingTable)
      .where(and(
        eq(actionItemHandlingTable.districtId, districtId),
        inArray(actionItemHandlingTable.itemId, sampleAlertItemIds),
      ));
    const handlingEvents = await db.select({ id: actionItemHandlingEventsTable.id })
      .from(actionItemHandlingEventsTable)
      .where(and(
        eq(actionItemHandlingEventsTable.districtId, districtId),
        inArray(actionItemHandlingEventsTable.itemId, sampleAlertItemIds),
      ));
    expect(handlingEvents.length).toBe(result.counts.handlingEvents);

    // Every handling row carries a profile-attributed user id and
    // bucketing exercises all 5 archetypes.
    const profileUsers = new Set(handlingRows.map((r) => r.assignedToUserId));
    for (const u of profileUsers) {
      expect(u).toMatch(/^system:profile-/);
    }
    expect(profileUsers.size).toBe(5);
  }, 240_000);

  it("does NOT clobber operator-planted handling rows in the same district", async () => {
    const synthetic = await db.select().from(actionItemHandlingTable)
      .where(and(
        eq(actionItemHandlingTable.districtId, districtId),
        eq(actionItemHandlingTable.itemId, OPERATOR_ITEM_ID),
      ));
    expect(synthetic.length).toBe(1);
    expect(synthetic[0].updatedByUserId).toBe("operator:planted");
    // Canonical row uses a real `alert:<id>` itemId — survives only
    // when cleanup is sample-scoped (inArray over sampleAlertItemIds),
    // NOT when it sweeps every alert id in the district.
    const canonical = await db.select().from(actionItemHandlingTable)
      .where(and(
        eq(actionItemHandlingTable.districtId, districtId),
        eq(actionItemHandlingTable.itemId, operatorCanonicalItemId),
      ));
    expect(canonical.length).toBe(1);
    expect(canonical[0].state).toBe("awaiting_confirmation");
    expect(canonical[0].updatedByUserId).toBe("operator:planted");
  });

  it("re-running the overlay is idempotent — counts stay the same", async () => {
    const first = await runSimulationOverlayForDistrict(db, districtId, { sizeProfile: "small" });
    const second = await runSimulationOverlayForDistrict(db, districtId, { sizeProfile: "small" });
    expect(second.counts.sessions).toBe(first.counts.sessions);
    expect(second.counts.alerts).toBe(first.counts.alerts);
    expect(second.counts.compObligations).toBe(first.counts.compObligations);
    expect(second.counts.scheduleBlocks).toBe(first.counts.scheduleBlocks);
    expect(second.counts.handlingEvents).toBe(first.counts.handlingEvents);

    // Cleanup on the second run wiped exactly what the first run inserted.
    expect(second.cleanup.sessions).toBe(first.counts.sessions);
    expect(second.cleanup.alerts).toBe(first.counts.alerts);
    expect(second.cleanup.handlingEvents).toBe(first.counts.handlingEvents);

    // Operator row STILL survives.
    const survived = await db.select().from(actionItemHandlingTable)
      .where(and(
        eq(actionItemHandlingTable.districtId, districtId),
        eq(actionItemHandlingTable.itemId, OPERATOR_ITEM_ID),
      ));
    expect(survived.length).toBe(1);
  }, 240_000);

  it("does not emit any handling rows whose itemId looks unscoped (alert:%)\n"
    + " — i.e. cleanup correctly used inArray, not LIKE", async () => {
    // Confirm we don't see leftover rows for itemIds outside the
    // current sample alert id space (e.g. a previous run's stale ids).
    const alerts = await db.select({ id: alertsTable.id }).from(alertsTable)
      .where(inArray(alertsTable.studentId, sampleStudentIds));
    const validIds = new Set(alerts.map((a) => `alert:${a.id}`));
    const allRows = await db.select({ itemId: actionItemHandlingTable.itemId })
      .from(actionItemHandlingTable)
      .where(and(
        eq(actionItemHandlingTable.districtId, districtId),
        like(actionItemHandlingTable.itemId, "alert:%"),
      ));
    // Every alert:* row in the district is either an in-scope sample
    // alert OR one of our planted operator rows (synthetic itemId
    // OR canonical alert:<operatorAlertId>).
    for (const r of allRows) {
      const isSample = validIds.has(r.itemId);
      const isOperatorSynthetic = r.itemId === OPERATOR_ITEM_ID;
      const isOperatorCanonical = r.itemId === operatorCanonicalItemId;
      expect(isSample || isOperatorSynthetic || isOperatorCanonical).toBe(true);
    }
  });
});
