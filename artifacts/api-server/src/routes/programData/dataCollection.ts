// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  behaviorTargetsTable, programTargetsTable, dataSessionsTable,
  behaviorDataTable, programDataTable, studentsTable, staffTable,
} from "@workspace/db";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import { assertStudentInCallerDistrict, assertDataSessionInCallerDistrict } from "../../lib/districtScope";
import type { AuthedRequest } from "../../middlewares/auth";

const router: IRouter = Router();

router.get("/students/:studentId/data-sessions", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (!(await assertStudentInCallerDistrict(req as AuthedRequest, studentId, res))) return;
    const { from, to, limit: limitStr } = req.query;
    const conditions = [eq(dataSessionsTable.studentId, studentId)];
    if (from) conditions.push(gte(dataSessionsTable.sessionDate, from as string));
    if (to) conditions.push(lte(dataSessionsTable.sessionDate, to as string));
    const limit = parseInt(limitStr as string) || 50;

    const sessions = await db.select({
      id: dataSessionsTable.id,
      studentId: dataSessionsTable.studentId,
      staffId: dataSessionsTable.staffId,
      sessionDate: dataSessionsTable.sessionDate,
      startTime: dataSessionsTable.startTime,
      endTime: dataSessionsTable.endTime,
      notes: dataSessionsTable.notes,
      createdAt: dataSessionsTable.createdAt,
      staffFirstName: staffTable.firstName,
      staffLastName: staffTable.lastName,
    }).from(dataSessionsTable)
      .leftJoin(staffTable, eq(dataSessionsTable.staffId, staffTable.id))
      .where(and(...conditions))
      .orderBy(desc(dataSessionsTable.sessionDate))
      .limit(limit);

    logAudit(req, {
      action: "read",
      targetTable: "data_sessions",
      studentId: studentId,
      summary: `Viewed ${sessions.length} data sessions for student #${studentId}`,
    });
    res.json(sessions.map(s => ({
      ...s,
      staffName: s.staffFirstName && s.staffLastName ? `${s.staffFirstName} ${s.staffLastName}` : null,
      createdAt: s.createdAt.toISOString(),
    })));
  } catch (e: any) {
    console.error("GET data-sessions error:", e);
    res.status(500).json({ error: "Failed to fetch data sessions" });
  }
});

async function checkAutoProgress(tx: any, programTargetId: number) {
  const [target] = await tx.select().from(programTargetsTable).where(eq(programTargetsTable.id, programTargetId));
  if (!target || !target.autoProgressEnabled) return null;

  const recentData = await tx.select({
    percentCorrect: programDataTable.percentCorrect,
    promptLevelUsed: programDataTable.promptLevelUsed,
  }).from(programDataTable)
    .where(eq(programDataTable.programTargetId, programTargetId))
    .orderBy(desc(programDataTable.createdAt))
    .limit(Math.max(target.masteryCriterionSessions ?? 3, target.regressionSessions ?? 2));

  if (recentData.length === 0) return null;

  const masterySessions = target.masteryCriterionSessions ?? 3;
  const masteryPct = target.masteryCriterionPercent ?? 80;
  const regressionSessions = target.regressionSessions ?? 2;
  const regressionThreshold = target.regressionThreshold ?? 50;

  const hierarchy = (target.promptHierarchy as string[]) ?? ["full_physical","partial_physical","model","gestural","verbal","independent"];
  const currentIdx = hierarchy.indexOf(target.currentPromptLevel ?? "verbal");

  if (recentData.length >= masterySessions) {
    const masteryCheck = recentData.slice(0, masterySessions);
    const allAboveMastery = masteryCheck.every((d: { percentCorrect: string | null }) => parseFloat(d.percentCorrect ?? "0") >= masteryPct);

    if (allAboveMastery && currentIdx < hierarchy.length - 1) {
      const newLevel = hierarchy[currentIdx + 1];
      await tx.update(programTargetsTable)
        .set({ currentPromptLevel: newLevel })
        .where(eq(programTargetsTable.id, programTargetId));
      return { action: "advanced", from: target.currentPromptLevel, to: newLevel };
    }
  }

  if (recentData.length >= regressionSessions) {
    const regressionCheck = recentData.slice(0, regressionSessions);
    const allBelowThreshold = regressionCheck.every((d: { percentCorrect: string | null }) => parseFloat(d.percentCorrect ?? "0") < regressionThreshold);

    if (allBelowThreshold && currentIdx > 0) {
      const newLevel = hierarchy[currentIdx - 1];
      await tx.update(programTargetsTable)
        .set({ currentPromptLevel: newLevel })
        .where(eq(programTargetsTable.id, programTargetId));
      return { action: "regressed", from: target.currentPromptLevel, to: newLevel };
    }
  }

  return null;
}

