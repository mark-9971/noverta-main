import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, alertsTable, sessionLogsTable, serviceRequirementsTable,
  scheduleBlocksTable, staffTable, serviceTypesTable, staffAssignmentsTable
} from "@workspace/db";
import { eq, and, gte, lte, count, desc, sql } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../lib/minuteCalc";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartStr = weekStart.toISOString().substring(0, 10);
  const todayStr = today.toISOString().substring(0, 10);

  const [activeStudentsResult] = await db
    .select({ count: count() })
    .from(studentsTable)
    .where(eq(studentsTable.status, "active"));

  const allProgress = await computeAllActiveMinuteProgress();

  const studentRisk = new Map<number, string>();
  for (const p of allProgress) {
    const current = studentRisk.get(p.studentId);
    const priority: Record<string, number> = {
      out_of_compliance: 4,
      at_risk: 3,
      slightly_behind: 2,
      on_track: 1,
      completed: 0,
    };
    if (!current || (priority[p.riskStatus] ?? 0) > (priority[current] ?? 0)) {
      studentRisk.set(p.studentId, p.riskStatus);
    }
  }

  const onTrack = [...studentRisk.values()].filter(v => v === "on_track" || v === "completed").length;
  const slightlyBehind = [...studentRisk.values()].filter(v => v === "slightly_behind").length;
  const atRisk = [...studentRisk.values()].filter(v => v === "at_risk").length;
  const outOfCompliance = [...studentRisk.values()].filter(v => v === "out_of_compliance").length;

  const [missedThisWeek] = await db
    .select({ count: count() })
    .from(sessionLogsTable)
    .where(and(
      eq(sessionLogsTable.status, "missed"),
      gte(sessionLogsTable.sessionDate, weekStartStr),
      lte(sessionLogsTable.sessionDate, todayStr)
    ));

  const [openMakeups] = await db
    .select({ count: count() })
    .from(sessionLogsTable)
    .where(and(eq(sessionLogsTable.status, "missed")));

  const [openAlerts] = await db
    .select({ count: count() })
    .from(alertsTable)
    .where(eq(alertsTable.resolved, false));

  const [criticalAlerts] = await db
    .select({ count: count() })
    .from(alertsTable)
    .where(and(eq(alertsTable.resolved, false), eq(alertsTable.severity, "critical")));

  // Schedule conflicts
  const allBlocks = await db
    .select({
      staffId: scheduleBlocksTable.staffId,
      dayOfWeek: scheduleBlocksTable.dayOfWeek,
      startTime: scheduleBlocksTable.startTime,
      endTime: scheduleBlocksTable.endTime,
    })
    .from(scheduleBlocksTable)
    .where(eq(scheduleBlocksTable.isRecurring, true));

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
    openAlerts: openAlerts?.count ?? 0,
    criticalAlerts: criticalAlerts?.count ?? 0,
  });
});

router.get("/dashboard/risk-overview", async (req, res): Promise<void> => {
  const allProgress = await computeAllActiveMinuteProgress();
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
  const providers = await db
    .select()
    .from(staffTable)
    .where(and(
      eq(staffTable.status, "active"),
      // bcba or provider roles
    ));

  const allProgress = await computeAllActiveMinuteProgress();

  const result = await Promise.all(providers.map(async (p) => {
    const caseloadProgress = allProgress.filter(prog => prog.providerId === p.id);
    const assignedStudents = new Set(caseloadProgress.map(prog => prog.studentId)).size;
    const totalRequired = caseloadProgress.reduce((sum, prog) => sum + prog.requiredMinutes, 0);
    const totalDelivered = caseloadProgress.reduce((sum, prog) => sum + prog.deliveredMinutes, 0);
    const studentsAtRisk = caseloadProgress.filter(prog =>
      prog.riskStatus === "at_risk" || prog.riskStatus === "out_of_compliance"
    ).length;

    const [openAlerts] = await db
      .select({ count: count() })
      .from(alertsTable)
      .where(and(eq(alertsTable.staffId, p.id), eq(alertsTable.resolved, false)));

    const utilizationPercent = totalRequired > 0 ? Math.round((totalDelivered / totalRequired) * 100) : 0;

    return {
      staffId: p.id,
      staffName: `${p.firstName} ${p.lastName}`,
      role: p.role,
      assignedStudents,
      totalRequiredMinutes: totalRequired,
      totalDeliveredMinutes: totalDelivered,
      studentsAtRisk,
      openAlerts: openAlerts?.count ?? 0,
      utilizationPercent,
    };
  }));

  res.json(result);
});

router.get("/dashboard/para-summary", async (req, res): Promise<void> => {
  const paras = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.status, "active"), eq(staffTable.role, "para")));

  const result = await Promise.all(paras.map(async (p) => {
    const blocks = await db
      .select({ count: count() })
      .from(scheduleBlocksTable)
      .where(and(eq(scheduleBlocksTable.staffId, p.id), eq(scheduleBlocksTable.isRecurring, true)));

    const assignments = await db
      .select({ count: count() })
      .from(staffAssignmentsTable)
      .where(eq(staffAssignmentsTable.staffId, p.id));

    return {
      staffId: p.id,
      staffName: `${p.firstName} ${p.lastName}`,
      assignedBlocks: blocks[0]?.count ?? 0,
      coverageGaps: 0,
      conflictsToday: 0,
      assignedStudents: assignments[0]?.count ?? 0,
    };
  }));

  res.json(result);
});

router.get("/dashboard/alerts-summary", async (req, res): Promise<void> => {
  const severities = ["critical", "high", "medium", "low"];
  const counts: Record<string, number> = {};
  for (const severity of severities) {
    const [result] = await db
      .select({ count: count() })
      .from(alertsTable)
      .where(and(eq(alertsTable.resolved, false), eq(alertsTable.severity, severity)));
    counts[severity] = result?.count ?? 0;
  }
  const [total] = await db
    .select({ count: count() })
    .from(alertsTable)
    .where(eq(alertsTable.resolved, false));

  res.json({
    critical: counts.critical ?? 0,
    high: counts.high ?? 0,
    medium: counts.medium ?? 0,
    low: counts.low ?? 0,
    total: total?.count ?? 0,
  });
});

router.get("/dashboard/compliance-by-service", async (req, res): Promise<void> => {
  const allProgress = await computeAllActiveMinuteProgress();
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
  const weeks = [];
  const today = new Date();

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

    const [missed] = await db
      .select({ count: count() })
      .from(sessionLogsTable)
      .where(and(
        eq(sessionLogsTable.status, "missed"),
        gte(sessionLogsTable.sessionDate, mondayStr),
        lte(sessionLogsTable.sessionDate, sundayStr)
      ));

    const [completed] = await db
      .select({ count: count() })
      .from(sessionLogsTable)
      .where(and(
        eq(sessionLogsTable.status, "completed"),
        gte(sessionLogsTable.sessionDate, mondayStr),
        lte(sessionLogsTable.sessionDate, sundayStr)
      ));

    const month = monday.toLocaleString("default", { month: "short" });
    const day = monday.getDate();

    weeks.push({
      weekLabel: `${month} ${day}`,
      missedCount: missed?.count ?? 0,
      completedCount: completed?.count ?? 0,
    });
  }

  res.json(weeks);
});

export default router;
