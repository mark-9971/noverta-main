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

export async function listProgramTargetPhaseHistory(
  programTargetId: number,
): Promise<ProgramTargetPhaseHistoryItem[]> {
  const res = await customFetch(
    `/api/program-targets/${programTargetId}/phase-history`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(`Failed to fetch phase history: ${res.status}`);
  return res.json();
}
