import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3, TrendingDown, TrendingUp, Target, BookOpen, Plus,
  ChevronDown, Activity, GraduationCap, X, Save, Calendar
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine
} from "recharts";

const API = "/api";

interface BehaviorTarget {
  id: number; studentId: number; name: string; description: string;
  measurementType: string; targetDirection: string;
  baselineValue: string | null; goalValue: string | null; active: boolean;
}
interface ProgramTarget {
  id: number; studentId: number; name: string; description: string;
  programType: string; targetCriterion: string; domain: string; active: boolean;
}
interface DataSession {
  id: number; studentId: number; sessionDate: string; staffName: string | null;
  startTime: string; endTime: string;
}
interface Student { id: number; firstName: string; lastName: string; }
interface TrendPoint {
  sessionDate: string; value?: string; targetName?: string; measurementType?: string;
  behaviorTargetId?: number; programTargetId?: number;
  trialsCorrect?: number; trialsTotal?: number; percentCorrect?: string;
}

const COLORS = ["#6366f1", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

function measureLabel(t: string) {
  if (t === "frequency") return "Count";
  if (t === "interval") return "% of intervals";
  return "Percentage";
}

export default function ProgramDataPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<number | null>(null);
  const [behaviorTargets, setBehaviorTargets] = useState<BehaviorTarget[]>([]);
  const [programTargets, setProgramTargets] = useState<ProgramTarget[]>([]);
  const [dataSessions, setDataSessions] = useState<DataSession[]>([]);
  const [behaviorTrends, setBehaviorTrends] = useState<TrendPoint[]>([]);
  const [programTrends, setProgramTrends] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"behaviors" | "programs" | "sessions">("behaviors");
  const [showAddBehavior, setShowAddBehavior] = useState(false);
  const [showAddProgram, setShowAddProgram] = useState(false);
  const [showLogSession, setShowLogSession] = useState(false);

  useEffect(() => {
    fetch(`${API}/students`).then(r => r.json()).then(data => {
      const withData = data.filter((s: any) => s.status === "active");
      setStudents(withData);
      if (withData.length > 0) setSelectedStudent(withData[0].id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadStudentData = useCallback(async (sid: number) => {
    const [bt, pt, ds, btrend, ptrend] = await Promise.all([
      fetch(`${API}/students/${sid}/behavior-targets`).then(r => r.json()),
      fetch(`${API}/students/${sid}/program-targets`).then(r => r.json()),
      fetch(`${API}/students/${sid}/data-sessions?limit=30`).then(r => r.json()),
      fetch(`${API}/students/${sid}/behavior-data/trends`).then(r => r.json()),
      fetch(`${API}/students/${sid}/program-data/trends`).then(r => r.json()),
    ]);
    setBehaviorTargets(bt);
    setProgramTargets(pt);
    setDataSessions(ds);
    setBehaviorTrends(btrend);
    setProgramTrends(ptrend);
  }, []);

  useEffect(() => {
    if (selectedStudent) loadStudentData(selectedStudent);
  }, [selectedStudent, loadStudentData]);

  const behaviorChartData = (() => {
    const byDate: Record<string, any> = {};
    for (const p of behaviorTrends) {
      if (!byDate[p.sessionDate]) byDate[p.sessionDate] = { date: p.sessionDate };
      byDate[p.sessionDate][p.targetName!] = parseFloat(p.value!);
    }
    return Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date));
  })();

  const programChartData = (() => {
    const byDate: Record<string, any> = {};
    for (const p of programTrends) {
      if (!byDate[p.sessionDate]) byDate[p.sessionDate] = { date: p.sessionDate };
      byDate[p.sessionDate][p.targetName!] = parseFloat(p.percentCorrect!);
    }
    return Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date));
  })();

  const uniqueBehaviorNames = [...new Set(behaviorTrends.map(t => t.targetName!))];
  const uniqueProgramNames = [...new Set(programTrends.map(t => t.targetName!))];

  const student = students.find(s => s.id === selectedStudent);

  if (loading) return <div className="p-8"><Skeleton className="w-full h-96" /></div>;

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Program Data</h1>
          <p className="text-sm text-slate-400 mt-1">Track behaviors, skill acquisition programs, and visualize progress</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedStudent ?? ""}
            onChange={e => setSelectedStudent(parseInt(e.target.value))}
            className="border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedStudent && (
        <>
          <div className="flex items-center gap-1 border-b border-slate-200">
            {([
              { key: "behaviors" as const, label: "Behavior Targets", icon: Activity, count: behaviorTargets.length },
              { key: "programs" as const, label: "Skill Programs", icon: GraduationCap, count: programTargets.length },
              { key: "sessions" as const, label: "Data Sessions", icon: Calendar, count: dataSessions.length },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-all ${
                  tab === t.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                <t.icon className="w-4 h-4" /> {t.label} ({t.count})
              </button>
            ))}
          </div>

          {tab === "behaviors" && (
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-0 flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-slate-600">
                    <TrendingDown className="w-4 h-4 inline mr-1.5 text-red-500" />
                    Behavior Trends — {student?.firstName} {student?.lastName}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  {behaviorChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={behaviorChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }}
                          tickFormatter={d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
                        <Tooltip labelFormatter={d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {uniqueBehaviorNames.map((name, i) => {
                          const target = behaviorTargets.find(t => t.name === name);
                          return (
                            <Line key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]}
                              strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                          );
                        })}
                        {behaviorTargets.map((bt, i) => bt.goalValue ? (
                          <ReferenceLine key={`goal-${bt.id}`} y={parseFloat(bt.goalValue)} stroke={COLORS[i % COLORS.length]}
                            strokeDasharray="5 5" strokeOpacity={0.5} />
                        ) : null)}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="py-12 text-center text-slate-400 text-sm">No behavior data yet. Log a data session to start tracking.</div>
                  )}
                </CardContent>
              </Card>

              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-600">Active Behavior Targets</h3>
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] h-8"
                  onClick={() => setShowAddBehavior(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Behavior
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {behaviorTargets.map((bt, i) => {
                  const latest = behaviorTrends.filter(t => t.behaviorTargetId === bt.id);
                  const lastVal = latest.length > 0 ? parseFloat(latest[latest.length - 1].value!) : null;
                  const firstVal = latest.length > 1 ? parseFloat(latest[0].value!) : null;
                  const improving = firstVal && lastVal ? (bt.targetDirection === "decrease" ? lastVal < firstVal : lastVal > firstVal) : null;

                  return (
                    <Card key={bt.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-[14px] font-semibold text-slate-700">{bt.name}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {measureLabel(bt.measurementType)} · Goal: {bt.targetDirection} to {bt.goalValue ?? "—"}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {improving !== null && (
                              <span className={`flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                improving ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
                              }`}>
                                {improving ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                                {improving ? "Improving" : "Worsening"}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 mt-3">
                          <div className="bg-slate-50 rounded-lg p-2 text-center">
                            <p className="text-[10px] text-slate-400">Baseline</p>
                            <p className="text-[16px] font-bold text-slate-600">{bt.baselineValue ?? "—"}</p>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-2 text-center">
                            <p className="text-[10px] text-slate-400">Current</p>
                            <p className="text-[16px] font-bold text-indigo-600">{lastVal ?? "—"}</p>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-2 text-center">
                            <p className="text-[10px] text-slate-400">Goal</p>
                            <p className="text-[16px] font-bold text-emerald-600">{bt.goalValue ?? "—"}</p>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-2">{latest.length} data points collected</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "programs" && (
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-0">
                  <CardTitle className="text-sm font-semibold text-slate-600">
                    <TrendingUp className="w-4 h-4 inline mr-1.5 text-emerald-500" />
                    Skill Acquisition Trends — {student?.firstName} {student?.lastName}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  {programChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={programChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }}
                          tickFormatter={d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} domain={[0, 100]}
                          tickFormatter={v => `${v}%`} />
                        <Tooltip labelFormatter={d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                          formatter={(v: any) => [`${v}%`, undefined]} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <ReferenceLine y={80} stroke="#10b981" strokeDasharray="5 5" strokeOpacity={0.5} label={{ value: "Mastery (80%)", position: "right", fontSize: 10, fill: "#10b981" }} />
                        {uniqueProgramNames.map((name, i) => (
                          <Line key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]}
                            strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="py-12 text-center text-slate-400 text-sm">No program data yet.</div>
                  )}
                </CardContent>
              </Card>

              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-600">Active Skill Programs</h3>
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] h-8"
                  onClick={() => setShowAddProgram(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Program
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {programTargets.map((pt, i) => {
                  const data = programTrends.filter(t => t.programTargetId === pt.id);
                  const lastPct = data.length > 0 ? parseFloat(data[data.length - 1].percentCorrect!) : null;
                  const last3 = data.slice(-3);
                  const avgLast3 = last3.length > 0 ? Math.round(last3.reduce((s, d) => s + parseFloat(d.percentCorrect!), 0) / last3.length) : null;
                  const mastered = avgLast3 !== null && avgLast3 >= 80;

                  return (
                    <Card key={pt.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-[14px] font-semibold text-slate-700">{pt.name}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {pt.programType === "discrete_trial" ? "Discrete Trial" : "Task Analysis"} · {pt.domain}
                            </p>
                          </div>
                          {mastered && (
                            <span className="flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                              <Target className="w-3 h-3" /> Mastered
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-3 mt-3">
                          <div className="bg-slate-50 rounded-lg p-2 text-center">
                            <p className="text-[10px] text-slate-400">Last Session</p>
                            <p className="text-[16px] font-bold text-indigo-600">{lastPct != null ? `${lastPct}%` : "—"}</p>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-2 text-center">
                            <p className="text-[10px] text-slate-400">Avg Last 3</p>
                            <p className={`text-[16px] font-bold ${(avgLast3 ?? 0) >= 80 ? "text-emerald-600" : "text-slate-600"}`}>
                              {avgLast3 != null ? `${avgLast3}%` : "—"}
                            </p>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-2 text-center">
                            <p className="text-[10px] text-slate-400">Data Points</p>
                            <p className="text-[16px] font-bold text-slate-600">{data.length}</p>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-2">Criterion: {pt.targetCriterion}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "sessions" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-600">Recent Data Collection Sessions</h3>
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] h-8"
                  onClick={() => setShowLogSession(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Log Data Session
                </Button>
              </div>

              {dataSessions.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">No data sessions recorded yet.</div>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <th className="text-left px-4 py-2.5 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Date</th>
                          <th className="text-left px-4 py-2.5 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Time</th>
                          <th className="text-left px-4 py-2.5 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Staff</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {dataSessions.map(ds => (
                          <tr key={ds.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2.5 font-medium text-slate-700">
                              {new Date(ds.sessionDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </td>
                            <td className="px-4 py-2.5 text-slate-500">
                              {ds.startTime && ds.endTime ? `${ds.startTime}–${ds.endTime}` : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-slate-500">{ds.staffName || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {showAddBehavior && selectedStudent && (
        <AddBehaviorModal
          studentId={selectedStudent}
          onClose={() => setShowAddBehavior(false)}
          onSaved={() => { setShowAddBehavior(false); loadStudentData(selectedStudent); }}
        />
      )}
      {showAddProgram && selectedStudent && (
        <AddProgramModal
          studentId={selectedStudent}
          onClose={() => setShowAddProgram(false)}
          onSaved={() => { setShowAddProgram(false); loadStudentData(selectedStudent); }}
        />
      )}
      {showLogSession && selectedStudent && (
        <LogDataSessionModal
          studentId={selectedStudent}
          behaviorTargets={behaviorTargets}
          programTargets={programTargets}
          onClose={() => setShowLogSession(false)}
          onSaved={() => { setShowLogSession(false); loadStudentData(selectedStudent); }}
        />
      )}
    </div>
  );
}

function AddBehaviorModal({ studentId, onClose, onSaved }: { studentId: number; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [measurementType, setMeasurementType] = useState("frequency");
  const [targetDirection, setTargetDirection] = useState("decrease");
  const [baselineValue, setBaselineValue] = useState("");
  const [goalValue, setGoalValue] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch(`${API}/students/${studentId}/behavior-targets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(), description: description || null, measurementType, targetDirection,
        baselineValue: baselineValue ? parseFloat(baselineValue) : null,
        goalValue: goalValue ? parseFloat(goalValue) : null,
      }),
    });
    if (res.ok) onSaved();
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-bold text-slate-800">Add Behavior Target</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[12px] font-medium text-slate-500">Behavior Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Elopement, Aggression"
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-slate-500">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Operational definition"
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-slate-500">Measurement</label>
              <select value={measurementType} onChange={e => setMeasurementType(e.target.value)}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200">
                <option value="frequency">Frequency (count)</option>
                <option value="interval">Interval (% of intervals)</option>
                <option value="percentage">Percentage</option>
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-500">Direction</label>
              <select value={targetDirection} onChange={e => setTargetDirection(e.target.value)}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200">
                <option value="decrease">Decrease</option>
                <option value="increase">Increase</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-slate-500">Baseline Value</label>
              <input type="number" value={baselineValue} onChange={e => setBaselineValue(e.target.value)} placeholder="e.g. 12"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-500">Goal Value</label>
              <input type="number" value={goalValue} onChange={e => setGoalValue(e.target.value)} placeholder="e.g. 2"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose} className="text-[12px]">Cancel</Button>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-[12px]" disabled={!name.trim() || saving} onClick={save}>
            <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save Target"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AddProgramModal({ studentId, onClose, onSaved }: { studentId: number; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [programType, setProgramType] = useState("discrete_trial");
  const [targetCriterion, setTargetCriterion] = useState("");
  const [domain, setDomain] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch(`${API}/students/${studentId}/program-targets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(), description: description || null, programType,
        targetCriterion: targetCriterion || null, domain: domain || null,
      }),
    });
    if (res.ok) onSaved();
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-bold text-slate-800">Add Skill Program</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[12px] font-medium text-slate-500">Program Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Receptive ID: Colors"
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-slate-500">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What the student will demonstrate"
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-slate-500">Program Type</label>
              <select value={programType} onChange={e => setProgramType(e.target.value)}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200">
                <option value="discrete_trial">Discrete Trial (DTT)</option>
                <option value="task_analysis">Task Analysis</option>
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-500">Domain</label>
              <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="e.g. Language"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-slate-500">Mastery Criterion</label>
            <input value={targetCriterion} onChange={e => setTargetCriterion(e.target.value)} placeholder="e.g. 80% across 3 consecutive sessions"
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose} className="text-[12px]">Cancel</Button>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-[12px]" disabled={!name.trim() || saving} onClick={save}>
            <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save Program"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function LogDataSessionModal({ studentId, behaviorTargets, programTargets, onClose, onSaved }: {
  studentId: number; behaviorTargets: BehaviorTarget[]; programTargets: ProgramTarget[];
  onClose: () => void; onSaved: () => void;
}) {
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [notes, setNotes] = useState("");
  const [behaviorValues, setBehaviorValues] = useState<Record<number, string>>({});
  const [programValues, setProgramValues] = useState<Record<number, { correct: string; total: string; prompted: string }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const bv: Record<number, string> = {};
    behaviorTargets.forEach(bt => { bv[bt.id] = ""; });
    setBehaviorValues(bv);
    const pv: Record<number, { correct: string; total: string; prompted: string }> = {};
    programTargets.forEach(pt => {
      pv[pt.id] = { correct: "", total: pt.programType === "discrete_trial" ? "10" : "8", prompted: "" };
    });
    setProgramValues(pv);
  }, [behaviorTargets, programTargets]);

  async function save() {
    setSaving(true);
    const behaviorData = behaviorTargets
      .filter(bt => behaviorValues[bt.id] && behaviorValues[bt.id] !== "")
      .map(bt => ({
        behaviorTargetId: bt.id,
        value: parseFloat(behaviorValues[bt.id]),
        intervalCount: bt.measurementType === "interval" ? 20 : undefined,
        intervalsWith: bt.measurementType === "interval" ? Math.round(parseFloat(behaviorValues[bt.id]) * 20 / 100) : undefined,
      }));

    const programData = programTargets
      .filter(pt => programValues[pt.id]?.correct !== "")
      .map(pt => ({
        programTargetId: pt.id,
        trialsCorrect: parseInt(programValues[pt.id].correct) || 0,
        trialsTotal: parseInt(programValues[pt.id].total) || 10,
        prompted: parseInt(programValues[pt.id].prompted) || 0,
      }));

    const res = await fetch(`${API}/students/${studentId}/data-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionDate, startTime, endTime, notes: notes || null, behaviorData, programData }),
    });
    if (res.ok) onSaved();
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 overflow-y-auto py-8" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl my-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-bold text-slate-800">Log Data Session</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[12px] font-medium text-slate-500">Date *</label>
              <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-500">Start</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-500">End</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
          </div>

          {behaviorTargets.length > 0 && (
            <div>
              <p className="text-[13px] font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-red-500" /> Behavior Data
              </p>
              <div className="space-y-2">
                {behaviorTargets.map(bt => (
                  <div key={bt.id} className="flex items-center gap-3 bg-slate-50 rounded-lg p-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-slate-700 truncate">{bt.name}</p>
                      <p className="text-[10px] text-slate-400">{measureLabel(bt.measurementType)}</p>
                    </div>
                    <input
                      type="number" min="0" placeholder="Value"
                      value={behaviorValues[bt.id] ?? ""}
                      onChange={e => setBehaviorValues({ ...behaviorValues, [bt.id]: e.target.value })}
                      className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-center focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {programTargets.length > 0 && (
            <div>
              <p className="text-[13px] font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-indigo-500" /> Program Data
              </p>
              <div className="space-y-2">
                {programTargets.map(pt => (
                  <div key={pt.id} className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-[13px] font-medium text-slate-700">{pt.name}</p>
                    <p className="text-[10px] text-slate-400 mb-1.5">
                      {pt.programType === "discrete_trial" ? "DTT" : "Task Analysis"}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-slate-400">Correct</label>
                        <input type="number" min="0" placeholder="0"
                          value={programValues[pt.id]?.correct ?? ""}
                          onChange={e => setProgramValues({ ...programValues, [pt.id]: { ...programValues[pt.id], correct: e.target.value } })}
                          className="w-full border border-slate-200 rounded px-2 py-1 text-[12px] text-center focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                      </div>
                      <span className="text-slate-400 text-[12px] mt-3">/</span>
                      <div className="flex-1">
                        <label className="text-[10px] text-slate-400">Total</label>
                        <input type="number" min="1" placeholder="10"
                          value={programValues[pt.id]?.total ?? ""}
                          onChange={e => setProgramValues({ ...programValues, [pt.id]: { ...programValues[pt.id], total: e.target.value } })}
                          className="w-full border border-slate-200 rounded px-2 py-1 text-[12px] text-center focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-slate-400">Prompted</label>
                        <input type="number" min="0" placeholder="0"
                          value={programValues[pt.id]?.prompted ?? ""}
                          onChange={e => setProgramValues({ ...programValues, [pt.id]: { ...programValues[pt.id], prompted: e.target.value } })}
                          className="w-full border border-slate-200 rounded px-2 py-1 text-[12px] text-center focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-[12px] font-medium text-slate-500">Session Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes..."
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose} className="text-[12px]">Cancel</Button>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-[12px]" disabled={saving} onClick={save}>
            <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save Session"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const API_BASE = "/api";
