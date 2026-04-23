/**
 * Per-tenant sample data routes — generate / inspect / tear down a small
 * realistic district of sample students, staff, services, and sessions so a
 * brand-new tenant can experience Trellis's value within minutes.
 *
 * Admin-only. Sample data is tagged via `students.is_sample` /
 * `staff.is_sample` (plus `districts.has_sample_data`) and is fully removable
 * with DELETE.
 */
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import {
  requireRoles,
  requireDistrictScope,
  getEnforcedDistrictId,
  requirePlatformAdmin,
} from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import {
  seedSampleDataForDistrict,
  teardownSampleData,
  getSampleDataStatus,
  db,
  districtsTable,
  type SeedSampleOptions,
  type Intensity,
  type DemoEmphasis,
  type PostRunSummary,
  type SizeProfile,
} from "@workspace/db";
import { sql, eq, and } from "drizzle-orm";

const INTENSITIES: ReadonlySet<Intensity> = new Set(["low", "medium", "high"]);
const EMPHASES: ReadonlySet<DemoEmphasis> = new Set([
  "compliance", "comp_ed", "caseload", "behavior", "executive",
]);
// T-V2-09 — accepted size profile values on the wire. `random` is honored
// by the seeder (mapped via the seeded RNG to small/medium/large/xl).
const SIZE_PROFILES_WIRE: ReadonlySet<SizeProfile> = new Set([
  "small", "medium", "large", "xl", "random",
]);

/**
 * Coerce a raw request body into the strongly-typed `SeedSampleOptions`.
 * Unknown fields are dropped, out-of-range numbers are clamped, invalid
 * enums are ignored — the seeder applies sensible defaults for anything
 * left undefined, so a partially-valid body still produces a working seed.
 */
function parseSeedOptions(body: unknown): SeedSampleOptions {
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  const out: SeedSampleOptions = {};

  const intInRange = (v: unknown, lo: number, hi: number): number | undefined => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (!Number.isFinite(n)) return undefined;
    return Math.max(lo, Math.min(hi, Math.round(n)));
  };
  const intensity = (v: unknown): Intensity | undefined =>
    typeof v === "string" && INTENSITIES.has(v as Intensity) ? (v as Intensity) : undefined;

  if (typeof b.districtName === "string" && b.districtName.trim()) out.districtName = b.districtName.trim().slice(0, 120);
  // T-V2-09 — sizeProfile now accepted on the wire (was previously
  // dropped, so operators couldn't pin a profile via HTTP).
  if (typeof b.sizeProfile === "string" && SIZE_PROFILES_WIRE.has(b.sizeProfile as SizeProfile)) {
    out.sizeProfile = b.sizeProfile as SizeProfile;
  }
  const sc = intInRange(b.schoolCount, 1, 12);              if (sc !== undefined) out.schoolCount = sc;
  const ts = intInRange(b.targetStudents, 1, 5000);         if (ts !== undefined) out.targetStudents = ts;
  const cm = intInRange(b.caseManagerCount, 0, 200);        if (cm !== undefined) out.caseManagerCount = cm;
  const pv = intInRange(b.providerCount, 0, 200);           if (pv !== undefined) out.providerCount = pv;
  const pa = intInRange(b.paraCount, 0, 200);               if (pa !== undefined) out.paraCount = pa;
  const bc = intInRange(b.bcbaCount, 0, 50);                if (bc !== undefined) out.bcbaCount = bc;
  const ag = intInRange(b.avgGoalsPerStudent, 1, 25);       if (ag !== undefined) out.avgGoalsPerStudent = ag;
  const am = intInRange(b.avgRequiredMinutesPerWeek, 30, 300); if (am !== undefined) out.avgRequiredMinutesPerWeek = am;
  const bm = intInRange(b.backfillMonths, 1, 12);           if (bm !== undefined) out.backfillMonths = bm;
  const ch = intensity(b.complianceHealth);                 if (ch) out.complianceHealth = ch;
  const ss = intensity(b.staffingStrain);                   if (ss) out.staffingStrain = ss;
  const dq = intensity(b.documentationQuality);             if (dq) out.documentationQuality = dq;
  const ce = intensity(b.compensatoryExposure);             if (ce) out.compensatoryExposure = ce;
  const bi = intensity(b.behaviorIntensity);                if (bi) out.behaviorIntensity = bi;
  if (typeof b.demoEmphasis === "string" && EMPHASES.has(b.demoEmphasis as DemoEmphasis)) {
    out.demoEmphasis = b.demoEmphasis as DemoEmphasis;
  }
  return out;
}

