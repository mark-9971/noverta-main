import { db, medicaidClaimsTable, serviceTypesTable, staffTable } from "@workspace/db";
import { eq, and, sql, gte, lte } from "drizzle-orm";

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}

export interface AgingRow {
  ageBucket: string;
  status: string;
  claimCount: number;
  totalBilled: string;
  avgDaysOld: number;
}
export interface AgingBucketTotal {
  ageBucket: string;
  claimCount: number;
  totalBilled: string;
}
export interface AgingData {
  rows: AgingRow[];
  bucketTotals: AgingBucketTotal[];
}

export interface DenialsByReason {
  reason: string;
  claimCount: number;
  totalBilled: string;
}
export interface DenialsByService {
  serviceTypeName: string | null;
  claimCount: number;
  totalBilled: string;
}
export interface DenialsTotals {
  totalClaims: number;
  rejectedClaims: number;
  totalRejectedAmount: string;
}
export interface DenialsData {
  byReason: DenialsByReason[];
  byService: DenialsByService[];
  totals: DenialsTotals;
}

export interface ProviderRow {
  staffId: number;
  staffFirst: string | null;
  staffLast: string | null;
  staffName: string;
  providerNpi: string | null;
  totalClaims: number;
  pendingClaims: number;
  approvedClaims: number;
  rejectedClaims: number;
  exportedClaims: number;
  approvalRate: number;
  totalBilled: string;
  approvedBilled: string;
  totalUnits: number;
}
export interface ProductivityData {
  providers: ProviderRow[];
}

export interface TrendPeriod {
  period: string;
  label: string;
  totalClaims: number;
  totalBilled: string;
  approvedBilled: string;
  pendingBilled?: string;
  rejectedBilled: string;
  exportedBilled: string;
  prevPeriodBilled: string | null;
  changePercent: number | null;
}
export interface RevenueTrendData {
  _view?: string;
  monthly: TrendPeriod[];
  quarterly: TrendPeriod[];
}

export async function computeAgingReport(districtId: number, filters: ReportFilters = {}): Promise<AgingData> {
  const { dateFrom, dateTo, status } = filters;
  const conditions = [
    eq(medicaidClaimsTable.districtId, districtId),
    sql`${medicaidClaimsTable.status} != 'void'`,
  ];
  if (dateFrom) conditions.push(gte(medicaidClaimsTable.serviceDate, dateFrom));
  if (dateTo) conditions.push(lte(medicaidClaimsTable.serviceDate, dateTo));
  if (status) conditions.push(eq(medicaidClaimsTable.status, status));

  const rows = await db
    .select({
      ageBucket: sql<string>`
        case
          when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 30 then '0-30'
          when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 60 then '31-60'
          when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 90 then '61-90'
          else '90+'
        end
      `,
      status: medicaidClaimsTable.status,
      claimCount: sql<number>`count(*)::int`,
      totalBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric), 0)::text`,
      avgDaysOld: sql<number>`avg(current_date - ${medicaidClaimsTable.createdAt}::date)::int`,
    })
    .from(medicaidClaimsTable)
    .where(and(...conditions))
    .groupBy(
      sql`case
        when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 30 then '0-30'
        when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 60 then '31-60'
        when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 90 then '61-90'
        else '90+'
      end`,
      medicaidClaimsTable.status,
    )
    .orderBy(
      sql`case
        when (case
          when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 30 then '0-30'
          when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 60 then '31-60'
          when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 90 then '61-90'
          else '90+'
        end) = '0-30' then 1
        when (case
          when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 30 then '0-30'
          when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 60 then '31-60'
          when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 90 then '61-90'
          else '90+'
        end) = '31-60' then 2
        when (case
          when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 30 then '0-30'
          when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 60 then '31-60'
          when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 90 then '61-90'
          else '90+'
        end) = '61-90' then 3
        else 4
      end`,
    );

  const bucketTotals = await db
    .select({
      ageBucket: sql<string>`
        case
          when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 30 then '0-30'
          when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 60 then '31-60'
          when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 90 then '61-90'
          else '90+'
        end
      `,
      claimCount: sql<number>`count(*)::int`,
      totalBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric), 0)::text`,
    })
    .from(medicaidClaimsTable)
    .where(and(...conditions))
    .groupBy(
      sql`case
        when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 30 then '0-30'
        when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 60 then '31-60'
        when (current_date - ${medicaidClaimsTable.createdAt}::date) <= 90 then '61-90'
        else '90+'
      end`,
    );

  return { rows, bucketTotals };
}

