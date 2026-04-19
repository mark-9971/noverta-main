// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  scheduleBlocksTable, staffTable, studentsTable, serviceTypesTable,
  iepGoalsTable, programTargetsTable, behaviorTargetsTable,
  programStepsTable, behaviorInterventionPlansTable, sessionLogsTable,
  dataSessionsTable, sessionGoalDataTable, programDataTable, behaviorDataTable,
} from "@workspace/db";
import { eq, and, sql, desc, isNull } from "drizzle-orm";
import { requireRoles, type AuthedRequest } from "../middlewares/auth";
import { STAFF_ROLES } from "../lib/permissions";
import { getPublicMeta } from "../lib/clerkClaims";
import { isBlockActiveOnDate } from "../lib/scheduleUtils";

const router: IRouter = Router();

const requireStaff = requireRoles(...STAFF_ROLES);

function dayOfWeekFromDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][d.getDay()];
}

/**
 * Reads staffId from Clerk session publicMetadata, then verifies the staff record
 * exists in the database. Returns null if not found (staff record deleted or
 * Clerk metadata not yet populated).
 */
async function getStaffIdForUser(req: AuthedRequest): Promise<number | null> {
  const clerkStaffId = getPublicMeta(req).staffId ?? null;
  if (clerkStaffId && Number.isFinite(clerkStaffId)) {
    const rows = await db.select({ id: staffTable.id }).from(staffTable)
      .where(eq(staffTable.id, clerkStaffId)).limit(1);
    if (rows.length > 0) return rows[0].id;
  }
  return null;
}

interface ScheduleBlockRow {
  id: number;
  staffId: number;
  studentId: number | null;
  serviceTypeId: number | null;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  location: string | null;
  blockLabel: string | null;
  blockType: string | null;
  notes: string | null;
  studentFirst: string | null;
  studentLast: string | null;
  serviceTypeName: string | null;
}

interface ProgramStepRow {
  id: number;
  programTargetId: number;
  stepNumber: number;
  name: string;
  sdInstruction: string | null;
  targetResponse: string | null;
  materials: string | null;
  promptStrategy: string | null;
  errorCorrection: string | null;
  active: boolean;
  mastered: boolean;
}

interface GoalDataEntry {
  iepGoalId: number;
  notes?: string | null;
  programTargetId?: number;
  programData?: {
    trialsCorrect: number;
    trialsTotal: number;
    promptLevelUsed?: string | null;
    prompted?: number | null;
    stepNumber?: number | null;
    independenceLevel?: string | null;
    notes?: string | null;
  };
  behaviorTargetId?: number;
  behaviorData?: {
    value: number;
    intervalCount?: number | null;
    intervalsWith?: number | null;
    hourBlock?: string | null;
    notes?: string | null;
  };
}

