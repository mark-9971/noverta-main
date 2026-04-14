import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
  TrendingDown, TrendingUp, Target, Plus, Activity, GraduationCap, X, Save,
  Calendar, ChevronRight, ChevronDown, ChevronUp, Copy, Settings2, Timer, Minus, Check, RotateCcw,
  BookOpen, Layers, Play, Pause, ArrowUp, ArrowDown, Hand, Eye, Mic, Sparkles, Hash, Percent, Clock,
  Wand2, FileUp
} from "lucide-react";
import ProgramBuilderWizard from "@/components/program-builder/ProgramBuilderWizard";
import TemplateManager from "@/components/program-builder/TemplateManager";
import SaveAsTemplateModal from "@/components/program-builder/SaveAsTemplateModal";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, BarChart, Bar
} from "recharts";
import { toast } from "sonner";
import {
  listStudents, listProgramTemplates, listBehaviorTargets, listProgramTargets,
  listDataSessions, getBehaviorDataTrends, getProgramDataTrends,
  listProgramSteps, createDataSession, cloneTemplateToStudent,
  updateProgramTarget, createProgramStep, createBehaviorTarget,
  createProgramTarget, getDataSession,
} from "@workspace/api-client-react";

interface BehaviorTarget {
  id: number; studentId: number; name: string; description: string;
  measurementType: string; targetDirection: string;
  baselineValue: string | null; goalValue: string | null; active: boolean;
  trackingMethod?: string; intervalLengthSeconds?: number; enableHourlyTracking?: boolean;
}
interface ProgramTarget {
  id: number; studentId: number; name: string; description: string;
  programType: string; targetCriterion: string; domain: string; active: boolean;
  promptHierarchy?: string[]; currentPromptLevel?: string; currentStep?: number;
  autoProgressEnabled?: boolean; masteryCriterionPercent?: number;
  masteryCriterionSessions?: number; regressionThreshold?: number;
  regressionSessions?: number; reinforcementSchedule?: string;
  reinforcementType?: string; tutorInstructions?: string; templateId?: number;
}
interface ProgramStep {
  id: number; programTargetId: number; stepNumber: number; name: string;
  sdInstruction?: string; targetResponse?: string; materials?: string;
  promptStrategy?: string; errorCorrection?: string; reinforcementNotes?: string;
  active: boolean; mastered: boolean;
}
interface DataSession {
  id: number; studentId: number; sessionDate: string; staffName: string | null;
  startTime: string; endTime: string;
}
interface ProgramTemplate {
  id: number; name: string; description: string; category: string;
  programType: string; domain: string; isGlobal: boolean;
  promptHierarchy: string[]; defaultMasteryPercent: number;
  defaultMasterySessions: number; tutorInstructions: string;
  steps: Array<{ name: string; sdInstruction?: string; targetResponse?: string; materials?: string }>;
}
interface Student { id: number; firstName: string; lastName: string; }
interface TrendPoint {
  sessionDate: string; value?: string; targetName?: string; measurementType?: string;
  behaviorTargetId?: number; programTargetId?: number;
  trialsCorrect?: number; trialsTotal?: number; percentCorrect?: string;
  promptLevelUsed?: string; hourBlock?: string;
}

const COLORS = ["#059669", "#f59e0b", "#ef4444", "#10b981", "#6b7280", "#9ca3af", "#374151", "#d1d5db"];

const PROMPT_LABELS: Record<string, { label: string; short: string; icon: any; color: string }> = {
  full_physical: { label: "Full Physical", short: "FP", icon: Hand, color: "bg-red-100 text-red-700" },
  partial_physical: { label: "Partial Physical", short: "PP", icon: Hand, color: "bg-amber-50 text-amber-700" },
  model: { label: "Model", short: "M", icon: Eye, color: "bg-amber-50 text-amber-600" },
  gestural: { label: "Gestural", short: "G", icon: Hand, color: "bg-gray-100 text-gray-700" },
  verbal: { label: "Verbal", short: "V", icon: Mic, color: "bg-gray-50 text-gray-600" },
  independent: { label: "Independent", short: "I", icon: Sparkles, color: "bg-emerald-100 text-emerald-700" },
};

const REINFORCEMENT_SCHEDULES = [
  { value: "continuous", label: "Continuous (CRF)" },
  { value: "fixed_ratio", label: "Fixed Ratio (FR)" },
  { value: "variable_ratio", label: "Variable Ratio (VR)" },
  { value: "fixed_interval", label: "Fixed Interval (FI)" },
  { value: "variable_interval", label: "Variable Interval (VI)" },
];

