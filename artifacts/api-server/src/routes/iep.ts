import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  iepGoalsTable, progressReportsTable, studentsTable, staffTable,
  programTargetsTable, behaviorTargetsTable, programDataTable,
  behaviorDataTable, dataSessionsTable, serviceRequirementsTable,
  serviceTypesTable, sessionLogsTable, programStepsTable,
  iepDocumentsTable, iepAccommodationsTable, schoolsTable, districtsTable
} from "@workspace/db";
import type { ServiceDeliveryBreakdown } from "@workspace/db";
import { eq, desc, and, sql, gte, lte, asc, count, sum, isNull } from "drizzle-orm";
import { logAudit } from "../lib/auditLog";

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
      oldValues: { goalArea: existing.goalArea, goalNumber: existing.goalNumber, goalDescription: existing.goalDescription, status: existing.status } as Record<string, unknown>,
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

    res.status(201).json({ created: created.length, goals: created.map(g => ({ ...g, createdAt: g.createdAt.toISOString(), updatedAt: g.updatedAt.toISOString() })) });
  } catch (e: any) {
    console.error("Auto-create IEP goals error:", e);
    res.status(500).json({ error: "Failed to auto-create IEP goals" });
  }
});

router.get("/students/:studentId/progress-reports", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const reports = await db.select({
      id: progressReportsTable.id,
      studentId: progressReportsTable.studentId,
      reportingPeriod: progressReportsTable.reportingPeriod,
      periodStart: progressReportsTable.periodStart,
      periodEnd: progressReportsTable.periodEnd,
      status: progressReportsTable.status,
      preparedBy: progressReportsTable.preparedBy,
      overallSummary: progressReportsTable.overallSummary,
      serviceDeliverySummary: progressReportsTable.serviceDeliverySummary,
      recommendations: progressReportsTable.recommendations,
      parentNotes: progressReportsTable.parentNotes,
      goalProgress: progressReportsTable.goalProgress,
      studentDob: progressReportsTable.studentDob,
      studentGrade: progressReportsTable.studentGrade,
      schoolName: progressReportsTable.schoolName,
      districtName: progressReportsTable.districtName,
      iepStartDate: progressReportsTable.iepStartDate,
      iepEndDate: progressReportsTable.iepEndDate,
      serviceBreakdown: progressReportsTable.serviceBreakdown,
      parentNotificationDate: progressReportsTable.parentNotificationDate,
      nextReportDate: progressReportsTable.nextReportDate,
      createdAt: progressReportsTable.createdAt,
      updatedAt: progressReportsTable.updatedAt,
      staffFirstName: staffTable.firstName,
      staffLastName: staffTable.lastName,
    }).from(progressReportsTable)
      .leftJoin(staffTable, eq(progressReportsTable.preparedBy, staffTable.id))
      .where(eq(progressReportsTable.studentId, studentId))
      .orderBy(desc(progressReportsTable.createdAt));
    const mapped = reports.map(r => ({
      ...r,
      preparedByName: r.staffFirstName && r.staffLastName ? `${r.staffFirstName} ${r.staffLastName}` : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
    logAudit(req, {
      action: "read",
      targetTable: "progress_reports",
      studentId: studentId,
      summary: `Viewed ${mapped.length} progress reports for student #${studentId}`,
    });
    res.json(mapped);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch progress reports" });
  }
});

router.get("/progress-reports/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [report] = await db.select({
      id: progressReportsTable.id,
      studentId: progressReportsTable.studentId,
      reportingPeriod: progressReportsTable.reportingPeriod,
      periodStart: progressReportsTable.periodStart,
      periodEnd: progressReportsTable.periodEnd,
      status: progressReportsTable.status,
      preparedBy: progressReportsTable.preparedBy,
      overallSummary: progressReportsTable.overallSummary,
      serviceDeliverySummary: progressReportsTable.serviceDeliverySummary,
      recommendations: progressReportsTable.recommendations,
      parentNotes: progressReportsTable.parentNotes,
      goalProgress: progressReportsTable.goalProgress,
      studentDob: progressReportsTable.studentDob,
      studentGrade: progressReportsTable.studentGrade,
      schoolName: progressReportsTable.schoolName,
      districtName: progressReportsTable.districtName,
      iepStartDate: progressReportsTable.iepStartDate,
      iepEndDate: progressReportsTable.iepEndDate,
      serviceBreakdown: progressReportsTable.serviceBreakdown,
      parentNotificationDate: progressReportsTable.parentNotificationDate,
      nextReportDate: progressReportsTable.nextReportDate,
      createdAt: progressReportsTable.createdAt,
      updatedAt: progressReportsTable.updatedAt,
      staffFirstName: staffTable.firstName,
      staffLastName: staffTable.lastName,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
    }).from(progressReportsTable)
      .leftJoin(staffTable, eq(progressReportsTable.preparedBy, staffTable.id))
      .leftJoin(studentsTable, eq(progressReportsTable.studentId, studentsTable.id))
      .where(eq(progressReportsTable.id, id));
    if (!report) { res.status(404).json({ error: "Not found" }); return; }
    logAudit(req, {
      action: "read",
      targetTable: "progress_reports",
      targetId: id,
      studentId: report.studentId,
      summary: `Viewed progress report #${id} for ${report.studentFirstName} ${report.studentLastName}`,
    });
    res.json({
      ...report,
      preparedByName: report.staffFirstName && report.staffLastName ? `${report.staffFirstName} ${report.staffLastName}` : null,
      studentName: `${report.studentFirstName} ${report.studentLastName}`,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch progress report" });
  }
});

