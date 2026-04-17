// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, behaviorTargetsTable, programTargetsTable, dataSessionsTable,
  behaviorDataTable, programDataTable, sessionLogsTable, serviceTypesTable,
} from "@workspace/db";
import { eq, and, count, sql, asc, isNull } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../../lib/minuteCalc";

const router: IRouter = Router();

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
      }).from(sessionLogsTable).where(and(eq(sessionLogsTable.studentId, studentId), isNull(sessionLogsTable.deletedAt))),

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
      .where(and(eq(sessionLogsTable.studentId, studentId), isNull(sessionLogsTable.deletedAt)))
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
      .where(and(eq(sessionLogsTable.studentId, studentId), isNull(sessionLogsTable.deletedAt)))
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
      .where(and(eq(sessionLogsTable.studentId, studentId), isNull(sessionLogsTable.deletedAt)))
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

export default router;
