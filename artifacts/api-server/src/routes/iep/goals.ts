import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  iepGoalsTable, staffTable,
  programTargetsTable, behaviorTargetsTable, programDataTable,
  behaviorDataTable, dataSessionsTable, serviceRequirementsTable,
  serviceTypesTable, programStepsTable,
} from "@workspace/db";
import { eq, and, gte, lte, asc } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";

const router: IRouter = Router();

router.get("/students/:studentId/iep-goals", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const activeOnly = req.query.active !== "false";
    const conditions: any[] = [eq(iepGoalsTable.studentId, studentId)];
    if (activeOnly) conditions.push(eq(iepGoalsTable.active, true));

    const rows = await db
      .select({
        goal: iepGoalsTable,
        pt: programTargetsTable,
        bt: behaviorTargetsTable,
      })
      .from(iepGoalsTable)
      .leftJoin(programTargetsTable, eq(iepGoalsTable.programTargetId, programTargetsTable.id))
      .leftJoin(behaviorTargetsTable, eq(iepGoalsTable.behaviorTargetId, behaviorTargetsTable.id))
      .where(and(...conditions))
      .orderBy(asc(iepGoalsTable.goalArea), asc(iepGoalsTable.goalNumber));

    const enriched = rows.map(({ goal, pt, bt }) => {
      let linkedTarget = null;
      if (pt) {
        linkedTarget = { type: "program", name: pt.name, currentPromptLevel: pt.currentPromptLevel, masteryCriterionPercent: pt.masteryCriterionPercent };
      } else if (bt) {
        linkedTarget = { type: "behavior", name: bt.name, baselineValue: bt.baselineValue, goalValue: bt.goalValue, measurementType: bt.measurementType };
      }
      return { ...goal, linkedTarget, createdAt: goal.createdAt.toISOString(), updatedAt: goal.updatedAt.toISOString() };
    });

    logAudit(req, {
      action: "read",
      targetTable: "iep_goals",
      studentId: studentId,
      summary: `Viewed ${enriched.length} IEP goals for student #${studentId}`,
    });
    res.json(enriched);
  } catch (e: any) {
    console.error("GET iep-goals error:", e);
    res.status(500).json({ error: "Failed to fetch IEP goals" });
  }
});

