import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  behaviorTargetsTable, programTargetsTable, dataSessionsTable,
  behaviorDataTable, programDataTable, studentsTable, staffTable,
  programStepsTable, programTemplatesTable, phaseChangesTable
} from "@workspace/db";
import { eq, desc, and, sql, gte, lte, asc, isNotNull } from "drizzle-orm";

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
    for (const key of ["name","description","measurementType","targetDirection","active","trackingMethod","intervalLengthSeconds","enableHourlyTracking"]) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (req.body.baselineValue !== undefined) updates.baselineValue = req.body.baselineValue != null ? String(req.body.baselineValue) : null;
    if (req.body.goalValue !== undefined) updates.goalValue = req.body.goalValue != null ? String(req.body.goalValue) : null;
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

    res.status(201).json({ ...result, createdAt: result.createdAt.toISOString(), updatedAt: result.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("POST program-target error:", e);
    res.status(500).json({ error: "Failed to create program target" });
  }
});

router.patch("/program-targets/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const updates: any = {};
    for (const key of ["name","description","programType","targetCriterion","domain","active",
                        "promptHierarchy","currentPromptLevel","currentStep","autoProgressEnabled",
                        "masteryCriterionPercent","masteryCriterionSessions","regressionThreshold",
                        "regressionSessions","reinforcementSchedule","reinforcementType","tutorInstructions"]) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const [updated] = await db.update(programTargetsTable).set(updates).where(eq(programTargetsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
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
    await db.delete(programStepsTable).where(eq(programStepsTable.id, id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to delete step" });
  }
});

router.get("/program-templates", async (req, res): Promise<void> => {
  try {
    const { category, tier, schoolId: qSchoolId, scope, search } = req.query;
    const conditions: any[] = [];
    if (category && category !== "all") conditions.push(eq(programTemplatesTable.category, category as string));
    if (tier && tier !== "all") conditions.push(eq(programTemplatesTable.tier, tier as string));
    if (qSchoolId) conditions.push(eq(programTemplatesTable.schoolId, parseInt(qSchoolId as string)));
    if (scope === "global") conditions.push(eq(programTemplatesTable.isGlobal, true));
    if (scope === "school") conditions.push(eq(programTemplatesTable.isGlobal, false));
    if (search) conditions.push(sql`(${programTemplatesTable.name} ILIKE ${'%' + search + '%'} OR ${programTemplatesTable.description} ILIKE ${'%' + search + '%'})`);
    const templates = await db.select().from(programTemplatesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(programTemplatesTable.category), asc(programTemplatesTable.name));
    res.json(templates.map(t => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })));
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

router.post("/program-templates", async (req, res): Promise<void> => {
  try {
    const { name, description, category, programType, domain, isGlobal, schoolId,
            promptHierarchy, defaultMasteryPercent, defaultMasterySessions,
            defaultRegressionThreshold, defaultReinforcementSchedule, defaultReinforcementType,
            tutorInstructions, steps, tier, tags, createdBy } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const [template] = await db.insert(programTemplatesTable).values({
      name, description: description || null, category: category || "academic",
      programType: programType || "discrete_trial", domain: domain || null,
      isGlobal: isGlobal ?? true, schoolId: schoolId || null,
      tier: tier || "free", tags: tags || [], createdBy: createdBy || null,
      promptHierarchy: promptHierarchy || ["full_physical","partial_physical","model","gestural","verbal","independent"],
      defaultMasteryPercent: defaultMasteryPercent ?? 80,
      defaultMasterySessions: defaultMasterySessions ?? 3,
      defaultRegressionThreshold: defaultRegressionThreshold ?? 50,
      defaultReinforcementSchedule: defaultReinforcementSchedule || "continuous",
      defaultReinforcementType: defaultReinforcementType || null,
      tutorInstructions: tutorInstructions || null,
      steps: steps || [],
    } as any).returning();
    res.status(201).json({ ...template, createdAt: template.createdAt.toISOString(), updatedAt: template.updatedAt.toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to create template" });
  }
});

router.put("/program-templates/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const updates: any = {};
    for (const key of ["name","description","category","programType","domain","isGlobal","schoolId",
                        "tier","tags","promptHierarchy","defaultMasteryPercent","defaultMasterySessions",
                        "defaultRegressionThreshold","defaultReinforcementSchedule","defaultReinforcementType",
                        "tutorInstructions","steps"]) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const [updated] = await db.update(programTemplatesTable).set(updates).where(eq(programTemplatesTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("PUT program-template error:", e);
    res.status(500).json({ error: "Failed to update template" });
  }
});

router.delete("/program-templates/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(programTemplatesTable).where(eq(programTemplatesTable.id, id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to delete template" });
  }
});

router.post("/program-templates/:id/duplicate", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [original] = await db.select().from(programTemplatesTable).where(eq(programTemplatesTable.id, id));
    if (!original) { res.status(404).json({ error: "Not found" }); return; }
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = original;
    const [copy] = await db.insert(programTemplatesTable).values({
      ...rest,
      name: `${original.name} (Copy)`,
      isGlobal: false,
      tier: "free",
      usageCount: 0,
    } as any).returning();
    res.status(201).json({ ...copy, createdAt: copy.createdAt.toISOString(), updatedAt: copy.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("Duplicate template error:", e);
    res.status(500).json({ error: "Failed to duplicate template" });
  }
});

router.post("/program-targets/:id/save-as-template", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [target] = await db.select().from(programTargetsTable).where(eq(programTargetsTable.id, id));
    if (!target) { res.status(404).json({ error: "Not found" }); return; }
    const steps = await db.select().from(programStepsTable)
      .where(eq(programStepsTable.programTargetId, id))
      .orderBy(asc(programStepsTable.stepNumber));
    const { name: overrideName, description: overrideDesc, isGlobal, schoolId, tier } = req.body;
    const [template] = await db.insert(programTemplatesTable).values({
      name: overrideName || target.name,
      description: overrideDesc || target.description || null,
      category: "academic",
      programType: target.programType,
      domain: target.domain || null,
      isGlobal: isGlobal ?? false,
      schoolId: schoolId || null,
      tier: tier || "free",
      promptHierarchy: target.promptHierarchy as string[],
      defaultMasteryPercent: target.masteryCriterionPercent ?? 80,
      defaultMasterySessions: target.masteryCriterionSessions ?? 3,
      defaultRegressionThreshold: target.regressionThreshold ?? 50,
      reinforcementSchedule: target.reinforcementSchedule || "continuous",
      reinforcementType: target.reinforcementType || null,
      tutorInstructions: target.tutorInstructions || null,
      steps: steps.map(s => ({
        name: s.name,
        sdInstruction: s.sdInstruction || undefined,
        targetResponse: s.targetResponse || undefined,
        materials: s.materials || undefined,
        promptStrategy: s.promptStrategy || undefined,
        errorCorrection: s.errorCorrection || undefined,
      })),
    } as any).returning();
    res.status(201).json({ ...template, createdAt: template.createdAt.toISOString(), updatedAt: template.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("Save as template error:", e);
    res.status(500).json({ error: "Failed to save as template" });
  }
});

router.post("/program-templates/:id/clone-to-student", async (req, res): Promise<void> => {
  try {
    const templateId = parseInt(req.params.id);
    const { studentId } = req.body;
    if (!studentId) { res.status(400).json({ error: "studentId is required" }); return; }

    const [template] = await db.select().from(programTemplatesTable).where(eq(programTemplatesTable.id, templateId));
    if (!template) { res.status(404).json({ error: "Template not found" }); return; }

    await db.update(programTemplatesTable)
      .set({ usageCount: sql`${programTemplatesTable.usageCount} + 1` })
      .where(eq(programTemplatesTable.id, templateId));

    const result = await db.transaction(async (tx) => {
      const [target] = await tx.insert(programTargetsTable).values({
        studentId,
        name: template.name,
        description: template.description,
        programType: template.programType,
        domain: template.domain,
        templateId: template.id,
        promptHierarchy: template.promptHierarchy as string[],
        currentPromptLevel: "verbal",
        autoProgressEnabled: true,
        masteryCriterionPercent: template.defaultMasteryPercent ?? 80,
        masteryCriterionSessions: template.defaultMasterySessions ?? 3,
        regressionThreshold: template.defaultRegressionThreshold ?? 50,
        regressionSessions: 2,
        reinforcementSchedule: template.defaultReinforcementSchedule || "continuous",
        reinforcementType: template.defaultReinforcementType,
        tutorInstructions: template.tutorInstructions,
        targetCriterion: `${template.defaultMasteryPercent ?? 80}% across ${template.defaultMasterySessions ?? 3} sessions`,
      }).returning();

      const stepsData = template.steps as any[] ?? [];
      for (let i = 0; i < stepsData.length; i++) {
        const s = stepsData[i];
        await tx.insert(programStepsTable).values({
          programTargetId: target.id,
          stepNumber: i + 1,
          name: s.name,
          sdInstruction: s.sdInstruction || null,
          targetResponse: s.targetResponse || null,
          materials: s.materials || null,
          promptStrategy: s.promptStrategy || null,
          errorCorrection: s.errorCorrection || null,
        });
      }

      return target;
    });

    res.status(201).json({ ...result, createdAt: result.createdAt.toISOString(), updatedAt: result.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("Clone template error:", e);
    res.status(500).json({ error: "Failed to clone template" });
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
    const allAboveMastery = masteryCheck.every(d => parseFloat(d.percentCorrect ?? "0") >= masteryPct);

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
    const allBelowThreshold = regressionCheck.every(d => parseFloat(d.percentCorrect ?? "0") < regressionThreshold);

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

    const rows = await db.select({
      sessionDate: dataSessionsTable.sessionDate,
      behaviorTargetId: behaviorDataTable.behaviorTargetId,
      targetName: behaviorTargetsTable.name,
      measurementType: behaviorTargetsTable.measurementType,
      value: behaviorDataTable.value,
      hourBlock: behaviorDataTable.hourBlock,
      staffId: dataSessionsTable.staffId,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
    }).from(behaviorDataTable)
      .innerJoin(dataSessionsTable, eq(behaviorDataTable.dataSessionId, dataSessionsTable.id))
      .innerJoin(behaviorTargetsTable, eq(behaviorDataTable.behaviorTargetId, behaviorTargetsTable.id))
      .leftJoin(staffTable, eq(dataSessionsTable.staffId, staffTable.id))
      .where(and(...conditions, ...bdConditions))
      .orderBy(asc(dataSessionsTable.sessionDate));

    const data = rows.map(r => ({
      ...r,
      staffName: r.staffFirst && r.staffLast ? `${r.staffFirst} ${r.staffLast}` : null,
    }));

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

    const rows = await db.select({
      sessionDate: dataSessionsTable.sessionDate,
      programTargetId: programDataTable.programTargetId,
      targetName: programTargetsTable.name,
      programType: programTargetsTable.programType,
      trialsCorrect: programDataTable.trialsCorrect,
      trialsTotal: programDataTable.trialsTotal,
      prompted: programDataTable.prompted,
      percentCorrect: programDataTable.percentCorrect,
      promptLevelUsed: programDataTable.promptLevelUsed,
      staffId: dataSessionsTable.staffId,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
    }).from(programDataTable)
      .innerJoin(dataSessionsTable, eq(programDataTable.dataSessionId, dataSessionsTable.id))
      .innerJoin(programTargetsTable, eq(programDataTable.programTargetId, programTargetsTable.id))
      .leftJoin(staffTable, eq(dataSessionsTable.staffId, staffTable.id))
      .where(and(...conditions, ...pdConditions))
      .orderBy(asc(dataSessionsTable.sessionDate));

    const data = rows.map(r => ({
      ...r,
      staffName: r.staffFirst && r.staffLast ? `${r.staffFirst} ${r.staffLast}` : null,
    }));

    res.json(data);
  } catch (e: any) {
    console.error("GET program trends error:", e);
    res.status(500).json({ error: "Failed to fetch program trends" });
  }
});

router.get("/behavior-targets/:targetId/phase-changes", async (req, res): Promise<void> => {
  try {
    const targetId = parseInt(req.params.targetId);
    const rows = await db.select().from(phaseChangesTable)
      .where(eq(phaseChangesTable.behaviorTargetId, targetId))
      .orderBy(asc(phaseChangesTable.changeDate));
    res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch phase changes" });
  }
});

router.post("/behavior-targets/:targetId/phase-changes", async (req, res): Promise<void> => {
  try {
    const behaviorTargetId = parseInt(req.params.targetId);
    const { changeDate, label, notes } = req.body;
    if (!changeDate || !label) { res.status(400).json({ error: "changeDate and label are required" }); return; }
    const [pc] = await db.insert(phaseChangesTable).values({
      behaviorTargetId, changeDate, label, notes: notes || null,
    }).returning();
    res.status(201).json({ ...pc, createdAt: pc.createdAt.toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to create phase change" });
  }
});

router.patch("/phase-changes/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const updates: any = {};
    for (const key of ["changeDate", "label", "notes"]) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const [updated] = await db.update(phaseChangesTable).set(updates).where(eq(phaseChangesTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to update phase change" });
  }
});

router.delete("/phase-changes/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(phaseChangesTable).where(eq(phaseChangesTable.id, id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to delete phase change" });
  }
});

router.get("/students/:studentId/phase-changes", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const targets = await db.select({ id: behaviorTargetsTable.id })
      .from(behaviorTargetsTable)
      .where(eq(behaviorTargetsTable.studentId, studentId));
    const targetIds = targets.map(t => t.id);
    if (targetIds.length === 0) { res.json({}); return; }

    const rows = await db.select().from(phaseChangesTable)
      .where(sql`${phaseChangesTable.behaviorTargetId} IN (${sql.join(targetIds.map(id => sql`${id}`), sql`, `)})`)
      .orderBy(asc(phaseChangesTable.changeDate));

    const byTarget: Record<number, any[]> = {};
    for (const r of rows) {
      if (!byTarget[r.behaviorTargetId]) byTarget[r.behaviorTargetId] = [];
      byTarget[r.behaviorTargetId].push({ ...r, createdAt: r.createdAt.toISOString() });
    }
    res.json(byTarget);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch phase changes" });
  }
});

