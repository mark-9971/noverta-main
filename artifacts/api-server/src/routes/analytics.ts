import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, behaviorTargetsTable, programTargetsTable, dataSessionsTable,
  behaviorDataTable, programDataTable, sessionLogsTable, serviceTypesTable,
  serviceRequirementsTable, staffTable, restraintIncidentsTable, phaseChangesTable,
} from "@workspace/db";
import { eq, and, gte, lte, count, sql, desc, asc, isNotNull } from "drizzle-orm";
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

router.get("/analytics/student/:studentId", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }

    const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
    if (!student) { res.status(404).json({ error: "Student not found" }); return; }

    const [behaviorTargets, programTargets, sessionLogStats, dataSessionStats] = await Promise.all([
      db.select({
        id: behaviorTargetsTable.id,
        name: behaviorTargetsTable.name,
        measurementType: behaviorTargetsTable.measurementType,
        targetDirection: behaviorTargetsTable.targetDirection,
        baselineValue: behaviorTargetsTable.baselineValue,
        goalValue: behaviorTargetsTable.goalValue,
        active: behaviorTargetsTable.active,
      }).from(behaviorTargetsTable).where(eq(behaviorTargetsTable.studentId, studentId)),

      db.select({
        id: programTargetsTable.id,
        name: programTargetsTable.name,
        programType: programTargetsTable.programType,
        domain: programTargetsTable.domain,
        masteryCriterionPercent: programTargetsTable.masteryCriterionPercent,
        currentStep: programTargetsTable.currentStep,
        active: programTargetsTable.active,
      }).from(programTargetsTable).where(eq(programTargetsTable.studentId, studentId)),

      db.select({
        totalSessions: count(),
        completedSessions: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'completed')`,
        missedSessions: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'missed')`,
        totalMinutes: sql<number>`coalesce(sum(case when ${sessionLogsTable.status} = 'completed' then ${sessionLogsTable.durationMinutes} else 0 end), 0)`,
      }).from(sessionLogsTable).where(eq(sessionLogsTable.studentId, studentId)),

      db.select({ count: count() }).from(dataSessionsTable).where(eq(dataSessionsTable.studentId, studentId)),
    ]);

    const behaviorWeekly = await db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${dataSessionsTable.sessionDate}::date), 'YYYY-MM-DD')`.as("week"),
        targetId: behaviorDataTable.behaviorTargetId,
        avgValue: sql<number>`round(avg(${behaviorDataTable.value}::numeric), 2)`,
        minValue: sql<number>`min(${behaviorDataTable.value}::numeric)`,
        maxValue: sql<number>`max(${behaviorDataTable.value}::numeric)`,
        dataPoints: count(),
      })
      .from(behaviorDataTable)
      .innerJoin(dataSessionsTable, eq(behaviorDataTable.dataSessionId, dataSessionsTable.id))
      .where(eq(dataSessionsTable.studentId, studentId))
      .groupBy(sql`date_trunc('week', ${dataSessionsTable.sessionDate}::date)`, behaviorDataTable.behaviorTargetId)
      .orderBy(asc(sql`date_trunc('week', ${dataSessionsTable.sessionDate}::date)`));

    const programWeekly = await db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${dataSessionsTable.sessionDate}::date), 'YYYY-MM-DD')`.as("week"),
        targetId: programDataTable.programTargetId,
        avgAccuracy: sql<number>`round(avg(${programDataTable.percentCorrect}::numeric), 1)`,
        totalTrials: sql<number>`sum(${programDataTable.trialsTotal})`,
        totalCorrect: sql<number>`sum(${programDataTable.trialsCorrect})`,
        dataPoints: count(),
      })
      .from(programDataTable)
      .innerJoin(dataSessionsTable, eq(programDataTable.dataSessionId, dataSessionsTable.id))
      .where(eq(dataSessionsTable.studentId, studentId))
      .groupBy(sql`date_trunc('week', ${dataSessionsTable.sessionDate}::date)`, programDataTable.programTargetId)
      .orderBy(asc(sql`date_trunc('week', ${dataSessionsTable.sessionDate}::date)`));

    const sessionWeekly = await db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${sessionLogsTable.sessionDate}::date), 'YYYY-MM-DD')`.as("week"),
        completed: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'completed')`,
        missed: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'missed')`,
        totalMinutes: sql<number>`coalesce(sum(case when ${sessionLogsTable.status} = 'completed' then ${sessionLogsTable.durationMinutes} else 0 end), 0)`,
      })
      .from(sessionLogsTable)
      .where(eq(sessionLogsTable.studentId, studentId))
      .groupBy(sql`date_trunc('week', ${sessionLogsTable.sessionDate}::date)`)
      .orderBy(asc(sql`date_trunc('week', ${sessionLogsTable.sessionDate}::date)`));

    const serviceBreakdown = await db
      .select({
        serviceTypeName: serviceTypesTable.name,
        completedSessions: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'completed')`,
        missedSessions: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'missed')`,
        totalMinutes: sql<number>`coalesce(sum(case when ${sessionLogsTable.status} = 'completed' then ${sessionLogsTable.durationMinutes} else 0 end), 0)`,
      })
      .from(sessionLogsTable)
      .innerJoin(serviceTypesTable, eq(sessionLogsTable.serviceTypeId, serviceTypesTable.id))
      .where(eq(sessionLogsTable.studentId, studentId))
      .groupBy(serviceTypesTable.name);

    const promptProgression = await db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${dataSessionsTable.sessionDate}::date), 'YYYY-MM-DD')`.as("week"),
        targetId: programDataTable.programTargetId,
        avgPromptIndex: sql<number>`round(avg(case
          when ${programDataTable.promptLevelUsed} = 'independent' then 6
          when ${programDataTable.promptLevelUsed} = 'verbal' then 5
          when ${programDataTable.promptLevelUsed} = 'gestural' then 4
          when ${programDataTable.promptLevelUsed} = 'model' then 3
          when ${programDataTable.promptLevelUsed} = 'partial_physical' then 2
          when ${programDataTable.promptLevelUsed} = 'full_physical' then 1
          else 0 end), 2)`,
      })
      .from(programDataTable)
      .innerJoin(dataSessionsTable, eq(programDataTable.dataSessionId, dataSessionsTable.id))
      .where(and(
        eq(dataSessionsTable.studentId, studentId),
        sql`${programDataTable.promptLevelUsed} is not null`
      ))
      .groupBy(sql`date_trunc('week', ${dataSessionsTable.sessionDate}::date)`, programDataTable.programTargetId)
      .orderBy(asc(sql`date_trunc('week', ${dataSessionsTable.sessionDate}::date)`));

    const dayPattern = await db
      .select({
        dayOfWeek: sql<number>`extract(isodow from ${sessionLogsTable.sessionDate}::date)::int`.as("dow"),
        sessionCount: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'completed')`,
        totalMinutes: sql<number>`coalesce(sum(case when ${sessionLogsTable.status} = 'completed' then ${sessionLogsTable.durationMinutes} else 0 end), 0)`,
      })
      .from(sessionLogsTable)
      .where(eq(sessionLogsTable.studentId, studentId))
      .groupBy(sql`extract(isodow from ${sessionLogsTable.sessionDate}::date)`)
      .orderBy(asc(sql`extract(isodow from ${sessionLogsTable.sessionDate}::date)`));

    const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    const allProgress = await computeAllActiveMinuteProgress();
    const studentProgress = allProgress.filter(p => p.studentId === studentId);
    const complianceByService = studentProgress.map(p => ({
      service: p.serviceTypeName,
      delivered: p.deliveredMinutes,
      required: p.requiredMinutes,
      compliance: p.requiredMinutes > 0 ? Math.round((p.deliveredMinutes / p.requiredMinutes) * 100) : 0,
      riskStatus: p.riskStatus,
    }));

    const behaviorTargetMap = new Map(behaviorTargets.map(bt => [bt.id, bt]));
    const programTargetMap = new Map(programTargets.map(pt => [pt.id, pt]));

    const behaviorAnalysis = behaviorTargets.filter(bt => bt.active).map(bt => {
      const weekly = behaviorWeekly.filter(w => w.targetId === bt.id);
      const values = weekly.map(w => Number(w.avgValue));
      const firstHalf = values.slice(0, Math.max(1, Math.floor(values.length / 2)));
      const secondHalf = values.slice(Math.floor(values.length / 2));
      const firstAvg = firstHalf.length > 0 ? firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length : 0;
      const secondAvg = secondHalf.length > 0 ? secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length : 0;
      const changeRate = firstAvg !== 0 ? Math.round(((secondAvg - firstAvg) / firstAvg) * 100) : 0;
      const isImproving = bt.targetDirection === "decrease" ? secondAvg < firstAvg : secondAvg > firstAvg;
      const goal = Number(bt.goalValue) || 0;
      const baseline = Number(bt.baselineValue) || 0;
      const latest = values.length > 0 ? values[values.length - 1] : baseline;
      const progressToGoal = baseline !== goal ? Math.min(100, Math.max(0, Math.round(Math.abs((latest - baseline) / (goal - baseline)) * 100))) : 0;
      const variability = values.length > 1 ? Math.round(Math.sqrt(values.reduce((s, v) => s + Math.pow(v - (values.reduce((a, b) => a + b, 0) / values.length), 2), 0) / values.length) * 100) / 100 : 0;

      return {
        ...bt,
        weeklyTrends: weekly,
        changeRate,
        isImproving,
        progressToGoal,
        latest,
        variability,
        totalDataPoints: weekly.reduce((s, w) => s + w.dataPoints, 0),
      };
    });

    const programAnalysis = programTargets.filter(pt => pt.active).map(pt => {
      const weekly = programWeekly.filter(w => w.targetId === pt.id);
      const prompts = promptProgression.filter(p => p.targetId === pt.id);
      const accuracies = weekly.map(w => Number(w.avgAccuracy));
      const latestAccuracy = accuracies.length > 0 ? accuracies[accuracies.length - 1] : 0;
      const masteryMet = latestAccuracy >= (pt.masteryCriterionPercent ?? 80);
      const firstHalf = accuracies.slice(0, Math.max(1, Math.floor(accuracies.length / 2)));
      const secondHalf = accuracies.slice(Math.floor(accuracies.length / 2));
      const firstAvg = firstHalf.length > 0 ? firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length : 0;
      const secondAvg = secondHalf.length > 0 ? secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length : 0;
      const changeRate = firstAvg !== 0 ? Math.round(((secondAvg - firstAvg) / firstAvg) * 100) : 0;
      const totalTrials = weekly.reduce((s, w) => s + Number(w.totalTrials), 0);
      const totalCorrect = weekly.reduce((s, w) => s + Number(w.totalCorrect), 0);
      const overallAccuracy = totalTrials > 0 ? Math.round((totalCorrect / totalTrials) * 100) : 0;

      return {
        ...pt,
        weeklyTrends: weekly,
        promptProgression: prompts,
        latestAccuracy,
        masteryMet,
        changeRate,
        totalTrials,
        overallAccuracy,
      };
    });

    res.json({
      student: { id: student.id, firstName: student.firstName, lastName: student.lastName, grade: student.grade, disabilityCategory: student.disabilityCategory },
      summary: {
        totalSessions: sessionLogStats[0].totalSessions,
        completedSessions: sessionLogStats[0].completedSessions,
        missedSessions: sessionLogStats[0].missedSessions,
        totalMinutes: sessionLogStats[0].totalMinutes,
        completionRate: sessionLogStats[0].totalSessions > 0 ? Math.round(sessionLogStats[0].completedSessions / sessionLogStats[0].totalSessions * 100) : 0,
        dataSessionCount: dataSessionStats[0].count,
        activeBehaviorTargets: behaviorTargets.filter(bt => bt.active).length,
        activeProgramTargets: programTargets.filter(pt => pt.active).length,
      },
      behaviorAnalysis,
      programAnalysis,
      sessionWeekly,
      serviceBreakdown,
      complianceByService,
      dayPattern: dayPattern.map(d => ({
        day: dayNames[d.dayOfWeek] || `Day ${d.dayOfWeek}`,
        sessions: d.sessionCount,
        minutes: d.totalMinutes,
      })),
    });
  } catch (e: any) {
    console.error("analytics student error:", e);
    res.status(500).json({ error: "Failed to fetch student analytics" });
  }
});

router.get("/analytics/pm-overview", async (_req, res): Promise<void> => {
  try {
    const [totalRow] = await db.select({ total: count() }).from(restraintIncidentsTable);
    const [injuryRow] = await db.select({ injuries: count() }).from(restraintIncidentsTable)
      .where(sql`${restraintIncidentsTable.studentInjury} = TRUE OR ${restraintIncidentsTable.staffInjury} = TRUE`);
    const [medicalRow] = await db.select({ medical: count() }).from(restraintIncidentsTable)
      .where(eq(restraintIncidentsTable.medicalAttentionRequired, true));
    const [deseRow] = await db.select({ pending: count() }).from(restraintIncidentsTable)
      .where(and(eq(restraintIncidentsTable.deseReportRequired, true), sql`${restraintIncidentsTable.deseReportSentAt} IS NULL`));
    const [pendingRow] = await db.select({ pending: count() }).from(restraintIncidentsTable)
      .where(eq(restraintIncidentsTable.status, "pending_review"));
    const [avgDurRow] = await db.select({
      avg: sql<number>`ROUND(AVG(${restraintIncidentsTable.durationMinutes}))`,
    }).from(restraintIncidentsTable).where(isNotNull(restraintIncidentsTable.durationMinutes));

    const studentsAffected = await db
      .selectDistinct({ studentId: restraintIncidentsTable.studentId })
      .from(restraintIncidentsTable);

    const byType = await db
      .select({ type: restraintIncidentsTable.incidentType, cnt: count() })
      .from(restraintIncidentsTable)
      .groupBy(restraintIncidentsTable.incidentType)
      .orderBy(desc(count()));

    const monthlyTrend = await db
      .select({
        month: sql<string>`TO_CHAR(${restraintIncidentsTable.incidentDate}::date, 'YYYY-MM')`,
        type: restraintIncidentsTable.incidentType,
        cnt: count(),
      })
      .from(restraintIncidentsTable)
      .groupBy(sql`TO_CHAR(${restraintIncidentsTable.incidentDate}::date, 'YYYY-MM')`, restraintIncidentsTable.incidentType)
      .orderBy(sql`TO_CHAR(${restraintIncidentsTable.incidentDate}::date, 'YYYY-MM')`);

    const monthlyAgg: Record<string, Record<string, number>> = {};
    for (const row of monthlyTrend) {
      if (!monthlyAgg[row.month]) monthlyAgg[row.month] = {};
      monthlyAgg[row.month][row.type] = row.cnt;
    }
    const monthlyTrendFormatted = Object.entries(monthlyAgg)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, types]) => ({ month, ...types, total: Object.values(types).reduce((s, v) => s + v, 0) }));

    const bipRow = await db.select({ count: count() }).from(restraintIncidentsTable).where(eq(restraintIncidentsTable.bipInPlace, true));
    const debriefRow = await db.select({ count: count() }).from(restraintIncidentsTable).where(eq(restraintIncidentsTable.debriefConducted, true));

    res.json({
      totalIncidents: totalRow.total,
      studentsAffected: studentsAffected.length,
      injuryCount: injuryRow.injuries,
      injuryRate: totalRow.total > 0 ? Math.round((injuryRow.injuries / totalRow.total) * 100) : 0,
      medicalCount: medicalRow.medical,
      desePending: deseRow.pending,
      pendingReview: pendingRow.pending,
      avgDurationMinutes: avgDurRow.avg ?? 0,
      bipRate: totalRow.total > 0 ? Math.round((bipRow[0].count / totalRow.total) * 100) : 0,
      debriefRate: totalRow.total > 0 ? Math.round((debriefRow[0].count / totalRow.total) * 100) : 0,
      byType: byType.map(r => ({ type: r.type, count: r.cnt })),
      monthlyTrend: monthlyTrendFormatted,
    });
  } catch (e: any) {
    console.error("pm-overview error:", e);
    res.status(500).json({ error: "Failed to fetch PM overview" });
  }
});

router.get("/analytics/pm-by-student", async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        studentId: restraintIncidentsTable.studentId,
        firstName: studentsTable.firstName,
        lastName: studentsTable.lastName,
        grade: studentsTable.grade,
        total: count(),
        injuries: sql<number>`SUM(CASE WHEN ${restraintIncidentsTable.studentInjury} = TRUE OR ${restraintIncidentsTable.staffInjury} = TRUE THEN 1 ELSE 0 END)`,
        physical: sql<number>`SUM(CASE WHEN ${restraintIncidentsTable.incidentType} = 'physical_restraint' THEN 1 ELSE 0 END)`,
        seclusion: sql<number>`SUM(CASE WHEN ${restraintIncidentsTable.incidentType} = 'seclusion' THEN 1 ELSE 0 END)`,
        avgDuration: sql<number>`ROUND(AVG(${restraintIncidentsTable.durationMinutes}))`,
        lastIncident: sql<string>`MAX(${restraintIncidentsTable.incidentDate})`,
      })
      .from(restraintIncidentsTable)
      .leftJoin(studentsTable, eq(restraintIncidentsTable.studentId, studentsTable.id))
      .groupBy(restraintIncidentsTable.studentId, studentsTable.firstName, studentsTable.lastName, studentsTable.grade)
      .orderBy(desc(count()));

    res.json(rows);
  } catch (e: any) {
    console.error("pm-by-student error:", e);
    res.status(500).json({ error: "Failed to fetch PM by student" });
  }
});

router.get("/analytics/pm-antecedents", async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        category: restraintIncidentsTable.antecedentCategory,
        count: count(),
        injuries: sql<number>`SUM(CASE WHEN ${restraintIncidentsTable.studentInjury} = TRUE THEN 1 ELSE 0 END)`,
        avgDuration: sql<number>`ROUND(AVG(${restraintIncidentsTable.durationMinutes}))`,
      })
      .from(restraintIncidentsTable)
      .where(isNotNull(restraintIncidentsTable.antecedentCategory))
      .groupBy(restraintIncidentsTable.antecedentCategory)
      .orderBy(desc(count()));

    const total = rows.reduce((s, r) => s + r.count, 0);
    res.json(rows.map(r => ({
      category: r.category,
      count: r.count,
      percentage: total > 0 ? Math.round((r.count / total) * 100) : 0,
      injuries: r.injuries,
      avgDuration: r.avgDuration,
    })));
  } catch (e: any) {
    console.error("pm-antecedents error:", e);
    res.status(500).json({ error: "Failed to fetch PM antecedents" });
  }
});

router.get("/analytics/pm-episode-ratio", async (_req, res): Promise<void> => {
  try {
    const [behaviorSessions] = await db.select({ total: count() }).from(dataSessionsTable);
    const [pmTotal] = await db.select({ total: count() }).from(restraintIncidentsTable);
    const [physicalTotal] = await db.select({ total: count() })
      .from(restraintIncidentsTable)
      .where(eq(restraintIncidentsTable.incidentType, "physical_restraint"));

    const ratio = behaviorSessions.total > 0
      ? Math.round((pmTotal.total / behaviorSessions.total) * 1000) / 10
      : 0;

    const studentEpisodeCounts = await db
      .select({
        studentId: dataSessionsTable.studentId,
        sessions: count(),
      })
      .from(dataSessionsTable)
      .groupBy(dataSessionsTable.studentId);

    const studentPmCounts = await db
      .select({
        studentId: restraintIncidentsTable.studentId,
        incidents: count(),
      })
      .from(restraintIncidentsTable)
      .groupBy(restraintIncidentsTable.studentId);

    const pmMap = new Map(studentPmCounts.map(r => [r.studentId, r.incidents]));

    const perStudent = studentEpisodeCounts
      .filter(r => pmMap.has(r.studentId))
      .map(r => {
        const incidents = pmMap.get(r.studentId) ?? 0;
        return {
          studentId: r.studentId,
          sessions: r.sessions,
          incidents,
          ratio: r.sessions > 0 ? Math.round((incidents / r.sessions) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 10);

    res.json({
      totalBehaviorSessions: behaviorSessions.total,
      totalPmIncidents: pmTotal.total,
      totalPhysicalRestraints: physicalTotal.total,
      episodeToPmRatio: ratio,
      perStudent,
    });
  } catch (e: any) {
    console.error("pm-episode-ratio error:", e);
    res.status(500).json({ error: "Failed to fetch PM episode ratio" });
  }
});

router.get("/analytics/pm-phase-trends", async (req, res): Promise<void> => {
  try {
    const studentId = req.query.studentId ? Number(req.query.studentId) : undefined;

    const phases = await db
      .select({
        id: phaseChangesTable.id,
        studentId: phaseChangesTable.studentId,
        targetId: phaseChangesTable.targetId,
        changeDate: phaseChangesTable.changeDate,
        fromPhase: phaseChangesTable.fromPhase,
        toPhase: phaseChangesTable.toPhase,
        reason: phaseChangesTable.reason,
      })
      .from(phaseChangesTable)
      .where(studentId ? eq(phaseChangesTable.studentId, studentId) : undefined)
      .orderBy(phaseChangesTable.studentId, phaseChangesTable.changeDate);

    const incidents = await db
      .select({
        studentId: restraintIncidentsTable.studentId,
        incidentDate: restraintIncidentsTable.incidentDate,
        incidentType: restraintIncidentsTable.incidentType,
        studentInjury: restraintIncidentsTable.studentInjury,
      })
      .from(restraintIncidentsTable)
      .where(studentId ? eq(restraintIncidentsTable.studentId, studentId) : undefined)
      .orderBy(restraintIncidentsTable.studentId, restraintIncidentsTable.incidentDate);

    const byStudent: Record<number, { phases: typeof phases; incidents: typeof incidents }> = {};
    for (const p of phases) {
      if (!byStudent[p.studentId]) byStudent[p.studentId] = { phases: [], incidents: [] };
      byStudent[p.studentId].phases.push(p);
    }
    for (const inc of incidents) {
      if (!byStudent[inc.studentId]) byStudent[inc.studentId] = { phases: [], incidents: [] };
      byStudent[inc.studentId].incidents.push(inc);
    }

    const results = Object.entries(byStudent).map(([sid, data]) => {
      const sortedPhases = data.phases.sort((a, b) => a.changeDate.localeCompare(b.changeDate));
      const analysis = sortedPhases.map((phase, idx) => {
        const start = phase.changeDate;
        const end = sortedPhases[idx + 1]?.changeDate ?? "2099-01-01";
        const phaseBefore = idx > 0 ? {
          start: sortedPhases[idx - 1].changeDate,
          end: start,
          count: data.incidents.filter(i => i.incidentDate >= sortedPhases[idx - 1].changeDate && i.incidentDate < start).length,
        } : null;
        const phaseAfter = {
          start, end,
          count: data.incidents.filter(i => i.incidentDate >= start && i.incidentDate < end).length,
        };
        return { phase: phase.toPhase, changeDate: start, before: phaseBefore, after: phaseAfter };
      });
      return { studentId: Number(sid), phases: analysis };
    });

    res.json(results);
  } catch (e: any) {
    console.error("pm-phase-trends error:", e);
    res.status(500).json({ error: "Failed to fetch PM phase trends" });
  }
});

export default router;
