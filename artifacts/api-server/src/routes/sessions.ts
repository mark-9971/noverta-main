import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import {
  sessionLogsTable, serviceTypesTable, staffTable, studentsTable,
  missedReasonsTable, iepGoalsTable,
  dataSessionsTable, programDataTable, behaviorDataTable,
  programTargetsTable, behaviorTargetsTable,
  compensatoryObligationsTable,
  sessionGoalDataTable,
} from "@workspace/db";
import {
  ListSessionsQueryParams,
  CreateSessionBody,
  GetSessionParams,
  UpdateSessionParams,
  UpdateSessionBody,
  DeleteSessionParams,
  BulkCreateSessionsBody,
} from "@workspace/api-zod";
import { eq, and, gte, lte, desc, asc, sql, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { logAudit } from "../lib/auditLog";

type GoalEntry = {
  iepGoalId: number;
  notes?: string | null;
  behaviorTargetId?: number | null;
  behaviorData?: { value: number; intervalCount?: number | null; intervalsWith?: number | null; hourBlock?: string | null; notes?: string | null } | null;
  programTargetId?: number | null;
  programData?: { trialsCorrect?: number; trialsTotal?: number; prompted?: number | null; stepNumber?: number | null; independenceLevel?: string | null; promptLevelUsed?: string | null; notes?: string | null } | null;
};

function validateGoalData(arr: any[]): { valid: true; data: GoalEntry[] } | { valid: false; error: string } {
  for (let i = 0; i < arr.length; i++) {
    const entry = arr[i];
    if (typeof entry.iepGoalId !== "number" || !Number.isInteger(entry.iepGoalId)) {
      return { valid: false, error: `goalData[${i}].iepGoalId must be an integer` };
    }
    if (entry.behaviorData && typeof entry.behaviorData.value !== "number") {
      return { valid: false, error: `goalData[${i}].behaviorData.value must be a number` };
    }
  }
  return { valid: true, data: arr as GoalEntry[] };
}

const router: IRouter = Router();

function sessionToJson(s: any) {
  return {
    ...s,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
  };
}

router.get("/missed-reasons", async (req, res): Promise<void> => {
  const reasons = await db.select().from(missedReasonsTable).orderBy(missedReasonsTable.label);
  res.json(reasons);
});

router.post("/missed-reasons", async (req, res): Promise<void> => {
  const { label, category } = req.body;
  if (!label || !category) {
    res.status(400).json({ error: "label and category required" });
    return;
  }
  const [reason] = await db.insert(missedReasonsTable).values({ label, category }).returning();
  res.status(201).json(reason);
});

router.get("/sessions", async (req, res): Promise<void> => {
  const params = ListSessionsQueryParams.safeParse(req.query);
  const conditions: any[] = [];
  if (params.success) {
    if (params.data.studentId) conditions.push(eq(sessionLogsTable.studentId, Number(params.data.studentId)));
    if (params.data.staffId) conditions.push(eq(sessionLogsTable.staffId, Number(params.data.staffId)));
    if (params.data.serviceRequirementId) conditions.push(eq(sessionLogsTable.serviceRequirementId, Number(params.data.serviceRequirementId)));
    if (params.data.status) conditions.push(eq(sessionLogsTable.status, params.data.status));
    if (params.data.dateFrom) conditions.push(gte(sessionLogsTable.sessionDate, params.data.dateFrom));
    if (params.data.dateTo) conditions.push(lte(sessionLogsTable.sessionDate, params.data.dateTo));
    if (params.data.schoolId) conditions.push(sql`${sessionLogsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${Number(params.data.schoolId)})`);
    if (params.data.districtId) conditions.push(sql`${sessionLogsTable.studentId} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${Number(params.data.districtId)}))`);
  }

  const limit = params.success && params.data.limit ? Number(params.data.limit) : 100;
  const offset = params.success && params.data.offset ? Number(params.data.offset) : 0;

  const sessions = await db
    .select({
      id: sessionLogsTable.id,
      studentId: sessionLogsTable.studentId,
      serviceRequirementId: sessionLogsTable.serviceRequirementId,
      serviceTypeId: sessionLogsTable.serviceTypeId,
      staffId: sessionLogsTable.staffId,
      sessionDate: sessionLogsTable.sessionDate,
      startTime: sessionLogsTable.startTime,
      endTime: sessionLogsTable.endTime,
      durationMinutes: sessionLogsTable.durationMinutes,
      location: sessionLogsTable.location,
      deliveryMode: sessionLogsTable.deliveryMode,
      status: sessionLogsTable.status,
      missedReasonId: sessionLogsTable.missedReasonId,
      isMakeup: sessionLogsTable.isMakeup,
      isCompensatory: sessionLogsTable.isCompensatory,
      compensatoryObligationId: sessionLogsTable.compensatoryObligationId,
      notes: sessionLogsTable.notes,
      createdAt: sessionLogsTable.createdAt,
      serviceTypeName: serviceTypesTable.name,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
      studentFirst: studentsTable.firstName,
      studentLast: studentsTable.lastName,
      missedReasonLabel: missedReasonsTable.label,
    })
    .from(sessionLogsTable)
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, sessionLogsTable.serviceTypeId))
    .leftJoin(staffTable, eq(staffTable.id, sessionLogsTable.staffId))
    .leftJoin(studentsTable, eq(studentsTable.id, sessionLogsTable.studentId))
    .leftJoin(missedReasonsTable, eq(missedReasonsTable.id, sessionLogsTable.missedReasonId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(sessionLogsTable.sessionDate))
    .limit(limit)
    .offset(offset);

  const sessionIds = sessions.map(s => s.id);
  let goalCountMap: Record<number, number> = {};
  if (sessionIds.length > 0) {
    const goalCounts = await db
      .select({
        sessionLogId: sessionGoalDataTable.sessionLogId,
        count: sql<number>`count(*)::int`,
      })
      .from(sessionGoalDataTable)
      .where(inArray(sessionGoalDataTable.sessionLogId, sessionIds))
      .groupBy(sessionGoalDataTable.sessionLogId);
    for (const gc of goalCounts) {
      goalCountMap[gc.sessionLogId] = gc.count;
    }
  }

  res.json(sessions.map(s => ({
    ...s,
    studentName: s.studentFirst ? `${s.studentFirst} ${s.studentLast}` : null,
    serviceTypeName: s.serviceTypeName,
    staffName: s.staffFirst ? `${s.staffFirst} ${s.staffLast}` : null,
    missedReasonLabel: s.missedReasonLabel,
    createdAt: s.createdAt.toISOString(),
    goalCount: goalCountMap[s.id] ?? 0,
  })));
});

