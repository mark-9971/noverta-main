import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, behaviorTargetsTable, programTargetsTable, dataSessionsTable,
  behaviorDataTable, programDataTable, sessionLogsTable, serviceTypesTable,
  serviceRequirementsTable, staffTable
} from "@workspace/db";
import { eq, and, gte, lte, count, sql, desc, asc } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../lib/minuteCalc";

const router: IRouter = Router();

router.get("/analytics/overview", async (_req, res): Promise<void> => {
  try {
    const [
      [studentsResult],
      [behaviorTargetsResult],
      [programTargetsResult],
      [dataSessionsResult],
      [sessionLogsResult],
      [completedResult],
      [missedResult],
    ] = await Promise.all([
      db.select({ count: count() }).from(studentsTable).where(eq(studentsTable.status, "active")),
      db.select({ count: count() }).from(behaviorTargetsTable).where(eq(behaviorTargetsTable.active, true)),
      db.select({ count: count() }).from(programTargetsTable).where(eq(programTargetsTable.active, true)),
      db.select({ count: count() }).from(dataSessionsTable),
      db.select({ count: count() }).from(sessionLogsTable),
      db.select({ count: count() }).from(sessionLogsTable).where(eq(sessionLogsTable.status, "completed")),
      db.select({ count: count() }).from(sessionLogsTable).where(eq(sessionLogsTable.status, "missed")),
    ]);

    const allProgress = await computeAllActiveMinuteProgress();
    const studentRisk = new Map<number, string>();
    for (const p of allProgress) {
      const current = studentRisk.get(p.studentId);
      const priority: Record<string, number> = { out_of_compliance: 4, at_risk: 3, slightly_behind: 2, on_track: 1, completed: 0 };
      if (!current || (priority[p.riskStatus] ?? 0) > (priority[current] ?? 0)) {
        studentRisk.set(p.studentId, p.riskStatus);
      }
    }
    const riskDistribution = {
      onTrack: [...studentRisk.values()].filter(v => v === "on_track" || v === "completed").length,
      slightlyBehind: [...studentRisk.values()].filter(v => v === "slightly_behind").length,
      atRisk: [...studentRisk.values()].filter(v => v === "at_risk").length,
      outOfCompliance: [...studentRisk.values()].filter(v => v === "out_of_compliance").length,
    };

    const totalDelivered = allProgress.reduce((s, p) => s + p.deliveredMinutes, 0);
    const totalRequired = allProgress.reduce((s, p) => s + p.requiredMinutes, 0);
    const avgCompliance = totalRequired > 0 ? Math.round((totalDelivered / totalRequired) * 100) : 0;

    res.json({
      activeStudents: studentsResult.count,
      activeBehaviorTargets: behaviorTargetsResult.count,
      activeProgramTargets: programTargetsResult.count,
      totalDataSessions: dataSessionsResult.count,
      totalSessionLogs: sessionLogsResult.count,
      completedSessions: completedResult.count,
      missedSessions: missedResult.count,
      completionRate: sessionLogsResult.count > 0 ? Math.round((completedResult.count / sessionLogsResult.count) * 100) : 0,
      avgCompliance,
      totalDeliveredMinutes: totalDelivered,
      totalRequiredMinutes: totalRequired,
      riskDistribution,
    });
  } catch (e: any) {
    console.error("analytics overview error:", e);
    res.status(500).json({ error: "Failed to fetch analytics overview" });
  }
});

