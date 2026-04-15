import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  agenciesTable,
  agencyContractsTable,
  agencyStaffTable,
  serviceTypesTable,
  staffTable,
  sessionLogsTable,
} from "@workspace/db";
import { eq, and, desc, isNull, sql, gte, lte, inArray } from "drizzle-orm";
import { requireMinRole } from "../middlewares/auth";
import { logAudit, diffObjects } from "../lib/auditLog";

const router: IRouter = Router();

const adminOnly = requireMinRole("coordinator");

router.get("/agencies", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const includeDeleted = req.query.includeDeleted === "true";
    const conditions = includeDeleted ? [] : [isNull(agenciesTable.deletedAt)];

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
    const { name, contactName, contactEmail, contactPhone, address, notes, districtId } = req.body;

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
      districtId: districtId ? Number(districtId) : null,
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

    const [agency] = await db.select()
      .from(agenciesTable)
      .where(eq(agenciesTable.id, id))
      .limit(1);

    if (!agency) { res.status(404).json({ error: "Agency not found" }); return; }

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

    const [existing] = await db.select().from(agenciesTable).where(eq(agenciesTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Agency not found" }); return; }

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

    const [agency] = await db.update(agenciesTable)
      .set({ deletedAt: new Date() })
      .where(eq(agenciesTable.id, id))
      .returning();

    if (!agency) { res.status(404).json({ error: "Agency not found" }); return; }

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

router.post("/agencies/:id/staff", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const agencyId = Number(req.params.id);
    const staffId = Number(req.body.staffId);
    if (isNaN(agencyId) || isNaN(staffId)) {
      res.status(400).json({ error: "Invalid agency or staff ID" });
      return;
    }

    const [link] = await db.insert(agencyStaffTable)
      .values({ agencyId, staffId })
      .returning();

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

    const deleted = await db.delete(agencyStaffTable)
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

router.post("/agencies/:id/contracts", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const agencyId = Number(req.params.id);
    if (isNaN(agencyId)) { res.status(400).json({ error: "Invalid agency ID" }); return; }

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

    const [existing] = await db.select()
      .from(agencyContractsTable)
      .where(and(eq(agencyContractsTable.id, contractId), eq(agencyContractsTable.agencyId, agencyId)))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Contract not found" }); return; }

    const updates: Record<string, unknown> = {};
    if (req.body.contractedHours !== undefined) updates.contractedHours = String(Number(req.body.contractedHours));
    if (req.body.hourlyRate !== undefined) updates.hourlyRate = req.body.hourlyRate ? String(Number(req.body.hourlyRate)) : null;
    if (req.body.startDate !== undefined) updates.startDate = req.body.startDate;
    if (req.body.endDate !== undefined) updates.endDate = req.body.endDate;
    if (req.body.alertThresholdPct !== undefined) updates.alertThresholdPct = Number(req.body.alertThresholdPct);
    if (req.body.status !== undefined) updates.status = req.body.status;
    if (req.body.notes !== undefined) updates.notes = req.body.notes;
    if (req.body.serviceTypeId !== undefined) updates.serviceTypeId = Number(req.body.serviceTypeId);

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
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

router.get("/contracts/utilization", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const contracts = await db.select({
      id: agencyContractsTable.id,
      agencyId: agencyContractsTable.agencyId,
      agencyName: agenciesTable.name,
      serviceTypeId: agencyContractsTable.serviceTypeId,
      serviceTypeName: serviceTypesTable.name,
      serviceTypeCategory: serviceTypesTable.category,
      contractedHours: agencyContractsTable.contractedHours,
      hourlyRate: agencyContractsTable.hourlyRate,
      startDate: agencyContractsTable.startDate,
      endDate: agencyContractsTable.endDate,
      alertThresholdPct: agencyContractsTable.alertThresholdPct,
      status: agencyContractsTable.status,
    })
      .from(agencyContractsTable)
      .innerJoin(agenciesTable, eq(agenciesTable.id, agencyContractsTable.agencyId))
      .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, agencyContractsTable.serviceTypeId))
      .where(and(
        isNull(agencyContractsTable.deletedAt),
        isNull(agenciesTable.deletedAt),
      ))
      .orderBy(agenciesTable.name);

    if (contracts.length === 0) {
      res.json([]);
      return;
    }

    const contractIds = contracts.map(c => c.id);

    const agencyIds = [...new Set(contracts.map(c => c.agencyId))];
    const staffLinks = await db.select({
      agencyId: agencyStaffTable.agencyId,
      staffId: agencyStaffTable.staffId,
    })
      .from(agencyStaffTable)
      .where(inArray(agencyStaffTable.agencyId, agencyIds));

    const staffByAgency = new Map<number, number[]>();
    for (const link of staffLinks) {
      const list = staffByAgency.get(link.agencyId) || [];
      list.push(link.staffId);
      staffByAgency.set(link.agencyId, list);
    }

    const utilization = await Promise.all(contracts.map(async (contract) => {
      const agencyStaffIds = staffByAgency.get(contract.agencyId) || [];

      let consumedMinutes = 0;
      if (agencyStaffIds.length > 0) {
        const [result] = await db.select({
          totalMinutes: sql<number>`COALESCE(SUM(${sessionLogsTable.durationMinutes}), 0)`,
        })
          .from(sessionLogsTable)
          .where(and(
            inArray(sessionLogsTable.staffId, agencyStaffIds),
            eq(sessionLogsTable.serviceTypeId, contract.serviceTypeId),
            gte(sessionLogsTable.sessionDate, contract.startDate),
            lte(sessionLogsTable.sessionDate, contract.endDate),
            isNull(sessionLogsTable.deletedAt),
            eq(sessionLogsTable.status, "completed"),
          ));
        consumedMinutes = Number(result?.totalMinutes || 0);
      }

      const consumedHours = consumedMinutes / 60;
      const contractedHours = Number(contract.contractedHours);
      const utilizationPct = contractedHours > 0 ? Math.round((consumedHours / contractedHours) * 100) : 0;
      const remainingHours = Math.max(0, contractedHours - consumedHours);

      const today = new Date().toISOString().split("T")[0];
      const daysUntilEnd = Math.ceil((new Date(contract.endDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24));
      const isExpiringSoon = daysUntilEnd <= 30 && daysUntilEnd > 0;
      const isOverThreshold = utilizationPct >= contract.alertThresholdPct;

      return {
        ...contract,
        consumedHours: Math.round(consumedHours * 100) / 100,
        remainingHours: Math.round(remainingHours * 100) / 100,
        utilizationPct,
        daysUntilEnd,
        isExpiringSoon,
        isOverThreshold,
        staffCount: (staffByAgency.get(contract.agencyId) || []).length,
      };
    }));

    res.json(utilization);
  } catch (err) {
    console.error("Error fetching utilization:", err);
    res.status(500).json({ error: "Failed to fetch contract utilization" });
  }
});

router.get("/contracts/alerts", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const contracts = await db.select({
      id: agencyContractsTable.id,
      agencyId: agencyContractsTable.agencyId,
      agencyName: agenciesTable.name,
      serviceTypeId: agencyContractsTable.serviceTypeId,
      serviceTypeName: serviceTypesTable.name,
      contractedHours: agencyContractsTable.contractedHours,
      startDate: agencyContractsTable.startDate,
      endDate: agencyContractsTable.endDate,
      alertThresholdPct: agencyContractsTable.alertThresholdPct,
      status: agencyContractsTable.status,
    })
      .from(agencyContractsTable)
      .innerJoin(agenciesTable, eq(agenciesTable.id, agencyContractsTable.agencyId))
      .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, agencyContractsTable.serviceTypeId))
      .where(and(
        eq(agencyContractsTable.status, "active"),
        isNull(agencyContractsTable.deletedAt),
        isNull(agenciesTable.deletedAt),
      ));

    const agencyIds = [...new Set(contracts.map(c => c.agencyId))];
    const staffLinks = agencyIds.length > 0
      ? await db.select({ agencyId: agencyStaffTable.agencyId, staffId: agencyStaffTable.staffId })
          .from(agencyStaffTable)
          .where(inArray(agencyStaffTable.agencyId, agencyIds))
      : [];

    const staffByAgency = new Map<number, number[]>();
    for (const link of staffLinks) {
      const list = staffByAgency.get(link.agencyId) || [];
      list.push(link.staffId);
      staffByAgency.set(link.agencyId, list);
    }

    const today = new Date().toISOString().split("T")[0];
    const alerts: Array<{
      contractId: number;
      agencyName: string;
      serviceTypeName: string | null;
      alertType: "threshold" | "renewal";
      message: string;
      severity: "warning" | "critical";
      utilizationPct?: number;
      daysUntilEnd?: number;
    }> = [];

    for (const contract of contracts) {
      const daysUntilEnd = Math.ceil((new Date(contract.endDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilEnd <= 30 && daysUntilEnd > 0) {
        alerts.push({
          contractId: contract.id,
          agencyName: contract.agencyName,
          serviceTypeName: contract.serviceTypeName,
          alertType: "renewal",
          message: `Contract expires in ${daysUntilEnd} day${daysUntilEnd === 1 ? "" : "s"}`,
          severity: daysUntilEnd <= 7 ? "critical" : "warning",
          daysUntilEnd,
        });
      }

      const agencyStaffIds = staffByAgency.get(contract.agencyId) || [];
      if (agencyStaffIds.length > 0) {
        const [result] = await db.select({
          totalMinutes: sql<number>`COALESCE(SUM(${sessionLogsTable.durationMinutes}), 0)`,
        })
          .from(sessionLogsTable)
          .where(and(
            inArray(sessionLogsTable.staffId, agencyStaffIds),
            eq(sessionLogsTable.serviceTypeId, contract.serviceTypeId),
            gte(sessionLogsTable.sessionDate, contract.startDate),
            lte(sessionLogsTable.sessionDate, contract.endDate),
            isNull(sessionLogsTable.deletedAt),
            eq(sessionLogsTable.status, "completed"),
          ));

        const consumedHours = Number(result?.totalMinutes || 0) / 60;
        const contractedHours = Number(contract.contractedHours);
        const utilizationPct = contractedHours > 0 ? Math.round((consumedHours / contractedHours) * 100) : 0;

        if (utilizationPct >= contract.alertThresholdPct) {
          alerts.push({
            contractId: contract.id,
            agencyName: contract.agencyName,
            serviceTypeName: contract.serviceTypeName,
            alertType: "threshold",
            message: `${utilizationPct}% of contracted hours consumed (threshold: ${contract.alertThresholdPct}%)`,
            severity: utilizationPct >= 95 ? "critical" : "warning",
            utilizationPct,
          });
        }
      }
    }

    alerts.sort((a, b) => {
      if (a.severity === "critical" && b.severity !== "critical") return -1;
      if (a.severity !== "critical" && b.severity === "critical") return 1;
      return 0;
    });

    res.json(alerts);
  } catch (err) {
    console.error("Error fetching contract alerts:", err);
    res.status(500).json({ error: "Failed to fetch contract alerts" });
  }
});

export default router;
