import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  iepGoalsTable, progressReportsTable, studentsTable, staffTable,
  programTargetsTable, behaviorTargetsTable, programDataTable,
  behaviorDataTable, dataSessionsTable, serviceRequirementsTable,
  serviceTypesTable, sessionLogsTable,
  iepDocumentsTable, schoolsTable, districtsTable,
} from "@workspace/db";
import type { ServiceDeliveryBreakdown } from "@workspace/db";
import { eq, desc, and, gte, lte, asc, count, sum, isNull } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import { createAutoVersion } from "../../lib/documentVersioning";
import { getEnforcedDistrictId, type AuthedRequest } from "../../middlewares/auth";
import { toMaProgressCode, formatPromptLevel, promptLevelPhrase } from "./utils";
import { computeGoalProgressEntries } from "../../lib/goalProgressCompute";

const router: IRouter = Router();

router.get("/progress-reports/all", async (req, res): Promise<void> => {
  try {
    const authed = req as AuthedRequest;
    const districtId = getEnforcedDistrictId(authed);
    const conditions = [];
    if (districtId) {
      conditions.push(eq(schoolsTable.districtId, districtId));
    }
    const reports = await db.select({
      id: progressReportsTable.id,
      studentId: progressReportsTable.studentId,
      reportingPeriod: progressReportsTable.reportingPeriod,
      periodStart: progressReportsTable.periodStart,
      periodEnd: progressReportsTable.periodEnd,
      status: progressReportsTable.status,
      preparedBy: progressReportsTable.preparedBy,
      overallSummary: progressReportsTable.overallSummary,
      schoolName: progressReportsTable.schoolName,
      districtName: progressReportsTable.districtName,
      parentNotificationDate: progressReportsTable.parentNotificationDate,
      nextReportDate: progressReportsTable.nextReportDate,
      goalProgress: progressReportsTable.goalProgress,
      serviceBreakdown: progressReportsTable.serviceBreakdown,
      createdAt: progressReportsTable.createdAt,
      updatedAt: progressReportsTable.updatedAt,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      staffFirstName: staffTable.firstName,
      staffLastName: staffTable.lastName,
    }).from(progressReportsTable)
      .innerJoin(studentsTable, eq(progressReportsTable.studentId, studentsTable.id))
      .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
      .leftJoin(staffTable, eq(progressReportsTable.preparedBy, staffTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(progressReportsTable.createdAt))
      .limit(200);
    const mapped = reports.map(r => ({
      ...r,
      studentName: r.studentFirstName && r.studentLastName ? `${r.studentFirstName} ${r.studentLastName}` : null,
      preparedByName: r.staffFirstName && r.staffLastName ? `${r.staffFirstName} ${r.staffLastName}` : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
    res.json(mapped);
  } catch (e: unknown) {
    console.error("List all progress reports error:", e);
    res.status(500).json({ error: "Failed to fetch progress reports" });
  }
});

router.get("/students/:studentId/progress-reports", async (req, res): Promise<void> => {
  try {
    const authed = req as AuthedRequest;
    const districtId = getEnforcedDistrictId(authed);
    const studentId = parseInt(req.params.studentId);
    if (districtId) {
      const [stu] = await db.select({ schoolId: studentsTable.schoolId }).from(studentsTable).where(eq(studentsTable.id, studentId));
      if (!stu?.schoolId) { res.status(404).json({ error: "Student not found" }); return; }
      const [sch] = await db.select({ districtId: schoolsTable.districtId }).from(schoolsTable).where(eq(schoolsTable.id, stu.schoolId));
      if (!sch || sch.districtId !== districtId) { res.status(404).json({ error: "Student not found" }); return; }
    }
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
  } catch (e: unknown) {
    res.status(500).json({ error: "Failed to fetch progress reports" });
  }
});

router.get("/progress-reports/:id", async (req, res): Promise<void> => {
  try {
    const authed = req as AuthedRequest;
    const districtId = getEnforcedDistrictId(authed);
    const id = parseInt(req.params.id);
    const conditions = [eq(progressReportsTable.id, id)];
    if (districtId) {
      conditions.push(eq(schoolsTable.districtId, districtId));
    }
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
      .innerJoin(studentsTable, eq(progressReportsTable.studentId, studentsTable.id))
      .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
      .where(and(...conditions));
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
  } catch (e: unknown) {
    res.status(500).json({ error: "Failed to fetch progress report" });
  }
});

router.patch("/progress-reports/:id", async (req, res): Promise<void> => {
  try {
    const authed = req as AuthedRequest;
    const districtId = getEnforcedDistrictId(authed);
    const id = parseInt(req.params.id);

    const VALID_STATUS = ["draft", "review", "final", "sent"];
    const updates: Record<string, unknown> = {};
    for (const key of ["status","overallSummary","serviceDeliverySummary","recommendations","parentNotes","goalProgress","preparedBy","parentNotificationDate"]) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.status && typeof updates.status === "string" && !VALID_STATUS.includes(updates.status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUS.join(", ")}` });
      return;
    }
    if (updates.goalProgress !== undefined && !Array.isArray(updates.goalProgress)) {
      res.status(400).json({ error: "goalProgress must be an array" });
      return;
    }

    const ownerConditions = [eq(progressReportsTable.id, id)];
    const [oldReport] = await db.select({
      report: progressReportsTable,
      schoolDistrictId: schoolsTable.districtId,
    }).from(progressReportsTable)
      .innerJoin(studentsTable, eq(progressReportsTable.studentId, studentsTable.id))
      .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
      .where(and(...ownerConditions));
    if (!oldReport) { res.status(404).json({ error: "Not found" }); return; }
    if (districtId && oldReport.schoolDistrictId !== districtId) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const report = oldReport.report;
    if (updates.status && updates.status !== report.status) {
      const VALID_TRANSITIONS: Record<string, string[]> = {
        draft: ["review", "final"],
        review: ["draft", "final"],
        final: ["sent", "draft"],
        sent: ["draft"],
      };
      const allowed = VALID_TRANSITIONS[report.status] || [];
      if (!allowed.includes(updates.status as string)) {
        res.status(400).json({ error: `Cannot transition from '${report.status}' to '${updates.status}'` });
        return;
      }
    }

    const [updated] = await db.update(progressReportsTable).set(updates).where(eq(progressReportsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    const oldVals = Object.fromEntries(Object.keys(updates).map(k => [k, (report as Record<string, unknown>)[k]]));
    logAudit(req, {
      action: "update",
      targetTable: "progress_reports",
      targetId: id,
      studentId: updated.studentId,
      summary: `Updated progress report #${id}`,
      oldValues: oldVals,
      newValues: updates,
    });
    if (districtId) {
      createAutoVersion({
        documentType: "progress_report",
        documentId: id,
        studentId: updated.studentId,
        districtId,
        authorUserId: authed.userId || "system",
        authorName: authed.displayName || "System",
        title: `Progress Report #${id} updated`,
        oldValues: oldVals,
        newValues: updates as Record<string, unknown>,
      });
    }
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (e: unknown) {
    res.status(500).json({ error: "Failed to update progress report" });
  }
});

router.post("/students/:studentId/progress-reports/generate", async (req, res): Promise<void> => {
  try {
    const authed = req as AuthedRequest;
    const districtId = getEnforcedDistrictId(authed);
    const studentId = parseInt(req.params.studentId);
    const { periodStart, periodEnd, reportingPeriod, preparedBy } = req.body;
    if (!periodStart || !periodEnd || !reportingPeriod) {
      res.status(400).json({ error: "periodStart, periodEnd, and reportingPeriod are required" });
      return;
    }

    const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
    if (!student) { res.status(404).json({ error: "Student not found" }); return; }
    if (!student.schoolId) { res.status(400).json({ error: "Student has no school assignment" }); return; }
    if (districtId) {
      const [sch] = await db.select({ districtId: schoolsTable.districtId }).from(schoolsTable).where(eq(schoolsTable.id, student.schoolId));
      if (!sch || sch.districtId !== districtId) { res.status(404).json({ error: "Student not found" }); return; }
    }

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
        isNull(sessionLogsTable.deletedAt),
      ));
    const missedSessionLogs = await db.select({ cnt: count() }).from(sessionLogsTable)
      .where(and(
        eq(sessionLogsTable.studentId, studentId),
        eq(sessionLogsTable.status, "missed"),
        gte(sessionLogsTable.sessionDate, periodStart),
        lte(sessionLogsTable.sessionDate, periodEnd),
        isNull(sessionLogsTable.deletedAt),
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
          isNull(sessionLogsTable.deletedAt),
        ));
      const missed = await db.select({ cnt: count() }).from(sessionLogsTable)
        .where(and(
          eq(sessionLogsTable.studentId, studentId),
          eq(sessionLogsTable.serviceRequirementId, sr.id),
          eq(sessionLogsTable.status, "missed"),
          gte(sessionLogsTable.sessionDate, periodStart),
          lte(sessionLogsTable.sessionDate, periodEnd),
          isNull(sessionLogsTable.deletedAt),
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

router.post("/progress-reports/batch-generate", async (req, res): Promise<void> => {
  try {
    const authed = req as AuthedRequest;
    const districtId = getEnforcedDistrictId(authed);
    const { studentIds, periodStart, periodEnd, reportingPeriod, preparedBy } = req.body;
    if (!Array.isArray(studentIds) || studentIds.length === 0 || !periodStart || !periodEnd || !reportingPeriod) {
      res.status(400).json({ error: "studentIds (array), periodStart, periodEnd, and reportingPeriod are required" });
      return;
    }
    if (studentIds.length > 100) {
      res.status(400).json({ error: "Maximum 100 students per batch" });
      return;
    }

    const results: { studentId: number; reportId: number | null; studentName: string; error: string | null }[] = [];

    for (const sid of studentIds) {
      const studentId = Number(sid);
      try {
        const studentConditions = [eq(studentsTable.id, studentId)];
        if (districtId) {
          studentConditions.push(eq(schoolsTable.districtId, districtId));
        }
        const [studentRow] = await db.select({
          id: studentsTable.id,
          firstName: studentsTable.firstName,
          lastName: studentsTable.lastName,
          schoolId: studentsTable.schoolId,
          dateOfBirth: studentsTable.dateOfBirth,
          grade: studentsTable.grade,
          status: studentsTable.status,
        }).from(studentsTable)
          .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
          .where(and(...studentConditions));
        if (!studentRow) {
          results.push({ studentId, reportId: null, studentName: "Unknown", error: "Student not found" });
          continue;
        }
        const student = studentRow;

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

        const dsRows = await db.select().from(dataSessionsTable)
          .where(and(
            eq(dataSessionsTable.studentId, studentId),
            gte(dataSessionsTable.sessionDate, periodStart),
            lte(dataSessionsTable.sessionDate, periodEnd),
          ));
        const sessionIds = dsRows.map(s => s.id);

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
              promptLevel = progData[progData.length - 1].promptLevelUsed;
              const [target] = await db.select().from(programTargetsTable).where(eq(programTargetsTable.id, goal.programTargetId!));
              const masteryPct = target?.masteryCriterionPercent ?? 80;
              const plPhrase = promptLevelPhrase(promptLevel);

              currentPerformance = promptLevel
                ? `${avgPct}% accuracy (last 3 sessions) at ${formatPromptLevel(promptLevel)} prompt level`
                : `${avgPct}% accuracy (last 3 sessions)`;

              if (avgPct >= masteryPct) {
                progressRating = "mastered";
                narrative = `${student.firstName} has met mastery criteria of ${masteryPct}% with an average of ${avgPct}% across the last ${lastPoints.length} sessions${plPhrase}. This goal has been mastered.`;
              } else if (avgPct >= masteryPct * 0.75) {
                progressRating = "sufficient_progress";
                narrative = `${student.firstName} is making sufficient progress toward this goal with ${avgPct}% accuracy${plPhrase}.`;
              } else if (avgPct >= masteryPct * 0.5) {
                progressRating = "some_progress";
                narrative = `${student.firstName} is making some progress with ${avgPct}% accuracy${plPhrase}. Additional support may be needed.`;
              } else {
                progressRating = "insufficient_progress";
                narrative = `${student.firstName} is making insufficient progress with ${avgPct}% accuracy${plPhrase}. Program modifications recommended.`;
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
              narrative = `No program data collected for this goal during the reporting period.`;
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
              currentPerformance = `Average of ${avgVal} per session (last 3 sessions)`;

              const goalMet = behaviorGoal !== null && (
                (target?.targetDirection === "decrease" && avgVal <= behaviorGoal) ||
                (target?.targetDirection === "increase" && avgVal >= behaviorGoal)
              );

              if (goalMet) {
                progressRating = "mastered";
                narrative = `${student.firstName} has met the behavior goal. Current average is ${avgVal}, meeting the target of ${behaviorGoal}.`;
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
              narrative = `No behavior data collected for this goal during the reporting period.`;
            }
          } else {
            narrative = `This goal was not addressed during the reporting period.`;
          }

          return {
            iepGoalId: goal.id, goalArea: goal.goalArea, goalNumber: goal.goalNumber,
            annualGoal: goal.annualGoal, baseline: goal.baseline, targetCriterion: goal.targetCriterion,
            currentPerformance, progressRating, progressCode: toMaProgressCode(progressRating, trendDirection, dataPoints),
            dataPoints, trendDirection, promptLevel, percentCorrect, behaviorValue, behaviorGoal, narrative,
            benchmarks: goal.benchmarks || null, measurementMethod: goal.measurementMethod || null,
            serviceArea: goal.serviceArea || null,
          };
        }));

        const completedSessionLogs = await db.select({ cnt: count() }).from(sessionLogsTable)
          .where(and(eq(sessionLogsTable.studentId, studentId), eq(sessionLogsTable.status, "completed"),
            gte(sessionLogsTable.sessionDate, periodStart), lte(sessionLogsTable.sessionDate, periodEnd),
            isNull(sessionLogsTable.deletedAt)));
        const missedSessionLogs = await db.select({ cnt: count() }).from(sessionLogsTable)
          .where(and(eq(sessionLogsTable.studentId, studentId), eq(sessionLogsTable.status, "missed"),
            gte(sessionLogsTable.sessionDate, periodStart), lte(sessionLogsTable.sessionDate, periodEnd),
            isNull(sessionLogsTable.deletedAt)));

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
          const completed = await db.select({ cnt: count(), totalMin: sum(sessionLogsTable.durationMinutes) }).from(sessionLogsTable)
            .where(and(eq(sessionLogsTable.studentId, studentId), eq(sessionLogsTable.serviceRequirementId, sr.id),
              eq(sessionLogsTable.status, "completed"), gte(sessionLogsTable.sessionDate, periodStart), lte(sessionLogsTable.sessionDate, periodEnd),
              isNull(sessionLogsTable.deletedAt)));
          const missed = await db.select({ cnt: count() }).from(sessionLogsTable)
            .where(and(eq(sessionLogsTable.studentId, studentId), eq(sessionLogsTable.serviceRequirementId, sr.id),
              eq(sessionLogsTable.status, "missed"), gte(sessionLogsTable.sessionDate, periodStart), lte(sessionLogsTable.sessionDate, periodEnd),
              isNull(sessionLogsTable.deletedAt)));

          const deliveredMin = parseInt(String(completed[0]?.totalMin ?? "0"));
          const weeks = Math.max(1, Math.round((new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / (7 * 86400000)));
          const months = Math.max(1, Math.round(weeks / 4.33));
          const requiredForPeriod = sr.intervalType === "weekly" ? (sr.requiredMinutes ?? 0) * weeks :
                                    sr.intervalType === "monthly" ? (sr.requiredMinutes ?? 0) * months : (sr.requiredMinutes ?? 0);
          serviceBreakdown.push({
            serviceType: sr.serviceTypeName || "Unknown",
            requiredMinutes: requiredForPeriod, deliveredMinutes: deliveredMin,
            missedSessions: Number(missed[0]?.cnt ?? 0), completedSessions: Number(completed[0]?.cnt ?? 0),
            compliancePercent: Math.min(requiredForPeriod > 0 ? Math.round(deliveredMin / requiredForPeriod * 100) : 100, 100),
          });
        }

        const masteredCount = goalProgressEntries.filter(g => g.progressRating === "mastered").length;
        const sufficientCount = goalProgressEntries.filter(g => g.progressRating === "sufficient_progress").length;
        const someCount = goalProgressEntries.filter(g => g.progressRating === "some_progress").length;
        const insufficientCount = goalProgressEntries.filter(g => g.progressRating === "insufficient_progress").length;
        const notAddressedCount = goalProgressEntries.filter(g => g.progressRating === "not_addressed").length;

        const overallSummary =
          `MASSACHUSETTS IEP PROGRESS REPORT\nPursuant to 603 CMR 28.07(8)\n\n` +
          `Student: ${student.firstName} ${student.lastName}\nDOB: ${student.dateOfBirth || "N/A"} | Grade: ${student.grade || "N/A"}\n` +
          `School: ${schoolName || "N/A"} | District: ${districtName || "N/A"}\n` +
          (iepDoc ? `IEP Period: ${iepDoc.iepStartDate} to ${iepDoc.iepEndDate}\n` : "") +
          `Reporting Period: ${periodStart} to ${periodEnd} (${reportingPeriod})\n\n` +
          `Goal Progress Summary:\n  M: ${masteredCount} | SP: ${sufficientCount} | IP: ${someCount + insufficientCount} | NA: ${notAddressedCount}\n  Total Goals: ${goalProgressEntries.length}`;

        const svcSummaryLines = serviceBreakdown.map(s =>
          `${s.serviceType}: ${s.deliveredMinutes}/${s.requiredMinutes} min (${s.compliancePercent}%)`);
        const serviceDeliverySummary = svcSummaryLines.length > 0
          ? `Service Delivery (${periodStart} to ${periodEnd}):\n${svcSummaryLines.join("\n")}`
          : `${completedSessionLogs[0]?.cnt ?? 0} sessions completed, ${missedSessionLogs[0]?.cnt ?? 0} missed.`;

        const periodEndDate2 = new Date(periodEnd);
        periodEndDate2.setMonth(periodEndDate2.getMonth() + 3);
        const nextReportDate = periodEndDate2.toISOString().split("T")[0];

        const [report] = await db.insert(progressReportsTable).values({
          studentId, reportingPeriod, periodStart, periodEnd, preparedBy: preparedBy || null,
          status: "draft", overallSummary, serviceDeliverySummary,
          goalProgress: goalProgressEntries, studentDob: student.dateOfBirth || null,
          studentGrade: student.grade || null, schoolName, districtName,
          iepStartDate: iepDoc?.iepStartDate || null, iepEndDate: iepDoc?.iepEndDate || null,
          serviceBreakdown, parentNotificationDate: null, parentNotificationMethod: null, nextReportDate,
          recommendations: insufficientCount > 0
            ? `${insufficientCount} goal(s) show insufficient progress. Program modifications recommended.`
            : masteredCount > 0
            ? `${masteredCount} goal(s) mastered. Consider advancing criteria.`
            : "Continue current programming and monitor progress.",
        }).returning();

        results.push({ studentId, reportId: report.id, studentName: `${student.firstName} ${student.lastName}`, error: null });
      } catch (innerErr: unknown) {
        console.error(`Batch progress report error for student ${studentId}:`, innerErr);
        results.push({ studentId, reportId: null, studentName: "Unknown", error: "Failed to generate report" });
      }
    }

    const succeeded = results.filter(r => r.reportId !== null).length;
    const failed = results.filter(r => r.error !== null).length;

    logAudit(req, {
      action: "create",
      targetTable: "progress_reports",
      summary: `Batch generated ${succeeded} progress reports (${failed} failed) for ${reportingPeriod}`,
      metadata: { succeeded, failed, reportingPeriod, periodStart, periodEnd } as Record<string, unknown>,
    });

    res.status(201).json({ results, summary: { total: results.length, succeeded, failed } });
  } catch (e: unknown) {
    console.error("Batch generate progress reports error:", e);
    res.status(500).json({ error: "Failed to batch generate progress reports" });
  }
});

/**
 * POST /progress-reports/admin/backfill-goal-progress
 *
 * One-time / idempotent backfill: finds every existing progress report whose
 * goalProgress JSONB column is null or an empty array, recomputes per-goal
 * progress entries from the actual data sessions for that reporting period,
 * and writes the result back to the row.
 *
 * Returns a summary: { processed, updated, skipped, errors }.
 * Safe to re-run — already-populated reports (goalProgress.length > 0) are skipped.
 */
router.post("/progress-reports/admin/backfill-goal-progress", async (req, res): Promise<void> => {
  try {
    const authed = req as AuthedRequest;
    const districtId = getEnforcedDistrictId(authed);

    const allReports = await db
      .select({
        id: progressReportsTable.id,
        studentId: progressReportsTable.studentId,
        periodStart: progressReportsTable.periodStart,
        periodEnd: progressReportsTable.periodEnd,
        goalProgress: progressReportsTable.goalProgress,
        studentFirstName: studentsTable.firstName,
      })
      .from(progressReportsTable)
      .innerJoin(studentsTable, eq(progressReportsTable.studentId, studentsTable.id))
      .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
      .where(districtId ? eq(schoolsTable.districtId, districtId) : undefined as any);

    const toBackfill = allReports.filter(
      (r) => !r.goalProgress || (Array.isArray(r.goalProgress) && r.goalProgress.length === 0),
    );

    let updated = 0;
    let skipped = allReports.length - toBackfill.length;
    const errors: { reportId: number; error: string }[] = [];

    for (const report of toBackfill) {
      try {
        const entries = await computeGoalProgressEntries(
          report.studentId,
          report.studentFirstName,
          report.periodStart,
          report.periodEnd,
        );
        await db
          .update(progressReportsTable)
          .set({ goalProgress: entries, updatedAt: new Date() })
          .where(eq(progressReportsTable.id, report.id));
        updated++;
      } catch (err: any) {
        errors.push({ reportId: report.id, error: String(err?.message ?? err) });
      }
    }

    logAudit(req, {
      action: "update",
      targetTable: "progress_reports",
      summary: `Backfilled goalProgress for ${updated} progress reports (${skipped} already populated, ${errors.length} errors)`,
      metadata: { updated, skipped, errorCount: errors.length } as Record<string, unknown>,
    });

    res.json({
      processed: toBackfill.length,
      updated,
      skipped,
      errors,
    });
  } catch (e: any) {
    console.error("Backfill goal progress error:", e);
    res.status(500).json({ error: "Failed to backfill goal progress" });
  }
});

export default router;
