import { Router, type IRouter } from "express";
import { db, medicaidClaimsTable, serviceTypesTable, staffTable } from "@workspace/db";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { getDistrictId } from "./shared";

// tenant-scope: district-join
const router: IRouter = Router();

// Claim aging: how long non-void claims have been sitting since creation
// Buckets: 0-30 days, 31-60 days, 61-90 days, 90+ days
router.get("/medicaid/reports/aging", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { dateFrom, dateTo, status } = req.query as Record<string, string>;
  const conditions: any[] = [
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

  // Also compute totals per bucket regardless of status for the summary
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

  res.json({ rows, bucketTotals });
});

// Denial/rejection analysis: breakdown by rejection reason
router.get("/medicaid/reports/denials", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const conditions: any[] = [
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

  // Total rejections vs total for rate calculation
  const allConditions: any[] = [
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

  res.json({ byReason, byService, totals: totals || {} });
});

// Provider productivity: claims generated, approval rate, revenue per provider
router.get("/medicaid/reports/provider-productivity", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const conditions: any[] = [
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

  const result = providers.map(p => ({
    ...p,
    staffName: p.staffFirst ? `${p.staffFirst} ${p.staffLast}` : `Provider #${p.staffId}`,
    approvalRate: p.totalClaims > 0
      ? Math.round(((p.approvedClaims) / p.totalClaims) * 100)
      : 0,
  }));

  res.json({ providers: result });
});

// Revenue trend: monthly and quarterly period-over-period comparison
router.get("/medicaid/reports/revenue-trend", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const conditions: any[] = [
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

  // Compute period-over-period change for monthly
  const monthlyWithChange = monthly.map((m, i) => {
    const prev = monthly[i - 1];
    const curr = parseFloat(m.totalBilled);
    const prevVal = prev ? parseFloat(prev.totalBilled) : null;
    const change = prevVal !== null && prevVal > 0 ? Math.round(((curr - prevVal) / prevVal) * 100) : null;
    return { ...m, prevPeriodBilled: prev?.totalBilled ?? null, changePercent: change };
  });

  const quarterlyWithChange = quarterly.map((q, i) => {
    const prev = quarterly[i - 1];
    const curr = parseFloat(q.totalBilled);
    const prevVal = prev ? parseFloat(prev.totalBilled) : null;
    const change = prevVal !== null && prevVal > 0 ? Math.round(((curr - prevVal) / prevVal) * 100) : null;
    return { ...q, prevPeriodBilled: prev?.totalBilled ?? null, changePercent: change };
  });

  res.json({ monthly: monthlyWithChange, quarterly: quarterlyWithChange });
});

export default router;
