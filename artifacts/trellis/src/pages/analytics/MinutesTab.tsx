import { useGetAnalyticsMinutesSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend,
} from "recharts";
import {
  Users, Target, Clock, Activity, BarChart3, CheckCircle, Timer,
} from "lucide-react";
import { COLORS, CHART_PALETTE, KPICard, SectionSkeleton, CustomTooltip, formatWeek } from "./shared";

export default function MinutesTab() {
  const { data: _minutesData, isLoading: loading, isError: error, refetch } = useGetAnalyticsMinutesSummary();
  const data = _minutesData as any;

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
              <BarChart3 className="w-4 h-4 text-gray-500" />
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
              <Users className="w-4 h-4 text-emerald-500" />
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
