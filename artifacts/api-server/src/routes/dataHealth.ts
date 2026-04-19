import { Router, type IRouter } from "express";
import { requireRoles, getEnforcedDistrictId } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import { runDataHealthChecks } from "../lib/dataHealthChecks";

const router: IRouter = Router();

const requireAdmin = requireRoles("admin", "coordinator");

router.get("/data-health", requireAdmin, async (req, res): Promise<void> => {
  try {
    const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
    if (!districtId) {
      res.status(403).json({ error: "District scope required" });
      return;
    }
    const report = await runDataHealthChecks(districtId);
    res.json(report);
  } catch (err) {
    console.error("[DataHealth] Error:", err);
    res.status(500).json({ error: "Failed to run data health check" });
  }
});

export default router;
