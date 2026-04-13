import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  behaviorTargetsTable, programTargetsTable, dataSessionsTable,
  behaviorDataTable, programDataTable, studentsTable, staffTable
} from "@workspace/db";
import { eq, desc, and, sql, gte, lte, asc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/students/:studentId/behavior-targets", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const activeOnly = req.query.active !== "false";
    const conditions = [eq(behaviorTargetsTable.studentId, studentId)];
    if (activeOnly) conditions.push(eq(behaviorTargetsTable.active, true));
    const targets = await db.select().from(behaviorTargetsTable)
      .where(and(...conditions))
      .orderBy(asc(behaviorTargetsTable.name));
    res.json(targets.map(t => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })));
  } catch (e: any) {
    console.error("GET behavior-targets error:", e);
    res.status(500).json({ error: "Failed to fetch behavior targets" });
  }
});

router.post("/students/:studentId/behavior-targets", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { name, description, measurementType, targetDirection, baselineValue, goalValue } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const [target] = await db.insert(behaviorTargetsTable).values({
      studentId, name, description: description || null,
      measurementType: measurementType || "frequency",
      targetDirection: targetDirection || "decrease",
      baselineValue: baselineValue != null ? String(baselineValue) : null,
      goalValue: goalValue != null ? String(goalValue) : null,
    }).returning();
    res.status(201).json({ ...target, createdAt: target.createdAt.toISOString(), updatedAt: target.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("POST behavior-target error:", e);
    res.status(500).json({ error: "Failed to create behavior target" });
  }
});

router.patch("/behavior-targets/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const updates: any = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.measurementType !== undefined) updates.measurementType = req.body.measurementType;
    if (req.body.targetDirection !== undefined) updates.targetDirection = req.body.targetDirection;
    if (req.body.baselineValue !== undefined) updates.baselineValue = req.body.baselineValue != null ? String(req.body.baselineValue) : null;
    if (req.body.goalValue !== undefined) updates.goalValue = req.body.goalValue != null ? String(req.body.goalValue) : null;
    if (req.body.active !== undefined) updates.active = req.body.active;
    const [updated] = await db.update(behaviorTargetsTable).set(updates).where(eq(behaviorTargetsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("PATCH behavior-target error:", e);
    res.status(500).json({ error: "Failed to update behavior target" });
  }
});

router.get("/students/:studentId/program-targets", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const activeOnly = req.query.active !== "false";
    const conditions = [eq(programTargetsTable.studentId, studentId)];
    if (activeOnly) conditions.push(eq(programTargetsTable.active, true));
    const targets = await db.select().from(programTargetsTable)
      .where(and(...conditions))
      .orderBy(asc(programTargetsTable.name));
    res.json(targets.map(t => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })));
  } catch (e: any) {
    console.error("GET program-targets error:", e);
    res.status(500).json({ error: "Failed to fetch program targets" });
  }
});

router.post("/students/:studentId/program-targets", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { name, description, programType, targetCriterion, domain } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const [target] = await db.insert(programTargetsTable).values({
      studentId, name, description: description || null,
      programType: programType || "discrete_trial",
      targetCriterion: targetCriterion || null,
      domain: domain || null,
    }).returning();
    res.status(201).json({ ...target, createdAt: target.createdAt.toISOString(), updatedAt: target.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("POST program-target error:", e);
    res.status(500).json({ error: "Failed to create program target" });
  }
});

router.patch("/program-targets/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const updates: any = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.programType !== undefined) updates.programType = req.body.programType;
    if (req.body.targetCriterion !== undefined) updates.targetCriterion = req.body.targetCriterion;
    if (req.body.domain !== undefined) updates.domain = req.body.domain;
    if (req.body.active !== undefined) updates.active = req.body.active;
    const [updated] = await db.update(programTargetsTable).set(updates).where(eq(programTargetsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("PATCH program-target error:", e);
    res.status(500).json({ error: "Failed to update program target" });
  }
});

