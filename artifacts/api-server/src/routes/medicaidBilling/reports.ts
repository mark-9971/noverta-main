import { Router, type IRouter } from "express";
import { db, medicaidClaimsTable, serviceTypesTable, staffTable, medicaidReportSnapshotsTable } from "@workspace/db";
import { eq, and, sql, gte, lte, desc } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { getDistrictId } from "./shared";

// tenant-scope: district-join
const router: IRouter = Router();

// ─── Snapshot types ───────────────────────────────────────────────────────────

type ReportType = "aging" | "denials" | "provider-productivity" | "revenue-trend";

const VALID_REPORT_TYPES: ReadonlySet<string> = new Set<ReportType>([
  "aging",
  "denials",
  "provider-productivity",
  "revenue-trend",
]);

function isValidReportType(v: string): v is ReportType {
  return VALID_REPORT_TYPES.has(v);
}

// Report data shapes (must match the query response structures below)
interface AgingRow {
  ageBucket: string;
  status: string;
  claimCount: number;
  totalBilled: string;
  avgDaysOld: number;
}
interface AgingBucketTotal {
  ageBucket: string;
  claimCount: number;
  totalBilled: string;
}
interface AgingData {
  rows: AgingRow[];
  bucketTotals: AgingBucketTotal[];
}

interface DenialsByReason {
  reason: string;
  claimCount: number;
  totalBilled: string;
}
interface DenialsByService {
  serviceTypeName: string | null;
  claimCount: number;
  totalBilled: string;
}
interface DenialsTotals {
  totalClaims: number;
  rejectedClaims: number;
  totalRejectedAmount: string;
}
interface DenialsData {
  byReason: DenialsByReason[];
  byService: DenialsByService[];
  totals: DenialsTotals;
}

interface ProviderRow {
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
interface ProductivityData {
  providers: ProviderRow[];
}

interface TrendPeriod {
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
interface RevenueTrendData {
  /** The active view when the snapshot was saved ("monthly" | "quarterly"). */
  _view?: string;
  monthly: TrendPeriod[];
  quarterly: TrendPeriod[];
}

type ReportData = AgingData | DenialsData | ProductivityData | RevenueTrendData;

// ─── Snapshot data shape validation ──────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

function validateSnapshotData(reportType: ReportType, data: unknown): string | null {
  if (!isRecord(data)) return "data must be an object";
  switch (reportType) {
    case "aging":
      if (!isArray(data.rows)) return "aging data must have rows array";
      if (!isArray(data.bucketTotals)) return "aging data must have bucketTotals array";
      return null;
    case "denials":
      if (!isArray(data.byReason)) return "denials data must have byReason array";
      if (!isArray(data.byService)) return "denials data must have byService array";
      if (!isRecord(data.totals)) return "denials data must have totals object";
      return null;
    case "provider-productivity":
      if (!isArray(data.providers)) return "productivity data must have providers array";
      return null;
    case "revenue-trend":
      if (!isArray(data.monthly)) return "revenue-trend data must have monthly array";
      if (!isArray(data.quarterly)) return "revenue-trend data must have quarterly array";
      return null;
  }
}

// ─── CSV generation helpers ───────────────────────────────────────────────────

function csvEscape(val: string | number | null | undefined): string {
  const s = String(val ?? "");
  if (/^[=+\-@\t\r]/.test(s)) return `"'${s.replace(/"/g, '""')}"`;
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(header: string, rows: (string | number | null | undefined)[][]): string {
  return [header, ...rows.map(r => r.map(csvEscape).join(","))].join("\n");
}

function snapshotToCsv(reportType: ReportType, data: ReportData, view?: string): string {
  if (reportType === "aging") {
    const d = data as AgingData;
    const BUCKET_ORDER = ["0-30", "31-60", "61-90", "90+"];
    const grouped: Record<string, Record<string, AgingRow>> = {};
    for (const row of d.rows) {
      if (!grouped[row.ageBucket]) grouped[row.ageBucket] = {};
      grouped[row.ageBucket][row.status] = row;
    }
    const out: (string | number | null)[][] = [];
    for (const b of BUCKET_ORDER) {
      for (const status of ["pending", "approved", "rejected", "exported"]) {
        const cell = grouped[b]?.[status];
        if (cell) out.push([b, status, cell.claimCount, cell.totalBilled, cell.avgDaysOld]);
      }
    }
    return buildCsv("Age Bucket,Status,Claims,Total Billed (est.),Avg Days Old", out);
  }

  if (reportType === "denials") {
    const d = data as DenialsData;
    const out = d.byReason.map(r => [r.reason, r.claimCount, r.totalBilled]);
    return buildCsv("Rejection Reason,Claims,Total Billed (est.)", out);
  }

  if (reportType === "provider-productivity") {
    const d = data as ProductivityData;
    const out = d.providers.map(p => [
      p.staffName, p.providerNpi ?? "", p.totalClaims, p.approvedClaims,
      p.rejectedClaims, p.pendingClaims, p.approvalRate,
      p.totalBilled, p.approvedBilled, p.totalUnits,
    ]);
    return buildCsv(
      "Provider,NPI,Total Claims,Approved Claims,Rejected Claims,Pending Claims,Approval Rate (%),Total Billed (est.),Approved Billed (est.),Total Units",
      out,
    );
  }

  if (reportType === "revenue-trend") {
    const d = data as RevenueTrendData;
    const resolvedView = view ?? d._view ?? "monthly";
    const isMonthly = resolvedView === "monthly";
    const periods = isMonthly ? d.monthly : d.quarterly;
    if (isMonthly) {
      const out = periods.map(p => [
        p.period, p.label, p.totalClaims, p.totalBilled, p.approvedBilled,
        p.pendingBilled ?? "", p.rejectedBilled, p.exportedBilled,
        p.prevPeriodBilled ?? "", p.changePercent !== null ? p.changePercent : "",
      ]);
      return buildCsv(
        "Period,Label,Claims,Total Billed (est.),Approved Billed (est.),Pending Billed,Rejected Billed,Exported Billed,Prev Period Billed,Change %",
        out,
      );
    } else {
      const out = periods.map(p => [
        p.period, p.label, p.totalClaims, p.totalBilled, p.approvedBilled,
        p.rejectedBilled, p.exportedBilled,
        p.prevPeriodBilled ?? "", p.changePercent !== null ? p.changePercent : "",
      ]);
      return buildCsv(
        "Period,Label,Claims,Total Billed (est.),Approved Billed (est.),Rejected Billed,Exported Billed,Prev Period Billed,Change %",
        out,
      );
    }
  }

  return "No data";
}

// ─── Snapshot endpoints ───────────────────────────────────────────────────────

interface SaveSnapshotBody {
  reportType: string;
  dateFrom?: string;
  dateTo?: string;
  label?: string;
  data: ReportData;
}

router.post("/medicaid/reports/snapshots", async (req, res): Promise<void> => {
  const authed = req as unknown as AuthedRequest;
  const districtId = getDistrictId(authed);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const body = req.body as SaveSnapshotBody;
  const { reportType, dateFrom, dateTo, label, data } = body;

  if (!isValidReportType(reportType)) {
    res.status(400).json({ error: "Invalid reportType" });
    return;
  }

  const dataError = validateSnapshotData(reportType, data);
  if (dataError) {
    res.status(400).json({ error: dataError });
    return;
  }

  const [snapshot] = await db
    .insert(medicaidReportSnapshotsTable)
    .values({
      districtId,
      reportType,
      label: label?.trim() || null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      savedByClerkId: authed.userId,
      savedByName: authed.displayName,
      data: data as unknown as Record<string, unknown>,
    })
    .returning();

  res.status(201).json(snapshot);
});

router.get("/medicaid/reports/snapshots", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { reportType } = req.query as Record<string, string>;
  const conditions = [eq(medicaidReportSnapshotsTable.districtId, districtId)];
  if (reportType && isValidReportType(reportType)) {
    conditions.push(eq(medicaidReportSnapshotsTable.reportType, reportType));
  }

  const snapshots = await db
    .select({
      id: medicaidReportSnapshotsTable.id,
      reportType: medicaidReportSnapshotsTable.reportType,
      label: medicaidReportSnapshotsTable.label,
      dateFrom: medicaidReportSnapshotsTable.dateFrom,
      dateTo: medicaidReportSnapshotsTable.dateTo,
      savedByName: medicaidReportSnapshotsTable.savedByName,
      createdAt: medicaidReportSnapshotsTable.createdAt,
    })
    .from(medicaidReportSnapshotsTable)
    .where(and(...conditions))
    .orderBy(desc(medicaidReportSnapshotsTable.createdAt))
    .limit(100);

  res.json({ snapshots });
});

router.get("/medicaid/reports/snapshots/:id/csv", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid snapshot id" });
    return;
  }

