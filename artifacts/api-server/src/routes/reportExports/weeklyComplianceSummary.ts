import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, schoolsTable, sessionLogsTable,
  staffTable, compensatoryObligationsTable, districtsTable,
} from "@workspace/db/schema";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import { computeAllActiveMinuteProgress } from "../../lib/minuteCalc";
import { getRateMap, DEFAULT_HOURLY_RATE } from "../compensatoryFinance/shared";
import { logAudit } from "../../lib/auditLog";
import { buildCSV, recordExport } from "./utils";

const router = Router();

function minutesToDollars(minutes: number, hourlyRate: number): number {
  return Math.round((minutes / 60) * hourlyRate * 100) / 100;
}

function riskLabel(status: string): string {
  switch (status) {
    case "out_of_compliance": return "Out of Compliance";
    case "at_risk": return "At Risk";
    case "slightly_behind": return "Slightly Behind";
    case "on_track": return "On Track";
    case "completed": return "Completed";
    default: return status;
  }
}

function getWeekRange(weeksAgo: number): { start: string; end: string; label: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday - weeksAgo * 7);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const short = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return { start: fmt(monday), end: fmt(sunday), label: `${short(monday)} – ${short(sunday)}` };
}

router.get("/reports/weekly-compliance-summary", async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = getEnforcedDistrictId(req as AuthedRequest);
    if (!districtId) {
      res.status(403).json({ error: "District context required" });
      return;
    }

    const rawSchoolId = req.query.schoolId ? Number(req.query.schoolId) : undefined;
    if (rawSchoolId !== undefined && (!Number.isInteger(rawSchoolId) || rawSchoolId <= 0)) {
      res.status(400).json({ error: "Invalid schoolId parameter" });
      return;
    }
    const schoolId = rawSchoolId;

    const currentWeek = getWeekRange(0);
    const weekRanges = Array.from({ length: 8 }, (_, i) => getWeekRange(i)).reverse();

    const [districtRows, progress, rateMap] = await Promise.all([
      db.select({ name: districtsTable.name }).from(districtsTable).where(eq(districtsTable.id, districtId)),
      computeAllActiveMinuteProgress({ districtId, schoolId }),
      getRateMap(districtId),
    ]);

    const districtName = districtRows[0]?.name ?? "District";

    const studentIds = [...new Set(progress.map(p => p.studentId))];
    const schoolMap = new Map<number, { schoolName: string; grade: string }>();
    if (studentIds.length > 0) {
      const studentSchools = await db.select({
        studentId: studentsTable.id,
        schoolName: schoolsTable.name,
        grade: studentsTable.grade,
      }).from(studentsTable)
        .innerJoin(schoolsTable, and(eq(schoolsTable.id, studentsTable.schoolId), eq(schoolsTable.districtId, districtId)))
        .where(sql`${studentsTable.id} IN (${sql.join(studentIds.map(id => sql`${id}`), sql`, `)})`);
      for (const s of studentSchools) {
        schoolMap.set(s.studentId, { schoolName: s.schoolName ?? "", grade: s.grade ?? "" });
      }
    }

    let totalRequired = 0;
    let totalDelivered = 0;
    let totalExposure = 0;
    const uniqueStudents = new Set<number>();

    const studentShortfalls: {
      studentId: number;
      studentName: string;
      school: string;
      service: string;
      requiredMinutes: number;
      deliveredMinutes: number;
      shortfallMinutes: number;
      percentComplete: number;
      riskStatus: string;
      riskLabel: string;
      providerName: string;
      estimatedExposure: number;
    }[] = [];

    const providerMap = new Map<string, {
      providerName: string;
      studentsServed: Set<number>;
      totalDelivered: number;
      totalRequired: number;
      totalShortfall: number;
    }>();

    for (const p of progress) {
      const info = schoolMap.get(p.studentId);
      const shortfall = Math.max(0, p.requiredMinutes - p.deliveredMinutes);
      const rates = rateMap.get(p.serviceTypeId);
      const hourlyRate = rates?.inHouse ?? DEFAULT_HOURLY_RATE;
      const exposure = shortfall > 0 ? minutesToDollars(shortfall, hourlyRate) : 0;

      totalRequired += p.requiredMinutes;
      totalDelivered += p.deliveredMinutes;
      totalExposure += exposure;
      uniqueStudents.add(p.studentId);

      if (shortfall > 0) {
        studentShortfalls.push({
          studentId: p.studentId,
          studentName: p.studentName,
          school: info?.schoolName ?? "",
          service: p.serviceTypeName,
          requiredMinutes: p.requiredMinutes,
          deliveredMinutes: p.deliveredMinutes,
          shortfallMinutes: shortfall,
          percentComplete: p.percentComplete,
          riskStatus: p.riskStatus,
          riskLabel: riskLabel(p.riskStatus),
          providerName: p.providerName ?? "Unassigned",
          estimatedExposure: exposure,
        });
      }

      const provKey = p.providerName ?? "Unassigned";
      if (!providerMap.has(provKey)) {
        providerMap.set(provKey, { providerName: provKey, studentsServed: new Set(), totalDelivered: 0, totalRequired: 0, totalShortfall: 0 });
      }
      const prov = providerMap.get(provKey)!;
      prov.studentsServed.add(p.studentId);
      prov.totalDelivered += p.deliveredMinutes;
      prov.totalRequired += p.requiredMinutes;
      prov.totalShortfall += shortfall;
    }

    studentShortfalls.sort((a, b) => b.shortfallMinutes - a.shortfallMinutes);

    const providerSummary = Array.from(providerMap.values())
      .map(p => ({
        providerName: p.providerName,
        studentsServed: p.studentsServed.size,
        totalDelivered: p.totalDelivered,
        totalRequired: p.totalRequired,
        totalShortfall: p.totalShortfall,
        complianceRate: p.totalRequired > 0 ? Math.round((p.totalDelivered / p.totalRequired) * 1000) / 10 : 100,
      }))
      .sort((a, b) => a.complianceRate - b.complianceRate);

    const totalShortfall = Math.max(0, totalRequired - totalDelivered);
    const overallComplianceRate = totalRequired > 0 ? Math.round((totalDelivered / totalRequired) * 1000) / 10 : 100;

    const riskCounts = { out_of_compliance: 0, at_risk: 0, slightly_behind: 0, on_track: 0 };
    const studentRisk = new Map<number, string>();
    for (const p of progress) {
      const current = studentRisk.get(p.studentId);
      const order = ["out_of_compliance", "at_risk", "slightly_behind", "on_track", "completed"];
      if (!current || order.indexOf(p.riskStatus) < order.indexOf(current)) {
        studentRisk.set(p.studentId, p.riskStatus);
      }
    }
    for (const [, status] of studentRisk) {
      if (status in riskCounts) riskCounts[status as keyof typeof riskCounts]++;
    }

    const eightWeeksAgo = weekRanges[0].start;
    const schoolJoinCondition = schoolId
      ? and(
          eq(studentsTable.schoolId, schoolsTable.id),
          eq(schoolsTable.districtId, districtId),
          eq(schoolsTable.id, schoolId),
        )
      : and(
          eq(studentsTable.schoolId, schoolsTable.id),
          eq(schoolsTable.districtId, districtId),
        );

    const weeklySessionData = await db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${sessionLogsTable.sessionDate}::date), 'YYYY-MM-DD')`.as("week"),
        deliveredMinutes: sql<number>`coalesce(sum(case when ${sessionLogsTable.status} = 'completed' then ${sessionLogsTable.durationMinutes} else 0 end), 0)`,
        completedSessions: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'completed')`,
        missedSessions: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'missed')`,
        cancelledSessions: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'cancelled')`,
      })
      .from(sessionLogsTable)
      .innerJoin(studentsTable, eq(sessionLogsTable.studentId, studentsTable.id))
      .innerJoin(schoolsTable, schoolJoinCondition!)
      .where(gte(sessionLogsTable.sessionDate, eightWeeksAgo))
      .groupBy(sql`date_trunc('week', ${sessionLogsTable.sessionDate}::date)`)
      .orderBy(sql`date_trunc('week', ${sessionLogsTable.sessionDate}::date)`);

    const weeklyMap = new Map(weeklySessionData.map(w => [w.week, w]));
    const weeklyTrend = weekRanges.map(wr => {
      const data = weeklyMap.get(wr.start);
      return {
        weekLabel: wr.label,
        weekStart: wr.start,
        deliveredMinutes: Number(data?.deliveredMinutes ?? 0),
        completedSessions: Number(data?.completedSessions ?? 0),
        missedSessions: Number(data?.missedSessions ?? 0),
        cancelledSessions: Number(data?.cancelledSessions ?? 0),
      };
    });

    const currentWeekProviders = await db
      .select({
        staffId: staffTable.id,
        providerName: sql<string>`${staffTable.firstName} || ' ' || ${staffTable.lastName}`,
        role: staffTable.role,
        completedSessions: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'completed')`,
        missedSessions: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'missed')`,
        deliveredMinutes: sql<number>`coalesce(sum(case when ${sessionLogsTable.status} = 'completed' then ${sessionLogsTable.durationMinutes} else 0 end), 0)`,
      })
      .from(sessionLogsTable)
      .innerJoin(staffTable, eq(sessionLogsTable.staffId, staffTable.id))
      .innerJoin(studentsTable, eq(sessionLogsTable.studentId, studentsTable.id))
      .innerJoin(schoolsTable, schoolJoinCondition!)
      .where(and(
        gte(sessionLogsTable.sessionDate, currentWeek.start),
        lte(sessionLogsTable.sessionDate, currentWeek.end),
      ))
      .groupBy(staffTable.id, staffTable.firstName, staffTable.lastName, staffTable.role)
      .orderBy(sql`count(*) filter (where ${sessionLogsTable.status} = 'missed') desc`);

    const providersWithMissed = currentWeekProviders
      .filter(p => Number(p.missedSessions) > 0)
      .map(p => ({
        providerName: p.providerName,
        role: p.role ?? "",
        completedSessions: Number(p.completedSessions),
        missedSessions: Number(p.missedSessions),
        deliveredMinutes: Number(p.deliveredMinutes),
      }));

    const urgentFlags: string[] = [];
    if (riskCounts.out_of_compliance > 0) {
      urgentFlags.push(`${riskCounts.out_of_compliance} student${riskCounts.out_of_compliance > 1 ? "s" : ""} out of compliance — review compensatory obligations`);
    }
    if (riskCounts.at_risk > 0) {
      urgentFlags.push(`${riskCounts.at_risk} student${riskCounts.at_risk > 1 ? "s" : ""} at risk of non-compliance — schedule make-up sessions`);
    }
    if (providersWithMissed.length > 0) {
      const totalMissed = providersWithMissed.reduce((s, p) => s + p.missedSessions, 0);
      urgentFlags.push(`${totalMissed} missed session${totalMissed > 1 ? "s" : ""} this week across ${providersWithMissed.length} provider${providersWithMissed.length > 1 ? "s" : ""}`);
    }
    if (totalExposure > 5000) {
      urgentFlags.push(`Estimated compensatory exposure exceeds $${Math.round(totalExposure / 1000)}K — review with legal/finance`);
    }
    const recentTrend = weeklyTrend.slice(-4);
    if (recentTrend.length >= 3) {
      const decreasing = recentTrend.every((w, i) => i === 0 || w.deliveredMinutes <= recentTrend[i - 1].deliveredMinutes);
      if (decreasing && recentTrend[0].deliveredMinutes > 0) {
        urgentFlags.push("Delivered minutes declining for 3+ consecutive weeks — investigate staffing/scheduling");
      }
    }

    const compObligationConditions = [
      eq(compensatoryObligationsTable.status, "pending"),
      eq(schoolsTable.districtId, districtId),
    ];
    if (schoolId) compObligationConditions.push(eq(schoolsTable.id, schoolId) as any);

    const outstandingObligations = await db.select({
      minutesOwed: compensatoryObligationsTable.minutesOwed,
      minutesDelivered: compensatoryObligationsTable.minutesDelivered,
    }).from(compensatoryObligationsTable)
      .innerJoin(studentsTable, eq(studentsTable.id, compensatoryObligationsTable.studentId))
      .innerJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
      .where(and(...compObligationConditions));

    let existingCompExposure = 0;
    for (const ob of outstandingObligations) {
      const remaining = (ob.minutesOwed ?? 0) - (ob.minutesDelivered ?? 0);
      if (remaining > 0) existingCompExposure += minutesToDollars(remaining, DEFAULT_HOURLY_RATE);
    }

    const today = new Date();

    const report = {
      meta: {
        districtName,
        generatedAt: today.toISOString(),
        currentWeek: currentWeek.label,
        weekStart: currentWeek.start,
        weekEnd: currentWeek.end,
        schoolFilter: schoolId ?? null,
      },
      summary: {
        totalStudents: uniqueStudents.size,
        totalRequiredMinutes: totalRequired,
        totalDeliveredMinutes: totalDelivered,
        totalShortfallMinutes: totalShortfall,
        overallComplianceRate,
        totalCurrentExposure: totalExposure,
        existingCompensatoryExposure: existingCompExposure,
        combinedExposure: Math.round((totalExposure + existingCompExposure) * 100) / 100,
        riskCounts,
      },
      urgentFlags,
      studentShortfalls: studentShortfalls.slice(0, 25),
      providerSummary,
      providersWithMissedThisWeek: providersWithMissed,
      weeklyTrend,
    };

    logAudit(req, {
      action: "read",
      targetTable: "service_requirements",
      summary: `Generated weekly compliance summary (${uniqueStudents.size} students, week of ${currentWeek.start})`,
      metadata: { reportType: "weekly-compliance-summary" },
    });

    res.json(report);
  } catch (e: any) {
    console.error("GET /reports/weekly-compliance-summary error:", e);
    res.status(500).json({ error: "Failed to generate weekly compliance summary" });
  }
});

