/**
 * FbaInsightsCard — read-only display of what the FBA/ABC data says.
 *
 * Shown in the BIP tab whenever there is a selected FBA with observation data.
 * Designed to sit *next to* (not replace) clinician judgment — each insight has
 * a clear data-provenance label so clinicians know it's a suggestion, not a finding.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, FlaskConical, AlertCircle } from "lucide-react";
import type { FbaRecord, ObsSummary } from "./types";

const FUNCTION_COLORS: Record<string, string> = {
  attention: "bg-blue-50 text-blue-700 border-blue-200",
  escape:    "bg-amber-50 text-amber-700 border-amber-200",
  tangible:  "bg-purple-50 text-purple-700 border-purple-200",
  sensory:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  multiple:  "bg-pink-50 text-pink-700 border-pink-200",
  undetermined: "bg-gray-100 text-gray-600 border-gray-200",
};

const ANTECEDENT_LABELS: Record<string, string> = {
  demand:         "Task demand / instruction",
  transition:     "Transition",
  denied_access:  "Denied access to item",
  alone:          "Alone / low attention",
  unstructured:   "Unstructured time",
  peer_conflict:  "Peer conflict",
  sensory_trigger:"Sensory trigger",
  other:          "Other",
};

const CONSEQUENCE_LABELS: Record<string, string> = {
  attention:     "Received attention",
  reprimand:     "Reprimand given",
  task_removed:  "Task removed",
  item_received: "Item received",
  ignored:       "Ignored / no response",
  physical_redirect: "Physical redirect",
  other:         "Other",
};

function DataBar({ label, count, total, colorClass }: {
  label: string; count: number; total: number; colorClass: string
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-28 flex-shrink-0 text-[10px] text-gray-600 truncate" title={label}>{label}</div>
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div className={`h-2 rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 w-6 text-right">{pct}%</span>
    </div>
  );
}

export interface FbaInsightsProps {
  fba: FbaRecord;
  summary: ObsSummary | null;
  /** Called when the clinician clicks "Apply" on the function suggestion */
  onApplyFunction?: (fn: string) => void;
  /** Called when the clinician wants to carry forward target behavior */
  onApplyTargetBehavior?: (tb: string) => void;
  /** Called when the clinician wants to carry forward op def */
  onApplyOpDef?: (od: string) => void;
}

