import { db } from "@workspace/db";
import {
  studentsTable, schoolsTable, sessionLogsTable, serviceTypesTable,
  serviceRateConfigsTable, agencyContractsTable, agenciesTable, contractSessionLinksTable,
} from "@workspace/db/schema";
import { eq, and, sql, isNull, desc } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { getEnforcedDistrictId } from "../../middlewares/auth";

export type RateSource =
  | "district_rate_config"
  | "agency_contract"
  | "service_default"
  | "unconfigured";

export interface RateInfo {
  rate: number | null;
  source: RateSource;
}

const UNCONFIGURED: RateInfo = { rate: null, source: "unconfigured" };

export interface RateMapEntry {
  serviceTypeId: number;
  serviceTypeName: string;
  inHouse: RateInfo;
  contracted: RateInfo;
}

export type RateMap = Map<number, RateMapEntry>;

export const RATE_CONFIG_HELP = {
  helpUrl: "/compensatory-finance?tab=rates",
  helpText:
    "Set per-service-type rates in Settings → Compensatory Finance → Rates, or assign an active agency contract for the service type.",
};

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
  rateMap: RateMap,
  serviceTypeId: number,
  isContracted: boolean,
): RateInfo {
  const entry = rateMap.get(serviceTypeId);
  if (!entry) return UNCONFIGURED;
  return isContracted ? entry.contracted : entry.inHouse;
}

/**
 * Build the per-service-type rate map for a district, WITHOUT any silent
 * fallback to a hardcoded constant. A service type with no district config,
 * no agency contract, and no service-default rate yields {rate:null,
 * source:"unconfigured"} — callers must surface that as "rate not configured"
 * rather than fabricating a dollar amount.
 */
export async function getRateMap(districtId: number): Promise<RateMap> {
  const configs = await db.select({
    serviceTypeId: serviceRateConfigsTable.serviceTypeId,
    inHouseRate: serviceRateConfigsTable.inHouseRate,
    contractedRate: serviceRateConfigsTable.contractedRate,
    effectiveDate: serviceRateConfigsTable.effectiveDate,
  }).from(serviceRateConfigsTable).where(
    eq(serviceRateConfigsTable.districtId, districtId),
  ).orderBy(desc(serviceRateConfigsTable.effectiveDate));

  const districtConfig = new Map<number, { inHouse: number | null; contracted: number | null }>();
  for (const c of configs) {
    if (districtConfig.has(c.serviceTypeId)) continue;
    districtConfig.set(c.serviceTypeId, {
      inHouse: c.inHouseRate ? parseFloat(c.inHouseRate) : null,
      contracted: c.contractedRate ? parseFloat(c.contractedRate) : null,
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
    name: serviceTypesTable.name,
    defaultBillingRate: serviceTypesTable.defaultBillingRate,
  }).from(serviceTypesTable);

  const rateMap: RateMap = new Map();
  for (const st of serviceTypes) {
    const dc = districtConfig.get(st.id);
    const agencyRate = agencyRateMap.get(st.id) ?? null;
    const serviceDefault = st.defaultBillingRate ? parseFloat(st.defaultBillingRate) : null;

    const inHouse: RateInfo = dc?.inHouse != null
      ? { rate: dc.inHouse, source: "district_rate_config" }
      : serviceDefault != null
        ? { rate: serviceDefault, source: "service_default" }
        : UNCONFIGURED;

    const contracted: RateInfo = dc?.contracted != null
      ? { rate: dc.contracted, source: "district_rate_config" }
      : agencyRate != null
        ? { rate: agencyRate, source: "agency_contract" }
        : serviceDefault != null
          ? { rate: serviceDefault, source: "service_default" }
          : UNCONFIGURED;

    rateMap.set(st.id, { serviceTypeId: st.id, serviceTypeName: st.name, inHouse, contracted });
  }

  return rateMap;
}

/**
 * Convert minutes to dollars using a resolved rate. Returns null when the
 * rate is unconfigured — callers MUST handle null and not silently coerce
 * to 0 in dollar totals.
 */
export function minutesToDollars(minutes: number, rate: RateInfo | number | null): number | null {
  const numericRate =
    rate == null ? null
      : typeof rate === "number" ? rate
        : rate.rate;
  if (numericRate == null) return null;
  return Math.round((minutes / 60) * numericRate * 100) / 100;
}

/**
 * Build a summary of which service types in the district currently have
 * a usable rate vs. are unconfigured. Intended for surfacing a
 * "rate not configured" callout in finance UIs.
 */
export interface RateConfigStatus {
  allConfigured: boolean;
  configuredServiceTypeIds: number[];
  unconfiguredServiceTypes: { id: number; name: string }[];
  helpUrl: string;
  helpText: string;
}

export function summarizeRateConfig(rateMap: RateMap): RateConfigStatus {
  const configuredServiceTypeIds: number[] = [];
  const unconfiguredServiceTypes: { id: number; name: string }[] = [];
  for (const [id, entry] of rateMap.entries()) {
    if (entry.inHouse.rate != null || entry.contracted.rate != null) {
      configuredServiceTypeIds.push(id);
    } else {
      unconfiguredServiceTypes.push({ id, name: entry.serviceTypeName });
    }
  }
  return {
    allConfigured: unconfiguredServiceTypes.length === 0,
    configuredServiceTypeIds,
    unconfiguredServiceTypes,
    helpUrl: RATE_CONFIG_HELP.helpUrl,
    helpText: RATE_CONFIG_HELP.helpText,
  };
}