router.post("/students/:studentId/data-sessions", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (!(await assertStudentInCallerDistrict(req as AuthedRequest, studentId, res))) return;
    const { staffId, sessionDate, startTime, endTime, notes, behaviorData, programData: progData } = req.body;
    if (!sessionDate) { res.status(400).json({ error: "sessionDate is required" }); return; }

    const validBehTargets = await db.select({ id: behaviorTargetsTable.id }).from(behaviorTargetsTable)
      .where(eq(behaviorTargetsTable.studentId, studentId));
    const validBehIds = new Set(validBehTargets.map(t => t.id));

    const validProgTargets = await db.select({ id: programTargetsTable.id }).from(programTargetsTable)
      .where(eq(programTargetsTable.studentId, studentId));
    const validProgIds = new Set(validProgTargets.map(t => t.id));

    const progressUpdates: any[] = [];

    const result = await db.transaction(async (tx) => {
      const { sessionType } = req.body;
      const [session] = await tx.insert(dataSessionsTable).values({
        studentId,
        staffId: staffId || null,
        sessionDate,
        startTime: startTime || null,
        endTime: endTime || null,
        notes: notes || null,
        sessionType: sessionType || "acquisition",
      }).returning();

      if (behaviorData && Array.isArray(behaviorData)) {
        for (const bd of behaviorData) {
          if (bd.behaviorTargetId && bd.value != null && validBehIds.has(bd.behaviorTargetId)) {
            await tx.insert(behaviorDataTable).values({
              dataSessionId: session.id,
              behaviorTargetId: bd.behaviorTargetId,
              value: String(bd.value),
              intervalCount: bd.intervalCount || null,
              intervalsWith: bd.intervalsWith || null,
              hourBlock: bd.hourBlock || null,
              notes: bd.notes || null,
              ioaSessionId: bd.ioaSessionId || null,
              observerNumber: bd.observerNumber || null,
              observerName: bd.observerName || null,
              intervalScores: bd.intervalScores || null,
              eventTimestamps: bd.eventTimestamps || null,
            });
          }
        }
      }

      if (progData && Array.isArray(progData)) {
        for (const pd of progData) {
          if (pd.programTargetId && validProgIds.has(pd.programTargetId)) {
            await tx.insert(programDataTable).values({
              dataSessionId: session.id,
              programTargetId: pd.programTargetId,
              trialsCorrect: pd.trialsCorrect || 0,
              trialsTotal: pd.trialsTotal || 0,
              prompted: pd.prompted || 0,
              stepNumber: pd.stepNumber || null,
              independenceLevel: pd.independenceLevel || null,
              promptLevelUsed: pd.promptLevelUsed || null,
              percentCorrect: pd.trialsTotal > 0 ? String(Math.round((pd.trialsCorrect / pd.trialsTotal) * 100)) : "0",
              notes: pd.notes || null,
            });

            const progress = await checkAutoProgress(tx, pd.programTargetId);
            if (progress) progressUpdates.push({ programTargetId: pd.programTargetId, ...progress });
          }
        }
      }

      return session;
    });

    logAudit(req, {
      action: "create",
      targetTable: "data_sessions",
      targetId: result.id,
      studentId: studentId,
      summary: `Created data session #${result.id} for student #${studentId} on ${sessionDate}`,
      newValues: { sessionDate, staffId, behaviorDataCount: behaviorData?.length ?? 0, programDataCount: progData?.length ?? 0 } as Record<string, unknown>,
    });
    res.status(201).json({
      ...result, createdAt: result.createdAt.toISOString(), updatedAt: result.updatedAt.toISOString(),
      progressUpdates,
    });
  } catch (e: any) {
    console.error("POST data-session error:", e);
    res.status(500).json({ error: "Failed to create data session" });
  }
});