function measureLabel(t: string) {
  if (t === "frequency") return "Count";
  if (t === "interval") return "% of intervals";
  if (t === "duration") return "Duration (sec)";
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
  const [templates, setTemplates] = useState<ProgramTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"behaviors" | "programs" | "sessions" | "templates" | "collect">("behaviors");
  const [showAddBehavior, setShowAddBehavior] = useState(false);
  const [showAddProgram, setShowAddProgram] = useState(false);
  const [showLogSession, setShowLogSession] = useState(false);
  const [editingProgram, setEditingProgram] = useState<ProgramTarget | null>(null);
  const [showProgramBuilder, setShowProgramBuilder] = useState(false);
  const [builderEditProgram, setBuilderEditProgram] = useState<ProgramTarget | null>(null);
  const [builderEditSteps, setBuilderEditSteps] = useState<any[]>([]);
  const [saveAsTemplateProgram, setSaveAsTemplateProgram] = useState<ProgramTarget | null>(null);

  useEffect(() => {
    Promise.all([
      listStudents(),
      listProgramTemplates(),
    ]).then(([data, tmpl]) => {
      const withData = (data as any[]).filter((s: any) => s.status === "active");
      setStudents(withData);
      setTemplates(tmpl as any[]);
      if (withData.length > 0) setSelectedStudent(withData[0].id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadStudentData = useCallback(async (sid: number) => {
    const [bt, pt, ds, btrend, ptrend] = await Promise.all([
      listBehaviorTargets(sid),
      listProgramTargets(sid),
      listDataSessions(sid, { limit: 30 }),
      getBehaviorDataTrends(sid),
      getProgramDataTrends(sid),
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
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-4 md:space-y-6">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Program Data</h1>
          <p className="text-xs md:text-sm text-gray-400 mt-1 hidden sm:block">ABA programs, behavior tracking, and data collection</p>
        </div>
        <select
          value={selectedStudent ?? ""}
          onChange={e => setSelectedStudent(parseInt(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200 w-full sm:w-auto"
        >
          {students.map(s => (
            <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
          ))}
        </select>
      </div>

      {selectedStudent && (
        <>
          <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
            {([
              { key: "collect" as const, label: "Collect", fullLabel: "Data Collection", icon: Play, count: null, mobile: true },
              { key: "behaviors" as const, label: "Behaviors", fullLabel: "Behavior Targets", icon: Activity, count: behaviorTargets.length, mobile: false },
              { key: "programs" as const, label: "Programs", fullLabel: "Skill Programs", icon: GraduationCap, count: programTargets.length, mobile: false },
              { key: "sessions" as const, label: "Sessions", fullLabel: "Data Sessions", icon: Calendar, count: dataSessions.length, mobile: false },
              { key: "templates" as const, label: "Library", fullLabel: "Template Library", icon: Layers, count: templates.length, mobile: false },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2.5 text-[12px] md:text-[13px] font-medium border-b-2 transition-all whitespace-nowrap ${
                  tab === t.key ? "border-emerald-700 text-emerald-800" : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                <t.icon className="w-4 h-4" />
                <span className="md:hidden">{t.label}</span>
                <span className="hidden md:inline">{t.fullLabel}</span>
                {t.count !== null && <span className="hidden sm:inline">({t.count})</span>}
              </button>
            ))}
          </div>

          {tab === "collect" && (
            <LiveDataCollection
              studentId={selectedStudent}
              student={student!}
              behaviorTargets={behaviorTargets}
              programTargets={programTargets}
              onSessionSaved={() => loadStudentData(selectedStudent)}
            />
          )}

          {tab === "behaviors" && (
            <div className="space-y-4 md:space-y-6">
              <Card className="hidden md:block">
                <CardHeader className="pb-0 flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-gray-600">
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
                        {uniqueBehaviorNames.map((name, i) => (
                          <Line key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]}
                            strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                        ))}
                        {behaviorTargets.map((bt, i) => bt.goalValue ? (
                          <ReferenceLine key={`goal-${bt.id}`} y={parseFloat(bt.goalValue)} stroke={COLORS[i % COLORS.length]}
                            strokeDasharray="5 5" strokeOpacity={0.5} />
                        ) : null)}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="py-12 text-center text-gray-400 text-sm">No behavior data yet. Use Data Collection tab to start tracking.</div>
                  )}
                </CardContent>
              </Card>

              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-600">Active Behavior Targets</h3>
                <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8"
                  onClick={() => setShowAddBehavior(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {behaviorTargets.map((bt, i) => {
                  const latest = behaviorTrends.filter(t => t.behaviorTargetId === bt.id);
                  const lastVal = latest.length > 0 ? parseFloat(latest[latest.length - 1].value!) : null;
                  const firstVal = latest.length > 1 ? parseFloat(latest[0].value!) : null;
                  const improving = firstVal && lastVal ? (bt.targetDirection === "decrease" ? lastVal < firstVal : lastVal > firstVal) : null;

                  return (
                    <Card key={bt.id}>
                      <CardContent className="p-3.5 md:p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="min-w-0">
                            <p className="text-[14px] font-semibold text-gray-700 truncate">{bt.name}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {measureLabel(bt.measurementType)} · {bt.targetDirection} to {bt.goalValue ?? "—"}
                              {bt.enableHourlyTracking && " · Hourly"}
                            </p>
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
                        <p className="text-[11px] text-gray-400 mt-2">{latest.length} data points</p>
                      </CardContent>
                    </Card>
                  );
                })}
                {behaviorTargets.length === 0 && (
                  <div className="col-span-full text-center py-8 text-gray-400 text-sm">No behavior targets. Add one to start tracking.</div>
                )}
              </div>
            </div>
          )}

          {tab === "programs" && (
            <div className="space-y-4 md:space-y-6">
              <Card className="hidden md:block">
                <CardHeader className="pb-0">
                  <CardTitle className="text-sm font-semibold text-gray-600">
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
                        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                        <Tooltip labelFormatter={d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                          formatter={(v: any) => [`${v}%`, undefined]} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <ReferenceLine y={80} stroke="#10b981" strokeDasharray="5 5" strokeOpacity={0.5} label={{ value: "Mastery", position: "right", fontSize: 10, fill: "#10b981" }} />
                        {uniqueProgramNames.map((name, i) => (
                          <Line key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]}
                            strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="py-12 text-center text-gray-400 text-sm">No program data yet.</div>
                  )}
                </CardContent>
              </Card>

              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-gray-600">Active Skill Programs</h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="text-[12px] h-8" onClick={() => setShowAddProgram(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Quick Add
                  </Button>
                  <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8"
                    onClick={() => setShowProgramBuilder(true)}>
                    <Wand2 className="w-3.5 h-3.5 mr-1" /> Program Builder
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {programTargets.map((pt) => {
                  const data = programTrends.filter(t => t.programTargetId === pt.id);
                  const lastPct = data.length > 0 ? parseFloat(data[data.length - 1].percentCorrect!) : null;
                  const last3 = data.slice(-3);
                  const avgLast3 = last3.length > 0 ? Math.round(last3.reduce((s, d) => s + parseFloat(d.percentCorrect!), 0) / last3.length) : null;
                  const mastered = avgLast3 !== null && avgLast3 >= (pt.masteryCriterionPercent ?? 80);
                  const promptInfo = PROMPT_LABELS[pt.currentPromptLevel ?? "verbal"];

                  return (
                    <Card key={pt.id} className="hover:shadow-sm transition-shadow">
                      <CardContent className="p-3.5 md:p-4">
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <div className="min-w-0 cursor-pointer" onClick={() => setEditingProgram(pt)}>
                            <p className="text-[14px] font-semibold text-gray-700 truncate">{pt.name}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {pt.programType === "discrete_trial" ? "DTT" : pt.programType === "task_analysis" ? "Task Analysis" : pt.programType === "natural_environment" ? "NET" : pt.programType === "fluency" ? "Fluency" : pt.programType} · {pt.domain || "General"}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {promptInfo && (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${promptInfo.color}`}>
                                {promptInfo.short}
                              </span>
                            )}
                            {mastered && (
                              <span className="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                                <Target className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-3" onClick={() => setEditingProgram(pt)}>
                          <div className="bg-gray-50 rounded-lg p-2 text-center cursor-pointer">
                            <p className="text-[10px] text-gray-400">Last</p>
                            <p className="text-[15px] font-bold text-emerald-700">{lastPct != null ? `${lastPct}%` : "—"}</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2 text-center cursor-pointer">
                            <p className="text-[10px] text-gray-400">Avg 3</p>
                            <p className={`text-[15px] font-bold ${(avgLast3 ?? 0) >= (pt.masteryCriterionPercent ?? 80) ? "text-emerald-600" : "text-gray-600"}`}>
                              {avgLast3 != null ? `${avgLast3}%` : "—"}
                            </p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2 text-center cursor-pointer">
                            <p className="text-[10px] text-gray-400">Mastery</p>
                            <p className="text-[15px] font-bold text-gray-600">{pt.masteryCriterionPercent ?? 80}%</p>
                          </div>
                        </div>
                        {pt.autoProgressEnabled && (
                          <div className="flex items-center gap-1.5 mt-2">
                            <ArrowUp className="w-3 h-3 text-emerald-500" />
                            <span className="text-[10px] text-gray-400">Auto-progress at {pt.masteryCriterionPercent ?? 80}% x{pt.masteryCriterionSessions ?? 3}</span>
                            <ArrowDown className="w-3 h-3 text-red-400 ml-2" />
                            <span className="text-[10px] text-gray-400">Regress &lt;{pt.regressionThreshold ?? 50}% x{pt.regressionSessions ?? 2}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                          <p className="text-[11px] text-gray-400">{data.length} data points</p>
                          <div className="flex gap-1">
                            <button onClick={() => {
                              listProgramSteps(pt.id).then(s => {
                                setBuilderEditProgram(pt); setBuilderEditSteps(s as any[]);
                              });
                            }} className="text-[10px] text-emerald-700 hover:text-emerald-900 font-medium px-1.5 py-0.5 rounded hover:bg-emerald-50">
                              <Wand2 className="w-3 h-3 inline mr-0.5" /> Builder
                            </button>
                            <button onClick={() => setSaveAsTemplateProgram(pt)}
                              className="text-[10px] text-gray-500 hover:text-gray-700 font-medium px-1.5 py-0.5 rounded hover:bg-gray-100">
                              <FileUp className="w-3 h-3 inline mr-0.5" /> Save Template
                            </button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                {programTargets.length === 0 && (
                  <div className="col-span-full text-center py-8 text-gray-400 text-sm">No skill programs. Add one or use a template from the Library tab.</div>
                )}
              </div>
            </div>
          )}

          {tab === "sessions" && (
            <DataSessionsTab
              dataSessions={dataSessions}
              onLogSession={() => setShowLogSession(true)}
            />
          )}

          {tab === "templates" && (
            <TemplateManager
              studentId={selectedStudent}
              onCloned={() => loadStudentData(selectedStudent)}
              onTemplateUpdated={() => listProgramTemplates().then(t => setTemplates(t as any[]))}
            />
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
          templates={templates}
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
      {editingProgram && (
        <ProgramDetailModal
          program={editingProgram}
          onClose={() => setEditingProgram(null)}
          onSaved={() => { setEditingProgram(null); if (selectedStudent) loadStudentData(selectedStudent); }}
        />
      )}
      {showProgramBuilder && selectedStudent && student && (
        <ProgramBuilderWizard
          studentId={selectedStudent}
          studentName={`${student.firstName} ${student.lastName}`}
          onClose={() => setShowProgramBuilder(false)}
          onSaved={() => { setShowProgramBuilder(false); if (selectedStudent) loadStudentData(selectedStudent); }}
        />
      )}
      {builderEditProgram && student && (
        <ProgramBuilderWizard
          studentId={builderEditProgram.studentId}
          studentName={`${student.firstName} ${student.lastName}`}
          editingProgram={builderEditProgram}
          existingSteps={builderEditSteps}
          onClose={() => { setBuilderEditProgram(null); setBuilderEditSteps([]); }}
          onSaved={() => { setBuilderEditProgram(null); setBuilderEditSteps([]); if (selectedStudent) loadStudentData(selectedStudent); }}
        />
      )}
      {saveAsTemplateProgram && (
        <SaveAsTemplateModal
          programId={saveAsTemplateProgram.id}
          programName={saveAsTemplateProgram.name}
          onClose={() => setSaveAsTemplateProgram(null)}
          onSaved={() => { setSaveAsTemplateProgram(null); listProgramTemplates().then(t => setTemplates(t as any[])); }}
        />
      )}
    </div>
  );
}

function LiveDataCollection({ studentId, student, behaviorTargets, programTargets, onSessionSaved }: {
  studentId: number; student: Student; behaviorTargets: BehaviorTarget[]; programTargets: ProgramTarget[];
  onSessionSaved: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [behaviorCounts, setBehaviorCounts] = useState<Record<number, number>>({});
  const [programResults, setProgramResults] = useState<Record<number, { correct: number; total: number; prompted: number; promptLevel: string }>>({});
  const [trialHistory, setTrialHistory] = useState<Record<number, Array<{ correct: boolean; prompted: boolean }>>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isIoaSession, setIsIoaSession] = useState(false);
  const [ioaObserverNumber, setIoaObserverNumber] = useState<1 | 2>(1);
  const [ioaSessionId, setIoaSessionId] = useState<string>("");
  const [ioaObserverName, setIoaObserverName] = useState("");
  const [eventTimestamps, setEventTimestamps] = useState<Record<number, number[]>>({});
  const [ioaObservedTargets, setIoaObservedTargets] = useState<Record<number, boolean>>({});
  const [intervalScoresMap, setIntervalScoresMap] = useState<Record<number, boolean[]>>({});
  const timerRef = useRef<any>(null);
  const startTimeRef = useRef<string>("");

  useEffect(() => {
    const bc: Record<number, number> = {};
    behaviorTargets.forEach(bt => { bc[bt.id] = 0; });
    setBehaviorCounts(bc);
    const pr: Record<number, { correct: number; total: number; prompted: number; promptLevel: string }> = {};
    const th: Record<number, Array<{ correct: boolean; prompted: boolean }>> = {};
    programTargets.forEach(pt => {
      pr[pt.id] = { correct: 0, total: 0, prompted: 0, promptLevel: pt.currentPromptLevel ?? "verbal" };
      th[pt.id] = [];
    });
    setProgramResults(pr);
    setTrialHistory(th);
  }, [behaviorTargets, programTargets]);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function startSession() {
    setRunning(true);
    setSaved(false);
    setElapsed(0);
    setEventTimestamps({});
    setIoaObservedTargets({});
    setIntervalScoresMap({});
    startTimeRef.current = new Date().toTimeString().slice(0, 5);
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
  }

  function stopSession() {
    setRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  async function saveSession() {
    setSaving(true);
    const now = new Date();
    const endTime = now.toTimeString().slice(0, 5);
    const sessionDate = now.toISOString().split("T")[0];

    const ioaSessId = isIoaSession ? (ioaSessionId ? parseInt(ioaSessionId) : Math.floor(Math.random() * 2000000000) + 1) : null;
    const behaviorData = behaviorTargets
      .filter(bt => behaviorCounts[bt.id] > 0 || (isIoaSession && ioaObservedTargets[bt.id]))
      .map(bt => ({
        behaviorTargetId: bt.id,
        value: behaviorCounts[bt.id] ?? 0,
        hourBlock: `${now.getHours()}:00`,
        ioaSessionId: ioaSessId,
        observerNumber: isIoaSession ? ioaObserverNumber : null,
        observerName: isIoaSession ? (ioaObserverName || null) : null,
        eventTimestamps: isIoaSession && eventTimestamps[bt.id]?.length ? eventTimestamps[bt.id] : null,
        intervalScores: isIoaSession && intervalScoresMap[bt.id]?.length ? intervalScoresMap[bt.id] : null,
      }));

    const programData = programTargets
      .filter(pt => programResults[pt.id]?.total > 0)
      .map(pt => ({
        programTargetId: pt.id,
        trialsCorrect: programResults[pt.id].correct,
        trialsTotal: programResults[pt.id].total,
        prompted: programResults[pt.id].prompted,
        promptLevelUsed: programResults[pt.id].promptLevel,
      }));

    const res = await createDataSession(studentId, {
        sessionDate,
        startTime: startTimeRef.current,
        endTime,
        behaviorData,
        programData,
      });

    setSaved(true);
    if (isIoaSession && ioaSessId) {
      toast.success(`IOA session saved. Session ID: ${ioaSessId} — share this with Observer ${ioaObserverNumber === 1 ? "2" : "1"}`);
    }
    onSessionSaved();
    setSaving(false);
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  function recordTrial(ptId: number, correct: boolean, prompted: boolean) {
    setProgramResults(prev => ({
      ...prev,
      [ptId]: {
        ...prev[ptId],
        total: (prev[ptId]?.total ?? 0) + 1,
        correct: (prev[ptId]?.correct ?? 0) + (correct ? 1 : 0),
        prompted: (prev[ptId]?.prompted ?? 0) + (prompted ? 1 : 0),
      },
    }));
    setTrialHistory(prev => ({
      ...prev,
      [ptId]: [...(prev[ptId] ?? []), { correct, prompted }],
    }));
  }

  function undoLastTrial(ptId: number) {
    const history = trialHistory[ptId] ?? [];
    if (history.length === 0) return;
    const lastTrial = history[history.length - 1];
    setProgramResults(prev => ({
      ...prev,
      [ptId]: {
        ...prev[ptId],
        total: Math.max(0, prev[ptId].total - 1),
        correct: Math.max(0, prev[ptId].correct - (lastTrial.correct ? 1 : 0)),
        prompted: Math.max(0, prev[ptId].prompted - (lastTrial.prompted ? 1 : 0)),
      },
    }));
    setTrialHistory(prev => ({
      ...prev,
      [ptId]: prev[ptId].slice(0, -1),
    }));
  }

  return (
    <div className="space-y-4">
      <Card className={`border-2 ${running ? "border-emerald-300 bg-emerald-50/30" : saved ? "border-emerald-300 bg-emerald-50/30" : "border-gray-200"}`}>
        <CardContent className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800">{student.firstName} {student.lastName}</h2>
              <p className="text-xs text-gray-400">Live Data Collection</p>
            </div>
            <div className="text-right">
              <p className="text-3xl md:text-4xl font-mono font-bold text-gray-800">{formatTime(elapsed)}</p>
              <p className="text-xs text-gray-400">{running ? "Recording..." : saved ? "Session Saved" : "Ready"}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {!running && !saved && (
              <Button className="flex-1 h-12 md:h-10 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold" onClick={startSession}>
                <Play className="w-4 h-4 mr-2" /> Start Session
              </Button>
            )}
            {running && (
              <Button className="flex-1 h-12 md:h-10 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold" onClick={stopSession}>
                <Pause className="w-4 h-4 mr-2" /> Stop
              </Button>
            )}
            {!running && elapsed > 0 && !saved && (
              <>
                <Button className="flex-1 h-12 md:h-10 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold" onClick={saveSession} disabled={saving}>
                  <Save className="w-4 h-4 mr-2" /> {saving ? "Saving..." : "Save Session"}
                </Button>
                <Button variant="outline" className="h-12 md:h-10" onClick={startSession}>
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </>
            )}
            {saved && (
              <Button className="flex-1 h-12 md:h-10 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold" onClick={() => {
                setSaved(false); setElapsed(0);
                setIsIoaSession(false); setIoaSessionId("");
                const bc: Record<number, number> = {};
                behaviorTargets.forEach(bt => { bc[bt.id] = 0; });
                setBehaviorCounts(bc);
                const pr: Record<number, any> = {};
                const th: Record<number, any[]> = {};
                programTargets.forEach(pt => { pr[pt.id] = { correct: 0, total: 0, prompted: 0, promptLevel: pt.currentPromptLevel ?? "verbal" }; th[pt.id] = []; });
                setProgramResults(pr);
                setTrialHistory(th);
              }}>
                <Play className="w-4 h-4 mr-2" /> New Session
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isIoaSession}
                  onChange={e => setIsIoaSession(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  disabled={running || saved}
                />
                <span className="text-[12px] font-medium text-gray-700">IOA Session</span>
              </label>
              {isIoaSession && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-semibold">
                  Inter-Observer Agreement
                </span>
              )}
            </div>
          </div>
          {isIoaSession && (
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-gray-500">Observer:</span>
                <select
                  value={ioaObserverNumber}
                  onChange={e => setIoaObserverNumber(parseInt(e.target.value) as 1 | 2)}
                  className="text-[11px] border border-gray-200 rounded px-2 py-1 bg-white"
                  disabled={running || saved}
                >
                  <option value={1}>Observer 1 (Primary)</option>
                  <option value={2}>Observer 2 (Reliability)</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-gray-500">Your Name:</span>
                <input
                  type="text"
                  value={ioaObserverName}
                  onChange={e => setIoaObserverName(e.target.value)}
                  placeholder="e.g. J. Smith (BCBA)"
                  className="text-[11px] border border-gray-200 rounded px-2 py-1 w-40"
                  disabled={running || saved}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-gray-500">IOA Session ID:</span>
                <input
                  type="text"
                  value={ioaSessionId}
                  onChange={e => setIoaSessionId(e.target.value)}
                  placeholder="Auto-generated if blank"
                  className="text-[11px] border border-gray-200 rounded px-2 py-1 w-36"
                  disabled={running || saved}
                />
              </div>
              <p className="text-[10px] text-gray-400 w-full">
                Both observers must use the same IOA Session ID. Observer 1 records first, then share the ID with Observer 2.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {behaviorTargets.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-red-500" /> Behavior Tracking
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {behaviorTargets.map(bt => (
              <Card key={bt.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex items-center">
                    <div className="flex-1 p-3 md:p-4 min-w-0">
                      <p className="text-sm font-semibold text-gray-700 truncate">{bt.name}</p>
                      <p className="text-[10px] text-gray-400">{measureLabel(bt.measurementType)} · Goal: {bt.goalValue ?? "—"}</p>
                    </div>
                    <div className="flex items-center gap-0 border-l border-gray-100">
                      <button
                        className="w-12 h-16 md:w-10 md:h-14 flex items-center justify-center text-gray-400 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                        onClick={() => {
                          setBehaviorCounts(prev => ({ ...prev, [bt.id]: Math.max(0, (prev[bt.id] ?? 0) - 1) }));
                          if (isIoaSession) {
                            setEventTimestamps(prev => {
                              const arr = [...(prev[bt.id] || [])];
                              arr.pop();
                              return { ...prev, [bt.id]: arr };
                            });
                          }
                        }}
                        disabled={!running}
                      >
                        <Minus className="w-5 h-5" />
                      </button>
                      <div className="w-14 md:w-12 text-center">
                        <p className="text-2xl md:text-xl font-bold text-emerald-700">{behaviorCounts[bt.id] ?? 0}</p>
                      </div>
                      <button
                        className="w-12 h-16 md:w-10 md:h-14 flex items-center justify-center text-emerald-700 hover:bg-emerald-50 active:bg-emerald-100 transition-colors"
                        onClick={() => {
                          setBehaviorCounts(prev => ({ ...prev, [bt.id]: (prev[bt.id] ?? 0) + 1 }));
                          if (isIoaSession) {
                            setIoaObservedTargets(prev => ({ ...prev, [bt.id]: true }));
                            setEventTimestamps(prev => ({
                              ...prev,
                              [bt.id]: [...(prev[bt.id] || []), Date.now()]
                            }));
                          }
                        }}
                        disabled={!running}
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  {isIoaSession && bt.measurementType === "interval" && running && (
                    <div className="border-t border-gray-100 px-3 py-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-gray-500">Intervals:</span>
                        {(intervalScoresMap[bt.id] || []).map((score, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setIntervalScoresMap(prev => {
                                const arr = [...(prev[bt.id] || [])];
                                arr[idx] = !arr[idx];
                                return { ...prev, [bt.id]: arr };
                              });
                            }}
                            className={`w-6 h-6 text-[9px] rounded border ${score ? "bg-emerald-100 border-emerald-300 text-emerald-700" : "bg-gray-50 border-gray-200 text-gray-400"}`}
                          >
                            {idx + 1}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            setIoaObservedTargets(prev => ({ ...prev, [bt.id]: true }));
                            setIntervalScoresMap(prev => ({
                              ...prev,
                              [bt.id]: [...(prev[bt.id] || []), true]
                            }));
                          }}
                          className="w-6 h-6 text-[9px] rounded border border-dashed border-gray-300 text-gray-400 hover:bg-gray-50"
                          title="Add interval (behavior present)"
                        >
                          +
                        </button>
                        <button
                          onClick={() => {
                            setIoaObservedTargets(prev => ({ ...prev, [bt.id]: true }));
                            setIntervalScoresMap(prev => ({
                              ...prev,
                              [bt.id]: [...(prev[bt.id] || []), false]
                            }));
                          }}
                          className="w-6 h-6 text-[9px] rounded border border-dashed border-gray-300 text-red-400 hover:bg-red-50"
                          title="Add interval (behavior absent)"
                        >
                          −
                        </button>
                      </div>
                      <p className="text-[9px] text-gray-400 mt-1">Tap + for present, − for absent. Tap numbered boxes to toggle.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {programTargets.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
            <GraduationCap className="w-4 h-4 text-emerald-600" /> Discrete Trial Data
          </h3>
          <div className="space-y-2">
            {programTargets.map(pt => {
              const result = programResults[pt.id] ?? { correct: 0, total: 0, prompted: 0, promptLevel: "verbal" };
              const pct = result.total > 0 ? Math.round((result.correct / result.total) * 100) : null;
              const promptInfo = PROMPT_LABELS[result.promptLevel ?? "verbal"];

              return (
                <Card key={pt.id}>
                  <CardContent className="p-3.5 md:p-4">
                    <div className="flex items-start justify-between mb-3 gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-700 truncate">{pt.name}</p>
                        <p className="text-[10px] text-gray-400">{pt.domain || "General"} · Step {pt.currentStep ?? 1}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${promptInfo?.color ?? "bg-gray-100 text-gray-600"}`}>
                          {promptInfo?.short ?? "?"}
                        </span>
                        {pct !== null && (
                          <span className={`text-sm font-bold ${pct >= (pt.masteryCriterionPercent ?? 80) ? "text-emerald-600" : "text-gray-600"}`}>
                            {pct}%
                          </span>
                        )}
                      </div>
                    </div>

                    {pt.tutorInstructions && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3 text-[11px] text-amber-800">
                        <BookOpen className="w-3 h-3 inline mr-1" /> {pt.tutorInstructions}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 mb-3 overflow-x-auto">
                      {(pt.promptHierarchy ?? []).map(level => (
                        <button
                          key={level}
                          onClick={() => setProgramResults(prev => ({ ...prev, [pt.id]: { ...prev[pt.id], promptLevel: level } }))}
                          className={`text-[10px] font-semibold px-2 py-1 rounded transition-all whitespace-nowrap ${
                            result.promptLevel === level
                              ? PROMPT_LABELS[level]?.color ?? "bg-gray-800 text-white"
                              : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                          }`}
                        >
                          {PROMPT_LABELS[level]?.short ?? level.slice(0, 2).toUpperCase()}
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <button
                        className="flex-1 h-14 md:h-12 rounded-xl bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border-2 border-emerald-200 text-emerald-700 font-bold text-sm transition-all flex items-center justify-center gap-2"
                        onClick={() => recordTrial(pt.id, true, false)}
                        disabled={!running}
                      >
                        <Check className="w-5 h-5" /> Correct
                      </button>
                      <button
                        className="flex-1 h-14 md:h-12 rounded-xl bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border-2 border-amber-200 text-amber-700 font-bold text-sm transition-all flex items-center justify-center gap-2"
                        onClick={() => recordTrial(pt.id, true, true)}
                        disabled={!running}
                      >
                        <Hand className="w-5 h-5" /> Prompted
                      </button>
                      <button
                        className="flex-1 h-14 md:h-12 rounded-xl bg-red-50 hover:bg-red-100 active:bg-red-200 border-2 border-red-200 text-red-600 font-bold text-sm transition-all flex items-center justify-center gap-2"
                        onClick={() => recordTrial(pt.id, false, false)}
                        disabled={!running}
                      >
                        <X className="w-5 h-5" /> Incorrect
                      </button>
                    </div>

                    <div className="flex items-center justify-between mt-2 text-[11px] text-gray-400">
                      <span>{result.correct}/{result.total} correct · {result.prompted} prompted</span>
                      {result.total > 0 && (
                        <button className="text-red-400 hover:text-red-600" onClick={() => undoLastTrial(pt.id)}>
                          <RotateCcw className="w-3 h-3" /> Undo
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {behaviorTargets.length === 0 && programTargets.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="font-medium">No targets set up for this student</p>
          <p className="text-sm mt-1">Add behavior or program targets first from the other tabs</p>
        </div>
      )}
    </div>
  );
}

function TemplateLibrary({ templates, studentId, onCloned, onTemplateCreated }: {
  templates: ProgramTemplate[]; studentId: number;
  onCloned: () => void; onTemplateCreated: (t: ProgramTemplate) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [cloning, setCloning] = useState<number | null>(null);

  const filtered = templates.filter(t => filter === "all" || t.category === filter);

  async function cloneToStudent(templateId: number) {
    setCloning(templateId);
    await cloneTemplateToStudent(templateId, { studentId });
    onCloned();
    setCloning(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-600">Program Templates</h3>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[{ key: "all", label: "All" }, { key: "academic", label: "Academic" }, { key: "behavior", label: "Behavior" }].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
              filter === f.key ? "bg-gray-800 text-white" : "bg-white text-gray-500 border border-gray-200"
            }`}>{f.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(t => (
          <Card key={t.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-3.5 md:p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-700 truncate">{t.name}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{t.domain || t.category} · {t.programType === "discrete_trial" ? "DTT" : "Task Analysis"}</p>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                  t.category === "academic" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
                }`}>{t.category}</span>
              </div>
              {t.description && <p className="text-[11px] text-gray-500 mb-2 line-clamp-2">{t.description}</p>}
              <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-3">
                {(t.steps as any[])?.length > 0 && <span>{(t.steps as any[]).length} steps</span>}
                <span>Mastery: {t.defaultMasteryPercent}%</span>
                {t.isGlobal && <span className="px-1 py-0.5 bg-gray-100 rounded">Global</span>}
              </div>
              <Button size="sm" className="w-full h-9 md:h-8 bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]"
                onClick={() => cloneToStudent(t.id)} disabled={cloning === t.id}>
                <Copy className="w-3.5 h-3.5 mr-1" /> {cloning === t.id ? "Cloning..." : "Clone to Student"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ProgramDetailModal({ program, onClose, onSaved }: { program: ProgramTarget; onClose: () => void; onSaved: () => void }) {
  const [steps, setSteps] = useState<ProgramStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ ...program });
  const [saving, setSaving] = useState(false);
  const [newStepName, setNewStepName] = useState("");
  const [newStepSd, setNewStepSd] = useState("");
  const [newStepResponse, setNewStepResponse] = useState("");

  useEffect(() => {
    listProgramSteps(program.id).then(s => { setSteps(s as any[]); setLoading(false); }).catch(() => setLoading(false));
  }, [program.id]);

  async function saveSettings() {
    setSaving(true);
    const res = await updateProgramTarget(program.id, {
        name: form.name,
        description: form.description,
        tutorInstructions: form.tutorInstructions,
        promptHierarchy: form.promptHierarchy,
        currentPromptLevel: form.currentPromptLevel,
        autoProgressEnabled: form.autoProgressEnabled,
        masteryCriterionPercent: form.masteryCriterionPercent,
        masteryCriterionSessions: form.masteryCriterionSessions,
        regressionThreshold: form.regressionThreshold,
        regressionSessions: form.regressionSessions,
        reinforcementSchedule: form.reinforcementSchedule,
        reinforcementType: form.reinforcementType,
      });
    onSaved();
    setSaving(false);
  }

  async function addStep() {
    if (!newStepName.trim()) return;
    const step = await createProgramStep(program.id, { name: newStepName.trim(), sdInstruction: newStepSd || null, targetResponse: newStepResponse || null });
    setSteps(prev => [...prev, step]);
    setNewStepName(""); setNewStepSd(""); setNewStepResponse("");
  }

  const allPrompts = ["full_physical","partial_physical","model","gestural","verbal","independent"];
  const hierarchy = form.promptHierarchy ?? allPrompts;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl my-auto max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 p-4 md:p-5 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{program.name}</h2>
            <p className="text-xs text-gray-400">{program.domain || "General"} · {program.programType === "discrete_trial" ? "Discrete Trial" : "Task Analysis"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="text-[12px] h-8" onClick={() => setEditMode(!editMode)}>
              <Settings2 className="w-3.5 h-3.5 mr-1" /> {editMode ? "View" : "Edit"}
            </Button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-4 md:p-5 space-y-5">
          {editMode ? (
            <>
              <div className="space-y-3">
                <div>
                  <label className="text-[12px] font-medium text-gray-500">Program Name</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-gray-500">Tutor Instructions</label>
                  <textarea value={form.tutorInstructions ?? ""} onChange={e => setForm({ ...form, tutorInstructions: e.target.value })}
                    rows={3} placeholder="Detailed instructions for the tutor..."
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
                </div>
              </div>

              <div>
                <label className="text-[12px] font-medium text-gray-500 mb-2 block">Prompt Hierarchy (drag to reorder)</label>
                <div className="space-y-1">
                  {hierarchy.map((level, idx) => {
                    const info = PROMPT_LABELS[level];
                    return (
                      <div key={level} className={`flex items-center gap-2 p-2 rounded-lg border ${form.currentPromptLevel === level ? "border-emerald-300 bg-emerald-50" : "border-gray-100"}`}>
                        <span className="text-[11px] text-gray-400 w-5">{idx + 1}</span>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${info?.color ?? "bg-gray-100"}`}>{info?.label ?? level}</span>
                        {form.currentPromptLevel === level && <span className="text-[10px] text-emerald-700 font-medium ml-auto">Current Level</span>}
                        <button className="text-[10px] text-emerald-700 ml-auto hover:text-emerald-900"
                          onClick={() => setForm({ ...form, currentPromptLevel: level })}>Set Current</button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-medium text-gray-500">Mastery %</label>
                  <input type="number" value={form.masteryCriterionPercent ?? 80} onChange={e => setForm({ ...form, masteryCriterionPercent: parseInt(e.target.value) || 80 })}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-gray-500">Mastery Sessions</label>
                  <input type="number" value={form.masteryCriterionSessions ?? 3} onChange={e => setForm({ ...form, masteryCriterionSessions: parseInt(e.target.value) || 3 })}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-gray-500">Regression %</label>
                  <input type="number" value={form.regressionThreshold ?? 50} onChange={e => setForm({ ...form, regressionThreshold: parseInt(e.target.value) || 50 })}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-gray-500">Regression Sessions</label>
                  <input type="number" value={form.regressionSessions ?? 2} onChange={e => setForm({ ...form, regressionSessions: parseInt(e.target.value) || 2 })}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.autoProgressEnabled ?? true}
                    onChange={e => setForm({ ...form, autoProgressEnabled: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300" />
                  <span className="text-[12px] text-gray-600">Auto-progress through prompt hierarchy</span>
                </label>
              </div>

              <div>
                <label className="text-[12px] font-medium text-gray-500">Reinforcement Schedule</label>
                <select value={form.reinforcementSchedule ?? "continuous"} onChange={e => setForm({ ...form, reinforcementSchedule: e.target.value })}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                  {REINFORCEMENT_SCHEDULES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setEditMode(false)} className="text-[12px]">Cancel</Button>
                <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]" onClick={saveSettings} disabled={saving}>
                  <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </>
          ) : (
            <>
              {program.tutorInstructions && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[12px] text-amber-800">
                  <BookOpen className="w-4 h-4 inline mr-1.5" /> <strong>Tutor Instructions:</strong> {program.tutorInstructions}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-400">Prompt Level</p>
                  <p className={`text-sm font-bold mt-1 ${PROMPT_LABELS[program.currentPromptLevel ?? "verbal"]?.color?.split(" ")[1] ?? "text-gray-600"}`}>
                    {PROMPT_LABELS[program.currentPromptLevel ?? "verbal"]?.label ?? program.currentPromptLevel}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-400">Mastery</p>
                  <p className="text-sm font-bold text-gray-600 mt-1">{program.masteryCriterionPercent ?? 80}% x{program.masteryCriterionSessions ?? 3}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-400">Reinforcement</p>
                  <p className="text-sm font-bold text-gray-600 mt-1 capitalize">{(program.reinforcementSchedule ?? "continuous").replace(/_/g, " ")}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-400">Auto-Progress</p>
                  <p className={`text-sm font-bold mt-1 ${program.autoProgressEnabled ? "text-emerald-600" : "text-gray-400"}`}>
                    {program.autoProgressEnabled ? "On" : "Off"}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-600">Program Steps ({steps.length})</h3>
                </div>
                {loading ? (
                  <Skeleton className="h-32 w-full" />
                ) : steps.length === 0 ? (
                  <p className="text-[12px] text-gray-400 py-4 text-center">No steps defined. Add steps below.</p>
                ) : (
                  <div className="space-y-1.5">
                    {steps.map(s => (
                      <div key={s.id} className={`flex items-center gap-3 p-2.5 md:p-3 rounded-lg border ${s.mastered ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-100"}`}>
                        <span className="text-sm font-bold text-gray-400 w-6 text-center">{s.stepNumber}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-gray-700 truncate">{s.name}</p>
                          {s.sdInstruction && <p className="text-[11px] text-gray-400 truncate">SD: "{s.sdInstruction}"</p>}
                          {s.targetResponse && <p className="text-[11px] text-gray-400 truncate">R: {s.targetResponse}</p>}
                        </div>
                        {s.mastered && <span className="text-[10px] font-semibold text-emerald-600 px-1.5 py-0.5 bg-emerald-100 rounded">Mastered</span>}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 border border-dashed border-gray-200 rounded-lg p-3 space-y-2">
                  <p className="text-[11px] font-medium text-gray-500">Add Step</p>
                  <input value={newStepName} onChange={e => setNewStepName(e.target.value)} placeholder="Step name (e.g., Touch red)"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={newStepSd} onChange={e => setNewStepSd(e.target.value)} placeholder="SD instruction"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                    <input value={newStepResponse} onChange={e => setNewStepResponse(e.target.value)} placeholder="Target response"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                  <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]" onClick={addStep} disabled={!newStepName.trim()}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Step
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
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
  const [enableHourly, setEnableHourly] = useState(false);
  const [intervalLen, setIntervalLen] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast.error("Please enter a target name"); return; }
    setSaving(true);
    try {
      await createBehaviorTarget(studentId, {
          name: name.trim(), description: description || null, measurementType, targetDirection,
          baselineValue: baselineValue ? parseFloat(baselineValue) : null,
          goalValue: goalValue ? parseFloat(goalValue) : null,
          enableHourlyTracking: enableHourly,
          intervalLengthSeconds: intervalLen ? parseInt(intervalLen) : null,
        });
      toast.success("Behavior target added"); onSaved();
    } catch { toast.error("Failed to save behavior target"); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 md:p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-bold text-gray-800">Add Behavior Target</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[12px] font-medium text-gray-500">Behavior Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Elopement, Aggression"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-gray-500">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Operational definition"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-gray-500">Measurement</label>
              <select value={measurementType} onChange={e => setMeasurementType(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                <option value="frequency">Frequency (count)</option>
                <option value="interval">Interval (%)</option>
                <option value="percentage">Percentage</option>
                <option value="duration">Duration (sec)</option>
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-500">Direction</label>
              <select value={targetDirection} onChange={e => setTargetDirection(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                <option value="decrease">Decrease</option>
                <option value="increase">Increase</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-gray-500">Baseline Value</label>
              <input type="number" value={baselineValue} onChange={e => setBaselineValue(e.target.value)} placeholder="e.g. 12"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-500">Goal Value</label>
              <input type="number" value={goalValue} onChange={e => setGoalValue(e.target.value)} placeholder="e.g. 2"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
          </div>
          {measurementType === "interval" && (
            <div>
              <label className="text-[12px] font-medium text-gray-500">Interval Length (seconds)</label>
              <input type="number" value={intervalLen} onChange={e => setIntervalLen(e.target.value)} placeholder="e.g. 30"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={enableHourly} onChange={e => setEnableHourly(e.target.checked)} className="w-4 h-4 rounded border-gray-300" />
            <span className="text-[12px] text-gray-600">Enable hourly tracking breakdown</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose} className="text-[12px] h-9 md:h-8">Cancel</Button>
          <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-9 md:h-8" disabled={!name.trim() || saving} onClick={save}>
            <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save Target"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AddProgramModal({ studentId, templates, onClose, onSaved }: {
  studentId: number; templates: ProgramTemplate[]; onClose: () => void; onSaved: () => void;
}) {
  const [mode, setMode] = useState<"manual" | "template">("manual");
  const [name, setName] = useState("");
  const [programType, setProgramType] = useState("discrete_trial");
  const [domain, setDomain] = useState("");
  const [description, setDescription] = useState("");
  const [tutorInstructions, setTutorInstructions] = useState("");
  const [masteryPct, setMasteryPct] = useState("80");
  const [masterySessions, setMasterySessions] = useState("3");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast.error("Please enter a program name"); return; }
    setSaving(true);
    try {
      await createProgramTarget(studentId, {
          name: name.trim(), description: description || null, programType,
          domain: domain || null, tutorInstructions: tutorInstructions || null,
          masteryCriterionPercent: parseInt(masteryPct) || 80,
          masteryCriterionSessions: parseInt(masterySessions) || 3,
          targetCriterion: `${masteryPct}% across ${masterySessions} sessions`,
        });
      toast.success("Program target added"); onSaved();
    } catch { toast.error("Failed to save program target"); }
    setSaving(false);
  }

  async function cloneTemplate(templateId: number) {
    setSaving(true);
    await cloneTemplateToStudent(templateId, { studentId });
    onSaved();
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 md:p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-bold text-gray-800">Add Skill Program</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setMode("manual")} className={`px-3 py-1.5 rounded-full text-[12px] font-medium ${mode === "manual" ? "bg-gray-800 text-white" : "bg-white text-gray-500 border border-gray-200"}`}>
            Create Manually
          </button>
          <button onClick={() => setMode("template")} className={`px-3 py-1.5 rounded-full text-[12px] font-medium ${mode === "template" ? "bg-gray-800 text-white" : "bg-white text-gray-500 border border-gray-200"}`}>
            From Template
          </button>
        </div>

        {mode === "template" ? (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {templates.filter(t => t.category === "academic").map(t => (
              <button key={t.id} onClick={() => cloneTemplate(t.id)} disabled={saving}
                className="w-full text-left p-3 rounded-lg border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all">
                <p className="text-[13px] font-semibold text-gray-700">{t.name}</p>
                <p className="text-[11px] text-gray-400">{t.domain} · {(t.steps as any[])?.length ?? 0} steps · Mastery {t.defaultMasteryPercent}%</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-[12px] font-medium text-gray-500">Program Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Receptive ID: Colors"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-500">Description</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What the student will demonstrate"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-medium text-gray-500">Type</label>
                <select value={programType} onChange={e => setProgramType(e.target.value)}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                  <option value="discrete_trial">Discrete Trial (DTT)</option>
                  <option value="task_analysis">Task Analysis</option>
                </select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-gray-500">Domain</label>
                <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="e.g. Language"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-500">Tutor Instructions</label>
              <textarea value={tutorInstructions} onChange={e => setTutorInstructions(e.target.value)}
                rows={2} placeholder="Instructions for the tutor..."
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-medium text-gray-500">Mastery %</label>
                <input type="number" value={masteryPct} onChange={e => setMasteryPct(e.target.value)} placeholder="80"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-gray-500">Sessions Required</label>
                <input type="number" value={masterySessions} onChange={e => setMasterySessions(e.target.value)} placeholder="3"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
            </div>
          </div>
        )}

        {mode === "manual" && (
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" size="sm" onClick={onClose} className="text-[12px] h-9 md:h-8">Cancel</Button>
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-9 md:h-8" disabled={!name.trim() || saving} onClick={save}>
              <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save Program"}
            </Button>
          </div>
        )}
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
  const [programValues, setProgramValues] = useState<Record<number, { correct: string; total: string; prompted: string; promptLevel: string }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const bv: Record<number, string> = {};
    behaviorTargets.forEach(bt => { bv[bt.id] = ""; });
    setBehaviorValues(bv);
    const pv: Record<number, { correct: string; total: string; prompted: string; promptLevel: string }> = {};
    programTargets.forEach(pt => {
      pv[pt.id] = { correct: "", total: pt.programType === "discrete_trial" ? "10" : "8", prompted: "", promptLevel: pt.currentPromptLevel ?? "verbal" };
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
        promptLevelUsed: programValues[pt.id].promptLevel,
      }));

    await createDataSession(studentId, { sessionDate, startTime, endTime, notes: notes || null, behaviorData, programData });
    onSaved();
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 md:p-6 w-full max-w-lg shadow-xl my-auto max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-bold text-gray-800">Log Data Session</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[12px] font-medium text-gray-500">Date *</label>
              <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-500">Start</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-500">End</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
          </div>

          {behaviorTargets.length > 0 && (
            <div>
              <p className="text-[13px] font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-red-500" /> Behavior Data
              </p>
              <div className="space-y-2">
                {behaviorTargets.map(bt => (
                  <div key={bt.id} className="flex items-center gap-3 bg-gray-50 rounded-lg p-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-700 truncate">{bt.name}</p>
                      <p className="text-[10px] text-gray-400">{measureLabel(bt.measurementType)}</p>
                    </div>
                    <input
                      type="number" min="0" placeholder="Value"
                      value={behaviorValues[bt.id] ?? ""}
                      onChange={e => setBehaviorValues({ ...behaviorValues, [bt.id]: e.target.value })}
                      className="w-20 border border-gray-200 rounded-lg px-2 py-2 md:py-1.5 text-[13px] text-center focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {programTargets.length > 0 && (
            <div>
              <p className="text-[13px] font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-emerald-600" /> Program Data
              </p>
              <div className="space-y-2">
                {programTargets.map(pt => (
                  <div key={pt.id} className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-[13px] font-medium text-gray-700">{pt.name}</p>
                    <p className="text-[10px] text-gray-400 mb-1.5">
                      {pt.programType === "discrete_trial" ? "DTT" : "Task Analysis"} · {PROMPT_LABELS[programValues[pt.id]?.promptLevel ?? "verbal"]?.label ?? "Verbal"}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-gray-400">Correct</label>
                        <input type="number" min="0" placeholder="0"
                          value={programValues[pt.id]?.correct ?? ""}
                          onChange={e => setProgramValues({ ...programValues, [pt.id]: { ...programValues[pt.id], correct: e.target.value } })}
                          className="w-full border border-gray-200 rounded px-2 py-2 md:py-1 text-[12px] text-center focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                      </div>
                      <span className="text-gray-400 text-[12px] mt-3">/</span>
                      <div className="flex-1">
                        <label className="text-[10px] text-gray-400">Total</label>
                        <input type="number" min="1" placeholder="10"
                          value={programValues[pt.id]?.total ?? ""}
                          onChange={e => setProgramValues({ ...programValues, [pt.id]: { ...programValues[pt.id], total: e.target.value } })}
                          className="w-full border border-gray-200 rounded px-2 py-2 md:py-1 text-[12px] text-center focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-gray-400">Prompted</label>
                        <input type="number" min="0" placeholder="0"
                          value={programValues[pt.id]?.prompted ?? ""}
                          onChange={e => setProgramValues({ ...programValues, [pt.id]: { ...programValues[pt.id], prompted: e.target.value } })}
                          className="w-full border border-gray-200 rounded px-2 py-2 md:py-1 text-[12px] text-center focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-[12px] font-medium text-gray-500">Session Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes..."
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose} className="text-[12px] h-9 md:h-8">Cancel</Button>
          <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-9 md:h-8" disabled={saving} onClick={save}>
            <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save Session"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DataSessionsTab({ dataSessions, onLogSession }: { dataSessions: DataSession[]; onLogSession: () => void }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedData, setExpandedData] = useState<any>(null);
  const [expandLoading, setExpandLoading] = useState(false);

  async function toggleExpand(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedData(null);
      return;
    }
    setExpandedId(id);
    setExpandLoading(true);
    try {
      const data = await getDataSession(id);
      setExpandedData(data);
    } catch {
      setExpandedData(null);
    }
    setExpandLoading(false);
  }

  function formatTime(t: string | null) {
    if (!t) return null;
    const [h, m] = t.split(":");
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
  }

  function ExpandedSessionDetail({ detail }: { detail: any }) {
    if (expandLoading) {
      return (
        <div className="px-4 py-6 bg-gray-50/80 border-t border-gray-100">
          <div className="flex items-center gap-2 text-sm text-gray-400"><Clock className="w-4 h-4 animate-spin" /> Loading recorded data...</div>
        </div>
      );
    }
    if (!detail) {
      return (
        <div className="px-4 py-4 bg-gray-50/80 border-t border-gray-100 text-sm text-gray-400">
          Could not load session details.
        </div>
      );
    }
    const behaviors: any[] = detail.behaviorData || [];
    const programs: any[] = detail.programData || [];
    const hasData = behaviors.length > 0 || programs.length > 0;

    return (
      <div className="px-4 py-4 bg-gray-50/80 border-t border-gray-100 space-y-4">
        <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
          {detail.staffName && <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {detail.staffName}</span>}
          {detail.startTime && detail.endTime && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatTime(detail.startTime)} — {formatTime(detail.endTime)}</span>}
          {detail.notes && <span className="flex items-center gap-1 text-gray-600">{detail.notes}</span>}
        </div>

        {!hasData ? (
          <p className="text-sm text-gray-400 italic py-2">No behavior or program data recorded in this session.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {behaviors.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-red-500" /> Behavior Data ({behaviors.length})
                </h4>
                <div className="space-y-1.5">
                  {behaviors.map((b: any) => (
                    <div key={b.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-200">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-gray-700 truncate">{b.targetName || `Target ${b.behaviorTargetId}`}</p>
                        <p className="text-[10px] text-gray-400">{b.measurementType || "—"}{b.hourBlock ? ` · ${b.hourBlock}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {b.measurementType === "interval" ? (
                          <span className="text-[14px] font-bold text-emerald-700">
                            {b.intervalsWith != null && b.intervalCount != null
                              ? `${Math.round((b.intervalsWith / b.intervalCount) * 100)}%`
                              : b.value}
                            <span className="text-[10px] font-normal text-gray-400 ml-1">
                              {b.intervalsWith}/{b.intervalCount} intervals
                            </span>
                          </span>
                        ) : (
                          <span className="text-[14px] font-bold text-emerald-700">{b.value}</span>
                        )}
                        {b.notes && <span className="text-[10px] text-gray-400 max-w-[80px] truncate" title={b.notes}>{b.notes}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {programs.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-emerald-500" /> Program Data ({programs.length})
                </h4>
                <div className="space-y-1.5">
                  {programs.map((p: any) => {
                    const promptInfo = PROMPT_LABELS[p.promptLevelUsed ?? ""] || null;
                    return (
                      <div key={p.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-200">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-gray-700 truncate">{p.targetName || `Program ${p.programTargetId}`}</p>
                          <p className="text-[10px] text-gray-400">
                            {p.programType === "discrete_trial" ? "DTT" : "Task Analysis"}
                            {p.stepNumber != null ? ` · Step ${p.stepNumber}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {p.trialsTotal != null && p.trialsTotal > 0 && (
                            <span className="text-[11px] text-gray-400">
                              {p.trialsCorrect}/{p.trialsTotal}
                            </span>
                          )}
                          <span className={`text-[14px] font-bold ${
                            parseFloat(p.percentCorrect || "0") >= 80 ? "text-emerald-600" :
                            parseFloat(p.percentCorrect || "0") >= 50 ? "text-amber-600" : "text-red-500"
                          }`}>
                            {p.percentCorrect != null ? `${p.percentCorrect}%` : "—"}
                          </span>
                          {promptInfo && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${promptInfo.color}`}>
                              {promptInfo.short}
                            </span>
                          )}
                          {p.notes && <span className="text-[10px] text-gray-400 max-w-[80px] truncate" title={p.notes}>{p.notes}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-600">Recent Data Sessions</h3>
        <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8" onClick={onLogSession}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Log Session
        </Button>
      </div>

      {dataSessions.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">No data sessions recorded yet.</div>
      ) : (
        <>
          <div className="md:hidden space-y-2">
            {dataSessions.map(ds => (
              <Card key={ds.id} className="overflow-hidden">
                <button className="w-full p-3.5 text-left" onClick={() => toggleExpand(ds.id)}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-700">
                        {new Date(ds.sessionDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {ds.startTime && ds.endTime ? `${ds.startTime}–${ds.endTime}` : "—"} · {ds.staffName || "—"}
                      </p>
                    </div>
                    {expandedId === ds.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>
                {expandedId === ds.id && <ExpandedSessionDetail detail={expandedData} />}
              </Card>
            ))}
          </div>

          <Card className="hidden md:block">
            <CardContent className="p-0">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="w-8 px-2"></th>
                    <th className="text-left px-4 py-2.5 text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-2.5 text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Time</th>
                    <th className="text-left px-4 py-2.5 text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Staff</th>
                    <th className="text-left px-4 py-2.5 text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Recorded Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {dataSessions.map(ds => (
                    <Fragment key={ds.id}>
                      <tr
                        className={`hover:bg-gray-50/50 cursor-pointer transition-colors ${expandedId === ds.id ? "bg-gray-50/50" : ""}`}
                        onClick={() => toggleExpand(ds.id)}>
                        <td className="px-2 py-2.5 text-center">
                          {expandedId === ds.id ? <ChevronUp className="w-4 h-4 text-gray-400 mx-auto" /> : <ChevronDown className="w-4 h-4 text-gray-300 mx-auto" />}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-gray-700">
                          {new Date(ds.sessionDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">
                          {ds.startTime && ds.endTime ? `${formatTime(ds.startTime)} — ${formatTime(ds.endTime)}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{ds.staffName || "—"}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-[11px] text-emerald-600 font-medium">Click to view</span>
                        </td>
                      </tr>
                      {expandedId === ds.id && (
                        <tr>
                          <td colSpan={5} className="p-0">
                            <ExpandedSessionDetail detail={expandedData} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