router.get("/para/my-day", requireStaff, async (req, res): Promise<void> => {
  try {
    const authed = req as unknown as AuthedRequest;
    const date = (req.query.date as string) || new Date().toISOString().split("T")[0];

    let staffId = Number(req.query.staffId);

    const myStaffId = await getStaffIdForUser(authed);

    if (authed.trellisRole === "para") {
      if (!myStaffId) {
        res.status(403).json({ error: "No staff profile linked to your account" });
        return;
      }
      if (staffId && staffId !== myStaffId) {
        res.status(403).json({ error: "Access denied: cannot view another staff's schedule" });
        return;
      }
      staffId = myStaffId;
    } else {
      if (!staffId || isNaN(staffId)) {
        if (!myStaffId) {
          res.status(400).json({ error: "staffId is required" });
          return;
        }
        staffId = myStaffId;
      }
    }

    const dayOfWeek = dayOfWeekFromDate(date);

    const [blocks, todaySessions] = await Promise.all([
      db
        .select({
          id: scheduleBlocksTable.id,
          staffId: scheduleBlocksTable.staffId,
          studentId: scheduleBlocksTable.studentId,
          serviceTypeId: scheduleBlocksTable.serviceTypeId,
          dayOfWeek: scheduleBlocksTable.dayOfWeek,
          startTime: scheduleBlocksTable.startTime,
          endTime: scheduleBlocksTable.endTime,
          location: scheduleBlocksTable.location,
          blockLabel: scheduleBlocksTable.blockLabel,
          blockType: scheduleBlocksTable.blockType,
          notes: scheduleBlocksTable.notes,
          isRecurring: scheduleBlocksTable.isRecurring,
          recurrenceType: scheduleBlocksTable.recurrenceType,
          effectiveFrom: scheduleBlocksTable.effectiveFrom,
          studentFirst: studentsTable.firstName,
          studentLast: studentsTable.lastName,
          serviceTypeName: serviceTypesTable.name,
        })
        .from(scheduleBlocksTable)
        .leftJoin(studentsTable, eq(studentsTable.id, scheduleBlocksTable.studentId))
        .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, scheduleBlocksTable.serviceTypeId))
        .where(and(
          eq(scheduleBlocksTable.staffId, staffId),
          eq(scheduleBlocksTable.dayOfWeek, dayOfWeek),
          eq(scheduleBlocksTable.isRecurring, true),
        ))
        .orderBy(scheduleBlocksTable.startTime),
      db
        .select({
          studentId: sessionLogsTable.studentId,
          serviceTypeId: sessionLogsTable.serviceTypeId,
          startTime: sessionLogsTable.startTime,
          status: sessionLogsTable.status,
        })
        .from(sessionLogsTable)
        .where(and(
          eq(sessionLogsTable.staffId, staffId),
          eq(sessionLogsTable.sessionDate, date),
          sql`${sessionLogsTable.deletedAt} IS NULL`,
        )),
    ]);

    const targetDate = new Date(date + "T12:00:00");
    const activeBlocks = blocks.filter(b =>
      isBlockActiveOnDate(
        { id: b.id, isRecurring: b.isRecurring, recurrenceType: b.recurrenceType, effectiveFrom: b.effectiveFrom },
        targetDate,
      )
    );

    const consumed = new Set<number>();
    const blockToSessionStatus = new Map<number, string>();

    // Pass 1: exact time matching — consume sessions with matching startTime
    const exactSessionsByKey = new Map<string, number[]>();
    for (let i = 0; i < todaySessions.length; i++) {
      const s = todaySessions[i];
      if (s.startTime) {
        const k = `${s.studentId ?? ""}:${s.serviceTypeId ?? ""}:${s.startTime}`;
        if (!exactSessionsByKey.has(k)) exactSessionsByKey.set(k, []);
        exactSessionsByKey.get(k)!.push(i);
      }
    }
    const loggedByExact = new Set<number>();
    for (const b of activeBlocks) {
      const k = `${b.studentId ?? ""}:${b.serviceTypeId ?? ""}:${b.startTime}`;
      const candidates = exactSessionsByKey.get(k);
      if (candidates) {
        const idx = candidates.find(i => !consumed.has(i));
        if (idx !== undefined) {
          consumed.add(idx);
          loggedByExact.add(b.id);
          blockToSessionStatus.set(b.id, todaySessions[idx].status);
        }
      }
    }

    // Pass 2: count fallback for remaining sessions (no startTime or time didn't match any block)
    const fallbackQueues = new Map<string, number[]>();
    for (let i = 0; i < todaySessions.length; i++) {
      if (consumed.has(i)) continue;
      const s = todaySessions[i];
      const k = `${s.studentId ?? ""}:${s.serviceTypeId ?? ""}`;
      if (!fallbackQueues.has(k)) fallbackQueues.set(k, []);
      fallbackQueues.get(k)!.push(i);
    }
    const loggedByFallback = new Set<number>();
    for (const b of activeBlocks) {
      if (loggedByExact.has(b.id)) continue;
      const k = `${b.studentId ?? ""}:${b.serviceTypeId ?? ""}`;
      const queue = fallbackQueues.get(k);
      if (queue && queue.length > 0) {
        const idx = queue.shift()!;
        loggedByFallback.add(b.id);
        blockToSessionStatus.set(b.id, todaySessions[idx].status);
      }
    }

    const loggedBlockIds = new Set([...loggedByExact, ...loggedByFallback]);

    res.json({
      date,
      dayOfWeek,
      blocks: activeBlocks.map(b => ({
        id: b.id,
        staffId: b.staffId,
        studentId: b.studentId,
        serviceTypeId: b.serviceTypeId,
        dayOfWeek: b.dayOfWeek,
        startTime: b.startTime,
        endTime: b.endTime,
        location: b.location,
        blockLabel: b.blockLabel,
        blockType: b.blockType,
        notes: b.notes,
        studentName: b.studentFirst ? `${b.studentFirst} ${b.studentLast}` : null,
        serviceTypeName: b.serviceTypeName,
        sessionLogged: loggedBlockIds.has(b.id),
        sessionStatus: blockToSessionStatus.get(b.id) ?? null,
      })),
    });
  } catch (e: unknown) {
    console.error("GET /para/my-day error:", e);
    res.status(500).json({ error: "Failed to load schedule" });
  }
});

