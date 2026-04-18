/**
 * Shared goal-progress computation logic.
 * Used by both the progress-report generate route and the admin backfill route.
 */

import { db } from "@workspace/db";
import {
  iepGoalsTable,
  programTargetsTable,
  behaviorTargetsTable,
  programDataTable,
  behaviorDataTable,
  dataSessionsTable,
} from "@workspace/db";
import type { GoalProgressEntry } from "@workspace/db";
import { eq, and, gte, lte, asc } from "drizzle-orm";
import { toMaProgressCode, formatPromptLevel, promptLevelPhrase } from "../routes/iep/utils";

export async function computeGoalProgressEntries(
  studentId: number,
  studentFirstName: string,
  periodStart: string,
  periodEnd: string,
): Promise<GoalProgressEntry[]> {
  const goals = await db
    .select()
    .from(iepGoalsTable)
    .where(and(eq(iepGoalsTable.studentId, studentId), eq(iepGoalsTable.active, true)))
    .orderBy(asc(iepGoalsTable.goalArea), asc(iepGoalsTable.goalNumber));

  if (goals.length === 0) return [];

  const dataSessions = await db
    .select()
    .from(dataSessionsTable)
    .where(
      and(
        eq(dataSessionsTable.studentId, studentId),
        gte(dataSessionsTable.sessionDate, periodStart),
        lte(dataSessionsTable.sessionDate, periodEnd),
      ),
    );
  const sessionIds = dataSessions.map((s) => s.id);

  const entries = await Promise.all(
    goals.map(async (goal): Promise<GoalProgressEntry> => {
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
        const progData = await db
          .select({
            trialsCorrect: programDataTable.trialsCorrect,
            trialsTotal: programDataTable.trialsTotal,
            percentCorrect: programDataTable.percentCorrect,
            promptLevelUsed: programDataTable.promptLevelUsed,
            sessionDate: dataSessionsTable.sessionDate,
          })
          .from(programDataTable)
          .innerJoin(dataSessionsTable, eq(programDataTable.dataSessionId, dataSessionsTable.id))
          .where(
            and(
              eq(programDataTable.programTargetId, goal.programTargetId),
              gte(dataSessionsTable.sessionDate, periodStart),
              lte(dataSessionsTable.sessionDate, periodEnd),
            ),
          )
          .orderBy(asc(dataSessionsTable.sessionDate));

        dataPoints = progData.length;

        if (progData.length > 0) {
          const lastPoints = progData.slice(-3);
          const avgPct = Math.round(
            lastPoints.reduce((s, d) => s + parseFloat(d.percentCorrect ?? "0"), 0) / lastPoints.length,
          );
          percentCorrect = avgPct;
          const lastPrompt = progData[progData.length - 1].promptLevelUsed;
          promptLevel = lastPrompt;

          const [target] = await db
            .select()
            .from(programTargetsTable)
            .where(eq(programTargetsTable.id, goal.programTargetId!));
          const masteryPct = target?.masteryCriterionPercent ?? 80;

          const plPhrase = promptLevelPhrase(lastPrompt);
          currentPerformance = lastPrompt
            ? `${avgPct}% accuracy (last 3 sessions) at ${formatPromptLevel(lastPrompt)} prompt level`
            : `${avgPct}% accuracy (last 3 sessions)`;

          if (avgPct >= masteryPct) {
            progressRating = "mastered";
            narrative = `${studentFirstName} has met mastery criteria of ${masteryPct}% with an average of ${avgPct}% across the last ${lastPoints.length} sessions${plPhrase}. This goal has been mastered.`;
          } else if (avgPct >= masteryPct * 0.75) {
            progressRating = "sufficient_progress";
            narrative = `${studentFirstName} is making sufficient progress toward this goal with ${avgPct}% accuracy${plPhrase}. The student is on track to meet this goal within the IEP period.`;
          } else if (avgPct >= masteryPct * 0.5) {
            progressRating = "some_progress";
            narrative = `${studentFirstName} is making some progress with ${avgPct}% accuracy${plPhrase}. Additional support or program modifications may be needed to meet this goal.`;
          } else {
            progressRating = "insufficient_progress";
            narrative = `${studentFirstName} is making insufficient progress with ${avgPct}% accuracy${plPhrase}. Program modifications and/or additional supports are recommended.`;
          }

          if (progData.length >= 4) {
            const firstHalf = progData.slice(0, Math.floor(progData.length / 2));
            const secondHalf = progData.slice(Math.floor(progData.length / 2));
            const firstAvg =
              firstHalf.reduce((s, d) => s + parseFloat(d.percentCorrect ?? "0"), 0) / firstHalf.length;
            const secondAvg =
              secondHalf.reduce((s, d) => s + parseFloat(d.percentCorrect ?? "0"), 0) / secondHalf.length;
            if (secondAvg > firstAvg + 5) trendDirection = "improving";
            else if (secondAvg < firstAvg - 5) trendDirection = "declining";
          }
        } else {
          narrative = `No program data was collected for this goal during the reporting period.`;
        }
      } else if (goal.behaviorTargetId && sessionIds.length > 0) {
        const behData = await db
          .select({
            value: behaviorDataTable.value,
            sessionDate: dataSessionsTable.sessionDate,
          })
          .from(behaviorDataTable)
          .innerJoin(dataSessionsTable, eq(behaviorDataTable.dataSessionId, dataSessionsTable.id))
          .where(
            and(
              eq(behaviorDataTable.behaviorTargetId, goal.behaviorTargetId),
              gte(dataSessionsTable.sessionDate, periodStart),
              lte(dataSessionsTable.sessionDate, periodEnd),
            ),
          )
          .orderBy(asc(dataSessionsTable.sessionDate));

        dataPoints = behData.length;

        if (behData.length > 0) {
          const [target] = await db
            .select()
            .from(behaviorTargetsTable)
            .where(eq(behaviorTargetsTable.id, goal.behaviorTargetId!));
          const lastPoints = behData.slice(-3);
          const avgVal =
            Math.round((lastPoints.reduce((s, d) => s + parseFloat(d.value), 0) / lastPoints.length) * 10) / 10;
          behaviorValue = avgVal;
          behaviorGoal = target?.goalValue ? parseFloat(target.goalValue) : null;
          const baseVal = target?.baselineValue ? parseFloat(target.baselineValue) : null;

          currentPerformance = `Average of ${avgVal} per session (last 3 sessions)`;

          const goalMet =
            behaviorGoal !== null &&
            ((target?.targetDirection === "decrease" && avgVal <= behaviorGoal) ||
              (target?.targetDirection === "increase" && avgVal >= behaviorGoal));

          if (goalMet) {
            progressRating = "mastered";
            narrative = `${studentFirstName} has met the behavior goal. Current average is ${avgVal} per session, meeting the target of ${behaviorGoal}.`;
          } else if (baseVal !== null && behaviorGoal !== null) {
            const totalRange = Math.abs(behaviorGoal - baseVal);
            const progress = Math.abs(avgVal - baseVal);
            const pctToGoal = totalRange > 0 ? progress / totalRange : 0;
            if (pctToGoal >= 0.75) {
              progressRating = "sufficient_progress";
              narrative = `${studentFirstName} is making sufficient progress. The behavior has ${target?.targetDirection === "decrease" ? "decreased" : "increased"} from a baseline of ${baseVal} to a current average of ${avgVal} (goal: ${behaviorGoal}).`;
            } else if (pctToGoal >= 0.25) {
              progressRating = "some_progress";
              narrative = `${studentFirstName} is making some progress. Current average is ${avgVal} (baseline: ${baseVal}, goal: ${behaviorGoal}). ${target?.targetDirection === "decrease" ? "The behavior has decreased but remains above target." : "The behavior has increased but remains below target."}`;
            } else {
              progressRating = "insufficient_progress";
              narrative = `${studentFirstName} is making insufficient progress on this behavior goal. Current average is ${avgVal} (baseline: ${baseVal}, goal: ${behaviorGoal}). Program modifications are recommended.`;
            }
          } else {
            progressRating = "some_progress";
            narrative = `${studentFirstName} has a current average of ${avgVal} per session across ${behData.length} data points.`;
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
        goalArea: goal.goalArea || "",
        goalNumber: goal.goalNumber || 1,
        annualGoal: goal.annualGoal || "",
        baseline: goal.baseline || "",
        currentPerformance,
        progressRating,
        progressCode,
        dataPoints,
        trendDirection,
        narrative,
        promptLevel,
        percentCorrect,
        behaviorValue,
        behaviorGoal,
      } as GoalProgressEntry;
    }),
  );

  return entries;
}