router.post("/sessions/bulk", async (req, res): Promise<void> => {
  const parsed = BulkCreateSessionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const inserted = await db.insert(sessionLogsTable).values(parsed.data.sessions).returning();
  for (const s of inserted) {
    logAudit(req, {
      action: "create",
      targetTable: "session_logs",
      targetId: s.id,
      studentId: s.studentId,
      summary: `Bulk-created session #${s.id} for student #${s.studentId}`,
    });
  }
  res.status(201).json(inserted.map(s => ({ ...s, createdAt: s.createdAt.toISOString() })));
});

router.post("/sessions", async (req, res): Promise<void> => {
  try {
    const { goalData: rawGoalData, ...sessionFields } = req.body;
    const parsed = CreateSessionBody.safeParse(sessionFields);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    let goalData: GoalEntry[] = [];
    if (rawGoalData && Array.isArray(rawGoalData) && rawGoalData.length > 0) {
      const goalParsed = validateGoalData(rawGoalData);
      if (!goalParsed.valid) {
        res.status(400).json({ error: "Invalid goalData: " + goalParsed.error });
        return;
      }
      goalData = goalParsed.data;
    }

    const result = await db.transaction(async (tx) => {
      const [session] = await tx.insert(sessionLogsTable).values(parsed.data).returning();

      if (goalData.length > 0) {
        const [dataSession] = await tx.insert(dataSessionsTable).values({
          studentId: session.studentId,
          staffId: session.staffId,
          sessionLogId: session.id,
          sessionDate: session.sessionDate,
          startTime: session.startTime,
          endTime: session.endTime,
          notes: session.notes,
        }).returning();

        for (const entry of goalData) {
          await tx.insert(sessionGoalDataTable).values({
            sessionLogId: session.id,
            iepGoalId: entry.iepGoalId,
            notes: entry.notes || null,
          });

          if (entry.behaviorData && entry.behaviorTargetId) {
            await tx.insert(behaviorDataTable).values({
              dataSessionId: dataSession.id,
              behaviorTargetId: entry.behaviorTargetId,
              value: String(entry.behaviorData.value),
              intervalCount: entry.behaviorData.intervalCount ?? null,
              intervalsWith: entry.behaviorData.intervalsWith ?? null,
              hourBlock: entry.behaviorData.hourBlock ?? null,
              notes: entry.behaviorData.notes ?? null,
            });
          }

          if (entry.programData && entry.programTargetId) {
            const trialsCorrect = entry.programData.trialsCorrect ?? 0;
            const trialsTotal = entry.programData.trialsTotal ?? 0;
            const pctCorrect = trialsTotal > 0 ? Math.round((trialsCorrect / trialsTotal) * 100) : 0;
            await tx.insert(programDataTable).values({
              dataSessionId: dataSession.id,
              programTargetId: entry.programTargetId,
              trialsCorrect,
              trialsTotal,
              prompted: entry.programData.prompted ?? 0,
              stepNumber: entry.programData.stepNumber ?? null,
              independenceLevel: entry.programData.independenceLevel ?? null,
              percentCorrect: String(pctCorrect),
              promptLevelUsed: entry.programData.promptLevelUsed ?? null,
              notes: entry.programData.notes ?? null,
            });
          }
        }
      }

      return session;
    });

    logAudit(req, {
      action: "create",
      targetTable: "session_logs",
      targetId: result.id,
      studentId: result.studentId,
      summary: `Logged session for student #${result.studentId} on ${result.sessionDate}`,
      newValues: { sessionDate: result.sessionDate, durationMinutes: result.durationMinutes, status: result.status } as Record<string, unknown>,
    });
    res.status(201).json({ ...result, createdAt: result.createdAt.toISOString() });
  } catch (e: any) {
    console.error("POST /sessions error:", e);
    res.status(500).json({ error: "Failed to create session" });
  }

  if (parsed.data.isCompensatory && !parsed.data.compensatoryObligationId) {
    res.status(400).json({ error: "compensatoryObligationId is required when isCompensatory is true" });
    return;
  }

  if (parsed.data.isCompensatory && parsed.data.compensatoryObligationId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const txDb = drizzle(client);

      const [obligation] = await txDb.select().from(compensatoryObligationsTable)
        .where(eq(compensatoryObligationsTable.id, parsed.data.compensatoryObligationId));
      if (!obligation) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Compensatory obligation not found" });
        return;
      }
      if (obligation.studentId !== parsed.data.studentId) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Obligation student does not match session student" });
        return;
      }
      if (obligation.status === "completed" || obligation.status === "waived") {
        await client.query("ROLLBACK");
        res.status(400).json({ error: `Cannot log sessions against a ${obligation.status} obligation` });
        return;
      }

      const [session] = await txDb.insert(sessionLogsTable).values(parsed.data).returning();
      const completedStatus = parsed.data.status === "completed" || parsed.data.status === "makeup";
      if (completedStatus) {
        const newDelivered = obligation.minutesDelivered + parsed.data.durationMinutes;
        const newStatus = newDelivered >= obligation.minutesOwed ? "completed" : "in_progress";
        await txDb.update(compensatoryObligationsTable)
          .set({ minutesDelivered: newDelivered, status: newStatus })
          .where(eq(compensatoryObligationsTable.id, parsed.data.compensatoryObligationId));
      }

      await client.query("COMMIT");
      res.status(201).json({ ...session, createdAt: session.createdAt.toISOString() });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } else {
    const [session] = await db.insert(sessionLogsTable).values(parsed.data).returning();
    res.status(201).json({ ...session, createdAt: session.createdAt.toISOString() });
  }
});

