import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { agencyContractsTable } from "@workspace/db";
import { eq, and, isNull, sql, gte, lte } from "drizzle-orm";
import { logAudit, diffObjects } from "../../lib/auditLog";
import { adminOnly, assertAgencyAccess } from "./shared";

// tenant-scope: district-join
const router: IRouter = Router();

router.post("/agencies/:id/contracts", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const agencyId = Number(req.params.id);
    if (isNaN(agencyId)) { res.status(400).json({ error: "Invalid agency ID" }); return; }

    const agencyAccess = await assertAgencyAccess(req, res, agencyId);
    if (!agencyAccess) { if (!res.headersSent) res.status(404).json({ error: "Agency not found" }); return; }

    const { serviceTypeId, contractedHours, hourlyRate, startDate, endDate, alertThresholdPct, notes } = req.body;

    if (!serviceTypeId || !contractedHours || !startDate || !endDate) {
      res.status(400).json({ error: "serviceTypeId, contractedHours, startDate, and endDate are required" });
      return;
    }

    const hours = Number(contractedHours);
    if (isNaN(hours) || hours <= 0) {
      res.status(400).json({ error: "contractedHours must be a positive number" });
      return;
    }

    const threshold = alertThresholdPct !== undefined ? Number(alertThresholdPct) : 80;
    if (isNaN(threshold) || threshold < 1 || threshold > 100) {
      res.status(400).json({ error: "alertThresholdPct must be between 1 and 100" });
      return;
    }

    if (startDate > endDate) {
      res.status(400).json({ error: "startDate must be on or before endDate" });
      return;
    }

    const overlapping = await db.select({ id: agencyContractsTable.id })
      .from(agencyContractsTable)
      .where(and(
        eq(agencyContractsTable.agencyId, agencyId),
        eq(agencyContractsTable.serviceTypeId, Number(serviceTypeId)),
        eq(agencyContractsTable.status, "active"),
        isNull(agencyContractsTable.deletedAt),
        lte(agencyContractsTable.startDate, endDate),
        gte(agencyContractsTable.endDate, startDate),
      ))
      .limit(1);

    if (overlapping.length > 0) {
      res.status(409).json({ error: "An active contract for this agency and service type already overlaps the specified date range" });
      return;
    }

    const [contract] = await db.insert(agencyContractsTable).values({
      agencyId,
      serviceTypeId: Number(serviceTypeId),
      contractedHours: String(hours),
      hourlyRate: hourlyRate ? String(Number(hourlyRate)) : null,
      startDate,
      endDate,
      alertThresholdPct: threshold,
      notes: notes || null,
    }).returning();

    logAudit(req, {
      action: "create",
      targetTable: "agency_contracts",
      targetId: contract.id,
      summary: `Created contract for agency ${agencyId}, ${hours} hours`,
      newValues: { serviceTypeId, contractedHours: hours, startDate, endDate },
    });

    res.status(201).json(contract);
  } catch (err) {
    console.error("Error creating contract:", err);
    res.status(500).json({ error: "Failed to create contract" });
  }
});

