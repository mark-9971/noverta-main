import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { InteractiveChart } from "@/components/ui/interactive-chart";
import { AbaGraph } from "@/components/aba-graph";

interface StudentGoalSectionProps {
  goalProgress: any[];
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
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
            <Target className="w-4 h-4" />
            IEP Goal Progress
          </CardTitle>
          <span className="text-xs text-gray-400">{goalProgress.length} active goal{goalProgress.length !== 1 ? "s" : ""}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {dataLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : goalProgress.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            <Target className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No active IEP goals with linked data targets</p>
            <p className="text-xs mt-1">Goals will appear here once they are created with linked program or behavior targets</p>
          </div>
        ) : (
          goalProgress.map((g: any) => {
            const ratingColors: Record<string, { bg: string; text: string; label: string }> = {
              mastered: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Mastered" },
              sufficient_progress: { bg: "bg-blue-100", text: "text-blue-700", label: "On Track" },
              some_progress: { bg: "bg-amber-100", text: "text-amber-700", label: "Some Progress" },
              insufficient_progress: { bg: "bg-red-100", text: "text-red-700", label: "Needs Attention" },
              not_addressed: { bg: "bg-gray-100", text: "text-gray-500", label: "No Data" },
            };
            const rating = ratingColors[g.progressRating] || ratingColors.not_addressed;
            const trendIcon = g.trendDirection === "improving" ? <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> : g.trendDirection === "declining" ? <TrendingDown className="w-3.5 h-3.5 text-red-500" /> : <Minus className="w-3.5 h-3.5 text-gray-400" />;
            const trendLabel = g.trendDirection === "improving" ? "Improving" : g.trendDirection === "declining" ? "Declining" : "Stable";

            return (
              <div key={g.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{g.goalArea}</span>
                      {g.goalNumber && <span className="text-xs text-gray-400">#{g.goalNumber}</span>}
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">{g.annualGoal}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${rating.bg} ${rating.text}`}>{rating.label}</span>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      {trendIcon}
                      <span>{trendLabel}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>{g.dataPointCount} data point{g.dataPointCount !== 1 ? "s" : ""}</span>
                  {g.latestValue !== null && <span>Latest: <strong className="text-gray-700">{g.measurementType === "program" ? `${Math.round(g.latestValue)}%` : g.latestValue}</strong></span>}
                  {g.baseline_value !== null && <span>Baseline: {g.measurementType === "program" ? `${Math.round(g.baseline_value)}%` : g.baseline_value}</span>}
                  {g.goal_value !== null && <span>Target: {g.measurementType === "program" ? `${g.goal_value}%` : g.goal_value}</span>}
                </div>
                {g.dataPoints.length > 1 && (
                  <div>
                    <div className="flex items-center justify-end mb-1">
                      <button
                        onClick={() => setGoalAbaView(prev => ({ ...prev, [`goal-${g.id}`]: !prev[`goal-${g.id}`] }))}
                        className={`text-[10px] font-medium px-2 py-1 rounded-md transition-colors ${
                          goalAbaView[`goal-${g.id}`]
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {goalAbaView[`goal-${g.id}`] ? "ABA View" : "Standard View"} — click to switch
                      </button>
                    </div>
                    {goalAbaView[`goal-${g.id}`] && g.linkedTarget?.type === "behavior" ? (
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
                    ) : goalAbaView[`goal-${g.id}`] && g.linkedTarget?.type === "program" ? (
                      <AbaGraph
                        target={{
                          id: g.programTargetId,
                          name: g.linkedTarget?.name || g.goalArea,
                          measurementType: "percentage",
                          targetDirection: "increase",
                          baselineValue: g.baseline_value != null ? String(g.baseline_value) : null,
                          goalValue: g.goal_value != null ? String(g.goal_value) : null,
                        }}
                        data={programTrends.filter((d: any) => d.programTargetId === g.programTargetId).map((d: any) => ({
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
                        color={g.progressRating === "mastered" ? "#10b981" : g.progressRating === "insufficient_progress" ? "#ef4444" : "#3b82f6"}
                        gradientId={`goal-${g.id}`}
                        title={`${g.goalArea} Goal #${g.goalNumber || 1}`}
                        yLabel={g.yLabel}
                        baselineLine={g.baseline_value}
                        goalLine={g.goal_value}
                        targetDirection={g.targetDirection}
                        valueFormatter={(v: number) => g.measurementType === "program" ? `${Math.round(v)}%` : String(Math.round(v * 10) / 10)}
                        exportFilename={`${student?.firstName || "student"}-${student?.lastName || ""}-${g.goalArea}-goal-progress`}
                      />
                    )}
                  </div>
                )}
                {g.dataPoints.length === 1 && (
                  <div className="text-xs text-gray-400 italic">Only 1 data point collected — chart will appear after more data is recorded</div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
