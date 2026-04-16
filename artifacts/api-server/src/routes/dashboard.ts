import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, alertsTable, sessionLogsTable,
  scheduleBlocksTable, staffTable, staffAssignmentsTable,
  serviceRequirementsTable, serviceTypesTable,
  complianceEventsTable, iepDocumentsTable, teamMeetingsTable,
  agencyContractsTable, agenciesTable, districtsTable, schoolsTable,
  restraintIncidentsTable,
} from "@workspace/db";
import { eq, and, gte, lte, count, sql, asc, desc, isNull, inArray } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../lib/minuteCalc";
import { getPublicMeta } from "../lib/clerkClaims";
import { requireTierAccess } from "../middlewares/tierGate";
import { getEnforcedDistrictId } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import type { Request } from "express";

async function resolveCallerDistrictId(req: import("express").Request): Promise<number | null> {
  const meta = getPublicMeta(req);
  if (meta.staffId) {
    const [staff] = await db.select({ schoolId: staffTable.schoolId })
      .from(staffTable).where(eq(staffTable.id, meta.staffId)).limit(1);
    if (staff?.schoolId) {
      const [school] = await db.select({ districtId: schoolsTable.districtId })
        .from(schoolsTable).where(eq(schoolsTable.id, staff.schoolId)).limit(1);
      if (school?.districtId) return school.districtId;
    }
  }
  const districts = await db.select({ id: districtsTable.id }).from(districtsTable).limit(2);
  if (districts.length === 1) return districts[0].id;
  return null;
}

const router: IRouter = Router();

function parseSchoolDistrictFilters(req: Request, query: Record<string, unknown>): { schoolId?: number; districtId?: number } {
  const filters: { schoolId?: number; districtId?: number } = {};
  // Enforced district from token always takes precedence over client query params.
  const enforcedDistrictId = getEnforcedDistrictId(req as AuthedRequest);
  if (enforcedDistrictId !== null) {
    filters.districtId = enforcedDistrictId;
  } else if (query.districtId) {
    // Platform admin: optional filter by query param
    filters.districtId = Number(query.districtId);
  }
  if (query.schoolId) filters.schoolId = Number(query.schoolId);
  return filters;
}

