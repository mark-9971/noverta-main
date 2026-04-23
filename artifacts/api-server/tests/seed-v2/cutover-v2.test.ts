/**
 * T-V2-07 — SEED V2 CUTOVER PROOF
 *
 * This test is the targeted cutover proof that the default seed/reset
 * path now executes V2 (with the W5 Demo Readiness Overlay) and that
 * the explicit forensic fallback (`disableV2Overlay: true`) still
 * produces the legacy V1 output.
 *
 * Scope (intentionally narrow):
 *   1. Default call shape — `seedSampleDataForDistrict(districtId, {})`
 *      with NO options object — must run the overlay and ship the
 *      enriched summary.
 *   2. Forensic fallback — `seedSampleDataForDistrict(districtId,
 *      { disableV2Overlay: true })` must skip the overlay and ship a
 *      V1-shaped summary.
 *   3. Default summary surfaces overlay enrichment that downstream
 *      consumers (dashboard Demo Readiness panel) read:
 *        - `summary.layers.overlay === true`
 *        - `summary.showcaseCaseCounts` non-empty
 *        - `summary.exampleShowcaseIds` populated for at least one
 *          category
 *   4. The no-mutation invariant inside the overlay was not broken by
 *      the cutover wiring — if it had been, the overlay would have
 *      thrown and the catch block would have logged + degraded; we
 *      assert that the success path (overlay=true) was taken.
 *
 * NOT in scope:
 *   - V1↔V2 parity (covered by parity-bake-v2.test.ts)
 *   - Overlay determinism / category coverage (covered by
 *     overlay-demo-readiness.test.ts)
 *   - Route-layer integration (would require the full Express app
 *     under test; the routes are thin pass-throughs that call
 *     `seedSampleDataForDistrict(id, opts)` without setting the
 *     forensic flag, so proving the function-level default proves
 *     the route-level default by construction).
 */

import { describe, it, expect, afterAll } from "vitest";
import {
  seedSampleDataForDistrict,
  teardownSampleData,
} from "@workspace/db";

const districtId = 100150;

afterAll(async () => {
  // Best-effort teardown so a re-run starts clean. Failures here are
  // non-fatal — the test district is dedicated to this file.
  try {
    await teardownSampleData(districtId);
  } catch {
    /* noop */
  }
});

describe("T-V2-07 — Seed V2 cutover proof", () => {
  it("DEFAULT path (no options) runs V2 + overlay and ships enriched summary", async () => {
    // Clean slate.
    await teardownSampleData(districtId);

    // This is the literal call shape used by the production routes
    // (see artifacts/api-server/src/routes/sampleData.ts L114 and
    // artifacts/api-server/src/routes/demoControl.ts L1224).
    const result = await seedSampleDataForDistrict(districtId, {});

    // Core seed succeeded.
    expect(result.studentsCreated).toBeGreaterThan(0);
    expect(result.sessionsLogged).toBeGreaterThan(0);
    expect(result.alerts).toBeGreaterThan(0);

    // Overlay layer flipped on.
    expect(result.summary.layers.overlay).toBe(true);

    // Showcase enrichment populated.
    const showcaseTotal = Object.values(
      result.summary.showcaseCaseCounts,
    ).reduce((a: number, b: number) => a + b, 0);
    expect(showcaseTotal).toBeGreaterThan(0);

    // At least one category has example IDs (for the dashboard
    // Demo Readiness panel to render honest sample subjects).
    const exampleIdsByCategory = result.summary.exampleShowcaseIds ?? {};
    const populatedCategories = Object.values(exampleIdsByCategory).filter(
      (ids) => Array.isArray(ids) && ids.length > 0,
    );
    expect(populatedCategories.length).toBeGreaterThan(0);
  }, 180_000);

  it("FORENSIC fallback (disableV2Overlay: true) skips overlay and ships V1-shaped summary", async () => {
    // Clean slate.
    await teardownSampleData(districtId);

    const result = await seedSampleDataForDistrict(districtId, {
      disableV2Overlay: true,
    });

    // Core seed still succeeded.
    expect(result.studentsCreated).toBeGreaterThan(0);
    expect(result.sessionsLogged).toBeGreaterThan(0);

    // Overlay layer NOT flipped on.
    expect(result.summary.layers.overlay).toBe(false);

    // Showcase enrichment empty (no overlay = no showcase rows).
    const showcaseTotal = Object.values(
      result.summary.showcaseCaseCounts ?? {},
    ).reduce((a: number, b: number) => a + b, 0);
    expect(showcaseTotal).toBe(0);
  }, 180_000);

  it("CUTOVER CONTRACT — default and fallback produce different overlay layer flags", async () => {
    // Direct A/B sanity check that the `disableV2Overlay` knob is
    // actually wired and there is no silent override making both
    // paths identical.
    await teardownSampleData(districtId);
    const v2 = await seedSampleDataForDistrict(districtId, {});
    const v2Overlay = v2.summary.layers.overlay;

    await teardownSampleData(districtId);
    const v1 = await seedSampleDataForDistrict(districtId, {
      disableV2Overlay: true,
    });
    const v1Overlay = v1.summary.layers.overlay;

    expect(v2Overlay).toBe(true);
    expect(v1Overlay).toBe(false);
    expect(v2Overlay).not.toBe(v1Overlay);
  }, 360_000);
});