  const [snapshot] = await db
    .select()
    .from(medicaidReportSnapshotsTable)
    .where(and(
      eq(medicaidReportSnapshotsTable.id, id),
      eq(medicaidReportSnapshotsTable.districtId, districtId),
    ))
    .limit(1);

  if (!snapshot) {
    res.status(404).json({ error: "Snapshot not found" });
    return;
  }

  if (!isValidReportType(snapshot.reportType)) {
    res.status(422).json({ error: "Unknown report type in stored snapshot" });
    return;
  }

  const { view } = req.query as Record<string, string>;
  const csv = snapshotToCsv(snapshot.reportType, snapshot.data as ReportData, view);

  const period = [snapshot.dateFrom, snapshot.dateTo].filter(Boolean).join("-to-") || "all";
  const filename = `${snapshot.reportType}-snapshot-${snapshot.id}-${period}.csv`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

router.delete("/medicaid/reports/snapshots/:id", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid snapshot id" });
    return;
  }

  const deleted = await db
    .delete(medicaidReportSnapshotsTable)
    .where(and(
      eq(medicaidReportSnapshotsTable.id, id),
      eq(medicaidReportSnapshotsTable.districtId, districtId),
    ))
    .returning({ id: medicaidReportSnapshotsTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Snapshot not found" });
    return;
  }

  res.status(204).send();
});

// ─── Claim aging ──────────────────────────────────────────────────────────────

router.get("/medicaid/reports/aging", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { dateFrom, dateTo, status } = req.query as Record<string, string>;
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

  res.json({ rows, bucketTotals });
});

// ─── Denial / rejection analysis ──────────────────────────────────────────────

router.get("/medicaid/reports/denials", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { dateFrom, dateTo } = req.query as Record<string, string>;
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

  res.json({ byReason, byService, totals: totals || {} });
});

// ─── Provider productivity ────────────────────────────────────────────────────

router.get("/medicaid/reports/provider-productivity", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { dateFrom, dateTo } = req.query as Record<string, string>;
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

  const result = providers.map(p => ({
    ...p,
    staffName: p.staffFirst ? `${p.staffFirst} ${p.staffLast}` : `Provider #${p.staffId}`,
    approvalRate: p.totalClaims > 0
      ? Math.round(((p.approvedClaims) / p.totalClaims) * 100)
      : 0,
  }));

  res.json({ providers: result });
});

// ─── Revenue trend ────────────────────────────────────────────────────────────

router.get("/medicaid/reports/revenue-trend", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { dateFrom, dateTo } = req.query as Record<string, string>;
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
