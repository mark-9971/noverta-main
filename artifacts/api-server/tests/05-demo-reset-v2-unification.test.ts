/**
 * #970 — Unify hard reset onto V2 + overlay (proof).
 *
 * Verifies that POST /api/sample-data/reset-demo runs on the SAME
 * canonical engine (`seedSampleDataForDistrict` + W5 demo overlay) as
 * POST /api/sample-data, rather than the legacy global-TRUNCATE
 * `seedDemoDistrict()` engine.
 *
 * What we assert:
 *   1. Route returns `engine: "v2"` (proves the unified handler ran).
 *   2. `summary.layers.overlay === true` (proves the W5 overlay
 *      executed and emitted at least one showcase row).
 *   3. `summary.runId` is a non-empty string and `summary.v2Version`
 *      is present (proves the V2 W1 run-metadata pipeline ran — only
 *      `seedSampleDataForDistrict` produces these).
 *   4. `showcaseCaseCounts`, `complianceDistribution`, and
 *      `exampleShowcaseIds` are surfaced top-level on the response
 *      (proves the operator can verify overlay execution without
 *      re-querying).
 *   5. Total showcase rows > 0 (proves overlay actually wrote rows
 *      into `demo_showcase_cases`).
 *   6. `seedDemoDistrict` is no longer imported by the route file
 *      (static guard against silent fall-back to the legacy engine).
 *
 * No mocks: this hits the real route, the real DB, and the real
 * V2/overlay pipeline.
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { asUser } from "./helpers";
import { db, demoShowcaseCasesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

// requirePlatformAdmin honors `x-test-platform-admin: true` only when
// NODE_ENV === "test". The api-server `pretest` script sets it, but a
// hostile dev override would silently downgrade these assertions, so
// fail fast if the test harness is misconfigured.
beforeAll(() => {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      `NODE_ENV must be "test" for the platform-admin header bypass to engage; got ${process.env.NODE_ENV}`,
    );
  }
});

describe("#970 reset-demo unifies onto V2 + overlay", () => {
  it("POST /api/sample-data/reset-demo runs the V2 engine and emits overlay summary", async () => {
    const adminAgent = asUser({ userId: "u_platform_admin", role: "admin", districtId: null });
    const res = await adminAgent
      .post("/api/sample-data/reset-demo")
      .set("x-test-platform-admin", "true")
      .send();

    // Surface the body on failure so CI logs explain the diff (rather
    // than a bare "expected 200 received 500").
    if (res.status !== 200) {
      // eslint-disable-next-line no-console
      console.error("reset-demo response:", res.status, JSON.stringify(res.body, null, 2));
    }
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.engine).toBe("v2");
    expect(typeof res.body.districtId).toBe("number");

    // V2 PostRunSummary surfaced verbatim.
    expect(res.body.summary).toBeTruthy();
    expect(typeof res.body.summary.runId).toBe("string");
    expect(res.body.summary.runId.length).toBeGreaterThan(0);
    expect(typeof res.body.summary.v2Version).toBe("string");

    // Overlay actually ran (W5).
    expect(res.body.summary.layers).toEqual(
      expect.objectContaining({ platform: true, overlay: true }),
    );
    expect(res.body.layers).toEqual(res.body.summary.layers);

    // Overlay-derived fields are surfaced top-level on the response.
    expect(res.body.showcaseCaseCounts).toBeTruthy();
    expect(res.body.complianceDistribution).toBeTruthy();
    expect(res.body.exampleShowcaseIds).toBeTruthy();

    // At least one showcase row was emitted (else `layers.overlay`
    // would be false per the buildPostRunSummary contract).
    const totalShowcase = Object.values(
      res.body.showcaseCaseCounts as Record<string, number>,
    ).reduce((a, n) => a + n, 0);
    expect(totalShowcase).toBeGreaterThan(0);

    // Cross-check directly against the table — the route's `summary`
    // could theoretically be stale, so we re-query the source of truth.
    const districtId: number = res.body.districtId;
    const dbCount = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(demoShowcaseCasesTable)
      .where(sql`${demoShowcaseCasesTable.districtId} = ${districtId}`);
    expect(dbCount[0]!.n).toBeGreaterThan(0);
    expect(dbCount[0]!.n).toBe(totalShowcase);
  }, 120_000);

  it("route file no longer imports the legacy seedDemoDistrict engine", () => {
    // Static proof: the legacy global-TRUNCATE engine must not be the
    // primary path. Removing the import is the cleanest way to
    // guarantee a future edit can't silently re-introduce a parallel
    // system. (`seedDemoDistrict` remains exported from @workspace/db
    // for the standalone CLI seeder under T-V2-08; it is just no
    // longer wired into the HTTP reset path.)
    // #970: scan EVERY HTTP route file under src/routes for any reference to
    // the legacy global-TRUNCATE engine in executable code. Comment-only
    // historical references are tolerated. This guards against a future edit
    // silently re-introducing a parallel reset path on a different route.
    const routesDir = path.resolve(__dirname, "../src/routes");
    const stripComments = (s: string): string =>
      s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (entry.isFile() && full.endsWith(".ts")) out.push(full);
      }
      return out;
    };
    const offenders: string[] = [];
    for (const file of walk(routesDir)) {
      const codeOnly = stripComments(fs.readFileSync(file, "utf8"));
      if (/\bseedDemoDistrict\b/.test(codeOnly)) offenders.push(file);
    }
    expect(
      offenders,
      `Legacy seedDemoDistrict() must not be referenced from any HTTP route file. Offenders:\n${offenders.join("\n")}`,
    ).toEqual([]);

    // And the V2 entrypoint MUST be present in the unified reset route.
    const sampleData = stripComments(
      fs.readFileSync(path.resolve(routesDir, "sampleData.ts"), "utf8"),
    );
    expect(sampleData).toMatch(/\bseedSampleDataForDistrict\b/);
  });
});
