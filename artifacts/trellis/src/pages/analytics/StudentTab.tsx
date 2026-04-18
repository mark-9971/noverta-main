import { useState, useMemo } from "react";
import {
  useGetAnalyticsStudent,
  useListStudents,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Line, ComposedChart,
} from "recharts";
import {
  TrendingUp, TrendingDown, Target, Clock, Activity, BarChart3, Award,
  CheckCircle, GraduationCap, Layers, User, ChevronRight, Search,
} from "lucide-react";
import { Link } from "wouter";
import { COLORS, CHART_PALETTE, KPICard, SectionSkeleton, CustomTooltip, formatWeek } from "./shared";

export default function StudentTab() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: studentsRaw, isLoading: listLoading } = useListStudents({ limit: 500 } as any);
  const { data: _studentData, isLoading: loading } = useGetAnalyticsStudent(
    selectedId as number,
    { query: { enabled: !!selectedId } as any },
  );
  const studentData = _studentData as any;

  const students: any[] = Array.isArray(studentsRaw) ? studentsRaw : (studentsRaw as any)?.data ?? [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return students.slice(0, 20);
    return students.filter((s: any) =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [students, search]);

  const typeLabels: Record<string, string> = {
    discrete_trial: "DTT", task_analysis: "Task Analysis", natural_environment: "NET", fluency: "Fluency",
  };

  if (!selectedId) {
    return (
      <div className="space-y-4">
        <Card className="border-gray-200/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-600" />
              Select a Student for Deep Analytics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400" />
            </div>
            {listLoading ? (
              <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {filtered.map((s: any) => (
                  <button key={s.id} onClick={() => setSelectedId(s.id)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all text-left group">
                    <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold flex-shrink-0">
                      {s.firstName?.[0]}{s.lastName?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-700 truncate">{s.firstName} {s.lastName}</p>
                      <p className="text-[11px] text-gray-400">Grade {s.grade} · {(s.disabilityCategory || "").replace(/_/g, " ")}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-emerald-600 transition-colors" />
                  </button>
                ))}
                {filtered.length === 0 && <p className="col-span-3 text-center text-sm text-gray-400 py-8">No students found</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) return <SectionSkeleton />;
  if (!studentData) return <ErrorBanner message="Failed to load student analytics" onRetry={() => setSelectedId(selectedId)} />;

  const d = studentData;
  const s = d.student;
  const sm = d.summary;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <button onClick={() => { setSelectedId(null); }}
          className="text-emerald-700 text-sm font-medium hover:text-emerald-800 flex items-center gap-1">
          <ChevronRight className="w-4 h-4 rotate-180" /> All Students
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 text-sm font-bold">
            {s.firstName?.[0]}{s.lastName?.[0]}
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800">{s.firstName} {s.lastName}</h2>
            <p className="text-[11px] text-gray-400">Grade {s.grade} · {(s.disabilityCategory || "").replace(/_/g, " ")}</p>
          </div>
        </div>
        <Link href={`/students/${s.id}`} className="text-xs text-emerald-700 hover:text-emerald-800 font-medium px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 transition-colors">
          View Profile
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Session Completion" value={`${sm.completionRate}%`} icon={CheckCircle} accent="emerald"
          subtitle={`${sm.completedSessions} of ${sm.totalSessions} sessions`} />
        <KPICard title="Minutes Delivered" value={sm.totalMinutes.toLocaleString()} icon={Clock} accent="indigo"
          subtitle="Total service minutes" />
        <KPICard title="Behavior Targets" value={sm.activeBehaviorTargets} icon={Activity} accent="amber"
          subtitle={`${sm.dataSessionCount} data sessions`} />
        <KPICard title="Skill Programs" value={sm.activeProgramTargets} icon={GraduationCap} accent="violet"
          subtitle="Active programs" />
      </div>

      {d.complianceByService.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-gray-200/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-600" />
                Service Compliance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {d.complianceByService.map((svc: any, i: number) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-medium text-gray-700">{svc.service}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-400">{svc.delivered} / {svc.required} min</span>
                        <span className={`text-[12px] font-bold ${svc.compliance >= 90 ? "text-emerald-600" : svc.compliance >= 75 ? "text-amber-600" : "text-red-600"}`}>
                          {svc.compliance}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(svc.compliance, 100)}%`, backgroundColor: svc.compliance >= 90 ? COLORS.emerald : svc.compliance >= 75 ? COLORS.amber : COLORS.red }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-gray-500" />
                Weekly Session Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.sessionWeekly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={formatWeek} />
                    <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
                    <Tooltip content={CustomTooltip} />
                    <Bar dataKey="completed" name="Completed" fill={COLORS.emerald} stackId="a" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="missed" name="Missed" fill={COLORS.red} stackId="a" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {d.behaviorAnalysis.length > 0 && (
        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Activity className="w-4 h-4 text-red-500" />
              Behavior Target Analysis
            </CardTitle>
            <p className="text-[11px] text-gray-400">{d.behaviorAnalysis.length} active target{d.behaviorAnalysis.length !== 1 ? "s" : ""} — weekly trends with variability and progress metrics</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {d.behaviorAnalysis.map((bt: any) => {
                const weeklyData = (bt.weeklyTrends || []).map((w: any) => ({
                  week: formatWeek(w.week),
                  avg: Number(w.avgValue),
                  min: Number(w.minValue),
                  max: Number(w.maxValue),
                  points: w.dataPoints,
                }));
                const goal = Number(bt.goalValue) || 0;
                const baseline = Number(bt.baselineValue) || 0;

                return (
                  <div key={bt.id} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[13px] font-semibold text-gray-700">{bt.name}</p>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${bt.targetDirection === "decrease" ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-600"}`}>
                            {bt.targetDirection === "decrease" ? <TrendingDown className="w-3 h-3 inline mr-0.5" /> : <TrendingUp className="w-3 h-3 inline mr-0.5" />}
                            {bt.targetDirection}
                          </span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${bt.isImproving ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                            {bt.isImproving ? "Improving" : "Needs attention"}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {bt.measurementType} · Baseline: {bt.baselineValue} · Goal: {bt.goalValue} · Latest: {bt.latest} · {bt.totalDataPoints} data pts
                        </p>
                      </div>
                      <div className="flex gap-3 flex-shrink-0">
                        <div className="text-center px-3 py-1.5 bg-gray-50 rounded-lg">
                          <p className="text-[10px] text-gray-400">Change</p>
                          <p className={`text-sm font-bold ${bt.isImproving ? "text-emerald-600" : "text-amber-600"}`}>{bt.changeRate > 0 ? "+" : ""}{bt.changeRate}%</p>
                        </div>
                        <div className="text-center px-3 py-1.5 bg-gray-50 rounded-lg">
                          <p className="text-[10px] text-gray-400">Progress</p>
                          <p className="text-sm font-bold text-emerald-700">{bt.progressToGoal}%</p>
                        </div>
                        <div className="text-center px-3 py-1.5 bg-gray-50 rounded-lg">
                          <p className="text-[10px] text-gray-400">Variability</p>
                          <p className="text-sm font-bold text-gray-600">{bt.variability}</p>
                        </div>
                      </div>
                    </div>

                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(bt.progressToGoal, 100)}%`, backgroundColor: bt.progressToGoal >= 80 ? COLORS.emerald : bt.progressToGoal >= 50 ? COLORS.amber : COLORS.red }} />
                    </div>

                    {weeklyData.length > 1 && (
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={weeklyData}>
                            <defs>
                              <linearGradient id={`bGrad${bt.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={bt.isImproving ? COLORS.emerald : COLORS.amber} stopOpacity={0.15} />
                                <stop offset="95%" stopColor={bt.isImproving ? COLORS.emerald : COLORS.amber} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                            <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
                            <Tooltip content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const p = payload[0].payload;
                              return (
                                <div className="bg-white rounded-lg shadow-lg border p-3 text-xs">
                                  <p className="font-semibold text-gray-700 mb-1">{label}</p>
                                  <p>Average: <span className="font-bold">{p.avg}</span></p>
                                  <p>Range: {p.min} – {p.max}</p>
                                  <p className="text-gray-400">{p.points} data points</p>
                                </div>
                              );
                            }} />
                            {goal > 0 && <Line type="monotone" dataKey={() => goal} name="Goal" stroke={COLORS.emerald} strokeDasharray="6 3" strokeWidth={1.5} dot={false} />}
                            {baseline > 0 && <Line type="monotone" dataKey={() => baseline} name="Baseline" stroke={COLORS.red} strokeDasharray="6 3" strokeWidth={1.5} dot={false} />}
                            <Area type="monotone" dataKey="avg" name="Avg" stroke={bt.isImproving ? COLORS.emerald : COLORS.amber} fill={`url(#bGrad${bt.id})`} strokeWidth={2.5} dot={{ r: 3, fill: "white", strokeWidth: 2 }} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {d.programAnalysis.length > 0 && (
        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-emerald-600" />
              Skill Program Analysis
            </CardTitle>
            <p className="text-[11px] text-gray-400">{d.programAnalysis.length} active program{d.programAnalysis.length !== 1 ? "s" : ""} — accuracy trends, prompt fading, and mastery tracking</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {d.programAnalysis.map((pt: any) => {
                const weeklyData = (pt.weeklyTrends || []).map((w: any) => ({
                  week: formatWeek(w.week),
                  accuracy: Number(w.avgAccuracy),
                  trials: Number(w.totalTrials),
                  correct: Number(w.totalCorrect),
                }));
                const promptData = (pt.promptProgression || []).map((p: any) => ({
                  week: formatWeek(p.week),
                  level: Number(p.avgPromptIndex),
                }));
                const masteryCriterion = pt.masteryCriterionPercent || 80;

                return (
                  <div key={pt.id} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[13px] font-semibold text-gray-700">{pt.name}</p>
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800">
                            {typeLabels[pt.programType] || pt.programType}
                          </span>
                          {pt.domain && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                              {(pt.domain || "").replace(/_/g, " ")}
                            </span>
                          )}
                          {pt.masteryMet && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 flex items-center gap-0.5">
                              <Award className="w-3 h-3" /> Mastered
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Step {pt.currentStep} · Mastery: {masteryCriterion}% · {pt.totalTrials.toLocaleString()} total trials · Overall accuracy: {pt.overallAccuracy}%
                        </p>
                      </div>
                      <div className="flex gap-3 flex-shrink-0">
                        <div className="text-center px-3 py-1.5 bg-gray-50 rounded-lg">
                          <p className="text-[10px] text-gray-400">Latest</p>
                          <p className={`text-sm font-bold ${pt.latestAccuracy >= masteryCriterion ? "text-emerald-600" : "text-emerald-700"}`}>{pt.latestAccuracy}%</p>
                        </div>
                        <div className="text-center px-3 py-1.5 bg-gray-50 rounded-lg">
                          <p className="text-[10px] text-gray-400">Change</p>
                          <p className={`text-sm font-bold ${pt.changeRate >= 0 ? "text-emerald-600" : "text-amber-600"}`}>{pt.changeRate > 0 ? "+" : ""}{pt.changeRate}%</p>
                        </div>
                      </div>
                    </div>

                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min((pt.latestAccuracy / masteryCriterion) * 100, 100)}%`,
                          backgroundColor: pt.latestAccuracy >= masteryCriterion ? COLORS.emerald : pt.latestAccuracy >= masteryCriterion * 0.8 ? COLORS.amber : COLORS.red }} />
                    </div>

                    <div className={`grid grid-cols-1 ${promptData.length > 1 ? "lg:grid-cols-2" : ""} gap-4`}>
                      {weeklyData.length > 1 && (
                        <div className={promptData.length <= 1 ? "col-span-full" : ""}>
                          <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1">Accuracy Over Time</p>
                          <div className="h-[180px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={weeklyData}>
                                <defs>
                                  <linearGradient id={`pGrad${pt.id}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={COLORS.indigo} stopOpacity={0.15} />
                                    <stop offset="95%" stopColor={COLORS.indigo} stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#9ca3af" }} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={(v: number) => `${v}%`} />
                                <Tooltip content={({ active, payload, label }) => {
                                  if (!active || !payload?.length) return null;
                                  const p = payload[0].payload;
                                  return (
                                    <div className="bg-white rounded-lg shadow-lg border p-3 text-xs">
                                      <p className="font-semibold text-gray-700 mb-1">{label}</p>
                                      <p>Accuracy: <span className="font-bold text-emerald-700">{p.accuracy}%</span></p>
                                      <p className="text-gray-400">{p.correct}/{p.trials} trials correct</p>
                                    </div>
                                  );
                                }} />
                                <Line type="monotone" dataKey={() => masteryCriterion} name="Mastery" stroke={COLORS.emerald} strokeDasharray="6 3" strokeWidth={1.5} dot={false} />
                                <Area type="monotone" dataKey="accuracy" name="Accuracy" stroke={COLORS.indigo} fill={`url(#pGrad${pt.id})`} strokeWidth={2.5} dot={{ r: 3, fill: "white", strokeWidth: 2 }} />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}

                      {promptData.length > 1 && (
                        <div>
                          <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1">Prompt Fading Progress</p>
                          <div className="h-[180px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={promptData}>
                                <defs>
                                  <linearGradient id={`prGrad${pt.id}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={COLORS.violet} stopOpacity={0.15} />
                                    <stop offset="95%" stopColor={COLORS.violet} stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#9ca3af" }} />
                                <YAxis domain={[0, 6]} tick={{ fontSize: 10, fill: "#9ca3af" }} ticks={[1,2,3,4,5,6]}
                                  tickFormatter={(v: number) => {
                                    const labels: Record<number, string> = { 1: "Full P", 2: "Partial", 3: "Model", 4: "Gestural", 5: "Verbal", 6: "Indep." };
                                    return labels[v] || "";
                                  }} />
                                <Tooltip content={({ active, payload, label }) => {
                                  if (!active || !payload?.length) return null;
                                  const level = Number(payload[0].value);
                                  const labels: Record<number, string> = { 1: "Full Physical", 2: "Partial Physical", 3: "Model", 4: "Gestural", 5: "Verbal", 6: "Independent" };
                                  const nearest = Math.round(level);
                                  return (
                                    <div className="bg-white rounded-lg shadow-lg border p-3 text-xs">
                                      <p className="font-semibold text-gray-700 mb-1">{label}</p>
                                      <p>Avg Prompt: <span className="font-bold text-emerald-600">{labels[nearest] || level}</span></p>
                                    </div>
                                  );
                                }} />
                                <Area type="monotone" dataKey="level" name="Prompt Level" stroke={COLORS.violet} fill={`url(#prGrad${pt.id})`} strokeWidth={2.5} dot={{ r: 3, fill: "white", strokeWidth: 2 }} />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {d.dayPattern.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-gray-200/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-500" />
                Service Delivery by Day
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.dayPattern}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#6b7280" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
                    <Tooltip content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-white rounded-lg shadow-lg border p-3 text-xs">
                          <p className="font-semibold text-gray-700 mb-1">{label}</p>
                          <p>{Number(payload[0].value).toLocaleString()} minutes</p>
                          <p className="text-gray-400">{payload[0].payload.sessions} sessions</p>
                        </div>
                      );
                    }} />
                    <Bar dataKey="minutes" name="Minutes" radius={[6, 6, 0, 0]} barSize={32}>
                      {d.dayPattern.map((_: any, i: number) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-500" />
                Service Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={d.serviceBreakdown.filter((sb: any) => sb.totalMinutes > 0)} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                      paddingAngle={3} dataKey="totalMinutes" nameKey="serviceTypeName" strokeWidth={0}>
                      {d.serviceBreakdown.map((_: any, i: number) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                    </Pie>
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload;
                      return (
                        <div className="bg-white rounded-lg shadow-lg border p-2.5 text-xs">
                          <span className="font-semibold">{p.serviceTypeName}: {p.totalMinutes.toLocaleString()} min</span>
                          <p className="text-gray-400">{p.completedSessions} completed, {p.missedSessions} missed</p>
                        </div>
                      );
                    }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2 justify-center -mt-2">
                {d.serviceBreakdown.filter((sb: any) => sb.totalMinutes > 0).map((sb: any, i: number) => (
                  <div key={i} className="flex items-center gap-1.5 text-[11px]">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] }} />
                    <span className="text-gray-600">{sb.serviceTypeName}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

