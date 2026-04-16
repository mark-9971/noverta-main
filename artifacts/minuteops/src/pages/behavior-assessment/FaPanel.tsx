import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Save, Trash2, BarChart3 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from "recharts";
import { toast } from "sonner";
import { createFaSession, deleteFaSession } from "@workspace/api-client-react";
import { FA_CONDITIONS, CONDITION_COLORS } from "./constants";
import { EmptyState } from "./shared";
import type { FbaRecord, FaSession } from "./types";

export function FaPanel({ fba, sessions, showNew, onShowNew, onCreated, onDeleted }: {
  fba: FbaRecord; sessions: FaSession[]; showNew: boolean;
  onShowNew: (v: boolean) => void; onCreated: () => void; onDeleted: () => void;
}) {
  const [form, setForm] = useState({
    condition: "attention", sessionDate: new Date().toISOString().split("T")[0],
    durationMinutes: "10", responseCount: "0", notes: "",
  });
  const [saving, setSaving] = useState(false);

  const nextSessionNum = sessions.length > 0 ? Math.max(...sessions.map(s => s.sessionNumber)) + 1 : 1;

  const handleSave = async () => {
    setSaving(true);
    try {
      await createFaSession(fba.id, {
          sessionNumber: nextSessionNum,
          condition: form.condition,
          sessionDate: form.sessionDate,
          durationMinutes: parseInt(form.durationMinutes) || 10,
          responseCount: parseInt(form.responseCount) || 0,
          responseRate: (parseInt(form.durationMinutes) || 10) > 0
            ? String(((parseInt(form.responseCount) || 0) / (parseInt(form.durationMinutes) || 10)).toFixed(2))
            : null,
          notes: form.notes || null,
        } as any);
      toast.success("FA session recorded");
      setForm(prev => ({ ...prev, responseCount: "0", notes: "" }));
      onCreated();
    } catch { toast.error("Failed to save FA session"); }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteFaSession(id);
      toast.success("Session deleted");
      onDeleted();
    } catch { toast.error("Failed to delete"); }
  };

  const chartData = sessions.reduce((acc, s) => {
    const existing = acc.find(d => d.session === s.sessionNumber);
    const rate = s.responseRate ? parseFloat(s.responseRate) : (s.durationMinutes > 0 ? s.responseCount / s.durationMinutes : 0);
    if (existing) {
      existing[s.condition] = rate;
    } else {
      acc.push({ session: s.sessionNumber, [s.condition]: rate });
    }
    return acc;
  }, [] as any[]).sort((a: any, b: any) => a.session - b.session);

  const conditions = [...new Set(sessions.map(s => s.condition))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Functional Analysis</h2>
          <p className="text-xs text-gray-500">FBA: {fba.targetBehavior} · {sessions.length} sessions recorded</p>
        </div>
        <Button size="sm" onClick={() => onShowNew(!showNew)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-1" /> Record Session
        </Button>
      </div>

      {showNew && (
        <Card className="border-emerald-200">
          <CardContent className="pt-5 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700">Condition *</label>
                <select value={form.condition} onChange={e => setForm(p => ({ ...p, condition: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
                  {FA_CONDITIONS.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Date *</label>
                <input type="date" value={form.sessionDate}
                  onChange={e => setForm(p => ({ ...p, sessionDate: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Duration (min)</label>
                <input type="number" value={form.durationMinutes}
                  onChange={e => setForm(p => ({ ...p, durationMinutes: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Response Count</label>
                <input type="number" value={form.responseCount}
                  onChange={e => setForm(p => ({ ...p, responseCount: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Session Notes</label>
              <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Observations during this condition..."
                className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            </div>

            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
              <p className="font-semibold text-gray-700">Condition Descriptions:</p>
              <p><span className="font-medium">Attention:</span> Attention diverted; deliver attention contingent on target behavior</p>
              <p><span className="font-medium">Escape:</span> Present demand; remove demand contingent on target behavior</p>
              <p><span className="font-medium">Tangible:</span> Remove preferred item; deliver contingent on target behavior</p>
              <p><span className="font-medium">Control/Play:</span> Free access to attention, items, no demands (comparison)</p>
              <p><span className="font-medium">Alone:</span> No social interaction or materials available</p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => onShowNew(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                <Save className="w-4 h-4 mr-1" /> Record Session #{nextSessionNum}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Response Rate by Condition (multi-element design)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="session" label={{ value: "Session", position: "insideBottom", offset: -5, fontSize: 12 }} tick={{ fontSize: 12 }} />
                <YAxis label={{ value: "Responses/min", angle: -90, position: "insideLeft", fontSize: 12 }} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {conditions.map(c => (
                  <Line key={c} type="monotone" dataKey={c} name={c}
                    stroke={CONDITION_COLORS[c] || "#6b7280"}
                    strokeWidth={2} dot={{ r: 4 }}
                    connectNulls={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {sessions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Session Log</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">#</th>
                  <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Condition</th>
                  <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Date</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">Duration</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">Responses</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">Rate/min</th>
                  <th className="py-2 px-1 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-2 text-gray-600">{s.sessionNumber}</td>
                    <td className="py-2 px-2">
                      <span className="capitalize font-medium" style={{ color: CONDITION_COLORS[s.condition] || "#6b7280" }}>
                        {s.condition}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-gray-600">{s.sessionDate}</td>
                    <td className="py-2 px-2 text-right text-gray-600">{s.durationMinutes}m</td>
                    <td className="py-2 px-2 text-right font-medium text-gray-900">{s.responseCount}</td>
                    <td className="py-2 px-2 text-right font-medium text-gray-900">
                      {s.responseRate ? parseFloat(s.responseRate).toFixed(2) : "—"}
                    </td>
                    <td className="py-2 px-1">
                      <button onClick={() => handleDelete(s.id)} className="text-gray-400 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {sessions.length === 0 && !showNew && (
        <EmptyState icon={BarChart3} message="No FA sessions yet. Record condition sessions to build a multi-element graph." />
      )}
    </div>
  );
}
