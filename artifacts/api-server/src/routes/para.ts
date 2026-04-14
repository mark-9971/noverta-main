import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  scheduleBlocksTable, staffTable, studentsTable, serviceTypesTable,
  iepGoalsTable, programTargetsTable, behaviorTargetsTable,
  programStepsTable, behaviorInterventionPlansTable, sessionLogsTable,
} from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";

const router: IRouter = Router();

function dayOfWeekFromDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][d.getDay()];
}

async function resolveStaffId(userId: string): Promise<number | null> {
  const rows = await db
    .select({ id: staffTable.id })
    .from(staffTable)
    .where(eq(staffTable.email, userId))
    .limit(1);
  if (rows.length > 0) return rows[0].id;

  const allStaff = await db
    .select({ id: staffTable.id, email: staffTable.email })
    .from(staffTable)
    .where(eq(staffTable.status, "active"))
    .limit(1);
  return allStaff.length > 0 ? allStaff[0].id : null;
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

router.get("/para/my-day", requireAuth, async (req, res): Promise<void> => {
  try {
    const authed = req as AuthedRequest;
    let staffId = Number(req.query.staffId);
    const date = (req.query.date as string) || new Date().toISOString().split("T")[0];

    if (!staffId || isNaN(staffId)) {
      const resolved = await resolveStaffId(authed.userId);
      if (!resolved) {
        res.status(400).json({ error: "staffId is required and could not be resolved from auth" });
        return;
      }
      staffId = resolved;
    }

    if (authed.trellisRole === "para") {
      const staffRows = await db
        .select({ id: staffTable.id })
        .from(staffTable)
        .where(eq(staffTable.id, staffId))
        .limit(1);
      if (staffRows.length === 0) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }

    const dayOfWeek = dayOfWeekFromDate(date);

    const blocks: ScheduleBlockRow[] = await db
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
      .orderBy(scheduleBlocksTable.startTime);

    res.json({
      date,
      dayOfWeek,
      blocks: blocks.map(b => ({
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
      })),
    });
  } catch (e: unknown) {
    console.error("GET /para/my-day error:", e);
    res.status(500).json({ error: "Failed to load schedule" });
  }
});

router.get("/para/student-targets/:studentId", requireAuth, async (req, res): Promise<void> => {
  try {
    const authed = req as AuthedRequest;
    const studentId = Number(req.params.studentId);
    const serviceTypeId = req.query.serviceTypeId ? Number(req.query.serviceTypeId) : null;

    if (!studentId || isNaN(studentId)) {
      res.status(400).json({ error: "Invalid studentId" });
      return;
    }

    if (authed.trellisRole === "para") {
      const assignedBlocks = await db
        .select({ id: scheduleBlocksTable.id })
        .from(scheduleBlocksTable)
        .where(and(
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

    const goalIds = goals.map(g => g.id);
    const filteredPrograms = serviceTypeId && goalIds.length > 0
      ? programs.filter(p => goals.some(g => g.programTargetId === p.id))
      : programs;
    const filteredBehaviors = serviceTypeId && goalIds.length > 0
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

router.post("/para/sessions/quick-start", requireAuth, async (req, res): Promise<void> => {
  try {
    const authed = req as AuthedRequest;
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

    if (authed.trellisRole === "para" && block.staffId) {
      const resolved = await resolveStaffId(authed.userId);
      if (resolved !== block.staffId) {
        res.status(403).json({ error: "Access denied: not your schedule block" });
        return;
      }
    }

    if (!block.studentId) {
      res.status(400).json({ error: "Schedule block has no student assigned" });
      return;
    }

    const startParts = block.startTime.split(":");
    const endParts = block.endTime.split(":");
    const scheduledMinutes =
      (parseInt(endParts[0]) * 60 + parseInt(endParts[1])) -
      (parseInt(startParts[0]) * 60 + parseInt(startParts[1]));

    const [session] = await db.insert(sessionLogsTable).values({
      studentId: block.studentId,
      staffId: block.staffId,
      serviceTypeId: block.serviceTypeId,
      sessionDate: body.sessionDate,
      startTime: body.startTime,
      endTime: null,
      durationMinutes: Math.max(scheduledMinutes, 1),
      location: block.location,
      status: "in_progress",
      notes: null,
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

export default router;
