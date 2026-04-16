import type { GoalFormEntry } from "./types";

export function buildGoalData(entries: GoalFormEntry[]) {
  return entries.filter(g => g.selected).map(g => {
    const entry: any = { iepGoalId: g.iepGoalId, notes: g.notes || null };
    if (g.behaviorData && g.behaviorTargetId) {
      entry.behaviorTargetId = g.behaviorTargetId;
      entry.behaviorData = {
        value: Number(g.behaviorData.value) || 0,
        intervalCount: g.behaviorData.intervalCount ? Number(g.behaviorData.intervalCount) : null,
        intervalsWith: g.behaviorData.intervalsWith ? Number(g.behaviorData.intervalsWith) : null,
        hourBlock: g.behaviorData.hourBlock || null,
        notes: g.behaviorData.notes || null,
      };
    }
    if (g.programData && g.programTargetId) {
      entry.programTargetId = g.programTargetId;
      entry.programData = {
        trialsCorrect: Number(g.programData.trialsCorrect) || 0,
        trialsTotal: Number(g.programData.trialsTotal) || 0,
        prompted: g.programData.prompted ? Number(g.programData.prompted) : null,
        stepNumber: g.programData.stepNumber ? Number(g.programData.stepNumber) : null,
        independenceLevel: g.programData.independenceLevel || null,
        promptLevelUsed: g.programData.promptLevelUsed || null,
        notes: g.programData.notes || null,
      };
    }
    return entry;
  });
}

export function mapGoalToEntry(g: any, existing?: any): GoalFormEntry {
  const bData = existing?.behaviorData;
  const pData = existing?.programData;
  return {
    iepGoalId: g.id,
    selected: !!existing,
    notes: existing?.notes || "",
    behaviorTargetId: g.behaviorTargetId || null,
    behaviorData: g.linkedTarget?.type === "behavior" ? {
      value: bData?.value ?? "",
      intervalCount: bData?.intervalCount ?? "",
      intervalsWith: bData?.intervalsWith ?? "",
      hourBlock: bData?.hourBlock ?? "",
      notes: bData?.notes ?? "",
    } : undefined,
    programTargetId: g.programTargetId || null,
    programData: g.linkedTarget?.type === "program" ? {
      trialsCorrect: pData?.trialsCorrect ?? "",
      trialsTotal: pData?.trialsTotal ?? "10",
      prompted: pData?.prompted ?? "0",
      stepNumber: pData?.stepNumber ?? "",
      independenceLevel: pData?.independenceLevel ?? "",
      promptLevelUsed: pData?.promptLevelUsed || g.linkedTarget?.currentPromptLevel || "",
      notes: pData?.notes ?? "",
    } : undefined,
    goalArea: g.goalArea,
    annualGoal: g.annualGoal,
    linkedTarget: g.linkedTarget,
  };
}

export function mapGoalsFresh(goals: any[]): GoalFormEntry[] {
  return goals.map(g => mapGoalToEntry(g));
}

export function mapGoalsWithExisting(goals: any[], linked: any[]): GoalFormEntry[] {
  const linkedMap = new Map<number, any>();
  for (const lg of linked) linkedMap.set(lg.id, lg);
  return goals.map(g => mapGoalToEntry(g, linkedMap.get(g.id)));
}
