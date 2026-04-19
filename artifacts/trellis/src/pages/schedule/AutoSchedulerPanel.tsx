import { useState } from "react";
import { Sparkles, X, Check, SkipForward, Loader2, CalendarX, AlertCircle, CheckCheck, ChevronDown, ChevronUp } from "lucide-react";
import { createScheduleBlock } from "@workspace/api-client-react";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";

interface ProposedBlock {
  id: number;
  staffId: number;
  staffName: string;
  studentId: number | null;
  studentName: string | null;
  serviceTypeId: number | null;
  serviceTypeName: string | null;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  blockType: string;
  notes: string | null;
  weekOf: string;
}

type SuggestionState = "pending" | "accepted" | "skipped";

interface Props {
  weekOf: string;
  onClose: () => void;
  onBlocksCreated: () => void;
}

const DAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri",
};

function fmt12(time: string): string {
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${ampm}`;
}

export function AutoSchedulerPanel({ weekOf, onClose, onBlocksCreated }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "results" | "error">("idle");
  const [suggestions, setSuggestions] = useState<ProposedBlock[]>([]);
  const [states, setStates] = useState<Record<number, SuggestionState>>({});
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [acceptingAll, setAcceptingAll] = useState(false);
  const [expanded, setExpanded] = useState(true);

  async function runScheduler() {
    setStatus("loading");
    setErrorMsg("");
    setSuggestions([]);
    setStates({});
    try {
      const res = await authFetch("/api/scheduler/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekOf }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }
      const data = await res.json();
      const blocks: ProposedBlock[] = data.proposedBlocks ?? [];
      setSuggestions(blocks);
      const initialStates: Record<number, SuggestionState> = {};
      blocks.forEach(b => { initialStates[b.id] = "pending"; });
      setStates(initialStates);
      setStatus("results");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Unexpected error");
      setStatus("error");
    }
  }

  async function acceptSuggestion(block: ProposedBlock) {
    setStates(s => ({ ...s, [block.id]: "accepted" }));
    try {
      await createScheduleBlock({
        staffId: block.staffId,
        studentId: block.studentId ?? null,
        serviceTypeId: block.serviceTypeId ?? null,
        dayOfWeek: block.dayOfWeek,
        startTime: block.startTime,
        endTime: block.endTime,
        location: null,
        blockType: block.blockType ?? "service",
        notes: block.notes ?? null,
        isRecurring: false,
        rotationDay: null,
      });
      toast.success(`Session accepted: ${block.studentName ?? "Block"} on ${DAY_LABELS[block.dayOfWeek]} at ${fmt12(block.startTime)}`);
      onBlocksCreated();
    } catch {
      toast.error("Failed to create block. Please try again.");
      setStates(s => ({ ...s, [block.id]: "pending" }));
    }
  }

  function skipSuggestion(blockId: number) {
    setStates(s => ({ ...s, [blockId]: "skipped" }));
  }

  async function acceptAll() {
    const pending = suggestions.filter(b => states[b.id] === "pending");
    if (!pending.length) return;
    setAcceptingAll(true);
    for (const block of pending) {
      await acceptSuggestion(block);
    }
    setAcceptingAll(false);
  }

  const pendingCount = suggestions.filter(b => states[b.id] === "pending").length;
  const acceptedCount = suggestions.filter(b => states[b.id] === "accepted").length;

  return (
    <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-emerald-100 bg-emerald-50/80">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-600" />
          <span className="text-[13px] font-semibold text-emerald-800">Auto-Scheduler</span>
          {status === "results" && (
            <span className="text-[11px] font-medium text-emerald-600 bg-white border border-emerald-200 px-2 py-0.5 rounded-full">
              {suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {status === "results" && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-600 transition-colors"
              title={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-500 transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {/* Idle state */}
        {status === "idle" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-gray-800">Generate schedule suggestions</p>
              <p className="text-[12px] text-gray-500 mt-0.5 max-w-[320px]">
                The auto-scheduler analyzes active service requirements and proposes session blocks for the selected week.
              </p>
            </div>
            <button
              onClick={runScheduler}
              className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" /> Run auto-scheduler
            </button>
          </div>
        )}

        {/* Loading state */}
        {status === "loading" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            <p className="text-[13px] text-gray-600 font-medium">Analyzing requirements and building schedule…</p>
          </div>
        )}

        {/* Error state */}
        {status === "error" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-red-700">Scheduler error</p>
              <p className="text-[12px] text-red-500 mt-0.5">{errorMsg}</p>
            </div>
            <button
              onClick={runScheduler}
              className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {/* Results */}
        {status === "results" && expanded && (
          <div className="space-y-3">
            {suggestions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <CalendarX className="w-8 h-8 text-gray-300" />
                <p className="text-[13px] font-semibold text-gray-500">No suggestions generated</p>
                <p className="text-[12px] text-gray-400 max-w-[280px]">
                  This may mean all service requirements already have sessions scheduled, or no requirements have providers assigned.
                </p>
                <button
                  onClick={runScheduler}
                  className="text-[12px] text-emerald-600 hover:underline mt-1"
                >
                  Run again
                </button>
              </div>
            ) : (
              <>
                {/* Bulk actions */}
                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-gray-500">
                    {acceptedCount > 0 && (
                      <span className="text-emerald-600 font-medium">{acceptedCount} accepted · </span>
                    )}
                    {pendingCount} pending
                  </p>
                  <div className="flex items-center gap-2">
                    {pendingCount > 0 && (
                      <button
                        onClick={acceptAll}
                        disabled={acceptingAll}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg transition-colors"
                      >
                        {acceptingAll ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <CheckCheck className="w-3.5 h-3.5" />
                        )}
                        Accept all
                      </button>
                    )}
                    <button
                      onClick={runScheduler}
                      className="text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Re-run
                    </button>
                  </div>
                </div>

                {/* Suggestion cards */}
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {suggestions.map(block => {
                    const state = states[block.id] ?? "pending";
                    return (
                      <div
                        key={block.id}
                        className={`rounded-lg border px-3 py-2.5 transition-all ${
                          state === "accepted"
                            ? "bg-emerald-50 border-emerald-200 opacity-70"
                            : state === "skipped"
                            ? "bg-gray-50 border-gray-200 opacity-50"
                            : "bg-white border-gray-200 hover:border-emerald-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[13px] font-semibold text-gray-800 truncate">
                                {block.studentName ?? "No student"}
                              </span>
                              {block.serviceTypeName && (
                                <span className="text-[10px] font-medium bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full shrink-0">
                                  {block.serviceTypeName}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                              <span className="text-[12px] text-gray-500">
                                {DAY_LABELS[block.dayOfWeek]} · {fmt12(block.startTime)}–{fmt12(block.endTime)}
                              </span>
                              <span className="text-[11px] text-gray-400">
                                with {block.staffName}
                              </span>
                            </div>
                          </div>

                          {state === "accepted" && (
                            <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 shrink-0 mt-0.5">
                              <Check className="w-3 h-3" /> Accepted
                            </span>
                          )}
                          {state === "skipped" && (
                            <span className="text-[11px] font-medium text-gray-400 shrink-0 mt-0.5">Skipped</span>
                          )}
                          {state === "pending" && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => acceptSuggestion(block)}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors"
                              >
                                <Check className="w-3 h-3" /> Accept
                              </button>
                              <button
                                onClick={() => skipSuggestion(block.id)}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-gray-500 border border-gray-200 hover:bg-gray-50 rounded-md transition-colors"
                              >
                                <SkipForward className="w-3 h-3" /> Skip
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Collapsed results summary */}
        {status === "results" && !expanded && (
          <p className="text-[12px] text-gray-500 py-1">
            {acceptedCount} accepted · {pendingCount} pending · {suggestions.filter(b => states[b.id] === "skipped").length} skipped
          </p>
        )}
      </div>
    </div>
  );
}