router.get("/para/student-targets/:studentId", requireStaff, async (req, res): Promise<void> => {
  try {
    const authed = req as unknown as AuthedRequest;
    const studentId = Number(req.params.studentId);
    const serviceTypeId = req.query.serviceTypeId ? Number(req.query.serviceTypeId) : null;

    if (!studentId || isNaN(studentId)) {
      res.status(400).json({ error: "Invalid studentId" });
      return;
    }

    if (authed.trellisRole === "para") {
      const myStaffId = await getStaffIdForUser(authed);
      if (!myStaffId) {
        res.status(403).json({ error: "No staff profile linked to your account" });
        return;
      }
      const assignedBlocks = await db
        .select({ id: scheduleBlocksTable.id })
        .from(scheduleBlocksTable)
        .where(and(
          eq(scheduleBlocksTable.staffId, myStaffId),
          eq(scheduleBlocksTable.studentId, studentId),
          eq(scheduleBlocksTable.isRecurring, true),
        ))
        .limit(1);
      if (assignedBlocks.length === 0) {
        res.status(403).json({ error: "Access denied: not assigned to this student" });
        return;
      }
    }

    const goalsFilter = [
      eq(iepGoalsTable.studentId, studentId),
      eq(iepGoalsTable.active, true),
    ];
    if (serviceTypeId) {
      goalsFilter.push(eq(iepGoalsTable.serviceArea, sql`(SELECT name FROM service_types WHERE id = ${serviceTypeId})`));
    }

    const [goals, programs, behaviors, bips] = await Promise.all([
      db.select().from(iepGoalsTable).where(and(...goalsFilter)),
      db.select().from(programTargetsTable).where(and(
        eq(programTargetsTable.studentId, studentId),
        eq(programTargetsTable.active, true),
      )),
      db.select().from(behaviorTargetsTable).where(and(
        eq(behaviorTargetsTable.studentId, studentId),
        eq(behaviorTargetsTable.active, true),
      )),
      db.select().from(behaviorInterventionPlansTable).where(and(
        eq(behaviorInterventionPlansTable.studentId, studentId),
        sql`${behaviorInterventionPlansTable.status} IN ('active', 'approved')`,
      )).orderBy(desc(behaviorInterventionPlansTable.version)),
    ]);

    const programIds = programs.map(p => p.id);
    let steps: ProgramStepRow[] = [];
    if (programIds.length > 0) {
      steps = await db.select({
        id: programStepsTable.id,
        programTargetId: programStepsTable.programTargetId,
        stepNumber: programStepsTable.stepNumber,
        name: programStepsTable.name,
        sdInstruction: programStepsTable.sdInstruction,
        targetResponse: programStepsTable.targetResponse,
        materials: programStepsTable.materials,
        promptStrategy: programStepsTable.promptStrategy,
        errorCorrection: programStepsTable.errorCorrection,
        active: programStepsTable.active,
        mastered: programStepsTable.mastered,
      }).from(programStepsTable).where(
        sql`${programStepsTable.programTargetId} IN (${sql.join(programIds.map(id => sql`${id}`), sql`, `)})`
      );
    }

    const filteredPrograms = serviceTypeId
      ? programs.filter(p => goals.some(g => g.programTargetId === p.id))
      : programs;
    const filteredBehaviors = serviceTypeId
      ? behaviors.filter(b => goals.some(g => g.behaviorTargetId === b.id))
      : behaviors;

    res.json({
      goals: goals.map(g => ({
        id: g.id,
        goalArea: g.goalArea,
        goalNumber: g.goalNumber,
        annualGoal: g.annualGoal,
        baseline: g.baseline,
        targetCriterion: g.targetCriterion,
        measurementMethod: g.measurementMethod,
        serviceArea: g.serviceArea,
        status: g.status,
        programTargetId: g.programTargetId,
        behaviorTargetId: g.behaviorTargetId,
      })),
      programs: filteredPrograms.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        programType: p.programType,
        domain: p.domain,
        currentPromptLevel: p.currentPromptLevel,
        currentStep: p.currentStep,
        promptHierarchy: p.promptHierarchy,
        masteryCriterionPercent: p.masteryCriterionPercent,
        masteryCriterionSessions: p.masteryCriterionSessions,
        tutorInstructions: p.tutorInstructions,
        steps: steps
          .filter((s: ProgramStepRow) => s.programTargetId === p.id && s.active)
          .sort((a: ProgramStepRow, b: ProgramStepRow) => a.stepNumber - b.stepNumber)
          .map((s: ProgramStepRow) => ({
            id: s.id,
            stepNumber: s.stepNumber,
            name: s.name,
            sdInstruction: s.sdInstruction,
            targetResponse: s.targetResponse,
            materials: s.materials,
            promptStrategy: s.promptStrategy,
            errorCorrection: s.errorCorrection,
            mastered: s.mastered,
          })),
      })),
      behaviors: filteredBehaviors.map(b => ({
        id: b.id,
        name: b.name,
        description: b.description,
        measurementType: b.measurementType,
        targetDirection: b.targetDirection,
        baselineValue: b.baselineValue,
        goalValue: b.goalValue,
      })),
      bips: bips.map(bip => ({
        id: bip.id,
        targetBehavior: bip.targetBehavior,
        operationalDefinition: bip.operationalDefinition,
        hypothesizedFunction: bip.hypothesizedFunction,
        replacementBehaviors: bip.replacementBehaviors,
        preventionStrategies: bip.preventionStrategies,
        teachingStrategies: bip.teachingStrategies,
        consequenceStrategies: bip.consequenceStrategies,
        crisisPlan: bip.crisisPlan,
        dataCollectionMethod: bip.dataCollectionMethod,
        status: bip.status,
        version: bip.version,
        effectiveDate: bip.effectiveDate,
      })),
    });
  } catch (e: unknown) {
    console.error("GET /para/student-targets error:", e);
    res.status(500).json({ error: "Failed to load student targets" });
  }
});

