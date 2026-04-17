// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  programTargetsTable, programStepsTable, programTemplatesTable,
} from "@workspace/db";
import { eq, and, sql, asc } from "drizzle-orm";

const router: IRouter = Router();

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

export default router;
