import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  agenciesTable,
  agencyContractsTable,
  agencyStaffTable,
  contractSessionLinksTable,
  serviceTypesTable,
} from "@workspace/db";
import { eq, and, isNull, sql, inArray } from "drizzle-orm";
import { requireTierAccess } from "../../middlewares/tierGate";
import { adminOnly, requireDistrictId, reconcileContractSessionLinks } from "./shared";

const router: IRouter = Router();

router.post("/contracts/reconcile", adminOnly, requireTierAccess("district.contract_utilization"), async (req: Request, res: Response): Promise<void> => {
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

router.get("/contracts/utilization", adminOnly, requireTierAccess("district.contract_utilization"), async (req: Request, res: Response): Promise<void> => {
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

router.get("/contracts/alerts", adminOnly, requireTierAccess("district.contract_utilization"), async (req: Request, res: Response): Promise<void> => {
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
