// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, behaviorTargetsTable, dataSessionsTable, behaviorDataTable,
} from "@workspace/db";
import { eq, count, sql, asc } from "drizzle-orm";

const router: IRouter = Router();

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

export default router;
