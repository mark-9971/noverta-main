import { customFetch } from "./custom-fetch";

export interface ProgramStepInfo {
  stepNumber: number;
  name: string;
  sdInstruction: string | null;
  mastered: boolean;
  active: boolean;
}

export interface StepTrendPoint {
  sessionDate: string;
  stepNumber: number | null;
  trialsCorrect: number;
  trialsTotal: number;
  prompted: number | null;
  percentCorrect: string | null;
  promptLevelUsed: string | null;
}

export interface ProgramTargetStepTrends {
  steps: ProgramStepInfo[];
  trends: StepTrendPoint[];
}

export const getProgramTargetStepTrends = (
  targetId: number,
): Promise<ProgramTargetStepTrends> =>
  customFetch<ProgramTargetStepTrends>(
    `/api/program-targets/${targetId}/step-trends`,
    { method: "GET" },
  );