function buildStudentSubquery(filters: { schoolId?: number; districtId?: number }): ReturnType<typeof sql> | undefined {
  if (filters.schoolId) return sql`${studentsTable.schoolId} = ${filters.schoolId}`;
  if (filters.districtId) return sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${filters.districtId})`;
  return undefined;
}

function buildSessionStudentFilter(filters: { schoolId?: number; districtId?: number }): ReturnType<typeof sql> | undefined {
  if (filters.schoolId) return sql`${sessionLogsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${filters.schoolId})`;
  if (filters.districtId) return sql`${sessionLogsTable.studentId} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${filters.districtId}))`;
  return undefined;
}

function buildAlertStudentFilter(filters: { schoolId?: number; districtId?: number }): ReturnType<typeof sql> | undefined {
  if (filters.schoolId) return sql`${alertsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${filters.schoolId})`;
  if (filters.districtId) return sql`${alertsTable.studentId} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${filters.districtId}))`;
  return undefined;
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const sdFilters = parseSchoolDistrictFilters(req, req.query);
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartStr = weekStart.toISOString().substring(0, 10);
  const todayStr = today.toISOString().substring(0, 10);

  const studentFilter = buildStudentSubquery(sdFilters);
  const sessionFilter = buildSessionStudentFilter(sdFilters);
  const alertFilter = buildAlertStudentFilter(sdFilters);

  const studentConditions = [eq(studentsTable.status, "active")];
  if (studentFilter) studentConditions.push(studentFilter as any);

  const missedConditions: any[] = [eq(sessionLogsTable.status, "missed"), gte(sessionLogsTable.sessionDate, weekStartStr), lte(sessionLogsTable.sessionDate, todayStr)];
  if (sessionFilter) missedConditions.push(sessionFilter);

  const makeupConditions: any[] = [eq(sessionLogsTable.status, "missed")];
  if (sessionFilter) makeupConditions.push(sessionFilter);

  const alertConditions: any[] = [eq(alertsTable.resolved, false)];
  if (alertFilter) alertConditions.push(alertFilter);

  const [
    [activeStudentsResult],
    allProgress,
    [missedThisWeek],
    [openMakeups],
    alertCounts,
    allBlocks,
  ] = await Promise.all([
    db.select({ count: count() }).from(studentsTable).where(and(...studentConditions)),
    computeAllActiveMinuteProgress(sdFilters),
    db.select({ count: count() }).from(sessionLogsTable).where(and(...missedConditions)),
    db.select({ count: count() }).from(sessionLogsTable).where(and(...makeupConditions)),
    db.select({
      total: count(),
      critical: sql<number>`count(*) filter (where ${alertsTable.severity} = 'critical')`,
    }).from(alertsTable).where(and(...alertConditions)),
    (() => {
      const blockConditions: any[] = [eq(scheduleBlocksTable.isRecurring, true)];
      if (sdFilters.schoolId) blockConditions.push(sql`${scheduleBlocksTable.staffId} IN (SELECT id FROM staff WHERE school_id = ${sdFilters.schoolId})`);
      if (sdFilters.districtId) blockConditions.push(sql`${scheduleBlocksTable.staffId} IN (SELECT id FROM staff WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId}))`);
      return db.select({
        staffId: scheduleBlocksTable.staffId,
        dayOfWeek: scheduleBlocksTable.dayOfWeek,
        startTime: scheduleBlocksTable.startTime,
        endTime: scheduleBlocksTable.endTime,
      }).from(scheduleBlocksTable).where(and(...blockConditions));
    })(),
  ]);

  const studentRisk = new Map<number, string>();
  for (const p of allProgress) {
    const current = studentRisk.get(p.studentId);
    const priority: Record<string, number> = {
      out_of_compliance: 4, at_risk: 3, slightly_behind: 2, on_track: 1, completed: 0,
    };
    if (!current || (priority[p.riskStatus] ?? 0) > (priority[current] ?? 0)) {
      studentRisk.set(p.studentId, p.riskStatus);
    }
  }

  const onTrack = [...studentRisk.values()].filter(v => v === "on_track" || v === "completed").length;
  const slightlyBehind = [...studentRisk.values()].filter(v => v === "slightly_behind").length;
  const atRisk = [...studentRisk.values()].filter(v => v === "at_risk").length;
  const outOfCompliance = [...studentRisk.values()].filter(v => v === "out_of_compliance").length;

  let conflictsCount = 0;
  const grouped = new Map<string, typeof allBlocks>();
  for (const b of allBlocks) {
    const key = `${b.staffId}-${b.dayOfWeek}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(b);
  }
  for (const [_, blocks] of grouped.entries()) {
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        if (blocks[i].startTime < blocks[j].endTime && blocks[j].startTime < blocks[i].endTime) {
          conflictsCount++;
        }
      }
    }
  }

  // trackedStudents = students with at least one active service requirement (correct compliance denominator)
  const trackedStudents = studentRisk.size;

  const callerDistrictId = await resolveCallerDistrictId(req);
  const renewalConditions = [
    eq(agencyContractsTable.status, "active"),
    isNull(agencyContractsTable.deletedAt),
    isNull(agenciesTable.deletedAt),
    sql`${agencyContractsTable.endDate}::date <= CURRENT_DATE + INTERVAL '30 days'`,
    sql`${agencyContractsTable.endDate}::date >= CURRENT_DATE`,
  ];
  if (callerDistrictId) {
    renewalConditions.push(eq(agenciesTable.districtId, callerDistrictId));
  } else {
    renewalConditions.push(sql`false`);
  }

  const renewingContracts = await db.select({
    id: agencyContractsTable.id,
    agencyName: agenciesTable.name,
    endDate: agencyContractsTable.endDate,
  })
    .from(agencyContractsTable)
    .innerJoin(agenciesTable, eq(agenciesTable.id, agencyContractsTable.agencyId))
    .where(and(...renewalConditions))
    .orderBy(asc(agencyContractsTable.endDate));

  res.json({
    totalActiveStudents: activeStudentsResult?.count ?? 0,
    trackedStudents,
    onTrackStudents: onTrack,
    slightlyBehindStudents: slightlyBehind,
    atRiskStudents: atRisk,
    outOfComplianceStudents: outOfCompliance,
    missedSessionsThisWeek: missedThisWeek?.count ?? 0,
    openMakeupObligations: openMakeups?.count ?? 0,
    uncoveredBlocksToday: 0,
    scheduleConflictsToday: conflictsCount,
    openAlerts: alertCounts[0]?.total ?? 0,
    criticalAlerts: alertCounts[0]?.critical ?? 0,
    contractRenewals: renewingContracts,
  });
});