interface QuickStartBody {
  scheduleBlockId: number;
  sessionDate: string;
  startTime: string;
}

router.post("/para/sessions/quick-start", requireStaff, async (req, res): Promise<void> => {
  try {
    const authed = req as unknown as AuthedRequest;
    const body = req.body as QuickStartBody;

    if (!body.scheduleBlockId || !body.sessionDate || !body.startTime) {
      res.status(400).json({ error: "scheduleBlockId, sessionDate, and startTime are required" });
      return;
    }

    const blocks = await db
      .select({
        id: scheduleBlocksTable.id,
        staffId: scheduleBlocksTable.staffId,
        studentId: scheduleBlocksTable.studentId,
        serviceTypeId: scheduleBlocksTable.serviceTypeId,
        startTime: scheduleBlocksTable.startTime,
        endTime: scheduleBlocksTable.endTime,
        location: scheduleBlocksTable.location,
      })
      .from(scheduleBlocksTable)
      .where(eq(scheduleBlocksTable.id, body.scheduleBlockId))
      .limit(1);

    if (blocks.length === 0) {
      res.status(404).json({ error: "Schedule block not found" });
      return;
    }

    const block = blocks[0];

    if (authed.trellisRole === "para") {
      const myStaffId = await getStaffIdForUser(authed);
      if (!myStaffId || myStaffId !== block.staffId) {
        res.status(403).json({ error: "Access denied: not your schedule block" });
        return;
      }
    }

    if (!block.studentId) {
      res.status(400).json({ error: "Schedule block has no student assigned" });
      return;
    }

    const [session] = await db.insert(sessionLogsTable).values({
      studentId: block.studentId,
      staffId: block.staffId,
      serviceTypeId: block.serviceTypeId,
      sessionDate: body.sessionDate,
      startTime: body.startTime,
      endTime: null,
      durationMinutes: 0,
      location: block.location,
      status: "in_progress",
      notes: null,
      isMakeup: false,
      isCompensatory: false,
    }).returning();

    res.status(201).json({
      session: {
        id: session.id,
        studentId: session.studentId,
        staffId: session.staffId,
        serviceTypeId: session.serviceTypeId,
        sessionDate: session.sessionDate,
        startTime: session.startTime,
        location: session.location,
        status: session.status,
        scheduleBlockId: block.id,
      },
    });
  } catch (e: unknown) {
    console.error("POST /para/sessions/quick-start error:", e);
    res.status(500).json({ error: "Failed to create session" });
  }
});

