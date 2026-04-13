import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, RadarChart, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Radar, LineChart, Line,
  ComposedChart, RadialBarChart, RadialBar,
} from "recharts";
import {
  TrendingUp, TrendingDown, Users, Target, Brain, Clock, Activity,
  BarChart3, Zap, Award, AlertTriangle, CheckCircle, ArrowUpRight,
  ArrowDownRight, Minus, GraduationCap, Layers, Timer, PieChart as PieIcon,
} from "lucide-react";

const API = "/api";

function useAnalytics(endpoint: string) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refetch = () => {
    setLoading(true);
    setError(false);
    fetch(`${API}/analytics/${endpoint}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => { refetch(); }, [endpoint]);
  return { data, loading, error, refetch };
}

const COLORS = {
  indigo: "#6366f1",
  emerald: "#10b981",
  amber: "#f59e0b",
  orange: "#f97316",
  red: "#ef4444",
  sky: "#0ea5e9",
  violet: "#8b5cf6",
  pink: "#ec4899",
  teal: "#14b8a6",
  lime: "#84cc16",
  cyan: "#06b6d4",
  rose: "#f43f5e",
};

const RISK_COLORS = [COLORS.emerald, COLORS.amber, COLORS.orange, COLORS.red];
const RISK_LABELS = ["On Track", "Slightly Behind", "At Risk", "Out of Compliance"];
const CHART_PALETTE = [COLORS.indigo, COLORS.emerald, COLORS.amber, COLORS.sky, COLORS.violet, COLORS.pink, COLORS.teal, COLORS.orange];

function KPICard({ title, value, icon: Icon, accent, subtitle, trend }: {
  title: string; value: string | number; icon: any; accent: string; subtitle?: string; trend?: { value: number; positive: boolean };
}) {
  const accents: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    sky: "bg-sky-50 text-sky-600",
    violet: "bg-violet-50 text-violet-600",
  };
  return (
    <Card className="hover:shadow-md transition-all duration-200 border-slate-200/80">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${accents[accent] || accents.indigo}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-slate-500 font-medium uppercase tracking-wider">{title}</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-800">{value}</span>
              {trend && (
                <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${trend.positive ? "text-emerald-600" : "text-red-500"}`}>
                  {trend.positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(trend.value)}%
                </span>
              )}
            </div>
            {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-lg shadow-lg border border-slate-200 p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-1.5">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-semibold text-slate-700">{typeof p.value === "number" ? p.value.toLocaleString() : p.value}</span>
        </div>
      ))}
    </div>
  );
}