export async function computeDenialsReport(districtId: number, filters: ReportFilters = {}): Promise<DenialsData> {
  const { dateFrom, dateTo } = filters;
  const conditions = [
    eq(medicaidClaimsTable.districtId, districtId),
    eq(medicaidClaimsTable.status, "rejected"),
  ];
  if (dateFrom) conditions.push(gte(medicaidClaimsTable.serviceDate, dateFrom));
  if (dateTo) conditions.push(lte(medicaidClaimsTable.serviceDate, dateTo));

  const byReason = await db
    .select({
      reason: sql<string>`coalesce(nullif(trim(${medicaidClaimsTable.rejectionReason}), ''), 'No reason provided')`,
      claimCount: sql<number>`count(*)::int`,
      totalBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric), 0)::text`,
    })
    .from(medicaidClaimsTable)
    .where(and(...conditions))
    .groupBy(sql`coalesce(nullif(trim(${medicaidClaimsTable.rejectionReason}), ''), 'No reason provided')`)
    .orderBy(sql`count(*) desc`);

  const byService = await db
    .select({
      serviceTypeName: serviceTypesTable.name,
      claimCount: sql<number>`count(*)::int`,
      totalBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric), 0)::text`,
    })
    .from(medicaidClaimsTable)
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, medicaidClaimsTable.serviceTypeId))
    .where(and(...conditions))
    .groupBy(serviceTypesTable.name)
    .orderBy(sql`count(*) desc`);

  const allConditions = [
    eq(medicaidClaimsTable.districtId, districtId),
    sql`${medicaidClaimsTable.status} != 'void'`,
  ];
  if (dateFrom) allConditions.push(gte(medicaidClaimsTable.serviceDate, dateFrom));
  if (dateTo) allConditions.push(lte(medicaidClaimsTable.serviceDate, dateTo));

  const [totals] = await db
    .select({
      totalClaims: sql<number>`count(*)::int`,
      rejectedClaims: sql<number>`count(*) filter (where ${medicaidClaimsTable.status} = 'rejected')::int`,
      totalRejectedAmount: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} = 'rejected'), 0)::text`,
    })
    .from(medicaidClaimsTable)
    .where(and(...allConditions));

  return {
    byReason,
    byService,
    totals: totals ?? { totalClaims: 0, rejectedClaims: 0, totalRejectedAmount: "0" },
  };
}

export async function computeProviderProductivityReport(districtId: number, filters: ReportFilters = {}): Promise<ProductivityData> {
  const { dateFrom, dateTo } = filters;
  const conditions = [
    eq(medicaidClaimsTable.districtId, districtId),
    sql`${medicaidClaimsTable.status} != 'void'`,
  ];
  if (dateFrom) conditions.push(gte(medicaidClaimsTable.serviceDate, dateFrom));
  if (dateTo) conditions.push(lte(medicaidClaimsTable.serviceDate, dateTo));

  const providers = await db
    .select({
      staffId: medicaidClaimsTable.staffId,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
      providerNpi: medicaidClaimsTable.providerNpi,
      totalClaims: sql<number>`count(*)::int`,
      pendingClaims: sql<number>`count(*) filter (where ${medicaidClaimsTable.status} = 'pending')::int`,
      approvedClaims: sql<number>`count(*) filter (where ${medicaidClaimsTable.status} IN ('approved', 'exported'))::int`,
      rejectedClaims: sql<number>`count(*) filter (where ${medicaidClaimsTable.status} = 'rejected')::int`,
      exportedClaims: sql<number>`count(*) filter (where ${medicaidClaimsTable.status} = 'exported')::int`,
      totalBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric), 0)::text`,
      approvedBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} IN ('approved', 'exported')), 0)::text`,
      totalUnits: sql<number>`coalesce(sum(${medicaidClaimsTable.units}), 0)::int`,
    })
    .from(medicaidClaimsTable)
    .leftJoin(staffTable, eq(staffTable.id, medicaidClaimsTable.staffId))
    .where(and(...conditions))
    .groupBy(medicaidClaimsTable.staffId, staffTable.firstName, staffTable.lastName, medicaidClaimsTable.providerNpi)
    .orderBy(sql`sum(${medicaidClaimsTable.billedAmount}::numeric) desc`);

  const result: ProviderRow[] = providers.map(p => ({
    ...p,
    staffName: p.staffFirst ? `${p.staffFirst} ${p.staffLast}` : `Provider #${p.staffId}`,
    approvalRate: p.totalClaims > 0
      ? Math.round((p.approvedClaims / p.totalClaims) * 100)
      : 0,
  }));

  return { providers: result };
}

