import {
  useGetAnalyticsOverview,
  useGetAnalyticsDeliveryHeatmap,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar,
} from "recharts";
import {
  Users, Target, Brain, Clock, Activity, CheckCircle, PieChart as PieIcon,
} from "lucide-react";
import { COLORS, RISK_COLORS, KPICard, SectionSkeleton } from "./shared";

export default function OverviewTab() {
  const { data: _overviewData, isLoading: loading, isError: error, refetch } = useGetAnalyticsOverview();
  const data = _overviewData as any;
  const { data: _heatmapData, isLoading: heatLoading } = useGetAnalyticsDeliveryHeatmap();
  const heatmap = _heatmapData as any;

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
              <Clock className="w-4 h-4 text-gray-500" />
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
