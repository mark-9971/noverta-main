export interface ScheduleBlock {
  id: number;
  staffId: number;
  studentId: number | null;
  serviceTypeId: number | null;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  location: string | null;
  blockLabel: string | null;
  blockType: string | null;
  notes: string | null;
  studentName: string | null;
  serviceTypeName: string | null;
  sessionLogged: boolean;
}

export interface IepGoal {
  id: number;
  goalArea: string;
  goalNumber: number;
  annualGoal: string;
  baseline: string | null;
  targetCriterion: string | null;
  measurementMethod: string | null;
  serviceArea: string | null;
  status: string;
  programTargetId: number | null;
  behaviorTargetId: number | null;
}

export interface ProgramTarget {
  id: number;
  name: string;
  description: string | null;
  programType: string;
  domain: string | null;
  currentPromptLevel: string | null;
  currentStep: number | null;
  promptHierarchy: string[] | null;
  masteryCriterionPercent: number | null;
  masteryCriterionSessions: number | null;
  tutorInstructions: string | null;
  steps: ProgramStep[];
}

export interface ProgramStep {
  id: number;
  stepNumber: number;
  name: string;
  sdInstruction: string | null;
  targetResponse: string | null;
  materials: string | null;
  promptStrategy: string | null;
  errorCorrection: string | null;
  mastered: boolean;
}

export interface BehaviorTarget {
  id: number;
  name: string;
  description: string | null;
  measurementType: string;
  targetDirection: string;
  baselineValue: string | null;
  goalValue: string | null;
}

export interface ActiveSession {
  blockId: number;
  studentId: number;
  studentName: string;
  serviceTypeId: number | null;
  serviceTypeName: string | null;
  startedAt: Date;
  location: string | null;
  serverSessionId: number | null;
}

export interface TrialResult {
  programTargetId: number;
  correct: boolean;
  promptLevel: string;
}

export interface BehaviorTally {
  behaviorTargetId: number;
  count: number;
}

export interface AssignedBip {
  id: number;
  studentId: number;
  studentName: string;
  targetBehavior: string;
  operationalDefinition: string;
  hypothesizedFunction: string;
  replacementBehaviors: string | null;
  preventionStrategies: string | null;
  teachingStrategies: string | null;
  consequenceStrategies: string | null;
  crisisPlan: string | null;
  dataCollectionMethod: string | null;
  status: string;
  version: number;
  implementationStartDate: string | null;
}

export interface BipSummary {
  id: number;
  targetBehavior: string;
  operationalDefinition: string;
  hypothesizedFunction: string;
  replacementBehaviors: string | null;
  preventionStrategies: string | null;
  teachingStrategies: string | null;
  consequenceStrategies: string | null;
  crisisPlan: string | null;
  dataCollectionMethod: string | null;
  status: string;
  version: number;
  effectiveDate: string | null;
}

export interface GoalDataEntry {
  iepGoalId: number;
  programTargetId?: number;
  programData?: {
    trialsCorrect: number;
    trialsTotal: number;
    promptLevelUsed: string | null;
  };
  behaviorTargetId?: number;
  behaviorData?: { value: number };
}

export interface SessionPayload {
  studentId: number;
  staffId: number | null;
  sessionDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: string;
  location: string | null;
  notes: string | null;
  serviceTypeId: number | null;
  isMakeup: boolean;
  goalData?: GoalDataEntry[];
}

export type ViewMode = "agenda" | "session" | "goals" | "bip" | "my-bips";

export type StudentTargets = {
  goals: IepGoal[];
  programs: ProgramTarget[];
  behaviors: BehaviorTarget[];
  bips: BipSummary[];
};

export type StaffAlert = {
  id: number;
  severity: string;
  message: string;
  suggestedAction: string | null;
  studentName: string | null;
};

export interface QuickLogPrefill {
  studentId?: number;
  studentName?: string;
  serviceTypeId?: number;
  serviceTypeName?: string;
  durationMinutes?: number;
  prefillOutcome?: "completed" | "missed";
}
