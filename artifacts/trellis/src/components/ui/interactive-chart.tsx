import { useState, useMemo, useCallback, useRef } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Dot,
} from "recharts";
import { Maximize2, Minimize2, Filter, Plus, X, Calendar, Users, Download, FileText } from "lucide-react";
import { toPng } from "html-to-image";
import { toast } from "sonner";

interface DataPoint {
  date: string;
  value: number;
  staffId?: number | null;
  staffName?: string | null;
  notes?: string | null;
  trialsCorrect?: number | null;
  trialsTotal?: number | null;
  sessionType?: string | null;
  dataSessionId?: number;
  [key: string]: unknown;
}

interface PhaseLine {
  id: string;
  date: string;
  label: string;
  color?: string;
}

interface InteractiveChartProps {
  data: DataPoint[];
  color: string;
  gradientId: string;
  title?: string;
  yLabel?: string;
  baselineLine?: number | null;
  goalLine?: number | null;
  masteryLine?: number | null;
  targetDirection?: "increase" | "decrease";
  phaseLines?: PhaseLine[];
  onPhaseLinesChange?: (lines: PhaseLine[]) => void;
  sparklineWidth?: number;
  sparklineHeight?: number;
  valueFormatter?: (v: number) => string;
  initialExpanded?: boolean;
  hideCollapse?: boolean;
  exportFilename?: string;
}

