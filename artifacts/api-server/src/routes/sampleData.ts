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
  seedDemoDistrict,
} from "@workspace/db";

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
    const result = await seedSampleDataForDistrict(districtId);
    logger.info({ districtId, ...result }, "sample data seeded");
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    // Log the original error (including any raw SQL) server-side, but never
    // surface it to the user — toasts/banners must stay friendly.
    logger.error({ err, districtId }, "sample-data seed failed");
    res.status(500).json({ error: "Couldn't load sample data — please try again" });
  }
});

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
 * Sequence:
 *   1. `seedDemoDistrict()` — full canonical reseed (TRUNCATEs and
 *      re-creates the demo district, schools, staff, students, services,
 *      sessions, IEPs, goals, etc.). This drops any drift accumulated
 *      during the previous demo (edits, deletes, hand-created rows).
 *   2. `seedDemoModules()` — additive module sweep (medicaid claims,
 *      compensatory variety, parent messages, share links, signatures,
 *      transitions, restraints, document acks, export history).
 *   3. `seedDemoComplianceVariety()` — additive compliance-alert variety
 *      that lands the demo at ~80% compliance with a representative mix
 *      of alert types.
 *
 * SAFETY: `seedDemoDistrict()` runs a global TRUNCATE across districts,
 * schools, staff, students, etc. Its built-in guard refuses to do so
 * when the database contains any non-demo districts (unless the
 * deployment operator has explicitly set `ALLOW_DEMO_SEED_RESET=1`).
 * This route does NOT bypass that guard. In shared multi-tenant
 * environments the canonical reseed will fail loudly (returned as a
 * 500 with the seeder's explanatory message) rather than silently
 * destroy real tenant data. Use this endpoint only on dedicated demo
 * deployments.
 */
// Process-wide mutex so two concurrent reset clicks can't interleave the
// truncate/reseed sequence (which would race on the same demo district
// rows and leave the dataset in an inconsistent state).
let demoResetInFlight: Promise<unknown> | null = null;

router.post("/sample-data/reset-demo", requirePlatformAdmin, async (_req, res): Promise<void> => {
  if (demoResetInFlight) {
    res.status(409).json({ error: "A demo reset is already in progress; please wait for it to finish." });
    return;
  }
  const startedAt = Date.now();
  const work = (async () => {
    logger.info("demo reset: starting full canonical reseed");
    // We do NOT pass `allowReset: true`. `seedDemoDistrict()` runs a
    // global TRUNCATE across districts/schools/staff/students/etc. In a
    // dedicated demo environment (no non-demo districts, or operator
    // has set `ALLOW_DEMO_SEED_RESET=1` on the deployment) the seeder's
    // own guard permits the truncate. In any shared environment that
    // contains real tenant districts the seeder will throw, and the
    // catch block below surfaces it as a 500 with the seeder's
    // explanatory message — the reset MUST NOT be allowed to wipe
    // non-demo tenant data, so this guard is intentional.
    await seedDemoDistrict();
    logger.info("demo reset: canonical reseed complete, running module sweep");
    const modules = await seedDemoModules();
    logger.info("demo reset: module sweep complete, running compliance variety");
    const variety = await seedDemoComplianceVariety();
    return { modules, variety };
  })();
  demoResetInFlight = work;
  try {
    const { modules, variety } = await work;
    const elapsedMs = Date.now() - startedAt;
    logger.info({ elapsedMs, ...variety }, "demo reset: complete");
    res.json({
      ok: true,
      elapsedMs,
      districtId: variety.districtId,
      reseed: { ran: true },
      variety: {
        alertsInserted: variety.alertsInserted,
        alertsSkipped: variety.alertsSkipped,
        totalStudents: variety.totalStudents,
        nonCompliantStudents: variety.nonCompliantStudents,
        compliancePct: variety.compliancePct,
      },
      modules: { districtId: modules.districtId },
    });
  } catch (err) {
    logger.error({ err }, "demo reset failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Demo reset failed" });
  } finally {
    demoResetInFlight = null;
  }
});

export default router;
