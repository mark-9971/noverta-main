import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  agenciesTable,
  agencyContractsTable,
  agencyStaffTable,
  contractSessionLinksTable,
  serviceTypesTable,
  staffTable,
  sessionLogsTable,
} from "@workspace/db";
import { eq, and, desc, isNull, sql, gte, lte, inArray } from "drizzle-orm";
import { districtsTable, schoolsTable } from "@workspace/db";
import { requireMinRole } from "../middlewares/auth";
import { logAudit, diffObjects } from "../lib/auditLog";
import { getPublicMeta } from "../lib/clerkClaims";

const router: IRouter = Router();

const adminOnly = requireMinRole("coordinator");

async function requireDistrictId(req: Request, res: Response): Promise<number | null> {
  const meta = getPublicMeta(req);

  if (meta.staffId) {
    const [staff] = await db.select({ schoolId: staffTable.schoolId })
      .from(staffTable)
      .where(eq(staffTable.id, meta.staffId))
      .limit(1);

    if (staff?.schoolId) {
      const [school] = await db.select({ districtId: schoolsTable.districtId })
        .from(schoolsTable)
        .where(eq(schoolsTable.id, staff.schoolId))
        .limit(1);

      if (school?.districtId) return school.districtId;
    }
  }

  const districts = await db.select({ id: districtsTable.id })
    .from(districtsTable)
    .limit(2);

  if (districts.length === 1) return districts[0].id;

  res.status(403).json({ error: "Unable to determine district scope" });
  return null;
}

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

