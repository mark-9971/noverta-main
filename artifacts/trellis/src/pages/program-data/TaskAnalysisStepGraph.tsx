import { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import {
  getProgramTargetStepTrends,
  type ProgramStepInfo,
  type StepTrendPoint,
} from "@workspace/api-client-react";
import { CheckCircle, Circle, Loader2, BarChart3, List } from "lucide-react";
import { ProgramTarget } from "./constants";

interface Props {
  target: ProgramTarget;
}

const STEP_LINE_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#64748b",
];

function stepColor(s: ProgramStepInfo, currentStep: number): string {
  if (s.mastered) return "#10b981";
  if (s.stepNumber === currentStep) return "#3b82f6";
  return "#d1d5db";
}

function stepLabel(s: ProgramStepInfo, currentStep: number): string {
  if (s.mastered) return "Mastered";
  if (s.stepNumber === currentStep) return "Current";
  if (s.stepNumber < currentStep) return "Active";
  return "Pending";
}

type ViewMode = "ladder" | "lines";

export function TaskAnalysisStepGraph({ target }: Props) {
  const [steps, setSteps] = useState<ProgramStepInfo[]>([]);
  const [trends, setTrends] = useState<StepTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("ladder");

  useEffect(() => {
    setLoading(true);
    getProgramTargetStepTrends(target.id)
      .then(d => { setSteps(d.steps); setTrends(d.trends); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [target.id]);

  const currentStep = target.currentStep ?? 1;
  const masteredCount = steps.filter(s => s.mastered).length;

  /* Build multi-line chart data: one row per session date, one key per step */
  const { chartData, stepKeys } = useMemo(() => {
    if (!trends.length) return { chartData: [], stepKeys: [] };

    const dates = [...new Set(trends.map(t => t.sessionDate))].sort();
    const stepNums = [...new Set(trends.map(t => t.stepNumber).filter(n => n != null))] as number[];
    stepNums.sort((a, b) => a - b);

    const byDateStep: Record<string, Record<number, number>> = {};
    for (const t of trends) {
      if (t.stepNumber == null) continue;
      if (!byDateStep[t.sessionDate]) byDateStep[t.sessionDate] = {};
      byDateStep[t.sessionDate][t.stepNumber] = parseFloat(t.percentCorrect ?? "0");
    }

    const rows = dates.map(date => {
      const row: Record<string, any> = { date };
      for (const sn of stepNums) {
        row[`step_${sn}`] = byDateStep[date]?.[sn] ?? null;
      }
      return row;
    });

    return { chartData: rows, stepKeys: stepNums };
  }, [trends]);

  const hasTrendData = trends.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-[11px]">Loading step data…</span>
      </div>
    );
  }

  if (!steps.length) {
    return (
      <p className="text-[11px] text-gray-400 py-2">
        No steps defined for this program yet. Add steps in the program editor to enable step-level analysis.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Summary Bar ── */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[11px] font-semibold text-gray-700">
            {masteredCount} / {steps.length} steps mastered
          </span>
          {steps.length > 0 && (
            <div className="mt-1 flex h-2 rounded-full overflow-hidden w-48 bg-gray-100">
              {steps.map(s => (
                <div
                  key={s.stepNumber}
                  className="h-full flex-1"
                  style={{ backgroundColor: stepColor(s, currentStep) }}
                  title={`Step ${s.stepNumber}: ${s.name} — ${stepLabel(s, currentStep)}`}
                />
              ))}
            </div>
          )}
        </div>

        {hasTrendData && (
          <div className="flex gap-1">
            <button
              onClick={() => setView("ladder")}
              className={`p-1 rounded text-[10px] flex items-center gap-0.5 ${view === "ladder" ? "bg-blue-50 text-blue-600" : "text-gray-400 hover:text-gray-600"}`}
            >
              <List className="w-3 h-3" /> Steps
            </button>
            <button
              onClick={() => setView("lines")}
              className={`p-1 rounded text-[10px] flex items-center gap-0.5 ${view === "lines" ? "bg-blue-50 text-blue-600" : "text-gray-400 hover:text-gray-600"}`}
            >
              <BarChart3 className="w-3 h-3" /> Graph
            </button>
          </div>
        )}
      </div>

      {/* ── Step Ladder / List ── */}
      {view === "ladder" && (
        <div className="space-y-1">
          {steps.map((s, i) => {
            const isCurrent = s.stepNumber === currentStep && !s.mastered;
            const sessionData = trends.filter(t => t.stepNumber === s.stepNumber);
            const lastSession = sessionData.length
              ? sessionData[sessionData.length - 1]
              : null;

            return (
              <div
                key={s.stepNumber}
                className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${
                  s.mastered
                    ? "bg-emerald-50 border border-emerald-100"
                    : isCurrent
                    ? "bg-blue-50 border border-blue-100"
                    : "bg-gray-50 border border-gray-100"
                }`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {s.mastered ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Circle className={`w-3.5 h-3.5 ${isCurrent ? "text-blue-400" : "text-gray-300"}`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[10px] font-bold flex-shrink-0 ${
                      s.mastered ? "text-emerald-600" : isCurrent ? "text-blue-600" : "text-gray-400"
                    }`}>
                      Step {s.stepNumber}
                    </span>
                    {isCurrent && (
                      <span className="text-[9px] bg-blue-100 text-blue-600 px-1 rounded font-medium">Current</span>
                    )}
                    {s.mastered && (
                      <span className="text-[9px] bg-emerald-100 text-emerald-600 px-1 rounded font-medium">Mastered</span>
                    )}
                    <span className="text-[11px] text-gray-700 font-medium truncate">{s.name}</span>
                  </div>
                  {s.sdInstruction && (
                    <p className="text-[9px] text-gray-400 truncate mt-0.5">SD: {s.sdInstruction}</p>
                  )}
                  {lastSession && (
                    <p className="text-[9px] text-gray-500 mt-0.5">
                      Last: {parseFloat(lastSession.percentCorrect ?? "0").toFixed(0)}% correct
                      <span className="text-gray-400"> ({lastSession.sessionDate})</span>
                      {lastSession.promptLevelUsed && (
                        <span className="text-gray-400"> · {lastSession.promptLevelUsed}</span>
                      )}
                    </p>
                  )}
                </div>
                {/* Minibar */}
                {sessionData.length > 0 && (
                  <div className="flex-shrink-0 flex items-end gap-px h-5">
                    {sessionData.slice(-8).map((t, si) => (
                      <div
                        key={si}
                        className="w-1 rounded-sm"
                        style={{
                          height: `${Math.max(2, parseFloat(t.percentCorrect ?? "0") / 100 * 20)}px`,
                          backgroundColor: s.mastered ? "#10b981" : isCurrent ? "#3b82f6" : "#9ca3af",
                        }}
                        title={`${t.sessionDate}: ${t.percentCorrect}%`}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Multi-Line Step Graph ── */}
      {view === "lines" && hasTrendData && (
        <div>
          <p className="text-[9px] text-gray-400 mb-1">% correct by session, per step</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 7, fill: "#9ca3af" }}
                tickFormatter={d => {
                  const parts = d.split("-");
                  return parts.length === 3 ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : d;
                }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 7, fill: "#9ca3af" }}
                tickFormatter={v => `${v}%`}
              />
              <Tooltip
                contentStyle={{ fontSize: 9, padding: "4px 8px" }}
                formatter={(value: any, name: string) => {
                  const sn = parseInt(name.replace("step_", ""));
                  const step = steps.find(s => s.stepNumber === sn);
                  return [`${value}%`, step ? `Step ${sn}: ${step.name}` : name];
                }}
              />
              <ReferenceLine y={target.masteryCriterionPercent ?? 80} stroke="#10b981" strokeDasharray="4 2" strokeWidth={1} />
              {stepKeys.map((sn, i) => (
                <Line
                  key={`step_${sn}`}
                  type="monotone"
                  dataKey={`step_${sn}`}
                  stroke={STEP_LINE_COLORS[i % STEP_LINE_COLORS.length]}
                  strokeWidth={1.5}
                  dot={{ r: 3 }}
                  connectNulls={false}
                  name={`step_${sn}`}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 mt-1">
            {stepKeys.map((sn, i) => {
              const step = steps.find(s => s.stepNumber === sn);
              return (
                <div key={sn} className="flex items-center gap-1">
                  <div className="w-2.5 h-0.5 rounded" style={{ backgroundColor: STEP_LINE_COLORS[i % STEP_LINE_COLORS.length] }} />
                  <span className="text-[9px] text-gray-500">
                    S{sn}{step ? `: ${step.name.slice(0, 18)}${step.name.length > 18 ? "…" : ""}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
          {!hasTrendData && (
            <p className="text-[10px] text-gray-400 mt-1">
              No step-level session data yet. Data recorded from this point forward will appear here.
            </p>
          )}
        </div>
      )}

      <p className="text-[9px] text-gray-400">
        Step tracking started recording with each session going forward.
        {!hasTrendData && " Older sessions without step tracking show only the step ladder."}
      </p>
    </div>
  );
}