interface StopSessionBody {
  endTime: string;
  durationMinutes: number;
  notes: string | null;
  status: string;
  goalData?: GoalDataEntry[];
}

router.patch("/para/sessions/:sessionId/stop", requireStaff, async (req, res): Promise<void> => {
  try {
    const authed = req as unknown as AuthedRequest;
    const sessionId = Number(req.params.sessionId);
    const body = req.body as StopSessionBody;

    if (!sessionId || isNaN(sessionId)) {
      res.status(400).json({ error: "Invalid sessionId" });
      return;
    }

    const sessions = await db.select().from(sessionLogsTable)
      .where(and(eq(sessionLogsTable.id, sessionId), isNull(sessionLogsTable.deletedAt))).limit(1);

    if (sessions.length === 0) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const session = sessions[0];

    if (authed.trellisRole === "para") {
      const myStaffId = await getStaffIdForUser(authed);
      if (!myStaffId || session.staffId !== myStaffId) {
        res.status(403).json({ error: "Access denied: not your session" });
        return;
      }
    }

    if (session.status !== "in_progress") {
      res.status(400).json({ error: "Session is not in progress" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(sessionLogsTable)
        .set({
          endTime: body.endTime,
          durationMinutes: body.durationMinutes,
          notes: body.notes,
          status: body.status || "completed",
        })
        .where(eq(sessionLogsTable.id, sessionId))
        .returning();

      if (body.goalData && body.goalData.length > 0) {
        const [dataSession] = await tx.insert(dataSessionsTable).values({
          studentId: updated.studentId,
          staffId: updated.staffId,
          sessionLogId: updated.id,
          sessionDate: updated.sessionDate,
          startTime: updated.startTime,
          endTime: updated.endTime,
          notes: updated.notes,
        }).returning();

        for (const entry of body.goalData) {
          await tx.insert(sessionGoalDataTable).values({
            sessionLogId: updated.id,
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

      return updated;
    });

    res.json({ session: result });
  } catch (e: unknown) {
    console.error("PATCH /para/sessions/:sessionId/stop error:", e);
    res.status(500).json({ error: "Failed to stop session" });
  }
});

export default router;
