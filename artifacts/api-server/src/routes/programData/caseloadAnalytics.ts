// tenant-scope: district-join
import { Router, type IRouter } from "express";
import {
  db, studentsTable, schoolsTable,
  behaviorTargetsTable, programTargetsTable,
  dataSessionsTable, programDataTable, behaviorDataTable,
} from "@workspace/db";
import { eq, and, sql, gte, asc } from "drizzle-orm";
import { getEnforcedDistrictId, type AuthedRequest } from "../../middlewares/auth";

const router: IRouter = Router();

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr + "T12:00:00").getTime()) / 86_400_000);
}

function studentStatus(
  days: number | null,
  programsAtRisk: number,
  programsMastered: number,
  totalPrograms: number,
): "no_data" | "at_risk" | "on_track" | "mastering" {
  if (days === null) return "no_data";
  if (days > 14 || programsAtRisk > 0) return "at_risk";
  if (totalPrograms > 0 && programsMastered > 0 && programsMastered === totalPrograms) return "mastering";
  return "on_track";
}

router.get("/aba/caseload-analytics", async (req, res): Promise<void> => {
  try {
    const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
    if (!districtId) { res.status(403).json({ error: "No district scope" }); return; }

    // 1. All active students in district with target counts
    const students = await db
      .select({
        id: studentsTable.id,
        firstName: studentsTable.firstName,
        lastName: studentsTable.lastName,
        grade: studentsTable.grade,
        behaviorTargetCount: sql<number>`COUNT(DISTINCT ${behaviorTargetsTable.id})`,
        programTargetCount: sql<number>`COUNT(DISTINCT ${programTargetsTable.id})`,
      })
      .from(studentsTable)
      .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
      .leftJoin(behaviorTargetsTable, eq(behaviorTargetsTable.studentId, studentsTable.id))
      .leftJoin(programTargetsTable, eq(programTargetsTable.studentId, studentsTable.id))
      .where(
        and(eq(studentsTable.status, "active"), eq(schoolsTable.districtId, districtId))
      )
      .groupBy(
        studentsTable.id, studentsTable.firstName, studentsTable.lastName, studentsTable.grade
      );

    const ids = students.map(s => s.id);
    if (ids.length === 0) { res.json({ students: [] }); return; }

    const idList = sql.join(ids.map(id => sql`${id}`), sql`, `);

    // 2. Last data session per student
    const lastSessions = await db
      .select({
        studentId: dataSessionsTable.studentId,
        lastDate: sql<string>`MAX(${dataSessionsTable.sessionDate})`,
        sessionCount: sql<number>`COUNT(*)`,
      })
      .from(dataSessionsTable)
      .where(sql`${dataSessionsTable.studentId} IN (${idList})`)
      .groupBy(dataSessionsTable.studentId);

    // 3. Session counts this month
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().slice(0, 10);

    const thisMonthSessions = await db
      .select({
        studentId: dataSessionsTable.studentId,
        count: sql<number>`COUNT(*)`,
      })
      .from(dataSessionsTable)
      .where(
        and(
          sql`${dataSessionsTable.studentId} IN (${idList})`,
          gte(dataSessionsTable.sessionDate, monthStartStr)
        )
      )
      .groupBy(dataSessionsTable.studentId);

    // 4. Program trends (last 90 days) for mastery calculation
    const since90 = new Date();
    since90.setDate(since90.getDate() - 90);
    const since90Str = since90.toISOString().slice(0, 10);

    const programTrends = await db
      .select({
        studentId: dataSessionsTable.studentId,
        programTargetId: programDataTable.programTargetId,
        percentCorrect: programDataTable.percentCorrect,
        masteryCriterionPercent: programTargetsTable.masteryCriterionPercent,
        targetName: programTargetsTable.name,
        sessionDate: dataSessionsTable.sessionDate,
      })
      .from(programDataTable)
      .innerJoin(dataSessionsTable, eq(programDataTable.dataSessionId, dataSessionsTable.id))
      .innerJoin(programTargetsTable, eq(programDataTable.programTargetId, programTargetsTable.id))
      .where(
        and(
          sql`${dataSessionsTable.studentId} IN (${idList})`,
          gte(dataSessionsTable.sessionDate, since90Str)
        )
      )
      .orderBy(asc(dataSessionsTable.sessionDate));

    // 5. Recent behavior data (last 90 days) for trend direction
    const behaviorTrends = await db
      .select({
        studentId: dataSessionsTable.studentId,
        behaviorTargetId: behaviorDataTable.behaviorTargetId,
        value: behaviorDataTable.value,
        sessionDate: dataSessionsTable.sessionDate,
        targetDirection: behaviorTargetsTable.targetDirection,
        targetName: behaviorTargetsTable.name,
      })
      .from(behaviorDataTable)
      .innerJoin(dataSessionsTable, eq(behaviorDataTable.dataSessionId, dataSessionsTable.id))
      .innerJoin(behaviorTargetsTable, eq(behaviorDataTable.behaviorTargetId, behaviorTargetsTable.id))
      .where(
        and(
          sql`${dataSessionsTable.studentId} IN (${idList})`,
          gte(dataSessionsTable.sessionDate, since90Str)
        )
      )
      .orderBy(asc(dataSessionsTable.sessionDate));

    // Build lookup maps
    const lastSessionMap: Record<number, string> = {};
    const sessionCountMap: Record<number, number> = {};
    for (const s of lastSessions) {
      lastSessionMap[s.studentId] = s.lastDate;
      sessionCountMap[s.studentId] = Number(s.sessionCount);
    }
    const thisMonthMap: Record<number, number> = {};
    for (const s of thisMonthSessions) thisMonthMap[s.studentId] = Number(s.count);

    // Program trend by student/program
    const progByStudent: Record<number, Record<number, { pct: number[]; criterion: number; name: string }>> = {};
    for (const t of programTrends) {
      if (!progByStudent[t.studentId]) progByStudent[t.studentId] = {};
      const byProg = progByStudent[t.studentId];
      if (!byProg[t.programTargetId]) byProg[t.programTargetId] = { pct: [], criterion: t.masteryCriterionPercent ?? 80, name: t.targetName };
      byProg[t.programTargetId].pct.push(parseFloat(t.percentCorrect ?? "0"));
    }

    // Behavior trend by student/behavior
    const bhvByStudent: Record<number, Record<number, { vals: number[]; direction: string; name: string }>> = {};
    for (const t of behaviorTrends) {
      if (!bhvByStudent[t.studentId]) bhvByStudent[t.studentId] = {};
      const byBhv = bhvByStudent[t.studentId];
      if (!byBhv[t.behaviorTargetId]) byBhv[t.behaviorTargetId] = { vals: [], direction: t.targetDirection ?? "decrease", name: t.targetName };
      byBhv[t.behaviorTargetId].vals.push(parseFloat(t.value ?? "0"));
    }

    const result = students.map(s => {
      const progs = progByStudent[s.id] ?? {};
      let programsMastered = 0, programsInProgress = 0, programsAtRisk = 0;
      const nearMastery: { name: string; avg: number; criterion: number }[] = [];

      for (const prog of Object.values(progs)) {
        const last3 = prog.pct.slice(-3);
        const avg = last3.length > 0 ? Math.round(last3.reduce((a, v) => a + v, 0) / last3.length) : 0;
        if (avg >= prog.criterion) programsMastered++;
        else if (avg < 50) programsAtRisk++;
        else {
          programsInProgress++;
          if (avg >= prog.criterion - 15) nearMastery.push({ name: prog.name, avg, criterion: prog.criterion });
        }
      }

      const bhvs = bhvByStudent[s.id] ?? {};
      let behaviorsImproving = 0, behaviorsWorsening = 0;
      for (const bhv of Object.values(bhvs)) {
        if (bhv.vals.length < 2) continue;
        const first = bhv.vals[0], last = bhv.vals[bhv.vals.length - 1];
        const improving = bhv.direction === "decrease" ? last < first : last > first;
        if (improving) behaviorsImproving++;
        else behaviorsWorsening++;
      }

      const lastDate = lastSessionMap[s.id] ?? null;
      const days = daysSince(lastDate);
      const totalPrograms = Number(s.programTargetCount);
      const status = studentStatus(days, programsAtRisk, programsMastered, totalPrograms);

      return {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        grade: s.grade,
        behaviorTargetCount: Number(s.behaviorTargetCount),
        programTargetCount: totalPrograms,
        lastSessionDate: lastDate,
        daysSinceSession: days,
        sessionsThisMonth: thisMonthMap[s.id] ?? 0,
        totalSessions: sessionCountMap[s.id] ?? 0,
        programsMastered,
        programsInProgress,
        programsAtRisk,
        nearMastery,
        behaviorsImproving,
        behaviorsWorsening,
        status,
      };
    });

    res.json({ students: result });
  } catch (e: any) {
    console.error("GET ABA caseload analytics error:", e);
    res.status(500).json({ error: "Failed to fetch ABA caseload analytics" });
  }
});

export default router;
