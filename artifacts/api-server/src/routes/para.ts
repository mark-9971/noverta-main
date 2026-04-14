import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  scheduleBlocksTable, staffTable, studentsTable, serviceTypesTable,
  iepGoalsTable, programTargetsTable, behaviorTargetsTable,
  programStepsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router: IRouter = Router();

function dayOfWeekFromDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][d.getDay()];
}

router.get("/para/my-day", async (req, res): Promise<void> => {
  try {
    const staffId = Number(req.query.staffId);
    const date = (req.query.date as string) || new Date().toISOString().split("T")[0];

    if (!staffId || isNaN(staffId)) {
      res.status(400).json({ error: "staffId is required" });
      return;
    }

    const dayOfWeek = dayOfWeekFromDate(date);

    const blocks = await db
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
  } catch (e: any) {
    console.error("GET /para/my-day error:", e);
    res.status(500).json({ error: "Failed to load schedule" });
  }
});

router.get("/para/student-targets/:studentId", async (req, res): Promise<void> => {
  try {
    const studentId = Number(req.params.studentId);
    if (!studentId || isNaN(studentId)) {
      res.status(400).json({ error: "Invalid studentId" });
      return;
    }

  const [goals, programs, behaviors] = await Promise.all([
    db.select().from(iepGoalsTable).where(and(
      eq(iepGoalsTable.studentId, studentId),
      eq(iepGoalsTable.active, true),
    )),
    db.select().from(programTargetsTable).where(and(
      eq(programTargetsTable.studentId, studentId),
      eq(programTargetsTable.active, true),
    )),
    db.select().from(behaviorTargetsTable).where(and(
      eq(behaviorTargetsTable.studentId, studentId),
      eq(behaviorTargetsTable.active, true),
    )),
  ]);

  const programIds = programs.map(p => p.id);
  let steps: any[] = [];
  if (programIds.length > 0) {
    steps = await db.select().from(programStepsTable).where(
      sql`${programStepsTable.programTargetId} IN (${sql.join(programIds.map(id => sql`${id}`), sql`, `)})`
    );
  }

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
      programs: programs.map(p => ({
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
          .filter(s => s.programTargetId === p.id && s.active)
          .sort((a: any, b: any) => a.stepNumber - b.stepNumber)
          .map((s: any) => ({
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
      behaviors: behaviors.map(b => ({
        id: b.id,
        name: b.name,
        description: b.description,
        measurementType: b.measurementType,
        targetDirection: b.targetDirection,
        baselineValue: b.baselineValue,
        goalValue: b.goalValue,
      })),
    });
  } catch (e: any) {
    console.error("GET /para/student-targets error:", e);
    res.status(500).json({ error: "Failed to load student targets" });
  }
});

export default router;
