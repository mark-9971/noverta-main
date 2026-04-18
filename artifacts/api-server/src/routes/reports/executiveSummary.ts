import { Router, type IRouter, type Request } from "express";
import { db } from "@workspace/db";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";
import {
  studentsTable, sessionLogsTable, serviceTypesTable,
  serviceRequirementsTable, iepDocumentsTable, alertsTable,
} from "@workspace/db";
import { GetExecutiveSummaryReportQueryParams } from "@workspace/api-zod";
import { eq, and, gte, lte, sql, count, isNull } from "drizzle-orm";
import { requireReportExport } from "./shared";

const router: IRouter = Router();

router.get("/reports/executive-summary", requireReportExport, async (req: Request, res): Promise<void> => {
  try {
    const parsed = GetExecutiveSummaryReportQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query parameters", details: parsed.error.flatten() });
      return;
    }
    const { schoolId, startDate, endDate, schoolYearId: execYearId } = req.query;
    const execEnforcedDistrictId = getEnforcedDistrictId(req as unknown as AuthedRequest);
    const districtId = execEnforcedDistrictId !== null ? String(execEnforcedDistrictId) : null;
    const now = new Date();
    const start = (startDate as string) || new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split("T")[0];
    const end = (endDate as string) || now.toISOString().split("T")[0];

    const studentConditions: ReturnType<typeof eq>[] = [eq(studentsTable.status, "active") as ReturnType<typeof eq>];
    if (schoolId) studentConditions.push(eq(studentsTable.schoolId, Number(schoolId)) as ReturnType<typeof eq>);
    if (districtId) studentConditions.push(sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${Number(districtId)})` as ReturnType<typeof eq>);

    const activeStudents = await db.select({
      id: studentsTable.id,
    }).from(studentsTable).where(and(...studentConditions));

    const studentIds = activeStudents.map(s => s.id);
    if (studentIds.length === 0) {
      res.json({
        generatedAt: new Date().toISOString(),
        preparedBy: (req.query.preparedBy as string) || null,
        totalActiveStudents: 0, complianceRate: 100,
        riskCounts: { onTrack: 0, slightlyBehind: 0, atRisk: 0, outOfCompliance: 0 },
        serviceDelivery: { totalDeliveredMinutes: 0, totalRequiredMinutes: 0, overallPercent: 100, totalMissedSessions: 0, totalMakeupSessions: 0, byService: [] },
        iepDeadlines: { within30: 0, within60: 0, within90: 0, overdue: 0 },
        alerts: { openAlerts: 0, criticalAlerts: 0 },
      });
      return;
    }

    const requirements = await db.select({
      id: serviceRequirementsTable.id,
      studentId: serviceRequirementsTable.studentId,
      serviceTypeId: serviceRequirementsTable.serviceTypeId,
      requiredMinutes: serviceRequirementsTable.requiredMinutes,
      intervalType: serviceRequirementsTable.intervalType,
      serviceTypeName: serviceTypesTable.name,
    })
      .from(serviceRequirementsTable)
      .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
      .where(and(
        eq(serviceRequirementsTable.active, true),
        sql`${serviceRequirementsTable.studentId} IN (${sql.join(studentIds.map(id => sql`${id}`), sql`, `)})`
      ));

    const sessions = await db.select({
      studentId: sessionLogsTable.studentId,
      serviceRequirementId: sessionLogsTable.serviceRequirementId,
      durationMinutes: sessionLogsTable.durationMinutes,
      status: sessionLogsTable.status,
      isMakeup: sessionLogsTable.isMakeup,
    })
      .from(sessionLogsTable)
      .where(and(
        gte(sessionLogsTable.sessionDate, start),
        lte(sessionLogsTable.sessionDate, end),
        sql`${sessionLogsTable.studentId} IN (${sql.join(studentIds.map(id => sql`${id}`), sql`, `)})`,
        isNull(sessionLogsTable.deletedAt),
        ...(execYearId ? [eq(sessionLogsTable.schoolYearId, Number(execYearId))] : [])
      ));

    function normalizeToRange(requiredMinutes: number, intervalType: string): number {
      const startD = new Date(start + "T12:00:00");
      const endD = new Date(end + "T12:00:00");
      const rangeDays = Math.max(1, (endD.getTime() - startD.getTime()) / 86400000);
      const rangeWeeks = rangeDays / 7;
      const rangeMonths = rangeDays / 30.44;
      if (intervalType === "weekly") return requiredMinutes * rangeWeeks;
      if (intervalType === "monthly") return requiredMinutes * rangeMonths;
      if (intervalType === "quarterly") return requiredMinutes * (rangeMonths / 3);
      return requiredMinutes * rangeWeeks;
    }

    const reqByStudent = new Map<number, { required: number; delivered: number; missed: number; makeup: number }>();
    const serviceDelivery: Record<string, { delivered: number; required: number; students: Set<number> }> = {};

    for (const r of requirements) {
      const rangeReq = normalizeToRange(r.requiredMinutes, r.intervalType);
      if (!reqByStudent.has(r.studentId)) reqByStudent.set(r.studentId, { required: 0, delivered: 0, missed: 0, makeup: 0 });
      reqByStudent.get(r.studentId)!.required += rangeReq;
      const svcName = r.serviceTypeName ?? "Unknown";
      if (!serviceDelivery[svcName]) serviceDelivery[svcName] = { delivered: 0, required: 0, students: new Set() };
      serviceDelivery[svcName].required += rangeReq;
      serviceDelivery[svcName].students.add(r.studentId);
    }

    for (const s of sessions) {
      const entry = reqByStudent.get(s.studentId);
      if (!entry) continue;
      if (s.status === "completed" || s.status === "makeup") {
        entry.delivered += s.durationMinutes;
      }
      if (s.status === "missed") entry.missed++;
      if (s.isMakeup) entry.makeup++;

      const req = requirements.find(r => r.id === s.serviceRequirementId);
      if (req) {
        const svcName = req.serviceTypeName ?? "Unknown";
        if (serviceDelivery[svcName] && (s.status === "completed" || s.status === "makeup")) {
          serviceDelivery[svcName].delivered += s.durationMinutes;
        }
      }
    }

    const riskCounts = { onTrack: 0, slightlyBehind: 0, atRisk: 0, outOfCompliance: 0 };
    let totalDelivered = 0, totalRequired = 0, totalMissed = 0, totalMakeup = 0;
    for (const [, entry] of reqByStudent) {
      totalDelivered += entry.delivered;
      totalRequired += entry.required;
      totalMissed += entry.missed;
      totalMakeup += entry.makeup;
      const pct = entry.required > 0 ? entry.delivered / entry.required : 1;
      if (pct >= 0.95) riskCounts.onTrack++;
      else if (pct >= 0.85) riskCounts.slightlyBehind++;
      else if (pct >= 0.70) riskCounts.atRisk++;
      else riskCounts.outOfCompliance++;
    }

    const totalTracked = riskCounts.onTrack + riskCounts.slightlyBehind + riskCounts.atRisk + riskCounts.outOfCompliance;
    const complianceRate = totalTracked > 0 ? Math.round((riskCounts.onTrack / totalTracked) * 100) : 100;

    const serviceBreakdown = Object.entries(serviceDelivery).map(([name, d]) => ({
      serviceTypeName: name,
      deliveredMinutes: Math.round(d.delivered),
      requiredMinutes: Math.round(d.required),
      percentComplete: d.required > 0 ? Math.round((d.delivered / d.required) * 100) : 100,
      studentCount: d.students.size,
    }));

    const iepConditions: any[] = [eq(iepDocumentsTable.active, true)];
    if (schoolId) iepConditions.push(sql`${iepDocumentsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${Number(schoolId)})`);
    if (districtId) iepConditions.push(sql`${iepDocumentsTable.studentId} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${Number(districtId)}))`);

    const iepDocs = await db.select({
      iepEndDate: iepDocumentsTable.iepEndDate,
    }).from(iepDocumentsTable).where(and(...iepConditions));

    const todayMs = Date.now();
    const deadlines = { within30: 0, within60: 0, within90: 0, overdue: 0 };
    for (const doc of iepDocs) {
      const days = Math.ceil((new Date(doc.iepEndDate).getTime() - todayMs) / 86400000);
      if (days < 0) deadlines.overdue++;
      else if (days <= 30) deadlines.within30++;
      else if (days <= 60) deadlines.within60++;
      else if (days <= 90) deadlines.within90++;
    }

    const alertConditions: any[] = [eq(alertsTable.resolved, false)];
    if (schoolId) alertConditions.push(sql`${alertsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${Number(schoolId)})`);
    if (districtId) alertConditions.push(sql`${alertsTable.studentId} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${Number(districtId)}))`);

    const [alertResult] = await db.select({
      total: count(),
      critical: sql<number>`count(*) filter (where ${alertsTable.severity} = 'critical')`,
    }).from(alertsTable).where(and(...alertConditions));

    res.json({
      generatedAt: new Date().toISOString(),
      preparedBy: (req.query.preparedBy as string) || null,
      totalActiveStudents: activeStudents.length,
      complianceRate,
      riskCounts,
      serviceDelivery: {
        totalDeliveredMinutes: Math.round(totalDelivered),
        totalRequiredMinutes: Math.round(totalRequired),
        overallPercent: totalRequired > 0 ? Math.round((totalDelivered / totalRequired) * 100) : 100,
        totalMissedSessions: totalMissed,
        totalMakeupSessions: totalMakeup,
        byService: serviceBreakdown,
      },
      iepDeadlines: deadlines,
      alerts: {
        openAlerts: alertResult?.total ?? 0,
        criticalAlerts: alertResult?.critical ?? 0,
      },
    });
  } catch (e: any) {
    console.error("GET /reports/executive-summary error:", e);
    res.status(500).json({ error: "Failed to generate executive summary" });
  }
});

export default router;
