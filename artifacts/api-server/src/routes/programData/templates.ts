// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  programTargetsTable, programStepsTable, programTemplatesTable,
} from "@workspace/db";
import { eq, and, sql, asc, inArray } from "drizzle-orm";

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

/* ─────────────────────────────────────────────────────────────────────────────
 * GET /program-templates/:id/assigned-students
 * Returns the set of studentIds that currently have an active program target
 * cloned from this template.  Used by the bulk-assign modal for pre-flight
 * collision detection so clinicians can see which students already have
 * the program before committing.
 * ───────────────────────────────────────────────────────────────────────────── */
router.get("/program-templates/:id/assigned-students", async (req, res): Promise<void> => {
  try {
    const templateId = parseInt(req.params.id);
    const rows = await db
      .select({ studentId: programTargetsTable.studentId })
      .from(programTargetsTable)
      .where(
        and(
          eq(programTargetsTable.templateId, templateId),
          eq(programTargetsTable.active, true),
        ),
      );
    res.json({ studentIds: rows.map(r => r.studentId) });
  } catch (e: any) {
    console.error("assigned-students error:", e);
    res.status(500).json({ error: "Failed to fetch assigned students" });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
 * POST /program-templates/:id/bulk-clone
 * Bulk-assigns a template to multiple students safely.
 *
 * Body:
 *   studentIds   number[]           Required. Max 200 per call.
 *   onDuplicate  "skip" | "reassign"  Default "skip".
 *                  skip     — students who already have an active target from
 *                             this template are left untouched.
 *                  reassign — their existing active target is deactivated and
 *                             a fresh copy is created.
 *
 * Response:
 *   { total, assigned, skipped, reassigned, errors, results[] }
 *   where each result is:
 *     { studentId, status: "assigned"|"skipped"|"reassigned"|"error", message?, targetId?, existingTargetId? }
 * ───────────────────────────────────────────────────────────────────────────── */
router.post("/program-templates/:id/bulk-clone", async (req, res): Promise<void> => {
  try {
    const templateId = parseInt(req.params.id);
    const { studentIds, onDuplicate = "skip" } = req.body as {
      studentIds: unknown;
      onDuplicate?: string;
    };

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      res.status(400).json({ error: "studentIds (non-empty array) is required" });
      return;
    }
    if (studentIds.length > 200) {
      res.status(400).json({ error: "Maximum 200 students per bulk operation" });
      return;
    }
    if (onDuplicate !== "skip" && onDuplicate !== "reassign") {
      res.status(400).json({ error: "onDuplicate must be 'skip' or 'reassign'" });
      return;
    }

    const [template] = await db
      .select()
      .from(programTemplatesTable)
      .where(eq(programTemplatesTable.id, templateId));
    if (!template) { res.status(404).json({ error: "Template not found" }); return; }

    // Pre-fetch all existing active assignments for this template in a single
    // query rather than N individual queries.
    const normalizedIds = studentIds
      .map(id => Number(id))
      .filter(id => Number.isInteger(id) && id > 0);

    const existingMap = new Map<number, number>(); // studentId → targetId
    if (normalizedIds.length > 0) {
      const existing = await db
        .select({ studentId: programTargetsTable.studentId, id: programTargetsTable.id })
        .from(programTargetsTable)
        .where(
          and(
            inArray(programTargetsTable.studentId, normalizedIds),
            eq(programTargetsTable.templateId, templateId),
            eq(programTargetsTable.active, true),
          ),
        );
      for (const row of existing) existingMap.set(row.studentId, row.id);
    }

    type AssignResult = {
      studentId: number;
      status: "assigned" | "skipped" | "reassigned" | "error";
      message?: string;
      targetId?: number;
      existingTargetId?: number;
    };

    const results: AssignResult[] = [];
    let assignedCount = 0;
    let skippedCount = 0;
    let reassignedCount = 0;
    let errorCount = 0;

    const stepsData = (template.steps as Array<Record<string, unknown>>) ?? [];

    for (const rawId of studentIds) {
      const studentId = Number(rawId);
      if (!Number.isInteger(studentId) || studentId <= 0) {
        results.push({ studentId: studentId || 0, status: "error", message: "Invalid student ID" });
        errorCount++;
        continue;
      }

      const existingTargetId = existingMap.get(studentId);

      if (existingTargetId !== undefined) {
        if (onDuplicate === "skip") {
          results.push({ studentId, status: "skipped", message: "Already has this program", existingTargetId });
          skippedCount++;
          continue;
        }
        // onDuplicate === "reassign": deactivate the existing target first
        try {
          await db
            .update(programTargetsTable)
            .set({ active: false })
            .where(eq(programTargetsTable.id, existingTargetId));
        } catch {
          results.push({ studentId, status: "error", message: "Failed to deactivate existing program" });
          errorCount++;
          continue;
        }
      }

      try {
        const target = await db.transaction(async (tx) => {
          const [t] = await tx.insert(programTargetsTable).values({
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

          for (let i = 0; i < stepsData.length; i++) {
            const s = stepsData[i];
            await tx.insert(programStepsTable).values({
              programTargetId: t.id,
              stepNumber: i + 1,
              name: String(s.name ?? ""),
              sdInstruction: s.sdInstruction ? String(s.sdInstruction) : null,
              targetResponse: s.targetResponse ? String(s.targetResponse) : null,
              materials: s.materials ? String(s.materials) : null,
              promptStrategy: s.promptStrategy ? String(s.promptStrategy) : null,
              errorCorrection: s.errorCorrection ? String(s.errorCorrection) : null,
            });
          }

          return t;
        });

        const isReassign = existingTargetId !== undefined;
        results.push({ studentId, status: isReassign ? "reassigned" : "assigned", targetId: target.id });
        if (isReassign) reassignedCount++; else assignedCount++;
      } catch (e) {
        console.error(`bulk-clone student ${studentId} error:`, e);
        results.push({ studentId, status: "error", message: "Failed to assign program" });
        errorCount++;
      }
    }

    const successCount = assignedCount + reassignedCount;
    if (successCount > 0) {
      await db
        .update(programTemplatesTable)
        .set({ usageCount: sql`${programTemplatesTable.usageCount} + ${successCount}` })
        .where(eq(programTemplatesTable.id, templateId));
    }

    res.status(200).json({
      templateId,
      total: studentIds.length,
      assigned: assignedCount,
      skipped: skippedCount,
      reassigned: reassignedCount,
      errors: errorCount,
      results,
    });
  } catch (e: any) {
    console.error("Bulk clone error:", e);
    res.status(500).json({ error: "Failed to bulk assign template" });
  }
});

export default router;
