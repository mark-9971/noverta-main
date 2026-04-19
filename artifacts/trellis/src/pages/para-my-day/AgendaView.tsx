import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, ChevronRight, AlertTriangle, Shield, ChevronDown, CheckCircle2, Users } from "lucide-react";
import type { ScheduleBlock, AssignedBip, StaffAlert, QuickLogPrefill } from "./types";
import { isCurrentBlock, isUpcoming } from "./constants";
import { AlertsBanner } from "./AlertsBanner";
import { ScheduleBlockCard } from "./ScheduleBlockCard";
import RoleFirstRunCard from "@/components/onboarding/RoleFirstRunCard";

type StudentProgress = {
  studentId?: number;
  studentName: string;
  serviceTypeName: string;
  deliveredMinutes: number;
  requiredMinutes: number;
  percentComplete: number;
  riskStatus: string;
};

const RISK_ORDER: Record<string, number> = {
  out_of_compliance: 0,
  at_risk: 1,
  slightly_behind: 2,
  no_data: 3,
  on_track: 4,
  completed: 5,
};

function riskBadge(status: string) {
  switch (status) {
    case "completed":
    case "on_track":
      return (
        <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
          <CheckCircle2 className="w-3 h-3" />
          On track
        </span>
      );
    case "slightly_behind":
      return (
        <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
          Slightly behind
        </span>
      );
    case "at_risk":
      return (
        <span className="text-[11px] font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
          At risk
        </span>
      );
    case "out_of_compliance":
      return (
        <span className="text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
          Behind
        </span>
      );
    default:
      return (
        <span className="text-[11px] font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
          No data
        </span>
      );
  }
}

function CaseloadPanel({ progress }: { progress: StudentProgress[] }) {
  const sorted = [...progress].sort(
    (a, b) => (RISK_ORDER[a.riskStatus] ?? 3) - (RISK_ORDER[b.riskStatus] ?? 3)
  );

  const needsAttention = sorted.filter(
    p => p.riskStatus === "out_of_compliance" || p.riskStatus === "at_risk" || p.riskStatus === "slightly_behind"
  ).length;

  const [expanded, setExpanded] = useState(needsAttention > 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-left min-w-0">
            <p className="text-[13px] font-semibold text-gray-800">My Students — This Period</p>
            <p className="text-[11px] text-gray-400">
              {needsAttention > 0
                ? `${needsAttention} student${needsAttention !== 1 ? "s" : ""} need attention`
                : `${sorted.length} student${sorted.length !== 1 ? "s" : ""} on track`}
            </p>
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {sorted.map((p, i) => (
            <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-gray-800 truncate">{p.studentName}</p>
                <p className="text-[11px] text-gray-400 truncate">{p.serviceTypeName}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[11px] text-gray-400 tabular-nums">
                  {p.deliveredMinutes}/{p.requiredMinutes} min
                </span>
                {riskBadge(p.riskStatus)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
  caseloadProgress,
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
  caseloadProgress?: StudentProgress[];
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

      {caseloadProgress && caseloadProgress.length > 0 && (
        <CaseloadPanel progress={caseloadProgress} />
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
        /* Honest first-run empty state. Until the supervising teacher
           builds schedule blocks and assigns this para, "My Day" has
           nothing to show — explain why instead of looking broken. */
        <RoleFirstRunCard role="para" />
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