router.get("/students/:studentId/iep-goals/progress", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    let { from, to } = req.query as { from?: string; to?: string };

    if (!from) {
      const d = new Date();
      d.setDate(d.getDate() - 180);
      from = d.toISOString().slice(0, 10);
    }

    const goals = await db
      .select({
        goal: iepGoalsTable,
        pt: programTargetsTable,
        bt: behaviorTargetsTable,
      })
      .from(iepGoalsTable)
      .leftJoin(programTargetsTable, eq(iepGoalsTable.programTargetId, programTargetsTable.id))
      .leftJoin(behaviorTargetsTable, eq(iepGoalsTable.behaviorTargetId, behaviorTargetsTable.id))
      .where(and(eq(iepGoalsTable.studentId, studentId), eq(iepGoalsTable.active, true)))
      .orderBy(asc(iepGoalsTable.goalArea), asc(iepGoalsTable.goalNumber));

    const result = await Promise.all(goals.map(async ({ goal, pt, bt }) => {
      let dataPoints: { date: string; value: number; staffId?: number | null; staffName?: string | null; dataSessionId?: number; notes?: string | null; trialsCorrect?: number | null; trialsTotal?: number | null; sessionType?: string | null }[] = [];
      let baseline: number | null = null;
      let goalValue: number | null = null;
      let targetDirection: "increase" | "decrease" = "increase";
      let measurementType: string | null = null;
      let yLabel = "% Correct";
      let trendDirection: "improving" | "declining" | "stable" = "stable";

      const dateConditions: any[] = [];
      if (from) dateConditions.push(gte(dataSessionsTable.sessionDate, from as string));
      if (to) dateConditions.push(lte(dataSessionsTable.sessionDate, to as string));

      if (goal.programTargetId && pt) {
        baseline = pt.baselinePercent ? parseFloat(String(pt.baselinePercent)) : null;
        goalValue = pt.masteryCriterionPercent ?? 80;
        yLabel = "% Correct";
        measurementType = "program";

        const rows = await db.select({
          sessionDate: dataSessionsTable.sessionDate,
          percentCorrect: programDataTable.percentCorrect,
          staffId: dataSessionsTable.staffId,
          staffFirst: staffTable.firstName,
          staffLast: staffTable.lastName,
          dataSessionId: dataSessionsTable.id,
          sessionNotes: dataSessionsTable.notes,
          sessionType: dataSessionsTable.sessionType,
          trialsCorrect: programDataTable.trialsCorrect,
          trialsTotal: programDataTable.trialsTotal,
          dataNotes: programDataTable.notes,
        }).from(programDataTable)
          .innerJoin(dataSessionsTable, eq(programDataTable.dataSessionId, dataSessionsTable.id))
          .leftJoin(staffTable, eq(dataSessionsTable.staffId, staffTable.id))
          .where(and(
            eq(programDataTable.programTargetId, goal.programTargetId),
            eq(dataSessionsTable.studentId, studentId),
            ...dateConditions,
          ))
          .orderBy(asc(dataSessionsTable.sessionDate));

        dataPoints = rows.map(r => ({
          date: r.sessionDate,
          value: parseFloat(r.percentCorrect ?? "0"),
          staffId: r.staffId,
          staffName: r.staffFirst && r.staffLast ? `${r.staffFirst} ${r.staffLast}` : null,
          dataSessionId: r.dataSessionId,
          notes: r.dataNotes || r.sessionNotes || null,
          trialsCorrect: r.trialsCorrect,
          trialsTotal: r.trialsTotal,
          sessionType: r.sessionType,
        }));
      } else if (goal.behaviorTargetId && bt) {
        baseline = bt.baselineValue ? parseFloat(bt.baselineValue) : null;
        goalValue = bt.goalValue ? parseFloat(bt.goalValue) : null;
        targetDirection = (bt.targetDirection as "increase" | "decrease") || "decrease";
        measurementType = bt.measurementType || "frequency";
        yLabel = measurementType === "frequency" ? "Count" : measurementType === "duration" ? "Minutes" : "Value";

        const rows = await db.select({
          sessionDate: dataSessionsTable.sessionDate,
          value: behaviorDataTable.value,
          staffId: dataSessionsTable.staffId,
          staffFirst: staffTable.firstName,
          staffLast: staffTable.lastName,
          dataSessionId: dataSessionsTable.id,
          sessionNotes: dataSessionsTable.notes,
          sessionType: dataSessionsTable.sessionType,
          dataNotes: behaviorDataTable.notes,
        }).from(behaviorDataTable)
          .innerJoin(dataSessionsTable, eq(behaviorDataTable.dataSessionId, dataSessionsTable.id))
          .leftJoin(staffTable, eq(dataSessionsTable.staffId, staffTable.id))
          .where(and(
            eq(behaviorDataTable.behaviorTargetId, goal.behaviorTargetId),
            eq(dataSessionsTable.studentId, studentId),
            ...dateConditions,
          ))
          .orderBy(asc(dataSessionsTable.sessionDate));

        dataPoints = rows.map(r => ({
          date: r.sessionDate,
          value: parseFloat(r.value),
          staffId: r.staffId,
          staffName: r.staffFirst && r.staffLast ? `${r.staffFirst} ${r.staffLast}` : null,
          dataSessionId: r.dataSessionId,
          notes: r.dataNotes || r.sessionNotes || null,
          sessionType: r.sessionType,
        }));
      }

      if (dataPoints.length >= 4) {
        const firstHalf = dataPoints.slice(0, Math.floor(dataPoints.length / 2));
        const secondHalf = dataPoints.slice(Math.floor(dataPoints.length / 2));
        const firstAvg = firstHalf.reduce((s, d) => s + d.value, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((s, d) => s + d.value, 0) / secondHalf.length;
        const threshold = measurementType === "program" ? 5 : 0.5;
        const improving = targetDirection === "decrease"
          ? secondAvg < firstAvg - threshold
          : secondAvg > firstAvg + threshold;
        const declining = targetDirection === "decrease"
          ? secondAvg > firstAvg + threshold
          : secondAvg < firstAvg - threshold;
        trendDirection = improving ? "improving" : declining ? "declining" : "stable";
      }

      const latestValue = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].value : null;
      let progressRating = "not_addressed";
      if (dataPoints.length > 0 && goalValue !== null) {
        if (measurementType === "program") {
          const pct = latestValue ?? 0;
          if (pct >= goalValue) progressRating = "mastered";
          else if (pct >= goalValue * 0.75) progressRating = "sufficient_progress";
          else if (pct >= goalValue * 0.5) progressRating = "some_progress";
          else progressRating = "insufficient_progress";
        } else {
          const goalMet = targetDirection === "decrease"
            ? (latestValue ?? Infinity) <= goalValue
            : (latestValue ?? 0) >= goalValue;
          if (goalMet) progressRating = "mastered";
          else if (baseline !== null) {
            const totalRange = Math.abs(goalValue - baseline);
            const progress = Math.abs((latestValue ?? baseline) - baseline);
            const pctToGoal = totalRange > 0 ? progress / totalRange : 0;
            if (pctToGoal >= 0.75) progressRating = "sufficient_progress";
            else if (pctToGoal >= 0.25) progressRating = "some_progress";
            else progressRating = "insufficient_progress";
          } else {
            progressRating = "some_progress";
          }
        }
      }

      return {
        id: goal.id,
        goalArea: goal.goalArea,
        goalNumber: goal.goalNumber,
        annualGoal: goal.annualGoal,
        baseline: goal.baseline,
        targetCriterion: goal.targetCriterion,
        measurementMethod: goal.measurementMethod,
        status: goal.status,
        programTargetId: goal.programTargetId,
        behaviorTargetId: goal.behaviorTargetId,
        linkedTarget: pt
          ? { type: "program" as const, name: pt.name, masteryCriterionPercent: pt.masteryCriterionPercent }
          : bt
          ? { type: "behavior" as const, name: bt.name, measurementType: bt.measurementType, targetDirection: bt.targetDirection }
          : null,
        dataPoints,
        baseline_value: baseline,
        goal_value: goalValue,
        targetDirection,
        measurementType,
        yLabel,
        trendDirection,
        progressRating,
        latestValue,
        dataPointCount: dataPoints.length,
      };
    }));

    res.json(result);
  } catch (e: any) {
    console.error("GET iep-goals/progress error:", e);
    res.status(500).json({ error: "Failed to fetch goal progress" });
  }
});

