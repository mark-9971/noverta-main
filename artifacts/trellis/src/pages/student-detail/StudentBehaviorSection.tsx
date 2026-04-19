import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Minus, CheckCircle } from "lucide-react";
import { InteractiveChart } from "@/components/ui/interactive-chart";
import { AbaGraph } from "@/components/aba-graph";

const DIRECTION_COLORS = {
  decrease: { good: "#10b981", bad: "#ef4444", bg: "bg-emerald-50", text: "text-emerald-700" },
  increase: { good: "#059669", bad: "#f97316", bg: "bg-emerald-50", text: "text-emerald-800" },
};

interface StudentBehaviorSectionProps {
  hasNonIepData: boolean;
  dataLoading: boolean;
  nonIepBehaviorTargets: any[];
  nonIepProgramTargets: any[];
  behaviorTrends: any[];
  programTrends: any[];
  behaviorPhaseLines: Record<number, { id: string; date: string; label: string; color?: string }[]>;
  setBehaviorPhaseLines: (updater: (prev: Record<number, { id: string; date: string; label: string; color?: string }[]>) => Record<number, { id: string; date: string; label: string; color?: string }[]>) => void;
  programPhaseLines: Record<number, { id: string; date: string; label: string; color?: string }[]>;
  setProgramPhaseLines: (updater: (prev: Record<number, { id: string; date: string; label: string; color?: string }[]>) => Record<number, { id: string; date: string; label: string; color?: string }[]>) => void;
  phaseChangesByTarget: Record<number, any[]>;
  goalAbaView: Record<string | number, boolean>;
  setGoalAbaView: (updater: (prev: Record<string | number, boolean>) => Record<string | number, boolean>) => void;
  loadPhaseChanges: () => void;
  getBehaviorTrendData: (id: number) => any[];
  getProgramTrendData: (id: number) => any[];
  getTrendDirection: (data: { value: number }[]) => string;
}

