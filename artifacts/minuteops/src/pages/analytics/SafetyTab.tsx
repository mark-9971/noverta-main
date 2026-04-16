import {
  useGetAnalyticsPmOverview,
  useGetAnalyticsPmByStudent,
  useGetAnalyticsPmAntecedents,
  useGetAnalyticsPmEpisodeRatio,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import {
  Users, Clock, Activity, Zap, AlertTriangle, CheckCircle, TrendingUp,
  Shield, HeartPulse, ClipboardCheck, Flame,
} from "lucide-react";
import { Link } from "wouter";
import {
  CHART_PALETTE, KPICard, SectionSkeleton, CustomTooltip,
  PM_TYPE_COLORS, PM_TYPE_LABELS, ANTECEDENT_LABELS,
} from "./shared";

export default function SafetyTab() {
  const { data: _overview, isLoading: overviewLoading, isError: overviewError } = useGetAnalyticsPmOverview();
  const { data: _byStudent, isLoading: studentsLoading } = useGetAnalyticsPmByStudent();
  const { data: _antecedents, isLoading: antLoading } = useGetAnalyticsPmAntecedents();
  const { data: _episodeRatio, isLoading: ratioLoading } = useGetAnalyticsPmEpisodeRatio();

  const overview = _overview as any;
  const byStudent = (_byStudent as any[]) ?? [];
  const antecedents = (_antecedents as any[]) ?? [];
  const episodeRatio = _episodeRatio as any;

  if (overviewLoading) return <SectionSkeleton />;
  if (overviewError || !overview) return <ErrorBanner message="Failed to load safety analytics" />;

  const monthlyData = (overview.monthlyTrend ?? []).map((m: any) => ({
    ...m,
    month: m.month ? new Date(m.month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }) : m.month,
  }));

  const injuryRateColor = overview.injuryRate >= 20 ? "red" : overview.injuryRate >= 10 ? "amber" : "emerald";
  const pendingColor = overview.pendingReview >= 5 ? "red" : overview.pendingReview >= 2 ? "amber" : "emerald";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Incidents" value={overview.totalIncidents} icon={Shield} accent="red"
          subtitle={`${overview.studentsAffected} students affected`} />
        <KPICard title="Injury Rate" value={`${overview.injuryRate}%`} icon={HeartPulse} accent={injuryRateColor}
          subtitle={`${overview.injuryCount} incidents with injury`} />
        <KPICard title="Avg Duration" value={`${overview.avgDurationMinutes} min`} icon={Clock} accent="sky"
          subtitle="Per protective measure" />
        <KPICard title="Pending Review" value={overview.pendingReview} icon={ClipboardCheck} accent={pendingColor}
          subtitle={`${overview.desePending} DESE reports pending`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(overview.byType ?? []).map((t: any) => (
          <Card key={t.type} className="border-gray-200/80">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">
                  {PM_TYPE_LABELS[t.type] ?? t.type}
                </span>
                <span className="text-xs font-bold rounded-full px-2 py-0.5" style={{ backgroundColor: PM_TYPE_COLORS[t.type] + "20", color: PM_TYPE_COLORS[t.type] }}>
                  {Math.round((t.count / overview.totalIncidents) * 100)}%
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-800">{t.count}</div>
              <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.round((t.count / overview.totalIncidents) * 100)}%`, backgroundColor: PM_TYPE_COLORS[t.type] }} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              Monthly Incident Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} formatter={(v) => PM_TYPE_LABELS[v] ?? v} />
                  <Line type="monotone" dataKey="physical_restraint" name="physical_restraint" stroke={PM_TYPE_COLORS.physical_restraint} strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="seclusion" name="seclusion" stroke={PM_TYPE_COLORS.seclusion} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="time_out" name="time_out" stroke={PM_TYPE_COLORS.time_out} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="emergency_escort" name="emergency_escort" stroke={PM_TYPE_COLORS.emergency_escort} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" />
              Antecedent Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            {antLoading ? <Skeleton className="h-[260px]" /> : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={antecedents.map(a => ({ ...a, label: ANTECEDENT_LABELS[a.category] ?? a.category }))} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} allowDecimals={false} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: "#6b7280" }} width={110} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-white rounded-lg shadow-lg border p-2.5 text-xs">
                          <p className="font-semibold text-gray-700">{d.label}</p>
                          <p>{d.count} incidents ({d.percentage}%)</p>
                          {d.injuries > 0 && <p className="text-red-500">{d.injuries} with injury</p>}
                          <p className="text-gray-400">Avg {d.avgDuration} min</p>
                        </div>
                      );
                    }} />
                    <Bar dataKey="count" name="Incidents" radius={[0, 6, 6, 0]} barSize={20}>
                      {antecedents.map((_: any, i: number) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-500" />
              Episode → Protective Measure Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ratioLoading ? <Skeleton className="h-[120px]" /> : (
              <div className="space-y-4">
                <div className="text-center pt-2">
                  <div className="text-5xl font-black text-gray-800">{episodeRatio?.episodeToPmRatio ?? "—"}<span className="text-2xl text-gray-400 font-normal">%</span></div>
                  <p className="text-xs text-gray-500 mt-1">of behavior sessions led to a PM</p>
                </div>
                <div className="space-y-1.5 text-xs border-t border-gray-100 pt-3">
                  <div className="flex justify-between text-gray-600">
                    <span>Behavior sessions</span>
                    <span className="font-semibold">{(episodeRatio?.totalBehaviorSessions ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>PM incidents</span>
                    <span className="font-semibold">{(episodeRatio?.totalPmIncidents ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Physical restraints</span>
                    <span className="font-semibold text-red-600">{(episodeRatio?.totalPhysicalRestraints ?? 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              Compliance Indicators
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-3">
            {[
              { label: "BIP in Place Rate", value: overview.bipRate, good: overview.bipRate >= 70 },
              { label: "Debrief Conducted Rate", value: overview.debriefRate, good: overview.debriefRate >= 80 },
              { label: "Parent Notification Rate", value: 100 - Math.round((overview.desePending / Math.max(overview.totalIncidents, 1)) * 100), good: true },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-600">{item.label}</span>
                  <span className={`font-semibold ${item.good ? "text-emerald-600" : "text-red-500"}`}>{item.value}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${item.value}%`, backgroundColor: item.good ? "#059669" : "#ef4444" }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-gray-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-400" />
              Incident Type Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={(overview.byType ?? []).map((t: any) => ({ name: PM_TYPE_LABELS[t.type] ?? t.type, value: t.count, color: PM_TYPE_COLORS[t.type] ?? "#9ca3af" }))}
                    cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value" strokeWidth={0}>
                    {(overview.byType ?? []).map((t: any, i: number) => <Cell key={i} fill={PM_TYPE_COLORS[t.type] ?? CHART_PALETTE[i]} />)}
                  </Pie>
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white rounded-lg shadow-lg border p-2 text-xs">
                        <p className="font-semibold">{d.name}: {d.value}</p>
                      </div>
                    );
                  }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
              {(overview.byType ?? []).map((t: any, i: number) => (
                <div key={i} className="flex items-center gap-1 text-[10px]">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PM_TYPE_COLORS[t.type] ?? CHART_PALETTE[i] }} />
                  <span className="text-gray-500">{PM_TYPE_LABELS[t.type] ?? t.type}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" />
            Students by Incident Frequency
          </CardTitle>
        </CardHeader>
        <CardContent>
          {studentsLoading ? <Skeleton className="h-[200px]" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-[11px] text-gray-400 uppercase tracking-wider">
                    <th className="text-left pb-2 pr-4 font-medium">Student</th>
                    <th className="text-center pb-2 px-3 font-medium">Grade</th>
                    <th className="text-center pb-2 px-3 font-medium">Total</th>
                    <th className="text-center pb-2 px-3 font-medium">Physical</th>
                    <th className="text-center pb-2 px-3 font-medium">Seclusion</th>
                    <th className="text-center pb-2 px-3 font-medium">Injuries</th>
                    <th className="text-center pb-2 px-3 font-medium">Avg Duration</th>
                    <th className="text-right pb-2 pl-3 font-medium">Last Incident</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {byStudent.slice(0, 12).map((row: any) => {
                    const hasInjuries = row.injuries > 0;
                    const isHigh = row.total >= 15;
                    return (
                      <tr key={row.studentId} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="py-2.5 pr-4">
                          <Link href={`/students/${row.studentId}`}>
                            <span className="font-medium text-gray-800 group-hover:text-emerald-700 transition-colors cursor-pointer">
                              {row.firstName} {row.lastName}
                            </span>
                          </Link>
                        </td>
                        <td className="py-2.5 px-3 text-center text-gray-500">{row.grade ?? "—"}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`font-bold text-sm ${isHigh ? "text-red-600" : "text-gray-700"}`}>{row.total}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-gray-600">{row.physical}</td>
                        <td className="py-2.5 px-3 text-center text-gray-600">{row.seclusion}</td>
                        <td className="py-2.5 px-3 text-center">
                          {hasInjuries ? (
                            <span className="flex items-center justify-center gap-1 text-red-600 font-medium">
                              <AlertTriangle className="w-3 h-3" />{row.injuries}
                            </span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="py-2.5 px-3 text-center text-gray-600">{row.avgDuration ? `${row.avgDuration} min` : "—"}</td>
                        <td className="py-2.5 pl-3 text-right text-gray-400 text-xs">{row.lastIncident ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
