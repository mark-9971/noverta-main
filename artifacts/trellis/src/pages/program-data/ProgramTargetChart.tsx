import { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  listProgramTargetPhaseHistory, type ProgramTargetPhaseHistoryItem,
  listProgramTargetModificationMarkers, createProgramTargetModificationMarker, deleteModificationMarker,
  type ProtocolModificationMarker,
} from "@workspace/api-client-react";
import { TrendingUp, ChevronDown, ChevronUp, Zap, Plus, Trash2, Save, X, Layers } from "lucide-react";
import { toast } from "sonner";
import { TaskAnalysisStepGraph } from "./TaskAnalysisStepGraph";

const MARKER_TYPE_CONFIG: Record<string, { label: string; abbr: string }> = {
  prompt_hierarchy:       { label: "Prompt Hierarchy Changed",       abbr: "PH" },
  operational_definition: { label: "Operational Definition Changed", abbr: "OD" },
  reinforcement_schedule: { label: "Reinforcement Schedule Changed", abbr: "RS" },
  treatment_protocol:     { label: "Treatment Protocol Updated",     abbr: "TP" },
  custom:                 { label: "Protocol Change",                abbr: "⚡" },
};
import { ProgramTarget, TrendPoint, PHASE_CONFIG, ProgramPhase } from "./constants";

export const PHASE_CHART_COLORS: Record<ProgramPhase, string> = {
  baseline: "#9ca3af",
  training: "#3b82f6",
  maintenance: "#a855f7",
  mastered: "#10b981",
  reopened: "#f59e0b",
};

function getPhaseAtDate(
  date: string,
  sorted: ProgramTargetPhaseHistoryItem[],
  fallback: ProgramPhase = "training"
): ProgramPhase {
  let phase: ProgramPhase = fallback;
  for (const h of sorted) {
    const start = h.startedAt.substring(0, 10);
    if (start <= date) {
      phase = h.phase as ProgramPhase;
    } else {
      break;
    }
  }
  return phase;
}

function leastSquares(points: { x: number; y: number }[]) {
  if (points.length < 3) return null;
  const n = points.length;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const p of points) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; }
  const d = n * sxx - sx * sx;
  if (d === 0) return null;
  const slope = (n * sxy - sx * sy) / d;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: { phase: ProgramPhase };
}

function PhaseColoredDot({ cx, cy, payload }: CustomDotProps) {
  if (cx == null || cy == null || payload == null) return null;
  const color = PHASE_CHART_COLORS[payload.phase] ?? "#94a3b8";
  return <circle cx={cx} cy={cy} r={4} fill={color} stroke="#fff" strokeWidth={2} />;
}

interface Props {
  target: ProgramTarget;
  trends: TrendPoint[];
  defaultExpanded?: boolean;
}

