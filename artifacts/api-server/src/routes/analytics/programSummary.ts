import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, programTargetsTable, dataSessionsTable, programDataTable,
} from "@workspace/db";
import { eq, count, sql, asc } from "drizzle-orm";

const router: IRouter = Router();

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

export default router;
