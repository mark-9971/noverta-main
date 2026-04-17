import { Router, type Request, type Response } from "express";
import { requireMinRole } from "../middlewares/auth";
import { resolveDistrictIdForCaller } from "../lib/resolveDistrictForCaller";
import { runDistrictReadinessChecks } from "../lib/pilotReadiness";

const router = Router();
const adminOnly = requireMinRole("admin");

// Pilot readiness scans surface PII completeness, IEP coverage gaps, etc. The
// previous "use the only district in the table" fallback is gone — running a
// readiness check against a borrowed district would let an unscoped admin see
// another tenant's compliance gaps. Callers must have explicit scope.
async function resolveCallerDistrictId(req: Request): Promise<number | null> {
  return resolveDistrictIdForCaller(req);
}

router.get("/admin/pilot-readiness", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = await resolveCallerDistrictId(req);
    if (!districtId) {
      res.status(403).json({ error: "Unable to determine district" });
      return;
    }
    const report = await runDistrictReadinessChecks(districtId);
    res.json(report);
  } catch (err) {
    console.error("Error running pilot readiness checks:", err);
    res.status(500).json({ error: "Failed to run readiness checks" });
  }
});

export default router;
