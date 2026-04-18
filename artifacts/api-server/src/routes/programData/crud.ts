// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  behaviorTargetsTable, programTargetsTable,
  programStepsTable,
} from "@workspace/db";
import { eq, and, sql, asc } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import type { AuthedRequest } from "../../middlewares/auth";
import {
  assertBehaviorTargetInCallerDistrict,
  assertProgramTargetInCallerDistrict,
  assertProgramStepInCallerDistrict,
} from "../../lib/districtScope";
import { assertStudentAccessibleToCaller } from "../../lib/staffScope";

const router: IRouter = Router();

router.get("/students/:studentId/behavior-targets", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (!(await assertStudentAccessibleToCaller(req as AuthedRequest, res, studentId))) return;
    const activeOnly = req.query.active !== "false";
    const conditions = [eq(behaviorTargetsTable.studentId, studentId)];
    if (activeOnly) conditions.push(eq(behaviorTargetsTable.active, true));
    const targets = await db.select().from(behaviorTargetsTable)
      .where(and(...conditions))
      .orderBy(asc(behaviorTargetsTable.name));
    logAudit(req, {
      action: "read",
      targetTable: "behavior_targets",
      studentId: studentId,
      summary: `Viewed ${targets.length} behavior targets for student #${studentId}`,
    });
    res.json(targets.map(t => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })));
  } catch (e: any) {
    console.error("GET behavior-targets error:", e);
    res.status(500).json({ error: "Failed to fetch behavior targets" });
  }
});

router.post("/students/:studentId/behavior-targets", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { name, description, measurementType, targetDirection, baselineValue, goalValue,
            trackingMethod, intervalLengthSeconds, enableHourlyTracking, templateId } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const [target] = await db.insert(behaviorTargetsTable).values({
      studentId, name, description: description || null,
      measurementType: measurementType || "frequency",
      targetDirection: targetDirection || "decrease",
      baselineValue: baselineValue != null ? String(baselineValue) : null,
      goalValue: goalValue != null ? String(goalValue) : null,
      trackingMethod: trackingMethod || "per_session",
      intervalLengthSeconds: intervalLengthSeconds || null,
      enableHourlyTracking: enableHourlyTracking ?? false,
      templateId: templateId || null,
    }).returning();
    logAudit(req, {
      action: "create",
      targetTable: "behavior_targets",
      targetId: target.id,
      studentId: studentId,
      summary: `Created behavior target "${name}" for student #${studentId}`,
      newValues: { name, measurementType: measurementType || "frequency", targetDirection: targetDirection || "decrease" } as Record<string, unknown>,
    });
    res.status(201).json({ ...target, createdAt: target.createdAt.toISOString(), updatedAt: target.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("POST behavior-target error:", e);
    res.status(500).json({ error: "Failed to create behavior target" });
  }
});

router.patch("/behavior-targets/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    if (!(await assertBehaviorTargetInCallerDistrict(req as AuthedRequest, id, res))) return;
    const updates: any = {};
    for (const key of ["name","description","measurementType","targetDirection","active","trackingMethod","intervalLengthSeconds","enableHourlyTracking"]) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (req.body.baselineValue !== undefined) updates.baselineValue = req.body.baselineValue != null ? String(req.body.baselineValue) : null;
    if (req.body.goalValue !== undefined) updates.goalValue = req.body.goalValue != null ? String(req.body.goalValue) : null;
    const [oldTarget] = await db.select().from(behaviorTargetsTable).where(eq(behaviorTargetsTable.id, id));
    const [updated] = await db.update(behaviorTargetsTable).set(updates).where(eq(behaviorTargetsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    logAudit(req, {
      action: "update",
      targetTable: "behavior_targets",
      targetId: id,
      studentId: updated.studentId,
      summary: `Updated behavior target #${id}`,
      oldValues: oldTarget ? (Object.fromEntries(Object.keys(updates).map(k => [k, (oldTarget as Record<string, unknown>)[k]]))) : null,
      newValues: updates as Record<string, unknown>,
    });
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("PATCH behavior-target error:", e);
    res.status(500).json({ error: "Failed to update behavior target" });
  }
});

router.get("/students/:studentId/program-targets", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (!(await assertStudentAccessibleToCaller(req as AuthedRequest, res, studentId))) return;
    const activeOnly = req.query.active !== "false";
    const conditions = [eq(programTargetsTable.studentId, studentId)];
    if (activeOnly) conditions.push(eq(programTargetsTable.active, true));
    const targets = await db.select().from(programTargetsTable)
      .where(and(...conditions))
      .orderBy(asc(programTargetsTable.name));
    logAudit(req, {
      action: "read",
      targetTable: "program_targets",
      studentId: studentId,
      summary: `Viewed ${targets.length} program targets for student #${studentId}`,
    });
    res.json(targets.map(t => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })));
  } catch (e: any) {
    console.error("GET program-targets error:", e);
    res.status(500).json({ error: "Failed to fetch program targets" });
  }
});