router.patch("/agencies/:id/contracts/:contractId", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const agencyId = Number(req.params.id);
    const contractId = Number(req.params.contractId);

    const agencyAccess = await assertAgencyAccess(req, res, agencyId);
    if (!agencyAccess) { if (!res.headersSent) res.status(404).json({ error: "Agency not found" }); return; }

    const [existing] = await db.select()
      .from(agencyContractsTable)
      .where(and(eq(agencyContractsTable.id, contractId), eq(agencyContractsTable.agencyId, agencyId)))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Contract not found" }); return; }

    const updates: Record<string, unknown> = {};
    if (req.body.contractedHours !== undefined) {
      const h = Number(req.body.contractedHours);
      if (isNaN(h) || h <= 0) { res.status(400).json({ error: "contractedHours must be a positive number" }); return; }
      updates.contractedHours = String(h);
    }
    if (req.body.hourlyRate !== undefined) {
      if (req.body.hourlyRate) {
        const r = Number(req.body.hourlyRate);
        if (isNaN(r) || r < 0) { res.status(400).json({ error: "hourlyRate must be a non-negative number" }); return; }
        updates.hourlyRate = String(r);
      } else {
        updates.hourlyRate = null;
      }
    }
    if (req.body.startDate !== undefined) updates.startDate = req.body.startDate;
    if (req.body.endDate !== undefined) updates.endDate = req.body.endDate;
    if (req.body.alertThresholdPct !== undefined) {
      const t = Number(req.body.alertThresholdPct);
      if (isNaN(t) || t < 1 || t > 100) { res.status(400).json({ error: "alertThresholdPct must be between 1 and 100" }); return; }
      updates.alertThresholdPct = t;
    }
    if (req.body.status !== undefined) {
      if (!["active", "expired", "cancelled"].includes(req.body.status)) { res.status(400).json({ error: "status must be active, expired, or cancelled" }); return; }
      updates.status = req.body.status;
    }
    if (req.body.notes !== undefined) updates.notes = req.body.notes;
    if (req.body.serviceTypeId !== undefined) {
      const s = Number(req.body.serviceTypeId);
      if (isNaN(s) || s <= 0) { res.status(400).json({ error: "serviceTypeId must be a positive integer" }); return; }
      updates.serviceTypeId = s;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const effectiveServiceTypeId = (updates.serviceTypeId as number) ?? existing.serviceTypeId;
    const effectiveStartDate = (updates.startDate as string) ?? existing.startDate;
    const effectiveEndDate = (updates.endDate as string) ?? existing.endDate;
    const effectiveStatus = (updates.status as string) ?? existing.status;

    if (effectiveStartDate > effectiveEndDate) {
      res.status(400).json({ error: "startDate must be on or before endDate" });
      return;
    }

    if (effectiveStatus === "active" &&
        (updates.status !== undefined || updates.serviceTypeId !== undefined || updates.startDate !== undefined || updates.endDate !== undefined)) {
      const overlapping = await db.select({ id: agencyContractsTable.id })
        .from(agencyContractsTable)
        .where(and(
          eq(agencyContractsTable.agencyId, agencyId),
          eq(agencyContractsTable.serviceTypeId, effectiveServiceTypeId),
          eq(agencyContractsTable.status, "active"),
          isNull(agencyContractsTable.deletedAt),
          lte(agencyContractsTable.startDate, effectiveEndDate),
          gte(agencyContractsTable.endDate, effectiveStartDate),
          sql`${agencyContractsTable.id} != ${contractId}`,
        ))
        .limit(1);

      if (overlapping.length > 0) {
        res.status(409).json({ error: "An active contract for this agency and service type already overlaps the specified date range" });
        return;
      }
    }

    const [updated] = await db.update(agencyContractsTable)
      .set(updates)
      .where(eq(agencyContractsTable.id, contractId))
      .returning();

    const diff = diffObjects(existing as Record<string, unknown>, updates);
    if (diff) {
      logAudit(req, {
        action: "update",
        targetTable: "agency_contracts",
        targetId: contractId,
        summary: `Updated contract ${contractId}`,
        oldValues: diff.old,
        newValues: diff.new,
      });
    }

    res.json(updated);
  } catch (err) {
    console.error("Error updating contract:", err);
    res.status(500).json({ error: "Failed to update contract" });
  }
});

router.delete("/agencies/:id/contracts/:contractId", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const agencyId = Number(req.params.id);
    const contractId = Number(req.params.contractId);

    const agencyAccess = await assertAgencyAccess(req, res, agencyId);
    if (!agencyAccess) { if (!res.headersSent) res.status(404).json({ error: "Agency not found" }); return; }

    const [contract] = await db.update(agencyContractsTable)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(agencyContractsTable.id, contractId),
        eq(agencyContractsTable.agencyId, agencyId),
        isNull(agencyContractsTable.deletedAt),
      ))
      .returning();

    if (!contract) { res.status(404).json({ error: "Contract not found" }); return; }

    logAudit(req, {
      action: "delete",
      targetTable: "agency_contracts",
      targetId: contractId,
      summary: `Soft-deleted contract ${contractId}`,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting contract:", err);
    res.status(500).json({ error: "Failed to delete contract" });
  }
});

export default router;