async function assertAgencyAccess(req: Request, res: Response, agencyId: number): Promise<typeof agenciesTable.$inferSelect | null> {
  const districtId = await requireDistrictId(req, res);
  if (!districtId) return null;

  const [agency] = await db.select()
    .from(agenciesTable)
    .where(and(eq(agenciesTable.id, agencyId), eq(agenciesTable.districtId, districtId)))
    .limit(1);

  return agency || null;
}

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

    const effectiveServiceTypeId = (updates.serviceTypeId as number) ?? existing.serviceTypeId;
    const effectiveStartDate = (updates.startDate as string) ?? existing.startDate;
    const effectiveEndDate = (updates.endDate as string) ?? existing.endDate;
    const effectiveStatus = (updates.status as string) ?? existing.status;

    if (effectiveStatus === "active" &&
        (updates.serviceTypeId !== undefined || updates.startDate !== undefined || updates.endDate !== undefined)) {
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

async function reconcileContractSessionLinks(districtId: number): Promise<number> {
  const activeContracts = await db.select({
    id: agencyContractsTable.id,
    agencyId: agencyContractsTable.agencyId,
    serviceTypeId: agencyContractsTable.serviceTypeId,
    startDate: agencyContractsTable.startDate,
    endDate: agencyContractsTable.endDate,
  })
    .from(agencyContractsTable)
    .innerJoin(agenciesTable, eq(agenciesTable.id, agencyContractsTable.agencyId))
    .where(and(
      eq(agencyContractsTable.status, "active"),
      isNull(agencyContractsTable.deletedAt),
      eq(agenciesTable.districtId, districtId),
    ));

  const contractIds = activeContracts.map(c => c.id);

  if (contractIds.length > 0) {
    await db.delete(contractSessionLinksTable)
      .where(inArray(contractSessionLinksTable.contractId, contractIds));
  }

  if (activeContracts.length === 0) return 0;

  const agencyIds = [...new Set(activeContracts.map(c => c.agencyId))];
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

  const assignedSessionIds = new Set<number>();
  let attributed = 0;

  for (const contract of activeContracts) {
    const agencyStaffIds = staffByAgency.get(contract.agencyId) || [];
    if (agencyStaffIds.length === 0) continue;

    const sessions = await db.select({
      id: sessionLogsTable.id,
      durationMinutes: sessionLogsTable.durationMinutes,
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

    const eligible = sessions.filter(s => !assignedSessionIds.has(s.id));

    if (eligible.length > 0) {
      await db.insert(contractSessionLinksTable)
        .values(eligible.map(s => ({
          contractId: contract.id,
          sessionLogId: s.id,
          attributedMinutes: s.durationMinutes,
        })))
        .onConflictDoNothing();
      attributed += eligible.length;
      for (const s of eligible) assignedSessionIds.add(s.id);
    }
  }

  return attributed;
}

router.post("/contracts/reconcile", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = await requireDistrictId(req, res);
    if (!districtId) return;
    const attributed = await reconcileContractSessionLinks(districtId);
    res.json({ attributed, message: `Attributed ${attributed} session(s) to contracts` });
  } catch (err) {
    console.error("Error reconciling sessions:", err);
    res.status(500).json({ error: "Failed to reconcile sessions" });
  }
});

router.get("/contracts/utilization", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = await requireDistrictId(req, res);
    if (!districtId) return;
    await reconcileContractSessionLinks(districtId);

    const conditions = [
      isNull(agencyContractsTable.deletedAt),
      isNull(agenciesTable.deletedAt),
      eq(agenciesTable.districtId, districtId),
    ];

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
      .where(and(...conditions))
      .orderBy(agenciesTable.name);

    if (contracts.length === 0) {
      res.json([]);
      return;
    }

    const contractIds = contracts.map(c => c.id);

    const linkageTotals = contractIds.length > 0
      ? await db.select({
          contractId: contractSessionLinksTable.contractId,
          totalMinutes: sql<number>`COALESCE(SUM(${contractSessionLinksTable.attributedMinutes}), 0)`,
          sessionCount: sql<number>`COUNT(*)`,
        })
          .from(contractSessionLinksTable)
          .where(inArray(contractSessionLinksTable.contractId, contractIds))
          .groupBy(contractSessionLinksTable.contractId)
      : [];

    const minutesByContract = new Map<number, { totalMinutes: number; sessionCount: number }>();
    for (const row of linkageTotals) {
      minutesByContract.set(row.contractId, {
        totalMinutes: Number(row.totalMinutes),
        sessionCount: Number(row.sessionCount),
      });
    }

    const agencyIds = [...new Set(contracts.map(c => c.agencyId))];
    const staffCounts = agencyIds.length > 0
      ? await db.select({
          agencyId: agencyStaffTable.agencyId,
          count: sql<number>`COUNT(*)`,
        })
          .from(agencyStaffTable)
          .where(inArray(agencyStaffTable.agencyId, agencyIds))
          .groupBy(agencyStaffTable.agencyId)
      : [];

    const staffCountByAgency = new Map<number, number>();
    for (const row of staffCounts) {
      staffCountByAgency.set(row.agencyId, Number(row.count));
    }

    const utilization = contracts.map((contract) => {
      const linkage = minutesByContract.get(contract.id) || { totalMinutes: 0, sessionCount: 0 };
      const consumedMinutes = linkage.totalMinutes;

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
        sessionCount: linkage.sessionCount,
        staffCount: staffCountByAgency.get(contract.agencyId) || 0,
      };
    });

    res.json(utilization);
  } catch (err) {
    console.error("Error fetching utilization:", err);
    res.status(500).json({ error: "Failed to fetch contract utilization" });
  }
});

router.get("/contracts/alerts", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = await requireDistrictId(req, res);
    if (!districtId) return;

    const alertConditions = [
      eq(agencyContractsTable.status, "active"),
      isNull(agencyContractsTable.deletedAt),
      isNull(agenciesTable.deletedAt),
      eq(agenciesTable.districtId, districtId),
    ];

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
      .where(and(...alertConditions));

    await reconcileContractSessionLinks(districtId);

    const contractIds = contracts.map(c => c.id);
    const linkageTotals = contractIds.length > 0
      ? await db.select({
          contractId: contractSessionLinksTable.contractId,
          totalMinutes: sql<number>`COALESCE(SUM(${contractSessionLinksTable.attributedMinutes}), 0)`,
        })
          .from(contractSessionLinksTable)
          .where(inArray(contractSessionLinksTable.contractId, contractIds))
          .groupBy(contractSessionLinksTable.contractId)
      : [];

    const minutesByContract = new Map<number, number>();
    for (const row of linkageTotals) {
      minutesByContract.set(row.contractId, Number(row.totalMinutes));
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

      const consumedMinutes = minutesByContract.get(contract.id) || 0;
      const consumedHours = consumedMinutes / 60;
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