const router: IRouter = Router();

router.get("/sample-data", requireDistrictScope, requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (districtId == null) {
    res.status(403).json({ error: "No district scope" });
    return;
  }
  try {
    const status = await getSampleDataStatus(districtId);
    res.json({ ...status, districtId });
  } catch (err) {
    logger.error({ err, districtId }, "sample-data status failed");
    res.status(500).json({ error: "Couldn't load sample data — please try again" });
  }
});

router.post("/sample-data", requireDistrictScope, requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (districtId == null) {
    res.status(403).json({ error: "No district scope" });
    return;
  }
  try {
    const opts = parseSeedOptions(req.body);
    const existing = await getSampleDataStatus(districtId);
    if (existing.hasSampleData || existing.sampleStudents > 0) {
      // Idempotent: a second click on "Load sample data" returns the existing
      // counts as a successful no-op rather than a 409 error. The wizard CTA
      // hides itself once hasSampleData is true, so this branch is the
      // safety net for stale clients / double-clicks.
      logger.info({ districtId, ...existing }, "sample data already present, returning existing counts");
      res.status(200).json({ ok: true, alreadySeeded: true, ...existing });
      return;
    }
    const result = await seedSampleDataForDistrict(districtId, opts);
    logger.info({ districtId, opts, ...result }, "sample data seeded");
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    // Log the original error (including any raw SQL) server-side, but
    // surface a *categorized* error code + sanitized detail to the
    // operator so the UI can explain *why* sample data failed (e.g.
    // SEED_CAPACITY_VIOLATION) rather than only the generic toast.
    // Raw stack traces and SQL fragments stay in the server log.
    logger.error({ err, districtId }, "sample-data seed failed");
    const { code, detail } = classifySeedError(err);
    res.status(500).json({
      error: "Couldn't load sample data — please try again",
      code,
      detail,
    });
  }
});

/**
 * Classify a thrown seeder error into an operator-facing code + sanitized
 * one-line detail. Patterns are matched against `Error.message` produced
 * by the seeder; anything unrecognized falls through as
 * SEED_UNKNOWN_ERROR with a redacted detail string. We never echo the
 * full stack or raw SQL; the server log retains the full error object.
 */
function classifySeedError(err: unknown): { code: string; detail: string } {
  const raw = err instanceof Error ? err.message : String(err);
  // Strip newlines and clamp length so the detail is safe to surface in a
  // toast/banner without breaking layout or leaking large payloads.
  const sanitize = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 280);
  if (/Seed capacity violation/i.test(raw)) {
    return { code: "SEED_CAPACITY_VIOLATION", detail: sanitize(raw) };
  }
  if (/District \d+ could not be auto-provisioned/i.test(raw)) {
    return { code: "SEED_DISTRICT_PROVISION_FAILED", detail: sanitize(raw) };
  }
  if (/duplicate key|unique constraint/i.test(raw)) {
    return { code: "SEED_DUPLICATE_ROW", detail: "A sample row collided with existing data; partial seed was rolled back." };
  }
  if (/foreign key|violates foreign key/i.test(raw)) {
    return { code: "SEED_FK_VIOLATION", detail: "Sample data references a missing parent row; partial seed was rolled back." };
  }
  return { code: "SEED_UNKNOWN_ERROR", detail: sanitize(raw) };
}

router.delete("/sample-data", requireDistrictScope, requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (districtId == null) {
    res.status(403).json({ error: "No district scope" });
    return;
  }
  try {
    const result = await teardownSampleData(districtId);
    logger.info({ districtId, ...result }, "sample data removed");
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err, districtId }, "sample-data teardown failed");
    res.status(500).json({ error: "Couldn't remove sample data — please try again" });
  }
});

