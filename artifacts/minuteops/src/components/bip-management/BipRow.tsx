import { ChevronDown, ChevronUp, Edit3, Copy, Printer, X, Check } from "lucide-react";
import { Bip, STATUS_STYLES, STATUS_LABELS, formatDate } from "./types";

function FieldBlock({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">{label}</div>
      <div className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{value || "—"}</div>
    </div>
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
  readOnly?: boolean;
}) {
  return (
    <div className={`border rounded-lg transition-colors ${bip.status === "archived" ? "border-gray-100 bg-gray-50/50" : "border-gray-200 bg-white"}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-800 truncate">{bip.targetBehavior}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_STYLES[bip.status] || "bg-gray-100 text-gray-600"}`}>
                {STATUS_LABELS[bip.status] || bip.status}
              </span>
              <span className="text-[10px] text-gray-400">v{bip.version}</span>
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

          <div className="flex items-center gap-3 mt-3 text-[11px] text-gray-400 border-t border-gray-100 pt-3">
            <span>Created {formatDate(bip.createdAt)}</span>
            <span>Updated {formatDate(bip.updatedAt)}</span>
            {bip.reviewDate && <span>Review by {formatDate(bip.reviewDate)}</span>}
            {bip.behaviorTargetName && <span>Target: {bip.behaviorTargetName}</span>}
          </div>

          <div className="flex items-center gap-2 mt-3">
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
