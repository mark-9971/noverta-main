import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingDown, TrendingUp, Plus, ChevronDown, ChevronUp, Table2 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  BehaviorTarget, TrendPoint, Student, COLORS, measureLabel, INTERVAL_MODE_CONFIG,
} from "./constants";

interface PhaseChange {
  id: number;
  behaviorTargetId: number;
  changeDate: string;
  label: string;
  notes?: string | null;
}

interface Props {
  student: Student | undefined;
  behaviorTargets: BehaviorTarget[];
  behaviorTrends: TrendPoint[];
  phaseChanges?: PhaseChange[];
  onAdd: () => void;
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtDateLong(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function BehaviorsTab({ student, behaviorTargets, behaviorTrends, phaseChanges = [], onAdd }: Props) {
  const [showTable, setShowTable] = useState(false);
  const [tableSortCol, setTableSortCol] = useState<"date" | "target" | "value">("date");
  const [tableSortDir, setTableSortDir] = useState<"asc" | "desc">("desc");

  const behaviorChartData = (() => {
    const byDate: Record<string, any> = {};
    for (const p of behaviorTrends) {
      if (!byDate[p.sessionDate]) byDate[p.sessionDate] = { date: p.sessionDate };
      byDate[p.sessionDate][p.targetName!] = parseFloat(p.value!);
    }
    return Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date));
  })();

  const uniqueBehaviorNames = [...new Set(behaviorTrends.map(t => t.targetName!))];

  // Group phase changes by date (for chart reference lines — one line per unique date)
  const phaseChangesByDate: Record<string, PhaseChange[]> = {};
  for (const pc of phaseChanges) {
    if (!phaseChangesByDate[pc.changeDate]) phaseChangesByDate[pc.changeDate] = [];
    phaseChangesByDate[pc.changeDate].push(pc);
  }
  const phaseChangeDates = Object.keys(phaseChangesByDate);

  // Build sorted table data
  const tableRows = [...behaviorTrends].sort((a, b) => {
    let cmp = 0;
    if (tableSortCol === "date") cmp = a.sessionDate.localeCompare(b.sessionDate);
    else if (tableSortCol === "target") cmp = (a.targetName ?? "").localeCompare(b.targetName ?? "");
    else cmp = parseFloat(a.value ?? "0") - parseFloat(b.value ?? "0");
    return tableSortDir === "asc" ? cmp : -cmp;
  });

  function toggleSort(col: "date" | "target" | "value") {
    if (tableSortCol === col) setTableSortDir(d => d === "asc" ? "desc" : "asc");
    else { setTableSortCol(col); setTableSortDir("asc"); }
  }