router.get("/sessions/:id", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [session] = await db
    .select({
      id: sessionLogsTable.id,
      studentId: sessionLogsTable.studentId,
      serviceRequirementId: sessionLogsTable.serviceRequirementId,
      serviceTypeId: sessionLogsTable.serviceTypeId,
      staffId: sessionLogsTable.staffId,
      sessionDate: sessionLogsTable.sessionDate,
      startTime: sessionLogsTable.startTime,
      endTime: sessionLogsTable.endTime,
      durationMinutes: sessionLogsTable.durationMinutes,
      location: sessionLogsTable.location,
      deliveryMode: sessionLogsTable.deliveryMode,
      status: sessionLogsTable.status,
      missedReasonId: sessionLogsTable.missedReasonId,
      isMakeup: sessionLogsTable.isMakeup,
      isCompensatory: sessionLogsTable.isCompensatory,
      compensatoryObligationId: sessionLogsTable.compensatoryObligationId,
      notes: sessionLogsTable.notes,
      createdAt: sessionLogsTable.createdAt,
      serviceTypeName: serviceTypesTable.name,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
      studentFirst: studentsTable.firstName,
      studentLast: studentsTable.lastName,
      missedReasonLabel: missedReasonsTable.label,
    })
    .from(sessionLogsTable)
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, sessionLogsTable.serviceTypeId))
    .leftJoin(staffTable, eq(staffTable.id, sessionLogsTable.staffId))
    .leftJoin(studentsTable, eq(studentsTable.id, sessionLogsTable.studentId))
    .leftJoin(missedReasonsTable, eq(missedReasonsTable.id, sessionLogsTable.missedReasonId))
    .where(eq(sessionLogsTable.id, params.data.id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const goalEntries = await db
    .select({
      id: sessionGoalDataTable.id,
      iepGoalId: sessionGoalDataTable.iepGoalId,
      notes: sessionGoalDataTable.notes,
      goalArea: iepGoalsTable.goalArea,
      goalNumber: iepGoalsTable.goalNumber,
      annualGoal: iepGoalsTable.annualGoal,
      targetCriterion: iepGoalsTable.targetCriterion,
      measurementMethod: iepGoalsTable.measurementMethod,
      serviceArea: iepGoalsTable.serviceArea,
      goalStatus: iepGoalsTable.status,
      programTargetId: iepGoalsTable.programTargetId,
      behaviorTargetId: iepGoalsTable.behaviorTargetId,
    })
    .from(sessionGoalDataTable)
    .innerJoin(iepGoalsTable, eq(sessionGoalDataTable.iepGoalId, iepGoalsTable.id))
    .where(eq(sessionGoalDataTable.sessionLogId, session.id));

  const linkedDataSessions = await db
    .select({ id: dataSessionsTable.id })
    .from(dataSessionsTable)
    .where(eq(dataSessionsTable.sessionLogId, session.id));

  const dsIds = linkedDataSessions.map(ds => ds.id);

  let behaviorDataRows: any[] = [];
  let programDataRows: any[] = [];
  if (dsIds.length > 0) {
    behaviorDataRows = await db
      .select({
        id: behaviorDataTable.id,
        behaviorTargetId: behaviorDataTable.behaviorTargetId,
        value: behaviorDataTable.value,
        intervalCount: behaviorDataTable.intervalCount,
        intervalsWith: behaviorDataTable.intervalsWith,
        hourBlock: behaviorDataTable.hourBlock,
        notes: behaviorDataTable.notes,
        targetName: behaviorTargetsTable.name,
        measurementType: behaviorTargetsTable.measurementType,
        targetDirection: behaviorTargetsTable.targetDirection,
        goalValue: behaviorTargetsTable.goalValue,
      })
      .from(behaviorDataTable)
      .innerJoin(behaviorTargetsTable, eq(behaviorDataTable.behaviorTargetId, behaviorTargetsTable.id))
      .where(inArray(behaviorDataTable.dataSessionId, dsIds));

    programDataRows = await db
      .select({
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
        masteryCriterionPercent: programTargetsTable.masteryCriterionPercent,
      })
      .from(programDataTable)
      .innerJoin(programTargetsTable, eq(programDataTable.programTargetId, programTargetsTable.id))
      .where(inArray(programDataTable.dataSessionId, dsIds));
  }

  const linkedGoals = goalEntries.map(ge => {
    const bd = ge.behaviorTargetId
      ? behaviorDataRows.find(b => b.behaviorTargetId === ge.behaviorTargetId)
      : null;
    const pd = ge.programTargetId
      ? programDataRows.find(p => p.programTargetId === ge.programTargetId)
      : null;

    return {
      id: ge.iepGoalId,
      goalArea: ge.goalArea,
      goalNumber: ge.goalNumber,
      annualGoal: ge.annualGoal,
      targetCriterion: ge.targetCriterion,
      measurementMethod: ge.measurementMethod,
      serviceArea: ge.serviceArea,
      status: ge.goalStatus,
      notes: ge.notes,
      behaviorData: bd ? {
        value: bd.value,
        intervalCount: bd.intervalCount,
        intervalsWith: bd.intervalsWith,
        hourBlock: bd.hourBlock,
        notes: bd.notes,
        targetName: bd.targetName,
        measurementType: bd.measurementType,
        targetDirection: bd.targetDirection,
        goalValue: bd.goalValue,
      } : null,
      programData: pd ? {
        trialsCorrect: pd.trialsCorrect,
        trialsTotal: pd.trialsTotal,
        prompted: pd.prompted,
        stepNumber: pd.stepNumber,
        independenceLevel: pd.independenceLevel,
        percentCorrect: pd.percentCorrect,
        promptLevelUsed: pd.promptLevelUsed,
        notes: pd.notes,
        targetName: pd.targetName,
        programType: pd.programType,
        masteryCriterionPercent: pd.masteryCriterionPercent,
      } : null,
    };
  });

  // Fetch clinical data sessions recorded for this student on the same date
  const dataSessions = await db.select({
    id: dataSessionsTable.id,
    startTime: dataSessionsTable.startTime,
    endTime: dataSessionsTable.endTime,
    notes: dataSessionsTable.notes,
    staffFirst: staffTable.firstName,
    staffLast: staffTable.lastName,
  }).from(dataSessionsTable)
    .leftJoin(staffTable, eq(dataSessionsTable.staffId, staffTable.id))
    .where(and(
      eq(dataSessionsTable.studentId, session.studentId),
      eq(dataSessionsTable.sessionDate, session.sessionDate),
    ));

  const clinicalData: any[] = [];
  for (const ds of dataSessions) {
    const [progRows, behRows] = await Promise.all([
      db.select({
        id: programDataTable.id,
        programTargetId: programDataTable.programTargetId,
        trialsCorrect: programDataTable.trialsCorrect,
        trialsTotal: programDataTable.trialsTotal,
        percentCorrect: programDataTable.percentCorrect,
        promptLevelUsed: programDataTable.promptLevelUsed,
        targetName: programTargetsTable.name,
        programType: programTargetsTable.programType,
      }).from(programDataTable)
        .leftJoin(programTargetsTable, eq(programDataTable.programTargetId, programTargetsTable.id))
        .where(eq(programDataTable.dataSessionId, ds.id)),
      db.select({
        id: behaviorDataTable.id,
        behaviorTargetId: behaviorDataTable.behaviorTargetId,
        value: behaviorDataTable.value,
        intervalCount: behaviorDataTable.intervalCount,
        intervalsWith: behaviorDataTable.intervalsWith,
        targetName: behaviorTargetsTable.name,
        measurementType: behaviorTargetsTable.measurementType,
        targetDirection: behaviorTargetsTable.targetDirection,
      }).from(behaviorDataTable)
        .leftJoin(behaviorTargetsTable, eq(behaviorDataTable.behaviorTargetId, behaviorTargetsTable.id))
        .where(eq(behaviorDataTable.dataSessionId, ds.id)),
    ]);

    clinicalData.push({
      dataSessionId: ds.id,
      startTime: ds.startTime,
      endTime: ds.endTime,
      notes: ds.notes,
      staffName: ds.staffFirst && ds.staffLast ? `${ds.staffFirst} ${ds.staffLast}` : null,
      programData: progRows,
      behaviorData: behRows,
    });
  }

  let availableGoals: any[] = [];
  if (goalEntries.length === 0) {
    const allGoals = await db.select({
      id: iepGoalsTable.id,
      goalArea: iepGoalsTable.goalArea,
      annualGoal: iepGoalsTable.annualGoal,
      targetCriterion: iepGoalsTable.targetCriterion,
      measurementMethod: iepGoalsTable.measurementMethod,
      serviceArea: iepGoalsTable.serviceArea,
      status: iepGoalsTable.status,
    }).from(iepGoalsTable)
      .where(and(
        eq(iepGoalsTable.studentId, session.studentId),
        eq(iepGoalsTable.active, true),
      ));

    const svcName = (session.serviceTypeName || "").toLowerCase();
    availableGoals = allGoals.filter(g => {
      const sa = (g.serviceArea || "").toLowerCase();
      return sa === svcName || svcName.includes(sa.split("/")[0]) || sa.includes(svcName.split(" ")[0]) ||
        (svcName.includes("aba") && sa.includes("aba")) ||
        (svcName.includes("para") && sa.includes("academic")) ||
        (svcName.includes("adapted") && sa.includes("motor")) ||
        (svcName.includes("bcba") && sa.includes("behavior")) ||
        (svcName.includes("counseling") && sa.includes("social"));
    });
  }

  logAudit(req, {
    action: "read",
    targetTable: "session_logs",
    targetId: session.id,
    studentId: session.studentId,
    summary: `Viewed session #${session.id} for student #${session.studentId}`,
  });

  res.json({
    ...session,
    studentName: session.studentFirst ? `${session.studentFirst} ${session.studentLast}` : null,
    serviceTypeName: session.serviceTypeName,
    staffName: session.staffFirst ? `${session.staffFirst} ${session.staffLast}` : null,
    createdAt: session.createdAt.toISOString(),
    linkedGoals: linkedGoals,
    availableGoals: availableGoals,
    goalCount: linkedGoals.length,
    clinicalData,
  });
});

