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

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/** Returns a clinically readable unit string for a measurement type. */
function measurementUnit(measurementType: string | null): string {
  switch (measurementType) {
    case "frequency": return "times per session";
    case "duration":  return "seconds per session";
    case "latency":   return "seconds (latency)";
    case "interval":  return "% of intervals";
    case "rate":      return "per minute";
    default:          return "per session";
  }
}

/** Returns a brief readable label for a measurement type. */
function measurementLabel(measurementType: string | null): string {
  switch (measurementType) {
    case "frequency": return "frequency";
    case "duration":  return "duration (seconds)";
    case "latency":   return "response latency";
    case "interval":  return "interval recording";
    case "rate":      return "rate";
    default:          return "observation";
  }
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, v) => a + v, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Computes a richer behavior narrative for an IEP goal linked to a behavior target.
 * All statements are grounded in observed data — no clinical conclusions are invented.
 */
function buildBehaviorNarrative(opts: {
  studentFirstName: string;
  targetName: string;
  measurementType: string | null;
  targetDirection: string | null;
  baseVal: number | null;
  goalVal: number | null;
  avgVal: number;
  firstAvg: number | null;
  lastAvg: number | null;
  sessionCount: number;
  dataPoints: number;
  sd: number;
  progressRating: string;
}): string {
  const {
    studentFirstName: name, targetName, measurementType, targetDirection,
    baseVal, goalVal, avgVal, firstAvg, lastAvg, sessionCount, dataPoints,
    sd, progressRating,
  } = opts;

  const unit = measurementUnit(measurementType);
  const label = measurementLabel(measurementType);
  const dirWord = targetDirection === "increase" ? "increase" : "decrease";

  const basePhrase = baseVal !== null
    ? ` (baseline: ${baseVal} ${unit})`
    : "";

  const goalPhrase = goalVal !== null
    ? ` toward a goal of ${goalVal} ${unit}`
    : "";

  const sessionPhrase = sessionCount > 0
    ? ` across ${sessionCount} data collection session${sessionCount === 1 ? "" : "s"}`
    : "";

  const trendPhrase =
    firstAvg !== null && lastAvg !== null && Math.abs(lastAvg - firstAvg) > 0.3
      ? targetDirection === "decrease"
        ? lastAvg < firstAvg
          ? ` Over the reporting period, this behavior has trended downward (${firstAvg.toFixed(1)} → ${lastAvg.toFixed(1)} ${unit}).`
          : ` Over the reporting period, this behavior has trended upward (${firstAvg.toFixed(1)} → ${lastAvg.toFixed(1)} ${unit}).`
        : lastAvg > firstAvg
          ? ` Over the reporting period, this behavior has trended upward (${firstAvg.toFixed(1)} → ${lastAvg.toFixed(1)} ${unit}).`
          : ` Over the reporting period, this behavior has trended downward (${firstAvg.toFixed(1)} → ${lastAvg.toFixed(1)} ${unit}).`
      : "";

  const variabilityNote =
    dataPoints >= 4 && sd > avgVal * 0.5 && avgVal > 0
      ? " Note: Notable session-to-session variability was observed; data should be interpreted with caution."
      : "";

  let opening = `Regarding "${targetName}" (measured by ${label}): `;

  switch (progressRating) {
    case "mastered":
      opening += `${name} has met the behavior goal. Current average is ${avgVal} ${unit}${goalPhrase}${basePhrase}${sessionPhrase}.`;
      break;
    case "sufficient_progress":
      opening += `${name} is making sufficient progress toward a ${dirWord} in this behavior. Current average is ${avgVal} ${unit}${basePhrase}${goalPhrase}${sessionPhrase}.`;
      break;
    case "some_progress":
      opening += `${name} is making some progress. Current average is ${avgVal} ${unit}${basePhrase}${goalPhrase}${sessionPhrase}.`;
      break;
    case "insufficient_progress":
      opening += `${name} is making insufficient progress on this behavior goal. Current average is ${avgVal} ${unit}${basePhrase}${goalPhrase}${sessionPhrase}. Program modifications are recommended.`;
      break;
    default:
      opening += `${name} has a current average of ${avgVal} ${unit}${sessionPhrase}.`;
  }

  return opening + trendPhrase + variabilityNote;
}

