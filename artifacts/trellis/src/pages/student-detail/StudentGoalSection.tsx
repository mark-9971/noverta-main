import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, BarChart2, Printer, Trophy, X } from "lucide-react";
import { InteractiveChart } from "@/components/ui/interactive-chart";
import { AbaGraph } from "@/components/aba-graph";
import { GoalPrintData, buildGoalProgressReportHtml, openPrintWindow } from "@/lib/print-document";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

type GoalProgress = GoalPrintData & {
  linkedTarget?: { type: string; name: string; measurementType: string } | null;
  behaviorTargetId?: number | null;
  programTargetId?: number | null;
  targetDirection?: string | null;
  masteredAt?: string | null;
};

interface StudentGoalSectionProps {
  goalProgress: GoalProgress[];
  dataLoading: boolean;
  behaviorTargets: any[];
  behaviorTrends: any[];
  programTrends: any[];
  phaseChangesByTarget: Record<number, any[]>;
  goalAbaView: Record<string | number, boolean>;
  setGoalAbaView: (updater: (prev: Record<string | number, boolean>) => Record<string | number, boolean>) => void;
  loadPhaseChanges: () => void;
  student: any;
  annotationsByGoal: Record<number, any[]>;
  onAddAnnotation: (goalId: number, annotationDate: string, label: string) => Promise<void>;
  onRemoveAnnotation: (annotationId: number) => Promise<void>;
}

const RATING_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  mastered: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Mastered" },
  sufficient_progress: { bg: "bg-blue-100", text: "text-blue-700", label: "On Track" },
  some_progress: { bg: "bg-amber-100", text: "text-amber-700", label: "Some Progress" },
  insufficient_progress: { bg: "bg-red-100", text: "text-red-700", label: "Needs Attention" },
  not_addressed: { bg: "bg-gray-100", text: "text-gray-500", label: "No Data" },
};

function isMasteredRecently(masteredAt: string | null | undefined): boolean {
  if (!masteredAt) return false;
  const d = new Date(masteredAt);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  return diffMs <= 30 * 24 * 60 * 60 * 1000;
}

