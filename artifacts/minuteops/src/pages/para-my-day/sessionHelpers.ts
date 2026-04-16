import type {
  BehaviorTally, GoalDataEntry, StudentTargets, TrialResult,
} from "./types";

export function buildGoalData(
  studentTargets: StudentTargets | null,
  trials: TrialResult[],
  tallies: BehaviorTally[],
): GoalDataEntry[] {
  const goalData: GoalDataEntry[] = [];
  if (!studentTargets) return goalData;

  for (const prog of studentTargets.programs) {
    const progTrials = trials.filter(t => t.programTargetId === prog.id);
    if (progTrials.length === 0) continue;

    const linkedGoal = studentTargets.goals.find(g => g.programTargetId === prog.id);
    if (linkedGoal) {
      const correct = progTrials.filter(t => t.correct).length;
      goalData.push({
        iepGoalId: linkedGoal.id,
        programTargetId: prog.id,
        programData: {
          trialsCorrect: correct,
          trialsTotal: progTrials.length,
          promptLevelUsed: progTrials[progTrials.length - 1]?.promptLevel || null,
        },
      });
    }
  }

  for (const beh of studentTargets.behaviors) {
    const tally = tallies.find(t => t.behaviorTargetId === beh.id);
    if (!tally || tally.count === 0) continue;

    const linkedGoal = studentTargets.goals.find(g => g.behaviorTargetId === beh.id);
    if (linkedGoal) {
      goalData.push({
        iepGoalId: linkedGoal.id,
        behaviorTargetId: beh.id,
        behaviorData: { value: tally.count },
      });
    }
  }

  return goalData;
}