export function FbaInsightsCard({
  fba, summary, onApplyFunction, onApplyTargetBehavior, onApplyOpDef
}: FbaInsightsProps) {
  const [expanded, setExpanded] = useState(true);

  const totalFunctions = summary
    ? Object.values(summary.functionCounts).reduce((a, b) => a + b, 0)
    : 0;
  const totalAntecedents = summary
    ? Object.values(summary.antecedentCounts).reduce((a, b) => a + b, 0)
    : 0;
  const totalConsequences = summary
    ? Object.values(summary.consequenceCounts).reduce((a, b) => a + b, 0)
    : 0;

  const topFunctions = summary
    ? Object.entries(summary.functionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
    : [];
  const topAntecedents = summary
    ? Object.entries(summary.antecedentCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
    : [];
  const topConsequences = summary
    ? Object.entries(summary.consequenceCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
    : [];

  const suggestedFunction = summary?.suggestedFunction ?? fba.hypothesizedFunction ?? null;
  const hasData = (summary?.totalObservations ?? 0) > 0 || !!fba.hypothesizedFunction;

  if (!hasData) return null;

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/40">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <FlaskConical className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
        <span className="flex-1 text-[11px] font-semibold text-blue-800 uppercase tracking-wider">
          FBA Insights
          {summary && summary.totalObservations > 0 && (
            <span className="ml-2 font-normal text-blue-500 normal-case tracking-normal">
              {summary.totalObservations} ABC observation{summary.totalObservations !== 1 ? "s" : ""}
            </span>
          )}
        </span>
        <AlertCircle className="w-3 h-3 text-blue-400 mr-1" />
        <span className="text-[9px] text-blue-400 italic mr-2">suggestions only — clinician judgment applies</span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-blue-400" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-400" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">

          {/* Hypothesized Function */}
          {(suggestedFunction || fba.hypothesizedFunction) && (
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-blue-500 mb-1">
                {fba.hypothesizedFunction ? "FBA Hypothesized Function" : "ABC Data Suggested Function"}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${FUNCTION_COLORS[suggestedFunction ?? ""] ?? FUNCTION_COLORS.undetermined}`}>
                  {suggestedFunction ?? "—"}
                </span>
                {summary && summary.totalObservations > 0 && suggestedFunction && totalFunctions > 0 && (
                  <span className="text-[10px] text-gray-500">
                    ({Math.round(((summary.functionCounts[suggestedFunction] ?? 0) / totalFunctions) * 100)}% of observations)
                  </span>
                )}
                {onApplyFunction && suggestedFunction && (
                  <button
                    type="button"
                    onClick={() => onApplyFunction(suggestedFunction)}
                    className="text-[10px] px-2 py-0.5 rounded border border-blue-300 bg-white text-blue-700 font-semibold hover:bg-blue-50 transition-colors"
                  >
                    Apply to form ↗
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Function distribution */}
          {summary && topFunctions.length > 1 && (
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-blue-500 mb-1.5">Function Distribution (ABC)</p>
              <div className="space-y-1.5">
                {topFunctions.map(([fn, count]) => (
                  <DataBar
                    key={fn}
                    label={fn.charAt(0).toUpperCase() + fn.slice(1)}
                    count={count}
                    total={totalFunctions}
                    colorClass="bg-blue-400"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Top antecedents */}
          {topAntecedents.length > 0 && (
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-amber-600 mb-1.5">
                Common Antecedents (ABC)
              </p>
              <div className="space-y-1.5">
                {topAntecedents.map(([cat, count]) => (
                  <DataBar
                    key={cat}
                    label={ANTECEDENT_LABELS[cat] ?? cat}
                    count={count}
                    total={totalAntecedents}
                    colorClass="bg-amber-400"
                  />
                ))}
              </div>
              <p className="text-[9px] text-gray-400 mt-1 italic">
                These often suggest environmental modifications for antecedent strategies.
              </p>
            </div>
          )}

          {/* Top consequences */}
          {topConsequences.length > 0 && (
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-purple-600 mb-1.5">
                Common Consequences (ABC)
              </p>
              <div className="space-y-1.5">
                {topConsequences.map(([cat, count]) => (
                  <DataBar
                    key={cat}
                    label={CONSEQUENCE_LABELS[cat] ?? cat}
                    count={count}
                    total={totalConsequences}
                    colorClass="bg-purple-400"
                  />
                ))}
              </div>
              <p className="text-[9px] text-gray-400 mt-1 italic">
                Common consequences often reinforce the behavior — consider in consequence procedures.
              </p>
            </div>
          )}

          {/* Target behavior + op def carry-forward */}
          {(fba.targetBehavior || fba.operationalDefinition) && (onApplyTargetBehavior || onApplyOpDef) && (
            <div className="border-t border-blue-100 pt-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-blue-500 mb-1.5">From FBA Record</p>
              <div className="space-y-1.5">
                {fba.targetBehavior && onApplyTargetBehavior && (
                  <div className="flex items-start gap-2 bg-white rounded border border-blue-100 p-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-semibold text-gray-500">Target Behavior</p>
                      <p className="text-[11px] text-gray-800 line-clamp-1">{fba.targetBehavior}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onApplyTargetBehavior(fba.targetBehavior)}
                      className="text-[9px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 flex-shrink-0 mt-0.5"
                    >
                      Apply ↗
                    </button>
                  </div>
                )}
                {fba.operationalDefinition && onApplyOpDef && (
                  <div className="flex items-start gap-2 bg-white rounded border border-blue-100 p-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-semibold text-gray-500">Operational Definition</p>
                      <p className="text-[11px] text-gray-800 line-clamp-2">{fba.operationalDefinition}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onApplyOpDef(fba.operationalDefinition)}
                      className="text-[9px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 flex-shrink-0 mt-0.5"
                    >
                      Apply ↗
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Hypothesis narrative */}
          {fba.hypothesisNarrative && (
            <div className="border-t border-blue-100 pt-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-blue-500 mb-1">Hypothesis Narrative</p>
              <p className="text-[11px] text-gray-700 leading-relaxed line-clamp-4">{fba.hypothesisNarrative}</p>
            </div>
          )}

          {/* Recommendations */}
          {fba.recommendations && (
            <div className="border-t border-blue-100 pt-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-blue-500 mb-1">FBA Recommendations</p>
              <p className="text-[11px] text-gray-700 leading-relaxed line-clamp-4">{fba.recommendations}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact inline version for the BipForm modal — no expand/collapse, tighter */
export function FbaInsightsCompact({
  fba, summary, onApplyFunction, onApplyTargetBehavior, onApplyOpDef
}: FbaInsightsProps) {
  const [expanded, setExpanded] = useState(false);
  const suggestedFunction = summary?.suggestedFunction ?? fba.hypothesizedFunction ?? null;
  const topAntecedents = summary
    ? Object.entries(summary.antecedentCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => ANTECEDENT_LABELS[k] ?? k)
    : [];
  const topConsequences = summary
    ? Object.entries(summary.consequenceCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => CONSEQUENCE_LABELS[k] ?? k)
    : [];

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <FlaskConical className="w-3 h-3 text-blue-500 flex-shrink-0" />
        <span className="flex-1 text-[10px] font-semibold text-blue-700 uppercase tracking-wider">
          FBA Reference Data
        </span>
        {suggestedFunction && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border mr-2 ${FUNCTION_COLORS[suggestedFunction] ?? FUNCTION_COLORS.undetermined}`}>
            {suggestedFunction}
          </span>
        )}
        <span className="text-[9px] text-blue-400 italic mr-1">{summary?.totalObservations ?? 0} obs</span>
        {expanded ? <ChevronUp className="w-3 h-3 text-blue-400" /> : <ChevronDown className="w-3 h-3 text-blue-400" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-blue-100">
          {/* Function suggestion with apply button */}
          {suggestedFunction && (
            <div className="flex items-center gap-2 pt-2">
              <span className="text-[10px] text-gray-500">Suggested function:</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${FUNCTION_COLORS[suggestedFunction] ?? FUNCTION_COLORS.undetermined}`}>
                {suggestedFunction}
              </span>
              {onApplyFunction && (
                <button
                  type="button"
                  onClick={() => onApplyFunction(suggestedFunction)}
                  className="text-[10px] px-2 py-0.5 rounded border border-blue-300 bg-white text-blue-700 font-semibold hover:bg-blue-50"
                >
                  Use ↗
                </button>
              )}
            </div>
          )}

          {/* Target behavior / op def apply */}
          {fba.targetBehavior && onApplyTargetBehavior && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 flex-1 truncate">{fba.targetBehavior}</span>
              <button
                type="button"
                onClick={() => onApplyTargetBehavior(fba.targetBehavior)}
                className="text-[9px] px-1.5 py-0.5 rounded border border-blue-200 bg-white text-blue-700 font-semibold hover:bg-blue-50 flex-shrink-0"
              >
                Use as target ↗
              </button>
            </div>
          )}
          {fba.operationalDefinition && onApplyOpDef && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 flex-1 line-clamp-1">{fba.operationalDefinition}</span>
              <button
                type="button"
                onClick={() => onApplyOpDef(fba.operationalDefinition)}
                className="text-[9px] px-1.5 py-0.5 rounded border border-blue-200 bg-white text-blue-700 font-semibold hover:bg-blue-50 flex-shrink-0"
              >
                Use as op def ↗
              </button>
            </div>
          )}

          {/* Antecedents + consequences as quick reference */}
          {topAntecedents.length > 0 && (
            <div>
              <p className="text-[9px] text-amber-600 font-semibold mb-0.5">Top antecedents:</p>
              <p className="text-[10px] text-gray-600">{topAntecedents.join(" · ")}</p>
            </div>
          )}
          {topConsequences.length > 0 && (
            <div>
              <p className="text-[9px] text-purple-600 font-semibold mb-0.5">Common consequences:</p>
              <p className="text-[10px] text-gray-600">{topConsequences.join(" · ")}</p>
            </div>
          )}
          {fba.hypothesisNarrative && (
            <div>
              <p className="text-[9px] text-blue-500 font-semibold mb-0.5">Hypothesis narrative:</p>
              <p className="text-[10px] text-gray-600 line-clamp-3">{fba.hypothesisNarrative}</p>
            </div>
          )}

          <p className="text-[9px] text-gray-400 italic pt-1">
            All suggestions above — clinician judgment applies. Click "Use ↗" to copy into the form; nothing is auto-applied.
          </p>
        </div>
      )}
    </div>
  );
}
