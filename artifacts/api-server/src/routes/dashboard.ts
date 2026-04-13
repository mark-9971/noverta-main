import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, alertsTable, sessionLogsTable,
  scheduleBlocksTable, staffTable, staffAssignmentsTable
} from "@workspace/db";
import { eq, and, gte, lte, count, sql } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../lib/minuteCalc";

const router: IRouter = Router();

function parseSchoolDistrictFilters(query: any): { schoolId?: number; districtId?: number } {
  const filters: { schoolId?: number; districtId?: number } = {};
  if (query.schoolId) filters.schoolId = Number(query.schoolId);
  if (query.districtId) filters.districtId = Number(query.districtId);
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
  const sdFilters = parseSchoolDistrictFilters(req.query);
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

  res.json({
    totalActiveStudents: activeStudentsResult?.count ?? 0,
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
  });
});

router.get("/dashboard/risk-overview", async (req, res): Promise<void> => {
  const sdFilters = parseSchoolDistrictFilters(req.query);
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
  const sdFilters = parseSchoolDistrictFilters(req.query);
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
  const sdFilters = parseSchoolDistrictFilters(req.query);
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
  const sdFilters = parseSchoolDistrictFilters(req.query);
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
  const sdFilters = parseSchoolDistrictFilters(req.query);
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
  const sdFilters = parseSchoolDistrictFilters(req.query);
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

export default router;