router.get("/analytics/behavior-summary", async (_req, res): Promise<void> => {
  try {
    const weeklyTrends = await db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${dataSessionsTable.sessionDate}::date), 'YYYY-MM-DD')`.as("week"),
        avgValue: sql<number>`round(avg(${behaviorDataTable.value}::numeric), 2)`,
        totalPoints: count(),
      })
      .from(behaviorDataTable)
      .innerJoin(dataSessionsTable, eq(behaviorDataTable.dataSessionId, dataSessionsTable.id))
      .groupBy(sql`date_trunc('week', ${dataSessionsTable.sessionDate}::date)`)
      .orderBy(asc(sql`date_trunc('week', ${dataSessionsTable.sessionDate}::date)`));

    const targetSummaries = await db
      .select({
        targetId: behaviorTargetsTable.id,
        targetName: behaviorTargetsTable.name,
        studentId: behaviorTargetsTable.studentId,
        measurementType: behaviorTargetsTable.measurementType,
        targetDirection: behaviorTargetsTable.targetDirection,
        baselineValue: behaviorTargetsTable.baselineValue,
        goalValue: behaviorTargetsTable.goalValue,
        avgValue: sql<number>`round(avg(${behaviorDataTable.value}::numeric), 2)`,
        latestValue: sql<number>`(array_agg(${behaviorDataTable.value}::numeric order by ${dataSessionsTable.sessionDate} desc))[1]`,
        earliestValue: sql<number>`(array_agg(${behaviorDataTable.value}::numeric order by ${dataSessionsTable.sessionDate} asc))[1]`,
        dataPoints: count(),
      })
      .from(behaviorTargetsTable)
      .innerJoin(behaviorDataTable, eq(behaviorDataTable.behaviorTargetId, behaviorTargetsTable.id))
      .innerJoin(dataSessionsTable, eq(behaviorDataTable.dataSessionId, dataSessionsTable.id))
      .where(eq(behaviorTargetsTable.active, true))
      .groupBy(
        behaviorTargetsTable.id,
        behaviorTargetsTable.name,
        behaviorTargetsTable.studentId,
        behaviorTargetsTable.measurementType,
        behaviorTargetsTable.targetDirection,
        behaviorTargetsTable.baselineValue,
        behaviorTargetsTable.goalValue,
      );

    const students = await db.select({ id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName })
      .from(studentsTable).where(eq(studentsTable.status, "active"));
    const studentMap = new Map(students.map(s => [s.id, `${s.firstName} ${s.lastName}`]));

    const enriched = targetSummaries.map(t => {
      const earliest = Number(t.earliestValue) || 0;
      const latest = Number(t.latestValue) || 0;
      const direction = t.targetDirection;
      const change = latest - earliest;
      const improving = direction === "decrease" ? change < 0 : change > 0;
      const goal = Number(t.goalValue) || 0;
      const progressToGoal = goal !== 0 && earliest !== 0
        ? Math.min(100, Math.round(Math.abs((latest - earliest) / (goal - earliest)) * 100))
        : null;

      return {
        ...t,
        studentName: studentMap.get(t.studentId) || "Unknown",
        change: Math.round(change * 100) / 100,
        improving,
        progressToGoal,
      };
    });

    const improving = enriched.filter(t => t.improving).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 8);
    const worsening = enriched.filter(t => !t.improving && t.change !== 0).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 8);

    const measurementDist: Record<string, number> = {};
    for (const t of targetSummaries) {
      measurementDist[t.measurementType] = (measurementDist[t.measurementType] || 0) + 1;
    }

    res.json({
      weeklyTrends,
      topImproving: improving,
      topWorsening: worsening,
      measurementDistribution: Object.entries(measurementDist).map(([type, count]) => ({ type, count })),
      totalActiveTargets: targetSummaries.length,
    });
  } catch (e: any) {
    console.error("analytics behavior-summary error:", e);
    res.status(500).json({ error: "Failed to fetch behavior summary" });
  }
});

router.get("/analytics/program-summary", async (_req, res): Promise<void> => {
  try {
    const weeklyAccuracy = await db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${dataSessionsTable.sessionDate}::date), 'YYYY-MM-DD')`.as("week"),
        avgAccuracy: sql<number>`round(avg(${programDataTable.percentCorrect}::numeric), 1)`,
        totalTrials: sql<number>`sum(${programDataTable.trialsTotal})`,
        totalCorrect: sql<number>`sum(${programDataTable.trialsCorrect})`,
        dataPoints: count(),
      })
      .from(programDataTable)
      .innerJoin(dataSessionsTable, eq(programDataTable.dataSessionId, dataSessionsTable.id))
      .groupBy(sql`date_trunc('week', ${dataSessionsTable.sessionDate}::date)`)
      .orderBy(asc(sql`date_trunc('week', ${dataSessionsTable.sessionDate}::date)`));

    const programBreakdown = await db
      .select({
        programType: programTargetsTable.programType,
        count: count(),
        avgMasteryCriterion: sql<number>`round(avg(${programTargetsTable.masteryCriterionPercent}), 0)`,
      })
      .from(programTargetsTable)
      .where(eq(programTargetsTable.active, true))
      .groupBy(programTargetsTable.programType);

    const domainBreakdown = await db
      .select({
        domain: sql<string>`coalesce(${programTargetsTable.domain}, 'unspecified')`.as("domain"),
        count: count(),
      })
      .from(programTargetsTable)
      .where(eq(programTargetsTable.active, true))
      .groupBy(sql`coalesce(${programTargetsTable.domain}, 'unspecified')`);

    const targetPerformance = await db
      .select({
        targetId: programTargetsTable.id,
        targetName: programTargetsTable.name,
        studentId: programTargetsTable.studentId,
        programType: programTargetsTable.programType,
        masteryCriterion: programTargetsTable.masteryCriterionPercent,
        domain: programTargetsTable.domain,
        avgAccuracy: sql<number>`round(avg(${programDataTable.percentCorrect}::numeric), 1)`,
        latestAccuracy: sql<number>`(array_agg(${programDataTable.percentCorrect}::numeric order by ${dataSessionsTable.sessionDate} desc))[1]`,
        dataPoints: count(),
      })
      .from(programTargetsTable)
      .innerJoin(programDataTable, eq(programDataTable.programTargetId, programTargetsTable.id))
      .innerJoin(dataSessionsTable, eq(programDataTable.dataSessionId, dataSessionsTable.id))
      .where(eq(programTargetsTable.active, true))
      .groupBy(
        programTargetsTable.id,
        programTargetsTable.name,
        programTargetsTable.studentId,
        programTargetsTable.programType,
        programTargetsTable.masteryCriterionPercent,
        programTargetsTable.domain,
      );

    const students = await db.select({ id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName })
      .from(studentsTable).where(eq(studentsTable.status, "active"));
    const studentMap = new Map(students.map(s => [s.id, `${s.firstName} ${s.lastName}`]));

    const mastered = targetPerformance.filter(t => Number(t.latestAccuracy) >= (t.masteryCriterion ?? 80)).length;
    const nearMastery = targetPerformance.filter(t => {
      const acc = Number(t.latestAccuracy);
      const criterion = t.masteryCriterion ?? 80;
      return acc >= criterion - 15 && acc < criterion;
    }).length;
    const developing = targetPerformance.filter(t => {
      const acc = Number(t.latestAccuracy);
      const criterion = t.masteryCriterion ?? 80;
      return acc < criterion - 15;
    }).length;

    const promptDistribution = await db
      .select({
        promptLevel: programDataTable.promptLevelUsed,
        count: count(),
      })
      .from(programDataTable)
      .where(sql`${programDataTable.promptLevelUsed} is not null`)
      .groupBy(programDataTable.promptLevelUsed);

    res.json({
      weeklyAccuracy,
      programTypeBreakdown: programBreakdown.map(p => ({
        type: p.programType,
        count: p.count,
        avgMasteryCriterion: p.avgMasteryCriterion,
      })),
      domainBreakdown,
      masteryFunnel: { mastered, nearMastery, developing, total: targetPerformance.length },
      promptDistribution: promptDistribution.map(p => ({ level: p.promptLevel || "unknown", count: p.count })),
      topPerformers: targetPerformance
        .sort((a, b) => Number(b.latestAccuracy) - Number(a.latestAccuracy))
        .slice(0, 10)
        .map(t => ({ ...t, studentName: studentMap.get(t.studentId) || "Unknown" })),
      needsSupport: targetPerformance
        .sort((a, b) => Number(a.latestAccuracy) - Number(b.latestAccuracy))
        .slice(0, 10)
        .map(t => ({ ...t, studentName: studentMap.get(t.studentId) || "Unknown" })),
    });
  } catch (e: any) {
    console.error("analytics program-summary error:", e);
    res.status(500).json({ error: "Failed to fetch program summary" });
  }
});