function formatMasteryDate(masteredAt: string | null | undefined): string {
  if (!masteredAt) return "";
  return new Date(masteredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function StudentGoalSection({
  goalProgress,
  dataLoading,
  behaviorTargets,
  behaviorTrends,
  programTrends,
  phaseChangesByTarget,
  goalAbaView,
  setGoalAbaView,
  loadPhaseChanges,
  student,
  annotationsByGoal,
  onAddAnnotation,
  onRemoveAnnotation,
}: StudentGoalSectionProps) {
  const [expandedCharts, setExpandedCharts] = useState<Record<string | number, boolean>>({});
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [printFilterOpen, setPrintFilterOpen] = useState(false);
  const [excludedAreas, setExcludedAreas] = useState<Set<string>>(new Set());
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);

  const goalAreas = useMemo(() => {
    const areas = new Set<string>();
    goalProgress.forEach(g => { if (g.goalArea) areas.add(g.goalArea); });
    return Array.from(areas).sort();
  }, [goalProgress]);

  function toggleArea(area: string) {
    setExcludedAreas(prev => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  }

  const filteredPrintGoals = goalProgress.filter(g => {
    if (excludedAreas.has(g.goalArea)) return false;
    if (needsAttentionOnly && g.progressRating !== "insufficient_progress") return false;
    return true;
  });

  function toggleChart(id: string | number) {
    setExpandedCharts(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAba(id: string | number) {
    setGoalAbaView(prev => ({ ...prev, [`goal-${id}`]: !prev[`goal-${id}`] }));
  }

  function handlePrintReport() {
    const studentName = student
      ? `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim()
      : "Student";
    const html = buildGoalProgressReportHtml({
      studentName,
      studentDob: student?.dob ?? null,
      studentGrade: student?.grade ? String(student.grade) : null,
      school: student?.school ?? null,
      district: student?.district ?? null,
      goals: filteredPrintGoals,
    });
    openPrintWindow(html);
    setPrintFilterOpen(false);
  }

  const recentlyMasteredGoals = goalProgress.filter(g => isMasteredRecently(g.masteredAt));
  const studentName = student ? `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() : "this student";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
            <Target className="w-4 h-4" />
            IEP Goal Progress
          </CardTitle>
          <div className="flex items-center gap-2">
            {goalProgress.length > 0 && !dataLoading && (
              <Popover open={printFilterOpen} onOpenChange={setPrintFilterOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200"
                    title="Print goal progress report for IEP meeting"
                    data-testid="button-print-report"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print Report
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-3">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-700">Print which goals?</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">Choose what to include in the IEP report.</p>
                    </div>

                    {goalAreas.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Goal areas</p>
                          {excludedAreas.size > 0 && (
                            <button
                              type="button"
                              onClick={() => setExcludedAreas(new Set())}
                              className="text-[11px] text-emerald-700 hover:underline"
                            >
                              Select all
                            </button>
                          )}
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                          {goalAreas.map(area => {
                            const checked = !excludedAreas.has(area);
                            return (
                              <label key={area} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => toggleArea(area)}
                                  data-testid={`checkbox-print-area-${area}`}
                                />
                                <span>{area}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="border-t pt-2">
                      <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                        <Checkbox
                          checked={needsAttentionOnly}
                          onCheckedChange={(v) => setNeedsAttentionOnly(v === true)}
                          data-testid="checkbox-print-needs-attention"
                        />
                        <span>Only goals flagged "Needs Attention"</span>
                      </label>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t">
                      <span className="text-[11px] text-gray-500">
                        {filteredPrintGoals.length} of {goalProgress.length} goal{goalProgress.length !== 1 ? "s" : ""}
                      </span>
                      <button
                        type="button"
                        onClick={handlePrintReport}
                        disabled={filteredPrintGoals.length === 0}
                        className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        data-testid="button-print-report-confirm"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Print
                      </button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <span className="text-xs text-gray-400">
              {goalProgress.length} active goal{goalProgress.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
        {/* 30-day mastery celebration banner */}
        {!bannerDismissed && recentlyMasteredGoals.length > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white px-4 py-3 relative">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Trophy className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-800">
                Goal{recentlyMasteredGoals.length > 1 ? "s" : ""} Mastered!
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">
                {recentlyMasteredGoals.length === 1
                  ? `${studentName} mastered their ${recentlyMasteredGoals[0].goalArea} goal on ${formatMasteryDate(recentlyMasteredGoals[0].masteredAt)}.`
                  : `${studentName} mastered ${recentlyMasteredGoals.length} goals in the last 30 days — great progress!`}
              </p>
            </div>
            <button
              onClick={() => setBannerDismissed(true)}
              className="text-emerald-400 hover:text-emerald-600 transition-colors flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {dataLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        ) : goalProgress.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            <Target className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No active IEP goals with linked data targets</p>
            <p className="text-xs mt-1">Goals will appear here once created with linked program or behavior targets</p>
          </div>
        ) : (
          goalProgress.map((g: any) => {
            const isMastered = !!g.masteredAt;
            const rating = RATING_COLORS[g.progressRating] ?? RATING_COLORS.not_addressed;
            const trendIcon =
              g.trendDirection === "improving" ? <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> :
              g.trendDirection === "declining" ? <TrendingDown className="w-3.5 h-3.5 text-red-500" /> :
              <Minus className="w-3.5 h-3.5 text-gray-400" />;
            const trendLabel =
              g.trendDirection === "improving" ? "Improving" :
              g.trendDirection === "declining" ? "Declining" : "Stable";

            const chartKey = `goal-${g.id}`;
            const chartExpanded = !!expandedCharts[g.id];
            const abaActive = !!goalAbaView[chartKey];
            const hasChart = g.dataPoints.length > 1;
            const goalAnnotations = (annotationsByGoal[g.id] || []).map((a: any) => ({
              id: a.id,
              annotationDate: a.annotationDate,
              label: a.label,
            }));

            return (
              <div
                key={g.id}
                className={`border rounded-lg p-3.5 space-y-2.5 ${isMastered ? "border-emerald-200 bg-emerald-50/40" : ""}`}
              >
                {/* Goal header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        {g.goalArea}
                      </span>
                      {g.goalNumber && <span className="text-xs text-gray-400">#{g.goalNumber}</span>}
                      {isMastered && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <Trophy className="w-3 h-3" />
                          Mastered {formatMasteryDate(g.masteredAt)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">{g.annualGoal}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${rating.bg} ${rating.text}`}>
                      {rating.label}
                    </span>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      {trendIcon}
                      <span>{trendLabel}</span>
                    </div>
                  </div>
                </div>

                {/* Data point summary */}
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>{g.dataPointCount} data point{g.dataPointCount !== 1 ? "s" : ""}</span>
                  {g.latestValue !== null && (
                    <span>Latest: <strong className="text-gray-700">
                      {g.measurementType === "program" ? `${Math.round(g.latestValue)}%` : g.latestValue}
                    </strong></span>
                  )}
                  {g.baseline_value !== null && (
                    <span>Baseline: {g.measurementType === "program" ? `${Math.round(g.baseline_value)}%` : g.baseline_value}</span>
                  )}
                  {g.goal_value !== null && (
                    <span>Target: {g.measurementType === "program" ? `${g.goal_value}%` : g.goal_value}</span>
                  )}
                </div>

                {/* Chart toggle bar */}
                {hasChart ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleChart(g.id)}
                      className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                      <BarChart2 className="w-3.5 h-3.5" />
                      {chartExpanded ? "Hide graph" : "Show graph"}
                      {chartExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {chartExpanded && (
                      <button
                        onClick={() => toggleAba(g.id)}
                        className={`flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
                          abaActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {abaActive ? "ABA view" : "Standard view"}
                      </button>
                    )}
                  </div>
                ) : g.dataPoints.length === 1 ? (
                  <p className="text-xs text-gray-400 italic">
                    1 data point recorded — chart appears after more data is collected
                  </p>
                ) : null}

                {/* Expandable chart area */}
                {hasChart && chartExpanded && (
                  <div className="pt-1">
                    {abaActive && g.linkedTarget?.type === "behavior" ? (
                      <AbaGraph
                        target={behaviorTargets.find((bt: any) => bt.id === g.behaviorTargetId) || {
                          id: g.behaviorTargetId,
                          name: g.linkedTarget?.name || g.goalArea,
                          measurementType: g.linkedTarget?.measurementType || "frequency",
                          targetDirection: g.targetDirection,
                          baselineValue: g.baseline_value != null ? String(g.baseline_value) : null,
                          goalValue: g.goal_value != null ? String(g.goal_value) : null,
                        }}
                        data={behaviorTrends}
                        phaseChanges={phaseChangesByTarget[g.behaviorTargetId] || []}
                        onPhaseChangesUpdate={loadPhaseChanges}
                      />
                    ) : abaActive && g.linkedTarget?.type === "program" ? (
                      <AbaGraph
                        target={{
                          id: g.programTargetId,
                          name: g.linkedTarget?.name || g.goalArea,
                          measurementType: "percentage",
                          targetDirection: "increase",
                          baselineValue: g.baseline_value != null ? String(g.baseline_value) : null,
                          goalValue: g.goal_value != null ? String(g.goal_value) : null,
                        }}
                        data={programTrends
                          .filter((d: any) => d.programTargetId === g.programTargetId)
                          .map((d: any) => ({
                            ...d,
                            behaviorTargetId: g.programTargetId,
                            value: d.percentCorrect ?? "0",
                            targetName: d.targetName,
                            measurementType: "percentage",
                          }))}
                        phaseChanges={[]}
                        onPhaseChangesUpdate={() => {}}
                      />
                    ) : (
                      <InteractiveChart
                        data={g.dataPoints}
                        color={
                          isMastered ? "#10b981" :
                          g.progressRating === "mastered" ? "#10b981" :
                          g.progressRating === "insufficient_progress" ? "#ef4444" : "#3b82f6"
                        }
                        gradientId={chartKey}
                        title={`${g.goalArea} Goal #${g.goalNumber || 1}`}
                        yLabel={g.yLabel}
                        baselineLine={g.baseline_value}
                        goalLine={g.goal_value}
                        targetDirection={g.targetDirection}
                        valueFormatter={(v: number) =>
                          g.measurementType === "program"
                            ? `${Math.round(v)}%`
                            : String(Math.round(v * 10) / 10)
                        }
                        exportFilename={`${student?.firstName || "student"}-${student?.lastName || ""}-${g.goalArea}-goal-progress`}
                        annotations={goalAnnotations}
                        onAddAnnotation={(date, label) => onAddAnnotation(g.id, date, label)}
                        onRemoveAnnotation={(id) => onRemoveAnnotation(id as number)}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
