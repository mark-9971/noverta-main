// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, alertsTable, sessionLogsTable,
  scheduleBlocksTable,
  serviceRequirementsTable, serviceTypesTable,
  iepDocumentsTable,
  restraintIncidentsTable,
} from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../../lib/minuteCalc";
import { requireTierAccess } from "../../middlewares/tierGate";
import {
  parseSchoolDistrictFilters,
  buildStudentSubquery,
  buildAlertStudentFilter,
} from "./shared";

const router: IRouter = Router();

router.get("/dashboard/compliance-by-service", async (req, res): Promise<void> => {
  const sdFilters = parseSchoolDistrictFilters(req, req.query);
  const allProgress = await computeAllActiveMinuteProgress(sdFilters);
  const serviceMap = new Map<string, { total: number; onTrack: number; atRisk: number; outOfCompliance: number; sumPct: number }>();

  for (const p of allProgress) {
    const key = p.serviceTypeName;
    if (!serviceMap.has(key)) serviceMap.set(key, { total: 0, onTrack: 0, atRisk: 0, outOfCompliance: 0, sumPct: 0 });
    const s = serviceMap.get(key)!;
    s.total++;
    s.sumPct += p.percentComplete;
    if (p.riskStatus === "on_track" || p.riskStatus === "completed") s.onTrack++;
    else if (p.riskStatus === "at_risk") s.atRisk++;
    else if (p.riskStatus === "out_of_compliance") s.outOfCompliance++;
  }

  res.json([...serviceMap.entries()].map(([name, data]) => ({
    serviceTypeName: name,
    totalRequirements: data.total,
    onTrack: data.onTrack,
    atRisk: data.atRisk,
    outOfCompliance: data.outOfCompliance,
    avgPercentComplete: data.total > 0 ? Math.round((data.sumPct / data.total) * 10) / 10 : 0,
  })));
});