/* ── Main export ──────────────────────────────────────────────────────────── */

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
      let behaviorTargetName: string | null = null;
      let behaviorMeasurementType: string | null = null;
      let behaviorTargetDirection: string | null = null;
      let behaviorVariability: number | null = null;
      let behaviorSessionCount: number | null = null;

      if (goal.programTargetId && sessionIds.length > 0) {
        /* ─── Skill-acquisition goal (program target) ─── */
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
        /* ─── Behavior goal (behavior target) ─── */
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

          // Surface target metadata in the entry
          behaviorTargetName = target?.name ?? null;
          behaviorMeasurementType = target?.measurementType ?? null;
          behaviorTargetDirection = target?.targetDirection ?? null;

          const values = behData.map(d => parseFloat(d.value));
          const lastPoints = behData.slice(-3);
          const avgVal =
            Math.round((lastPoints.reduce((s, d) => s + parseFloat(d.value), 0) / lastPoints.length) * 10) / 10;
          behaviorValue = avgVal;
          const goalVal = target?.goalValue ? parseFloat(target.goalValue) : null;
          const baseVal = target?.baselineValue ? parseFloat(target.baselineValue) : null;
          behaviorGoal = goalVal;

          // Compute variability
          const sd = Math.round(stdDev(values) * 10) / 10;
          behaviorVariability = behData.length >= 4 ? sd : null;

          // Distinct session count
          const uniqueSessions = new Set(behData.map(d => d.sessionDate));
          behaviorSessionCount = uniqueSessions.size;

          // First-half / second-half averages for trend
          let firstHalfAvg: number | null = null;
          let secondHalfAvg: number | null = null;
          if (behData.length >= 4) {
            const half = Math.floor(behData.length / 2);
            const fh = values.slice(0, half);
            const sh = values.slice(half);
            firstHalfAvg = Math.round((fh.reduce((a, v) => a + v, 0) / fh.length) * 10) / 10;
            secondHalfAvg = Math.round((sh.reduce((a, v) => a + v, 0) / sh.length) * 10) / 10;
            const isDecreaseGoal = target?.targetDirection === "decrease";
            if (isDecreaseGoal) {
              if (secondHalfAvg < firstHalfAvg - 0.5) trendDirection = "improving";
              else if (secondHalfAvg > firstHalfAvg + 0.5) trendDirection = "declining";
            } else {
              if (secondHalfAvg > firstHalfAvg + 0.5) trendDirection = "improving";
              else if (secondHalfAvg < firstHalfAvg - 0.5) trendDirection = "declining";
            }
          }

          const unit = measurementUnit(target?.measurementType ?? null);
          currentPerformance = target?.name
            ? `"${target.name}": average of ${avgVal} ${unit} (last 3 sessions)`
            : `Average of ${avgVal} ${unit} (last 3 sessions)`;

          const goalMet =
            goalVal !== null &&
            ((target?.targetDirection === "decrease" && avgVal <= goalVal) ||
              (target?.targetDirection === "increase" && avgVal >= goalVal));

          if (goalMet) {
            progressRating = "mastered";
          } else if (baseVal !== null && goalVal !== null) {
            const totalRange = Math.abs(goalVal - baseVal);
            const progress = Math.abs(avgVal - baseVal);
            const pctToGoal = totalRange > 0 ? progress / totalRange : 0;
            if (pctToGoal >= 0.75) progressRating = "sufficient_progress";
            else if (pctToGoal >= 0.25) progressRating = "some_progress";
            else progressRating = "insufficient_progress";
          } else {
            progressRating = "some_progress";
          }

          narrative = buildBehaviorNarrative({
            studentFirstName,
            targetName: target?.name ?? "this behavior",
            measurementType: target?.measurementType ?? null,
            targetDirection: target?.targetDirection ?? null,
            baseVal,
            goalVal,
            avgVal,
            firstAvg: firstHalfAvg,
            lastAvg: secondHalfAvg,
            sessionCount: uniqueSessions.size,
            dataPoints,
            sd,
            progressRating,
          });
        } else {
          narrative = `No behavior data was collected for this goal during the reporting period.`;
        }

      } else {
        narrative = `This goal was not addressed during the reporting period or has no linked data target.`;
      }

      const progressCode = toMaProgressCode(progressRating, trendDirection, dataPoints);

      const entry: GoalProgressEntry = {
        iepGoalId: goal.id,
        goalArea: goal.goalArea ?? "",
        goalNumber: goal.goalNumber ?? 1,
        annualGoal: goal.annualGoal ?? "",
        baseline: goal.baseline ?? null,
        targetCriterion: goal.targetCriterion ?? null,
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
        behaviorTargetName,
        behaviorMeasurementType,
        behaviorTargetDirection,
        behaviorVariability,
        behaviorSessionCount,
        benchmarks: goal.benchmarks ?? null,
        measurementMethod: goal.measurementMethod ?? null,
        serviceArea: goal.serviceArea ?? null,
      };
      return entry;
    }),
  );

  return entries;
}