router.patch("/progress-reports/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const updates: any = {};
    for (const key of ["status","overallSummary","serviceDeliverySummary","recommendations","parentNotes","goalProgress","preparedBy"]) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const [oldReport] = await db.select().from(progressReportsTable).where(eq(progressReportsTable.id, id));
    const [updated] = await db.update(progressReportsTable).set(updates).where(eq(progressReportsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    logAudit(req, {
      action: "update",
      targetTable: "progress_reports",
      targetId: id,
      studentId: updated.studentId,
      summary: `Updated progress report #${id}`,
      oldValues: oldReport ? (Object.fromEntries(Object.keys(updates).map(k => [k, (oldReport as Record<string, unknown>)[k]]))) : null,
      newValues: updates as Record<string, unknown>,
    });
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to update progress report" });
  }
});

router.post("/students/:studentId/progress-reports/generate", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { periodStart, periodEnd, reportingPeriod, preparedBy } = req.body;
    if (!periodStart || !periodEnd || !reportingPeriod) {
      res.status(400).json({ error: "periodStart, periodEnd, and reportingPeriod are required" });
      return;
    }

    const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
    if (!student) { res.status(404).json({ error: "Student not found" }); return; }

    let schoolName: string | null = null;
    let districtName: string | null = null;
    if (student.schoolId) {
      const [school] = await db.select().from(schoolsTable).where(eq(schoolsTable.id, student.schoolId));
      if (school) {
        schoolName = school.name;
        if (school.districtId) {
          const [district] = await db.select().from(districtsTable).where(eq(districtsTable.id, school.districtId));
          if (district) districtName = district.name;
        }
        if (!districtName) districtName = school.district || null;
      }
    }

    const activeIepDoc = await db.select().from(iepDocumentsTable)
      .where(and(eq(iepDocumentsTable.studentId, studentId), eq(iepDocumentsTable.active, true)))
      .orderBy(desc(iepDocumentsTable.iepStartDate))
      .limit(1);
    const iepDoc = activeIepDoc[0] || null;

    const goals = await db.select().from(iepGoalsTable)
      .where(and(eq(iepGoalsTable.studentId, studentId), eq(iepGoalsTable.active, true)))
      .orderBy(asc(iepGoalsTable.goalArea), asc(iepGoalsTable.goalNumber));

    const dataSessions = await db.select().from(dataSessionsTable)
      .where(and(
        eq(dataSessionsTable.studentId, studentId),
        gte(dataSessionsTable.sessionDate, periodStart),
        lte(dataSessionsTable.sessionDate, periodEnd),
      ));
    const sessionIds = dataSessions.map(s => s.id);

    const goalProgressEntries = await Promise.all(goals.map(async (goal) => {
      let currentPerformance = "No data collected";
      let progressRating = "not_addressed";
      let dataPoints = 0;
      let trendDirection = "stable";
      let promptLevel: string | null = null;
      let percentCorrect: number | null = null;
      let behaviorValue: number | null = null;
      let behaviorGoal: number | null = null;
      let narrative = "";

      if (goal.programTargetId && sessionIds.length > 0) {
        const progData = await db.select({
          trialsCorrect: programDataTable.trialsCorrect,
          trialsTotal: programDataTable.trialsTotal,
          percentCorrect: programDataTable.percentCorrect,
          promptLevelUsed: programDataTable.promptLevelUsed,
          sessionDate: dataSessionsTable.sessionDate,
        }).from(programDataTable)
          .innerJoin(dataSessionsTable, eq(programDataTable.dataSessionId, dataSessionsTable.id))
          .where(and(
            eq(programDataTable.programTargetId, goal.programTargetId),
            gte(dataSessionsTable.sessionDate, periodStart),
            lte(dataSessionsTable.sessionDate, periodEnd),
          ))
          .orderBy(asc(dataSessionsTable.sessionDate));

        dataPoints = progData.length;

        if (progData.length > 0) {
          const lastPoints = progData.slice(-3);
          const avgPct = Math.round(lastPoints.reduce((s, d) => s + parseFloat(d.percentCorrect ?? "0"), 0) / lastPoints.length);
          percentCorrect = avgPct;
          const lastPrompt = progData[progData.length - 1].promptLevelUsed;
          promptLevel = lastPrompt;

          const [target] = await db.select().from(programTargetsTable).where(eq(programTargetsTable.id, goal.programTargetId!));
          const masteryPct = target?.masteryCriterionPercent ?? 80;

          const plPhrase = promptLevelPhrase(lastPrompt);
          currentPerformance = lastPrompt
            ? `${avgPct}% accuracy (last 3 sessions) at ${formatPromptLevel(lastPrompt)} prompt level`
            : `${avgPct}% accuracy (last 3 sessions)`;

          if (avgPct >= masteryPct) {
            progressRating = "mastered";
            narrative = `${student.firstName} has met mastery criteria of ${masteryPct}% with an average of ${avgPct}% across the last ${lastPoints.length} sessions${plPhrase}. This goal has been mastered.`;
          } else if (avgPct >= masteryPct * 0.75) {
            progressRating = "sufficient_progress";
            narrative = `${student.firstName} is making sufficient progress toward this goal with ${avgPct}% accuracy${plPhrase}. The student is on track to meet this goal within the IEP period.`;
          } else if (avgPct >= masteryPct * 0.5) {
            progressRating = "some_progress";
            narrative = `${student.firstName} is making some progress with ${avgPct}% accuracy${plPhrase}. Additional support or program modifications may be needed to meet this goal.`;
          } else {
            progressRating = "insufficient_progress";
            narrative = `${student.firstName} is making insufficient progress with ${avgPct}% accuracy${plPhrase}. Program modifications and/or additional supports are recommended.`;
          }

          if (progData.length >= 4) {
            const firstHalf = progData.slice(0, Math.floor(progData.length / 2));
            const secondHalf = progData.slice(Math.floor(progData.length / 2));
            const firstAvg = firstHalf.reduce((s, d) => s + parseFloat(d.percentCorrect ?? "0"), 0) / firstHalf.length;
            const secondAvg = secondHalf.reduce((s, d) => s + parseFloat(d.percentCorrect ?? "0"), 0) / secondHalf.length;
            if (secondAvg > firstAvg + 5) trendDirection = "improving";
            else if (secondAvg < firstAvg - 5) trendDirection = "declining";
          }
        } else {
          narrative = `No program data was collected for this goal during the reporting period.`;
        }
      } else if (goal.behaviorTargetId && sessionIds.length > 0) {
        const behData = await db.select({
          value: behaviorDataTable.value,
          sessionDate: dataSessionsTable.sessionDate,
        }).from(behaviorDataTable)
          .innerJoin(dataSessionsTable, eq(behaviorDataTable.dataSessionId, dataSessionsTable.id))
          .where(and(
            eq(behaviorDataTable.behaviorTargetId, goal.behaviorTargetId),
            gte(dataSessionsTable.sessionDate, periodStart),
            lte(dataSessionsTable.sessionDate, periodEnd),
          ))
          .orderBy(asc(dataSessionsTable.sessionDate));

        dataPoints = behData.length;

        if (behData.length > 0) {
          const [target] = await db.select().from(behaviorTargetsTable).where(eq(behaviorTargetsTable.id, goal.behaviorTargetId!));
          const lastPoints = behData.slice(-3);
          const avgVal = Math.round(lastPoints.reduce((s, d) => s + parseFloat(d.value), 0) / lastPoints.length * 10) / 10;
          behaviorValue = avgVal;
          behaviorGoal = target?.goalValue ? parseFloat(target.goalValue) : null;
          const baseVal = target?.baselineValue ? parseFloat(target.baselineValue) : null;

          currentPerformance = `Average of ${avgVal} per session (last 3 sessions)`;

          const goalMet = behaviorGoal !== null && (
            (target?.targetDirection === "decrease" && avgVal <= behaviorGoal) ||
            (target?.targetDirection === "increase" && avgVal >= behaviorGoal)
          );

          if (goalMet) {
            progressRating = "mastered";
            narrative = `${student.firstName} has met the behavior goal. Current average is ${avgVal} per session, meeting the target of ${behaviorGoal}.`;
          } else if (baseVal !== null && behaviorGoal !== null) {
            const totalRange = Math.abs(behaviorGoal - baseVal);
            const progress = Math.abs(avgVal - baseVal);
            const pctToGoal = totalRange > 0 ? progress / totalRange : 0;
            if (pctToGoal >= 0.75) {
              progressRating = "sufficient_progress";
              narrative = `${student.firstName} is making sufficient progress. The behavior has ${target?.targetDirection === "decrease" ? "decreased" : "increased"} from a baseline of ${baseVal} to a current average of ${avgVal} (goal: ${behaviorGoal}).`;
            } else if (pctToGoal >= 0.25) {
              progressRating = "some_progress";
              narrative = `${student.firstName} is making some progress. Current average is ${avgVal} (baseline: ${baseVal}, goal: ${behaviorGoal}). ${target?.targetDirection === "decrease" ? "The behavior has decreased but remains above target." : "The behavior has increased but remains below target."}`;
            } else {
              progressRating = "insufficient_progress";
              narrative = `${student.firstName} is making insufficient progress on this behavior goal. Current average is ${avgVal} (baseline: ${baseVal}, goal: ${behaviorGoal}). Program modifications are recommended.`;
            }
          } else {
            progressRating = "some_progress";
            narrative = `${student.firstName} has a current average of ${avgVal} per session across ${behData.length} data points.`;
          }

          if (behData.length >= 4) {
            const firstHalf = behData.slice(0, Math.floor(behData.length / 2));
            const secondHalf = behData.slice(Math.floor(behData.length / 2));
            const firstAvg = firstHalf.reduce((s, d) => s + parseFloat(d.value), 0) / firstHalf.length;
            const secondAvg = secondHalf.reduce((s, d) => s + parseFloat(d.value), 0) / secondHalf.length;
            const isDecreaseGoal = target?.targetDirection === "decrease";
            if (isDecreaseGoal) {
              if (secondAvg < firstAvg - 0.5) trendDirection = "improving";
              else if (secondAvg > firstAvg + 0.5) trendDirection = "declining";
            } else {
              if (secondAvg > firstAvg + 0.5) trendDirection = "improving";
              else if (secondAvg < firstAvg - 0.5) trendDirection = "declining";
            }
          }
        } else {
          narrative = `No behavior data was collected for this goal during the reporting period.`;
        }
      } else {
        narrative = `This goal was not addressed during the reporting period or has no linked data target.`;
      }

      const progressCode = toMaProgressCode(progressRating, trendDirection, dataPoints);

      return {
        iepGoalId: goal.id,
        goalArea: goal.goalArea,
        goalNumber: goal.goalNumber,
        annualGoal: goal.annualGoal,
        baseline: goal.baseline,
        targetCriterion: goal.targetCriterion,
        currentPerformance,
        progressRating,
        progressCode,
        dataPoints,
        trendDirection,
        promptLevel,
        percentCorrect,
        behaviorValue,
        behaviorGoal,
        narrative,
        benchmarks: goal.benchmarks || null,
        measurementMethod: goal.measurementMethod || null,
        serviceArea: goal.serviceArea || null,
      };
    }));

    const sessionCount = dataSessions.length;
    const completedSessionLogs = await db.select({ cnt: count() }).from(sessionLogsTable)
      .where(and(
        eq(sessionLogsTable.studentId, studentId),
        eq(sessionLogsTable.status, "completed"),
        gte(sessionLogsTable.sessionDate, periodStart),
        lte(sessionLogsTable.sessionDate, periodEnd),
      ));
    const missedSessionLogs = await db.select({ cnt: count() }).from(sessionLogsTable)
      .where(and(
        eq(sessionLogsTable.studentId, studentId),
        eq(sessionLogsTable.status, "missed"),
        gte(sessionLogsTable.sessionDate, periodStart),
        lte(sessionLogsTable.sessionDate, periodEnd),
      ));

    const serviceBreakdown: ServiceDeliveryBreakdown[] = [];
    const svcReqs = await db.select({
      id: serviceRequirementsTable.id,
      serviceTypeName: serviceTypesTable.name,
      requiredMinutes: serviceRequirementsTable.requiredMinutes,
      intervalType: serviceRequirementsTable.intervalType,
    }).from(serviceRequirementsTable)
      .leftJoin(serviceTypesTable, eq(serviceRequirementsTable.serviceTypeId, serviceTypesTable.id))
      .where(and(eq(serviceRequirementsTable.studentId, studentId), eq(serviceRequirementsTable.active, true)));

    for (const sr of svcReqs) {
      const completed = await db.select({
        cnt: count(),
        totalMin: sum(sessionLogsTable.durationMinutes),
      }).from(sessionLogsTable)
        .where(and(
          eq(sessionLogsTable.studentId, studentId),
          eq(sessionLogsTable.serviceRequirementId, sr.id),
          eq(sessionLogsTable.status, "completed"),
          gte(sessionLogsTable.sessionDate, periodStart),
          lte(sessionLogsTable.sessionDate, periodEnd),
        ));
      const missed = await db.select({ cnt: count() }).from(sessionLogsTable)
        .where(and(
          eq(sessionLogsTable.studentId, studentId),
          eq(sessionLogsTable.serviceRequirementId, sr.id),
          eq(sessionLogsTable.status, "missed"),
          gte(sessionLogsTable.sessionDate, periodStart),
          lte(sessionLogsTable.sessionDate, periodEnd),
        ));

      const deliveredMin = parseInt(String(completed[0]?.totalMin ?? "0"));
      const periodStartDate = new Date(periodStart);
      const periodEndDate = new Date(periodEnd);
      const weeks = Math.max(1, Math.round((periodEndDate.getTime() - periodStartDate.getTime()) / (7 * 86400000)));
      const months = Math.max(1, Math.round(weeks / 4.33));
      const requiredForPeriod = sr.intervalType === "weekly" ? (sr.requiredMinutes ?? 0) * weeks :
                                sr.intervalType === "monthly" ? (sr.requiredMinutes ?? 0) * months :
                                (sr.requiredMinutes ?? 0);
      const compPct = requiredForPeriod > 0 ? Math.round(deliveredMin / requiredForPeriod * 100) : 100;

      serviceBreakdown.push({
        serviceType: sr.serviceTypeName || "Unknown",
        requiredMinutes: requiredForPeriod,
        deliveredMinutes: deliveredMin,
        missedSessions: Number(missed[0]?.cnt ?? 0),
        completedSessions: Number(completed[0]?.cnt ?? 0),
        compliancePercent: Math.min(compPct, 100),
      });
    }

    const masteredCount = goalProgressEntries.filter(g => g.progressRating === "mastered").length;
    const sufficientCount = goalProgressEntries.filter(g => g.progressRating === "sufficient_progress").length;
    const someCount = goalProgressEntries.filter(g => g.progressRating === "some_progress").length;
    const insufficientCount = goalProgressEntries.filter(g => g.progressRating === "insufficient_progress").length;
    const notAddressedCount = goalProgressEntries.filter(g => g.progressRating === "not_addressed").length;

    const svcSummaryLines = serviceBreakdown.map(s =>
      `${s.serviceType}: ${s.deliveredMinutes} of ${s.requiredMinutes} minutes delivered (${s.compliancePercent}% compliance), ${s.completedSessions} sessions completed, ${s.missedSessions} missed`
    );

    const overallSummary =
      `MASSACHUSETTS IEP PROGRESS REPORT\nPursuant to 603 CMR 28.07(8)\n\n` +
      `Student: ${student.firstName} ${student.lastName}\n` +
      `DOB: ${student.dateOfBirth || "N/A"} | Grade: ${student.grade || "N/A"}\n` +
      `School: ${schoolName || "N/A"} | District: ${districtName || "N/A"}\n` +
      (iepDoc ? `IEP Period: ${iepDoc.iepStartDate} to ${iepDoc.iepEndDate}\n` : "") +
      `Reporting Period: ${periodStart} to ${periodEnd} (${reportingPeriod})\n\n` +
      `During this reporting period, ${student.firstName} received ${(completedSessionLogs[0]?.cnt ?? 0)} completed service sessions ` +
      `with ${(missedSessionLogs[0]?.cnt ?? 0)} missed sessions. ${sessionCount} data collection sessions were conducted.\n\n` +
      `Goal Progress Summary:\n` +
      `  M (Mastered): ${masteredCount} | SP (Sufficient Progress): ${sufficientCount}\n` +
      `  IP (Insufficient Progress): ${someCount + insufficientCount} | NA (Not Addressed): ${notAddressedCount}\n` +
      `  Total Goals: ${goalProgressEntries.length}\n\n` +
      `Progress Code Key (per 603 CMR 28.07):\n` +
      `  M = Mastered — Goal has been achieved\n` +
      `  SP = Sufficient Progress — Student is on track to meet goal within IEP period\n` +
      `  IP = Insufficient Progress — Student is not making adequate progress\n` +
      `  NP = No Progress — No measurable improvement observed\n` +
      `  R = Regression — Student performance has declined\n` +
      `  NA = Not Addressed — Goal was not worked on during this period`;

    const serviceDeliverySummary = svcSummaryLines.length > 0
      ? `Service Delivery Summary (${periodStart} to ${periodEnd}):\n${svcSummaryLines.join("\n")}\n\n` +
        `Total: ${(completedSessionLogs[0]?.cnt ?? 0)} sessions completed, ${(missedSessionLogs[0]?.cnt ?? 0)} missed. ` +
        `${sessionCount} data collection sessions conducted.`
      : `${(completedSessionLogs[0]?.cnt ?? 0)} service sessions completed, ${(missedSessionLogs[0]?.cnt ?? 0)} missed. ` +
        `${sessionCount} data collection sessions conducted during this period.`;

    const periodEndDate2 = new Date(periodEnd);
    periodEndDate2.setMonth(periodEndDate2.getMonth() + 3);
    const nextReportDate = periodEndDate2.toISOString().split("T")[0];

    const [report] = await db.insert(progressReportsTable).values({
      studentId,
      reportingPeriod,
      periodStart,
      periodEnd,
      preparedBy: preparedBy || null,
      status: "draft",
      overallSummary,
      serviceDeliverySummary,
      goalProgress: goalProgressEntries,
      studentDob: student.dateOfBirth || null,
      studentGrade: student.grade || null,
      schoolName,
      districtName,
      iepStartDate: iepDoc?.iepStartDate || null,
      iepEndDate: iepDoc?.iepEndDate || null,
      serviceBreakdown,
      parentNotificationDate: null,
      parentNotificationMethod: null,
      nextReportDate,
      recommendations: insufficientCount > 0
        ? `${insufficientCount} goal(s) show insufficient progress. The IEP Team should consider program modifications, increased service intensity, or updated strategies for these areas. Per 603 CMR 28.07(8), parents/guardians are entitled to request an IEP Team meeting to discuss progress at any time.`
        : masteredCount > 0
        ? `${masteredCount} goal(s) have been mastered. The IEP Team should consider developing new goals or advancing criteria for mastered areas. Per 603 CMR 28.07(8), parents/guardians are entitled to request an IEP Team meeting to discuss progress at any time.`
        : "Continue current programming and monitor progress. Per 603 CMR 28.07(8), parents/guardians are entitled to request an IEP Team meeting to discuss progress at any time.",
    }).returning();

    logAudit(req, {
      action: "create",
      targetTable: "progress_reports",
      targetId: report.id,
      studentId: studentId,
      summary: `Generated progress report #${report.id} for student #${studentId} (${reportingPeriod})`,
      newValues: { reportingPeriod, periodStart, periodEnd, status: "draft" } as Record<string, unknown>,
    });
    res.status(201).json({
      ...report,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    });
  } catch (e: any) {
    console.error("Generate progress report error:", e);
    res.status(500).json({ error: "Failed to generate progress report" });
  }
});