router.patch("/sessions/:id", async (req, res): Promise<void> => {
  const params = UpdateSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { goalData: rawGoalData, ...bodyFields } = req.body;
  const parsed = UpdateSessionBody.safeParse(bodyFields);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let validatedGoalData: GoalEntry[] | null = null;
  if (rawGoalData && Array.isArray(rawGoalData)) {
    const goalParsed = validateGoalData(rawGoalData);
    if (!goalParsed.valid) {
      res.status(400).json({ error: "Invalid goalData: " + goalParsed.error });
      return;
    }
    validatedGoalData = goalParsed.data;
  }

  const updateData: Partial<typeof sessionLogsTable.$inferInsert> = {};
  if (parsed.data.durationMinutes != null) updateData.durationMinutes = parsed.data.durationMinutes;
  if (parsed.data.status != null) updateData.status = parsed.data.status;
  if (parsed.data.missedReasonId !== undefined) updateData.missedReasonId = parsed.data.missedReasonId;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (parsed.data.location !== undefined) updateData.location = parsed.data.location;
  if (parsed.data.isCompensatory !== undefined && parsed.data.isCompensatory !== null) updateData.isCompensatory = parsed.data.isCompensatory;
  if (parsed.data.compensatoryObligationId !== undefined) updateData.compensatoryObligationId = parsed.data.compensatoryObligationId;

  const [oldSession] = await db.select({
    id: sessionLogsTable.id,
    isCompensatory: sessionLogsTable.isCompensatory,
    compensatoryObligationId: sessionLogsTable.compensatoryObligationId,
    durationMinutes: sessionLogsTable.durationMinutes,
    status: sessionLogsTable.status,
    studentId: sessionLogsTable.studentId,
    staffId: sessionLogsTable.staffId,
    sessionDate: sessionLogsTable.sessionDate,
    startTime: sessionLogsTable.startTime,
    endTime: sessionLogsTable.endTime,
  }).from(sessionLogsTable).where(eq(sessionLogsTable.id, params.data.id));

  if (!oldSession) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const oldIsComp = oldSession.isCompensatory;
  const oldObligId = oldSession.compensatoryObligationId;
  const oldWasCompleted = oldSession.status === "completed" || oldSession.status === "makeup";
  const oldDuration = oldSession.durationMinutes;

  const newIsComp = updateData.isCompensatory ?? oldSession.isCompensatory;
  const newObligId = updateData.compensatoryObligationId !== undefined ? updateData.compensatoryObligationId : oldSession.compensatoryObligationId;
  const newStatus = updateData.status ?? oldSession.status;
  const newIsCompleted = newStatus === "completed" || newStatus === "makeup";
  const newDuration = updateData.durationMinutes ?? oldSession.durationMinutes;

  if (newIsComp && !newObligId) {
    res.status(400).json({ error: "compensatoryObligationId is required when isCompensatory is true" });
    return;
  }
  if (!newIsComp && newObligId) {
    updateData.compensatoryObligationId = null;
  }

  const compChanged = oldIsComp !== newIsComp || oldObligId !== newObligId || oldDuration !== newDuration || oldWasCompleted !== newIsCompleted;

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const txDb = drizzle(client);

      if (compChanged && (oldIsComp || newIsComp)) {
        if (oldIsComp && oldObligId && oldWasCompleted) {
          const [oldObligation] = await txDb.select().from(compensatoryObligationsTable)
            .where(eq(compensatoryObligationsTable.id, oldObligId));
          if (oldObligation) {
            const newDelivered = Math.max(0, oldObligation.minutesDelivered - oldDuration);
            const revertedStatus = newDelivered >= oldObligation.minutesOwed ? "completed" : (newDelivered > 0 ? "in_progress" : "pending");
            await txDb.update(compensatoryObligationsTable)
              .set({ minutesDelivered: newDelivered, status: revertedStatus })
              .where(eq(compensatoryObligationsTable.id, oldObligId));
          }
        }

        if (newIsComp && newObligId) {
          const [newObligation] = await txDb.select().from(compensatoryObligationsTable)
            .where(eq(compensatoryObligationsTable.id, newObligId));
          if (!newObligation) {
            await client.query("ROLLBACK");
            client.release();
            res.status(400).json({ error: "Compensatory obligation not found" });
            return;
          }
          if (newObligation.studentId !== oldSession.studentId) {
            await client.query("ROLLBACK");
            client.release();
            res.status(400).json({ error: "Obligation student does not match session student" });
            return;
          }
          if (newObligation.status === "completed" || newObligation.status === "waived") {
            await client.query("ROLLBACK");
            client.release();
            res.status(400).json({ error: `Cannot link sessions to a ${newObligation.status} obligation` });
            return;
          }
          if (newIsCompleted) {
            const addedDelivered = newObligation.minutesDelivered + newDuration;
            const addedStatus = addedDelivered >= newObligation.minutesOwed ? "completed" : "in_progress";
            await txDb.update(compensatoryObligationsTable)
              .set({ minutesDelivered: addedDelivered, status: addedStatus })
              .where(eq(compensatoryObligationsTable.id, newObligId));
          }
        }
      }

      const [session] = await txDb.update(sessionLogsTable).set(updateData).where(eq(sessionLogsTable.id, params.data.id)).returning();
      if (!session) {
        await client.query("ROLLBACK");
        client.release();
        res.status(404).json({ error: "Session not found" });
        return;
      }

      if (validatedGoalData !== null) {
        await txDb.delete(sessionGoalDataTable).where(eq(sessionGoalDataTable.sessionLogId, session.id));

        const existingDS = await txDb.select().from(dataSessionsTable).where(eq(dataSessionsTable.sessionLogId, session.id));
        for (const ds of existingDS) {
          await txDb.delete(behaviorDataTable).where(eq(behaviorDataTable.dataSessionId, ds.id));
          await txDb.delete(programDataTable).where(eq(programDataTable.dataSessionId, ds.id));
          await txDb.delete(dataSessionsTable).where(eq(dataSessionsTable.id, ds.id));
        }

        if (validatedGoalData.length > 0) {
          const [dataSession] = await txDb.insert(dataSessionsTable).values({
            studentId: session.studentId,
            staffId: session.staffId,
            sessionLogId: session.id,
            sessionDate: session.sessionDate,
            startTime: session.startTime,
            endTime: session.endTime,
            notes: session.notes,
          }).returning();

          for (const entry of validatedGoalData) {
            await txDb.insert(sessionGoalDataTable).values({
              sessionLogId: session.id,
              iepGoalId: entry.iepGoalId,
              notes: entry.notes || null,
            });

            if (entry.behaviorData && entry.behaviorTargetId) {
              await txDb.insert(behaviorDataTable).values({
                dataSessionId: dataSession.id,
                behaviorTargetId: entry.behaviorTargetId,
                value: String(entry.behaviorData.value),
                intervalCount: entry.behaviorData.intervalCount ?? null,
                intervalsWith: entry.behaviorData.intervalsWith ?? null,
                hourBlock: entry.behaviorData.hourBlock ?? null,
                notes: entry.behaviorData.notes ?? null,
              });
            }

            if (entry.programData && entry.programTargetId) {
              const trialsCorrect = entry.programData.trialsCorrect ?? 0;
              const trialsTotal = entry.programData.trialsTotal ?? 0;
              const pctCorrect = trialsTotal > 0 ? Math.round((trialsCorrect / trialsTotal) * 100) : 0;
              await txDb.insert(programDataTable).values({
                dataSessionId: dataSession.id,
                programTargetId: entry.programTargetId,
                trialsCorrect,
                trialsTotal,
                prompted: entry.programData.prompted ?? 0,
                stepNumber: entry.programData.stepNumber ?? null,
                independenceLevel: entry.programData.independenceLevel ?? null,
                percentCorrect: String(pctCorrect),
                promptLevelUsed: entry.programData.promptLevelUsed ?? null,
                notes: entry.programData.notes ?? null,
              });
            }
          }
        }
      }

      await client.query("COMMIT");
      logAudit(req, {
        action: "update",
        targetTable: "session_logs",
        targetId: session.id,
        studentId: session.studentId,
        summary: `Updated session #${session.id} for student #${session.studentId}`,
        oldValues: Object.fromEntries(Object.keys(updateData).map(k => [k, (oldSession as Record<string, unknown>)[k]])),
        newValues: updateData as Record<string, unknown>,
      });
      res.json({ ...session, createdAt: session.createdAt.toISOString() });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (e: any) {
    console.error("PATCH /sessions/:id error:", e);
    res.status(500).json({ error: "Failed to update session" });
  }
});

