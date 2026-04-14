import { useState, useRef, useCallback, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Download, Plus, Trash2, TrendingUp, Target, Calendar, X, Save, ChevronDown, ChevronUp
} from "lucide-react";
import { toast } from "sonner";

const API = "/api";

interface PhaseChange {
  id: number;
  behaviorTargetId: number;
  changeDate: string;
  label: string;
  notes?: string;
}

interface BehaviorTarget {
  id: number;
  name: string;
  measurementType: string;
  targetDirection: string;
  baselineValue: string | null;
  goalValue: string | null;
}

interface TrendPoint {
  sessionDate: string;
  value: string;
  behaviorTargetId: number;
  targetName: string;
  measurementType: string;
}

interface AbaGraphProps {
  target: BehaviorTarget;
  data: TrendPoint[];
  phaseChanges: PhaseChange[];
  onPhaseChangesUpdate: () => void;
  readOnly?: boolean;
}

function leastSquaresLine(points: { x: number; y: number }[]) {
  if (points.length < 2) return null;
  const n = points.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function measureLabel(t: string) {
  if (t === "frequency") return "Count";
  if (t === "interval") return "% Intervals";
  if (t === "duration") return "Duration (sec)";
  return "Value";
}

export function AbaGraph({ target, data, phaseChanges, onPhaseChangesUpdate, readOnly }: AbaGraphProps) {
  const [showTrend, setShowTrend] = useState(true);
  const [showAim, setShowAim] = useState(true);
  const [addingPhase, setAddingPhase] = useState(false);
  const [newPhaseDate, setNewPhaseDate] = useState("");
  const [newPhaseLabel, setNewPhaseLabel] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const chartRef = useRef<HTMLDivElement>(null);

  const chartData = useMemo(() => {
    const sorted = [...data]
      .filter(d => {
        if (d.behaviorTargetId !== target.id) return false;
        if (dateFrom && d.sessionDate < dateFrom) return false;
        if (dateTo && d.sessionDate > dateTo) return false;
        return true;
      })
      .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));

    return sorted.map((d, i) => ({
      date: d.sessionDate,
      value: parseFloat(d.value),
      index: i,
    }));
  }, [data, target.id, dateFrom, dateTo]);

  const trendLine = useMemo(() => {
    if (!showTrend || chartData.length < 3) return null;
    const points = chartData.map((d, i) => ({ x: i, y: d.value }));
    return leastSquaresLine(points);
  }, [showTrend, chartData]);

  const trendData = useMemo(() => {
    if (!trendLine || chartData.length < 2) return [];
    return chartData.map((d, i) => ({
      ...d,
      trend: Math.max(0, trendLine.slope * i + trendLine.intercept),
    }));
  }, [trendLine, chartData]);

  const aimData = useMemo(() => {
    if (!showAim || !target.baselineValue || !target.goalValue || chartData.length < 2) return [];
    const baseline = parseFloat(target.baselineValue);
    const goal = parseFloat(target.goalValue);
    const n = chartData.length;
    return chartData.map((d, i) => ({
      ...d,
      aim: baseline + ((goal - baseline) * i) / (n - 1),
    }));
  }, [showAim, target, chartData]);

  const displayData = useMemo(() => {
    return chartData.map((d, i) => ({
      ...d,
      trend: trendData[i]?.trend,
      aim: aimData[i]?.aim,
    }));
  }, [chartData, trendData, aimData]);

  async function handleAddPhase() {
    if (!newPhaseDate || !newPhaseLabel) return;
    try {
      const res = await fetch(`${API}/behavior-targets/${target.id}/phase-changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeDate: newPhaseDate, label: newPhaseLabel }),
      });
      if (res.ok) {
        toast.success("Phase change added");
        setAddingPhase(false);
        setNewPhaseDate("");
        setNewPhaseLabel("");
        onPhaseChangesUpdate();
      }
    } catch {
      toast.error("Failed to add phase change");
    }
  }

  async function handleDeletePhase(id: number) {
    try {
      await fetch(`${API}/phase-changes/${id}`, { method: "DELETE" });
      toast.success("Phase change removed");
      onPhaseChangesUpdate();
    } catch {
      toast.error("Failed to delete phase change");
    }
  }

  const exportChart = useCallback(async (format: "png" | "svg") => {
    const container = chartRef.current;
    if (!container) return;

    const svg = container.querySelector("svg");
    if (!svg) return;

    const svgClone = svg.cloneNode(true) as SVGElement;
    svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svgClone.style.backgroundColor = "white";

    if (format === "svg") {
      const blob = new Blob([new XMLSerializer().serializeToString(svgClone)], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${target.name.replace(/\s+/g, "_")}_graph.svg`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("SVG exported");
      return;
    }

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      ctx.scale(2, 2);
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, img.width, img.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${target.name.replace(/\s+/g, "_")}_graph.png`;
        a.click();
        toast.success("PNG exported");
      }, "image/png");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [target.name]);

  const trendDir = trendLine
    ? trendLine.slope > 0.1 ? "up" : trendLine.slope < -0.1 ? "down" : "flat"
    : null;

  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 cursor-pointer min-w-0" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
            <CardTitle className="text-sm font-semibold text-gray-700 truncate">{target.name}</CardTitle>
            <span className="text-[10px] text-gray-400 flex-shrink-0">
              {measureLabel(target.measurementType)} · {target.targetDirection}
            </span>
            {trendDir && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                (trendDir === "down" && target.targetDirection === "decrease") || (trendDir === "up" && target.targetDirection === "increase")
                  ? "bg-emerald-50 text-emerald-600" : trendDir === "flat" ? "bg-gray-100 text-gray-500" : "bg-red-50 text-red-500"
              }`}>
                {trendDir === "up" ? "↑ Increasing" : trendDir === "down" ? "↓ Decreasing" : "→ Stable"}
              </span>
            )}
          </div>
          {expanded && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => setShowTrend(!showTrend)}
                className={`text-[10px] px-2 py-1 rounded ${showTrend ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}
              >
                <TrendingUp className="w-3 h-3 inline mr-0.5" />Trend
              </button>
              <button
                onClick={() => setShowAim(!showAim)}
                className={`text-[10px] px-2 py-1 rounded ${showAim ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}
              >
                <Target className="w-3 h-3 inline mr-0.5" />Aim
              </button>
              <button
                onClick={() => exportChart("png")}
                className="text-[10px] px-2 py-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200"
              >
                <Download className="w-3 h-3 inline mr-0.5" />PNG
              </button>
              <button
                onClick={() => exportChart("svg")}
                className="text-[10px] px-2 py-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200"
              >
                <Download className="w-3 h-3 inline mr-0.5" />SVG
              </button>
            </div>
          )}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-3">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-[10px] text-gray-500">Date Range:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="text-[10px] border border-gray-200 rounded px-1.5 py-0.5"
              placeholder="From"
            />
            <span className="text-[10px] text-gray-400">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="text-[10px] border border-gray-200 rounded px-1.5 py-0.5"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="text-[10px] text-gray-400 hover:text-gray-600 px-1"
              >
                <X className="w-3 h-3" />
              </button>
            )}
            <span className="text-[9px] text-gray-400 ml-auto">{chartData.length} pts</span>
          </div>
          {chartData.length > 0 ? (
            <div ref={chartRef}>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={displayData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    tickFormatter={d => {
                      const date = new Date(d + "T12:00:00");
                      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    label={{ value: measureLabel(target.measurementType), angle: -90, position: "insideLeft", fontSize: 10, fill: "#9ca3af" }}
                  />
                  <Tooltip
                    labelFormatter={d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    formatter={(v: any, name: string) => {
                      if (name === "trend") return [`${Number(v).toFixed(1)}`, "Trend Line"];
                      if (name === "aim") return [`${Number(v).toFixed(1)}`, "Aim Line"];
                      return [v, target.name];
                    }}
                  />

                  <Line
                    type="linear"
                    dataKey="value"
                    stroke="#059669"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "#059669", stroke: "#fff", strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                    name={target.name}
                    connectNulls
                  />

                  {showTrend && trendLine && (
                    <Line
                      type="linear"
                      dataKey="trend"
                      stroke="#6b7280"
                      strokeWidth={1.5}
                      strokeDasharray="8 4"
                      dot={false}
                      name="trend"
                      connectNulls
                    />
                  )}

                  {showAim && aimData.length > 0 && (
                    <Line
                      type="linear"
                      dataKey="aim"
                      stroke="#059669"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      strokeOpacity={0.5}
                      dot={false}
                      name="aim"
                      connectNulls
                    />
                  )}

                  {target.goalValue && (
                    <ReferenceLine
                      y={parseFloat(target.goalValue)}
                      stroke="#059669"
                      strokeDasharray="5 5"
                      strokeOpacity={0.4}
                      label={{ value: `Goal: ${target.goalValue}`, position: "right", fontSize: 10, fill: "#059669" }}
                    />
                  )}

                  {target.baselineValue && (
                    <ReferenceLine
                      y={parseFloat(target.baselineValue)}
                      stroke="#9ca3af"
                      strokeDasharray="5 5"
                      strokeOpacity={0.4}
                      label={{ value: `Baseline: ${target.baselineValue}`, position: "right", fontSize: 10, fill: "#9ca3af" }}
                    />
                  )}

                  {phaseChanges.map(pc => (
                    <ReferenceLine
                      key={pc.id}
                      x={pc.changeDate}
                      stroke="#374151"
                      strokeDasharray="6 3"
                      strokeWidth={1.5}
                      label={{ value: pc.label, position: "top", fontSize: 9, fill: "#374151" }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-12 text-center text-gray-400 text-sm">
              No data points yet for this target.
            </div>
          )}

          <div className="mt-3 border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-gray-500">Phase Changes</span>
              {!readOnly && (
                <button
                  onClick={() => setAddingPhase(!addingPhase)}
                  className="text-[10px] text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" /> Add Phase
                </button>
              )}
            </div>

            {addingPhase && (
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <input
                  type="date"
                  value={newPhaseDate}
                  onChange={e => setNewPhaseDate(e.target.value)}
                  className="text-[11px] border border-gray-200 rounded px-2 py-1"
                />
                <input
                  type="text"
                  value={newPhaseLabel}
                  onChange={e => setNewPhaseLabel(e.target.value)}
                  placeholder="Phase label (e.g., Intervention B)"
                  className="text-[11px] border border-gray-200 rounded px-2 py-1 flex-1 min-w-[150px]"
                />
                <Button size="sm" className="h-6 text-[10px] bg-emerald-700 hover:bg-emerald-800 text-white" onClick={handleAddPhase}>
                  <Save className="w-3 h-3 mr-0.5" /> Save
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setAddingPhase(false)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}

            {phaseChanges.length > 0 ? (
              <div className="space-y-1">
                {phaseChanges.map(pc => (
                  <div key={pc.id} className="flex items-center justify-between text-[11px] px-2 py-1.5 bg-gray-50 rounded">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3 text-gray-400" />
                      <span className="text-gray-500">{new Date(pc.changeDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                      <span className="font-medium text-gray-700">{pc.label}</span>
                    </div>
                    {!readOnly && (
                      <button onClick={() => handleDeletePhase(pc.id)} className="text-gray-400 hover:text-red-500">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-gray-400">No phase changes marked.</p>
            )}
          </div>

          <div className="mt-2 grid grid-cols-4 gap-2 text-center">
            <div className="bg-gray-50 rounded p-1.5">
              <p className="text-[9px] text-gray-400">Data Pts</p>
              <p className="text-[13px] font-bold text-gray-700">{chartData.length}</p>
            </div>
            <div className="bg-gray-50 rounded p-1.5">
              <p className="text-[9px] text-gray-400">Baseline</p>
              <p className="text-[13px] font-bold text-gray-600">{target.baselineValue ?? "—"}</p>
            </div>
            <div className="bg-gray-50 rounded p-1.5">
              <p className="text-[9px] text-gray-400">Current</p>
              <p className="text-[13px] font-bold text-emerald-700">
                {chartData.length > 0 ? chartData[chartData.length - 1].value : "—"}
              </p>
            </div>
            <div className="bg-gray-50 rounded p-1.5">
              <p className="text-[9px] text-gray-400">Goal</p>
              <p className="text-[13px] font-bold text-emerald-600">{target.goalValue ?? "—"}</p>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

interface IoaSummaryProps {
  studentId: number;
}

export function IoaSummary({ studentId }: IoaSummaryProps) {
  const [ioaData, setIoaData] = useState<Record<number, {
    targetName: string;
    sessions: Array<{
      ioaSessionId: number;
      sessionDate: string;
      observer1Value: number;
      observer2Value: number;
      agreementPercent: number;
      measurementType: string;
      ioaMethod?: string;
      observer1Name?: string;
      observer2Name?: string;
    }>;
    averageAgreement: number;
    meetsThreshold: boolean;
  }> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadIoa() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/students/${studentId}/ioa-summary`);
      if (res.ok) {
        const data = await res.json();
        setIoaData(data);
      }
    } catch {}
    setLoading(false);
    setLoaded(true);
  }

  if (!loaded) {
    return (
      <Card>
        <CardContent className="p-4 text-center">
          <Button variant="outline" size="sm" className="text-[12px]" onClick={loadIoa} disabled={loading}>
            {loading ? "Loading..." : "Load IOA Summary"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!ioaData || Object.keys(ioaData).length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-gray-400 text-center">No IOA sessions recorded yet. Flag a data collection session as IOA to begin tracking inter-observer agreement.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {Object.entries(ioaData).map(([targetId, data]) => (
        <Card key={targetId}>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-700">{data.targetName}</CardTitle>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                data.meetsThreshold ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
              }`}>
                Avg: {data.averageAgreement}% {data.meetsThreshold ? "✓" : "— Below 80%"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="space-y-1">
              {data.sessions.map(s => (
                <div key={s.ioaSessionId} className="flex items-center justify-between text-[11px] px-2 py-1.5 bg-gray-50 rounded">
                  <span className="text-gray-500">
                    {new Date(s.sessionDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500">{s.observer1Name || "Obs 1"}: {s.observer1Value}</span>
                    <span className="text-gray-500">{s.observer2Name || "Obs 2"}: {s.observer2Value}</span>
                    <span className={`font-semibold ${s.agreementPercent >= 80 ? "text-emerald-600" : "text-red-500"}`}>
                      {s.agreementPercent}%
                    </span>
                    {s.ioaMethod && (
                      <span className="text-[9px] text-gray-400">
                        {s.ioaMethod === "point_by_point" ? "Point-by-Point" : s.ioaMethod === "total_count" ? "Total Count" : s.ioaMethod === "interval_by_interval" ? "Interval-by-Interval" : s.ioaMethod === "exact_agreement" ? "Exact" : s.ioaMethod || "—"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
