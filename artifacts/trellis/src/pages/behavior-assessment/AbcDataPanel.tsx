import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Save, Trash2, Zap, ArrowRight } from "lucide-react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, LabelList, Cell,
} from "recharts";
import { toast } from "sonner";
import { createFbaObservation, deleteFbaObservation } from "@workspace/api-client-react";
import {
  ANTECEDENT_CATEGORIES, CONSEQUENCE_CATEGORIES,
  FUNCTION_OPTIONS, INTENSITY_OPTIONS
} from "./constants";
import { FunctionBadge } from "./shared";
import type { FbaRecord, Observation, ObsSummary } from "./types";

const FUNCTION_COLOR: Record<string, string> = {
  attention: "#3b82f6",
  escape:    "#f59e0b",
  tangible:  "#8b5cf6",
  sensory:   "#10b981",
  multiple:  "#ec4899",
};

const INTENSITY_COLOR: Record<string, string> = {
  low:      "#10b981",
  moderate: "#f59e0b",
  high:     "#f97316",
  severe:   "#ef4444",
};

const INTENSITY_BG: Record<string, string> = {
  low:      "bg-emerald-100 text-emerald-800",
  moderate: "bg-amber-100 text-amber-800",
  high:     "bg-orange-100 text-orange-800",
  severe:   "bg-red-100 text-red-800",
};

