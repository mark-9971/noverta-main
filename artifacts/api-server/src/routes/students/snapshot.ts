import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, schoolsTable, staffTable,
  serviceTypesTable, sessionLogsTable, alertsTable,
  iepGoalsTable, iepDocumentsTable, iepAccommodationsTable,
  restraintIncidentsTable, programTargetsTable, behaviorTargetsTable,
  programDataTable, behaviorDataTable, dataSessionsTable,
} from "@workspace/db";
import { eq, and, desc, asc, sql, isNull, gte, inArray } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../../lib/minuteCalc";
import { assertStudentAccess } from "../../lib/tenantAccess";
import type { AuthedRequest } from "../../middlewares/auth";
import { studentIdParamGuard } from "./idGuard";

const router: IRouter = Router();
router.param("id", studentIdParamGuard);

router.get("/students/:id/snapshot", async (req, res): Promise<void> => {
  try {
    const studentId = Number(req.params.id);
    if (!Number.isFinite(studentId) || studentId <= 0) {
      res.status(400).json({ error: "Invalid student ID" });
      return;
    }

    const hasAccess = await assertStudentAccess(req as AuthedRequest, studentId);
    if (!hasAccess) { res.status(403).json({ error: "Access denied" }); return; }

    const [student] = await db.select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      grade: studentsTable.grade,
      status: studentsTable.status,
      schoolName: schoolsTable.name,
    }).from(studentsTable)
      .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
      .where(and(eq(studentsTable.id, studentId), isNull(studentsTable.deletedAt)));

    if (!student) { res.status(404).json({ error: "Student not found" }); return; }

    const today = new Date().toISOString().slice(0, 10);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);
    const fromDate = sixMonthsAgo.toISOString().slice(0, 10);

    const [
      goalsRaw,
      iepDocs,
      accommodationsRaw,
      recentSessionsRaw,
      incidentsRaw,
      minuteProgress,
      activeAlerts,
      reEvalRows,
    ] = await Promise.all([
      db.select({
        id: iepGoalsTable.id,
        goalArea: iepGoalsTable.goalArea,
        goalNumber: iepGoalsTable.goalNumber,
        annualGoal: iepGoalsTable.annualGoal,
        programTargetId: iepGoalsTable.programTargetId,
        behaviorTargetId: iepGoalsTable.behaviorTargetId,
        ptMasteryCriterion: programTargetsTable.masteryCriterionPercent,
        btBaselineValue: behaviorTargetsTable.baselineValue,
        btGoalValue: behaviorTargetsTable.goalValue,
        btTargetDirection: behaviorTargetsTable.targetDirection,
      }).from(iepGoalsTable)
        .leftJoin(programTargetsTable, eq(iepGoalsTable.programTargetId, programTargetsTable.id))
        .leftJoin(behaviorTargetsTable, eq(iepGoalsTable.behaviorTargetId, behaviorTargetsTable.id))
        .where(and(eq(iepGoalsTable.studentId, studentId), eq(iepGoalsTable.active, true)))
        .orderBy(asc(iepGoalsTable.goalArea), asc(iepGoalsTable.goalNumber)),

      db.select({
        id: iepDocumentsTable.id,
        iepStartDate: iepDocumentsTable.iepStartDate,
        iepEndDate: iepDocumentsTable.iepEndDate,
        status: iepDocumentsTable.status,
        active: iepDocumentsTable.active,
      }).from(iepDocumentsTable)
        .where(and(eq(iepDocumentsTable.studentId, studentId), eq(iepDocumentsTable.active, true)))
        .orderBy(desc(iepDocumentsTable.iepStartDate))
        .limit(1),

      db.select({
        id: iepAccommodationsTable.id,
        category: iepAccommodationsTable.category,
        description: iepAccommodationsTable.description,
        setting: iepAccommodationsTable.setting,
        frequency: iepAccommodationsTable.frequency,
        active: iepAccommodationsTable.active,
      }).from(iepAccommodationsTable)
        .where(and(eq(iepAccommodationsTable.studentId, studentId), eq(iepAccommodationsTable.active, true))),

      db.select({
        id: sessionLogsTable.id,
        sessionDate: sessionLogsTable.sessionDate,
        durationMinutes: sessionLogsTable.durationMinutes,
        status: sessionLogsTable.status,
        notes: sessionLogsTable.notes,
        serviceTypeName: serviceTypesTable.name,
        staffFirst: staffTable.firstName,
        staffLast: staffTable.lastName,
      }).from(sessionLogsTable)
        .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, sessionLogsTable.serviceTypeId))
        .leftJoin(staffTable, eq(staffTable.id, sessionLogsTable.staffId))
        .where(and(eq(sessionLogsTable.studentId, studentId), isNull(sessionLogsTable.deletedAt)))
        .orderBy(desc(sessionLogsTable.sessionDate))
        .limit(5),

      db.select({
        id: restraintIncidentsTable.id,
        incidentDate: restraintIncidentsTable.incidentDate,
        incidentType: restraintIncidentsTable.incidentType,
        status: restraintIncidentsTable.status,
        studentInjury: restraintIncidentsTable.studentInjury,
        staffInjury: restraintIncidentsTable.staffInjury,
      }).from(restraintIncidentsTable)
        .where(eq(restraintIncidentsTable.studentId, studentId))
        .orderBy(desc(restraintIncidentsTable.incidentDate))
        .limit(5),

      computeAllActiveMinuteProgress({ studentId }),

      db.select({
        id: alertsTable.id,
        type: alertsTable.type,
        severity: alertsTable.severity,
        message: alertsTable.message,
        createdAt: alertsTable.createdAt,
      }).from(alertsTable)
        .where(and(eq(alertsTable.studentId, studentId), eq(alertsTable.resolved, false)))
        .orderBy(desc(alertsTable.createdAt))
        .limit(10),

      db.execute(sql`
        SELECT ed.next_re_eval_date, ed.primary_disability
        FROM eligibility_determinations ed
        WHERE ed.student_id = ${studentId} AND ed.deleted_at IS NULL
        ORDER BY ed.created_at DESC LIMIT 1
      `),
    ]);

    const programTargetIds = goalsRaw.map(g => g.programTargetId).filter((id): id is number => id !== null);
    const behaviorTargetIds = goalsRaw.map(g => g.behaviorTargetId).filter((id): id is number => id !== null);

    const [allProgramData, allBehaviorData] = await Promise.all([
      programTargetIds.length > 0
        ? db.select({
            programTargetId: programDataTable.programTargetId,
            sessionDate: dataSessionsTable.sessionDate,
            percentCorrect: programDataTable.percentCorrect,
          }).from(programDataTable)
            .innerJoin(dataSessionsTable, eq(programDataTable.dataSessionId, dataSessionsTable.id))
            .where(and(
              inArray(programDataTable.programTargetId, programTargetIds),
              eq(dataSessionsTable.studentId, studentId),
              gte(dataSessionsTable.sessionDate, fromDate),
            ))
            .orderBy(asc(dataSessionsTable.sessionDate))
        : Promise.resolve([]),
      behaviorTargetIds.length > 0
        ? db.select({
            behaviorTargetId: behaviorDataTable.behaviorTargetId,
            sessionDate: dataSessionsTable.sessionDate,
            value: behaviorDataTable.value,
          }).from(behaviorDataTable)
            .innerJoin(dataSessionsTable, eq(behaviorDataTable.dataSessionId, dataSessionsTable.id))
            .where(and(
              inArray(behaviorDataTable.behaviorTargetId, behaviorTargetIds),
              eq(dataSessionsTable.studentId, studentId),
              gte(dataSessionsTable.sessionDate, fromDate),
            ))
            .orderBy(asc(dataSessionsTable.sessionDate))
        : Promise.resolve([]),
    ]);

    const programDataByTarget = new Map<number, { sessionDate: string; percentCorrect: string | null }[]>();
    for (const row of allProgramData) {
      const arr = programDataByTarget.get(row.programTargetId) || [];
      arr.push({ sessionDate: row.sessionDate, percentCorrect: row.percentCorrect });
      programDataByTarget.set(row.programTargetId, arr);
    }

    const behaviorDataByTarget = new Map<number, { sessionDate: string; value: string }[]>();
    for (const row of allBehaviorData) {
      const arr = behaviorDataByTarget.get(row.behaviorTargetId) || [];
      arr.push({ sessionDate: row.sessionDate, value: row.value });
      behaviorDataByTarget.set(row.behaviorTargetId, arr);
    }

    function computeTrend(values: number[], threshold: number, isDecrease: boolean): "improving" | "declining" | "stable" {
      if (values.length < 4) return "stable";
      const firstHalf = values.slice(0, Math.floor(values.length / 2));
      const secondHalf = values.slice(Math.floor(values.length / 2));
      const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
      if (isDecrease) {
        if (secondAvg < firstAvg - threshold) return "improving";
        if (secondAvg > firstAvg + threshold) return "declining";
      } else {
        if (secondAvg > firstAvg + threshold) return "improving";
        if (secondAvg < firstAvg - threshold) return "declining";
      }
      return "stable";
    }

    const goals = goalsRaw.map((goal) => {
      let latestValue: number | null = null;
      let trendDirection: "improving" | "declining" | "stable" = "stable";
      let progressRating = "not_addressed";
      let dataPointCount = 0;

      if (goal.programTargetId) {
        const rows = programDataByTarget.get(goal.programTargetId) || [];
        dataPointCount = rows.length;
        if (rows.length > 0) {
          const values = rows.map(r => parseFloat(r.percentCorrect ?? "0"));
          latestValue = values[values.length - 1];
          const masteryPct = goal.ptMasteryCriterion ?? 80;
          if (latestValue >= masteryPct) progressRating = "mastered";
          else if (latestValue >= masteryPct * 0.75) progressRating = "sufficient_progress";
          else if (latestValue >= masteryPct * 0.5) progressRating = "some_progress";
          else progressRating = "insufficient_progress";
          trendDirection = computeTrend(values, 5, false);
        }
      } else if (goal.behaviorTargetId) {
        const rows = behaviorDataByTarget.get(goal.behaviorTargetId) || [];
        dataPointCount = rows.length;
        if (rows.length > 0) {
          const values = rows.map(r => parseFloat(r.value));
          latestValue = values[values.length - 1];
          const goalVal = goal.btGoalValue ? parseFloat(goal.btGoalValue) : null;
          const targetDir = goal.btTargetDirection || "decrease";
          if (goalVal !== null) {
            const met = targetDir === "decrease" ? latestValue <= goalVal : latestValue >= goalVal;
            if (met) progressRating = "mastered";
            else {
              const base = goal.btBaselineValue ? parseFloat(goal.btBaselineValue) : null;
              if (base !== null) {
                const totalRange = Math.abs(goalVal - base);
                const movingTowardGoal = targetDir === "decrease"
                  ? base - latestValue
                  : latestValue - base;
                const pct = totalRange > 0 ? Math.max(0, movingTowardGoal) / totalRange : 0;
                if (pct >= 0.75) progressRating = "sufficient_progress";
                else if (pct >= 0.25) progressRating = "some_progress";
                else progressRating = "insufficient_progress";
              } else {
                progressRating = "some_progress";
              }
            }
          }
          trendDirection = computeTrend(values, 0.5, (targetDir || "decrease") === "decrease");
        }
      }

      return {
        id: goal.id,
        goalArea: goal.goalArea,
        goalNumber: goal.goalNumber,
        annualGoal: goal.annualGoal,
        latestValue,
        trendDirection,
        progressRating,
        dataPointCount,
      };
    });

    const activeIep = iepDocs[0] || null;

    const deadlines: { label: string; date: string; daysUntil: number; urgency: "overdue" | "critical" | "soon" | "ok" }[] = [];

    if (activeIep?.iepEndDate) {
      const endDate = new Date(activeIep.iepEndDate);
      const daysUntil = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      deadlines.push({
        label: "IEP Annual Review",
        date: activeIep.iepEndDate,
        daysUntil,
        urgency: daysUntil < 0 ? "overdue" : daysUntil <= 30 ? "critical" : daysUntil <= 60 ? "soon" : "ok",
      });
    }

    const reEvalRow = (reEvalRows.rows as Record<string, unknown>[])[0];
    if (reEvalRow?.next_re_eval_date) {
      const reEvalDate = new Date(reEvalRow.next_re_eval_date as string);
      const daysUntil = Math.ceil((reEvalDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      deadlines.push({
        label: "Re-Evaluation Due",
        date: reEvalRow.next_re_eval_date as string,
        daysUntil,
        urgency: daysUntil < 0 ? "overdue" : daysUntil <= 30 ? "critical" : daysUntil <= 90 ? "soon" : "ok",
      });
    }

    const upcomingMeetings = await db.execute(sql`
      SELECT id, scheduled_date, meeting_type, status
      FROM team_meetings
      WHERE student_id = ${studentId}
        AND scheduled_date >= ${today}
        AND status != 'cancelled'
      ORDER BY scheduled_date ASC
      LIMIT 3
    `);
    for (const mtg of upcomingMeetings.rows as Record<string, unknown>[]) {
      if (mtg.scheduled_date) {
        const mtgDate = new Date(mtg.scheduled_date as string);
        const daysUntil = Math.ceil((mtgDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        deadlines.push({
          label: `Meeting: ${String(mtg.meeting_type || "Team").replace(/_/g, " ")}`,
          date: mtg.scheduled_date as string,
          daysUntil,
          urgency: daysUntil <= 7 ? "critical" : daysUntil <= 30 ? "soon" : "ok",
        });
      }
    }

    deadlines.sort((a, b) => a.daysUntil - b.daysUntil);

    const complianceStatus = {
      servicesOnTrack: minuteProgress.filter((p: { riskStatus: string }) => p.riskStatus === "on_track" || p.riskStatus === "completed").length,
      servicesAtRisk: minuteProgress.filter((p: { riskStatus: string }) => p.riskStatus === "at_risk" || p.riskStatus === "slightly_behind").length,
      servicesOutOfCompliance: minuteProgress.filter((p: { riskStatus: string }) => p.riskStatus === "out_of_compliance").length,
      totalServices: minuteProgress.length,
      iepStatus: activeIep ? activeIep.status : "none",
      iepExpiring: activeIep?.iepEndDate ? Math.ceil((new Date(activeIep.iepEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) <= 30 : false,
      activeAlertCount: activeAlerts.length,
    };

    res.json({
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        grade: student.grade,
        status: student.status,
        schoolName: student.schoolName,
      },
      goals,
      deadlines,
      recentSessions: recentSessionsRaw.map(s => ({
        id: s.id,
        sessionDate: s.sessionDate,
        durationMinutes: s.durationMinutes,
        status: s.status,
        notes: s.notes,
        serviceTypeName: s.serviceTypeName,
        staffName: s.staffFirst && s.staffLast ? `${s.staffFirst} ${s.staffLast}` : null,
      })),
      recentIncidents: incidentsRaw.map(i => ({
        id: i.id,
        incidentDate: i.incidentDate,
        incidentType: i.incidentType,
        status: i.status,
        studentInjury: i.studentInjury,
        staffInjury: i.staffInjury,
      })),
      accommodations: accommodationsRaw.map(a => ({
        id: a.id,
        category: a.category,
        description: a.description,
        setting: a.setting,
        frequency: a.frequency,
      })),
      complianceStatus,
      activeAlerts: activeAlerts.map(a => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        message: a.message,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (e: unknown) {
    console.error("Student snapshot error:", e);
    res.status(500).json({ error: "Failed to load student snapshot" });
  }
});

export default router;
