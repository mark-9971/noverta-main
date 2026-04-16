import { useGetAnalyticsProgramSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, AreaChart, Area,
} from "recharts";
import {
  Target, Activity, Zap, Award, AlertTriangle, GraduationCap, Layers,
} from "lucide-react";
import { COLORS, CHART_PALETTE, KPICard, SectionSkeleton, formatWeek } from "./shared";

export default function AcademicTab() {
  const { data: _academicData, isLoading: loading, isError: error, refetch } = useGetAnalyticsProgramSummary();
  const data = _academicData as any;

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
              <Layers className="w-4 h-4 text-emerald-500" />
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
              <Layers className="w-4 h-4 text-emerald-500" />
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
