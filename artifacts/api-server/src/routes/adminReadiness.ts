import { Router, type Request, type Response } from "express";
import { db, districtsTable, staffTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireMinRole } from "../middlewares/auth";
import { getPublicMeta } from "../lib/clerkClaims";
import { runDistrictReadinessChecks } from "../lib/pilotReadiness";

const router = Router();
const adminOnly = requireMinRole("admin");

async function resolveCallerDistrictId(req: Request): Promise<number | null> {
  const meta = getPublicMeta(req);
  if (meta.districtId) return meta.districtId;
  if (meta.staffId) {
    const [staff] = await db
      .select({ schoolId: staffTable.schoolId })
      .from(staffTable)
      .where(eq(staffTable.id, meta.staffId))
      .limit(1);
    if (staff?.schoolId) {
      const result = await db.execute(
        sql`SELECT district_id FROM schools WHERE id = ${staff.schoolId} LIMIT 1`,
      );
      const row = result.rows?.[0] as Record<string, unknown> | undefined;
      if (row) return Number(row.district_id);
    }
  }
  const all = await db.select({ id: districtsTable.id }).from(districtsTable).limit(2);
  if (all.length === 1) return all[0].id;
  return null;
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