function formatWeek(w: string) {
  const d = new Date(w + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function OverviewTab() {
  const { data, loading, error, refetch } = useAnalytics("overview");
  const { data: heatmap, loading: heatLoading } = useAnalytics("delivery-heatmap");

  if (loading) return <SectionSkeleton />;
  if (error) return <ErrorBanner message="Failed to load overview" onRetry={refetch} />;
  if (!data) return null;

  const rd = data.riskDistribution;
  const riskData = [
    { name: "On Track", value: rd.onTrack, color: RISK_COLORS[0] },
    { name: "Slightly Behind", value: rd.slightlyBehind, color: RISK_COLORS[1] },
    { name: "At Risk", value: rd.atRisk, color: RISK_COLORS[2] },
    { name: "Out of Compliance", value: rd.outOfCompliance, color: RISK_COLORS[3] },
  ].filter(d => d.value > 0);

  const totalStudents = rd.onTrack + rd.slightlyBehind + rd.atRisk + rd.outOfCompliance;
  const complianceAngle = (data.avgCompliance / 100) * 360;
  const gaugeData = [
    { name: "Compliance", value: data.avgCompliance, fill: data.avgCompliance >= 90 ? COLORS.emerald : data.avgCompliance >= 75 ? COLORS.amber : COLORS.red },
    { name: "Remaining", value: 100 - data.avgCompliance, fill: "#f1f5f9" },
  ];

  const heatmapGrid = heatmap?.heatmap || [];
  const maxSessions = Math.max(...heatmapGrid.map((h: any) => h.sessions), 1);
  const hours = Array.from({ length: 12 }, (_, i) => i + 7);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Active Students" value={data.activeStudents} icon={Users} accent="indigo" subtitle="Currently enrolled" />
        <KPICard title="Avg Compliance" value={`${data.avgCompliance}%`} icon={CheckCircle} accent="emerald"
          subtitle={`${data.totalDeliveredMinutes.toLocaleString()} / ${data.totalRequiredMinutes.toLocaleString()} min`} />
        <KPICard title="Session Completion" value={`${data.completionRate}%`} icon={Activity} accent="sky"
          subtitle={`${data.completedSessions.toLocaleString()} of ${data.totalSessionLogs.toLocaleString()}`} />
        <KPICard title="Data Collection" value={data.totalDataSessions.toLocaleString()} icon={Brain} accent="violet"
          subtitle={`${data.activeBehaviorTargets} behavior, ${data.activeProgramTargets} program targets`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-slate-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-indigo-500" />
              Student Risk Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={riskData} cx="50%" cy="50%" innerRadius={60} outerRadius={95}
                    paddingAngle={3} dataKey="value" strokeWidth={0}>
                    {riskData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white rounded-lg shadow-lg border p-2.5 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                          <span className="font-semibold">{d.name}: {d.value}</span>
                          <span className="text-slate-400">({Math.round(d.value / totalStudents * 100)}%)</span>
                        </div>
                      </div>
                    );
                  }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3 justify-center -mt-4">
              {riskData.map((d, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[11px]">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-slate-600">{d.name}</span>
                  <span className="font-bold text-slate-800">{d.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-500" />
              Overall Compliance Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center">
              <div className="relative h-[200px] w-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" startAngle={90} endAngle={-270} data={[gaugeData[0]]}>
                    <RadialBar background={{ fill: "#f1f5f9" }} dataKey="value" cornerRadius={10} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-bold text-slate-800">{data.avgCompliance}%</span>
                  <span className="text-[11px] text-slate-400 mt-1">compliance rate</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4 w-full">
                <div className="text-center p-3 bg-emerald-50 rounded-lg">
                  <p className="text-lg font-bold text-emerald-700">{data.completedSessions.toLocaleString()}</p>
                  <p className="text-[10px] text-emerald-600 font-medium">Completed</p>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <p className="text-lg font-bold text-red-700">{data.missedSessions.toLocaleString()}</p>
                  <p className="text-[10px] text-red-600 font-medium">Missed</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-500" />
              Service Delivery Heatmap
            </CardTitle>
            <p className="text-[11px] text-slate-400">Sessions by day and hour</p>
          </CardHeader>
          <CardContent>
            {heatLoading ? <Skeleton className="h-[260px]" /> : (
              <div className="space-y-1.5">
                <div className="flex gap-1 items-center">
                  <div className="w-10" />
                  {hours.map(h => (
                    <div key={h} className="flex-1 text-center text-[9px] text-slate-400 font-medium">
                      {h > 12 ? `${h-12}p` : h === 12 ? "12p" : `${h}a`}
                    </div>
                  ))}
                </div>
                {days.map(day => (
                  <div key={day} className="flex gap-1 items-center">
                    <div className="w-10 text-[10px] text-slate-500 font-medium">{day}</div>
                    {hours.map(h => {
                      const cell = heatmapGrid.find((c: any) => c.day === day && c.hour === h);
                      const intensity = cell ? Math.min(cell.sessions / maxSessions, 1) : 0;
                      return (
                        <div key={h} className="flex-1 aspect-square rounded-sm cursor-default group relative"
                          style={{ backgroundColor: intensity === 0 ? "#f8fafc" : `rgba(99, 102, 241, ${0.15 + intensity * 0.75})` }}
                          title={cell ? `${cell.sessions} sessions, ${cell.minutes} min` : "No sessions"}>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div className="flex items-center gap-2 mt-3 justify-end">
                  <span className="text-[9px] text-slate-400">Less</span>
                  {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v, i) => (
                    <div key={i} className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: v === 0 ? "#f8fafc" : `rgba(99, 102, 241, ${0.15 + v * 0.75})` }} />
                  ))}
                  <span className="text-[9px] text-slate-400">More</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BehaviorTab() {
  const { data, loading, error, refetch } = useAnalytics("behavior-summary");

  if (loading) return <SectionSkeleton />;
  if (error) return <ErrorBanner message="Failed to load behavior data" onRetry={refetch} />;
  if (!data) return null;

  const directionLabel: Record<string, string> = { decrease: "Decreasing", increase: "Increasing" };
  const measureLabel: Record<string, string> = {
    frequency: "Frequency", duration: "Duration", interval: "Interval", rate: "Rate", percentage: "Percentage",
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Active Targets" value={data.totalActiveTargets} icon={Target} accent="indigo" />
        <KPICard title="Improving" value={data.topImproving?.length || 0} icon={TrendingDown} accent="emerald" subtitle="Targets moving toward goal" />
        <KPICard title="Needs Attention" value={data.topWorsening?.length || 0} icon={AlertTriangle} accent="amber" subtitle="Targets moving away from goal" />
        <KPICard title="Data Points/Week" value={data.weeklyTrends?.length > 0 ? Math.round(data.weeklyTrends.reduce((s: number, w: any) => s + w.totalPoints, 0) / data.weeklyTrends.length) : 0}
          icon={BarChart3} accent="sky" subtitle="Average weekly collection" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-slate-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-500" />
              School-Wide Behavior Trends
            </CardTitle>
            <p className="text-[11px] text-slate-400">Weekly average across all behavior targets</p>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.weeklyTrends}>
                  <defs>
                    <linearGradient id="behaviorGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.indigo} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={COLORS.indigo} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={formatWeek} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <Tooltip content={CustomTooltip} />
                  <Area type="monotone" dataKey="avgValue" name="Avg Value" stroke={COLORS.indigo} fill="url(#behaviorGrad)" strokeWidth={2.5} dot={false} />
                  <Bar dataKey="totalPoints" name="Data Points" fill={COLORS.sky} fillOpacity={0.4} radius={[3, 3, 0, 0]} barSize={16} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Layers className="w-4 h-4 text-violet-500" />
              Measurement Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.measurementDistribution} cx="50%" cy="50%" outerRadius={90} dataKey="count" nameKey="type"
                    paddingAngle={3} strokeWidth={0}>
                    {data.measurementDistribution.map((_: any, i: number) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                  </Pie>
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white rounded-lg shadow-lg border p-2.5 text-xs">
                        <span className="font-semibold capitalize">{measureLabel[d.type] || d.type}: {d.count}</span>
                      </div>
                    );
                  }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-2 justify-center -mt-2">
              {data.measurementDistribution.map((d: any, i: number) => (
                <div key={i} className="flex items-center gap-1.5 text-[11px]">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] }} />
                  <span className="text-slate-600 capitalize">{measureLabel[d.type] || d.type}</span>
                  <span className="font-bold text-slate-800">{d.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-slate-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-emerald-500" />
              Top Improving Targets
            </CardTitle>
            <p className="text-[11px] text-slate-400">Targets making the most progress toward their goals</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {(data.topImproving || []).slice(0, 6).map((t: any, i: number) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-slate-700 truncate">{t.targetName}</p>
                    <p className="text-[11px] text-slate-400">{t.studentName} · {measureLabel[t.measurementType] || t.measurementType}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="flex items-center gap-1 text-emerald-600">
                      <TrendingDown className="w-3.5 h-3.5" />
                      <span className="text-[13px] font-semibold">{Math.abs(t.change)}</span>
                    </div>
                    {t.progressToGoal != null && (
                      <p className="text-[10px] text-slate-400">{t.progressToGoal}% to goal</p>
                    )}
                  </div>
                </div>
              ))}
              {(!data.topImproving || data.topImproving.length === 0) && (
                <div className="px-5 py-8 text-center text-sm text-slate-400">No improving targets found</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-500" />
              Targets Needing Attention
            </CardTitle>
            <p className="text-[11px] text-slate-400">Targets moving away from their goals</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {(data.topWorsening || []).slice(0, 6).map((t: any, i: number) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-slate-700 truncate">{t.targetName}</p>
                    <p className="text-[11px] text-slate-400">{t.studentName} · {measureLabel[t.measurementType] || t.measurementType}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="flex items-center gap-1 text-amber-600">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span className="text-[13px] font-semibold">+{Math.abs(t.change)}</span>
                    </div>
                    <p className="text-[10px] text-slate-400">{t.dataPoints} data pts</p>
                  </div>
                </div>
              ))}
              {(!data.topWorsening || data.topWorsening.length === 0) && (
                <div className="px-5 py-8 text-center text-sm text-slate-400">All targets are on track</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AcademicTab() {
  const { data, loading, error, refetch } = useAnalytics("program-summary");

  if (loading) return <SectionSkeleton />;
  if (error) return <ErrorBanner message="Failed to load academic data" onRetry={refetch} />;
  if (!data) return null;

  const funnel = data.masteryFunnel;
  const funnelData = [
    { name: "Mastered", value: funnel.mastered, color: COLORS.emerald, icon: Award },
    { name: "Near Mastery", value: funnel.nearMastery, color: COLORS.amber, icon: Zap },
    { name: "Developing", value: funnel.developing, color: COLORS.sky, icon: GraduationCap },
  ].filter(d => d.value > 0);

  const typeLabels: Record<string, string> = {
    discrete_trial: "DTT", task_analysis: "Task Analysis", natural_environment: "NET", fluency: "Fluency",
  };

  const promptOrder = ["independent", "verbal", "gestural", "model", "partial_physical", "full_physical"];
  const promptLabels: Record<string, string> = {
    independent: "Independent", verbal: "Verbal", gestural: "Gestural", model: "Model",
    partial_physical: "Partial Physical", full_physical: "Full Physical",
  };
  const sortedPrompts = (data.promptDistribution || []).sort(
    (a: any, b: any) => promptOrder.indexOf(a.level) - promptOrder.indexOf(b.level)
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Programs" value={funnel.total} icon={GraduationCap} accent="indigo" subtitle="Active skill programs" />
        <KPICard title="Mastered" value={funnel.mastered} icon={Award} accent="emerald"
          subtitle={funnel.total > 0 ? `${Math.round(funnel.mastered / funnel.total * 100)}% of programs` : "—"} />
        <KPICard title="Near Mastery" value={funnel.nearMastery} icon={Zap} accent="amber"
          subtitle="Within 15% of criterion" />
        <KPICard title="Avg Accuracy" value={data.weeklyAccuracy?.length > 0 ? `${data.weeklyAccuracy[data.weeklyAccuracy.length - 1].avgAccuracy}%` : "—"}
          icon={Target} accent="sky" subtitle="Most recent week" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-slate-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-500" />
              Accuracy Trends Over Time
            </CardTitle>
            <p className="text-[11px] text-slate-400">Weekly average accuracy across all skill programs</p>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.weeklyAccuracy}>
                  <defs>
                    <linearGradient id="accuracyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.emerald} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={COLORS.emerald} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={formatWeek} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v: number) => `${v}%`} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-white rounded-lg shadow-lg border p-3 text-xs">
                        <p className="font-semibold text-slate-700 mb-1">{formatWeek(label)}</p>
                        <p>Avg Accuracy: <span className="font-bold text-emerald-600">{payload[0].value}%</span></p>
                        {payload[0].payload.totalTrials && <p className="text-slate-400 mt-0.5">{payload[0].payload.totalTrials.toLocaleString()} total trials</p>}
                      </div>
                    );
                  }} />
                  <Area type="monotone" dataKey="avgAccuracy" name="Avg Accuracy" stroke={COLORS.emerald} fill="url(#accuracyGrad)" strokeWidth={2.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Layers className="w-4 h-4 text-violet-500" />
              Mastery Funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {funnelData.map((d, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <d.icon className="w-4 h-4" style={{ color: d.color }} />
                      <span className="text-[13px] font-medium text-slate-700">{d.name}</span>
                    </div>
                    <span className="text-[13px] font-bold text-slate-800">{d.value}</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${funnel.total > 0 ? (d.value / funnel.total) * 100 : 0}%`, backgroundColor: d.color }} />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5 text-right">
                    {funnel.total > 0 ? Math.round(d.value / funnel.total * 100) : 0}%
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">By Program Type</p>
              <div className="space-y-2">
                {(data.programTypeBreakdown || []).map((t: any, i: number) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] }} />
                      <span className="text-[12px] text-slate-600">{typeLabels[t.type] || t.type}</span>
                    </div>
                    <span className="text-[12px] font-semibold text-slate-700">{t.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-slate-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-500" />
              Prompt Level Distribution
            </CardTitle>
            <p className="text-[11px] text-slate-400">Independence levels across all program data</p>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sortedPrompts} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis type="category" dataKey="level" tick={{ fontSize: 11, fill: "#64748b" }} width={100}
                    tickFormatter={(v: string) => promptLabels[v] || v} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-white rounded-lg shadow-lg border p-2.5 text-xs">
                        <span className="font-semibold">{promptLabels[payload[0].payload.level] || payload[0].payload.level}: {payload[0].value}</span>
                      </div>
                    );
                  }} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={20}>
                    {sortedPrompts.map((_: any, i: number) => {
                      const colors = [COLORS.emerald, COLORS.teal, COLORS.sky, COLORS.indigo, COLORS.violet, COLORS.pink];
                      return <Cell key={i} fill={colors[i % colors.length]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-500" />
              Domain Breakdown
            </CardTitle>
            <p className="text-[11px] text-slate-400">Active programs by skill domain</p>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.domainBreakdown} margin={{ bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="domain" tick={{ fontSize: 10, fill: "#64748b" }} angle={-35} textAnchor="end" height={60}
                    tickFormatter={(v: string) => v.split("_").map((w: string) => w[0].toUpperCase() + w.slice(1)).join(" ")} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-white rounded-lg shadow-lg border p-2.5 text-xs">
                        <span className="font-semibold capitalize">{(payload[0].payload.domain || "").replace(/_/g, " ")}: {payload[0].value}</span>
                      </div>
                    );
                  }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={28}>
                    {(data.domainBreakdown || []).map((_: any, i: number) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-slate-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-500" />
              Top Performers
            </CardTitle>
            <p className="text-[11px] text-slate-400">Highest accuracy across all programs</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {(data.topPerformers || []).slice(0, 6).map((t: any, i: number) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-slate-700 truncate">{t.targetName}</p>
                    <p className="text-[11px] text-slate-400">{t.studentName} · {typeLabels[t.programType] || t.programType}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-[14px] font-bold text-emerald-600">{Math.round(Number(t.latestAccuracy))}%</span>
                    <p className="text-[10px] text-slate-400">{t.dataPoints} sessions</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Needs Support
            </CardTitle>
            <p className="text-[11px] text-slate-400">Lowest accuracy — may need intervention</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {(data.needsSupport || []).slice(0, 6).map((t: any, i: number) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-slate-700 truncate">{t.targetName}</p>
                    <p className="text-[11px] text-slate-400">{t.studentName} · {typeLabels[t.programType] || t.programType}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-[14px] font-bold text-amber-600">{Math.round(Number(t.latestAccuracy))}%</span>
                    <p className="text-[10px] text-slate-400">target: {t.masteryCriterion}%</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MinutesTab() {
  const { data, loading, error, refetch } = useAnalytics("minutes-summary");

  if (loading) return <SectionSkeleton />;
  if (error) return <ErrorBanner message="Failed to load minutes data" onRetry={refetch} />;
  if (!data) return null;

  const totalDelivered = (data.complianceByService || []).reduce((s: number, c: any) => s + c.delivered, 0);
  const totalRequired = (data.complianceByService || []).reduce((s: number, c: any) => s + c.required, 0);
  const avgCompliance = totalRequired > 0 ? Math.round((totalDelivered / totalRequired) * 100) : 0;
  const totalStaffMinutes = (data.staffUtilization || []).reduce((s: number, st: any) => s + (st.totalMinutes || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Delivered" value={totalDelivered.toLocaleString()} icon={Clock} accent="indigo" subtitle="Minutes this period" />
        <KPICard title="Total Required" value={totalRequired.toLocaleString()} icon={Timer} accent="sky" subtitle="IEP mandate" />
        <KPICard title="Compliance Rate" value={`${avgCompliance}%`} icon={CheckCircle} accent="emerald" subtitle="Delivered / Required" />
        <KPICard title="Staff Hours" value={Math.round(totalStaffMinutes / 60).toLocaleString()} icon={Users} accent="violet"
          subtitle={`${(data.staffUtilization || []).length} providers`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-slate-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-500" />
              Weekly Delivery Trend
            </CardTitle>
            <p className="text-[11px] text-slate-400">Completed vs missed sessions by week</p>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.weeklyDelivery}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={formatWeek} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <Tooltip content={CustomTooltip} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="completedCount" name="Completed" fill={COLORS.emerald} radius={[3, 3, 0, 0]} stackId="a" />
                  <Bar dataKey="missedCount" name="Missed" fill={COLORS.red} radius={[3, 3, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-sky-500" />
              Day of Week Pattern
            </CardTitle>
            <p className="text-[11px] text-slate-400">Service delivery by day</p>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dayOfWeekPattern}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-white rounded-lg shadow-lg border p-3 text-xs">
                        <p className="font-semibold text-slate-700 mb-1">{label}</p>
                        <p>{Number(payload[0].value).toLocaleString()} minutes</p>
                        <p className="text-slate-400">{payload[0].payload.sessionCount} sessions</p>
                      </div>
                    );
                  }} />
                  <Bar dataKey="totalMinutes" name="Minutes" radius={[6, 6, 0, 0]} barSize={32}>
                    {(data.dayOfWeekPattern || []).map((_: any, i: number) => (
                      <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-slate-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-500" />
              Compliance by Service Type
            </CardTitle>
            <p className="text-[11px] text-slate-400">Delivered vs required minutes per service</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(data.complianceByService || []).sort((a: any, b: any) => a.compliance - b.compliance).map((s: any, i: number) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-medium text-slate-700">{s.service}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">{s.delivered.toLocaleString()} / {s.required.toLocaleString()} min</span>
                      <span className={`text-[12px] font-bold ${s.compliance >= 90 ? "text-emerald-600" : s.compliance >= 75 ? "text-amber-600" : "text-red-600"}`}>
                        {s.compliance}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(s.compliance, 100)}%`,
                        backgroundColor: s.compliance >= 90 ? COLORS.emerald : s.compliance >= 75 ? COLORS.amber : COLORS.red,
                      }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-500" />
              Staff Utilization
            </CardTitle>
            <p className="text-[11px] text-slate-400">Top providers by delivered minutes</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {(data.staffUtilization || []).slice(0, 8).map((s: any, i: number) => {
                const maxMin = data.staffUtilization[0]?.totalMinutes || 1;
                const roleLabels: Record<string, string> = {
                  bcba: "BCBA", slp: "SLP", ot: "OT", pt: "PT", counselor: "Counselor",
                  para: "Para", case_manager: "CM", teacher: "Teacher",
                };
                return (
                  <div key={i} className="px-5 py-3 hover:bg-slate-50/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-slate-700">{s.staffName}</span>
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">
                          {roleLabels[s.role] || s.role}
                        </span>
                      </div>
                      <span className="text-[12px] font-semibold text-slate-700">{(s.totalMinutes || 0).toLocaleString()} min</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-400 transition-all"
                        style={{ width: `${((s.totalMinutes || 0) / maxMin) * 100}%` }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-slate-400">{s.sessionCount || 0} sessions</span>
                      <span className="text-[10px] text-slate-400">{s.missedCount || 0} missed</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Analytics & Insights</h1>
        <p className="text-sm text-slate-500 mt-1">School-wide data visualization and performance analysis</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-white border border-slate-200 p-1 rounded-xl shadow-sm">
          <TabsTrigger value="overview" className="text-[13px] rounded-lg data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
            <BarChart3 className="w-4 h-4 mr-1.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="behavior" className="text-[13px] rounded-lg data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
            <Activity className="w-4 h-4 mr-1.5" /> Behavior
          </TabsTrigger>
          <TabsTrigger value="academic" className="text-[13px] rounded-lg data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
            <GraduationCap className="w-4 h-4 mr-1.5" /> Academic
          </TabsTrigger>
          <TabsTrigger value="minutes" className="text-[13px] rounded-lg data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
            <Clock className="w-4 h-4 mr-1.5" /> Minutes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="behavior"><BehaviorTab /></TabsContent>
        <TabsContent value="academic"><AcademicTab /></TabsContent>
        <TabsContent value="minutes"><MinutesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
