import { useGetDashboardSummary, useGetDashboardRiskOverview, useGetMissedSessionsTrend, useGetComplianceByService, useGetDashboardAlertsSummary, useListAlerts } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Users, Calendar, CheckCircle, TrendingDown, Clock, Bell, Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import { Link } from "wouter";

const RISK_COLORS = {
  on_track: "#10b981",
  slightly_behind: "#f59e0b",
  at_risk: "#f97316",
  out_of_compliance: "#ef4444",
  completed: "#6366f1",
};

const RISK_LABELS = {
  on_track: "On Track",
  slightly_behind: "Slightly Behind",
  at_risk: "At Risk",
  out_of_compliance: "Out of Compliance",
  completed: "Completed",
};

function StatCard({ title, value, subtitle, icon: Icon, color = "text-slate-700", href }: any) {
  const content = (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{title}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value ?? <Skeleton className="w-10 h-7 mt-1" />}</p>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {Icon && (
            <div className={`p-2 rounded-lg bg-slate-100`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}><a>{content}</a></Link> : content;
}

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();
  const { data: riskOverview } = useGetDashboardRiskOverview();
  const { data: trend } = useGetMissedSessionsTrend();
  const { data: complianceByService } = useGetComplianceByService();
  const { data: alertsSummary } = useGetDashboardAlertsSummary();
  const { data: recentAlerts } = useListAlerts({ resolved: "false" } as any);

  const s = summary as any;
  const ro = riskOverview as any;
  const alerts = alertsSummary as any;
  const recent = (recentAlerts as any[])?.slice(0, 5) ?? [];

  const riskPieData = ro ? [
    { name: "On Track", value: ro.onTrack, color: "#10b981" },
    { name: "Slightly Behind", value: ro.slightlyBehind, color: "#f59e0b" },
    { name: "At Risk", value: ro.atRisk, color: "#f97316" },
    { name: "Out of Compliance", value: ro.outOfCompliance, color: "#ef4444" },
  ].filter(d => d.value > 0) : [];

  const trendData = (trend as any[])?.slice(-8) ?? [];
  const serviceData = (complianceByService as any[]) ?? [];

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Operations Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Jefferson Unified School District · Lincoln High School</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Activity className="w-3.5 h-3.5 text-green-500" />
          Live data · IEP Year 2025–2026
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Active Students" value={s?.totalActiveStudents} subtitle="on active IEPs" icon={Users} href="/students" />
        <StatCard title="Open Alerts" value={alerts?.total} subtitle={`${alerts?.critical ?? 0} critical`} icon={Bell} color="text-red-600" href="/alerts" />
        <StatCard title="Makeup Obligations" value={s?.openMakeupObligations} subtitle="missed sessions needing makeup" icon={Clock} color="text-orange-600" href="/sessions" />
        <StatCard title="Out of Compliance" value={s?.outOfComplianceStudents} subtitle="students need attention" icon={AlertTriangle} color="text-red-600" href="/compliance" />
      </div>

      {/* Risk Overview Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">Student Risk Status</CardTitle>
          </CardHeader>
          <CardContent>
            {riskPieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={riskPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value">
                      {riskPieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [v, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-1 mt-2">
                  {riskPieData.map(d => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs text-slate-600">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                      <span>{d.name}: <strong>{d.value}</strong></span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[180px] flex items-center justify-center">
                <Skeleton className="w-full h-full" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Missed Sessions Trend */}
        <Card className="col-span-1 md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">Missed Sessions Trend (8 Weeks)</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={trendData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="completedCount" name="Completed" fill="#10b981" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="missedCount" name="Missed" fill="#ef4444" radius={[2, 2, 0, 0]} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center">
                <Skeleton className="w-full h-full" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Compliance by Service + Recent Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Compliance by Service */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">Compliance by Service Type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {serviceData.slice(0, 6).map((svc: any) => (
              <div key={svc.serviceTypeName} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600 font-medium truncate">{svc.serviceTypeName}</span>
                  <span className="text-slate-400 ml-2 flex-shrink-0">
                    {svc.onTrack}/{svc.totalRequirements} on track · <span style={{ color: svc.atRisk > 0 ? "#ef4444" : "#10b981" }}>{svc.atRisk + svc.outOfCompliance} at risk</span>
                  </span>
                </div>
                <Progress
                  value={svc.totalRequirements > 0 ? (svc.onTrack / svc.totalRequirements) * 100 : 0}
                  className="h-1.5"
                />
              </div>
            ))}
            {serviceData.length === 0 && <Skeleton className="w-full h-32" />}
          </CardContent>
        </Card>

        {/* Recent Alerts */}
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-700">Recent Alerts</CardTitle>
            <Link href="/alerts">
              <a className="text-xs text-indigo-600 hover:underline">View all</a>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.length > 0 ? recent.map((a: any) => (
              <div key={a.id} className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
                <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                  a.severity === "critical" ? "bg-red-500" :
                  a.severity === "high" ? "bg-orange-500" :
                  a.severity === "medium" ? "bg-yellow-500" : "bg-blue-400"
                }`} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{a.studentName ?? "System"}</p>
                  <p className="text-xs text-slate-500 truncate">{a.message}</p>
                </div>
                <Badge variant="outline" className={`text-[10px] flex-shrink-0 ${
                  a.severity === "critical" ? "border-red-300 text-red-600" :
                  a.severity === "high" ? "border-orange-300 text-orange-600" : "border-slate-200 text-slate-500"
                }`}>{a.severity}</Badge>
              </div>
            )) : (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="w-full h-12" />)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
