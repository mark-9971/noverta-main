import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight, Clock, MapPin, Play, Pencil, XCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import type { ScheduleBlock, QuickLogPrefill } from "./types";
import { formatTime, isCurrentBlock, isUpcoming } from "./constants";

function blockDurationMinutes(block: ScheduleBlock): number | undefined {
  if (!block.startTime || !block.endTime) return undefined;
  const [sh, sm] = block.startTime.split(":").map(Number);
  const [eh, em] = block.endTime.split(":").map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : undefined;
}

export function ScheduleBlockCard({
  block,
  onStart,
  onQuickLog,
}: {
  block: ScheduleBlock;
  onStart: (block: ScheduleBlock) => void;
  onQuickLog: (prefill: QuickLogPrefill, skipToMissed?: boolean) => void;
}) {
  const current = isCurrentBlock(block);
  const upcoming = isUpcoming(block);
  const isPast = !current && !upcoming;
  const wasMissed = block.sessionLogged && block.sessionStatus === "missed";
  const inProgress = block.sessionLogged && block.sessionStatus === "in_progress";
  const wasLogged = block.sessionLogged && !wasMissed && !inProgress;

  const computedDuration = blockDurationMinutes(block);

  const basePrefill: QuickLogPrefill = {
    studentId: block.studentId ?? undefined,
    studentName: block.studentName ?? undefined,
    serviceTypeId: block.serviceTypeId ?? undefined,
    serviceTypeName: block.serviceTypeName ?? undefined,
    durationMinutes: computedDuration,
    scheduleBlockId: block.id ?? undefined,
  };

  const completedPrefill: QuickLogPrefill = { ...basePrefill, prefillOutcome: "completed" };
  const missedPrefill: QuickLogPrefill = { ...basePrefill, prefillOutcome: "missed" };

  return (
    <Card
      className={`transition-all ${current ? "ring-2 ring-emerald-600 shadow-md" : ""} ${isPast && !block.studentId ? "opacity-50" : ""}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {current && !block.sessionLogged && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-pulse" />
                  NOW
                </span>
              )}
              {upcoming && !block.sessionLogged && (
                <span className="text-[11px] font-medium text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                  Upcoming
                </span>
              )}
              {isPast && block.studentId && !block.sessionLogged && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  <Clock className="w-3 h-3" />
                  Needs log
                </span>
              )}
              {block.studentId && wasLogged && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" />
                  Logged
                </span>
              )}
              {block.studentId && wasMissed && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  Missed
                </span>
              )}
              {block.studentId && inProgress && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full animate-pulse">
                  In Progress
                </span>
              )}
            </div>

            <p className="text-[16px] font-semibold text-gray-800 truncate">
              {block.studentName || "Unassigned"}
            </p>
            <p className="text-[13px] text-gray-500 mt-0.5">
              {block.serviceTypeName || block.blockLabel || "Session"}
            </p>

            <div className="flex items-center gap-4 mt-2 text-[12px] text-gray-400 flex-wrap">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {formatTime(block.startTime)} – {formatTime(block.endTime)}
                {computedDuration && (
                  <span className="text-gray-300 ml-1">· {computedDuration} min</span>
                )}
              </span>
              {block.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {block.location}
                </span>
              )}
            </div>
          </div>

          {block.studentId && (current || upcoming) && !block.sessionLogged && (
            <Button
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-600/90 text-white min-h-[52px] min-w-[52px] px-5 text-[14px] font-semibold rounded-xl shadow-sm flex-shrink-0"
              onClick={() => onStart(block)}
            >
              <Play className="w-4 h-4 mr-1.5" />
              Start
            </Button>
          )}
        </div>

        {block.studentId && isPast && !block.sessionLogged && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
            <button
              onClick={() => onQuickLog(completedPrefill)}
              className="flex-1 h-14 rounded-xl bg-emerald-600 text-white text-[14px] font-semibold flex items-center justify-center gap-1.5 active:bg-emerald-700 transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Completed
            </button>
            <button
              onClick={() => onQuickLog(missedPrefill, true)}
              className="flex-1 h-14 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-[14px] font-semibold flex items-center justify-center gap-1.5 active:bg-amber-100 transition-colors"
            >
              <XCircle className="w-4 h-4" />
              Missed
            </button>
          </div>
        )}

        {block.studentId && (current || upcoming) && !block.sessionLogged && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <button
              onClick={() => onQuickLog(completedPrefill)}
              className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 text-gray-600 text-[13px] font-medium flex items-center justify-center gap-1.5 active:bg-gray-100 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Quick Log instead
            </button>
          </div>
        )}

        <div className="mt-2 flex justify-end">
          <Link
            href="/my-schedule"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-gray-600"
          >
            <ArrowLeftRight className="w-3 h-3" />
            Request change
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
