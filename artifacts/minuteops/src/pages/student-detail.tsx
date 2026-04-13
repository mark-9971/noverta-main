import { useParams } from "wouter";
import { useGetStudent, useGetStudentMinuteProgress, useGetStudentSessions, useListServiceRequirements } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressRing, MiniProgressRing } from "@/components/ui/progress-ring";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle, XCircle, TrendingUp, TrendingDown, FileText, Activity, BookOpen, ArrowUpRight, ArrowDownRight, Minus, Shield, AlertTriangle, ChevronDown, ChevronUp, Clock, MapPin, Monitor, Target, Maximize2 } from "lucide-react";
import { InteractiveChart } from "@/components/ui/interactive-chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Area, AreaChart } from "recharts";
import { useState, useEffect, Fragment } from "react";
import { RISK_CONFIG } from "@/lib/constants";

const API = (import.meta as any).env.VITE_API_URL || "/api";

const DIRECTION_COLORS = {
  decrease: { good: "#10b981", bad: "#ef4444", bg: "bg-emerald-50", text: "text-emerald-700" },
  increase: { good: "#059669", bad: "#f97316", bg: "bg-emerald-50", text: "text-emerald-800" },
};

export default function StudentDetail() {
  const params = useParams<{ id: string }>();
  const studentId = Number(params.id);

  const { data: student, isLoading: loadingStudent } = useGetStudent(studentId);
  const { data: progress } = useGetStudentMinuteProgress(studentId);
  const { data: sessions } = useGetStudentSessions(studentId, { limit: 20 } as any);

  const [behaviorTargets, setBehaviorTargets] = useState<any[]>([]);
  const [programTargets, setProgramTargets] = useState<any[]>([]);
  const [behaviorTrends, setBehaviorTrends] = useState<any[]>([]);
  const [programTrends, setProgramTrends] = useState<any[]>([]);
  const [dataSessions, setDataSessions] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [protectiveData, setProtectiveData] = useState<{ incidents: any[]; summary: any } | null>(null);

  const [expandedDataSessionId, setExpandedDataSessionId] = useState<number | null>(null);
  const [expandedDataDetail, setExpandedDataDetail] = useState<any>(null);
  const [expandedDataLoading, setExpandedDataLoading] = useState(false);

  const [expandedServiceSessionId, setExpandedServiceSessionId] = useState<number | null>(null);
  const [expandedServiceDetail, setExpandedServiceDetail] = useState<any>(null);
  const [expandedServiceLoading, setExpandedServiceLoading] = useState(false);

  const [behaviorPhaseLines, setBehaviorPhaseLines] = useState<Record<number, { id: string; date: string; label: string; color?: string }[]>>({});
  const [programPhaseLines, setProgramPhaseLines] = useState<Record<number, { id: string; date: string; label: string; color?: string }[]>>({});
  const [minutesExpanded, setMinutesExpanded] = useState(false);
  const [minutesTrend, setMinutesTrend] = useState<any[]>([]);
  const [minutesPhaseLines, setMinutesPhaseLines] = useState<{ id: string; date: string; label: string; color?: string }[]>([]);

  useEffect(() => {
    if (isNaN(studentId)) return;
    setDataLoading(true);
    Promise.all([
      fetch(`${API}/students/${studentId}/behavior-targets`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/students/${studentId}/program-targets`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/students/${studentId}/behavior-data/trends`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/students/${studentId}/program-data/trends`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/students/${studentId}/data-sessions?limit=10`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/students/${studentId}/protective-measures`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/students/${studentId}/minutes-trend`).then(r => r.ok ? r.json() : []),
    ]).then(([bt, pt, btTrends, ptTrends, ds, pm, mt]) => {
      setBehaviorTargets(bt);
      setProgramTargets(pt);
      setBehaviorTrends(btTrends);
      setProgramTrends(ptTrends);
      setDataSessions(ds);
      setProtectiveData(pm);
      setMinutesTrend(mt);
      setDataLoading(false);
    }).catch(() => setDataLoading(false));
  }, [studentId]);

  const s = student as any;
  const progressList = (progress as any[]) ?? [];
  const sessionList = (sessions as any[]) ?? [];

  const totalDelivered = progressList.reduce((sum: number, p: any) => sum + (p.deliveredMinutes ?? 0), 0);
  const totalRequired = progressList.reduce((sum: number, p: any) => sum + (p.requiredMinutes ?? 0), 0);
  const overallPct = totalRequired > 0 ? Math.round((totalDelivered / totalRequired) * 100) : 0;

  const priorityOrder = ["out_of_compliance", "at_risk", "slightly_behind", "on_track", "completed"];
  let worstRisk = "on_track";
  for (const p of progressList) {
    if (priorityOrder.indexOf(p.riskStatus) < priorityOrder.indexOf(worstRisk)) {
      worstRisk = p.riskStatus;
    }
  }
  const riskCfg = RISK_CONFIG[worstRisk] ?? RISK_CONFIG.on_track;

  const chartData = progressList.map((p: any) => ({
    name: p.serviceTypeName?.split(" ").slice(0, 2).join(" ") ?? "Service",
    delivered: p.deliveredMinutes ?? 0,
    required: p.requiredMinutes ?? 0,
    pct: p.requiredMinutes > 0 ? Math.round((p.deliveredMinutes / p.requiredMinutes) * 100) : 0,
    riskStatus: p.riskStatus,
  }));

  const recentSessions = sessionList.slice(0, 12);
  const completedSessions = sessionList.filter((se: any) => se.status === "completed").length;
  const missedSessions = sessionList.filter((se: any) => se.status === "missed").length;

  function getBehaviorTrendData(targetId: number) {
    return behaviorTrends
      .filter((t: any) => t.behaviorTargetId === targetId)
      .map((t: any) => ({ date: t.sessionDate, value: parseFloat(t.value) || 0, staffId: t.staffId, staffName: t.staffName }))
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
  }

  function getProgramTrendData(targetId: number) {
    return programTrends
      .filter((t: any) => t.programTargetId === targetId)
      .map((t: any) => ({ date: t.sessionDate, value: parseFloat(t.percentCorrect) || 0, staffId: t.staffId, staffName: t.staffName }))
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
  }

  function getTrendDirection(data: { value: number }[]) {
    if (data.length < 4) return "flat";
    const mid = Math.floor(data.length / 2);
    const earlier = data.slice(0, mid);
    const recent = data.slice(mid);
    const earlierAvg = earlier.reduce((s, d) => s + d.value, 0) / earlier.length;
    const recentAvg = recent.reduce((s, d) => s + d.value, 0) / recent.length;
    const diff = recentAvg - earlierAvg;
    if (Math.abs(diff) < 0.5) return "flat";
    return diff > 0 ? "up" : "down";
  }

  if (!loadingStudent && !s) {
    return (
      <div className="p-8">
        <Link href="/students" className="text-emerald-700 text-sm flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Students
        </Link>
        <p className="text-gray-500">Student not found.</p>
      </div>
    );
  }

  function formatDate(d: string) {
    if (!d) return "\u2014";
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function formatShortDate(d: string) {
    if (!d) return "";
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
  }

  function formatTime(t: string | null) {
    if (!t) return null;
    const [h, m] = t.split(":");
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
  }

  async function toggleDataSession(id: number) {
    if (expandedDataSessionId === id) {
      setExpandedDataSessionId(null);
      setExpandedDataDetail(null);
      return;
    }
    setExpandedDataSessionId(id);
    setExpandedDataLoading(true);
    try {
      const res = await fetch(`${API}/data-sessions/${id}`);
      if (res.ok) setExpandedDataDetail(await res.json());
      else setExpandedDataDetail(null);
    } catch { setExpandedDataDetail(null); }
    setExpandedDataLoading(false);
  }

  async function toggleServiceSession(id: number) {
    if (expandedServiceSessionId === id) {
      setExpandedServiceSessionId(null);
      setExpandedServiceDetail(null);
      return;
    }
    setExpandedServiceSessionId(id);
    setExpandedServiceLoading(true);
    try {
      const res = await fetch(`${API}/sessions/${id}`);
      if (res.ok) setExpandedServiceDetail(await res.json());
      else setExpandedServiceDetail(null);
    } catch { setExpandedServiceDetail(null); }
    setExpandedServiceLoading(false);
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-5 md:space-y-8">
      <div>
        <Link href="/students" className="text-emerald-700 text-sm flex items-center gap-1.5 mb-4 hover:text-emerald-800">
          <ArrowLeft className="w-4 h-4" /> All Students
        </Link>

        {s ? (
          <div className="flex items-center gap-3 md:gap-5 flex-wrap">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-700 text-base md:text-lg font-bold flex-shrink-0" aria-hidden="true">
              {s.firstName?.[0]}{s.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl md:text-2xl font-bold text-gray-800 truncate">{s.firstName} {s.lastName}</h1>
              <p className="text-xs md:text-sm text-gray-400 mt-0.5 truncate">
                Grade {s.grade} · {s.disabilityCategory?.replace(/_/g, " ")} · Case Mgr #{s.caseManagerId}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ${riskCfg.bg} ${riskCfg.color}`}>
                {riskCfg.label}
              </span>
              <Link href={`/students/${studentId}/iep`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800 transition-colors">
                <FileText className="w-3.5 h-3.5" /> IEP & Reports
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-5">
            <Skeleton className="w-14 h-14 rounded-2xl" />
            <div>
              <Skeleton className="w-48 h-7" />
              <Skeleton className="w-32 h-4 mt-2" />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card>
          <CardContent className="p-3.5 md:p-5 flex items-center gap-3 md:gap-4">
            <ProgressRing value={overallPct} size={56} strokeWidth={6} color={riskCfg.ringColor} />
            <div>
              <p className="text-2xl font-bold text-gray-800">{overallPct}%</p>
              <p className="text-[11px] text-gray-400">Overall Progress</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center" aria-hidden="true">
              <TrendingUp className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{totalDelivered}<span className="text-sm text-gray-400 font-normal"> / {totalRequired}</span></p>
              <p className="text-[11px] text-gray-400">Minutes Delivered</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center" aria-hidden="true">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{completedSessions}</p>
              <p className="text-[11px] text-gray-400">Completed Sessions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center" aria-hidden="true">
              <XCircle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{missedSessions}</p>
              <p className="text-[11px] text-gray-400">Missed Sessions</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-7">
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-600">Minutes by Service</CardTitle>
              <button
                onClick={() => setMinutesExpanded(!minutesExpanded)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                title={minutesExpanded ? "Collapse" : "Expand chart"}
              >
                {minutesExpanded ? <ChevronUp className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={minutesExpanded ? Math.max(300, chartData.length * 64) : Math.max(200, chartData.length * 48)}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}
                    formatter={(val: any, name: string) => [val + " min", name === "delivered" ? "Delivered" : "Required"]}
                  />
                  <Bar dataKey="required" fill="#e5e7eb" radius={[0, 4, 4, 0]} barSize={minutesExpanded ? 24 : 18} name="Required" />
                  <Bar dataKey="delivered" radius={[0, 4, 4, 0]} barSize={minutesExpanded ? 24 : 18} name="Delivered">
                    {chartData.map((entry: any, idx: number) => (
                      <Cell key={idx} fill={RISK_CONFIG[entry.riskStatus]?.ringColor ?? "#059669"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="w-full h-48" />
            )}
            {minutesExpanded && chartData.length > 0 && (
              <div className="mt-4 space-y-2 border-t border-gray-100 pt-3">
                {chartData.map((entry: any, idx: number) => {
                  const rCfg = RISK_CONFIG[entry.riskStatus] ?? RISK_CONFIG.on_track;
                  return (
                    <div key={idx} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded-lg">
                      <span className="font-medium text-gray-700">{entry.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-500">{entry.delivered} / {entry.required} min</span>
                        <span className="font-bold text-gray-700">{entry.pct}%</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${rCfg.bg} ${rCfg.color}`}>{rCfg.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {minutesExpanded && minutesTrend.length > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-500 mb-1">Minutes Delivered Over Time</p>
                <InteractiveChart
                  data={minutesTrend}
                  color="#059669"
                  gradientId="grad-minutes-trend"
                  title="Session Minutes"
                  yLabel="Minutes"
                  valueFormatter={(v) => `${v} min`}
                  phaseLines={minutesPhaseLines}
                  onPhaseLinesChange={setMinutesPhaseLines}
                  initialExpanded
                  hideCollapse
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-gray-600">Service Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {progressList.length > 0 ? progressList.map((p: any, idx: number) => {
              const pct = p.requiredMinutes > 0 ? Math.round((p.deliveredMinutes / p.requiredMinutes) * 100) : 0;
              const rCfg = RISK_CONFIG[p.riskStatus] ?? RISK_CONFIG.on_track;
              return (
                <div key={p.serviceRequirementId ?? idx} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50/50">
                  <MiniProgressRing value={pct} size={36} strokeWidth={3.5} color={rCfg.ringColor} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-700 truncate">{p.serviceTypeName}</p>
                    <p className="text-[11px] text-gray-400">
                      {p.deliveredMinutes} / {p.requiredMinutes} min · {p.minutesPerWeek} min/wk
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-700">{pct}%</p>
                    <p className={`text-[10px] font-medium ${rCfg.color}`}>{rCfg.label}</p>
                  </div>
                </div>
              );
            }) : (
              <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="w-full h-14" />)}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {(behaviorTargets.length > 0 || dataLoading) && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                <Activity className="w-4 h-4 text-red-500" />
                Behavior Data
              </CardTitle>
              <span className="text-xs text-gray-400">{behaviorTargets.length} active target{behaviorTargets.length !== 1 ? "s" : ""}</span>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {dataLoading ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="w-full h-24" />)}</div>
            ) : (
              <div className="space-y-4">
                {behaviorTargets.map((bt: any) => {
                  const trendData = getBehaviorTrendData(bt.id);
                  const latest = trendData[trendData.length - 1]?.value;
                  const baseline = parseFloat(bt.baselineValue) || 0;
                  const goal = parseFloat(bt.goalValue) || 0;
                  const direction = getTrendDirection(trendData);
                  const dirColors = DIRECTION_COLORS[bt.targetDirection as keyof typeof DIRECTION_COLORS] || DIRECTION_COLORS.decrease;
                  const isGoodTrend = (bt.targetDirection === "decrease" && direction === "down") ||
                                       (bt.targetDirection === "increase" && direction === "up");
                  const trendColor = direction === "flat" ? "#9ca3af" : isGoodTrend ? dirColors.good : dirColors.bad;

                  const progressPct = bt.targetDirection === "decrease"
                    ? baseline > goal ? Math.round(((baseline - (latest ?? baseline)) / (baseline - goal)) * 100) : 0
                    : goal > baseline ? Math.round((((latest ?? baseline) - baseline) / (goal - baseline)) * 100) : 0;
                  const clampedPct = Math.max(0, Math.min(100, progressPct));

                  return (
                    <div key={bt.id} className="border border-gray-100 rounded-xl p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-[13px] font-semibold text-gray-700">{bt.name}</p>
                            <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                              bt.targetDirection === "decrease" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                            }`}>
                              {bt.targetDirection === "decrease" ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                              {bt.targetDirection}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {bt.measurementType} · Baseline: {bt.baselineValue} · Goal: {bt.goalValue}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <div className="flex items-center gap-1">
                            {direction === "up" ? <ArrowUpRight className="w-3.5 h-3.5" style={{ color: trendColor }} /> :
                             direction === "down" ? <ArrowDownRight className="w-3.5 h-3.5" style={{ color: trendColor }} /> :
                             <Minus className="w-3.5 h-3.5 text-gray-400" />}
                            <span className="text-lg font-bold text-gray-800">{latest != null ? latest : "\u2014"}</span>
                          </div>
                          <p className="text-[10px] text-gray-400">latest</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${clampedPct}%`, backgroundColor: clampedPct >= 80 ? "#10b981" : clampedPct >= 50 ? "#f59e0b" : "#ef4444" }}
                            />
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1">{clampedPct}% toward goal</p>
                        </div>
                        {trendData.length > 1 && (
                          <InteractiveChart
                            data={trendData}
                            color={trendColor}
                            gradientId={`grad-beh-${bt.id}`}
                            title={bt.name}
                            yLabel={bt.measurementType}
                            baselineLine={baseline}
                            goalLine={goal}
                            targetDirection={bt.targetDirection}
                            phaseLines={behaviorPhaseLines[bt.id] || []}
                            onPhaseLinesChange={(lines) => setBehaviorPhaseLines(prev => ({ ...prev, [bt.id]: lines }))}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(programTargets.length > 0 || dataLoading) && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-600" />
                Academic Programs
              </CardTitle>
              <span className="text-xs text-gray-400">{programTargets.length} active program{programTargets.length !== 1 ? "s" : ""}</span>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {dataLoading ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="w-full h-24" />)}</div>
            ) : (
              <div className="space-y-4">
                {programTargets.map((pt: any) => {
                  const trendData = getProgramTrendData(pt.id);
                  const latest = trendData[trendData.length - 1]?.value;
                  const direction = getTrendDirection(trendData);
                  const masteryPct = pt.masteryCriterionPercent || 80;
                  const isGoodTrend = direction === "up";
                  const trendColor = direction === "flat" ? "#9ca3af" : isGoodTrend ? "#059669" : "#f97316";
                  const atMastery = latest != null && latest >= masteryPct;

                  return (
                    <div key={pt.id} className="border border-gray-100 rounded-xl p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[13px] font-semibold text-gray-700">{pt.name}</p>
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                              {pt.domain || pt.programType?.replace(/_/g, " ")}
                            </span>
                            {pt.currentPromptLevel && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                {pt.currentPromptLevel}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {pt.targetCriterion || `${masteryPct}% mastery`}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <div className="flex items-center gap-1">
                            {direction === "up" ? <ArrowUpRight className="w-3.5 h-3.5" style={{ color: trendColor }} /> :
                             direction === "down" ? <ArrowDownRight className="w-3.5 h-3.5" style={{ color: trendColor }} /> :
                             <Minus className="w-3.5 h-3.5 text-gray-400" />}
                            <span className="text-lg font-bold text-gray-800">{latest != null ? `${Math.round(latest)}%` : "\u2014"}</span>
                          </div>
                          <p className="text-[10px] text-gray-400">latest accuracy</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden relative">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${Math.min(100, latest ?? 0)}%`, backgroundColor: atMastery ? "#10b981" : (latest ?? 0) >= 60 ? "#059669" : "#f97316" }}
                            />
                            <div
                              className="absolute top-0 h-full w-0.5 bg-gray-400/60"
                              style={{ left: `${masteryPct}%` }}
                              title={`Mastery: ${masteryPct}%`}
                            />
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-[10px] text-gray-400">{atMastery ? "At mastery criterion" : `${masteryPct}% mastery criterion`}</p>
                            {atMastery && <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-0.5"><CheckCircle className="w-3 h-3" /> Mastered</span>}
                          </div>
                        </div>
                        {trendData.length > 1 && (
                          <InteractiveChart
                            data={trendData}
                            color={trendColor}
                            gradientId={`grad-prog-${pt.id}`}
                            title={pt.name}
                            yLabel="Accuracy"
                            masteryLine={masteryPct}
                            targetDirection="increase"
                            valueFormatter={(v) => `${Math.round(v)}%`}
                            phaseLines={programPhaseLines[pt.id] || []}
                            onPhaseLinesChange={(lines) => setProgramPhaseLines(prev => ({ ...prev, [pt.id]: lines }))}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(dataSessions.length > 0 || dataLoading) && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-gray-600">Recent Data Sessions</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {dataLoading ? (
              <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="w-full h-12" />)}</div>
            ) : dataSessions.length > 0 ? (
              <div className="space-y-1">
                {dataSessions.map((ds: any) => {
                  const isExpanded = expandedDataSessionId === ds.id;
                  const detail = isExpanded ? expandedDataDetail : null;
                  return (
                    <Fragment key={ds.id}>
                      <button
                        onClick={() => toggleDataSession(ds.id)}
                        className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-50/50 hover:bg-gray-100/50 transition-colors text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-gray-700">{formatDate(ds.sessionDate)}</p>
                          <p className="text-[11px] text-gray-400">
                            {ds.staffName || "Staff"} · {ds.startTime && ds.endTime ? `${formatTime(ds.startTime)}\u2013${formatTime(ds.endTime)}` : "No time recorded"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            <Activity className="w-3 h-3" /> Data
                          </span>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="ml-3 mr-3 mb-2 p-4 bg-white border border-gray-200 rounded-lg space-y-4">
                          {expandedDataLoading ? (
                            <div className="flex items-center gap-2 text-sm text-gray-400"><Clock className="w-4 h-4 animate-spin" /> Loading details...</div>
                          ) : detail ? (
                            <>
                              {detail.notes && (
                                <div>
                                  <h5 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Session Notes</h5>
                                  <p className="text-[13px] text-gray-700 bg-gray-50 rounded-lg p-3 border border-gray-100 leading-relaxed">{detail.notes}</p>
                                </div>
                              )}
                              {detail.behaviorData?.length > 0 && (
                                <div>
                                  <h5 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <Activity className="w-3.5 h-3.5 text-red-500" /> Behavior Data ({detail.behaviorData.length})
                                  </h5>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {detail.behaviorData.map((bd: any) => (
                                      <div key={bd.id} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[12px] font-medium text-gray-700">{bd.targetName || `Target #${bd.behaviorTargetId}`}</span>
                                          <span className="text-[13px] font-bold text-gray-800">{bd.value}</span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                                          <span>{bd.measurementType}</span>
                                          {bd.intervalCount != null && <span>· {bd.intervalsWith}/{bd.intervalCount} intervals</span>}
                                          {bd.hourBlock && <span>· Hour: {bd.hourBlock}</span>}
                                        </div>
                                        {bd.notes && <p className="text-[11px] text-gray-500 mt-1 italic">{bd.notes}</p>}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {detail.programData?.length > 0 && (
                                <div>
                                  <h5 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <BookOpen className="w-3.5 h-3.5 text-emerald-600" /> Program Data ({detail.programData.length})
                                  </h5>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {detail.programData.map((pd: any) => (
                                      <div key={pd.id} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[12px] font-medium text-gray-700">{pd.targetName || `Program #${pd.programTargetId}`}</span>
                                          <span className="text-[13px] font-bold text-gray-800">
                                            {pd.percentCorrect != null ? `${Math.round(parseFloat(pd.percentCorrect))}%` : "\u2014"}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                                          {pd.trialsCorrect != null && pd.trialsTotal != null && <span>{pd.trialsCorrect}/{pd.trialsTotal} trials</span>}
                                          {pd.promptLevelUsed && <span>· {pd.promptLevelUsed.replace(/_/g, " ")}</span>}
                                          {pd.stepNumber != null && <span>· Step {pd.stepNumber}</span>}
                                          {pd.programType && <span>· {pd.programType.replace(/_/g, " ")}</span>}
                                        </div>
                                        {pd.notes && <p className="text-[11px] text-gray-500 mt-1 italic">{pd.notes}</p>}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {(!detail.behaviorData?.length && !detail.programData?.length && !detail.notes) && (
                                <p className="text-[12px] text-gray-400 italic">No detailed data recorded for this session.</p>
                              )}
                            </>
                          ) : (
                            <p className="text-[12px] text-gray-400 italic">Failed to load session details.</p>
                          )}
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-gray-400">No data sessions recorded yet.</div>
            )}
          </CardContent>
        </Card>
      )}

      {protectiveData && protectiveData.incidents.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                <Shield className="w-4 h-4 text-red-500" />
                Protective Measures
              </CardTitle>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  {protectiveData.summary.totalIncidents} incident{protectiveData.summary.totalIncidents !== 1 ? "s" : ""}
                  {protectiveData.summary.thisMonth > 0 && (
                    <span className="text-red-600 font-semibold ml-1">({protectiveData.summary.thisMonth} this month)</span>
                  )}
                </span>
                <Link href="/protective-measures" className="text-xs text-emerald-700 hover:text-emerald-800 font-medium">View All</Link>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {protectiveData.summary.pendingReview > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-xs text-amber-800 font-medium">{protectiveData.summary.pendingReview} incident{protectiveData.summary.pendingReview !== 1 ? "s" : ""} pending admin review</p>
              </div>
            )}
            <div className="space-y-2">
              {protectiveData.incidents.slice(0, 5).map((inc: any) => (
                <div key={inc.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50/50 hover:bg-gray-100/50 transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${inc.incidentType === "physical_restraint" ? "bg-red-50" : inc.incidentType === "seclusion" ? "bg-amber-50" : "bg-gray-100"}`}>
                    <Shield className={`w-4 h-4 ${inc.incidentType === "physical_restraint" ? "text-red-600" : inc.incidentType === "seclusion" ? "text-amber-600" : "text-gray-600"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${inc.incidentType === "physical_restraint" ? "bg-red-50 text-red-700" : inc.incidentType === "seclusion" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-700"}`}>
                        {inc.incidentType === "physical_restraint" ? "Restraint" : inc.incidentType === "seclusion" ? "Seclusion" : "Time-Out"}
                      </span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${inc.status === "pending_review" ? "bg-amber-100 text-amber-700" : inc.status === "reviewed" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                        {inc.status === "pending_review" ? "Pending" : inc.status === "reviewed" ? "Reviewed" : "Closed"}
                      </span>
                      {(inc.studentInjury || inc.staffInjury) && <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="Injury reported" />}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5 truncate">{inc.behaviorDescription}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-medium text-gray-700">{formatDate(inc.incidentDate)}</p>
                    <p className="text-[10px] text-gray-400">{inc.durationMinutes ? `${inc.durationMinutes} min` : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold text-gray-600">Recent Service Sessions</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {recentSessions.length > 0 ? (
            <div className="space-y-1">
              {recentSessions.map((se: any) => {
                const isExpanded = expandedServiceSessionId === se.id;
                const detail = isExpanded ? expandedServiceDetail : null;
                return (
                  <Fragment key={se.id}>
                    <button
                      onClick={() => toggleServiceSession(se.id)}
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-50/50 hover:bg-gray-100/50 transition-colors text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-gray-700 truncate">{se.serviceTypeName ?? "\u2014"}</p>
                        <p className="text-[11px] text-gray-400">{formatDate(se.sessionDate)} · {se.durationMinutes ?? "\u2014"} min · {se.staffName ?? "\u2014"}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          se.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                          se.status === "missed" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
                        }`}>
                          {se.status === "completed" ? <CheckCircle className="w-3 h-3" /> : se.status === "missed" ? <XCircle className="w-3 h-3" /> : null}
                          {se.isMakeup ? "Makeup" : se.status}
                        </span>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="ml-3 mr-3 mb-2 p-4 bg-white border border-gray-200 rounded-lg space-y-4">
                        {expandedServiceLoading ? (
                          <div className="flex items-center gap-2 text-sm text-gray-400"><Clock className="w-4 h-4 animate-spin" /> Loading details...</div>
                        ) : detail ? (
                          <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <h5 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Session Info</h5>
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="text-[11px] text-gray-400 min-w-[60px]">Duration</span>
                                    <span className="text-[13px] text-gray-700">{detail.durationMinutes} min</span>
                                  </div>
                                  {(detail.startTime || detail.endTime) && (
                                    <div className="flex items-center gap-2">
                                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                                      <span className="text-[11px] text-gray-400 min-w-[60px]">Time</span>
                                      <span className="text-[13px] text-gray-700">{formatTime(detail.startTime) || "\u2014"} — {formatTime(detail.endTime) || "\u2014"}</span>
                                    </div>
                                  )}
                                  {detail.location && (
                                    <div className="flex items-center gap-2">
                                      <MapPin className="w-3.5 h-3.5 text-gray-400" />
                                      <span className="text-[11px] text-gray-400 min-w-[60px]">Location</span>
                                      <span className="text-[13px] text-gray-700">{detail.location}</span>
                                    </div>
                                  )}
                                  {detail.deliveryMode && (
                                    <div className="flex items-center gap-2">
                                      <Monitor className="w-3.5 h-3.5 text-gray-400" />
                                      <span className="text-[11px] text-gray-400 min-w-[60px]">Mode</span>
                                      <span className="text-[13px] text-gray-700">{detail.deliveryMode === "in_person" ? "In Person" : detail.deliveryMode === "remote" ? "Remote/Telehealth" : detail.deliveryMode}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="md:col-span-2 space-y-2">
                                <h5 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Session Notes</h5>
                                {detail.notes ? (
                                  <p className="text-[13px] text-gray-700 bg-gray-50 rounded-lg p-3 border border-gray-100 leading-relaxed">{detail.notes}</p>
                                ) : (
                                  <p className="text-[11px] text-gray-400 italic">No session notes recorded.</p>
                                )}
                                {detail.missedReasonLabel && (
                                  <div className="flex items-center gap-1.5 text-[12px] text-red-600">
                                    <XCircle className="w-3.5 h-3.5" /> Missed: {detail.missedReasonLabel}
                                  </div>
                                )}
                              </div>
                            </div>
                            {detail.linkedGoals?.length > 0 && (
                              <div className="space-y-2">
                                <h5 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                                  <Target className="w-3.5 h-3.5 text-emerald-600" /> IEP Goals Addressed ({detail.linkedGoals.length})
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {detail.linkedGoals.map((g: any) => (
                                    <div key={g.id} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                                      <div className="flex items-start gap-2">
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 flex-shrink-0 mt-0.5">{g.goalArea}</span>
                                        <p className="text-[12px] text-gray-700 leading-snug line-clamp-2">{g.annualGoal}</p>
                                      </div>
                                      {g.targetCriterion && <p className="text-[10px] text-gray-400 mt-1 ml-0.5">Target: {g.targetCriterion}</p>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-[12px] text-gray-400 italic">Failed to load session details.</p>
                        )}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-gray-400">No sessions recorded yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
