import { db } from "@workspace/db";
import {
  studentsTable, schoolsTable, sessionLogsTable, serviceTypesTable,
  serviceRateConfigsTable, agencyContractsTable, agenciesTable, contractSessionLinksTable,
} from "@workspace/db/schema";
import { eq, and, sql, isNull, desc } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { getEnforcedDistrictId } from "../../middlewares/auth";

export const DEFAULT_HOURLY_RATE = 75;

export function getDistrictId(req: AuthedRequest): number | null {
  return getEnforcedDistrictId(req);
}

export async function getContractedProviderIds(districtId: number): Promise<Set<number>> {
  const contractedLinks = await db.selectDistinct({
    providerId: sessionLogsTable.staffId,
  }).from(contractSessionLinksTable)
    .innerJoin(sessionLogsTable, eq(contractSessionLinksTable.sessionLogId, sessionLogsTable.id))
    .innerJoin(studentsTable, eq(sessionLogsTable.studentId, studentsTable.id))
    .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .where(and(
      eq(schoolsTable.districtId, districtId),
      sql`${sessionLogsTable.staffId} IS NOT NULL`,
    ));
  return new Set(contractedLinks.map(c => c.providerId!));
}

export function resolveRate(
  rateMap: Map<number, { inHouse: number; contracted: number }>,
  serviceTypeId: number,
  isContracted: boolean,
): number {
  const rates = rateMap.get(serviceTypeId) || { inHouse: DEFAULT_HOURLY_RATE, contracted: DEFAULT_HOURLY_RATE };
  return isContracted ? rates.contracted : rates.inHouse;
}

export async function getRateMap(districtId: number): Promise<Map<number, { inHouse: number; contracted: number }>> {
  const configs = await db.select({
    serviceTypeId: serviceRateConfigsTable.serviceTypeId,
    inHouseRate: serviceRateConfigsTable.inHouseRate,
    contractedRate: serviceRateConfigsTable.contractedRate,
    effectiveDate: serviceRateConfigsTable.effectiveDate,
  }).from(serviceRateConfigsTable).where(
    eq(serviceRateConfigsTable.districtId, districtId),
  ).orderBy(desc(serviceRateConfigsTable.effectiveDate));

  const rateMap = new Map<number, { inHouse: number; contracted: number }>();
  for (const c of configs) {
    if (rateMap.has(c.serviceTypeId)) continue;
    rateMap.set(c.serviceTypeId, {
      inHouse: c.inHouseRate ? parseFloat(c.inHouseRate) : DEFAULT_HOURLY_RATE,
      contracted: c.contractedRate ? parseFloat(c.contractedRate) : DEFAULT_HOURLY_RATE,
    });
  }

  const agencyContracts = await db.select({
    serviceTypeId: agencyContractsTable.serviceTypeId,
    hourlyRate: agencyContractsTable.hourlyRate,
  }).from(agencyContractsTable)
    .innerJoin(agenciesTable, eq(agencyContractsTable.agencyId, agenciesTable.id))
    .where(and(
      eq(agenciesTable.districtId, districtId),
      eq(agencyContractsTable.status, "active"),
      isNull(agencyContractsTable.deletedAt),
    )).orderBy(desc(agencyContractsTable.startDate));

  const agencyRateMap = new Map<number, number>();
  for (const ac of agencyContracts) {
    if (!agencyRateMap.has(ac.serviceTypeId) && ac.hourlyRate) {
      agencyRateMap.set(ac.serviceTypeId, parseFloat(ac.hourlyRate));
    }
  }

  const serviceTypes = await db.select({
    id: serviceTypesTable.id,
    defaultBillingRate: serviceTypesTable.defaultBillingRate,
  }).from(serviceTypesTable);

  for (const st of serviceTypes) {
    if (!rateMap.has(st.id)) {
      const agencyRate = agencyRateMap.get(st.id);
      const defaultRate = st.defaultBillingRate ? parseFloat(st.defaultBillingRate) : DEFAULT_HOURLY_RATE;
      rateMap.set(st.id, {
        inHouse: defaultRate,
        contracted: agencyRate || defaultRate,
      });
    }
  }

  return rateMap;
}

export function minutesToDollars(minutes: number, hourlyRate: number): number {
  return Math.round((minutes / 60) * hourlyRate * 100) / 100;
}
