import { ChevronDown, ChevronUp, Edit3, Copy, Printer, X, Check, CalendarCheck, AlertTriangle, Clock } from "lucide-react";
import { Bip, STATUS_STYLES, STATUS_LABELS, formatDate } from "./types";

function FieldBlock({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">{label}</div>
      <div className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{value || "—"}</div>
    </div>
  );
}

type ReviewStatus = "overdue" | "due_soon" | "current" | "unset";

function reviewCycleStatus(reviewDate: string | null): { status: ReviewStatus; diffDays: number } {
  if (!reviewDate) return { status: "unset", diffDays: 0 };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rd = new Date(reviewDate + "T00:00:00");
  const diffDays = Math.round((rd.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return { status: "overdue", diffDays };
  if (diffDays <= 14) return { status: "due_soon", diffDays };
  return { status: "current", diffDays };
}

function ReviewBadge({ reviewDate }: { reviewDate: string | null }) {
  const { status, diffDays } = reviewCycleStatus(reviewDate);
  if (status === "unset") return null;
  if (status === "overdue") {
    const days = Math.abs(diffDays);
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 shrink-0">
        <AlertTriangle className="w-3 h-3" />
        Review overdue {days === 1 ? "1 day" : `${days} days`}
      </span>
    );
  }
  if (status === "due_soon") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">
        <Clock className="w-3 h-3" />
        Review due {diffDays === 0 ? "today" : `in ${diffDays}d`}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">
      <CalendarCheck className="w-3 h-3" />
      Review {formatDate(reviewDate!)}
    </span>
  );
}

export function BipRow({
  bip,
  expanded,
  onToggle,
  onEdit,
  onNewVersion,
  onStatusChange,
  onPrint,
  onDelete,
  onMarkReviewed,
  readOnly,
}: {
  bip: Bip;
  expanded: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onNewVersion?: () => void;
  onDelete?: () => void;
  onStatusChange?: (s: string) => void;
  onPrint: () => void;
  onMarkReviewed?: () => void;
  readOnly?: boolean;
}) {
  const { status: rs } = reviewCycleStatus(bip.reviewDate);
  const showMarkReviewed = !readOnly && onMarkReviewed && bip.status === "active" && (rs === "overdue" || rs === "due_soon");

  return (
    <div className={`border rounded-lg transition-colors ${bip.status === "archived" ? "border-gray-100 bg-gray-50/50" : rs === "overdue" && bip.status === "active" ? "border-red-200 bg-white" : "border-gray-200 bg-white"}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-800 truncate">{bip.targetBehavior}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_STYLES[bip.status] || "bg-gray-100 text-gray-600"}`}>
                {STATUS_LABELS[bip.status] || bip.status}
              </span>
              <span className="text-[10px] text-gray-400">v{bip.version}</span>
              <ReviewBadge reviewDate={bip.reviewDate} />
            </div>
            <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-0.5">
              <span>Function: {bip.hypothesizedFunction}</span>
              {bip.createdByName && <span>By {bip.createdByName}</span>}
              {bip.effectiveDate && <span>Effective {formatDate(bip.effectiveDate)}</span>}
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <FieldBlock label="Operational Definition" value={bip.operationalDefinition} />
            <FieldBlock label="Hypothesized Function" value={bip.hypothesizedFunction} />
            <FieldBlock label="Replacement Behaviors" value={bip.replacementBehaviors} />
            <FieldBlock label="Prevention Strategies" value={bip.preventionStrategies} />
            <FieldBlock label="Teaching Strategies" value={bip.teachingStrategies} />
            <FieldBlock label="Consequence Strategies" value={bip.consequenceStrategies} />
            <FieldBlock label="Reinforcement Schedule" value={bip.reinforcementSchedule} />
            <FieldBlock label="Crisis Plan" value={bip.crisisPlan} />
            <FieldBlock label="Data Collection Method" value={bip.dataCollectionMethod} />
            <FieldBlock label="Progress Criteria" value={bip.progressCriteria} />
            {bip.implementationNotes && (
              <div className="md:col-span-2">
                <FieldBlock label="Implementation Notes" value={bip.implementationNotes} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mt-3 text-[11px] border-t border-gray-100 pt-3 flex-wrap">
            <span className="text-gray-400">Created {formatDate(bip.createdAt)}</span>
            <span className="text-gray-400">Updated {formatDate(bip.updatedAt)}</span>
            {bip.lastReviewedAt && (
              <span className="text-gray-500">Last reviewed {formatDate(bip.lastReviewedAt)}</span>
            )}
            {bip.reviewDate && (() => {
              const { status: rs2 } = reviewCycleStatus(bip.reviewDate);
              const cls = rs2 === "overdue" ? "text-red-600 font-medium"
                : rs2 === "due_soon" ? "text-amber-600 font-medium"
                : "text-gray-400";
              return <span className={cls}>Next review {formatDate(bip.reviewDate)}</span>;
            })()}
            {bip.behaviorTargetName && <span className="text-gray-400">Target: {bip.behaviorTargetName}</span>}
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {!readOnly && onEdit && bip.status !== "archived" && (
              <button onClick={onEdit} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <Edit3 className="w-3.5 h-3.5" /> Edit
              </button>
            )}
            {!readOnly && onNewVersion && bip.status !== "archived" && (
              <button onClick={onNewVersion} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <Copy className="w-3.5 h-3.5" /> New Version
              </button>
            )}
            <button onClick={onPrint} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            {!readOnly && onDelete && bip.status === "draft" && (
              <button onClick={onDelete} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                <X className="w-3.5 h-3.5" /> Delete
              </button>
            )}

            {showMarkReviewed && (
              <button
                onClick={onMarkReviewed}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-violet-50 text-violet-700 hover:bg-violet-100 rounded-lg transition-colors border border-violet-200"
              >
                <CalendarCheck className="w-3.5 h-3.5" /> Mark Reviewed
              </button>
            )}

            {!readOnly && onStatusChange && bip.status !== "archived" && (
              <div className="ml-auto flex items-center gap-1.5">
                {bip.status === "draft" && (
                  <button onClick={() => onStatusChange("active")} className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors">
                    <Check className="w-3.5 h-3.5" /> Activate
                  </button>
                )}
                {bip.status === "active" && (
                  <button onClick={() => onStatusChange("under_review")} className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                    Under Review
                  </button>
                )}
                {bip.status === "under_review" && (
                  <>
                    <button onClick={() => onStatusChange("active")} className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors">
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button onClick={() => onStatusChange("draft")} className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                      Back to Draft
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
