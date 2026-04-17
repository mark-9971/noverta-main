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
import { requireRoles, requireDistrictScope, getEnforcedDistrictId } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import {
  seedSampleDataForDistrict,
  teardownSampleData,
  getSampleDataStatus,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/sample-data", requireDistrictScope, requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (districtId == null) {
    res.status(403).json({ error: "No district scope" });
    return;
  }
  try {
    const status = await getSampleDataStatus(districtId);
    res.json({ ...status, districtId });
  } catch (err) {
    logger.error({ err }, "sample-data status failed");
    res.status(500).json({ error: "Failed to load sample data status" });
  }
});

router.post("/sample-data", requireDistrictScope, requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
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
    logger.error({ err, districtId }, "sample-data seed failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Seed failed" });
  }
});

router.delete("/sample-data", requireDistrictScope, requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
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
    res.status(500).json({ error: err instanceof Error ? err.message : "Teardown failed" });
  }
});

export default router;