router.post("/students/:studentId/iep-goals", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { goalArea, goalNumber, annualGoal, baseline, targetCriterion,
            measurementMethod, scheduleOfReporting, programTargetId,
            behaviorTargetId, serviceArea, startDate, endDate, notes,
            benchmarks, iepDocumentId, autoCreateTarget } = req.body;
    if (!goalArea || !annualGoal) { res.status(400).json({ error: "goalArea and annualGoal are required" }); return; }

    let finalProgramTargetId = programTargetId || null;
    let finalBehaviorTargetId = behaviorTargetId || null;

    const shouldAutoCreate = autoCreateTarget !== false && !finalProgramTargetId && !finalBehaviorTargetId;

    if (shouldAutoCreate) {
      const isBehaviorGoal = goalArea.toLowerCase().includes("behavior") &&
        (annualGoal.toLowerCase().includes("reduce") || annualGoal.toLowerCase().includes("decrease") ||
         annualGoal.toLowerCase().includes("increase") || annualGoal.toLowerCase().includes("frequency") ||
         annualGoal.toLowerCase().includes("duration"));

      if (isBehaviorGoal) {
        const isDecrease = annualGoal.toLowerCase().includes("reduce") || annualGoal.toLowerCase().includes("decrease");
        const [bt] = await db.insert(behaviorTargetsTable).values({
          studentId,
          name: goalArea === "Behavior" ? annualGoal.split(":")[0].split(".")[0].trim().substring(0, 80) : goalArea,
          measurementType: annualGoal.toLowerCase().includes("duration") ? "duration" :
                           annualGoal.toLowerCase().includes("percentage") || annualGoal.toLowerCase().includes("%") ? "percentage" : "frequency",
          targetDirection: isDecrease ? "decrease" : "increase",
          baselineValue: baseline ? baseline.replace(/[^0-9.]/g, "").split(".")[0] || null : null,
          goalValue: targetCriterion ? targetCriterion.replace(/[^0-9.]/g, "").split(".")[0] || null : null,
        }).returning();
        finalBehaviorTargetId = bt.id;
      } else {
        const domain = goalArea || serviceArea || "General";
        const isTaskAnalysis = annualGoal.toLowerCase().includes("independently") ||
          annualGoal.toLowerCase().includes("steps") || annualGoal.toLowerCase().includes("routine") ||
          annualGoal.toLowerCase().includes("self-care");
        const criterionMatch = (targetCriterion || "").match(/(\d+)%/);
        const masteryPct = criterionMatch ? parseInt(criterionMatch[1]) : 80;

        const [pt] = await db.insert(programTargetsTable).values({
          studentId,
          name: annualGoal.split(":")[0].split(",")[0].split(".")[0].trim().substring(0, 80),
          description: annualGoal,
          programType: isTaskAnalysis ? "task_analysis" : "discrete_trial",
          domain,
          targetCriterion: targetCriterion || "80% across 3 sessions",
          masteryCriterionPercent: masteryPct,
          masteryCriterionSessions: 3,
          currentPromptLevel: "verbal",
        }).returning();
        finalProgramTargetId = pt.id;
      }
    }

    const [goal] = await db.insert(iepGoalsTable).values({
      studentId, goalArea, goalNumber: goalNumber || 1, annualGoal,
      baseline: baseline || null, targetCriterion: targetCriterion || null,
      measurementMethod: measurementMethod || null,
      scheduleOfReporting: scheduleOfReporting || "quarterly",
      programTargetId: finalProgramTargetId,
      behaviorTargetId: finalBehaviorTargetId,
      serviceArea: serviceArea || null,
      startDate: startDate || null, endDate: endDate || null,
      benchmarks: benchmarks || null,
      iepDocumentId: iepDocumentId || null,
      notes: notes || null,
    }).returning();
    logAudit(req, {
      action: "create",
      targetTable: "iep_goals",
      targetId: goal.id,
      studentId: studentId,
      summary: `Created IEP goal: ${goalArea} #${goalNumber || 1}`,
      newValues: { goalArea, annualGoal, targetCriterion } as Record<string, unknown>,
    });
    res.status(201).json({
      ...goal,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString(),
      autoCreatedTarget: shouldAutoCreate ? (finalBehaviorTargetId ? "behavior" : "program") : null,
    });
  } catch (e: any) {
    console.error("POST iep-goal error:", e);
    res.status(500).json({ error: "Failed to create IEP goal" });
  }
});

