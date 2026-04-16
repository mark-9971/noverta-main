import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  agenciesTable,
  agencyContractsTable,
  agencyStaffTable,
  serviceTypesTable,
  staffTable,
} from "@workspace/db";
import { eq, and, desc, isNull } from "drizzle-orm";
import { logAudit, diffObjects } from "../../lib/auditLog";
import { adminOnly, requireDistrictId, assertAgencyAccess } from "./shared";

const router: IRouter = Router();

router.get("/agencies", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = await requireDistrictId(req, res);
    if (!districtId) return;
    const includeDeleted = req.query.includeDeleted === "true";
    const conditions: ReturnType<typeof eq>[] = includeDeleted ? [] : [isNull(agenciesTable.deletedAt)];
    conditions.push(eq(agenciesTable.districtId, districtId));

    const agencies = await db.select()
      .from(agenciesTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(agenciesTable.name);

    res.json(agencies);
  } catch (err) {
    console.error("Error fetching agencies:", err);
    res.status(500).json({ error: "Failed to fetch agencies" });
  }
});

router.post("/agencies", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = await requireDistrictId(req, res);
    if (!districtId) return;
    const { name, contactName, contactEmail, contactPhone, address, notes } = req.body;

    if (!name?.trim()) {
      res.status(400).json({ error: "Agency name is required" });
      return;
    }

    const [agency] = await db.insert(agenciesTable).values({
      name: name.trim(),
      contactName: contactName || null,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
      address: address || null,
      notes: notes || null,
      districtId: districtId,
    }).returning();

    logAudit(req, {
      action: "create",
      targetTable: "agencies",
      targetId: agency.id,
      summary: `Created agency "${agency.name}"`,
      newValues: { name: agency.name },
    });

    res.status(201).json(agency);
  } catch (err) {
    console.error("Error creating agency:", err);
    res.status(500).json({ error: "Failed to create agency" });
  }
});

router.get("/agencies/:id", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid agency ID" }); return; }

    const agency = await assertAgencyAccess(req, res, id);
    if (!agency) { if (!res.headersSent) res.status(404).json({ error: "Agency not found" }); return; }

    const contracts = await db.select({
      id: agencyContractsTable.id,
      serviceTypeId: agencyContractsTable.serviceTypeId,
      serviceTypeName: serviceTypesTable.name,
      serviceTypeCategory: serviceTypesTable.category,
      contractedHours: agencyContractsTable.contractedHours,
      hourlyRate: agencyContractsTable.hourlyRate,
      startDate: agencyContractsTable.startDate,
      endDate: agencyContractsTable.endDate,
      alertThresholdPct: agencyContractsTable.alertThresholdPct,
      status: agencyContractsTable.status,
      notes: agencyContractsTable.notes,
      createdAt: agencyContractsTable.createdAt,
    })
      .from(agencyContractsTable)
      .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, agencyContractsTable.serviceTypeId))
      .where(and(eq(agencyContractsTable.agencyId, id), isNull(agencyContractsTable.deletedAt)))
      .orderBy(desc(agencyContractsTable.createdAt));

    const staffMembers = await db.select({
      id: staffTable.id,
      firstName: staffTable.firstName,
      lastName: staffTable.lastName,
      email: staffTable.email,
      role: staffTable.role,
    })
      .from(agencyStaffTable)
      .innerJoin(staffTable, eq(staffTable.id, agencyStaffTable.staffId))
      .where(eq(agencyStaffTable.agencyId, id));

    res.json({ ...agency, contracts, staff: staffMembers });
  } catch (err) {
    console.error("Error fetching agency:", err);
    res.status(500).json({ error: "Failed to fetch agency" });
  }
});

router.patch("/agencies/:id", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid agency ID" }); return; }

    const existing = await assertAgencyAccess(req, res, id);
    if (!existing) { if (!res.headersSent) res.status(404).json({ error: "Agency not found" }); return; }

    const updates: Record<string, unknown> = {};
    const fields = ["name", "contactName", "contactEmail", "contactPhone", "address", "notes", "status"] as const;
    for (const f of fields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const [updated] = await db.update(agenciesTable)
      .set(updates)
      .where(eq(agenciesTable.id, id))
      .returning();

    const diff = diffObjects(existing as Record<string, unknown>, updates);
    if (diff) {
      logAudit(req, {
        action: "update",
        targetTable: "agencies",
        targetId: id,
        summary: `Updated agency "${updated.name}"`,
        oldValues: diff.old,
        newValues: diff.new,
      });
    }

    res.json(updated);
  } catch (err) {
    console.error("Error updating agency:", err);
    res.status(500).json({ error: "Failed to update agency" });
  }
});

router.delete("/agencies/:id", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid agency ID" }); return; }

    const existing = await assertAgencyAccess(req, res, id);
    if (!existing) { if (!res.headersSent) res.status(404).json({ error: "Agency not found" }); return; }

    const [agency] = await db.update(agenciesTable)
      .set({ deletedAt: new Date() })
      .where(eq(agenciesTable.id, id))
      .returning();

    logAudit(req, {
      action: "delete",
      targetTable: "agencies",
      targetId: id,
      summary: `Soft-deleted agency "${agency.name}"`,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting agency:", err);
    res.status(500).json({ error: "Failed to delete agency" });
  }
});

export default router;
