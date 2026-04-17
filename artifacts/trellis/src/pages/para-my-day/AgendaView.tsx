import { Card, CardContent } from "@/components/ui/card";
import { Clock, ChevronRight, AlertTriangle, Shield } from "lucide-react";
import type { ScheduleBlock, AssignedBip, StaffAlert, QuickLogPrefill } from "./types";
import { isCurrentBlock, isUpcoming } from "./constants";
import { AlertsBanner } from "./AlertsBanner";
import { ScheduleBlockCard } from "./ScheduleBlockCard";

export function AgendaView({
  date,
  onDateChange,
  blocks,
  alerts,
  dismissingAlerts,
  onResolveAlert,
  assignedBips,
  onShowMyBips,
  onStartSession,
  onQuickLog,
}: {
  date: string;
  onDateChange: (d: string) => void;
  blocks: ScheduleBlock[];
  alerts: StaffAlert[];
  dismissingAlerts: Set<number>;
  onResolveAlert: (id: number) => void;
  assignedBips: AssignedBip[];
  onShowMyBips: () => void;
  onStartSession: (block: ScheduleBlock) => void;
  onQuickLog: (prefill: QuickLogPrefill, skipToMissed?: boolean) => void;
}) {
  const pastUnloggedBlocks = blocks.filter(
    b => !isCurrentBlock(b) && !isUpcoming(b) && b.studentId && !b.sessionLogged
  );

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 pb-28">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-800">My Day</h1>
          <p className="text-sm text-gray-400 mt-0.5 truncate">
            {new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <input
          type="date"
          value={date}
          onChange={e => onDateChange(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white min-h-[44px] flex-shrink-0"
        />
      </div>

      <AlertsBanner
        alerts={alerts}
        dismissingAlerts={dismissingAlerts}
        onResolve={onResolveAlert}
      />

      {pastUnloggedBlocks.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-amber-800">
              {pastUnloggedBlocks.length} earlier session{pastUnloggedBlocks.length > 1 ? "s" : ""} need logging
            </p>
            <p className="text-[12px] text-amber-600 mt-0.5">Use the Log or Missed buttons below.</p>
          </div>
        </div>
      )}

      {assignedBips.length > 0 && (
        <button onClick={onShowMyBips} className="w-full text-left">
          <Card className="border-emerald-200 hover:border-emerald-400 transition-colors">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-gray-800">My Assigned BIPs</p>
                  <p className="text-[12px] text-gray-400">
                    {assignedBips.length} active plan{assignedBips.length !== 1 ? "s" : ""} · {new Set(assignedBips.map(b => b.studentId)).size} student{new Set(assignedBips.map(b => b.studentId)).size !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </CardContent>
          </Card>
        </button>
      )}

      {blocks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="w-10 h-10 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-400 text-sm">No sessions scheduled for today.</p>
            <p className="text-gray-300 text-xs mt-1">Check another day or contact your supervisor.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {blocks.map(block => (
            <ScheduleBlockCard
              key={block.id}
              block={block}
              onStart={onStartSession}
              onQuickLog={onQuickLog}
            />
          ))}
        </div>
      )}
    </div>
  );
}