router.patch("/iep-goals/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const updates: any = {};
    for (const key of ["goalArea","goalNumber","annualGoal","baseline","targetCriterion",
                        "measurementMethod","scheduleOfReporting","programTargetId",
                        "behaviorTargetId","serviceArea","status","startDate","endDate",
                        "benchmarks","iepDocumentId","notes","active"]) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const [oldGoal] = await db.select().from(iepGoalsTable).where(eq(iepGoalsTable.id, id));
    const [updated] = await db.update(iepGoalsTable).set(updates).where(eq(iepGoalsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    logAudit(req, {
      action: "update",
      targetTable: "iep_goals",
      targetId: id,
      studentId: updated.studentId,
      summary: `Updated IEP goal #${id}`,
      oldValues: oldGoal ? (Object.fromEntries(Object.keys(updates).map(k => [k, (oldGoal as Record<string, unknown>)[k]]))) : null,
      newValues: updates as Record<string, unknown>,
    });
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to update IEP goal" });
  }
});

router.delete("/iep-goals/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(iepGoalsTable).where(eq(iepGoalsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    await db.delete(iepGoalsTable).where(eq(iepGoalsTable.id, id));
    logAudit(req, {
      action: "delete",
      targetTable: "iep_goals",
      targetId: id,
      studentId: existing.studentId,
      summary: `Deleted IEP goal #${id} (${existing.goalArea})`,
      oldValues: { goalArea: existing.goalArea, goalNumber: existing.goalNumber, annualGoal: existing.annualGoal, status: existing.status } as Record<string, unknown>,
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to delete IEP goal" });
  }
});