router.get("/students/:studentId/minutes-trend", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { from, to } = req.query;

    const conditions: any[] = [
      eq(sessionLogsTable.studentId, studentId),
      eq(sessionLogsTable.status, "completed"),
    ];
    if (from) conditions.push(gte(sessionLogsTable.sessionDate, from as string));
    if (to) conditions.push(lte(sessionLogsTable.sessionDate, to as string));

    const rows = await db.select({
      sessionDate: sessionLogsTable.sessionDate,
      durationMinutes: sessionLogsTable.durationMinutes,
      serviceTypeName: serviceTypesTable.name,
      serviceTypeId: sessionLogsTable.serviceTypeId,
      staffId: sessionLogsTable.staffId,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
    })
      .from(sessionLogsTable)
      .innerJoin(serviceTypesTable, eq(sessionLogsTable.serviceTypeId, serviceTypesTable.id))
      .leftJoin(staffTable, eq(sessionLogsTable.staffId, staffTable.id))
      .where(and(...conditions))
      .orderBy(asc(sessionLogsTable.sessionDate));

    const data = rows.map((r) => ({
      date: r.sessionDate,
      value: r.durationMinutes ?? 0,
      serviceTypeName: r.serviceTypeName,
      serviceTypeId: r.serviceTypeId,
      staffId: r.staffId,
      staffName: r.staffFirst && r.staffLast ? `${r.staffFirst} ${r.staffLast}` : null,
    }));

    res.json(data);
  } catch (e: any) {
    console.error("GET minutes-trend error:", e);
    res.status(500).json({ error: "Failed to fetch minutes trend" });
  }
});