router.get("/reports/weekly-compliance-summary.csv", async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = getEnforcedDistrictId(req as AuthedRequest);
    if (!districtId) { res.status(403).json({ error: "District context required" }); return; }

    const rawSchoolId = req.query.schoolId ? Number(req.query.schoolId) : undefined;
    if (rawSchoolId !== undefined && (!Number.isInteger(rawSchoolId) || rawSchoolId <= 0)) {
      res.status(400).json({ error: "Invalid schoolId parameter" }); return;
    }
    const schoolId = rawSchoolId;

    const progress = await computeAllActiveMinuteProgress({ districtId, schoolId });
    const rateMap = await getRateMap(districtId);

    const studentIds = [...new Set(progress.map(p => p.studentId))];
    const schoolMap = new Map<number, string>();
    if (studentIds.length > 0) {
      const studentSchools = await db.select({
        studentId: studentsTable.id,
        schoolName: schoolsTable.name,
      }).from(studentsTable)
        .innerJoin(schoolsTable, and(eq(schoolsTable.id, studentsTable.schoolId), eq(schoolsTable.districtId, districtId)))
        .where(sql`${studentsTable.id} IN (${sql.join(studentIds.map(id => sql`${id}`), sql`, `)})`);
      for (const s of studentSchools) schoolMap.set(s.studentId, s.schoolName ?? "");
    }

    const headers = ["Student", "School", "Service", "Required Minutes", "Delivered Minutes", "Shortfall", "% Complete", "Risk Status", "Provider", "Est. Exposure ($)"];
    const rows = progress
      .filter(p => p.requiredMinutes - p.deliveredMinutes > 0)
      .sort((a, b) => (b.requiredMinutes - b.deliveredMinutes) - (a.requiredMinutes - a.deliveredMinutes))
      .map(p => {
        const shortfall = Math.max(0, p.requiredMinutes - p.deliveredMinutes);
        const rates = rateMap.get(p.serviceTypeId);
        const hourlyRate = rates?.inHouse ?? DEFAULT_HOURLY_RATE;
        return [
          p.studentName,
          schoolMap.get(p.studentId) ?? "",
          p.serviceTypeName,
          p.requiredMinutes,
          p.deliveredMinutes,
          shortfall,
          p.percentComplete,
          riskLabel(p.riskStatus),
          p.providerName ?? "Unassigned",
          minutesToDollars(shortfall, hourlyRate),
        ];
      });

    const csv = buildCSV(headers, rows);
    const fileName = `weekly-compliance-summary-${new Date().toISOString().split("T")[0]}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    logAudit(req, {
      action: "read",
      targetTable: "service_requirements",
      summary: `Exported weekly compliance summary CSV (${rows.length} rows)`,
      metadata: { reportType: "weekly-compliance-summary", format: "csv" },
    });
    recordExport(req, { reportType: "weekly-compliance-summary", reportLabel: "Weekly Compliance Summary", format: "csv", fileName, recordCount: rows.length });

    res.send(csv);
  } catch (e: any) {
    console.error("GET /reports/weekly-compliance-summary.csv error:", e);
    res.status(500).json({ error: "Failed to generate CSV export" });
  }
});

export default router;