/**
 * Reset the MetroWest Collaborative demo district back to its canonical
 * showcase state. Platform-admin only — used between back-to-back sales
 * demos so each one starts from the same baseline.
 *
 * #970 — UNIFIED RESET PATH (V2 + overlay)
 * ---------------------------------------------------------------
 * As of #970 this route shares ONE engine with the rest of the
 * platform: `seedSampleDataForDistrict()` (the V2 W1 entrypoint that
 * also runs the W5 Demo Readiness Overlay before returning). The
 * legacy `seedDemoDistrict()` global TRUNCATE-and-reseed engine is no
 * longer the primary path — V2 is.
 *
 * Concretely:
 *   1. Look up (or auto-provision) the MetroWest demo district stub
 *      with `is_demo=true`. The legacy `seedDemoModules` /
 *      `seedDemoComplianceVariety` / `seedDemoHandlingState` helpers
 *      look the row up by `(name='MetroWest Collaborative', is_demo=true)`
 *      so this flag MUST be set before they can attach to it.
 *   2. Tear down any sample-tagged rows in that district
 *      (`teardownSampleData(districtId)`). This is district + sample
 *      scoped, so it cannot touch operator data in other tenants —
 *      replacing the legacy global TRUNCATE that required the
 *      `ALLOW_DEMO_SEED_RESET` operator escape hatch.
 *   3. PRIMARY ENGINE: `seedSampleDataForDistrict()` — populates
 *      students, staff, services, sessions, alerts, comp obligations,
 *      handling state, and (via its built-in W5 step) the
 *      `demo_showcase_cases` overlay. Returns a `PostRunSummary` with
 *      `layers.overlay`, `showcaseCaseCounts`, `complianceDistribution`
 *      and `exampleShowcaseIds`.
 *   4. ADDITIVE enrichment passes (NOT the primary engine — only for
 *      data the V2 domain model doesn't yet cover): `seedDemoModules`
 *      (medicaid claims, parent messages, share links, signatures,
 *      restraints, document acks), `seedDemoComplianceVariety` (extra
 *      alert variety), `seedDemoHandlingState` (in-flight pill
 *      spread). Failures in any of these are logged and reported in
 *      the response but do NOT fail the reset — the canonical demo is
 *      already established by step 3.
 *
 * The route response surfaces the V2 overlay/showcase fields directly
 * (`summary`, `layers`, `showcaseCaseCounts`, `complianceDistribution`,
 * `exampleShowcaseIds`) so callers can verify the V2 path actually ran.
 */

// Process-wide mutex so two concurrent reset clicks can't interleave the
// teardown/reseed sequence (which would race on the same demo district
// rows and leave the dataset in an inconsistent state).
let demoResetInFlight: Promise<unknown> | null = null;

const DEMO_DISTRICT_NAME = "MetroWest Collaborative";

/**
 * Resolve the MetroWest demo district id, auto-provisioning the stub if
 * absent. Always sets/leaves `is_demo=true` so the additive enrichment
 * passes (which look up by name + is_demo) attach correctly.
 *
 * Exported for the proof test in `__tests__/sampleData.demo-reset-v2.test.ts`.
 */
export async function ensureDemoDistrictId(): Promise<number> {
  const existing = await db
    .select({ id: districtsTable.id, isDemo: districtsTable.isDemo })
    .from(districtsTable)
    .where(eq(districtsTable.name, DEMO_DISTRICT_NAME))
    .limit(1);
  if (existing.length > 0) {
    const row = existing[0]!;
    if (!row.isDemo) {
      await db.update(districtsTable)
        .set({ isDemo: true })
        .where(eq(districtsTable.id, row.id));
    }
    return row.id;
  }
  const inserted = await db.insert(districtsTable).values({
    name: DEMO_DISTRICT_NAME,
    tier: "essentials",
    isDemo: true,
    isPilot: false,
    isSandbox: false,
  }).returning({ id: districtsTable.id });
  return inserted[0]!.id;
}

/**
 * Canonical V2 demo reset — V2 + overlay only.
 *
 * T-V2-08 (final unification): the additive non-fatal passes for
 * `seedDemoModules`, `seedDemoComplianceVariety`, and
 * `seedDemoHandlingState` were removed from this canonical runtime
 * path. Whatever those helpers used to attach (medicaid claim rows,
 * extra alert variety, in-flight pill spread) is no longer part of
 * the canonical demo reset. Those helpers still exist standalone in
 * `lib/db/src/seed-demo-*.ts` and remain reachable from the
 * `lib/db/run-seed-demo.ts` CLI for forensic / historical / one-off
 * re-enrichment use, but they no longer execute as part of the real
 * HTTP reset flow.
 *
 * Exported so the proof test can call it directly (bypassing Express
 * auth) and assert that the V2 overlay actually ran end-to-end and
 * that no legacy enricher was invoked.
 */
