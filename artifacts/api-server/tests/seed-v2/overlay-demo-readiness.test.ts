/**
 * V2 overlay (W5) — DB integration test for runDemoReadinessOverlay.
 *
 * Seeds a sample district, runs the W4 persistence overlay so the
 * primitive-fact tables are populated, then runs the W5 demo
 * readiness overlay and asserts:
 *
 *   1. Cases are written across multiple of the 8 canonical categories.
 *   2. Per-(districtId, runId, category, subjectKind, subjectId)
 *      uniqueness is enforced — the unique index is honored.
 *   3. The no-mutation invariant: every per-table SHA-256 in `before`
 *      equals its `after` counterpart, and the combined digest matches.
 *   4. A second overlay run produces a stable category-count fingerprint
 *      (deterministic selection) and supersedes the prior run's rows
 *      (no stale showcase rows linger).
 *   5. The invariant ACTUALLY trips when a primitive-fact row is
 *      mutated mid-flight: we monkey-patch the snapshot to simulate
 *      drift, the overlay throws, and the demo_showcase_cases table
 *      is left in the post-write state (idempotency rerun heals it).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { createDistrict, cleanupDistrict } from "../helpers";
import {
  db,
  schoolsTable,
  studentsTable,
  alertsTable,
  demoShowcaseCasesTable,
  seedSampleDataForDistrict,
  teardownSampleData,
} from "@workspace/db";
import { runSimulationOverlayForDistrict } from "@workspace/db/v2/persistence";
import {
  runDemoReadinessOverlay,
  snapshotPrimitiveFacts,
  SHOWCASE_CATEGORIES,
  OVERLAY_LAYER_VERSION,
} from "@workspace/db/v2/overlay";

describe("v2/overlay — runDemoReadinessOverlay (DB integration)", () => {
  let districtId: number;
  let sampleStudentIds: number[] = [];

  beforeAll(async () => {
    const d = await createDistrict({ name: `V2-Overlay-W5-${Date.now()}` });
    districtId = d.id;
    await seedSampleDataForDistrict(districtId, { sizeProfile: "small" });

    const schools = await db.select({ id: schoolsTable.id }).from(schoolsTable)
      .where(eq(schoolsTable.districtId, districtId));
    const schoolIds = schools.map((s) => s.id);
    sampleStudentIds = schoolIds.length === 0 ? [] : (await db.select({ id: studentsTable.id })
      .from(studentsTable)
      .where(and(inArray(studentsTable.schoolId, schoolIds), eq(studentsTable.isSample, true))))
      .map((r) => r.id);
    expect(sampleStudentIds.length).toBeGreaterThan(0);

    // Populate the primitive-fact tables the overlay reads from.
    await runSimulationOverlayForDistrict(db, districtId, { sizeProfile: "small" });
  }, 240_000);

  afterAll(async () => {
    try { await db.delete(demoShowcaseCasesTable).where(eq(demoShowcaseCasesTable.districtId, districtId)); } catch { /* best-effort */ }
    try { await teardownSampleData(districtId); } catch { /* best-effort */ }
    await cleanupDistrict(districtId);
  }, 120_000);

  it("emits cases across multiple canonical categories and writes the unique index", async () => {
    const result = await runDemoReadinessOverlay(db, districtId);
    expect(result.layerVersion).toBe(OVERLAY_LAYER_VERSION);
    expect(result.totalWritten).toBeGreaterThan(0);
    expect(result.noMutationInvariantHeld).toBe(true);

    const filledCategories = SHOWCASE_CATEGORIES.filter((c) => result.categoryCounts[c] > 0);
    // The simulator at the small profile produces alerts of mixed
    // severity, makeups, comp obligations, profile-attributed handling
    // rows, and miss-rate variation across students — at least four
    // distinct buckets must light up.
    expect(filledCategories.length).toBeGreaterThanOrEqual(4);

    // Every category's count is at most 3 (the default cap).
    for (const c of SHOWCASE_CATEGORIES) {
      expect(result.categoryCounts[c]).toBeLessThanOrEqual(3);
    }

    // The unique index exists at the DB level — re-inserting a row
    // with the same (district, run, category, kind, id) tuple raises.
    const sampleRow = (await db.select().from(demoShowcaseCasesTable)
      .where(eq(demoShowcaseCasesTable.districtId, districtId)).limit(1))[0];
    expect(sampleRow).toBeDefined();
    await expect(
      db.insert(demoShowcaseCasesTable).values({
        districtId,
        runId: sampleRow.runId,
        category: sampleRow.category,
        subjectKind: sampleRow.subjectKind,
        subjectId: sampleRow.subjectId,
        headline: "dup",
        payload: {},
        selectionOrder: 999,
      }),
    ).rejects.toThrow();
  }, 60_000);

  it("no-mutation invariant: per-table SHA-256 digests match before vs after", async () => {
    const before = await snapshotPrimitiveFacts(db, districtId);
    const result = await runDemoReadinessOverlay(db, districtId);
    const after = await snapshotPrimitiveFacts(db, districtId);

    // The orchestrator already asserts equality internally; we re-
    // assert it from the caller's perspective so a regression that
    // weakens the internal check would still trip a test.
    expect(result.before.digest).toBe(result.after.digest);
    for (const t of result.before.tables) {
      expect(result.before.perTable[t]).toBe(result.after.perTable[t]);
    }
    // Caller-side snapshots also stable across the overlay run
    // (the only writes were to demo_showcase_cases, which is NOT
    // in the snapshot scope).
    expect(before.digest).toBe(after.digest);
  }, 60_000);

  it("re-running the overlay supersedes prior rows and is deterministic", async () => {
    const first = await runDemoReadinessOverlay(db, districtId);
    const firstRows = await db.select().from(demoShowcaseCasesTable)
      .where(eq(demoShowcaseCasesTable.districtId, districtId));
    expect(firstRows.length).toBe(first.totalWritten);

    const second = await runDemoReadinessOverlay(db, districtId);
    const secondRows = await db.select().from(demoShowcaseCasesTable)
      .where(eq(demoShowcaseCasesTable.districtId, districtId));

    // Same category-count fingerprint across runs (deterministic
    // selection from a stable district seed + unchanged primitive
    // facts).
    expect(second.categoryCounts).toEqual(first.categoryCounts);
    expect(second.fallbackCount).toBe(first.fallbackCount);
    expect(second.totalWritten).toBe(first.totalWritten);

    // Old rows from the first run are gone; only the latest run's
    // rows survive.
    const distinctRunIds = new Set(secondRows.map((r) => r.runId));
    expect(distinctRunIds.size).toBe(1);
    expect(distinctRunIds.has(second.runId)).toBe(true);
  }, 90_000);

  it("invariant ENFORCES throw: runDemoReadinessOverlay rejects when a primitive fact mutates mid-run", async () => {
    // Run cleanly first to capture a baseline showcase-row fingerprint.
    await runDemoReadinessOverlay(db, districtId);
    const baselineRows = await db.select().from(demoShowcaseCasesTable)
      .where(eq(demoShowcaseCasesTable.districtId, districtId));
    expect(baselineRows.length).toBeGreaterThan(0);
    const baselineRunId = baselineRows[0].runId;

    // Pick a real sample alert we will flip mid-overlay.
    const targetAlert = (await db.select().from(alertsTable)
      .where(inArray(alertsTable.studentId, sampleStudentIds))
      .limit(1))[0];
    expect(targetAlert).toBeDefined();

    // Wrap the real db so that the FIRST time the overlay opens its
    // write transaction (which sits between the pre- and post-
    // snapshot reads) we sneak in a mutation to the alerts table.
    // The post-snapshot will then see a different per-table SHA-256
    // digest and the overlay must throw.
    let injected = false;
    const driftDb = new Proxy(db, {
      get(target, prop, recv) {
        const value = Reflect.get(target, prop, recv);
        if (prop !== "transaction") return value;
        return async (fn: (tx: typeof db) => Promise<unknown>) => {
          if (!injected) {
            injected = true;
            await target.update(alertsTable)
              .set({ resolved: !targetAlert.resolved })
              .where(eq(alertsTable.id, targetAlert.id));
          }
          return (value as typeof db.transaction).call(target, fn);
        };
      },
    });

    await expect(
      runDemoReadinessOverlay(driftDb as unknown as typeof db, districtId),
    ).rejects.toThrow(/NO-MUTATION INVARIANT VIOLATED.*alerts/);
    expect(injected).toBe(true);

    // Restore the row so subsequent runs / suites are unaffected.
    await db.update(alertsTable)
      .set({ resolved: targetAlert.resolved })
      .where(eq(alertsTable.id, targetAlert.id));

    // The throw was raised AFTER the demo_showcase_cases rewrite
    // committed (pre-snapshot, write tx, post-snapshot ordering),
    // so the table currently holds the new run's rows. A clean
    // re-run heals it back to a stable fingerprint.
    const healed = await runDemoReadinessOverlay(db, districtId);
    expect(healed.noMutationInvariantHeld).toBe(true);
    const healedRows = await db.select({ runId: demoShowcaseCasesTable.runId })
      .from(demoShowcaseCasesTable)
      .where(eq(demoShowcaseCasesTable.districtId, districtId));
    const distinctRunIds = new Set(healedRows.map((r) => r.runId));
    expect(distinctRunIds.size).toBe(1);
    expect(distinctRunIds.has(baselineRunId)).toBe(false);
  }, 90_000);
});
