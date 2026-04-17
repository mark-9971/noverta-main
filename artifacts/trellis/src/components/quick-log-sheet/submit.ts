import { authFetch } from "@/lib/auth-fetch";
import type { CollectedGoalEntry } from "@/components/live-data-panel/types";

export interface SubmitArgs {
  studentId: number;
  staffId: number | null;
  outcome: "completed" | "missed";
  serviceTypeId: number | null;
  durationMinutes: number;
  missedReasonId: number | null;
  missedReasonLabel: string | null;
  makeupNeeded: boolean;
  note: string;
  sessionDate: string;
  prefillStartTime?: string;
  prefillEndTime?: string;
  collectedGoalData?: CollectedGoalEntry[];
}

export async function submitSession(args: SubmitArgs): Promise<void> {
  const now = new Date();
  const endTime = args.prefillEndTime ?? now.toTimeString().slice(0, 5);
  const startMs = now.getTime() - args.durationMinutes * 60 * 1000;
  const startTime = args.prefillStartTime ?? new Date(startMs).toTimeString().slice(0, 5);

  const parts: string[] = [];
  if (args.outcome === "missed" && !args.missedReasonId && args.missedReasonLabel) {
    parts.push(`Missed reason: ${args.missedReasonLabel}`);
  }
  if (args.note.trim()) parts.push(args.note.trim());

  let goalData: any[] | undefined;
  if (args.collectedGoalData && args.collectedGoalData.length > 0) {
    goalData = args.collectedGoalData.map(entry => {
      const gd: any = { iepGoalId: entry.iepGoalId, notes: entry.notes || null };
      if (entry.behaviorData && entry.behaviorTargetId) {
        gd.behaviorTargetId = entry.behaviorTargetId;
        gd.behaviorData = {
          value: Number(entry.behaviorData.value ?? 0),
          intervalCount: entry.behaviorData.intervalCount != null ? Number(entry.behaviorData.intervalCount) : null,
          intervalsWith: entry.behaviorData.intervalsWith != null ? Number(entry.behaviorData.intervalsWith) : null,
          hourBlock: entry.behaviorData.hourBlock || null,
          notes: entry.behaviorData.notes || null,
        };
      }
      if (entry.programData && entry.programTargetId) {
        gd.programTargetId = entry.programTargetId;
        gd.programData = {
          trialsCorrect: Number(entry.programData.trialsCorrect ?? 0),
          trialsTotal: Number(entry.programData.trialsTotal ?? 0),
          prompted: 0,
          stepNumber: entry.programData.stepNumber != null ? Number(entry.programData.stepNumber) : null,
          independenceLevel: entry.programData.independenceLevel || null,
          promptLevelUsed: entry.programData.promptLevelUsed || null,
          notes: entry.programData.notes || null,
        };
      }
      return gd;
    });
  }

  const body: Record<string, unknown> = {
    studentId: args.studentId,
    staffId: args.staffId,
    sessionDate: args.sessionDate,
    startTime,
    endTime,
    durationMinutes: args.durationMinutes,
    status: args.outcome,
    serviceTypeId: args.serviceTypeId ?? null,
    missedReasonId: args.outcome === "missed" ? (args.missedReasonId ?? null) : null,
    isMakeup: args.outcome === "missed" ? args.makeupNeeded : false,
    notes: parts.length > 0 ? parts.join(" — ") : null,
    location: null,
  };

  if (goalData && goalData.length > 0) {
    body.goalData = goalData;
  }

  const res = await authFetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed");
}
