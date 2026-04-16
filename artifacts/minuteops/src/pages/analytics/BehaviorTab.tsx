import { useGetAnalyticsBehaviorSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, ComposedChart,
} from "recharts";
import {
  TrendingUp, TrendingDown, Target, Activity, BarChart3, AlertTriangle, Layers,
} from "lucide-react";
import { COLORS, CHART_PALETTE, KPICard, SectionSkeleton, CustomTooltip, formatWeek } from "./shared";

export default function BehaviorTab() {
  const { data: _behaviorData, isLoading: loading, isError: error, refetch } = useGetAnalyticsBehaviorSummary();
  const data = _behaviorData as any;

  if (loading) return <SectionSkeleton />;
  if (error) return <ErrorBanner message="Failed to load behavior data" onRetry={refetch} />;
  if (!data) return null;

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
              <Layers className="w-4 h-4 text-emerald-500" />
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
