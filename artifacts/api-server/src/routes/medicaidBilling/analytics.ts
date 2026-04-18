import { Router, type IRouter } from "express";
import { db, medicaidClaimsTable, sessionLogsTable, serviceTypesTable, studentsTable, schoolsTable } from "@workspace/db";
import { eq, and, sql, isNull, gte, lte } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { getDistrictId } from "./shared";

// tenant-scope: district-join
const router: IRouter = Router();

router.get("/medicaid/revenue-summary", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const conditions: any[] = [eq(medicaidClaimsTable.districtId, districtId)];
  if (dateFrom) conditions.push(gte(medicaidClaimsTable.serviceDate, dateFrom));
  if (dateTo) conditions.push(lte(medicaidClaimsTable.serviceDate, dateTo));

  const [summary] = await db
    .select({
      totalClaims: sql<number>`count(*)::int`,
      totalBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric), 0)::text`,
      pendingCount: sql<number>`count(*) filter (where ${medicaidClaimsTable.status} = 'pending')::int`,
      pendingAmount: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} = 'pending'), 0)::text`,
      approvedCount: sql<number>`count(*) filter (where ${medicaidClaimsTable.status} = 'approved')::int`,
      approvedAmount: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} = 'approved'), 0)::text`,
      exportedCount: sql<number>`count(*) filter (where ${medicaidClaimsTable.status} = 'exported')::int`,
      exportedAmount: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} = 'exported'), 0)::text`,
      rejectedCount: sql<number>`count(*) filter (where ${medicaidClaimsTable.status} = 'rejected')::int`,
      rejectedAmount: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} = 'rejected'), 0)::text`,
      voidCount: sql<number>`count(*) filter (where ${medicaidClaimsTable.status} = 'void')::int`,
    })
    .from(medicaidClaimsTable)
    .where(and(...conditions));

  const byService = await db
    .select({
      serviceTypeId: medicaidClaimsTable.serviceTypeId,
      serviceTypeName: serviceTypesTable.name,
      claimCount: sql<number>`count(*)::int`,
      totalBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric), 0)::text`,
      approvedAmount: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} IN ('approved', 'exported')), 0)::text`,
    })
    .from(medicaidClaimsTable)
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, medicaidClaimsTable.serviceTypeId))
    .where(and(...conditions))
    .groupBy(medicaidClaimsTable.serviceTypeId, serviceTypesTable.name)
    .orderBy(sql`sum(${medicaidClaimsTable.billedAmount}::numeric) desc`);

  const byMonth = await db
    .select({
      month: sql<string>`to_char(${medicaidClaimsTable.serviceDate}::date, 'YYYY-MM')`,
      claimCount: sql<number>`count(*)::int`,
      totalBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric), 0)::text`,
      approvedAmount: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} IN ('approved', 'exported')), 0)::text`,
    })
    .from(medicaidClaimsTable)
    .where(and(...conditions))
    .groupBy(sql`to_char(${medicaidClaimsTable.serviceDate}::date, 'YYYY-MM')`)
    .orderBy(sql`to_char(${medicaidClaimsTable.serviceDate}::date, 'YYYY-MM')`);

  const missingDataCounts = await db
    .select({
      missingMedicaidId: sql<number>`count(distinct ${medicaidClaimsTable.studentId}) filter (where ${medicaidClaimsTable.studentMedicaidId} IS NULL or ${medicaidClaimsTable.studentMedicaidId} = '')::int`,
      missingNpi: sql<number>`count(distinct ${medicaidClaimsTable.staffId}) filter (where ${medicaidClaimsTable.providerNpi} IS NULL or ${medicaidClaimsTable.providerNpi} = '')::int`,
    })
    .from(medicaidClaimsTable)
    .where(and(
      eq(medicaidClaimsTable.districtId, districtId),
      sql`${medicaidClaimsTable.status} != 'void'`,
    ));

  res.json({
    summary: summary || {},
    byService,
    byMonth,
    dataQuality: missingDataCounts[0] || { missingMedicaidId: 0, missingNpi: 0 },
  });
});

router.get("/medicaid/billable-sessions-preview", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { dateFrom, dateTo } = req.query as Record<string, string>;
  if (!dateFrom || !dateTo) {
    res.status(400).json({ error: "dateFrom and dateTo are required" });
    return;
  }

  const [preview] = await db
    .select({
      totalSessions: sql<number>`count(*)::int`,
      totalMinutes: sql<number>`coalesce(sum(${sessionLogsTable.durationMinutes}), 0)::int`,
      withServiceType: sql<number>`count(*) filter (where ${sessionLogsTable.serviceTypeId} IS NOT NULL)::int`,
      withStaff: sql<number>`count(*) filter (where ${sessionLogsTable.staffId} IS NOT NULL)::int`,
    })
    .from(sessionLogsTable)
    .innerJoin(studentsTable, eq(studentsTable.id, sessionLogsTable.studentId))
    .innerJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
    .where(and(
      eq(schoolsTable.districtId, districtId),
      isNull(sessionLogsTable.deletedAt),
      gte(sessionLogsTable.sessionDate, dateFrom),
      lte(sessionLogsTable.sessionDate, dateTo),
      sql`${sessionLogsTable.status} IN ('completed', 'makeup')`,
    ));

  const existingClaimCount = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(medicaidClaimsTable)
    .where(and(
      eq(medicaidClaimsTable.districtId, districtId),
      gte(medicaidClaimsTable.serviceDate, dateFrom),
      lte(medicaidClaimsTable.serviceDate, dateTo),
      sql`${medicaidClaimsTable.status} != 'void'`,
    ));

  res.json({
    ...preview,
    existingClaims: existingClaimCount[0]?.cnt ?? 0,
  });
});

export default router;
