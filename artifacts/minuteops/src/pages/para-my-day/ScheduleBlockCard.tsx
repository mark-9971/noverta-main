import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, MapPin, Play, Pencil, XCircle } from "lucide-react";
import type { ScheduleBlock, QuickLogPrefill } from "./types";
import { formatTime, isCurrentBlock, isUpcoming } from "./constants";

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

  const prefill: QuickLogPrefill = {
    studentId: block.studentId ?? undefined,
    studentName: block.studentName ?? undefined,
    serviceTypeId: block.serviceTypeId ?? undefined,
    serviceTypeName: block.serviceTypeName ?? undefined,
  };

  return (
    <Card
      className={`transition-all ${current ? "ring-2 ring-emerald-600 shadow-md" : ""} ${isPast && !block.studentId ? "opacity-50" : ""}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {current && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-pulse" />
                  NOW
                </span>
              )}
              {upcoming && (
                <span className="text-[11px] font-medium text-gray-400">UPCOMING</span>
              )}
              {isPast && block.studentId && !block.sessionLogged && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  <Clock className="w-3 h-3" />
                  Needs log
                </span>
              )}
              {isPast && block.studentId && block.sessionLogged && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                  Logged
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
              </span>
              {block.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {block.location}
                </span>
              )}
            </div>
          </div>

          {block.studentId && (current || upcoming) && (
            <Button
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-600/90 text-white min-h-[48px] min-w-[48px] px-5 text-[14px] font-semibold rounded-xl shadow-sm flex-shrink-0"
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
              onClick={() => onQuickLog(prefill)}
              className="flex-1 h-11 rounded-xl bg-emerald-600 text-white text-[13px] font-semibold flex items-center justify-center gap-1.5 active:bg-emerald-700 transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Log Session
            </button>
            <button
              onClick={() => onQuickLog(prefill, true)}
              className="flex-1 h-11 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-[13px] font-semibold flex items-center justify-center gap-1.5 active:bg-amber-100 transition-colors"
            >
              <XCircle className="w-4 h-4" />
              Missed
            </button>
          </div>
        )}

        {block.studentId && (current || upcoming) && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <button
              onClick={() => onQuickLog(prefill)}
              className="w-full h-10 rounded-xl border border-gray-200 bg-gray-50 text-gray-600 text-[13px] font-medium flex items-center justify-center gap-1.5 active:bg-gray-100 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Quick Log instead
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