// === IEP DOCUMENTS (MA Form) ===

router.get("/students/:studentId/iep-documents", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const docs = await db.select().from(iepDocumentsTable)
      .where(eq(iepDocumentsTable.studentId, studentId))
      .orderBy(desc(iepDocumentsTable.iepStartDate));
    logAudit(req, {
      action: "read",
      targetTable: "iep_documents",
      studentId: studentId,
      summary: `Viewed ${docs.length} IEP documents for student #${studentId}`,
    });
    res.json(docs.map(d => ({ ...d, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() })));
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch IEP documents" });
  }
});

router.get("/iep-documents/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [doc] = await db.select().from(iepDocumentsTable).where(eq(iepDocumentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    logAudit(req, {
      action: "read",
      targetTable: "iep_documents",
      targetId: id,
      studentId: doc.studentId,
      summary: `Viewed IEP document #${id} for student #${doc.studentId}`,
    });
    res.json({ ...doc, createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch IEP document" });
  }
});

router.post("/students/:studentId/iep-documents", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { iepStartDate, iepEndDate, meetingDate, studentConcerns, parentConcerns, teamVision,
            plaafpAcademic, plaafpBehavioral, plaafpCommunication, plaafpAdditional,
            transitionAssessment, transitionPostsecGoals, transitionServices, transitionAgencies,
            esyEligible, esyServices, esyJustification,
            assessmentParticipation, assessmentAccommodations, alternateAssessmentJustification,
            scheduleModifications, transportationServices, preparedBy } = req.body;
    if (!iepStartDate || !iepEndDate) { res.status(400).json({ error: "iepStartDate and iepEndDate are required" }); return; }
    const [doc] = await db.insert(iepDocumentsTable).values({
      studentId, iepStartDate, iepEndDate, meetingDate,
      studentConcerns, parentConcerns, teamVision,
      plaafpAcademic, plaafpBehavioral, plaafpCommunication, plaafpAdditional,
      transitionAssessment, transitionPostsecGoals, transitionServices, transitionAgencies,
      esyEligible: esyEligible ?? null, esyServices, esyJustification,
      assessmentParticipation, assessmentAccommodations, alternateAssessmentJustification,
      scheduleModifications, transportationServices, preparedBy: preparedBy || null,
    }).returning();
    logAudit(req, {
      action: "create",
      targetTable: "iep_documents",
      targetId: doc.id,
      studentId: studentId,
      summary: `Created IEP document #${doc.id} for student #${studentId} (${iepStartDate} - ${iepEndDate})`,
      newValues: { iepStartDate, iepEndDate, meetingDate } as Record<string, unknown>,
    });
    res.status(201).json({ ...doc, createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("POST iep-document error:", e);
    res.status(500).json({ error: "Failed to create IEP document" });
  }
});