export default function StudentBehaviorSection({
  hasNonIepData,
  dataLoading,
  nonIepBehaviorTargets,
  nonIepProgramTargets,
  behaviorTrends,
  programTrends,
  behaviorPhaseLines,
  setBehaviorPhaseLines,
  programPhaseLines,
  setProgramPhaseLines,
  phaseChangesByTarget,
  goalAbaView,
  setGoalAbaView,
  loadPhaseChanges,
  getBehaviorTrendData,
  getProgramTrendData,
  getTrendDirection,
}: StudentBehaviorSectionProps) {
  if (!hasNonIepData && !dataLoading) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-600" />
            Non-IEP Data Tracking
          </CardTitle>
          <span className="text-xs text-gray-400">
            {nonIepBehaviorTargets.length + nonIepProgramTargets.length} target{(nonIepBehaviorTargets.length + nonIepProgramTargets.length) !== 1 ? "s" : ""} not linked to IEP goals
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {dataLoading ? (
          <div className="space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="w-full h-24" />)}</div>
        ) : (
          <div className="space-y-4">
            {nonIepBehaviorTargets.map((bt: any) => {
              const trendData = getBehaviorTrendData(bt.id);
              const latest = trendData[trendData.length - 1]?.value;
              const baseline = parseFloat(bt.baselineValue) || 0;
              const goal = parseFloat(bt.goalValue) || 0;
              const direction = getTrendDirection(trendData);
              const dirColors = DIRECTION_COLORS[bt.targetDirection as keyof typeof DIRECTION_COLORS] || DIRECTION_COLORS.decrease;
              const isGoodTrend = (bt.targetDirection === "decrease" && direction === "down") ||
                                   (bt.targetDirection === "increase" && direction === "up");
              const trendColor = direction === "flat" ? "#9ca3af" : isGoodTrend ? dirColors.good : dirColors.bad;
              const progressPct = bt.targetDirection === "decrease"
                ? baseline > goal ? Math.round(((baseline - (latest ?? baseline)) / (baseline - goal)) * 100) : 0
                : goal > baseline ? Math.round((((latest ?? baseline) - baseline) / (goal - baseline)) * 100) : 0;
              const clampedPct = Math.max(0, Math.min(100, progressPct));
              const showAba = goalAbaView[`beh-${bt.id}`];

              return (
                <div key={`beh-${bt.id}`} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">Behavior</span>
                        <p className="text-[13px] font-semibold text-gray-700">{bt.name}</p>
                        <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          bt.targetDirection === "decrease" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                        }`}>
                          {bt.targetDirection === "decrease" ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                          {bt.targetDirection}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {bt.measurementType} · Baseline: {bt.baselineValue} · Goal: {bt.goalValue}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <div className="flex items-center gap-1">
                        {direction === "up" ? <ArrowUpRight className="w-3.5 h-3.5" style={{ color: trendColor }} /> :
                         direction === "down" ? <ArrowDownRight className="w-3.5 h-3.5" style={{ color: trendColor }} /> :
                         <Minus className="w-3.5 h-3.5 text-gray-400" />}
                        <span className="text-lg font-bold text-gray-800">{latest != null ? latest : "\u2014"}</span>
                      </div>
                      <p className="text-[10px] text-gray-400">latest</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mb-2">
                    <div className="flex-1">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${clampedPct}%`, backgroundColor: clampedPct >= 80 ? "#10b981" : clampedPct >= 50 ? "#f59e0b" : "#ef4444" }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">{clampedPct}% toward goal</p>
                    </div>
                  </div>
                  {trendData.length > 1 && (
                    <div>
                      <div className="flex items-center justify-end mb-1">
                        <button
                          onClick={() => setGoalAbaView(prev => ({ ...prev, [`beh-${bt.id}`]: !prev[`beh-${bt.id}`] }))}
                          className={`text-[10px] font-medium px-2 py-1 rounded-md transition-colors ${
                            showAba ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          {showAba ? "ABA View" : "Standard View"} — click to switch
                        </button>
                      </div>
                      {showAba ? (
                        <AbaGraph
                          target={bt}
                          data={behaviorTrends}
                          phaseChanges={phaseChangesByTarget[bt.id] || []}
                          onPhaseChangesUpdate={loadPhaseChanges}
                        />
                      ) : (
                        <InteractiveChart
                          data={trendData}
                          color={trendColor}
                          gradientId={`grad-nonIep-beh-${bt.id}`}
                          title={bt.name}
                          yLabel={bt.measurementType}
                          baselineLine={baseline}
                          goalLine={goal}
                          targetDirection={bt.targetDirection}
                          phaseLines={behaviorPhaseLines[bt.id] || []}
                          onPhaseLinesChange={(lines) => setBehaviorPhaseLines(prev => ({ ...prev, [bt.id]: lines }))}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {nonIepProgramTargets.map((pt: any) => {
              const trendData = getProgramTrendData(pt.id);
              const latest = trendData[trendData.length - 1]?.value;
              const direction = getTrendDirection(trendData);
              const masteryPct = pt.masteryCriterionPercent || 80;
              const isGoodTrend = direction === "up";
              const trendColor = direction === "flat" ? "#9ca3af" : isGoodTrend ? "#059669" : "#f97316";
              const atMastery = latest != null && latest >= masteryPct;
              const showAba = goalAbaView[`prog-${pt.id}`];

              return (
                <div key={`prog-${pt.id}`} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">Program</span>
                        <p className="text-[13px] font-semibold text-gray-700">{pt.name}</p>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                          {pt.domain || pt.programType?.replace(/_/g, " ")}
                        </span>
                        {pt.currentPromptLevel && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                            {pt.currentPromptLevel}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {pt.targetCriterion || `${masteryPct}% mastery`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <div className="flex items-center gap-1">
                        {direction === "up" ? <ArrowUpRight className="w-3.5 h-3.5" style={{ color: trendColor }} /> :
                         direction === "down" ? <ArrowDownRight className="w-3.5 h-3.5" style={{ color: trendColor }} /> :
                         <Minus className="w-3.5 h-3.5 text-gray-400" />}
                        <span className="text-lg font-bold text-gray-800">{latest != null ? `${Math.round(latest)}%` : "\u2014"}</span>
                      </div>
                      <p className="text-[10px] text-gray-400">latest accuracy</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mb-2">
                    <div className="flex-1">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden relative">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, latest ?? 0)}%`, backgroundColor: atMastery ? "#10b981" : (latest ?? 0) >= 60 ? "#059669" : "#f97316" }}
                        />
                        <div
                          className="absolute top-0 h-full w-0.5 bg-gray-400/60"
                          style={{ left: `${masteryPct}%` }}
                          title={`Mastery: ${masteryPct}%`}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-[10px] text-gray-400">{atMastery ? "At mastery criterion" : `${masteryPct}% mastery criterion`}</p>
                        {atMastery && <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-0.5"><CheckCircle className="w-3 h-3" /> Mastered</span>}
                      </div>
                    </div>
                  </div>
                  {trendData.length > 1 && (
                    <div>
                      <div className="flex items-center justify-end mb-1">
                        <button
                          onClick={() => setGoalAbaView(prev => ({ ...prev, [`prog-${pt.id}`]: !prev[`prog-${pt.id}`] }))}
                          className={`text-[10px] font-medium px-2 py-1 rounded-md transition-colors ${
                            showAba ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          {showAba ? "ABA View" : "Standard View"} — click to switch
                        </button>
                      </div>
                      {showAba ? (
                        <AbaGraph
                          target={{
                            id: pt.id,
                            name: pt.name,
                            measurementType: "percentage",
                            targetDirection: "increase",
                            baselineValue: null,
                            goalValue: String(masteryPct),
                          }}
                          data={programTrends.filter((d: any) => d.programTargetId === pt.id).map((d: any) => ({
                            ...d,
                            behaviorTargetId: pt.id,
                            value: d.percentCorrect ?? "0",
                            targetName: d.targetName,
                            measurementType: "percentage",
                          }))}
                          phaseChanges={[]}
                          onPhaseChangesUpdate={() => {}}
                          targetType="program"
                        />
                      ) : (
                        <InteractiveChart
                          data={trendData}
                          color={trendColor}
                          gradientId={`grad-nonIep-prog-${pt.id}`}
                          title={pt.name}
                          yLabel="Accuracy"
                          masteryLine={masteryPct}
                          targetDirection="increase"
                          valueFormatter={(v) => `${Math.round(v)}%`}
                          phaseLines={programPhaseLines[pt.id] || []}
                          onPhaseLinesChange={(lines) => setProgramPhaseLines(prev => ({ ...prev, [pt.id]: lines }))}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
