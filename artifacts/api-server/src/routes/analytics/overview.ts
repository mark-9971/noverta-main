// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, behaviorTargetsTable, programTargetsTable, dataSessionsTable,
  sessionLogsTable,
} from "@workspace/db";
import { eq, and, count, isNull } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../../lib/minuteCalc";

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
      db.select({ count: count() }).from(sessionLogsTable).where(isNull(sessionLogsTable.deletedAt)),
      db.select({ count: count() }).from(sessionLogsTable).where(and(eq(sessionLogsTable.status, "completed"), isNull(sessionLogsTable.deletedAt))),
      db.select({ count: count() }).from(sessionLogsTable).where(and(eq(sessionLogsTable.status, "missed"), isNull(sessionLogsTable.deletedAt))),
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

export default router;