function formatChartDate(d: string) {
  if (!d) return "";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatShortDate(d: string) {
  if (!d) return "";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

const PHASE_COLORS = ["#8b5cf6", "#ec4899", "#f59e0b", "#06b6d4", "#84cc16"];

const TOUCH_TARGET_R = 22;

export function InteractiveChart({
  data,
  color,
  gradientId,
  title,
  yLabel,
  baselineLine,
  goalLine,
  masteryLine,
  targetDirection,
  phaseLines: externalPhaseLines,
  onPhaseLinesChange,
  sparklineWidth = 140,
  sparklineHeight = 48,
  valueFormatter = (v) => String(v),
  initialExpanded = false,
  hideCollapse = false,
  exportFilename,
}: InteractiveChartProps) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [highlightedIdx, setHighlightedIdx] = useState<number | null>(null);
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [newPhaseDate, setNewPhaseDate] = useState("");
  const [newPhaseLabel, setNewPhaseLabel] = useState("");
  const [exporting, setExporting] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const phaseLines = externalPhaseLines ?? [];

  const staffList = useMemo(() => {
    const map = new Map<string, string>();
    data.forEach((d) => {
      if (d.staffId && d.staffName) map.set(String(d.staffId), d.staffName as string);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  const filteredData = useMemo(() => {
    let filtered = data;
    if (staffFilter !== "all") {
      filtered = filtered.filter((d) => String(d.staffId) === staffFilter);
    }
    if (dateFrom) {
      filtered = filtered.filter((d) => d.date >= dateFrom);
    }
    if (dateTo) {
      filtered = filtered.filter((d) => d.date <= dateTo);
    }
    return filtered;
  }, [data, staffFilter, dateFrom, dateTo]);

  const hasActiveFilters = staffFilter !== "all" || dateFrom || dateTo;

  const clearFilters = useCallback(() => {
    setStaffFilter("all");
    setDateFrom("");
    setDateTo("");
  }, []);

  const addPhaseLine = useCallback(() => {
    if (!newPhaseDate || !newPhaseLabel) return;
    const newLine: PhaseLine = {
      id: `phase-${Date.now()}`,
      date: newPhaseDate,
      label: newPhaseLabel,
      color: PHASE_COLORS[phaseLines.length % PHASE_COLORS.length],
    };
    onPhaseLinesChange?.([...phaseLines, newLine]);
    setNewPhaseDate("");
    setNewPhaseLabel("");
    setShowAddPhase(false);
  }, [newPhaseDate, newPhaseLabel, phaseLines, onPhaseLinesChange]);

  const removePhaseLine = useCallback(
    (id: string) => {
      onPhaseLinesChange?.(phaseLines.filter((p) => p.id !== id));
    },
    [phaseLines, onPhaseLinesChange]
  );

  const handleExportPng = useCallback(async () => {
    if (!chartContainerRef.current || exporting) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(chartContainerRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
      });
      const rawName = exportFilename || title || "chart";
      const safeName = rawName.replace(/[^a-zA-Z0-9_\-\s]/g, "").replace(/\s+/g, "-").slice(0, 100);
      const link = document.createElement("a");
      link.download = `${safeName}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("Chart exported");
    } catch {
      toast.error("Failed to export chart image");
    }
    setExporting(false);
  }, [exporting, exportFilename, title]);

  const customDotRenderer = useCallback(
    (props: Record<string, unknown>) => {
      const { cx, cy, index } = props as { cx: number; cy: number; index: number };
      const isHighlighted = highlightedIdx === index;
      return (
        <g>
          <circle
            cx={cx}
            cy={cy}
            r={TOUCH_TARGET_R}
            fillOpacity={0}
            stroke="none"
            style={{ cursor: "pointer", pointerEvents: "all" }}
            onClick={() => setHighlightedIdx(isHighlighted ? null : index)}
          />
          <Dot
            cx={cx}
            cy={cy}
            r={isHighlighted ? 6 : 3}
            fill={isHighlighted ? color : "#fff"}
            stroke={color}
            strokeWidth={isHighlighted ? 2.5 : 1.5}
            style={{ cursor: "pointer", transition: "all 0.15s", pointerEvents: "none" }}
          />
        </g>
      );
    },
    [highlightedIdx, color]
  );

  const customTooltipRenderer = useCallback(
    ({ active, payload }: { active?: boolean; payload?: Array<{ payload: DataPoint }> }) => {
      if (!active || !payload?.length) return null;
      const d = payload[0].payload;
      return (
        <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-lg text-xs">
          <p className="font-medium text-gray-700">{formatChartDate(d.date)}</p>
          <p className="text-gray-600 mt-0.5">
            {yLabel || "Value"}: <span className="font-bold" style={{ color }}>{valueFormatter(d.value)}</span>
          </p>
          {d.trialsCorrect != null && d.trialsTotal != null && (
            <p className="text-gray-400 mt-0.5">{d.trialsCorrect}/{d.trialsTotal} trials</p>
          )}
          {d.staffName && (
            <p className="text-gray-400 mt-0.5">Staff: {d.staffName}</p>
          )}
        </div>
      );
    },
    [color, yLabel, valueFormatter]
  );

  const yDomain = useMemo(() => {
    const values = filteredData.map((d) => d.value);
    const refValues = [
      ...(baselineLine != null ? [baselineLine] : []),
      ...(goalLine != null ? [goalLine] : []),
      ...(masteryLine != null ? [masteryLine] : []),
    ];
    const allVals = [...values, ...refValues];
    if (allVals.length === 0) return [0, 10] as [number, number];
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const pad = Math.max((max - min) * 0.15, 1);
    return [Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)] as [number, number];
  }, [filteredData, baselineLine, goalLine, masteryLine]);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="group relative cursor-pointer flex-shrink-0"
        style={{ width: sparklineWidth, height: sparklineHeight }}
        title="Click to expand chart"
        aria-label={`Expand ${title || "chart"}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${gradientId})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 bg-gray-900/0 group-hover:bg-gray-900/5 rounded transition-colors flex items-center justify-center">
          <Maximize2 className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </button>
    );
  }

  const highlightedPoint = highlightedIdx !== null ? filteredData[highlightedIdx] : null;

  return (
    <div className="border border-gray-200 rounded-xl bg-white shadow-sm mt-2 mb-1 overflow-hidden w-full">
      {/* Header — wraps on small screens */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 px-4 pt-3 pb-1">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {title && <h4 className="text-xs font-semibold text-gray-600 truncate">{title}</h4>}
          <span className="text-[10px] text-gray-400 whitespace-nowrap">{filteredData.length} data points</span>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-[10px] text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5 whitespace-nowrap">
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={handleExportPng}
            disabled={exporting}
            className="p-2 rounded-md transition-colors text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-40"
            title="Export chart as PNG"
            aria-label="Export chart as PNG"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-md transition-colors ${showFilters ? "bg-emerald-50 text-emerald-700" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"}`}
            title="Filters"
            aria-label="Toggle filters"
          >
            <Filter className="w-3.5 h-3.5" />
          </button>
          {onPhaseLinesChange && (
            <button
              onClick={() => setShowAddPhase(!showAddPhase)}
              className={`p-2 rounded-md transition-colors ${showAddPhase ? "bg-emerald-50 text-emerald-600" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"}`}
              title="Add phase line"
              aria-label="Add phase line"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          {!hideCollapse && (
            <button
              onClick={() => { setExpanded(false); setHighlightedIdx(null); }}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              title="Collapse chart"
              aria-label="Collapse chart"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter panel — stacks to column on mobile */}
      {showFilters && (
        <div className="px-4 py-2 bg-gray-50 border-y border-gray-100 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
          {staffList.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <select
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-300 w-full sm:w-auto"
              >
                <option value="all">All Staff</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-300 flex-1 min-w-0"
              placeholder="From"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-300 flex-1 min-w-0"
              placeholder="To"
            />
          </div>
        </div>
      )}

      {/* Add-phase panel — label input grows to fill available space */}
      {showAddPhase && (
        <div className="px-4 py-2 bg-emerald-50/50 border-y border-emerald-100 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
          <span className="text-xs font-medium text-emerald-700 whitespace-nowrap">Add Phase Line:</span>
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <input
              type="date"
              value={newPhaseDate}
              onChange={(e) => setNewPhaseDate(e.target.value)}
              className="text-xs border border-emerald-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-300 flex-shrink-0"
            />
            <input
              type="text"
              value={newPhaseLabel}
              onChange={(e) => setNewPhaseLabel(e.target.value)}
              placeholder="Label (e.g., Med change, New BIP)"
              className="text-xs border border-emerald-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-300 flex-1 min-w-0"
              onKeyDown={(e) => e.key === "Enter" && addPhaseLine()}
            />
            <button
              onClick={addPhaseLine}
              disabled={!newPhaseDate || !newPhaseLabel}
              className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {phaseLines.length > 0 && (
        <div className="px-4 py-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-gray-400 font-medium">Phase lines:</span>
          {phaseLines.map((pl) => (
            <span
              key={pl.id}
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border"
              style={{ borderColor: pl.color, color: pl.color, backgroundColor: `${pl.color}08` }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: pl.color }} />
              {pl.label} ({formatShortDate(pl.date)})
              {onPhaseLinesChange && (
                <button
                  onClick={() => removePhaseLine(pl.id)}
                  className="hover:opacity-70 ml-0.5 p-0.5"
                  aria-label={`Remove ${pl.label} phase line`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Chart area — full width, touch-friendly */}
      <div ref={chartContainerRef} className="px-3 pb-3 pt-1 w-full">
        {filteredData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={filteredData} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id={`${gradientId}-exp`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                width={35}
                tickFormatter={(v: number) => valueFormatter(v)}
              />
              <Tooltip content={customTooltipRenderer} />

              {baselineLine != null && (
                <ReferenceLine
                  y={baselineLine}
                  stroke="#94a3b8"
                  strokeDasharray="6 3"
                  strokeWidth={1}
                  label={{ value: `Baseline: ${valueFormatter(baselineLine)}`, position: "insideTopRight", fontSize: 10, fill: "#94a3b8" }}
                />
              )}
              {goalLine != null && (
                <ReferenceLine
                  y={goalLine}
                  stroke="#10b981"
                  strokeDasharray="6 3"
                  strokeWidth={1}
                  label={{ value: `Goal: ${valueFormatter(goalLine)}`, position: "insideTopRight", fontSize: 10, fill: "#10b981" }}
                />
              )}
              {masteryLine != null && (
                <ReferenceLine
                  y={masteryLine}
                  stroke="#059669"
                  strokeDasharray="6 3"
                  strokeWidth={1}
                  label={{ value: `Mastery: ${valueFormatter(masteryLine)}%`, position: "insideTopRight", fontSize: 10, fill: "#059669" }}
                />
              )}

              {phaseLines.map((pl) => (
                <ReferenceLine
                  key={pl.id}
                  x={pl.date}
                  stroke={pl.color || "#8b5cf6"}
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{ value: pl.label, position: "insideTopLeft", fontSize: 9, fill: pl.color || "#8b5cf6", angle: -90, offset: 10 }}
                />
              ))}

              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradientId}-exp)`}
                dot={customDotRenderer}
                activeDot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[220px] flex items-center justify-center text-xs text-gray-400">
            No data points match the current filters.
          </div>
        )}
      </div>

      {/* Highlighted data point detail panel */}
      {highlightedPoint && (
        <div className="px-4 pb-3">
          <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium text-gray-600">
                  {formatChartDate(highlightedPoint.date)}
                </span>
                <span className="text-xs font-bold" style={{ color }}>
                  {valueFormatter(highlightedPoint.value)}
                </span>
                {highlightedPoint.staffName && (
                  <span className="text-[10px] text-gray-400">
                    by {highlightedPoint.staffName}
                  </span>
                )}
              </div>
              <button
                onClick={() => setHighlightedIdx(null)}
                className="p-1 text-gray-400 hover:text-gray-600"
                aria-label="Close detail panel"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            {(highlightedPoint.trialsCorrect != null && highlightedPoint.trialsTotal != null) && (
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <span className="font-medium">Trials:</span>
                <span>{highlightedPoint.trialsCorrect}/{highlightedPoint.trialsTotal} correct ({highlightedPoint.trialsTotal > 0 ? Math.round((highlightedPoint.trialsCorrect / highlightedPoint.trialsTotal) * 100) : 0}%)</span>
              </div>
            )}
            {highlightedPoint.sessionType && (
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <span className="font-medium">Type:</span>
                <span className="capitalize">{highlightedPoint.sessionType}</span>
              </div>
            )}
            {highlightedPoint.notes && (
              <div className="text-[11px] text-gray-500 mt-1">
                <div className="flex items-center gap-1 font-medium text-gray-600 mb-0.5">
                  <FileText className="w-3 h-3" />
                  Session Notes
                </div>
                <p className="text-gray-500 leading-relaxed">{highlightedPoint.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