router.get("/analytics/minutes-summary", async (_req, res): Promise<void> => {
  try {
    const weeklyDelivery = await db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${sessionLogsTable.sessionDate}::date), 'YYYY-MM-DD')`.as("week"),
        totalMinutes: sql<number>`sum(case when ${sessionLogsTable.status} = 'completed' then ${sessionLogsTable.durationMinutes} else 0 end)`,
        completedCount: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'completed')`,
        missedCount: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'missed')`,
      })
      .from(sessionLogsTable)
      .groupBy(sql`date_trunc('week', ${sessionLogsTable.sessionDate}::date)`)
      .orderBy(asc(sql`date_trunc('week', ${sessionLogsTable.sessionDate}::date)`));

    const byService = await db
      .select({
        serviceTypeName: serviceTypesTable.name,
        serviceCategory: serviceTypesTable.category,
        totalDelivered: sql<number>`sum(case when ${sessionLogsTable.status} = 'completed' then ${sessionLogsTable.durationMinutes} else 0 end)`,
        sessionCount: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'completed')`,
        missedCount: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'missed')`,
      })
      .from(sessionLogsTable)
      .innerJoin(serviceTypesTable, eq(sessionLogsTable.serviceTypeId, serviceTypesTable.id))
      .groupBy(serviceTypesTable.name, serviceTypesTable.category);

    const allProgress = await computeAllActiveMinuteProgress();
    const serviceAgg = new Map<string, { delivered: number; required: number }>();
    for (const p of allProgress) {
      const existing = serviceAgg.get(p.serviceTypeName) || { delivered: 0, required: 0 };
      existing.delivered += p.deliveredMinutes;
      existing.required += p.requiredMinutes;
      serviceAgg.set(p.serviceTypeName, existing);
    }
    const complianceByService = [...serviceAgg.entries()].map(([name, { delivered, required }]) => ({
      service: name,
      delivered,
      required,
      compliance: required > 0 ? Math.round((delivered / required) * 100) : 0,
    }));

    const staffUtilization = await db
      .select({
        staffId: staffTable.id,
        staffName: sql<string>`${staffTable.firstName} || ' ' || ${staffTable.lastName}`,
        role: staffTable.role,
        totalMinutes: sql<number>`sum(case when ${sessionLogsTable.status} = 'completed' then ${sessionLogsTable.durationMinutes} else 0 end)`,
        sessionCount: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'completed')`,
        missedCount: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'missed')`,
      })
      .from(sessionLogsTable)
      .innerJoin(staffTable, eq(sessionLogsTable.staffId, staffTable.id))
      .groupBy(staffTable.id, staffTable.firstName, staffTable.lastName, staffTable.role)
      .orderBy(desc(sql`sum(case when ${sessionLogsTable.status} = 'completed' then ${sessionLogsTable.durationMinutes} else 0 end)`));

    const dayOfWeekPattern = await db
      .select({
        dayOfWeek: sql<number>`extract(isodow from ${sessionLogsTable.sessionDate}::date)::int`.as("dow"),
        totalMinutes: sql<number>`sum(case when ${sessionLogsTable.status} = 'completed' then ${sessionLogsTable.durationMinutes} else 0 end)`,
        sessionCount: count(),
      })
      .from(sessionLogsTable)
      .groupBy(sql`extract(isodow from ${sessionLogsTable.sessionDate}::date)`)
      .orderBy(asc(sql`extract(isodow from ${sessionLogsTable.sessionDate}::date)`));

    const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    res.json({
      weeklyDelivery,
      byService,
      complianceByService,
      staffUtilization: staffUtilization.slice(0, 20),
      dayOfWeekPattern: dayOfWeekPattern.map(d => ({
        day: dayNames[d.dayOfWeek] || `Day ${d.dayOfWeek}`,
        totalMinutes: d.totalMinutes,
        sessionCount: d.sessionCount,
      })),
    });
  } catch (e: any) {
    console.error("analytics minutes-summary error:", e);
    res.status(500).json({ error: "Failed to fetch minutes summary" });
  }
});

router.get("/analytics/delivery-heatmap", async (_req, res): Promise<void> => {
  try {
    const heatmapData = await db
      .select({
        dayOfWeek: sql<number>`extract(isodow from ${sessionLogsTable.sessionDate}::date)::int`.as("dow"),
        hour: sql<number>`extract(hour from ${sessionLogsTable.startTime}::time)::int`.as("hr"),
        sessionCount: count(),
        totalMinutes: sql<number>`sum(${sessionLogsTable.durationMinutes})`,
      })
      .from(sessionLogsTable)
      .where(and(
        eq(sessionLogsTable.status, "completed"),
        sql`${sessionLogsTable.startTime} is not null`
      ))
      .groupBy(
        sql`extract(isodow from ${sessionLogsTable.sessionDate}::date)`,
        sql`extract(hour from ${sessionLogsTable.startTime}::time)`
      );

    const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const grid = heatmapData.map(d => ({
      day: dayNames[d.dayOfWeek] || `Day ${d.dayOfWeek}`,
      dayIndex: d.dayOfWeek,
      hour: d.hour,
      sessions: d.sessionCount,
      minutes: d.totalMinutes,
    }));

    res.json({ heatmap: grid });
  } catch (e: any) {
    console.error("analytics delivery-heatmap error:", e);
    res.status(500).json({ error: "Failed to fetch delivery heatmap" });
  }
});

export default router;