router.get("/dashboard/risk-overview", async (req, res): Promise<void> => {
  const sdFilters = parseSchoolDistrictFilters(req, req.query);
  const allProgress = await computeAllActiveMinuteProgress(sdFilters);
  const counts = { on_track: 0, slightly_behind: 0, at_risk: 0, out_of_compliance: 0, completed: 0, total: 0 };
  for (const p of allProgress) {
    counts.total++;
    if (p.riskStatus === "on_track") counts.on_track++;
    else if (p.riskStatus === "slightly_behind") counts.slightly_behind++;
    else if (p.riskStatus === "at_risk") counts.at_risk++;
    else if (p.riskStatus === "out_of_compliance") counts.out_of_compliance++;
    else if (p.riskStatus === "completed") counts.completed++;
  }
  res.json({
    onTrack: counts.on_track,
    slightlyBehind: counts.slightly_behind,
    atRisk: counts.at_risk,
    outOfCompliance: counts.out_of_compliance,
    completed: counts.completed,
    total: counts.total,
  });
});

router.get("/dashboard/provider-summary", async (req, res): Promise<void> => {
  const sdFilters = parseSchoolDistrictFilters(req, req.query);
  const staffConditions: any[] = [eq(staffTable.status, "active")];
  if (sdFilters.schoolId) staffConditions.push(eq(staffTable.schoolId, sdFilters.schoolId));
  if (sdFilters.districtId) staffConditions.push(sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId})`);
  const alertFilter = buildAlertStudentFilter(sdFilters);
  const alertConditions: any[] = [eq(alertsTable.resolved, false)];
  if (alertFilter) alertConditions.push(alertFilter);

  const [providers, allProgress, alertsByStaff] = await Promise.all([
    db.select().from(staffTable).where(and(...staffConditions)),
    computeAllActiveMinuteProgress(sdFilters),
    db.select({
      staffId: alertsTable.staffId,
      count: count(),
    }).from(alertsTable)
      .where(and(...alertConditions))
      .groupBy(alertsTable.staffId),
  ]);

  const alertCountMap = new Map<number, number>();
  for (const a of alertsByStaff) {
    if (a.staffId != null) alertCountMap.set(a.staffId, a.count);
  }

  const result = providers.map((p) => {
    const caseloadProgress = allProgress.filter(prog => prog.providerId === p.id);
    const assignedStudents = new Set(caseloadProgress.map(prog => prog.studentId)).size;
    const totalRequired = caseloadProgress.reduce((sum, prog) => sum + prog.requiredMinutes, 0);
    const totalDelivered = caseloadProgress.reduce((sum, prog) => sum + prog.deliveredMinutes, 0);
    const studentsAtRisk = caseloadProgress.filter(prog =>
      prog.riskStatus === "at_risk" || prog.riskStatus === "out_of_compliance"
    ).length;

    const utilizationPercent = totalRequired > 0 ? Math.round((totalDelivered / totalRequired) * 100) : 0;

    return {
      staffId: p.id,
      staffName: `${p.firstName} ${p.lastName}`,
      role: p.role,
      assignedStudents,
      totalRequiredMinutes: totalRequired,
      totalDeliveredMinutes: totalDelivered,
      studentsAtRisk,
      openAlerts: alertCountMap.get(p.id) ?? 0,
      utilizationPercent,
    };
  });

  res.json(result);
});

router.get("/dashboard/para-summary", async (req, res): Promise<void> => {
  const sdFilters = parseSchoolDistrictFilters(req, req.query);
  const paraConditions: any[] = [eq(staffTable.status, "active"), eq(staffTable.role, "para")];
  if (sdFilters.schoolId) paraConditions.push(eq(staffTable.schoolId, sdFilters.schoolId));
  if (sdFilters.districtId) paraConditions.push(sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId})`);

  const [paras, blockCounts, assignmentCounts] = await Promise.all([
    db.select().from(staffTable).where(and(...paraConditions)),
    db.select({
      staffId: scheduleBlocksTable.staffId,
      count: count(),
    }).from(scheduleBlocksTable)
      .where(eq(scheduleBlocksTable.isRecurring, true))
      .groupBy(scheduleBlocksTable.staffId),
    db.select({
      staffId: staffAssignmentsTable.staffId,
      count: count(),
    }).from(staffAssignmentsTable)
      .groupBy(staffAssignmentsTable.staffId),
  ]);

  const blockMap = new Map<number, number>();
  for (const b of blockCounts) blockMap.set(b.staffId, b.count);

  const assignMap = new Map<number, number>();
  for (const a of assignmentCounts) assignMap.set(a.staffId, a.count);

  const result = paras.map((p) => ({
    staffId: p.id,
    staffName: `${p.firstName} ${p.lastName}`,
    assignedBlocks: blockMap.get(p.id) ?? 0,
    coverageGaps: 0,
    conflictsToday: 0,
    assignedStudents: assignMap.get(p.id) ?? 0,
  }));

  res.json(result);
});