export async function computeRevenueTrendReport(districtId: number, filters: ReportFilters = {}): Promise<RevenueTrendData> {
  const { dateFrom, dateTo } = filters;
  const conditions = [
    eq(medicaidClaimsTable.districtId, districtId),
    sql`${medicaidClaimsTable.status} != 'void'`,
  ];
  if (dateFrom) conditions.push(gte(medicaidClaimsTable.serviceDate, dateFrom));
  if (dateTo) conditions.push(lte(medicaidClaimsTable.serviceDate, dateTo));

  const monthly = await db
    .select({
      period: sql<string>`to_char(${medicaidClaimsTable.serviceDate}::date, 'YYYY-MM')`,
      label: sql<string>`to_char(${medicaidClaimsTable.serviceDate}::date, 'Mon YYYY')`,
      totalClaims: sql<number>`count(*)::int`,
      totalBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric), 0)::text`,
      approvedBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} IN ('approved', 'exported')), 0)::text`,
      pendingBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} = 'pending'), 0)::text`,
      rejectedBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} = 'rejected'), 0)::text`,
      exportedBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} = 'exported'), 0)::text`,
    })
    .from(medicaidClaimsTable)
    .where(and(...conditions))
    .groupBy(
      sql`to_char(${medicaidClaimsTable.serviceDate}::date, 'YYYY-MM')`,
      sql`to_char(${medicaidClaimsTable.serviceDate}::date, 'Mon YYYY')`,
    )
    .orderBy(sql`to_char(${medicaidClaimsTable.serviceDate}::date, 'YYYY-MM')`);

  const quarterly = await db
    .select({
      period: sql<string>`to_char(${medicaidClaimsTable.serviceDate}::date, 'YYYY') || '-Q' || to_char(${medicaidClaimsTable.serviceDate}::date, 'Q')`,
      label: sql<string>`'Q' || to_char(${medicaidClaimsTable.serviceDate}::date, 'Q') || ' ' || to_char(${medicaidClaimsTable.serviceDate}::date, 'YYYY')`,
      totalClaims: sql<number>`count(*)::int`,
      totalBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric), 0)::text`,
      approvedBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} IN ('approved', 'exported')), 0)::text`,
      rejectedBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} = 'rejected'), 0)::text`,
      exportedBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} = 'exported'), 0)::text`,
    })
    .from(medicaidClaimsTable)
    .where(and(...conditions))
    .groupBy(
      sql`to_char(${medicaidClaimsTable.serviceDate}::date, 'YYYY') || '-Q' || to_char(${medicaidClaimsTable.serviceDate}::date, 'Q')`,
      sql`'Q' || to_char(${medicaidClaimsTable.serviceDate}::date, 'Q') || ' ' || to_char(${medicaidClaimsTable.serviceDate}::date, 'YYYY')`,
    )
    .orderBy(
      sql`to_char(${medicaidClaimsTable.serviceDate}::date, 'YYYY') || '-Q' || to_char(${medicaidClaimsTable.serviceDate}::date, 'Q')`,
    );

  const monthlyWithChange: TrendPeriod[] = monthly.map((m, i) => {
    const prev = monthly[i - 1];
    const curr = parseFloat(m.totalBilled);
    const prevVal = prev ? parseFloat(prev.totalBilled) : null;
    const change = prevVal !== null && prevVal > 0 ? Math.round(((curr - prevVal) / prevVal) * 100) : null;
    return { ...m, prevPeriodBilled: prev?.totalBilled ?? null, changePercent: change };
  });

  const quarterlyWithChange: TrendPeriod[] = quarterly.map((q, i) => {
    const prev = quarterly[i - 1];
    const curr = parseFloat(q.totalBilled);
    const prevVal = prev ? parseFloat(prev.totalBilled) : null;
    const change = prevVal !== null && prevVal > 0 ? Math.round(((curr - prevVal) / prevVal) * 100) : null;
    return { ...q, prevPeriodBilled: prev?.totalBilled ?? null, changePercent: change };
  });

  return { monthly: monthlyWithChange, quarterly: quarterlyWithChange };
}