router.get("/dashboard/executive", requireTierAccess("district.executive"), async (req, res): Promise<void> => {
  try {
    const sdFilters = parseSchoolDistrictFilters(req, req.query);
    const studentFilter = buildStudentSubquery(sdFilters);
    const alertFilter = buildAlertStudentFilter(sdFilters);

    const studentConditions = [eq(studentsTable.status, "active")];
    if (studentFilter) studentConditions.push(studentFilter as any);

    const alertConditions: any[] = [eq(alertsTable.resolved, false)];
    if (alertFilter) alertConditions.push(alertFilter);

    const [
      [activeStudentsResult],
      allProgress,
      alertCounts,
    ] = await Promise.all([
      db.select({ count: count() }).from(studentsTable).where(and(...studentConditions)),
      computeAllActiveMinuteProgress(sdFilters),
      db.select({
        total: count(),
        critical: sql<number>`count(*) filter (where ${alertsTable.severity} = 'critical')`,
      }).from(alertsTable).where(and(...alertConditions)),
    ]);

    const studentRisk = new Map<number, { status: string; name: string; id: number; percentComplete: number; serviceCount: number }>();
    for (const p of allProgress) {
      const priority: Record<string, number> = {
        out_of_compliance: 4, at_risk: 3, slightly_behind: 2, on_track: 1, completed: 0,
      };
      const current = studentRisk.get(p.studentId);
      if (!current || (priority[p.riskStatus] ?? 0) > (priority[current.status] ?? 0)) {
        studentRisk.set(p.studentId, {
          status: p.riskStatus,
          name: p.studentName,
          id: p.studentId,
          percentComplete: p.percentComplete,
          serviceCount: (current?.serviceCount ?? 0) + 1,
        });
      } else if (current) {
        current.serviceCount++;
      }
    }

    const riskCounts = { onTrack: 0, slightlyBehind: 0, atRisk: 0, outOfCompliance: 0 };
    const atRiskStudents: { studentId: number; studentName: string; riskStatus: string; percentComplete: number }[] = [];

    for (const [_, v] of studentRisk) {
      if (v.status === "on_track" || v.status === "completed") riskCounts.onTrack++;
      else if (v.status === "slightly_behind") riskCounts.slightlyBehind++;
      else if (v.status === "at_risk") {
        riskCounts.atRisk++;
        atRiskStudents.push({ studentId: v.id, studentName: v.name, riskStatus: v.status, percentComplete: v.percentComplete });
      } else if (v.status === "out_of_compliance") {
        riskCounts.outOfCompliance++;
        atRiskStudents.push({ studentId: v.id, studentName: v.name, riskStatus: v.status, percentComplete: v.percentComplete });
      }
    }

    atRiskStudents.sort((a, b) => a.percentComplete - b.percentComplete);

    const totalStudents = activeStudentsResult?.count ?? 0;
    const totalTracked = riskCounts.onTrack + riskCounts.slightlyBehind + riskCounts.atRisk + riskCounts.outOfCompliance;
    const complianceScore = totalTracked > 0
      ? Math.round(((riskCounts.onTrack) / totalTracked) * 100)
      : 100;

    const iepDeadlineConditions: any[] = [eq(studentsTable.status, "active"), eq(iepDocumentsTable.active, true)];
    if (sdFilters.schoolId) iepDeadlineConditions.push(eq(studentsTable.schoolId, sdFilters.schoolId));
    if (sdFilters.districtId) iepDeadlineConditions.push(sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId})`);

    const iepDocs = await db.select({
      studentId: iepDocumentsTable.studentId,
      iepEndDate: iepDocumentsTable.iepEndDate,
      iepStartDate: iepDocumentsTable.iepStartDate,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
    })
      .from(iepDocumentsTable)
      .innerJoin(studentsTable, eq(iepDocumentsTable.studentId, studentsTable.id))
      .where(and(...iepDeadlineConditions));

    const todayMs = new Date().getTime();
    const deadlineCounts = { within30: 0, within60: 0, within90: 0 };
    const seenDeadlines = new Set<string>();
    for (const doc of iepDocs) {
      const annualMs = new Date(doc.iepEndDate).getTime();
      const daysToAnnual = Math.ceil((annualMs - todayMs) / 86400000);
      const annualKey = `${doc.studentId}-annual`;
      if (!seenDeadlines.has(annualKey)) {
        seenDeadlines.add(annualKey);
        if (daysToAnnual >= 0 && daysToAnnual <= 30) deadlineCounts.within30++;
        if (daysToAnnual >= 0 && daysToAnnual <= 60) deadlineCounts.within60++;
        if (daysToAnnual >= 0 && daysToAnnual <= 90) deadlineCounts.within90++;
      }

      const triennialDate = new Date(doc.iepStartDate);
      triennialDate.setFullYear(triennialDate.getFullYear() + 3);
      const daysToTriennial = Math.ceil((triennialDate.getTime() - todayMs) / 86400000);
      const triennialKey = `${doc.studentId}-triennial`;
      if (!seenDeadlines.has(triennialKey)) {
        seenDeadlines.add(triennialKey);
        if (daysToTriennial >= 0 && daysToTriennial <= 30) deadlineCounts.within30++;
        if (daysToTriennial >= 0 && daysToTriennial <= 60) deadlineCounts.within60++;
        if (daysToTriennial >= 0 && daysToTriennial <= 90) deadlineCounts.within90++;
      }
    }

    res.json({
      complianceScore,
      totalStudents,
      riskCounts,
      topAtRiskStudents: atRiskStudents.slice(0, 10),
      openAlerts: alertCounts[0]?.total ?? 0,
      criticalAlerts: alertCounts[0]?.critical ?? 0,
      deadlineCounts,
    });
  } catch (e: any) {
    console.error("GET /dashboard/executive error:", e);
    res.status(500).json({ error: "Failed to fetch executive dashboard" });
  }
});

router.get("/dashboard/staff-coverage", requireTierAccess("district.executive"), async (req, res): Promise<void> => {
  try {
    const sdFilters = parseSchoolDistrictFilters(req, req.query);

    const reqConditions: any[] = [eq(serviceRequirementsTable.active, true)];
    if (sdFilters.schoolId) reqConditions.push(sql`${serviceRequirementsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${sdFilters.schoolId})`);
    if (sdFilters.districtId) reqConditions.push(sql`${serviceRequirementsTable.studentId} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId}))`);

    const blockConditions: any[] = [eq(scheduleBlocksTable.isRecurring, true)];
    if (sdFilters.schoolId) blockConditions.push(sql`${scheduleBlocksTable.staffId} IN (SELECT id FROM staff WHERE school_id = ${sdFilters.schoolId})`);
    if (sdFilters.districtId) blockConditions.push(sql`${scheduleBlocksTable.staffId} IN (SELECT id FROM staff WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId}))`);

    const [requirements, blocks] = await Promise.all([
      db.select({
        serviceTypeId: serviceRequirementsTable.serviceTypeId,
        serviceTypeName: serviceTypesTable.name,
        requiredMinutes: serviceRequirementsTable.requiredMinutes,
        intervalType: serviceRequirementsTable.intervalType,
      })
        .from(serviceRequirementsTable)
        .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
        .where(and(...reqConditions)),
      db.select({
        serviceTypeId: scheduleBlocksTable.serviceTypeId,
        startTime: scheduleBlocksTable.startTime,
        endTime: scheduleBlocksTable.endTime,
      })
        .from(scheduleBlocksTable)
        .where(and(...blockConditions)),
    ]);

    const serviceMap = new Map<number, { name: string; mandatedWeeklyMinutes: number; scheduledWeeklyMinutes: number; requirementCount: number }>();

    for (const r of requirements) {
      if (!serviceMap.has(r.serviceTypeId)) {
        serviceMap.set(r.serviceTypeId, { name: r.serviceTypeName ?? "Unknown", mandatedWeeklyMinutes: 0, scheduledWeeklyMinutes: 0, requirementCount: 0 });
      }
      const entry = serviceMap.get(r.serviceTypeId)!;
      entry.requirementCount++;
      let weeklyMinutes = r.requiredMinutes;
      if (r.intervalType === "monthly") weeklyMinutes = Math.round(r.requiredMinutes / 4);
      else if (r.intervalType === "quarterly") weeklyMinutes = Math.round(r.requiredMinutes / 13);
      entry.mandatedWeeklyMinutes += weeklyMinutes;
    }

    for (const b of blocks) {
      if (!b.serviceTypeId) continue;
      const [startH, startM] = (b.startTime || "0:0").split(":").map(Number);
      const [endH, endM] = (b.endTime || "0:0").split(":").map(Number);
      const blockMinutes = (endH * 60 + endM) - (startH * 60 + startM);
      if (!serviceMap.has(b.serviceTypeId)) {
        serviceMap.set(b.serviceTypeId, { name: "Unknown", mandatedWeeklyMinutes: 0, scheduledWeeklyMinutes: 0, requirementCount: 0 });
      }
      serviceMap.get(b.serviceTypeId)!.scheduledWeeklyMinutes += Math.max(0, blockMinutes);
    }

    const byService = [...serviceMap.entries()].map(([serviceTypeId, data]) => ({
      serviceTypeId,
      serviceTypeName: data.name,
      mandatedWeeklyMinutes: data.mandatedWeeklyMinutes,
      scheduledWeeklyMinutes: data.scheduledWeeklyMinutes,
      coveragePercent: data.mandatedWeeklyMinutes > 0
        ? Math.round((data.scheduledWeeklyMinutes / data.mandatedWeeklyMinutes) * 100)
        : 100,
      requirementCount: data.requirementCount,
      gap: Math.max(0, data.mandatedWeeklyMinutes - data.scheduledWeeklyMinutes),
    }));

    let totalMandated = 0;
    let totalScheduled = 0;
    for (const s of serviceMap.values()) {
      totalMandated += s.mandatedWeeklyMinutes;
      totalScheduled += s.scheduledWeeklyMinutes;
    }

    res.json({
      byService,
      totalMandatedWeeklyMinutes: totalMandated,
      totalScheduledWeeklyMinutes: totalScheduled,
      totalCoveragePercent: totalMandated > 0 ? Math.round((totalScheduled / totalMandated) * 100) : 100,
      totalGap: Math.max(0, totalMandated - totalScheduled),
    });
  } catch (e: any) {
    console.error("GET /dashboard/staff-coverage error:", e);
    res.status(500).json({ error: "Failed to fetch staff coverage" });
  }
});

router.get("/dashboard/pilot-metrics", requireTierAccess("district.executive"), async (req, res): Promise<void> => {
  try {
    const sdFilters = parseSchoolDistrictFilters(req, req.query);
    const studentFilter = buildStudentSubquery(sdFilters);

    const studentConditions = [eq(studentsTable.status, "active")];
    if (studentFilter) studentConditions.push(studentFilter as any);

    const [
      [activeStudentsResult],
      [studentsWithIepResult],
      sessionTimeliness,
      incidentTimeliness,
    ] = await Promise.all([
      db.select({ count: count() })
        .from(studentsTable)
        .where(and(...studentConditions)),

      db.select({ count: sql<number>`count(distinct ${studentsTable.id})` })
        .from(studentsTable)
        .innerJoin(iepDocumentsTable, and(
          eq(iepDocumentsTable.studentId, studentsTable.id),
          eq(iepDocumentsTable.active, true),
        ))
        .where(and(...studentConditions)),

      db.select({
        total: count(),
        loggedWithin48h: sql<number>`count(*) filter (where ${sessionLogsTable.createdAt} <= (${sessionLogsTable.sessionDate}::timestamp + interval '48 hours'))`,
      })
        .from(sessionLogsTable)
        .where(
          sdFilters.schoolId
            ? sql`${sessionLogsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${sdFilters.schoolId})`
            : sdFilters.districtId
            ? sql`${sessionLogsTable.studentId} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId}))`
            : sql`1=1`
        ),

      db.select({
        total: count(),
        loggedWithin24h: sql<number>`count(*) filter (where ${restraintIncidentsTable.createdAt} <= (${restraintIncidentsTable.incidentDate}::timestamp + interval '24 hours'))`,
      })
        .from(restraintIncidentsTable)
        .where(
          sdFilters.schoolId
            ? sql`${restraintIncidentsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${sdFilters.schoolId})`
            : sdFilters.districtId
            ? sql`${restraintIncidentsTable.studentId} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId}))`
            : sql`1=1`
        ),
    ]);

    const totalActive = (activeStudentsResult as any)?.count ?? 0;
    const withIep = (studentsWithIepResult as any)?.count ?? 0;
    const rosterCoverage = totalActive > 0 ? Math.round((withIep / totalActive) * 100) : 100;

    const totalSessions = sessionTimeliness[0]?.total ?? 0;
    const sessionsOnTime = sessionTimeliness[0]?.loggedWithin48h ?? 0;
    const sessionLoggingRate = totalSessions > 0 ? Math.round((sessionsOnTime / totalSessions) * 100) : 100;

    const totalIncidents = incidentTimeliness[0]?.total ?? 0;
    const incidentsOnTime = incidentTimeliness[0]?.loggedWithin24h ?? 0;
    const incidentTimelinessPct = totalIncidents > 0 ? Math.round((incidentsOnTime / totalIncidents) * 100) : 100;

    const iepConditions: any[] = [eq(studentsTable.status, "active"), eq(iepDocumentsTable.active, true)];
    if (sdFilters.schoolId) iepConditions.push(eq(studentsTable.schoolId, sdFilters.schoolId));
    if (sdFilters.districtId) iepConditions.push(sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId})`);

    const iepDocs = await db.select({
      iepEndDate: iepDocumentsTable.iepEndDate,
    })
      .from(iepDocumentsTable)
      .innerJoin(studentsTable, eq(iepDocumentsTable.studentId, studentsTable.id))
      .where(and(...iepConditions));

    const todayMs = Date.now();
    let expiredIeps = 0;
    for (const doc of iepDocs) {
      const endMs = new Date(doc.iepEndDate).getTime();
      if (endMs < todayMs) expiredIeps++;
    }

    res.json({
      rosterCoverage: { percent: rosterCoverage, withIep, totalActive, target: 100 },
      sessionLogging: { percent: sessionLoggingRate, onTime: sessionsOnTime, total: totalSessions, target: 80 },
      incidentTimeliness: { percent: incidentTimelinessPct, onTime: incidentsOnTime, total: totalIncidents, target: 100 },
      annualReviewCompliance: { expiredIeps, target: 0 },
      staffEngagement: { avgLoginsPerWeek: 0, target: 3 },
    });
  } catch (e: any) {
    console.error("GET /dashboard/pilot-metrics error:", e);
    res.status(500).json({ error: "Failed to fetch pilot metrics" });
  }
});

export default router;
