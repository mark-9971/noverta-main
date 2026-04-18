/**
 * Forward-looking service-delivery forecast routes.
 *
 * Pairs with retrospective cost-avoidance: this endpoint surfaces students
 * who are *currently* on track but will fall out of compliance in the next
 * few weeks because their provider is going to be absent and no substitute
 * has been assigned. Read-only.
 */

import { Router } from "express";
import type { AuthedRequest } from "../middlewares/auth";
import { getEnforcedDistrictId } from "../middlewares/auth";
import { computeServiceForecast } from "../lib/serviceForecast";

const router = Router();

router.get("/service-forecast", async (req, res): Promise<void> => {
  try {
    const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
    if (districtId == null) {
      res.status(403).json({ error: "District scope required" });
      return;
    }

    const horizonWeeks = req.query.horizonWeeks ? parseInt(String(req.query.horizonWeeks), 10) : 4;
    const studentId = req.query.studentId ? parseInt(String(req.query.studentId), 10) : undefined;
    const staffId = req.query.staffId ? parseInt(String(req.query.staffId), 10) : undefined;

    if (Number.isNaN(horizonWeeks) || horizonWeeks < 1 || horizonWeeks > 12) {
      res.status(400).json({ error: "horizonWeeks must be between 1 and 12" });
      return;
    }
    if (studentId !== undefined && Number.isNaN(studentId)) {
      res.status(400).json({ error: "studentId must be an integer" });
      return;
    }
    if (staffId !== undefined && Number.isNaN(staffId)) {
      res.status(400).json({ error: "staffId must be an integer" });
      return;
    }

    const result = await computeServiceForecast({ districtId, horizonWeeks, studentId, staffId });
    res.json(result);
  } catch (e) {
    console.error("GET /service-forecast error:", e);
    res.status(500).json({ error: "Failed to compute service forecast" });
  }
});

export default router;