router.get("/dashboard/alerts-summary", async (req, res): Promise<void> => {
  const sdFilters = parseSchoolDistrictFilters(req, req.query);
  const alertFilter = buildAlertStudentFilter(sdFilters);
  const conditions: any[] = [eq(alertsTable.resolved, false)];
  if (alertFilter) conditions.push(alertFilter);

  const rows = await db
    .select({
      severity: alertsTable.severity,
      count: count(),
    })
    .from(alertsTable)
    .where(and(...conditions))
    .groupBy(alertsTable.severity);

  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  let total = 0;
  for (const r of rows) {
    counts[r.severity] = r.count;
    total += r.count;
  }

  res.json({ ...counts, total });
});

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

router.get("/dashboard/missed-sessions-trend", async (req, res): Promise<void> => {
  const sdFilters = parseSchoolDistrictFilters(req, req.query);
  const sessionFilter = buildSessionStudentFilter(sdFilters);
  const today = new Date();
  const earliestMonday = new Date(today);
  earliestMonday.setDate(today.getDate() - 7 * 7);
  const dayOfWeek = earliestMonday.getDay();
  earliestMonday.setDate(earliestMonday.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  earliestMonday.setHours(0, 0, 0, 0);

  const earliestStr = earliestMonday.toISOString().substring(0, 10);
  const todayStr = today.toISOString().substring(0, 10);

  const trendConditions: any[] = [
    gte(sessionLogsTable.sessionDate, earliestStr),
    lte(sessionLogsTable.sessionDate, todayStr),
  ];
  if (sessionFilter) trendConditions.push(sessionFilter);

  const rows = await db
    .select({
      sessionDate: sessionLogsTable.sessionDate,
      status: sessionLogsTable.status,
      cnt: count(),
    })
    .from(sessionLogsTable)
    .where(and(...trendConditions))
    .groupBy(sessionLogsTable.sessionDate, sessionLogsTable.status);

  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const weekDate = new Date(today);
    weekDate.setDate(today.getDate() - i * 7);
    const monday = new Date(weekDate);
    monday.setDate(weekDate.getDate() - (weekDate.getDay() === 0 ? 6 : weekDate.getDay() - 1));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const mondayStr = monday.toISOString().substring(0, 10);
    const sundayStr = sunday.toISOString().substring(0, 10);

    let missedCount = 0;
    let completedCount = 0;
    for (const row of rows) {
      if (row.sessionDate >= mondayStr && row.sessionDate <= sundayStr) {
        if (row.status === "missed") missedCount += row.cnt;
        else if (row.status === "completed") completedCount += row.cnt;
      }
    }

    const month = monday.toLocaleString("default", { month: "short" });
    const day = monday.getDate();
    weeks.push({ weekLabel: `${month} ${day}`, missedCount, completedCount });
  }

  res.json(weeks);
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

router.get("/dashboard/iep-calendar", async (req, res): Promise<void> => {
  try {
    const { startDate, endDate, eventType } = req.query;
    const sdFilters = parseSchoolDistrictFilters(req, req.query);

    type CalendarEvent = {
      id: number | string;
      studentId: number;
      studentName: string;
      grade: string | null;
      eventType: string;
      title: string;
      dueDate: string;
      status: string;
      completedDate: string | null;
      notes: string | null;
      daysRemaining: number;
    };

    const today = new Date().toISOString().split("T")[0];
    const allEvents: CalendarEvent[] = [];

    const ceConditions: any[] = [];
    if (startDate) ceConditions.push(gte(complianceEventsTable.dueDate, startDate as string));
    if (endDate) ceConditions.push(lte(complianceEventsTable.dueDate, endDate as string));
    if (eventType && eventType !== "all") ceConditions.push(eq(complianceEventsTable.eventType, eventType as string));
    if (sdFilters.schoolId) ceConditions.push(sql`${complianceEventsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${sdFilters.schoolId})`);
    if (sdFilters.districtId) ceConditions.push(sql`${complianceEventsTable.studentId} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId}))`);

    const ceEvents = await db.select({
      id: complianceEventsTable.id,
      studentId: complianceEventsTable.studentId,
      eventType: complianceEventsTable.eventType,
      title: complianceEventsTable.title,
      dueDate: complianceEventsTable.dueDate,
      status: complianceEventsTable.status,
      completedDate: complianceEventsTable.completedDate,
      notes: complianceEventsTable.notes,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      studentGrade: studentsTable.grade,
    })
      .from(complianceEventsTable)
      .innerJoin(studentsTable, eq(complianceEventsTable.studentId, studentsTable.id))
      .where(ceConditions.length > 0 ? and(...ceConditions) : undefined)
      .orderBy(asc(complianceEventsTable.dueDate))
      .limit(500);

    for (const e of ceEvents) {
      const daysRemaining = Math.ceil((new Date(e.dueDate).getTime() - new Date(today).getTime()) / 86400000);
      let computedStatus = e.status;
      if (e.status !== "completed") {
        if (daysRemaining < 0) computedStatus = "overdue";
        else if (daysRemaining <= 7) computedStatus = "critical";
        else if (daysRemaining <= 30) computedStatus = "due_soon";
        else computedStatus = "upcoming";
      }
      allEvents.push({
        id: e.id,
        studentId: e.studentId,
        studentName: `${e.studentFirstName} ${e.studentLastName}`,
        grade: e.studentGrade,
        eventType: e.eventType,
        title: e.title,
        dueDate: e.dueDate,
        status: computedStatus,
        completedDate: e.completedDate,
        notes: e.notes,
        daysRemaining,
      });
    }

    const existingKeys = new Set(ceEvents.map(e => `${e.studentId}-${e.eventType}-${e.dueDate}`));

    if (!eventType || eventType === "all" || eventType === "annual_review" || eventType === "reeval_3yr") {
      const iepConditions: any[] = [eq(iepDocumentsTable.active, true), eq(studentsTable.status, "active")];
      if (sdFilters.schoolId) iepConditions.push(eq(studentsTable.schoolId, sdFilters.schoolId));
      if (sdFilters.districtId) iepConditions.push(sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId})`);

      const iepDocs = await db.select({
        id: iepDocumentsTable.id,
        studentId: iepDocumentsTable.studentId,
        iepEndDate: iepDocumentsTable.iepEndDate,
        iepStartDate: iepDocumentsTable.iepStartDate,
        studentFirstName: studentsTable.firstName,
        studentLastName: studentsTable.lastName,
        studentGrade: studentsTable.grade,
      })
        .from(iepDocumentsTable)
        .innerJoin(studentsTable, eq(iepDocumentsTable.studentId, studentsTable.id))
        .where(and(...iepConditions));

      for (const doc of iepDocs) {
        const annualDate = doc.iepEndDate;
        const annualKey = `${doc.studentId}-annual_review-${annualDate}`;
        if (!existingKeys.has(annualKey) && (!eventType || eventType === "all" || eventType === "annual_review")) {
          if ((!startDate || annualDate >= (startDate as string)) && (!endDate || annualDate <= (endDate as string))) {
            const daysRemaining = Math.ceil((new Date(annualDate).getTime() - new Date(today).getTime()) / 86400000);
            let status = "upcoming";
            if (daysRemaining < 0) status = "overdue";
            else if (daysRemaining <= 7) status = "critical";
            else if (daysRemaining <= 30) status = "due_soon";
            allEvents.push({
              id: `iep-annual-${doc.id}`,
              studentId: doc.studentId,
              studentName: `${doc.studentFirstName} ${doc.studentLastName}`,
              grade: doc.studentGrade,
              eventType: "annual_review",
              title: `Annual IEP Review — ${doc.studentFirstName} ${doc.studentLastName}`,
              dueDate: annualDate,
              status,
              completedDate: null,
              notes: null,
              daysRemaining,
            });
            existingKeys.add(annualKey);
          }
        }

        if (!eventType || eventType === "all" || eventType === "reeval_3yr") {
          const reevalDate3yr = new Date(doc.iepStartDate);
          reevalDate3yr.setFullYear(reevalDate3yr.getFullYear() + 3);
          const reevalStr = reevalDate3yr.toISOString().split("T")[0];
          const reevalKey = `${doc.studentId}-reeval_3yr-${reevalStr}`;
          if (!existingKeys.has(reevalKey)) {
            if ((!startDate || reevalStr >= (startDate as string)) && (!endDate || reevalStr <= (endDate as string))) {
              const daysRemaining = Math.ceil((reevalDate3yr.getTime() - new Date(today).getTime()) / 86400000);
              let status = "upcoming";
              if (daysRemaining < 0) status = "overdue";
              else if (daysRemaining <= 7) status = "critical";
              else if (daysRemaining <= 30) status = "due_soon";
              allEvents.push({
                id: `iep-reeval-${doc.id}`,
                studentId: doc.studentId,
                studentName: `${doc.studentFirstName} ${doc.studentLastName}`,
                grade: doc.studentGrade,
                eventType: "reeval_3yr",
                title: `3-Year Reevaluation — ${doc.studentFirstName} ${doc.studentLastName}`,
                dueDate: reevalStr,
                status,
                completedDate: null,
                notes: null,
                daysRemaining,
              });
              existingKeys.add(reevalKey);
            }
          }
        }
      }
    }

    if (!eventType || eventType === "all" || eventType === "team_meeting") {
      const tmConditions: any[] = [
        sql`${teamMeetingsTable.status} IN ('scheduled', 'confirmed', 'completed')`,
      ];
      if (startDate) tmConditions.push(gte(teamMeetingsTable.scheduledDate, startDate as string));
      if (endDate) tmConditions.push(lte(teamMeetingsTable.scheduledDate, endDate as string));
      if (sdFilters.schoolId) tmConditions.push(eq(teamMeetingsTable.schoolId, sdFilters.schoolId));
      if (sdFilters.districtId) tmConditions.push(sql`${teamMeetingsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId})`);

      const tmRows = await db.select({
        id: teamMeetingsTable.id,
        studentId: teamMeetingsTable.studentId,
        meetingType: teamMeetingsTable.meetingType,
        scheduledDate: teamMeetingsTable.scheduledDate,
        status: teamMeetingsTable.status,
        notes: teamMeetingsTable.notes,
        studentFirstName: studentsTable.firstName,
        studentLastName: studentsTable.lastName,
        studentGrade: studentsTable.grade,
      })
        .from(teamMeetingsTable)
        .innerJoin(studentsTable, eq(teamMeetingsTable.studentId, studentsTable.id))
        .where(and(...tmConditions))
        .limit(200);

      const mtLabels: Record<string, string> = {
        annual_review: "Annual Review Meeting",
        initial_iep: "Initial IEP Meeting",
        amendment: "IEP Amendment Meeting",
        reevaluation: "Reevaluation Meeting",
        transition: "Transition Meeting",
        manifestation_determination: "Manifestation Determination",
        eligibility: "Eligibility Meeting",
        progress_review: "Progress Review Meeting",
        other: "Team Meeting",
      };

      for (const m of tmRows) {
        const daysRemaining = Math.ceil((new Date(m.scheduledDate).getTime() - new Date(today).getTime()) / 86400000);
        let computedStatus = "upcoming";
        if (m.status === "completed") computedStatus = "completed";
        else if (daysRemaining < 0) computedStatus = "overdue";
        else if (daysRemaining <= 7) computedStatus = "critical";
        else if (daysRemaining <= 30) computedStatus = "due_soon";

        allEvents.push({
          id: `meeting-${m.id}`,
          studentId: m.studentId,
          studentName: `${m.studentFirstName} ${m.studentLastName}`,
          grade: m.studentGrade,
          eventType: "team_meeting",
          title: `${mtLabels[m.meetingType] ?? "Team Meeting"} — ${m.studentFirstName} ${m.studentLastName}`,
          dueDate: m.scheduledDate,
          status: computedStatus,
          completedDate: m.status === "completed" ? m.scheduledDate : null,
          notes: m.notes,
          daysRemaining,
        });
      }
    }

    allEvents.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const summary = {
      overdue: allEvents.filter(e => e.status === "overdue").length,
      critical: allEvents.filter(e => e.status === "critical").length,
      dueSoon: allEvents.filter(e => e.status === "due_soon").length,
      upcoming: allEvents.filter(e => e.status === "upcoming").length,
      completed: allEvents.filter(e => e.status === "completed").length,
      total: allEvents.length,
    };

    res.json({ events: allEvents, summary });
  } catch (e: any) {
    console.error("GET /dashboard/iep-calendar error:", e);
    res.status(500).json({ error: "Failed to fetch IEP calendar" });
  }
});

router.get("/dashboard/needs-attention", async (req, res): Promise<void> => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const [openIncidentsResult, unresolvedAlertsResult, actionItemsResult, pendingNotificationsResult] = await Promise.all([
      db.select({ count: count() })
        .from(restraintIncidentsTable)
        .where(eq(restraintIncidentsTable.status, "open")),
      db.select({ count: count() })
        .from(complianceEventsTable)
        .where(sql`${complianceEventsTable.status} NOT IN ('completed') AND ${complianceEventsTable.resolvedAt} IS NULL`),
      db.select({ actionItems: teamMeetingsTable.actionItems })
        .from(teamMeetingsTable)
        .where(
          and(
            sql`${teamMeetingsTable.actionItems} IS NOT NULL`,
            sql`jsonb_array_length(${teamMeetingsTable.actionItems}) > 0`,
          )
        ),
      db.select({ count: count() })
        .from(restraintIncidentsTable)
        .where(
          and(
            inArray(restraintIncidentsTable.status, ["under_review", "resolved"]),
            sql`${restraintIncidentsTable.parentNotificationSentAt} IS NULL`,
          )
        ),
    ]);

    const openIncidents = openIncidentsResult[0]?.count ?? 0;
    const unresolvedAlerts = unresolvedAlertsResult[0]?.count ?? 0;
    const pendingNotifications = pendingNotificationsResult[0]?.count ?? 0;

    type ActionItem = { status?: string; dueDate?: string };
    let overdueActionItems = 0;
    for (const row of actionItemsResult) {
      const items: ActionItem[] = Array.isArray(row.actionItems) ? (row.actionItems as ActionItem[]) : [];
      for (const item of items) {
        if (item.status === "open" && item.dueDate && item.dueDate < today) {
          overdueActionItems++;
        }
      }
    }

    const total = openIncidents + unresolvedAlerts + overdueActionItems + pendingNotifications;

    res.json({
      total,
      openIncidents,
      unresolvedAlerts,
      overdueActionItems,
      pendingNotifications,
    });
  } catch (e: any) {
    console.error("GET /dashboard/needs-attention error:", e);
    res.status(500).json({ error: "Failed to fetch needs-attention data" });
  }
});

export default router;