export interface DemoResetV2Outcome {
  districtId: number;
  summary: PostRunSummary | undefined;
}

/**
 * T-V2-09 — Optional size-control inputs the canonical demo reset can
 * pass through to `seedSampleDataForDistrict`. Both fields default to
 * "let the seeder pick" (medium, ~350 students) when omitted.
 */
export interface DemoResetV2Inputs {
  sizeProfile?: SizeProfile;
  targetStudents?: number;
}

export async function runDemoResetV2(
  inputs: DemoResetV2Inputs = {},
): Promise<DemoResetV2Outcome> {
  const districtId = await ensureDemoDistrictId();

  // Surgical reset: wipe sample-tagged rows in this district only.
  // Replaces the legacy global TRUNCATE — safe in shared environments.
  await teardownSampleData(districtId);

  // CANONICAL ENGINE — V2 seed (runs W5 overlay + summary internally).
  // T-V2-09 — size knobs are forwarded verbatim so the reset path can
  // produce small (60–120), medium (200–500), large (800–1200), or xl
  // (1500–2000) demo districts on demand. The seeder records both the
  // request and the actual seeded counts in `summary.sizeContract`.
  const result = await seedSampleDataForDistrict(districtId, {
    districtName: DEMO_DISTRICT_NAME,
    ...(inputs.sizeProfile !== undefined ? { sizeProfile: inputs.sizeProfile } : {}),
    ...(inputs.targetStudents !== undefined ? { targetStudents: inputs.targetStudents } : {}),
  });

  return { districtId, summary: result.summary };
}

router.post("/sample-data/reset-demo", requirePlatformAdmin, async (req, res): Promise<void> => {
  if (demoResetInFlight) {
    res.status(409).json({ error: "A demo reset is already in progress; please wait for it to finish." });
    return;
  }
  const startedAt = Date.now();
  // T-V2-09 — accept optional sizeProfile + targetStudents on the demo
  // reset body so operators can intentionally produce stress-scale
  // (~2000-student) demos without dropping into the CLI.
  const body = (req.body ?? {}) as Record<string, unknown>;
  const inputs: DemoResetV2Inputs = {};
  if (typeof body.sizeProfile === "string" && SIZE_PROFILES_WIRE.has(body.sizeProfile as SizeProfile)) {
    inputs.sizeProfile = body.sizeProfile as SizeProfile;
  }
  if (typeof body.targetStudents === "number" && Number.isFinite(body.targetStudents)) {
    inputs.targetStudents = Math.max(1, Math.min(5000, Math.round(body.targetStudents)));
  }
  const work = runDemoResetV2(inputs);
  demoResetInFlight = work;
  try {
    const outcome = await work;
    const elapsedMs = Date.now() - startedAt;
    const overlayRan = outcome.summary?.layers?.overlay === true;
    logger.info(
      {
        elapsedMs,
        districtId: outcome.districtId,
        runId: outcome.summary?.runId,
        overlayRan,
        showcaseCaseCounts: outcome.summary?.showcaseCaseCounts,
      },
      "demo reset: complete (V2 canonical, no legacy enrichers)",
    );
    res.json({
      ok: true,
      engine: "v2",
      elapsedMs,
      districtId: outcome.districtId,
      reseed: { ran: true },
      // V2 PostRunSummary surfaced verbatim — proves overlay executed
      // and exposes overlay/showcase fields per the unification contract.
      summary: outcome.summary,
      layers: outcome.summary?.layers ?? null,
      showcaseCaseCounts: outcome.summary?.showcaseCaseCounts ?? null,
      complianceDistribution: outcome.summary?.complianceDistribution ?? null,
      exampleShowcaseIds: outcome.summary?.exampleShowcaseIds ?? null,
    });
  } catch (err) {
    logger.error({ err }, "demo reset failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Demo reset failed" });
  } finally {
    demoResetInFlight = null;
  }
});

export default router;
