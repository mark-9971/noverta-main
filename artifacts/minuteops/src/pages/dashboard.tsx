import {
  useGetDashboardSummary, useGetDashboardRiskOverview, useGetMissedSessionsTrend,
  useGetComplianceByService, useGetDashboardAlertsSummary, useListAlerts,
  useGetAcademicsOverview, useGetComplianceDeadlines,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ProgressRing } from "@/components/ui/progress-ring";
import { AlertTriangle, Users, Clock, Bell, TrendingUp, CheckCircle, CalendarDays, BookOpen, GraduationCap } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Link } from "wouter";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useSchoolContext } from "@/lib/school-context";
import { useRole } from "@/lib/role-context";
import { SetupChecklist } from "@/components/onboarding/SetupChecklist";
import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { FileSearch, Sprout, CalendarDays as MeetingIcon } from "lucide-react";

function MetricCard({ title, value, icon: Icon, accent = "emerald", subtitle, href }: any) {
  const accents: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-500",
    amber: "bg-amber-50 text-amber-600",
  };
  const content = (
    <Card className="hover:shadow-md transition-shadow cursor-pointer group border-gray-200/60">
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${accents[accent] || accents.emerald}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-gray-500 font-medium">{title}</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold text-gray-900">{value ?? <Skeleton className="w-8 h-7" />}</span>
              {subtitle && <span className="text-[11px] text-gray-400">{subtitle}</span>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

const RISK_PIE_COLORS = ["#10b981", "#f59e0b", "#f97316", "#ef4444"];
const RISK_PIE_LABELS = ["On Track", "Slightly Behind", "At Risk", "Out of Compliance"];

export default function Dashboard() {
  const { role } = useRole();
  const isAdmin = role === "admin" || role === "coordinator";
  const { filterParams, typedFilter } = useSchoolContext();
  const { data: summary, isError: summaryError, refetch: refetchSummary } = useGetDashboardSummary(typedFilter);
  const { data: riskOverview } = useGetDashboardRiskOverview(typedFilter);
  const { data: trend } = useGetMissedSessionsTrend(typedFilter);
  const { data: complianceByService } = useGetComplianceByService(typedFilter);
  const { data: alertsSummary } = useGetDashboardAlertsSummary(typedFilter);
  const { data: recentAlerts } = useListAlerts({ resolved: "false", ...filterParams } as any);
  const { data: _academicsData } = useGetAcademicsOverview();
  const academics = _academicsData as any;
  const { data: deadlinesRaw } = useGetComplianceDeadlines();

  interface EvalDashboardSummary {
    overdueEvaluations: number;
    upcomingReEvaluations: number;
    openReferrals: number;
    overdueReEvaluations: number;
  }
  const [evalDash, setEvalDash] = useState<EvalDashboardSummary | null>(null);
  interface TransitionDashboardSummary {
    totalTransitionAge: number;
    missingPlan: number;
    incompletePlans: number;
    approachingTransitionAge: number;
    overdueFollowups: number;
  }
  const [transitionDash, setTransitionDash] = useState<TransitionDashboardSummary | null>(null);
  interface MeetingDashboardSummary {
    overdueCount: number;
    thisWeekCount: number;
    pendingConsentCount: number;
    overdueAnnualReviews: number;
  }
  const [meetingDash, setMeetingDash] = useState<MeetingDashboardSummary | null>(null);
  useEffect(() => {
    authFetch("/api/evaluations/dashboard")
      .then((d: unknown) => setEvalDash(d as EvalDashboardSummary))
      .catch(() => {});
    authFetch("/api/transitions/dashboard")
      .then((d: unknown) => setTransitionDash(d as TransitionDashboardSummary))
      .catch(() => {});
    authFetch("/api/iep-meetings/dashboard")
      .then(r => { if (r.ok) return r.json(); throw new Error(); })
      .then((d: unknown) => setMeetingDash(d as MeetingDashboardSummary))
      .catch(() => {});
  }, []);

  const deadlines = (() => {
    const items: any[] = Array.isArray(deadlinesRaw) ? deadlinesRaw : (deadlinesRaw as any)?.events ?? [];
    return items.slice(0, 6).map((e: any) => ({
      studentName: e.student ? `${e.student.firstName} ${e.student.lastName}` : "Student",
      eventType: e.eventType,
      daysUntilDue: e.daysRemaining,
    }));
  })();

  const s = summary as any;
  const ro = riskOverview as any;
  const alerts = alertsSummary as any;
  const recent = (recentAlerts as any[])?.slice(0, 5) ?? [];

  const totalStudents = s?.totalActiveStudents ?? 0;
  // Use trackedStudents (students with active service requirements) as compliance denominator
  const trackedStudents = s?.trackedStudents ?? totalStudents;
  const onTrack = s?.onTrackStudents ?? 0;
  const onTrackPct = trackedStudents > 0 ? Math.round((onTrack / trackedStudents) * 100) : 0;

  const riskPieData = ro ? [
    { name: "On Track", value: ro.onTrack },
    { name: "Slightly Behind", value: ro.slightlyBehind },
    { name: "At Risk", value: ro.atRisk },
    { name: "Out of Compliance", value: ro.outOfCompliance },
  ].filter(d => d.value > 0) : [];

  const colorMap: Record<string, string> = { "On Track": "#10b981", "Slightly Behind": "#f59e0b", "At Risk": "#f97316", "Out of Compliance": "#ef4444" };

  const trendData = (trend as any[])?.slice(-8).map((t: any) => ({
    ...t,
    weekLabel: t.weekLabel?.replace("Week of ", ""),
  })) ?? [];

  const serviceData = (complianceByService as any[]) ?? [];

  if (summaryError) return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <ErrorBanner message="Failed to load dashboard data. The server may be unavailable." onRetry={() => refetchSummary()} />
    </div>
  );

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6 md:space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-xs md:text-sm text-gray-400 mt-1 hidden sm:block">Jefferson Unified · Lincoln High School · IEP Year 2025–2026</p>
        </div>
      </div>

      {isAdmin && <SetupChecklist />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <MetricCard title="Active Students" value={s?.totalActiveStudents} icon={Users} accent="emerald" subtitle="on IEPs" href="/students" />
        <MetricCard title="Open Alerts" value={alerts?.total} icon={Bell} accent="red" subtitle={`${alerts?.critical ?? 0} critical`} href="/alerts" />
        <MetricCard title="Makeup Needed" value={s?.openMakeupObligations} icon={Clock} accent="amber" subtitle="sessions" href="/sessions" />
        <MetricCard title="Out of Compliance" value={s?.outOfComplianceStudents} icon={AlertTriangle} accent="red" subtitle="students" href="/compliance" />
      </div>

      {evalDash && (evalDash.overdueEvaluations > 0 || evalDash.overdueReEvaluations > 0 || evalDash.openReferrals > 0) && (
        <Card className={evalDash.overdueEvaluations > 0 || evalDash.overdueReEvaluations > 0 ? "border-red-200 bg-red-50/20" : "border-amber-200 bg-amber-50/20"}>
          <CardContent className="py-3 px-5 flex items-center gap-4 flex-wrap">
            <FileSearch className={`w-5 h-5 flex-shrink-0 ${evalDash.overdueEvaluations > 0 ? "text-red-500" : "text-amber-500"}`} />
            <div className="flex-1 min-w-0 flex items-center gap-4 flex-wrap text-[12px]">
              {evalDash.openReferrals > 0 && <span className="text-gray-600"><b className="text-gray-800">{evalDash.openReferrals}</b> open referral{evalDash.openReferrals !== 1 ? "s" : ""}</span>}
              {evalDash.overdueEvaluations > 0 && <span className="text-red-700 font-semibold">{evalDash.overdueEvaluations} overdue evaluation{evalDash.overdueEvaluations !== 1 ? "s" : ""}</span>}
              {evalDash.upcomingReEvaluations > 0 && <span className="text-amber-700">{evalDash.upcomingReEvaluations} re-eval{evalDash.upcomingReEvaluations !== 1 ? "s" : ""} due within 90 days</span>}
              {evalDash.overdueReEvaluations > 0 && <span className="text-red-700 font-semibold">{evalDash.overdueReEvaluations} overdue re-eval{evalDash.overdueReEvaluations !== 1 ? "s" : ""}</span>}
            </div>
            <Link href="/evaluations" className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap">
              View Evaluations →
            </Link>
          </CardContent>
        </Card>
      )}

      {transitionDash && (transitionDash.missingPlan > 0 || transitionDash.approachingTransitionAge > 0 || transitionDash.overdueFollowups > 0) && (
        <Card className={transitionDash.missingPlan > 0 ? "border-amber-200 bg-amber-50/20" : "border-gray-200/60"}>
          <CardContent className="py-3 px-5 flex items-center gap-4 flex-wrap">
            <Sprout className={`w-5 h-5 flex-shrink-0 ${transitionDash.missingPlan > 0 ? "text-amber-500" : "text-emerald-500"}`} />
            <div className="flex-1 min-w-0 flex items-center gap-4 flex-wrap text-[12px]">
              {transitionDash.missingPlan > 0 && <span className="text-amber-700 font-semibold">{transitionDash.missingPlan} student{transitionDash.missingPlan !== 1 ? "s" : ""} 14+ missing transition plan</span>}
              {transitionDash.incompletePlans > 0 && <span className="text-amber-600">{transitionDash.incompletePlans} incomplete plan{transitionDash.incompletePlans !== 1 ? "s" : ""}</span>}
              {transitionDash.approachingTransitionAge > 0 && <span className="text-gray-600">{transitionDash.approachingTransitionAge} approaching transition age</span>}
              {transitionDash.overdueFollowups > 0 && <span className="text-red-700 font-semibold">{transitionDash.overdueFollowups} overdue agency follow-up{transitionDash.overdueFollowups !== 1 ? "s" : ""}</span>}
            </div>
            <Link href="/transitions" className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap">
              Transition Planning →
            </Link>
          </CardContent>
        </Card>
      )}

      {meetingDash && (meetingDash.overdueCount > 0 || meetingDash.thisWeekCount > 0 || meetingDash.pendingConsentCount > 0) && (
        <Card className={meetingDash.overdueCount > 0 ? "border-red-200 bg-red-50/20" : "border-gray-200/60"}>
          <CardContent className="py-3 px-5 flex items-center gap-4 flex-wrap">
            <MeetingIcon className={`w-5 h-5 flex-shrink-0 ${meetingDash.overdueCount > 0 ? "text-red-500" : "text-emerald-500"}`} />
            <div className="flex-1 min-w-0 flex items-center gap-4 flex-wrap text-[12px]">
              {meetingDash.overdueCount > 0 && <span className="text-red-700 font-semibold">{meetingDash.overdueCount} overdue meeting{meetingDash.overdueCount !== 1 ? "s" : ""}</span>}
              {meetingDash.thisWeekCount > 0 && <span className="text-gray-700">{meetingDash.thisWeekCount} meeting{meetingDash.thisWeekCount !== 1 ? "s" : ""} this week</span>}
              {meetingDash.pendingConsentCount > 0 && <span className="text-amber-700">{meetingDash.pendingConsentCount} pending consent</span>}
            </div>
            <Link href="/iep-meetings" className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap">
              IEP Meetings →
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-4 border-gray-200/60">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-gray-600">Overall Compliance</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center py-6">
            {ro ? (
              <>
                <ProgressRing
                  value={onTrackPct}
                  size={140}
                  strokeWidth={12}
                  label={`${onTrackPct}%`}
                  sublabel="On Track"
                  color={onTrackPct >= 70 ? "#10b981" : onTrackPct >= 40 ? "#f59e0b" : "#ef4444"}
                />
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-6 w-full max-w-[240px]">
                  {riskPieData.map(d => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colorMap[d.name] }} />
                      <div>
                        <span className="text-xs text-gray-500">{d.name}</span>
                        <span className="text-xs font-bold text-gray-800 ml-1">{d.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <Skeleton className="w-[140px] h-[140px] rounded-full" />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-8 border-gray-200/60">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-gray-600">Session Delivery · Last 8 Weeks</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trendData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="weekLabel" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.04)" }}
                  />
                  <Bar dataKey="completedCount" name="Completed" fill="#059669" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="missedCount" name="Missed" fill="#fbbf24" radius={[4, 4, 0, 0]} barSize={20} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="w-full h-[220px]" />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-gray-200/60">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-gray-600">Compliance by Service</CardTitle>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            {serviceData.length > 0 ? serviceData.slice(0, 7).map((svc: any) => {
              const pct = svc.totalRequirements > 0 ? Math.round((svc.onTrack / svc.totalRequirements) * 100) : 0;
              const atRiskCount = svc.atRisk + svc.outOfCompliance;
              return (
                <div key={svc.serviceTypeName} className="space-y-1.5">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[13px] font-medium text-gray-800">{svc.serviceTypeName}</span>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-gray-400">{svc.onTrack}/{svc.totalRequirements} on track</span>
                      {atRiskCount > 0 && <span className="text-red-500 font-medium">{atRiskCount} at risk</span>}
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444",
                      }}
                    />
                  </div>
                </div>
              );
            }) : (
              <Skeleton className="w-full h-40" />
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-200/60">
          <CardHeader className="pb-0 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-600">Recent Alerts</CardTitle>
            <Link href="/alerts" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">View all</Link>
          </CardHeader>
          <CardContent className="pt-4 space-y-2">
            {recent.length > 0 ? recent.map((a: any) => (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50/60 hover:bg-gray-50 transition-colors">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                  a.severity === "critical" ? "bg-red-500" :
                  a.severity === "high" ? "bg-amber-400" : "bg-gray-300"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-800 truncate">{a.studentName ?? "System Alert"}</p>
                  <p className="text-[12px] text-gray-400 mt-0.5 line-clamp-1">{a.message}</p>
                </div>
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0 ${
                  a.severity === "critical" ? "bg-red-50 text-red-600" :
                  a.severity === "high" ? "bg-amber-50 text-amber-600" : "bg-gray-100 text-gray-500"
                }`}>{a.severity}</span>
              </div>
            )) : (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="w-full h-14" />)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {academics && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-emerald-600" />
              Academic Overview
            </h2>
            <Link href="/gradebook" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">View Gradebook</Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <MetricCard title="Total Classes" value={academics.totalClasses} icon={BookOpen} accent="emerald" subtitle="this semester" href="/classes" />
            <MetricCard title="Enrolled Students" value={academics.totalStudents} icon={Users} accent="emerald" subtitle="across all classes" />
            <MetricCard title="School Average" value={academics.schoolAverage ? `${academics.schoolAverage}%` : "–"} icon={TrendingUp} accent="emerald" />
            <MetricCard title="Failing Students" value={academics.failingStudents} icon={AlertTriangle} accent={academics.failingStudents > 0 ? "red" : "emerald"} subtitle="below 60%" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-gray-200/60">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm font-semibold text-gray-600">Grade Distribution</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={[
                    { grade: "A", count: academics.gradeDistribution.A, fill: "#10b981" },
                    { grade: "B", count: academics.gradeDistribution.B, fill: "#059669" },
                    { grade: "C", count: academics.gradeDistribution.C, fill: "#f59e0b" },
                    { grade: "D", count: academics.gradeDistribution.D, fill: "#f97316" },
                    { grade: "F", count: academics.gradeDistribution.F, fill: "#ef4444" },
                  ]} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="grade" tick={{ fontSize: 12, fill: "#6b7280", fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                    <Bar dataKey="count" name="Students" radius={[6, 6, 0, 0]} barSize={36}>
                      {[
                        { grade: "A", fill: "#10b981" },
                        { grade: "B", fill: "#059669" },
                        { grade: "C", fill: "#f59e0b" },
                        { grade: "D", fill: "#f97316" },
                        { grade: "F", fill: "#ef4444" },
                      ].map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-gray-200/60">
              <CardHeader className="pb-0 flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-600">Classes by Performance</CardTitle>
                <Link href="/classes" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">View all</Link>
              </CardHeader>
              <CardContent className="pt-4 space-y-2.5">
                {academics.classes?.slice(0, 6).map((cls: any) => {
                  const pct = cls.averageGrade || 0;
                  return (
                    <div key={cls.classId} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="text-[13px] font-medium text-gray-800 truncate">{cls.className}</span>
                          <span className={`text-[12px] font-bold ml-2 ${pct >= 80 ? "text-emerald-600" : pct >= 70 ? "text-amber-600" : pct >= 60 ? "text-amber-700" : "text-red-600"}`}>
                            {cls.letterGrade} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: pct >= 80 ? "#10b981" : pct >= 70 ? "#f59e0b" : pct >= 60 ? "#f97316" : "#ef4444" }}
                          />
                        </div>
                        {cls.failingCount > 0 && (
                          <span className="text-[10px] text-red-500 font-medium">{cls.failingCount} failing</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {isAdmin && s?.contractRenewals?.length > 0 && (
        <Card className="border-gray-200/60">
          <CardHeader className="pb-0 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-600">Contract Renewals</CardTitle>
            <Link href="/contract-utilization" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">View utilization</Link>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(s.contractRenewals || []).map((c: { id: number; agencyName: string; endDate: string }) => {
                const daysLeft = Math.ceil((new Date(c.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                const isCritical = daysLeft <= 7;
                return (
                  <div key={c.id} className={`flex items-start gap-3 p-3 rounded-lg border ${isCritical ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
                    <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isCritical ? "text-red-500" : "text-amber-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-800 truncate">{c.agencyName}</p>
                      <p className={`text-[11px] font-semibold mt-0.5 ${isCritical ? "text-red-600" : "text-amber-600"}`}>
                        {daysLeft <= 0 ? "Expires today" : `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {deadlines.length > 0 && (
        <Card className="border-gray-200/60">
          <CardHeader className="pb-0 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-600">Upcoming IEP Deadlines</CardTitle>
            <Link href="/compliance/timeline" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">View timeline</Link>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {deadlines.map((d: any, i: number) => {
                const days = d.daysUntilDue ?? d.daysRemaining ?? 0;
                const isOverdue = days < 0;
                const isUrgent = days >= 0 && days <= 14;
                return (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${isOverdue ? "bg-red-50 border-red-200" : isUrgent ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"}`}>
                    <CalendarDays className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isOverdue ? "text-red-500" : isUrgent ? "text-amber-500" : "text-gray-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-800 truncate">{d.studentName || "Student"}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {(d.eventType || "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                      </p>
                      <p className={`text-[11px] font-semibold mt-0.5 ${isOverdue ? "text-red-600" : isUrgent ? "text-amber-600" : "text-gray-500"}`}>
                        {isOverdue ? `${Math.abs(days)} days overdue` : `${days} days remaining`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