router.post("/students/:studentId/iep-goals/auto-create", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { startDate, endDate } = req.body;

    const [programTargets, behaviorTargets, serviceReqs] = await Promise.all([
      db.select().from(programTargetsTable)
        .where(and(eq(programTargetsTable.studentId, studentId), eq(programTargetsTable.active, true))),
      db.select().from(behaviorTargetsTable)
        .where(and(eq(behaviorTargetsTable.studentId, studentId), eq(behaviorTargetsTable.active, true))),
      db.select({
        id: serviceRequirementsTable.id,
        serviceTypeName: serviceTypesTable.name,
        requiredMinutes: serviceRequirementsTable.requiredMinutes,
        intervalType: serviceRequirementsTable.intervalType,
      }).from(serviceRequirementsTable)
        .leftJoin(serviceTypesTable, eq(serviceRequirementsTable.serviceTypeId, serviceTypesTable.id))
        .where(and(eq(serviceRequirementsTable.studentId, studentId), eq(serviceRequirementsTable.active, true))),
    ]);

    const existing = await db.select({ programTargetId: iepGoalsTable.programTargetId, behaviorTargetId: iepGoalsTable.behaviorTargetId })
      .from(iepGoalsTable)
      .where(and(eq(iepGoalsTable.studentId, studentId), eq(iepGoalsTable.active, true)));
    const existingProgIds = new Set(existing.map(e => e.programTargetId).filter(Boolean));
    const existingBehIds = new Set(existing.map(e => e.behaviorTargetId).filter(Boolean));

    const created: any[] = [];
    let goalNum = 1;

    for (const pt of programTargets) {
      if (existingProgIds.has(pt.id)) continue;
      const steps = await db.select().from(programStepsTable)
        .where(eq(programStepsTable.programTargetId, pt.id))
        .orderBy(asc(programStepsTable.stepNumber));
      const stepNames = steps.map(s => s.name).join(", ");

      const [goal] = await db.insert(iepGoalsTable).values({
        studentId,
        goalArea: pt.domain || "Skill Acquisition",
        goalNumber: goalNum++,
        annualGoal: pt.description || `${pt.name}: Student will demonstrate mastery at ${pt.masteryCriterionPercent ?? 80}% accuracy across ${pt.masteryCriterionSessions ?? 3} consecutive sessions.`,
        baseline: `Current prompt level: ${pt.currentPromptLevel ?? "verbal"}. ${stepNames ? `Steps: ${stepNames}` : ""}`.trim(),
        targetCriterion: pt.targetCriterion || `${pt.masteryCriterionPercent ?? 80}% across ${pt.masteryCriterionSessions ?? 3} sessions at independent level`,
        measurementMethod: `${pt.programType === "discrete_trial" ? "Discrete trial" : "Task analysis"} data collection, ${pt.masteryCriterionSessions ?? 3} session probe`,
        scheduleOfReporting: "quarterly",
        programTargetId: pt.id,
        serviceArea: pt.domain || "ABA",
        startDate: startDate || null,
        endDate: endDate || null,
      }).returning();
      created.push(goal);
    }

    for (const bt of behaviorTargets) {
      if (existingBehIds.has(bt.id)) continue;
      const directionWord = bt.targetDirection === "decrease" ? "reduce" : "increase";
      const [goal] = await db.insert(iepGoalsTable).values({
        studentId,
        goalArea: "Behavior",
        goalNumber: goalNum++,
        annualGoal: bt.description || `${bt.name}: Student will ${directionWord} ${bt.name.toLowerCase()} from baseline of ${bt.baselineValue ?? "N/A"} to ${bt.goalValue ?? "target level"} as measured by ${bt.measurementType} data.`,
        baseline: `${bt.baselineValue ?? "Not yet established"} (${bt.measurementType})`,
        targetCriterion: `${bt.goalValue ?? "Target"} or ${bt.targetDirection === "decrease" ? "fewer" : "greater"} per session`,
        measurementMethod: `${bt.measurementType} data collection${bt.enableHourlyTracking ? " with hourly breakdown" : ""}`,
        scheduleOfReporting: "quarterly",
        behaviorTargetId: bt.id,
        serviceArea: "Behavior",
        startDate: startDate || null,
        endDate: endDate || null,
      }).returning();
      created.push(goal);
    }

    for (const goal of created) {
      logAudit(req, {
        action: "create",
        targetTable: "iep_goals",
        targetId: goal.id,
        studentId: studentId,
        summary: `Auto-created IEP goal #${goal.id} (${goal.goalArea}) for student #${studentId}`,
        newValues: { goalArea: goal.goalArea, goalNumber: goal.goalNumber, annualGoal: goal.annualGoal } as Record<string, unknown>,
      });
    }
    res.status(201).json({ created: created.length, goals: created.map(g => ({ ...g, createdAt: g.createdAt.toISOString(), updatedAt: g.updatedAt.toISOString() })) });
  } catch (e: any) {
    console.error("Auto-create IEP goals error:", e);
    res.status(500).json({ error: "Failed to auto-create IEP goals" });
  }
});

export default router;