router.delete("/sessions/:id", async (req, res): Promise<void> => {
  const params = DeleteSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [existing] = await db.select({
    id: sessionLogsTable.id,
    studentId: sessionLogsTable.studentId,
    sessionDate: sessionLogsTable.sessionDate,
    isCompensatory: sessionLogsTable.isCompensatory,
    compensatoryObligationId: sessionLogsTable.compensatoryObligationId,
    durationMinutes: sessionLogsTable.durationMinutes,
    status: sessionLogsTable.status,
  }).from(sessionLogsTable).where(eq(sessionLogsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (existing.isCompensatory && existing.compensatoryObligationId) {
    const completedStatus = existing.status === "completed" || existing.status === "makeup";
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const txDb = drizzle(client);

      await txDb.delete(sessionLogsTable).where(eq(sessionLogsTable.id, params.data.id));

      if (completedStatus) {
        const [obligation] = await txDb.select().from(compensatoryObligationsTable)
          .where(eq(compensatoryObligationsTable.id, existing.compensatoryObligationId));
        if (obligation) {
          const newDelivered = Math.max(0, obligation.minutesDelivered - existing.durationMinutes);
          const newStatus = newDelivered >= obligation.minutesOwed ? "completed" : (newDelivered > 0 ? "in_progress" : "pending");
          await txDb.update(compensatoryObligationsTable)
            .set({ minutesDelivered: newDelivered, status: newStatus })
            .where(eq(compensatoryObligationsTable.id, existing.compensatoryObligationId));
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } else {
    await db.delete(sessionLogsTable).where(eq(sessionLogsTable.id, params.data.id));
  }

  logAudit(req, {
    action: "delete",
    targetTable: "session_logs",
    targetId: existing.id,
    studentId: existing.studentId,
    summary: `Deleted session #${existing.id} for student #${existing.studentId} on ${existing.sessionDate}`,
    oldValues: { sessionDate: existing.sessionDate, durationMinutes: existing.durationMinutes, status: existing.status } as Record<string, unknown>,
  });
  res.sendStatus(204);
});

export default router;
