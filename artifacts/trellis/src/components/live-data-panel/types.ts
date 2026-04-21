export interface IepGoal {
  id: number;
  goalArea: string;
  annualGoal: string;
  goalNumber: number | null;
  status: string;
  programTargetId: number | null;
  behaviorTargetId: number | null;
  linkedTarget: {
    type: "program" | "behavior";
    name: string;
    measurementType?: string;
    baselineValue?: number | null;
    goalValue?: number | null;
    currentPromptLevel?: string | null;
    masteryCriterionPercent?: number | null;
    intervalMode?: string | null;
    intervalLengthSeconds?: number | null;
  } | null;
}

export interface CollectedBehaviorData {
  value: number;
  intervalCount: number | null;
  intervalsWith: number | null;
  intervalScores?: boolean[];
  hourBlock: string | null;
  notes: string;
  eventTimestamps: number[];
}

export interface CollectedProgramData {
  trialsCorrect: number;
  trialsTotal: number;
  promptLevelUsed: string;
  independenceLevel: string;
  stepNumber: number | null;
  notes: string;
  trialHistory: ("correct" | "incorrect")[];
}

export interface CollectedGoalEntry {
  iepGoalId: number;
  goalArea: string;
  annualGoal: string;
  linkedTarget: IepGoal["linkedTarget"];
  behaviorTargetId: number | null;
  programTargetId: number | null;
  behaviorData: CollectedBehaviorData | null;
  programData: CollectedProgramData | null;
  notes: string;
}

export interface LiveDataState {
  selectedGoalIds: number[];
  collectedData: Map<number, CollectedGoalEntry>;
}

export function createDefaultBehaviorData(): CollectedBehaviorData {
  return { value: 0, intervalCount: null, intervalsWith: null, hourBlock: null, notes: "", eventTimestamps: [] };
}

export function createDefaultProgramData(): CollectedProgramData {
  return { trialsCorrect: 0, trialsTotal: 0, promptLevelUsed: "", independenceLevel: "", stepNumber: null, notes: "", trialHistory: [] };
}

export function createCollectedEntry(goal: IepGoal): CollectedGoalEntry {
  return {
    iepGoalId: goal.id,
    goalArea: goal.goalArea,
    annualGoal: goal.annualGoal,
    linkedTarget: goal.linkedTarget,
    behaviorTargetId: goal.behaviorTargetId,
    programTargetId: goal.programTargetId,
    behaviorData: goal.linkedTarget?.type === "behavior" ? createDefaultBehaviorData() : null,
    programData: goal.linkedTarget?.type === "program" ? createDefaultProgramData() : null,
    notes: "",
  };
}
