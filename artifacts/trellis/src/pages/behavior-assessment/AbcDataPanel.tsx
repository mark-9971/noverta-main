import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Save, Trash2 } from "lucide-react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar
} from "recharts";
import { toast } from "sonner";
import { createFbaObservation, deleteFbaObservation } from "@workspace/api-client-react";
import {
  ANTECEDENT_CATEGORIES, CONSEQUENCE_CATEGORIES,
  FUNCTION_OPTIONS, INTENSITY_OPTIONS
} from "./constants";
import { FunctionBadge } from "./shared";
import type { FbaRecord, Observation, ObsSummary } from "./types";

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

  const functionChartData = summary ? Object.entries(summary.functionCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count) : [];

  const antecedentChartData = summary ? Object.entries(summary.antecedentCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count) : [];

  const consequenceChartData = summary ? Object.entries(summary.consequenceCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count) : [];

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">ABC Data Collection</h2>
          <p className="text-xs text-gray-500">FBA: {fba.targetBehavior}</p>
        </div>
        <Button size="sm" onClick={() => onShowNew(!showNew)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-1" /> Record Observation
        </Button>
      </div>

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

      {summary && summary.totalObservations > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Function Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {functionChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={functionChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#059669" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-gray-400 text-center py-8">No function data yet</p>}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Scatterplot · Behavior by Time of Day</CardTitle>
              <p className="text-[11px] text-gray-400">Each cell = observations at that time block. Darker = more occurrences.</p>
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
                <div className="py-8 text-center">
                  <p className="text-sm text-gray-400">Add observation times to see the scatterplot</p>
                  <p className="text-xs text-gray-300 mt-1">Record the time when logging each ABC observation</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Antecedent Patterns</CardTitle>
            </CardHeader>
            <CardContent>
              {antecedentChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={antecedentChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#d97706" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-gray-400 text-center py-8">No antecedent data yet</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Consequence Patterns</CardTitle>
            </CardHeader>
            <CardContent>
              {consequenceChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={consequenceChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-gray-400 text-center py-8">No consequence data yet</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Total Observations</span>
                <span className="text-lg font-bold text-gray-900">{summary.totalObservations}</span>
              </div>
              {summary.suggestedFunction && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Most Common Function</span>
                  <FunctionBadge func={summary.suggestedFunction} />
                </div>
              )}
              {consequenceChartData.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-gray-500">Top Consequences</span>
                  {consequenceChartData.slice(0, 3).map(({ name, count }) => (
                    <div key={name} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 truncate">{name}</span>
                      <span className="text-gray-900 font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {topAntecedents.length > 0 && topConsequences.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Antecedent → Consequence Pattern Review</CardTitle>
                <p className="text-[11px] text-gray-400">How often each antecedent is followed by each consequence. Helps identify maintaining variables.</p>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr>
                      <th className="text-left py-1.5 pr-3 text-gray-400 font-medium">Antecedent ↓ / Consequence →</th>
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
        </div>
      )}

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
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Date/Time</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Setting</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 bg-amber-50">Antecedent</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 bg-red-50">Behavior</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 bg-emerald-50">Consequence</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Function</th>
                    <th className="py-2 px-1 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {observations.map(obs => (
                    <tr key={obs.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-2 text-xs text-gray-600 whitespace-nowrap">
                        {obs.observationDate}{obs.observationTime ? ` ${obs.observationTime}` : ""}
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-600">{obs.setting || "—"}</td>
                      <td className="py-2 px-2 text-xs bg-amber-50/50 max-w-[200px]">
                        {obs.antecedentCategory && <span className="text-amber-700 font-medium">{obs.antecedentCategory}: </span>}
                        <span className="text-gray-700">{obs.antecedent}</span>
                      </td>
                      <td className="py-2 px-2 text-xs bg-red-50/50 max-w-[200px]">
                        {obs.behaviorIntensity && <span className={`font-medium ${obs.behaviorIntensity === "severe" || obs.behaviorIntensity === "high" ? "text-red-600" : "text-gray-600"}`}>[{obs.behaviorIntensity}] </span>}
                        <span className="text-gray-700">{obs.behavior}</span>
                        {obs.behaviorDurationSeconds && <span className="text-gray-400"> ({obs.behaviorDurationSeconds}s)</span>}
                      </td>
                      <td className="py-2 px-2 text-xs bg-emerald-50/50 max-w-[200px]">
                        {obs.consequenceCategory && <span className="text-emerald-700 font-medium">{obs.consequenceCategory}: </span>}
                        <span className="text-gray-700">{obs.consequence}</span>
                      </td>
                      <td className="py-2 px-2">
                        {obs.perceivedFunction ? <FunctionBadge func={obs.perceivedFunction} /> : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="py-2 px-1">
                        <button onClick={() => handleDelete(obs.id)} className="text-gray-400 hover:text-red-500">
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