export function ProgramTargetChart({ target, trends, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [phaseHistory, setPhaseHistory] = useState<ProgramTargetPhaseHistoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showTrend, setShowTrend] = useState(true);

  /* ── Modification markers ── */
  const [modMarkers, setModMarkers] = useState<ProtocolModificationMarker[]>([]);
  const [addingMarker, setAddingMarker] = useState(false);
  const [newMarkerDate, setNewMarkerDate] = useState("");
  const [newMarkerType, setNewMarkerType] = useState("prompt_hierarchy");
  const [newMarkerLabel, setNewMarkerLabel] = useState("");

  useEffect(() => {
    if (!expanded || loaded) return;
    Promise.all([
      listProgramTargetPhaseHistory(target.id),
      listProgramTargetModificationMarkers(target.id),
    ])
      .then(([h, mm]) => {
        setPhaseHistory(h);
        setModMarkers(mm.sort((a, b) => a.markerDate.localeCompare(b.markerDate)));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [expanded, loaded, target.id]);

  async function handleAddMarker() {
    if (!newMarkerDate || !newMarkerLabel.trim()) return;
    try {
      const created = await createProgramTargetModificationMarker(target.id, {
        markerDate: newMarkerDate,
        markerType: newMarkerType,
        label: newMarkerLabel.trim(),
      });
      setModMarkers(prev => [...prev, created].sort((a, b) => a.markerDate.localeCompare(b.markerDate)));
      toast.success("Protocol modification marker added");
      setAddingMarker(false);
      setNewMarkerDate("");
      setNewMarkerLabel("");
    } catch {
      toast.error("Failed to add marker");
    }
  }

  async function handleDeleteMarker(id: number) {
    try {
      await deleteModificationMarker(id);
      setModMarkers(prev => prev.filter(m => m.id !== id));
      toast.success("Marker removed");
    } catch {
      toast.error("Failed to remove marker");
    }
  }

  const sortedHistory = useMemo(() =>
    [...phaseHistory].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    [phaseHistory]
  );

  const chartData = useMemo(() => {
    return trends
      .filter(t => t.programTargetId === target.id && t.percentCorrect != null)
      .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
      .map((t, i) => ({
        date: t.sessionDate,
        value: parseFloat(t.percentCorrect!),
        index: i,
      }));
  }, [trends, target.id]);

  const trendLine = useMemo(() => {
    if (!showTrend || chartData.length < 3) return null;
    return leastSquares(chartData.map((d, i) => ({ x: i, y: d.value })));
  }, [showTrend, chartData]);

  const displayData = useMemo(() => {
    return chartData.map((d, i) => ({
      ...d,
      phase: getPhaseAtDate(d.date, sortedHistory, (target.phase ?? "training") as ProgramPhase),
      trend: trendLine
        ? Math.max(0, Math.min(100, trendLine.slope * i + trendLine.intercept))
        : undefined,
    }));
  }, [chartData, sortedHistory, trendLine, target.phase]);

  const phaseTransitions = useMemo(() =>
    sortedHistory.map(h => ({
      date: h.startedAt.substring(0, 10),
      phase: h.phase as ProgramPhase,
      label: PHASE_CONFIG[h.phase as ProgramPhase]?.short ?? h.phase,
    })),
    [sortedHistory]
  );

  const phasesPresent = useMemo(
    () => [...new Set(phaseTransitions.map(t => t.phase))],
    [phaseTransitions]
  );

  const masteryCrit = target.masteryCriterionPercent ?? 80;
  const regressionThresh = target.regressionThreshold;

  const dataCount = chartData.length;
  if (dataCount === 0 && !expanded) return null;

  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1.5 text-[11px] text-emerald-700 hover:text-emerald-800 font-medium"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        <TrendingUp className="w-3 h-3" />
        {expanded ? "Hide chart" : `View chart (${dataCount} pts)`}
      </button>

      {expanded && (
        <div className="mt-2">
          {dataCount > 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                {phasesPresent.map(ph => {
                  const cfg = PHASE_CONFIG[ph];
                  const Icon = cfg.icon;
                  return (
                    <span
                      key={ph}
                      className={`flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.color}`}
                      title={cfg.description}
                    >
                      <Icon className="w-2.5 h-2.5" />
                      {cfg.label}
                    </span>
                  );
                })}
                <button
                  onClick={() => setShowTrend(v => !v)}
                  className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium border ${
                    showTrend
                      ? "bg-gray-100 text-gray-600 border-gray-200"
                      : "bg-white text-gray-400 border-gray-100"
                  }`}
                >
                  Trend
                </button>
              </div>

              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={displayData} margin={{ top: 8, right: 56, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: "#9ca3af" }}
                    tickFormatter={d =>
                      new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    }
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "#9ca3af" }}
                    domain={[0, 100]}
                    tickFormatter={v => `${v}%`}
                  />
                  <Tooltip
                    labelFormatter={d =>
                      new Date(d + "T12:00:00").toLocaleDateString("en-US", {
                        month: "long", day: "numeric", year: "numeric",
                      })
                    }
                    formatter={(v: unknown, name: string) => {
                      if (name === "trend") return [`${Number(v).toFixed(1)}%`, "Trend"];
                      return [`${v}%`, "% Correct"];
                    }}
                  />

                  <ReferenceLine
                    y={masteryCrit}
                    stroke="#10b981"
                    strokeDasharray="5 5"
                    strokeOpacity={0.7}
                    label={{ value: `Mastery ${masteryCrit}%`, position: "right", fontSize: 8, fill: "#10b981" }}
                  />

                  {regressionThresh != null && (
                    <ReferenceLine
                      y={regressionThresh}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      strokeOpacity={0.6}
                      label={{ value: `Regr. ${regressionThresh}%`, position: "right", fontSize: 8, fill: "#f59e0b" }}
                    />
                  )}

                  {phaseTransitions.map((pt, i) => (
                    <ReferenceLine
                      key={i}
                      x={pt.date}
                      stroke={PHASE_CHART_COLORS[pt.phase]}
                      strokeWidth={1.5}
                      strokeDasharray="6 3"
                      label={{
                        value: pt.label,
                        position: "top",
                        fontSize: 8,
                        fill: PHASE_CHART_COLORS[pt.phase],
                      }}
                    />
                  ))}

                  {modMarkers.map(m => {
                    const abbr = MARKER_TYPE_CONFIG[m.markerType]?.abbr ?? "⚡";
                    return (
                      <ReferenceLine
                        key={`mm-${m.id}`}
                        x={m.markerDate}
                        stroke="#f97316"
                        strokeDasharray="3 2"
                        strokeWidth={1}
                        strokeOpacity={0.85}
                        label={{ value: `${abbr}`, position: "top", fontSize: 8, fill: "#f97316" }}
                      />
                    );
                  })}

                  <Line
                    type="linear"
                    dataKey="value"
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    dot={<PhaseColoredDot />}
                    activeDot={{ r: 5 }}
                    name="value"
                    connectNulls
                  />

                  {showTrend && trendLine && (
                    <Line
                      type="linear"
                      dataKey="trend"
                      stroke="#6b7280"
                      strokeWidth={1}
                      strokeDasharray="8 4"
                      dot={false}
                      name="trend"
                      connectNulls
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>

              <p className="text-[8px] text-gray-400 text-center mt-0.5">
                Dot color = phase active on that date &nbsp;·&nbsp;
                Vertical dashed = phase transitions &nbsp;·&nbsp;
                <span className="text-orange-400">Orange dotted = protocol modifications</span>
              </p>
            </>
          ) : (
            <p className="text-[11px] text-gray-400 py-4 text-center">No data points yet.</p>
          )}

          {/* ── Protocol Modification Markers ── */}
          <div className="mt-2 border-t border-orange-100 pt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-orange-600 flex items-center gap-0.5">
                <Zap className="w-2.5 h-2.5" /> Protocol Modifications
              </span>
              <button
                onClick={() => setAddingMarker(v => !v)}
                className="text-[9px] text-orange-500 hover:text-orange-600 flex items-center gap-0.5"
              >
                <Plus className="w-2.5 h-2.5" /> Add
              </button>
            </div>

            {addingMarker && (
              <div className="space-y-1 mb-1.5 p-1.5 bg-orange-50 rounded border border-orange-100">
                <div className="flex gap-1 flex-wrap">
                  <input
                    type="date"
                    value={newMarkerDate}
                    onChange={e => setNewMarkerDate(e.target.value)}
                    className="text-[10px] border border-orange-200 rounded px-1.5 py-0.5 bg-white"
                  />
                  <select
                    value={newMarkerType}
                    onChange={e => {
                      setNewMarkerType(e.target.value);
                      if (!newMarkerLabel) setNewMarkerLabel(MARKER_TYPE_CONFIG[e.target.value]?.label ?? "");
                    }}
                    className="text-[10px] border border-orange-200 rounded px-1.5 py-0.5 bg-white flex-1"
                  >
                    {Object.entries(MARKER_TYPE_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  value={newMarkerLabel}
                  onChange={e => setNewMarkerLabel(e.target.value)}
                  placeholder="Brief description"
                  className="w-full text-[10px] border border-orange-200 rounded px-1.5 py-0.5 bg-white"
                />
                <div className="flex gap-1">
                  <button
                    onClick={handleAddMarker}
                    className="text-[9px] px-2 py-0.5 rounded bg-orange-500 text-white flex items-center gap-0.5"
                  >
                    <Save className="w-2.5 h-2.5" /> Save
                  </button>
                  <button
                    onClick={() => setAddingMarker(false)}
                    className="text-[9px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 flex items-center gap-0.5"
                  >
                    <X className="w-2.5 h-2.5" /> Cancel
                  </button>
                </div>
              </div>
            )}

            {modMarkers.length > 0 ? (
              <div className="space-y-0.5">
                {modMarkers.map(m => {
                  const cfg = MARKER_TYPE_CONFIG[m.markerType] ?? MARKER_TYPE_CONFIG.custom;
                  return (
                    <div key={m.id} className="flex items-center justify-between text-[10px] px-1.5 py-1 bg-orange-50 rounded border border-orange-100">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-bold text-orange-500 flex-shrink-0">{cfg.abbr}</span>
                        <span className="text-gray-400 flex-shrink-0">
                          {new Date(m.markerDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                        <span className="text-gray-700 truncate">{m.label}</span>
                      </div>
                      <button onClick={() => handleDeleteMarker(m.id)} className="text-gray-300 hover:text-red-400 flex-shrink-0 ml-1">
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[9px] text-gray-400">No protocol modifications recorded.</p>
            )}
          </div>

          {/* ── Task Analysis Step Graph ── */}
          {target.programType === "task_analysis" && (
            <div className="mt-3 border-t border-blue-100 pt-3">
              <p className="text-[10px] font-semibold text-blue-700 flex items-center gap-1 mb-2">
                <Layers className="w-3 h-3" /> Step-Level Analysis
              </p>
              <TaskAnalysisStepGraph target={target} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
