import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { agencyStaffTable, staffTable, schoolsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import { adminOnly, assertAgencyAccess } from "./shared";

// tenant-scope: district-join
const router: IRouter = Router();

router.post("/agencies/:id/staff", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const agencyId = Number(req.params.id);
    const staffId = Number(req.body.staffId);
    if (isNaN(agencyId) || isNaN(staffId)) {
      res.status(400).json({ error: "Invalid agency or staff ID" });
      return;
    }

    const agencyAccess = await assertAgencyAccess(req, res, agencyId);
    if (!agencyAccess) { if (!res.headersSent) res.status(404).json({ error: "Agency not found" }); return; }

    const districtId = agencyAccess.districtId;
    if (districtId) {
      const [staffMember] = await db.select({ id: staffTable.id })
        .from(staffTable)
        .innerJoin(schoolsTable, eq(schoolsTable.id, staffTable.schoolId))
        .where(and(eq(staffTable.id, staffId), eq(schoolsTable.districtId, districtId)))
        .limit(1);
      if (!staffMember) {
        res.status(403).json({ error: "Staff member does not belong to this district" });
        return;
      }
    }

    const [link] = await db.insert(agencyStaffTable)
      .values({ agencyId, staffId })
      .onConflictDoNothing()
      .returning();

    if (!link) {
      res.status(200).json({ message: "Staff already linked to agency" });
      return;
    }

    logAudit(req, {
      action: "create",
      targetTable: "agency_staff",
      targetId: link.id,
      summary: `Linked staff ${staffId} to agency ${agencyId}`,
    });

    res.status(201).json(link);
  } catch (err) {
    console.error("Error linking staff:", err);
    res.status(500).json({ error: "Failed to link staff to agency" });
  }
});

router.delete("/agencies/:id/staff/:staffId", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const agencyId = Number(req.params.id);
    const staffId = Number(req.params.staffId);

    const agencyAccess = await assertAgencyAccess(req, res, agencyId);
    if (!agencyAccess) { if (!res.headersSent) res.status(404).json({ error: "Agency not found" }); return; }

    await db.delete(agencyStaffTable)
      .where(and(eq(agencyStaffTable.agencyId, agencyId), eq(agencyStaffTable.staffId, staffId)));

    logAudit(req, {
      action: "delete",
      targetTable: "agency_staff",
      summary: `Unlinked staff ${staffId} from agency ${agencyId}`,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Error unlinking staff:", err);
    res.status(500).json({ error: "Failed to unlink staff from agency" });
  }
});

export default router;