router.patch("/iep-documents/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const updates: any = {};
    for (const key of ["iepStartDate","iepEndDate","meetingDate","status","studentConcerns","parentConcerns","teamVision",
                        "plaafpAcademic","plaafpBehavioral","plaafpCommunication","plaafpAdditional",
                        "transitionAssessment","transitionPostsecGoals","transitionServices","transitionAgencies",
                        "esyEligible","esyServices","esyJustification",
                        "assessmentParticipation","assessmentAccommodations","alternateAssessmentJustification",
                        "scheduleModifications","transportationServices","preparedBy","active"]) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const [oldDoc] = await db.select().from(iepDocumentsTable).where(eq(iepDocumentsTable.id, id));
    const [updated] = await db.update(iepDocumentsTable).set(updates).where(eq(iepDocumentsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    logAudit(req, {
      action: "update",
      targetTable: "iep_documents",
      targetId: id,
      studentId: updated.studentId,
      summary: `Updated IEP document #${id}`,
      oldValues: oldDoc ? (Object.fromEntries(Object.keys(updates).map(k => [k, (oldDoc as Record<string, unknown>)[k]]))) : null,
      newValues: updates as Record<string, unknown>,
    });
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to update IEP document" });
  }
});

router.delete("/iep-documents/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [oldDoc] = await db.select().from(iepDocumentsTable).where(eq(iepDocumentsTable.id, id));
    await db.delete(iepDocumentsTable).where(eq(iepDocumentsTable.id, id));
    logAudit(req, {
      action: "delete",
      targetTable: "iep_documents",
      targetId: id,
      studentId: oldDoc?.studentId,
      summary: `Deleted IEP document #${id}`,
      oldValues: oldDoc ? { iepStartDate: oldDoc.iepStartDate, iepEndDate: oldDoc.iepEndDate, status: oldDoc.status } as Record<string, unknown> : null,
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to delete IEP document" });
  }
});

