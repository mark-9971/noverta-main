export const INITIAL_FORM = {
  studentId: "",
  serviceRequirementId: "",
  staffId: "",
  sessionDate: new Date().toISOString().split("T")[0],
  startTime: "09:00",
  endTime: "10:00",
  durationMinutes: "60",
  status: "completed",
  deliveryMode: "in_person",
  location: "",
  isMakeup: false,
  missedReasonId: "",
  notes: "",
};

export type SessionForm = typeof INITIAL_FORM;

export type EditForm = {
  durationMinutes: string;
  status: string;
  notes: string;
  location: string;
  missedReasonId: string;
};

export type GoalFormEntry = {
  iepGoalId: number;
  selected: boolean;
  notes: string;
  behaviorTargetId?: number | null;
  behaviorData?: {
    value: string;
    intervalCount: string;
    intervalsWith: string;
    hourBlock: string;
    notes: string;
  };
  programTargetId?: number | null;
  programData?: {
    trialsCorrect: string;
    trialsTotal: string;
    prompted: string;
    stepNumber: string;
    independenceLevel: string;
    promptLevelUsed: string;
    notes: string;
  };
  goalArea: string;
  annualGoal: string;
  linkedTarget?: any;
};

export type MarkMissedTarget = { id: number; studentName: string; sessionDate: string } | null;
export type LogMakeupFor = { id: number; studentId: number; studentName: string; serviceRequirementId: number | null; sessionDate: string } | null;
