import { CheckCircle, XCircle, FileText, Timer } from "lucide-react";
import { STAGE_LABELS, STAGE_ICONS, STATUS_CONFIG, WorkflowApproval } from "./types";

export function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(d: string) {
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function daysAgo(d: string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

export function AgingBadge({ days }: { days: number }) {
  const color = days >= 7 ? "bg-red-100 text-red-700 border-red-200" : days >= 3 ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      <Timer className="w-3 h-3" />
      {days}d
    </span>
  );
}

export function StageBadge({ stage }: { stage: string }) {
  const label = STAGE_LABELS[stage] || stage.replace(/_/g, " ");
  const Icon = STAGE_ICONS[stage] || FileText;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.in_progress;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {status === "in_progress" ? "In Progress" : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function StageProgress({ stages, currentStage, status }: { stages: string[]; currentStage: string; status: string }) {
  const currentIdx = stages.indexOf(currentStage);
  return (
    <div className="flex items-center gap-1">
      {stages.map((stage, i) => {
        const isCompleted = status === "completed" || i < currentIdx;
        const isCurrent = i === currentIdx && status === "in_progress";
        const isRejected = status === "rejected" && i === currentIdx;
        return (
          <div key={stage} className="flex items-center gap-1">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                ${isCompleted ? "bg-emerald-500 text-white" : ""}
                ${isCurrent ? "bg-blue-500 text-white ring-2 ring-blue-200" : ""}
                ${isRejected ? "bg-red-500 text-white" : ""}
                ${!isCompleted && !isCurrent && !isRejected ? "bg-gray-200 text-gray-500" : ""}
              `}
              title={STAGE_LABELS[stage] || stage}
            >
              {isCompleted ? <CheckCircle className="w-3.5 h-3.5" /> : isRejected ? <XCircle className="w-3.5 h-3.5" /> : i + 1}
            </div>
            {i < stages.length - 1 && (
              <div className={`w-6 h-0.5 ${i < currentIdx || status === "completed" ? "bg-emerald-400" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function groupApprovalsByStage(approvals: WorkflowApproval[], stages: string[]) {
  const grouped: Record<string, WorkflowApproval[]> = {};
  for (const stage of stages) {
    grouped[stage] = [];
  }
  for (const a of approvals) {
    if (!grouped[a.stage]) grouped[a.stage] = [];
    grouped[a.stage].push(a);
  }
  return grouped;
}

export function buildThreadTree(approvals: WorkflowApproval[]): { roots: WorkflowApproval[]; children: Record<number, WorkflowApproval[]> } {
  const children: Record<number, WorkflowApproval[]> = {};
  const roots: WorkflowApproval[] = [];
  for (const a of approvals) {
    if (a.parentCommentId) {
      if (!children[a.parentCommentId]) children[a.parentCommentId] = [];
      children[a.parentCommentId].push(a);
    } else {
      roots.push(a);
    }
  }
  return { roots, children };
}