router.get("/students/:studentId/ioa-summary", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { from, to, behaviorTargetId } = req.query;

    const conditions = [
      eq(dataSessionsTable.studentId, studentId),
      isNotNull(behaviorDataTable.ioaSessionId),
    ];
    if (from) conditions.push(gte(dataSessionsTable.sessionDate, from as string));
    if (to) conditions.push(lte(dataSessionsTable.sessionDate, to as string));
    if (behaviorTargetId) conditions.push(eq(behaviorDataTable.behaviorTargetId, parseInt(behaviorTargetId as string)));

    const rows = await db.select({
      behaviorTargetId: behaviorDataTable.behaviorTargetId,
      targetName: behaviorTargetsTable.name,
      measurementType: behaviorTargetsTable.measurementType,
      ioaSessionId: behaviorDataTable.ioaSessionId,
      observerNumber: behaviorDataTable.observerNumber,
      observerName: behaviorDataTable.observerName,
      value: behaviorDataTable.value,
      intervalCount: behaviorDataTable.intervalCount,
      intervalsWith: behaviorDataTable.intervalsWith,
      intervalScores: behaviorDataTable.intervalScores,
      eventTimestamps: behaviorDataTable.eventTimestamps,
      sessionDate: dataSessionsTable.sessionDate,
    }).from(behaviorDataTable)
      .innerJoin(dataSessionsTable, eq(behaviorDataTable.dataSessionId, dataSessionsTable.id))
      .innerJoin(behaviorTargetsTable, eq(behaviorDataTable.behaviorTargetId, behaviorTargetsTable.id))
      .where(and(...conditions))
      .orderBy(asc(dataSessionsTable.sessionDate));

    const grouped: Record<string, any[]> = {};
    for (const r of rows) {
      const key = `${r.behaviorTargetId}-${r.ioaSessionId}-${r.sessionDate}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    }

    const ioaResults: Array<{
      behaviorTargetId: number;
      targetName: string;
      ioaSessionId: number;
      sessionDate: string;
      observer1Value: number;
      observer2Value: number;
      observer1Name: string;
      observer2Name: string;
      agreementPercent: number;
      measurementType: string;
      ioaMethod: string;
      dataQuality: "point_by_point" | "aggregate_fallback";
    }> = [];

    for (const [, observations] of Object.entries(grouped)) {
      if (observations.length < 2) continue;
      const obs1 = observations.find((o: any) => o.observerNumber === 1);
      const obs2 = observations.find((o: any) => o.observerNumber === 2);
      if (!obs1 || !obs2) continue;

      let agreement = 0;
      const v1 = parseFloat(obs1.value);
      const v2 = parseFloat(obs2.value);
      const mt = obs1.measurementType;
      let ioaMethod = "total_count";
      let dataQuality: "point_by_point" | "aggregate_fallback" = "aggregate_fallback";

      if (mt === "frequency") {
        const ts1 = obs1.eventTimestamps as number[] | null;
        const ts2 = obs2.eventTimestamps as number[] | null;
        if (ts1 && ts2 && ts1.length > 0 && ts2.length > 0) {
          const windowMs = 2000;
          const matched2 = new Set<number>();
          let agreements = 0;
          for (const t1 of ts1) {
            for (let j = 0; j < ts2.length; j++) {
              if (!matched2.has(j) && Math.abs(t1 - ts2[j]) <= windowMs) {
                agreements++;
                matched2.add(j);
                break;
              }
            }
          }
          const totalEvents = Math.max(ts1.length, ts2.length);
          agreement = totalEvents > 0 ? Math.round((agreements / totalEvents) * 100) : 100;
          ioaMethod = "point_by_point";
          dataQuality = "point_by_point";
        } else {
          const smaller = Math.min(v1, v2);
          const larger = Math.max(v1, v2);
          agreement = larger > 0 ? Math.round((smaller / larger) * 100) : (v1 === v2 ? 100 : 0);
          ioaMethod = "total_count";
          dataQuality = "aggregate_fallback";
        }
      } else if (mt === "interval") {
        const scores1 = obs1.intervalScores as boolean[] | null;
        const scores2 = obs2.intervalScores as boolean[] | null;
        if (scores1 && scores2 && scores1.length > 0 && scores2.length > 0) {
          const len = Math.max(scores1.length, scores2.length);
          let agreements = 0;
          for (let i = 0; i < len; i++) {
            const s1 = i < scores1.length ? scores1[i] : false;
            const s2 = i < scores2.length ? scores2[i] : false;
            if (s1 === s2) agreements++;
          }
          agreement = Math.round((agreements / len) * 100);
          ioaMethod = "interval_by_interval";
          dataQuality = "point_by_point";
        } else if (obs1.intervalCount && obs2.intervalCount && obs1.intervalsWith != null && obs2.intervalsWith != null) {
          const totalIntervals = Math.max(obs1.intervalCount, obs2.intervalCount);
          const obs1Without = obs1.intervalCount - (obs1.intervalsWith ?? 0);
          const obs2Without = obs2.intervalCount - (obs2.intervalsWith ?? 0);
          const agreedPresent = Math.min(obs1.intervalsWith, obs2.intervalsWith);
          const agreedAbsent = Math.min(obs1Without, obs2Without);
          const totalAgreements = agreedPresent + agreedAbsent;
          agreement = totalIntervals > 0 ? Math.round((totalAgreements / totalIntervals) * 100) : 0;
          ioaMethod = "interval_by_interval";
          dataQuality = "aggregate_fallback";
        } else {
          const smaller = Math.min(v1, v2);
          const larger = Math.max(v1, v2);
          agreement = larger > 0 ? Math.round((smaller / larger) * 100) : (v1 === v2 ? 100 : 0);
          ioaMethod = "total_count";
          dataQuality = "aggregate_fallback";
        }
      } else if (mt === "duration") {
        agreement = v1 === v2 ? 100 : 0;
        ioaMethod = "exact_agreement";
        dataQuality = "point_by_point";
      } else {
        agreement = v1 === v2 ? 100 : 0;
        ioaMethod = "exact_agreement";
        dataQuality = "point_by_point";
      }

      ioaResults.push({
        behaviorTargetId: obs1.behaviorTargetId,
        targetName: obs1.targetName,
        ioaSessionId: obs1.ioaSessionId!,
        sessionDate: obs1.sessionDate,
        observer1Value: v1,
        observer2Value: v2,
        observer1Name: obs1.observerName || "Observer 1",
        observer2Name: obs2.observerName || "Observer 2",
        agreementPercent: Math.max(0, Math.min(100, agreement)),
        measurementType: mt,
        ioaMethod,
        dataQuality,
      });
    }

    const byTarget: Record<number, { targetName: string; sessions: typeof ioaResults; averageAgreement: number; meetsThreshold: boolean }> = {};
    for (const r of ioaResults) {
      if (!byTarget[r.behaviorTargetId]) {
        byTarget[r.behaviorTargetId] = { targetName: r.targetName, sessions: [], averageAgreement: 0, meetsThreshold: false };
      }
      byTarget[r.behaviorTargetId].sessions.push(r);
    }
    for (const [, data] of Object.entries(byTarget)) {
      const avg = data.sessions.length > 0
        ? Math.round(data.sessions.reduce((s, d) => s + d.agreementPercent, 0) / data.sessions.length)
        : 0;
      data.averageAgreement = avg;
      data.meetsThreshold = avg >= 80;
    }

    res.json(byTarget);
  } catch (e: any) {
    console.error("GET IOA summary error:", e);
    res.status(500).json({ error: "Failed to fetch IOA summary" });
  }
});

export default router;