// === ACCOMMODATIONS ===

router.get("/students/:studentId/accommodations", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const accs = await db.select().from(iepAccommodationsTable)
      .where(and(eq(iepAccommodationsTable.studentId, studentId), eq(iepAccommodationsTable.active, true)))
      .orderBy(asc(iepAccommodationsTable.category));
    logAudit(req, {
      action: "read",
      targetTable: "iep_accommodations",
      studentId: studentId,
      summary: `Viewed ${accs.length} accommodations for student #${studentId}`,
    });
    res.json(accs.map(a => ({ ...a, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() })));
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch accommodations" });
  }
});

router.post("/students/:studentId/accommodations", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { category, description, setting, frequency, provider, iepDocumentId } = req.body;
    if (!description) { res.status(400).json({ error: "description is required" }); return; }
    const [acc] = await db.insert(iepAccommodationsTable).values({
      studentId, category: category || "instruction", description, setting, frequency, provider,
      iepDocumentId: iepDocumentId || null,
    }).returning();
    logAudit(req, {
      action: "create",
      targetTable: "iep_accommodations",
      targetId: acc.id,
      studentId: studentId,
      summary: `Created accommodation #${acc.id} for student #${studentId}: ${description}`,
      newValues: { category: category || "instruction", description, setting, frequency } as Record<string, unknown>,
    });
    res.status(201).json({ ...acc, createdAt: acc.createdAt.toISOString(), updatedAt: acc.updatedAt.toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to create accommodation" });
  }
});

