import type { Request, Response } from "express";
import { db } from "@workspace/db";
import {
  agenciesTable,
  agencyContractsTable,
  agencyStaffTable,
  contractSessionLinksTable,
  staffTable,
  sessionLogsTable,
  districtsTable,
  schoolsTable,
} from "@workspace/db";
import { eq, and, isNull, gte, lte, inArray } from "drizzle-orm";
import { requireMinRole } from "../../middlewares/auth";
import { getPublicMeta } from "../../lib/clerkClaims";

export const adminOnly = requireMinRole("coordinator");

export async function requireDistrictId(req: Request, res: Response): Promise<number | null> {
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

export async function assertAgencyAccess(req: Request, res: Response, agencyId: number): Promise<typeof agenciesTable.$inferSelect | null> {
  const districtId = await requireDistrictId(req, res);
  if (!districtId) return null;

  const [agency] = await db.select()
    .from(agenciesTable)
    .where(and(eq(agenciesTable.id, agencyId), eq(agenciesTable.districtId, districtId)))
    .limit(1);

  return agency || null;
}

export async function reconcileContractSessionLinks(districtId: number): Promise<number> {
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

  const activeContractIds = activeContracts.map(c => c.id);
  if (activeContractIds.length > 0) {
    await db.delete(contractSessionLinksTable)
      .where(inArray(contractSessionLinksTable.contractId, activeContractIds));
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
