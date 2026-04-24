/**
 * #970 + T-V2-08 — Canonical V2 + overlay reset (proof).
 *
 * Verifies that POST /api/sample-data/reset-demo runs the canonical
 * V2 + W5 overlay engine ONLY — no legacy additive shaping.
 *
 * What we assert:
 *   1. Route returns `engine: "v2"` (proves the canonical handler ran).
 *   2. `summary.layers.overlay === true` (proves the W5 overlay
 *      executed and emitted at least one showcase row).
 *   3. `summary.runId` is a non-empty string and `summary.v2Version`
 *      is present (proves the V2 W1 run-metadata pipeline ran — only
 *      `seedSampleDataForDistrict` produces these).
 *   4. `showcaseCaseCounts`, `complianceDistribution`, and
 *      `exampleShowcaseIds` are surfaced top-level on the response.
 *   5. Total showcase rows > 0 and matches `demo_showcase_cases` row
 *      count for that district (re-queried from the source of truth).
 *   6. T-V2-08: response body MUST NOT carry the legacy
 *      `modules` / `variety` / `handling` enrichment fields. Their
 *      presence would indicate the legacy additive passes still
 *      execute as part of the canonical runtime path.
 *   7. Static guard: no HTTP route file (under src/routes) and no
 *      runtime lib file (under src/lib) references the legacy
 *      `seedDemoDistrict` / `seedDemoModules` /
 *      `seedDemoComplianceVariety` / `seedDemoHandlingState` engines
 *      in executable code (comments tolerated). This catches a future
 *      edit that quietly re-introduces a parallel reset path.
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

    // T-V2-08: legacy additive enrichment fields must be gone from the
    // canonical reset response. Their presence would mean the legacy
    // shaping passes still run as part of the canonical runtime path.
    expect(res.body).not.toHaveProperty("modules");
    expect(res.body).not.toHaveProperty("variety");
    expect(res.body).not.toHaveProperty("handling");
  }, 120_000);

  it("no runtime file references the legacy V1/demo seed/enrich helpers", () => {
    // T-V2-08: scan EVERY runtime file under src/routes AND src/lib for
    // any reference to the legacy V1/demo engines or additive enrichment
    // helpers in executable code. Comment-only historical references are
    // tolerated. This guards against a future edit silently re-introducing
    // a parallel reset/enrichment path on any runtime surface.
    //
    // The legacy helpers themselves remain on disk in lib/db/src/seed-demo-*.ts
    // and reachable from the lib/db/run-seed-demo.ts CLI for forensic /
    // historical / one-off re-enrichment use; they are intentionally NOT
    // part of the canonical HTTP reset or scheduler path anymore.
    const apiServerSrc = path.resolve(__dirname, "../src");
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

    const LEGACY_SYMBOLS = [
      "seedDemoDistrict",
      "seedDemoModules",
      "seedDemoComplianceVariety",
      "seedDemoHandlingState",
    ] as const;
    const legacyPattern = new RegExp(`\\b(?:${LEGACY_SYMBOLS.join("|")})\\b`);

    const runtimeRoots = [
      path.join(apiServerSrc, "routes"),
      path.join(apiServerSrc, "lib"),
    ];
    const offenders: { file: string; symbol: string }[] = [];
    for (const root of runtimeRoots) {
      for (const file of walk(root)) {
        const codeOnly = stripComments(fs.readFileSync(file, "utf8"));
        const match = codeOnly.match(legacyPattern);
        if (match) offenders.push({ file, symbol: match[0] });
      }
    }
    expect(
      offenders,
      `Legacy V1/demo seed helpers must not be referenced from any runtime file ` +
        `(src/routes or src/lib). Offenders:\n` +
        offenders.map(o => `  ${o.symbol} in ${o.file}`).join("\n"),
    ).toEqual([]);

    // And the V2 entrypoint MUST still be the canonical engine.
    const sampleData = stripComments(
      fs.readFileSync(path.resolve(apiServerSrc, "routes/sampleData.ts"), "utf8"),
    );
    expect(sampleData).toMatch(/\bseedSampleDataForDistrict\b/);
  });
});