router.patch("/accommodations/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const updates: any = {};
    for (const key of ["category","description","setting","frequency","provider","active"]) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const [oldAcc] = await db.select().from(iepAccommodationsTable).where(eq(iepAccommodationsTable.id, id));
    const [updated] = await db.update(iepAccommodationsTable).set(updates).where(eq(iepAccommodationsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    logAudit(req, {
      action: "update",
      targetTable: "iep_accommodations",
      targetId: id,
      studentId: updated.studentId,
      summary: `Updated accommodation #${id}`,
      oldValues: oldAcc ? (Object.fromEntries(Object.keys(updates).map(k => [k, (oldAcc as Record<string, unknown>)[k]]))) : null,
      newValues: updates as Record<string, unknown>,
    });
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to update accommodation" });
  }
});

router.delete("/accommodations/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [oldAcc] = await db.select().from(iepAccommodationsTable).where(eq(iepAccommodationsTable.id, id));
    await db.delete(iepAccommodationsTable).where(eq(iepAccommodationsTable.id, id));
    logAudit(req, {
      action: "delete",
      targetTable: "iep_accommodations",
      targetId: id,
      studentId: oldAcc?.studentId,
      summary: `Deleted accommodation #${id}`,
      oldValues: oldAcc ? { category: oldAcc.category, description: oldAcc.description } as Record<string, unknown> : null,
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to delete accommodation" });
  }
});

function toMaProgressCode(rating: string, trend: string, dataPoints: number): string {
  if (rating === "mastered") return "M";
  if (rating === "not_addressed" || dataPoints === 0) return "NA";
  if (trend === "declining" && (rating === "insufficient_progress" || rating === "some_progress")) return "R";
  if (rating === "sufficient_progress") return "SP";
  if (rating === "some_progress" || rating === "insufficient_progress") return "IP";
  return "NP";
}

function formatPromptLevel(level: string | null): string | null {
  if (!level) return null;
  const labels: Record<string, string> = {
    full_physical: "full physical",
    partial_physical: "partial physical",
    model: "model",
    gestural: "gestural",
    verbal: "verbal",
    independent: "independent",
  };
  return labels[level] ?? level;
}

function promptLevelPhrase(level: string | null): string {
  const formatted = formatPromptLevel(level);
  return formatted ? ` at the ${formatted} prompt level` : "";
}

export default router;