router.get("/data-sessions/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (!(await assertDataSessionInCallerDistrict(req as AuthedRequest, id, res))) return;
    const [session] = await db.select({
      id: dataSessionsTable.id,
      studentId: dataSessionsTable.studentId,
      staffId: dataSessionsTable.staffId,
      sessionDate: dataSessionsTable.sessionDate,
      startTime: dataSessionsTable.startTime,
      endTime: dataSessionsTable.endTime,
      notes: dataSessionsTable.notes,
      createdAt: dataSessionsTable.createdAt,
      staffFirstName: staffTable.firstName,
      staffLastName: staffTable.lastName,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
    }).from(dataSessionsTable)
      .leftJoin(staffTable, eq(dataSessionsTable.staffId, staffTable.id))
      .leftJoin(studentsTable, eq(dataSessionsTable.studentId, studentsTable.id))
      .where(eq(dataSessionsTable.id, id));

    if (!session) { res.status(404).json({ error: "Not found" }); return; }

    const behaviors = await db.select({
      id: behaviorDataTable.id,
      behaviorTargetId: behaviorDataTable.behaviorTargetId,
      value: behaviorDataTable.value,
      intervalCount: behaviorDataTable.intervalCount,
      intervalsWith: behaviorDataTable.intervalsWith,
      hourBlock: behaviorDataTable.hourBlock,
      notes: behaviorDataTable.notes,
      targetName: behaviorTargetsTable.name,
      measurementType: behaviorTargetsTable.measurementType,
    }).from(behaviorDataTable)
      .leftJoin(behaviorTargetsTable, eq(behaviorDataTable.behaviorTargetId, behaviorTargetsTable.id))
      .where(eq(behaviorDataTable.dataSessionId, id));

    const programs = await db.select({
      id: programDataTable.id,
      programTargetId: programDataTable.programTargetId,
      trialsCorrect: programDataTable.trialsCorrect,
      trialsTotal: programDataTable.trialsTotal,
      prompted: programDataTable.prompted,
      stepNumber: programDataTable.stepNumber,
      independenceLevel: programDataTable.independenceLevel,
      percentCorrect: programDataTable.percentCorrect,
      promptLevelUsed: programDataTable.promptLevelUsed,
      notes: programDataTable.notes,
      targetName: programTargetsTable.name,
      programType: programTargetsTable.programType,
    }).from(programDataTable)
      .leftJoin(programTargetsTable, eq(programDataTable.programTargetId, programTargetsTable.id))
      .where(eq(programDataTable.dataSessionId, id));

    logAudit(req, {
      action: "read",
      targetTable: "data_sessions",
      targetId: id,
      studentId: session.studentId,
      summary: `Viewed data session #${id} for student #${session.studentId} (${behaviors.length} behavior, ${programs.length} program entries)`,
    });
    res.json({
      ...session,
      staffName: session.staffFirstName && session.staffLastName ? `${session.staffFirstName} ${session.staffLastName}` : null,
      studentName: `${session.studentFirstName} ${session.studentLastName}`,
      createdAt: session.createdAt.toISOString(),
      behaviorData: behaviors,
      programData: programs,
    });
  } catch (e: any) {
    console.error("GET data-session detail error:", e);
    res.status(500).json({ error: "Failed to fetch data session" });
  }
});

export default router;