router.post("/students/:studentId/program-targets", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { name, description, programType, targetCriterion, domain, promptHierarchy,
            currentPromptLevel, autoProgressEnabled, masteryCriterionPercent,
            masteryCriterionSessions, regressionThreshold, regressionSessions,
            reinforcementSchedule, reinforcementType, tutorInstructions, templateId, steps } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }

    const result = await db.transaction(async (tx) => {
      const [target] = await tx.insert(programTargetsTable).values({
        studentId, name, description: description || null,
        programType: programType || "discrete_trial",
        targetCriterion: targetCriterion || null,
        domain: domain || null,
        templateId: templateId || null,
        promptHierarchy: promptHierarchy || ["full_physical","partial_physical","model","gestural","verbal","independent"],
        currentPromptLevel: currentPromptLevel || "verbal",
        autoProgressEnabled: autoProgressEnabled ?? true,
        masteryCriterionPercent: masteryCriterionPercent ?? 80,
        masteryCriterionSessions: masteryCriterionSessions ?? 3,
        regressionThreshold: regressionThreshold ?? 50,
        regressionSessions: regressionSessions ?? 2,
        reinforcementSchedule: reinforcementSchedule || "continuous",
        reinforcementType: reinforcementType || null,
        tutorInstructions: tutorInstructions || null,
      }).returning();

      if (steps && Array.isArray(steps) && steps.length > 0) {
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          await tx.insert(programStepsTable).values({
            programTargetId: target.id,
            stepNumber: i + 1,
            name: s.name,
            sdInstruction: s.sdInstruction || null,
            targetResponse: s.targetResponse || null,
            materials: s.materials || null,
            promptStrategy: s.promptStrategy || null,
            errorCorrection: s.errorCorrection || null,
            reinforcementNotes: s.reinforcementNotes || null,
          });
        }
      }

      return target;
    });

    logAudit(req, {
      action: "create",
      targetTable: "program_targets",
      targetId: result.id,
      studentId: studentId,
      summary: `Created program target "${name}" for student #${studentId}`,
      newValues: { name, programType: programType || "discrete_trial", domain } as Record<string, unknown>,
    });
    res.status(201).json({ ...result, createdAt: result.createdAt.toISOString(), updatedAt: result.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("POST program-target error:", e);
    res.status(500).json({ error: "Failed to create program target" });
  }
});

router.patch("/program-targets/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    if (!(await assertProgramTargetInCallerDistrict(req as AuthedRequest, id, res))) return;
    const updates: any = {};
    for (const key of ["name","description","programType","targetCriterion","domain","active",
                        "promptHierarchy","currentPromptLevel","currentStep","autoProgressEnabled",
                        "masteryCriterionPercent","masteryCriterionSessions","regressionThreshold",
                        "regressionSessions","reinforcementSchedule","reinforcementType","tutorInstructions"]) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const [oldTarget] = await db.select().from(programTargetsTable).where(eq(programTargetsTable.id, id));
    const [updated] = await db.update(programTargetsTable).set(updates).where(eq(programTargetsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    logAudit(req, {
      action: "update",
      targetTable: "program_targets",
      targetId: id,
      studentId: updated.studentId,
      summary: `Updated program target #${id}`,
      oldValues: oldTarget ? (Object.fromEntries(Object.keys(updates).map(k => [k, (oldTarget as Record<string, unknown>)[k]]))) : null,
      newValues: updates as Record<string, unknown>,
    });
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("PATCH program-target error:", e);
    res.status(500).json({ error: "Failed to update program target" });
  }
});

router.get("/program-targets/:id/steps", async (req, res): Promise<void> => {
  try {
    const programTargetId = parseInt(req.params.id);
    const steps = await db.select().from(programStepsTable)
      .where(eq(programStepsTable.programTargetId, programTargetId))
      .orderBy(asc(programStepsTable.stepNumber));
    res.json(steps.map(s => ({ ...s, createdAt: s.createdAt.toISOString() })));
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch steps" });
  }
});

router.post("/program-targets/:id/steps", async (req, res): Promise<void> => {
  try {
    const programTargetId = parseInt(req.params.id);
    const { name, sdInstruction, targetResponse, materials, promptStrategy, errorCorrection, reinforcementNotes } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const existing = await db.select({ maxStep: sql<number>`COALESCE(MAX(${programStepsTable.stepNumber}), 0)` })
      .from(programStepsTable).where(eq(programStepsTable.programTargetId, programTargetId));
    const nextStep = (existing[0]?.maxStep ?? 0) + 1;
    const [step] = await db.insert(programStepsTable).values({
      programTargetId, stepNumber: nextStep, name,
      sdInstruction: sdInstruction || null, targetResponse: targetResponse || null,
      materials: materials || null, promptStrategy: promptStrategy || null,
      errorCorrection: errorCorrection || null, reinforcementNotes: reinforcementNotes || null,
    }).returning();
    res.status(201).json({ ...step, createdAt: step.createdAt.toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to create step" });
  }
});

router.patch("/program-steps/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    if (!(await assertProgramStepInCallerDistrict(req as AuthedRequest, id, res))) return;
    const updates: any = {};
    for (const key of ["name","sdInstruction","targetResponse","materials","promptStrategy","errorCorrection","reinforcementNotes","active","mastered","stepNumber"]) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const [updated] = await db.update(programStepsTable).set(updates).where(eq(programStepsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to update step" });
  }
});

router.delete("/program-steps/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    if (!(await assertProgramStepInCallerDistrict(req as AuthedRequest, id, res))) return;
    await db.delete(programStepsTable).where(eq(programStepsTable.id, id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to delete step" });
  }
});

export default router;
