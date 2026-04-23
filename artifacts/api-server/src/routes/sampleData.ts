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
  seedDemoComplianceVariety,
  seedDemoModules,
  seedDemoHandlingState,
  db,
  districtsTable,
  type SeedSampleOptions,
  type Intensity,
  type DemoEmphasis,
  type PostRunSummary,
} from "@workspace/db";
import { sql, eq, and } from "drizzle-orm";

const INTENSITIES: ReadonlySet<Intensity> = new Set(["low", "medium", "high"]);
const EMPHASES: ReadonlySet<DemoEmphasis> = new Set([
  "compliance", "comp_ed", "caseload", "behavior", "executive",
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
 * Unified V2 demo reset — exported so the proof test can call it directly
 * (without going through Express auth middleware) and assert that the V2
 * overlay actually ran end-to-end.
 */
export interface DemoResetV2Outcome {
  districtId: number;
  summary: PostRunSummary | undefined;
  modules: { ok: true; districtId: number } | { ok: false; error: string };
  variety:
    | { ok: true; alertsInserted: number; alertsSkipped: number; compliancePct: string }
    | { ok: false; error: string };
  handling:
    | { ok: true; inserted: number; considered: number }
    | { ok: false; error: string };
}

export async function runDemoResetV2(): Promise<DemoResetV2Outcome> {
  const districtId = await ensureDemoDistrictId();

  // Surgical reset: wipe sample-tagged rows in this district only.
  // Replaces the legacy global TRUNCATE — safe in shared environments.
  await teardownSampleData(districtId);

  // PRIMARY ENGINE — V2 seed (runs W5 overlay internally).
  const result = await seedSampleDataForDistrict(districtId, {
    districtName: DEMO_DISTRICT_NAME,
  });

  // ADDITIVE enrichment — non-fatal. These cover demo-only surfaces
  // (medicaid, parent messages, etc.) that the V2 domain model does
  // not yet emit. We swallow + report failures so a glitch in any of
  // them cannot mask the fact that the canonical V2 reset succeeded.
  let modules: DemoResetV2Outcome["modules"];
  try {
    const m = await seedDemoModules();
    modules = { ok: true, districtId: m.districtId };
  } catch (e) {
    logger.warn({ err: e }, "demo reset: seedDemoModules enrichment failed (non-fatal)");
    modules = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  let variety: DemoResetV2Outcome["variety"];
  try {
    const v = await seedDemoComplianceVariety();
    variety = {
      ok: true,
      alertsInserted: v.alertsInserted,
      alertsSkipped: v.alertsSkipped,
      compliancePct: v.compliancePct,
    };
  } catch (e) {
    logger.warn({ err: e }, "demo reset: seedDemoComplianceVariety enrichment failed (non-fatal)");
    variety = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  let handling: DemoResetV2Outcome["handling"];
  try {
    const h = await seedDemoHandlingState();
    handling = { ok: true, inserted: h.inserted, considered: h.considered };
  } catch (e) {
    logger.warn({ err: e }, "demo reset: seedDemoHandlingState enrichment failed (non-fatal)");
    handling = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  return { districtId, summary: result.summary, modules, variety, handling };
}

router.post("/sample-data/reset-demo", requirePlatformAdmin, async (_req, res): Promise<void> => {
  if (demoResetInFlight) {
    res.status(409).json({ error: "A demo reset is already in progress; please wait for it to finish." });
    return;
  }
  const startedAt = Date.now();
  const work = runDemoResetV2();
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
        modulesOk: outcome.modules.ok,
        varietyOk: outcome.variety.ok,
        handlingOk: outcome.handling.ok,
      },
      "demo reset: complete (V2)",
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
      // Additive enrichment results (non-fatal failures kept here so the
      // operator can see which add-on passes succeeded).
      modules: outcome.modules,
      variety: outcome.variety,
      handling: outcome.handling,
    });
  } catch (err) {
    logger.error({ err }, "demo reset failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Demo reset failed" });
  } finally {
    demoResetInFlight = null;
  }
});

export default router;
