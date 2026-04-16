import { authFetch } from "@/lib/auth-fetch";

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

  const res = await authFetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed");
}
