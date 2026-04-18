import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, BarChart2, Printer } from "lucide-react";
import { InteractiveChart } from "@/components/ui/interactive-chart";
import { AbaGraph } from "@/components/aba-graph";
import { GoalPrintData, buildGoalProgressReportHtml, openPrintWindow } from "@/lib/print-document";

type GoalProgress = GoalPrintData & {
  linkedTarget?: { type: string; name: string; measurementType: string } | null;
  behaviorTargetId?: number | null;
  programTargetId?: number | null;
  targetDirection?: string | null;
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
}

const RATING_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  mastered: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Mastered" },
  sufficient_progress: { bg: "bg-blue-100", text: "text-blue-700", label: "On Track" },
  some_progress: { bg: "bg-amber-100", text: "text-amber-700", label: "Some Progress" },
  insufficient_progress: { bg: "bg-red-100", text: "text-red-700", label: "Needs Attention" },
  not_addressed: { bg: "bg-gray-100", text: "text-gray-500", label: "No Data" },
};

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
}: StudentGoalSectionProps) {
  const [expandedCharts, setExpandedCharts] = useState<Record<string | number, boolean>>({});

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
      goals: goalProgress,
    });
    openPrintWindow(html);
  }

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
              <button
                onClick={handlePrintReport}
                className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200"
                title="Print goal progress report for IEP meeting"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Report
              </button>
            )}
            <span className="text-xs text-gray-400">
              {goalProgress.length} active goal{goalProgress.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </CardHeader>

      {/* Scrollable content — same pattern as other tiles */}
      <CardContent className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
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

            return (
              <div key={g.id} className="border rounded-lg p-3.5 space-y-2.5">
                {/* Goal header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        {g.goalArea}
                      </span>
                      {g.goalNumber && <span className="text-xs text-gray-400">#{g.goalNumber}</span>}
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

                    {/* ABA toggle — only visible when chart is expanded */}
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
