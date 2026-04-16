import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, alertsTable, sessionLogsTable,
  scheduleBlocksTable, staffTable, staffAssignmentsTable,
  agencyContractsTable, agenciesTable,
  coverageInstancesTable,
} from "@workspace/db";
import { eq, and, gte, lte, count, sql, asc, isNull } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../../lib/minuteCalc";
import {
  resolveCallerDistrictId,
  parseSchoolDistrictFilters,
  buildStudentSubquery,
  buildSessionStudentFilter,
  buildAlertStudentFilter,
} from "./shared";

const router: IRouter = Router();

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

  const uncoveredConditions: any[] = [
    eq(coverageInstancesTable.absenceDate, todayStr),
    eq(coverageInstancesTable.isCovered, false),
  ];
  if (sdFilters.schoolId) {
    uncoveredConditions.push(sql`${coverageInstancesTable.originalStaffId} IN (SELECT id FROM staff WHERE school_id = ${sdFilters.schoolId})`);
  } else if (sdFilters.districtId) {
    uncoveredConditions.push(sql`${coverageInstancesTable.originalStaffId} IN (SELECT id FROM staff WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId}))`);
  }
  const [uncoveredResult] = await db
    .select({ count: count() })
    .from(coverageInstancesTable)
    .where(and(...uncoveredConditions));

  res.json({
    totalActiveStudents: activeStudentsResult?.count ?? 0,
    trackedStudents,
    onTrackStudents: onTrack,
    slightlyBehindStudents: slightlyBehind,
    atRiskStudents: atRisk,
    outOfComplianceStudents: outOfCompliance,
    missedSessionsThisWeek: missedThisWeek?.count ?? 0,
    openMakeupObligations: openMakeups?.count ?? 0,
    uncoveredBlocksToday: uncoveredResult?.count ?? 0,
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

export default router;
