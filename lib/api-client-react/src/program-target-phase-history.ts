import { customFetch } from "./custom-fetch";

export interface ProgramTargetPhaseHistoryItem {
  id: number;
  programTargetId: number;
  phase: string;
  previousPhase: string | null;
  startedAt: string;
  endedAt: string | null;
  reason: string | null;
  changedByClerkId: string | null;
  changedByStaffId: number | null;
}

export const listProgramTargetPhaseHistory = (
  programTargetId: number,
): Promise<ProgramTargetPhaseHistoryItem[]> =>
  customFetch<ProgramTargetPhaseHistoryItem[]>(
    `/api/program-targets/${programTargetId}/phase-history`,
    { method: "GET" },
  );