function pct(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

function SnapshotTile({
  label, value, sub, color, wide,
}: { label: string; value: string; sub?: string; color: string; wide?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 px-4 py-3 rounded-lg border ${wide ? "flex-1" : ""} bg-white`}
      style={{ borderColor: color + "33" }}>
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>{label}</span>
      <span className="text-sm font-bold text-gray-900 leading-tight">{value}</span>
      {sub && <span className="text-[11px] text-gray-400">{sub}</span>}
    </div>
  );
}

export function AbcDataPanel({ fba, observations, summary, showNew, onShowNew, onCreated, onDeleted }: {
  fba: FbaRecord; observations: Observation[]; summary: ObsSummary | null;
  showNew: boolean; onShowNew: (v: boolean) => void; onCreated: () => void; onDeleted: () => void;
}) {
  const [form, setForm] = useState({
    observationDate: new Date().toISOString().split("T")[0],
    observationTime: "", setting: "", activity: "",
    antecedent: "", antecedentCategory: "",
    behavior: "", behaviorIntensity: "",
    behaviorDurationSeconds: "",
    consequence: "", consequenceCategory: "",
    perceivedFunction: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.antecedent || !form.behavior || !form.consequence) {
      toast.error("Antecedent, Behavior, and Consequence are required");
      return;
    }
    setSaving(true);
    try {
      await createFbaObservation(fba.id, {
        ...form,
        behaviorDurationSeconds: form.behaviorDurationSeconds ? parseInt(form.behaviorDurationSeconds) : null,
      } as any);
      toast.success("ABC observation recorded");
      setForm(prev => ({
        ...prev, antecedent: "", antecedentCategory: "", behavior: "",
        behaviorIntensity: "", behaviorDurationSeconds: "", consequence: "",
        consequenceCategory: "", perceivedFunction: "", notes: "",
      }));
      onCreated();
    } catch { toast.error("Failed to save observation"); }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteFbaObservation(id);
      toast.success("Observation deleted");
      onDeleted();
    } catch { toast.error("Failed to delete"); }
  };

  const totalFn   = summary ? Object.values(summary.functionCounts).reduce((a, b) => a + b, 0) : 0;
  const totalAnt  = summary ? Object.values(summary.antecedentCounts).reduce((a, b) => a + b, 0) : 0;
  const totalCon  = summary ? Object.values(summary.consequenceCounts).reduce((a, b) => a + b, 0) : 0;

  const functionChartData = summary
    ? Object.entries(summary.functionCounts)
        .map(([name, count]) => ({ name, count, pct: pct(count, totalFn) }))
        .sort((a, b) => b.count - a.count)
    : [];

  const antecedentChartData = summary
    ? Object.entries(summary.antecedentCounts)
        .map(([name, count]) => ({ name, count, pct: pct(count, totalAnt) }))
        .sort((a, b) => b.count - a.count)
    : [];

  const consequenceChartData = summary
    ? Object.entries(summary.consequenceCounts)
        .map(([name, count]) => ({ name, count, pct: pct(count, totalCon) }))
        .sort((a, b) => b.count - a.count)
    : [];

  const intensityCounts: Record<string, number> = {};
  for (const obs of observations) {
    if (obs.behaviorIntensity) {
      intensityCounts[obs.behaviorIntensity] = (intensityCounts[obs.behaviorIntensity] ?? 0) + 1;
    }
  }
  const totalInt = Object.values(intensityCounts).reduce((a, b) => a + b, 0);
  const intensityChartData = INTENSITY_OPTIONS
    .filter(k => (intensityCounts[k] ?? 0) > 0)
    .map(k => ({ name: k, count: intensityCounts[k] ?? 0, pct: pct(intensityCounts[k] ?? 0, totalInt) }));

  const topFunction    = functionChartData[0] ?? null;
  const topAntecedent  = antecedentChartData[0] ?? null;
  const topConsequence = consequenceChartData[0] ?? null;
  const topIntensity   = intensityChartData.sort((a, b) => b.count - a.count)[0] ?? null;

  const sortedDates = [...new Set(observations.map(o => o.observationDate))].sort();
  const dateSpan = sortedDates.length >= 2
    ? `${new Date(sortedDates[0] + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(sortedDates[sortedDates.length - 1] + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : sortedDates.length === 1
      ? new Date(sortedDates[0] + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null;

  const topAntecedents = summary ? Object.entries(summary.antecedentCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(e => e[0]) : [];
  const topConsequences = summary ? Object.entries(summary.consequenceCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(e => e[0]) : [];
  const acMatrix: Record<string, Record<string, number>> = {};
  for (const obs of observations) {
    const ant = obs.antecedentCategory;
    const con = obs.consequenceCategory;
    if (!ant || !con) continue;
    if (!acMatrix[ant]) acMatrix[ant] = {};
    acMatrix[ant][con] = (acMatrix[ant][con] || 0) + 1;
  }
  const acMaxCount = Math.max(1, ...Object.values(acMatrix).flatMap(row => Object.values(row)));

  const TIME_BLOCKS = [
    { key: "6", label: "6am" }, { key: "7", label: "7am" }, { key: "8", label: "8am" },
    { key: "9", label: "9am" }, { key: "10", label: "10am" }, { key: "11", label: "11am" },
    { key: "12", label: "12pm" }, { key: "13", label: "1pm" }, { key: "14", label: "2pm" },
    { key: "15", label: "3pm" }, { key: "16", label: "4pm" },
  ];
  const obsWithTime = observations.filter(o => o.observationTime);
  const scatterDates = [...new Set(obsWithTime.map(o => o.observationDate))].sort().slice(-10);
  const scatterGrid: Record<string, Record<string, number>> = {};
  for (const obs of obsWithTime) {
    const hour = obs.observationTime!.split(":")[0];
    if (!scatterGrid[obs.observationDate]) scatterGrid[obs.observationDate] = {};
    scatterGrid[obs.observationDate][hour] = (scatterGrid[obs.observationDate][hour] || 0) + 1;
  }
  const scatterMaxCount = Math.max(1, ...Object.values(scatterGrid).flatMap(d => Object.values(d)));

  const hasData = (summary?.totalObservations ?? 0) > 0;

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">ABC Data Collection</h2>
          <p className="text-xs text-gray-500">FBA: {fba.targetBehavior}</p>
        </div>
        <Button size="sm" onClick={() => onShowNew(!showNew)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-1" /> Record Observation
        </Button>
      </div>

      {/* ── Observation Entry Form ────────────────────────────── */}
      {showNew && (
        <Card className="border-emerald-200">
          <CardContent className="pt-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700">Date *</label>
                <input type="date" value={form.observationDate}
                  onChange={e => setForm(p => ({ ...p, observationDate: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Time</label>
                <input type="time" value={form.observationTime}
                  onChange={e => setForm(p => ({ ...p, observationTime: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Setting</label>
                <input value={form.setting} onChange={e => setForm(p => ({ ...p, setting: e.target.value }))}
                  placeholder="e.g., Math class"
                  className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Activity</label>
                <input value={form.activity} onChange={e => setForm(p => ({ ...p, activity: e.target.value }))}
                  placeholder="e.g., Independent work"
                  className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold">A</span>
                  <label className="text-sm font-semibold text-gray-800">Antecedent *</label>
                </div>
                <select value={form.antecedentCategory} onChange={e => setForm(p => ({ ...p, antecedentCategory: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
                  <option value="">Category...</option>
                  {ANTECEDENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <textarea value={form.antecedent} onChange={e => setForm(p => ({ ...p, antecedent: e.target.value }))}
                  rows={3} placeholder="What happened immediately before the behavior?"
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold">B</span>
                  <label className="text-sm font-semibold text-gray-800">Behavior *</label>
                </div>
                <select value={form.behaviorIntensity} onChange={e => setForm(p => ({ ...p, behaviorIntensity: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
                  <option value="">Intensity...</option>
                  {INTENSITY_OPTIONS.map(i => <option key={i} value={i} className="capitalize">{i}</option>)}
                </select>
                <textarea value={form.behavior} onChange={e => setForm(p => ({ ...p, behavior: e.target.value }))}
                  rows={3} placeholder="Describe the behavior as observed..."
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <div>
                  <label className="text-xs text-gray-500">Duration (seconds)</label>
                  <input type="number" value={form.behaviorDurationSeconds}
                    onChange={e => setForm(p => ({ ...p, behaviorDurationSeconds: e.target.value }))}
                    placeholder="0" className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">C</span>
                  <label className="text-sm font-semibold text-gray-800">Consequence *</label>
                </div>
                <select value={form.consequenceCategory} onChange={e => setForm(p => ({ ...p, consequenceCategory: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
                  <option value="">Category...</option>
                  {CONSEQUENCE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <textarea value={form.consequence} onChange={e => setForm(p => ({ ...p, consequence: e.target.value }))}
                  rows={3} placeholder="What happened immediately after the behavior?"
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700">Perceived Function</label>
                <select value={form.perceivedFunction} onChange={e => setForm(p => ({ ...p, perceivedFunction: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
                  <option value="">Select...</option>
                  {FUNCTION_OPTIONS.map(f => <option key={f} value={f} className="capitalize">{f}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Notes</label>
                <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Additional context..."
                  className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => onShowNew(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                <Save className="w-4 h-4 mr-1" /> Save Observation
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Empty state ───────────────────────────────────────── */}
      {!hasData && (
        <Card className="border-dashed border-gray-200">
          <CardContent className="py-10 text-center space-y-2">
            <Zap className="w-8 h-8 mx-auto text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No observations recorded yet</p>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              Record ABC observations using the button above. After 3–5 observations, this panel will show
              function patterns, top triggers, consequence patterns, a behavior-by-time heatmap, and an A→C matrix.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Visualizations (only when data exists) ───────────── */}
      {hasData && (
        <div className="space-y-4">

          {/* ── 1. Clinical Snapshot Strip ───────────────────── */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <div className="flex items-center gap-1.5 mb-3">
              <Zap className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Clinical Snapshot · {summary!.totalObservations} observation{summary!.totalObservations !== 1 ? "s" : ""}
                {dateSpan && <span className="ml-1 font-normal normal-case tracking-normal">({dateSpan})</span>}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {topFunction && (
                <SnapshotTile
                  label="Most likely function"
                  value={topFunction.name.charAt(0).toUpperCase() + topFunction.name.slice(1)}
                  sub={`${topFunction.pct}% of observations (${topFunction.count}/${totalFn})`}
                  color={FUNCTION_COLOR[topFunction.name] ?? "#6b7280"}
                  wide
                />
              )}
              {topAntecedent && (
                <SnapshotTile
                  label="Top trigger"
                  value={topAntecedent.name}
                  sub={`${topAntecedent.pct}% of categorized obs (${topAntecedent.count})`}
                  color="#d97706"
                  wide
                />
              )}
              {topConsequence && (
                <SnapshotTile
                  label="Most common consequence"
                  value={topConsequence.name}
                  sub={`${topConsequence.pct}% of categorized obs (${topConsequence.count})`}
                  color="#7c3aed"
                  wide
                />
              )}
              {topIntensity && (
                <SnapshotTile
                  label="Typical intensity"
                  value={topIntensity.name.charAt(0).toUpperCase() + topIntensity.name.slice(1)}
                  sub={`${topIntensity.pct}% of observations with intensity logged`}
                  color={INTENSITY_COLOR[topIntensity.name] ?? "#6b7280"}
                  wide
                />
              )}
            </div>
          </div>

          {/* ── 2. Function Distribution + Intensity ─────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">Function Distribution</CardTitle>
                <p className="text-[11px] text-gray-400">Perceived behavioral function across all {summary!.totalObservations} observations</p>
              </CardHeader>
              <CardContent>
                {functionChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={functionChartData} margin={{ top: 18, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }}
                        tickFormatter={v => v.charAt(0).toUpperCase() + v.slice(1)} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v, _name, props) => [`${v} obs (${props.payload.pct}%)`, "Count"]} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {functionChartData.map(entry => (
                          <Cell key={entry.name} fill={FUNCTION_COLOR[entry.name] ?? "#059669"} />
                        ))}
                        <LabelList dataKey="pct" position="top"
                          formatter={(v: number) => `${v}%`}
                          style={{ fontSize: 11, fontWeight: 600, fill: "#374151" }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">No function data recorded</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">Behavior Intensity</CardTitle>
                <p className="text-[11px] text-gray-400">Distribution across observations where intensity was logged</p>
              </CardHeader>
              <CardContent>
                {intensityChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={intensityChartData} layout="vertical"
                      margin={{ top: 4, right: 48, left: 12, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" width={70}
                        tick={{ fontSize: 12 }}
                        tickFormatter={v => v.charAt(0).toUpperCase() + v.slice(1)} />
                      <Tooltip formatter={(v, _name, props) => [`${v} obs (${props.payload.pct}%)`, "Count"]} />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {intensityChartData.map(entry => (
                          <Cell key={entry.name} fill={INTENSITY_COLOR[entry.name] ?? "#6b7280"} />
                        ))}
                        <LabelList dataKey="pct" position="right"
                          formatter={(v: number) => `${v}%`}
                          style={{ fontSize: 11, fontWeight: 600, fill: "#374151" }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">No intensity data recorded<br /><span className="text-xs text-gray-300">Select an intensity level when logging each observation</span></p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── 3. Antecedent + Consequence Patterns ─────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">Antecedent Patterns</CardTitle>
                <p className="text-[11px] text-gray-400">What typically precedes the behavior</p>
              </CardHeader>
              <CardContent>
                {antecedentChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(160, antecedentChartData.length * 42)}>
                    <BarChart data={antecedentChartData} layout="vertical"
                      margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v, _name, props) => [`${v} obs (${props.payload.pct}%)`, "Count"]} />
                      <Bar dataKey="count" fill="#d97706" radius={[0, 4, 4, 0]}>
                        <LabelList dataKey="pct" position="right"
                          formatter={(v: number) => `${v}%`}
                          style={{ fontSize: 11, fontWeight: 600, fill: "#92400e" }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">No antecedent categories recorded</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">Consequence Patterns</CardTitle>
                <p className="text-[11px] text-gray-400">What typically follows and may be maintaining the behavior</p>
              </CardHeader>
              <CardContent>
                {consequenceChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(160, consequenceChartData.length * 42)}>
                    <BarChart data={consequenceChartData} layout="vertical"
                      margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v, _name, props) => [`${v} obs (${props.payload.pct}%)`, "Count"]} />
                      <Bar dataKey="count" fill="#7c3aed" radius={[0, 4, 4, 0]}>
                        <LabelList dataKey="pct" position="right"
                          formatter={(v: number) => `${v}%`}
                          style={{ fontSize: 11, fontWeight: 600, fill: "#5b21b6" }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">No consequence categories recorded</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── 4. A→C Pattern Matrix ─────────────────────────── */}
          {topAntecedents.length > 0 && topConsequences.length > 0 && (
            <Card>
              <CardHeader className="pb-1">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm">Antecedent → Consequence Matrix</CardTitle>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <p className="text-[11px] text-gray-400">
                  How often each trigger leads to each consequence — darker = more frequent. Identifies the strongest A→C chains.
                </p>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr>
                      <th className="text-left py-1.5 pr-3 text-gray-400 font-medium min-w-[140px]">
                        Antecedent ↓ / Consequence →
                      </th>
                      {topConsequences.map(c => (
                        <th key={c} className="text-center py-1.5 px-2 text-gray-500 font-medium max-w-[90px] whitespace-normal">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topAntecedents.map(ant => (
                      <tr key={ant} className="border-t border-gray-50">
                        <td className="py-1.5 pr-3 text-gray-600 font-medium">{ant}</td>
                        {topConsequences.map(con => {
                          const count = acMatrix[ant]?.[con] ?? 0;
                          const intensity = count / acMaxCount;
                          return (
                            <td key={con} className="py-1.5 px-2 text-center">
                              {count > 0 ? (
                                <span
                                  className="inline-flex items-center justify-center w-8 h-7 rounded text-[10px] font-bold"
                                  style={{
                                    backgroundColor: `rgba(234,179,8,${0.15 + intensity * 0.85})`,
                                    color: intensity > 0.5 ? "#713f12" : "#92400e",
                                  }}
                                  title={`${count} observation${count > 1 ? "s" : ""}`}
                                >
                                  {count}
                                </span>
                              ) : (
                                <span className="text-gray-200">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* ── 5. Time-of-Day Heatmap ────────────────────────── */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">Behavior by Time of Day</CardTitle>
              <p className="text-[11px] text-gray-400">
                Each cell = observations at that hour. Darker red = more occurrences.
                {obsWithTime.length === 0 && " Record observation times to activate this view."}
              </p>
            </CardHeader>
            <CardContent>
              {scatterDates.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr>
                        <th className="text-left py-1 pr-2 text-gray-400 font-normal w-12">Time</th>
                        {scatterDates.map(d => (
                          <th key={d} className="text-center py-1 px-0.5 text-gray-400 font-normal whitespace-nowrap min-w-[32px]">
                            {new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {TIME_BLOCKS.map(tb => (
                        <tr key={tb.key}>
                          <td className="py-0.5 pr-2 text-gray-400 font-normal">{tb.label}</td>
                          {scatterDates.map(d => {
                            const count = scatterGrid[d]?.[tb.key] ?? 0;
                            const opacity = count === 0 ? 0 : 0.15 + (count / scatterMaxCount) * 0.85;
                            return (
                              <td key={d} className="py-0.5 px-0.5 text-center">
                                <div
                                  className="w-7 h-6 rounded mx-auto flex items-center justify-center text-[9px] font-bold"
                                  style={{
                                    backgroundColor: count > 0 ? `rgba(239,68,68,${opacity})` : "transparent",
                                    color: count > 0 && opacity > 0.5 ? "white" : count > 0 ? "#dc2626" : "transparent",
                                    border: count === 0 ? "1px solid #f3f4f6" : "none",
                                  }}
                                  title={count > 0 ? `${count} observation${count > 1 ? "s" : ""}` : ""}
                                >
                                  {count > 0 ? count : ""}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-sm text-gray-400">Record observation times to see the time-of-day pattern</p>
                  <p className="text-xs text-gray-300 mt-1">Knowing when behavior peaks helps with antecedent intervention scheduling</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Raw Observation Log ───────────────────────────────── */}
      {observations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Observation Log ({observations.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Date / Time</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Setting</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-amber-700 bg-amber-50/60">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-4 h-4 rounded bg-amber-200 text-amber-800 flex items-center justify-center text-[9px] font-bold">A</span>
                        Antecedent
                      </span>
                    </th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-red-700 bg-red-50/60">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-4 h-4 rounded bg-red-200 text-red-800 flex items-center justify-center text-[9px] font-bold">B</span>
                        Behavior
                      </span>
                    </th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-emerald-700 bg-emerald-50/60">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-4 h-4 rounded bg-emerald-200 text-emerald-800 flex items-center justify-center text-[9px] font-bold">C</span>
                        Consequence
                      </span>
                    </th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Function</th>
                    <th className="py-2 px-1 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {observations.map(obs => (
                    <tr key={obs.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-2 text-xs text-gray-600 whitespace-nowrap">
                        <div>{new Date(obs.observationDate + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                        {obs.observationTime && <div className="text-gray-400">{obs.observationTime.slice(0, 5)}</div>}
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-500 max-w-[80px]">
                        {obs.setting || <span className="text-gray-300">—</span>}
                        {obs.activity && <div className="text-gray-400 italic truncate">{obs.activity}</div>}
                      </td>
                      <td className="py-2 px-2 text-xs bg-amber-50/40 max-w-[180px]">
                        {obs.antecedentCategory && (
                          <span className="inline-block mb-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-medium leading-none">
                            {obs.antecedentCategory}
                          </span>
                        )}
                        <div className="text-gray-700 line-clamp-2">{obs.antecedent}</div>
                      </td>
                      <td className="py-2 px-2 text-xs bg-red-50/40 max-w-[180px]">
                        {obs.behaviorIntensity && (
                          <span className={`inline-block mb-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ${INTENSITY_BG[obs.behaviorIntensity] ?? "bg-gray-100 text-gray-700"}`}>
                            {obs.behaviorIntensity}
                          </span>
                        )}
                        <div className="text-gray-700 line-clamp-2">{obs.behavior}</div>
                        {obs.behaviorDurationSeconds != null && (
                          <div className="text-gray-400 text-[10px]">{obs.behaviorDurationSeconds}s</div>
                        )}
                      </td>
                      <td className="py-2 px-2 text-xs bg-emerald-50/40 max-w-[180px]">
                        {obs.consequenceCategory && (
                          <span className="inline-block mb-0.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-medium leading-none">
                            {obs.consequenceCategory}
                          </span>
                        )}
                        <div className="text-gray-700 line-clamp-2">{obs.consequence}</div>
                      </td>
                      <td className="py-2 px-2">
                        {obs.perceivedFunction
                          ? <FunctionBadge func={obs.perceivedFunction} />
                          : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="py-2 px-1">
                        <button onClick={() => handleDelete(obs.id)}
                          className="text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
