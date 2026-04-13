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
  User, ChevronRight, Search, Sparkles,
} from "lucide-react";
import { Link } from "wouter";

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
  indigo: "#059669",
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
    indigo: "bg-emerald-50 text-emerald-700",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    sky: "bg-sky-50 text-sky-600",
    violet: "bg-violet-50 text-violet-600",
  };
  return (
    <Card className="hover:shadow-md transition-all duration-200 border-gray-200/80">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${accents[accent] || accents.indigo}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-gray-500 font-medium uppercase tracking-wider">{title}</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-gray-800">{value}</span>
              {trend && (
                <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${trend.positive ? "text-emerald-600" : "text-red-500"}`}>
                  {trend.positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(trend.value)}%
                </span>
              )}
            </div>
            {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
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
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-semibold text-gray-700">{typeof p.value === "number" ? p.value.toLocaleString() : p.value}</span>
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
    { name: "Remaining", value: 100 - data.avgCompliance, fill: "#e5e7eb" },
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
        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-emerald-600" />
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
                          <span className="text-gray-400">({Math.round(d.value / totalStudents * 100)}%)</span>
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
                  <span className="text-gray-600">{d.name}</span>
                  <span className="font-bold text-gray-800">{d.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-500" />
              Overall Compliance Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center">
              <div className="relative h-[200px] w-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" startAngle={90} endAngle={-270} data={[gaugeData[0]]}>
                    <RadialBar background={{ fill: "#e5e7eb" }} dataKey="value" cornerRadius={10} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-bold text-gray-800">{data.avgCompliance}%</span>
                  <span className="text-[11px] text-gray-400 mt-1">compliance rate</span>
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

        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-500" />
              Service Delivery Heatmap
            </CardTitle>
            <p className="text-[11px] text-gray-400">Sessions by day and hour</p>
          </CardHeader>
          <CardContent>
            {heatLoading ? <Skeleton className="h-[260px]" /> : (
              <div className="space-y-1.5">
                <div className="flex gap-1 items-center">
                  <div className="w-10" />
                  {hours.map(h => (
                    <div key={h} className="flex-1 text-center text-[9px] text-gray-400 font-medium">
                      {h > 12 ? `${h-12}p` : h === 12 ? "12p" : `${h}a`}
                    </div>
                  ))}
                </div>
                {days.map(day => (
                  <div key={day} className="flex gap-1 items-center">
                    <div className="w-10 text-[10px] text-gray-500 font-medium">{day}</div>
                    {hours.map(h => {
                      const cell = heatmapGrid.find((c: any) => c.day === day && c.hour === h);
                      const intensity = cell ? Math.min(cell.sessions / maxSessions, 1) : 0;
                      return (
                        <div key={h} className="flex-1 aspect-square rounded-sm cursor-default group relative"
                          style={{ backgroundColor: intensity === 0 ? "#f8fafc" : `rgba(4, 120, 87, ${0.15 + intensity * 0.75})` }}
                          title={cell ? `${cell.sessions} sessions, ${cell.minutes} min` : "No sessions"}>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div className="flex items-center gap-2 mt-3 justify-end">
                  <span className="text-[9px] text-gray-400">Less</span>
                  {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v, i) => (
                    <div key={i} className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: v === 0 ? "#f8fafc" : `rgba(4, 120, 87, ${0.15 + v * 0.75})` }} />
                  ))}
                  <span className="text-[9px] text-gray-400">More</span>
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
        <Card className="lg:col-span-2 border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              School-Wide Behavior Trends
            </CardTitle>
            <p className="text-[11px] text-gray-400">Weekly average across all behavior targets</p>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={formatWeek} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <Tooltip content={CustomTooltip} />
                  <Area type="monotone" dataKey="avgValue" name="Avg Value" stroke={COLORS.indigo} fill="url(#behaviorGrad)" strokeWidth={2.5} dot={false} />
                  <Bar dataKey="totalPoints" name="Data Points" fill={COLORS.sky} fillOpacity={0.4} radius={[3, 3, 0, 0]} barSize={16} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
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
                  <span className="text-gray-600 capitalize">{measureLabel[d.type] || d.type}</span>
                  <span className="font-bold text-gray-800">{d.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-emerald-500" />
              Top Improving Targets
            </CardTitle>
            <p className="text-[11px] text-gray-400">Targets making the most progress toward their goals</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {(data.topImproving || []).slice(0, 6).map((t: any, i: number) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-700 truncate">{t.targetName}</p>
                    <p className="text-[11px] text-gray-400">{t.studentName} · {measureLabel[t.measurementType] || t.measurementType}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="flex items-center gap-1 text-emerald-600">
                      <TrendingDown className="w-3.5 h-3.5" />
                      <span className="text-[13px] font-semibold">{Math.abs(t.change)}</span>
                    </div>
                    {t.progressToGoal != null && (
                      <p className="text-[10px] text-gray-400">{t.progressToGoal}% to goal</p>
                    )}
                  </div>
                </div>
              ))}
              {(!data.topImproving || data.topImproving.length === 0) && (
                <div className="px-5 py-8 text-center text-sm text-gray-400">No improving targets found</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-500" />
              Targets Needing Attention
            </CardTitle>
            <p className="text-[11px] text-gray-400">Targets moving away from their goals</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {(data.topWorsening || []).slice(0, 6).map((t: any, i: number) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-700 truncate">{t.targetName}</p>
                    <p className="text-[11px] text-gray-400">{t.studentName} · {measureLabel[t.measurementType] || t.measurementType}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="flex items-center gap-1 text-amber-600">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span className="text-[13px] font-semibold">+{Math.abs(t.change)}</span>
                    </div>
                    <p className="text-[10px] text-gray-400">{t.dataPoints} data pts</p>
                  </div>
                </div>
              ))}
              {(!data.topWorsening || data.topWorsening.length === 0) && (
                <div className="px-5 py-8 text-center text-sm text-gray-400">All targets are on track</div>
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
        <Card className="lg:col-span-2 border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              Accuracy Trends Over Time
            </CardTitle>
            <p className="text-[11px] text-gray-400">Weekly average accuracy across all skill programs</p>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={formatWeek} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={(v: number) => `${v}%`} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-white rounded-lg shadow-lg border p-3 text-xs">
                        <p className="font-semibold text-gray-700 mb-1">{formatWeek(label)}</p>
                        <p>Avg Accuracy: <span className="font-bold text-emerald-600">{payload[0].value}%</span></p>
                        {payload[0].payload.totalTrials && <p className="text-gray-400 mt-0.5">{payload[0].payload.totalTrials.toLocaleString()} total trials</p>}
                      </div>
                    );
                  }} />
                  <Area type="monotone" dataKey="avgAccuracy" name="Avg Accuracy" stroke={COLORS.emerald} fill="url(#accuracyGrad)" strokeWidth={2.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
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
                      <span className="text-[13px] font-medium text-gray-700">{d.name}</span>
                    </div>
                    <span className="text-[13px] font-bold text-gray-800">{d.value}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${funnel.total > 0 ? (d.value / funnel.total) * 100 : 0}%`, backgroundColor: d.color }} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5 text-right">
                    {funnel.total > 0 ? Math.round(d.value / funnel.total * 100) : 0}%
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">By Program Type</p>
              <div className="space-y-2">
                {(data.programTypeBreakdown || []).map((t: any, i: number) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] }} />
                      <span className="text-[12px] text-gray-600">{typeLabels[t.type] || t.type}</span>
                    </div>
                    <span className="text-[12px] font-semibold text-gray-700">{t.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-600" />
              Prompt Level Distribution
            </CardTitle>
            <p className="text-[11px] text-gray-400">Independence levels across all program data</p>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sortedPrompts} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <YAxis type="category" dataKey="level" tick={{ fontSize: 11, fill: "#6b7280" }} width={100}
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

        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-500" />
              Domain Breakdown
            </CardTitle>
            <p className="text-[11px] text-gray-400">Active programs by skill domain</p>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.domainBreakdown} margin={{ bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="domain" tick={{ fontSize: 10, fill: "#6b7280" }} angle={-35} textAnchor="end" height={60}
                    tickFormatter={(v: string) => v.split("_").map((w: string) => w[0].toUpperCase() + w.slice(1)).join(" ")} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
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
        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-500" />
              Top Performers
            </CardTitle>
            <p className="text-[11px] text-gray-400">Highest accuracy across all programs</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {(data.topPerformers || []).slice(0, 6).map((t: any, i: number) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-700 truncate">{t.targetName}</p>
                    <p className="text-[11px] text-gray-400">{t.studentName} · {typeLabels[t.programType] || t.programType}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-[14px] font-bold text-emerald-600">{Math.round(Number(t.latestAccuracy))}%</span>
                    <p className="text-[10px] text-gray-400">{t.dataPoints} sessions</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Needs Support
            </CardTitle>
            <p className="text-[11px] text-gray-400">Lowest accuracy — may need intervention</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {(data.needsSupport || []).slice(0, 6).map((t: any, i: number) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-700 truncate">{t.targetName}</p>
                    <p className="text-[11px] text-gray-400">{t.studentName} · {typeLabels[t.programType] || t.programType}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-[14px] font-bold text-amber-600">{Math.round(Number(t.latestAccuracy))}%</span>
                    <p className="text-[10px] text-gray-400">target: {t.masteryCriterion}%</p>
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
        <Card className="lg:col-span-2 border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              Weekly Delivery Trend
            </CardTitle>
            <p className="text-[11px] text-gray-400">Completed vs missed sessions by week</p>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.weeklyDelivery}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={formatWeek} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <Tooltip content={CustomTooltip} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="completedCount" name="Completed" fill={COLORS.emerald} radius={[3, 3, 0, 0]} stackId="a" />
                  <Bar dataKey="missedCount" name="Missed" fill={COLORS.red} radius={[3, 3, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-sky-500" />
              Day of Week Pattern
            </CardTitle>
            <p className="text-[11px] text-gray-400">Service delivery by day</p>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dayOfWeekPattern}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#6b7280" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-white rounded-lg shadow-lg border p-3 text-xs">
                        <p className="font-semibold text-gray-700 mb-1">{label}</p>
                        <p>{Number(payload[0].value).toLocaleString()} minutes</p>
                        <p className="text-gray-400">{payload[0].payload.sessionCount} sessions</p>
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
        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-600" />
              Compliance by Service Type
            </CardTitle>
            <p className="text-[11px] text-gray-400">Delivered vs required minutes per service</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(data.complianceByService || []).sort((a: any, b: any) => a.compliance - b.compliance).map((s: any, i: number) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-medium text-gray-700">{s.service}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-400">{s.delivered.toLocaleString()} / {s.required.toLocaleString()} min</span>
                      <span className={`text-[12px] font-bold ${s.compliance >= 90 ? "text-emerald-600" : s.compliance >= 75 ? "text-amber-600" : "text-red-600"}`}>
                        {s.compliance}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
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

        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-500" />
              Staff Utilization
            </CardTitle>
            <p className="text-[11px] text-gray-400">Top providers by delivered minutes</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {(data.staffUtilization || []).slice(0, 8).map((s: any, i: number) => {
                const maxMin = data.staffUtilization[0]?.totalMinutes || 1;
                const roleLabels: Record<string, string> = {
                  bcba: "BCBA", slp: "SLP", ot: "OT", pt: "PT", counselor: "Counselor",
                  para: "Para", case_manager: "CM", teacher: "Teacher",
                };
                return (
                  <div key={i} className="px-5 py-3 hover:bg-gray-50/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-gray-700">{s.staffName}</span>
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                          {roleLabels[s.role] || s.role}
                        </span>
                      </div>
                      <span className="text-[12px] font-semibold text-gray-700">{(s.totalMinutes || 0).toLocaleString()} min</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${((s.totalMinutes || 0) / maxMin) * 100}%` }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-gray-400">{s.sessionCount || 0} sessions</span>
                      <span className="text-[10px] text-gray-400">{s.missedCount || 0} missed</span>
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

function StudentTab() {
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [studentData, setStudentData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/students`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setStudents(Array.isArray(d) ? d : d.students || []); setListLoading(false); })
      .catch(() => setListLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    fetch(`${API}/analytics/student/${selectedId}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setStudentData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedId]);

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
  const promptLabels: Record<string, string> = {
    independent: "Independent", verbal: "Verbal", gestural: "Gestural", model: "Model",
    partial_physical: "Partial Phys.", full_physical: "Full Phys.",
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
        <button onClick={() => { setSelectedId(null); setStudentData(null); }}
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
                <BarChart3 className="w-4 h-4 text-sky-500" />
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
              <Activity className="w-4 h-4 text-rose-500" />
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
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${bt.targetDirection === "decrease" ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-600"}`}>
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
                                      <p>Avg Prompt: <span className="font-bold text-violet-600">{labels[nearest] || level}</span></p>
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
                <Clock className="w-4 h-4 text-sky-500" />
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
                <Layers className="w-4 h-4 text-violet-500" />
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

export default function AnalyticsPage() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Analytics & Insights</h1>
        <p className="text-sm text-gray-500 mt-1">School-wide and per-student data visualization and performance analysis</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-white border border-gray-200 p-1 rounded-xl shadow-sm">
          <TabsTrigger value="overview" className="text-[13px] rounded-lg data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-800">
            <BarChart3 className="w-4 h-4 mr-1.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="behavior" className="text-[13px] rounded-lg data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-800">
            <Activity className="w-4 h-4 mr-1.5" /> Behavior
          </TabsTrigger>
          <TabsTrigger value="academic" className="text-[13px] rounded-lg data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-800">
            <GraduationCap className="w-4 h-4 mr-1.5" /> Academic
          </TabsTrigger>
          <TabsTrigger value="minutes" className="text-[13px] rounded-lg data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-800">
            <Clock className="w-4 h-4 mr-1.5" /> Minutes
          </TabsTrigger>
          <TabsTrigger value="student" className="text-[13px] rounded-lg data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-800">
            <User className="w-4 h-4 mr-1.5" /> Student
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="behavior"><BehaviorTab /></TabsContent>
        <TabsContent value="academic"><AcademicTab /></TabsContent>
        <TabsContent value="minutes"><MinutesTab /></TabsContent>
        <TabsContent value="student"><StudentTab /></TabsContent>
      </Tabs>
    </div>
  );
}