  const SortIcon = ({ col }: { col: string }) => (
    tableSortCol === col
      ? tableSortDir === "asc"
        ? <ChevronUp className="w-3 h-3 inline ml-0.5" />
        : <ChevronDown className="w-3 h-3 inline ml-0.5" />
      : null
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <Card className="hidden md:block">
        <CardHeader className="pb-0 flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-600">
            <TrendingDown className="w-4 h-4 inline mr-1.5 text-red-500" />
            Behavior Trends — {student?.firstName} {student?.lastName}
          </CardTitle>
          {phaseChangeDates.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-violet-400" />
              <span className="text-[10px] text-gray-400">{phaseChangeDates.length} phase change{phaseChangeDates.length > 1 ? "s" : ""}</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-4">
          {behaviorChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={behaviorChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickFormatter={fmtDate} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <Tooltip
                  labelFormatter={d => fmtDateLong(String(d))}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const pcsHere = phaseChangesByDate[String(label)] ?? [];
                    return (
                      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-[12px]">
                        <p className="font-semibold text-gray-600 mb-1.5">{fmtDateLong(String(label))}</p>
                        {payload.map((p: any, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.stroke }} />
                            <span className="text-gray-600">{p.dataKey}:</span>
                            <span className="font-bold text-gray-800">{p.value}</span>
                          </div>
                        ))}
                        {pcsHere.map((pc, i) => (
                          <div key={i} className="mt-1.5 pt-1.5 border-t border-violet-100 text-violet-700 font-medium">
                            📍 Phase change: {pc.label}
                            {pc.notes && <p className="text-[11px] text-gray-400 font-normal">{pc.notes}</p>}
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {uniqueBehaviorNames.map((name, i) => (
                  <Line key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                ))}
                {behaviorTargets.map((bt, i) => bt.goalValue ? (
                  <ReferenceLine key={`goal-${bt.id}`} y={parseFloat(bt.goalValue)} stroke={COLORS[i % COLORS.length]}
                    strokeDasharray="5 5" strokeOpacity={0.5} />
                ) : null)}
                {phaseChangeDates.map(date => (
                  <ReferenceLine
                    key={`pc-${date}`}
                    x={date}
                    stroke="#8b5cf6"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    label={{ value: phaseChangesByDate[date][0].label, position: "insideTopRight", fontSize: 9, fill: "#7c3aed", fontWeight: 600 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="py-12 text-center text-gray-400 text-sm">No behavior data yet. Use Data Collection tab to start tracking.</div>
          )}
        </CardContent>
      </Card>

      {/* Data table toggle */}
      {behaviorTrends.length > 0 && (
        <div>
          <button
            onClick={() => setShowTable(v => !v)}
            className="flex items-center gap-2 text-[12px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            <Table2 className="w-3.5 h-3.5" />
            Raw Data Table ({behaviorTrends.length} points)
            {showTable ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showTable && (
            <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th
                        className="text-left px-3 py-2 font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700"
                        onClick={() => toggleSort("date")}
                      >Date <SortIcon col="date" /></th>
                      <th
                        className="text-left px-3 py-2 font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700"
                        onClick={() => toggleSort("target")}
                      >Behavior <SortIcon col="target" /></th>
                      <th
                        className="text-right px-3 py-2 font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700"
                        onClick={() => toggleSort("value")}
                      >Value <SortIcon col="value" /></th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Type</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Phase</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((r, i) => {
                      const pcOnDate = (phaseChangesByDate[r.sessionDate] ?? []);
                      return (
                        <tr key={i} className={`border-b border-gray-100 last:border-0 ${pcOnDate.length > 0 ? "bg-violet-50/40" : "hover:bg-gray-50"}`}>
                          <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">
                            {fmtDate(r.sessionDate)}
                            {pcOnDate.length > 0 && (
                              <span className="ml-1.5 text-[9px] font-bold text-violet-600 bg-violet-100 px-1 py-0.5 rounded">PC</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-gray-700 font-medium">{r.targetName}</td>
                          <td className="px-3 py-1.5 text-right font-bold text-gray-800">{r.value}</td>
                          <td className="px-3 py-1.5 text-gray-400 capitalize">{r.measurementType?.replace(/_/g, " ")}</td>
                          <td className="px-3 py-1.5 text-violet-600 text-[10px]">
                            {pcOnDate.map(pc => pc.label).join(", ") || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-600">Active Behavior Targets</h3>
        <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8" onClick={onAdd}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {behaviorTargets.map((bt) => {
          const latest = behaviorTrends.filter(t => t.behaviorTargetId === bt.id);
          const lastVal = latest.length > 0 ? parseFloat(latest[latest.length - 1].value!) : null;
          const firstVal = latest.length > 1 ? parseFloat(latest[0].value!) : null;
          const improving = firstVal && lastVal ? (bt.targetDirection === "decrease" ? lastVal < firstVal : lastVal > firstVal) : null;
          const btPhaseChanges = phaseChanges.filter(pc => pc.behaviorTargetId === bt.id);

          return (
            <Card key={bt.id}>
              <CardContent className="p-3.5 md:p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-gray-700 truncate">{bt.name}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {measureLabel(bt.measurementType, bt.intervalMode)} · {bt.targetDirection} to {bt.goalValue ?? "—"}
                      {bt.enableHourlyTracking && " · Hourly"}
                      {bt.intervalLengthSeconds && ` · ${bt.intervalLengthSeconds}s`}
                    </p>
                    {bt.measurementType === "interval" && bt.intervalMode && INTERVAL_MODE_CONFIG[bt.intervalMode] && (
                      <span className={`inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border ${INTERVAL_MODE_CONFIG[bt.intervalMode].color}`}>
                        {INTERVAL_MODE_CONFIG[bt.intervalMode].label}
                      </span>
                    )}
                  </div>
                  {improving !== null && (
                    <span className={`flex items-center gap-0.5 text-[10px] md:text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      improving ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
                    }`}>
                      {improving ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                      {improving ? "Improving" : "Worsening"}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 md:gap-3 mt-3">
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-gray-400">Baseline</p>
                    <p className="text-[15px] md:text-[16px] font-bold text-gray-600">{bt.baselineValue ?? "—"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-gray-400">Current</p>
                    <p className="text-[15px] md:text-[16px] font-bold text-emerald-700">{lastVal ?? "—"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-gray-400">Goal</p>
                    <p className="text-[15px] md:text-[16px] font-bold text-emerald-600">{bt.goalValue ?? "—"}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-[11px] text-gray-400">{latest.length} data points</p>
                  {btPhaseChanges.length > 0 && (
                    <span className="text-[10px] text-violet-600 font-medium">
                      {btPhaseChanges.length} phase change{btPhaseChanges.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {behaviorTargets.length === 0 && (
          <div className="col-span-full text-center py-8 text-gray-400 text-sm">No behavior targets. Add one to start tracking.</div>
        )}
      </div>
    </div>
  );
}