router.get("/students/:studentId/data-sessions", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
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

router.post("/students/:studentId/data-sessions", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { staffId, sessionDate, startTime, endTime, notes, behaviorData, programData: progData } = req.body;
    if (!sessionDate) { res.status(400).json({ error: "sessionDate is required" }); return; }

    const validBehTargets = await db.select({ id: behaviorTargetsTable.id }).from(behaviorTargetsTable)
      .where(eq(behaviorTargetsTable.studentId, studentId));
    const validBehIds = new Set(validBehTargets.map(t => t.id));

    const validProgTargets = await db.select({ id: programTargetsTable.id }).from(programTargetsTable)
      .where(eq(programTargetsTable.studentId, studentId));
    const validProgIds = new Set(validProgTargets.map(t => t.id));

    const result = await db.transaction(async (tx) => {
      const [session] = await tx.insert(dataSessionsTable).values({
        studentId,
        staffId: staffId || null,
        sessionDate,
        startTime: startTime || null,
        endTime: endTime || null,
        notes: notes || null,
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
              notes: bd.notes || null,
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
              percentCorrect: pd.trialsTotal > 0 ? String(Math.round((pd.trialsCorrect / pd.trialsTotal) * 100)) : "0",
              notes: pd.notes || null,
            });
          }
        }
      }

      return session;
    });

    res.status(201).json({ ...result, createdAt: result.createdAt.toISOString(), updatedAt: result.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("POST data-session error:", e);
    res.status(500).json({ error: "Failed to create data session" });
  }
});

router.get("/data-sessions/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
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
      notes: programDataTable.notes,
      targetName: programTargetsTable.name,
      programType: programTargetsTable.programType,
    }).from(programDataTable)
      .leftJoin(programTargetsTable, eq(programDataTable.programTargetId, programTargetsTable.id))
      .where(eq(programDataTable.dataSessionId, id));

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

router.get("/students/:studentId/behavior-data/trends", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { from, to, behaviorTargetId } = req.query;

    const conditions = [eq(dataSessionsTable.studentId, studentId)];
    if (from) conditions.push(gte(dataSessionsTable.sessionDate, from as string));
    if (to) conditions.push(lte(dataSessionsTable.sessionDate, to as string));

    const bdConditions: any[] = [];
    if (behaviorTargetId) bdConditions.push(eq(behaviorDataTable.behaviorTargetId, parseInt(behaviorTargetId as string)));

    const data = await db.select({
      sessionDate: dataSessionsTable.sessionDate,
      behaviorTargetId: behaviorDataTable.behaviorTargetId,
      targetName: behaviorTargetsTable.name,
      measurementType: behaviorTargetsTable.measurementType,
      value: behaviorDataTable.value,
    }).from(behaviorDataTable)
      .innerJoin(dataSessionsTable, eq(behaviorDataTable.dataSessionId, dataSessionsTable.id))
      .innerJoin(behaviorTargetsTable, eq(behaviorDataTable.behaviorTargetId, behaviorTargetsTable.id))
      .where(and(...conditions, ...bdConditions))
      .orderBy(asc(dataSessionsTable.sessionDate));

    res.json(data);
  } catch (e: any) {
    console.error("GET behavior trends error:", e);
    res.status(500).json({ error: "Failed to fetch behavior trends" });
  }
});

router.get("/students/:studentId/program-data/trends", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { from, to, programTargetId } = req.query;

    const conditions = [eq(dataSessionsTable.studentId, studentId)];
    if (from) conditions.push(gte(dataSessionsTable.sessionDate, from as string));
    if (to) conditions.push(lte(dataSessionsTable.sessionDate, to as string));

    const pdConditions: any[] = [];
    if (programTargetId) pdConditions.push(eq(programDataTable.programTargetId, parseInt(programTargetId as string)));

    const data = await db.select({
      sessionDate: dataSessionsTable.sessionDate,
      programTargetId: programDataTable.programTargetId,
      targetName: programTargetsTable.name,
      programType: programTargetsTable.programType,
      trialsCorrect: programDataTable.trialsCorrect,
      trialsTotal: programDataTable.trialsTotal,
      prompted: programDataTable.prompted,
      percentCorrect: programDataTable.percentCorrect,
    }).from(programDataTable)
      .innerJoin(dataSessionsTable, eq(programDataTable.dataSessionId, dataSessionsTable.id))
      .innerJoin(programTargetsTable, eq(programDataTable.programTargetId, programTargetsTable.id))
      .where(and(...conditions, ...pdConditions))
      .orderBy(asc(dataSessionsTable.sessionDate));

    res.json(data);
  } catch (e: any) {
    console.error("GET program trends error:", e);
    res.status(500).json({ error: "Failed to fetch program trends" });
  }
});

export default router;
