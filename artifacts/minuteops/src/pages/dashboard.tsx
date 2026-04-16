import {
  useGetDashboardSummary, useGetDashboardRiskOverview, useGetMissedSessionsTrend,
  useGetComplianceByService, useGetDashboardAlertsSummary, useListAlerts,
  useGetComplianceDeadlines,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ProgressRing } from "@/components/ui/progress-ring";
import { AlertTriangle, Users, Clock, Bell, CalendarDays, ShieldAlert, ChevronDown, CheckCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Link } from "wouter";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useSchoolContext } from "@/lib/school-context";
import { useRole } from "@/lib/role-context";
import { SetupChecklist } from "@/components/onboarding/SetupChecklist";
import { FileSearch, Sprout, CalendarDays as MeetingIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { useMemo, useState } from "react";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function CollapsibleSection({ title, icon: Icon, children, defaultOpen = false }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full text-left py-2 group"
      >
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-semibold text-gray-600 flex-1">{title}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="space-y-4 mt-1">{children}</div>}
    </div>
  );
}

interface NeedsAttentionData {
  total: number;
  openIncidents: number;
  unresolvedAlerts: number;
  overdueActionItems: number;
  pendingNotifications: number;
}

interface ProviderCaseloadSummary {
  staffId: number;
  staffName: string;
  role: string;
  assignedStudents: number;
  totalRequiredMinutes: number;
  totalDeliveredMinutes: number;
  studentsAtRisk: number;
  openAlerts: number;
  utilizationPercent: number;
}

const CASELOAD_ROLES = new Set(["case_manager", "provider", "bcba", "sped_teacher"]);

function NeedsAttentionPanel() {
  const { data } = useQuery<NeedsAttentionData>({
    queryKey: ["dashboard-needs-attention"],
    queryFn: () => authFetch("/api/dashboard/needs-attention").then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
  });

  if (!data || data.total === 0) return null;

  const items = [
    { label: "Open incidents", count: data.openIncidents, href: "/protective-measures?status=open", critical: true },
    { label: "Unresolved compliance alerts", count: data.unresolvedAlerts, href: "/compliance?filter=unresolved#timeline", critical: false },
    { label: "Overdue action items", count: data.overdueActionItems, href: "/iep-meetings?filter=overdue", critical: false },
    { label: "Notifications awaiting send", count: data.pendingNotifications, href: "/protective-measures?status=notification_pending", critical: false },
  ].filter(i => i.count > 0);

  return (
    <Card className="border-amber-200 bg-amber-50/20">
      <CardContent className="py-3 px-5">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-shrink-0">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            <span className="text-sm font-semibold text-amber-800">Needs Attention</span>
            <span className="text-xs font-bold rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">{data.total}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
            {items.map(item => (
              <Link key={item.label} href={item.href}>
                <span className={`text-[12px] font-medium px-2.5 py-1 rounded-full cursor-pointer hover:opacity-80 transition-opacity ${item.critical ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                  <span className="font-bold">{item.count}</span> {item.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CriticalMedicalAlertsBanner() {
  const { data } = useQuery<any[]>({
    queryKey: ["dashboard-critical-medical-alerts"],
    queryFn: () => authFetch("/api/dashboard/critical-medical-alerts").then(r => r.ok ? r.json() : []),
    staleTime: 120_000,
  });

  if (!data || data.length === 0) return null;

  const lifeThreatening = data.filter((a: any) => a.severity === "life_threatening");
  const severe = data.filter((a: any) => a.severity === "severe");

  return (
    <Card className="border-red-200 bg-red-50/30">
      <CardContent className="py-3 px-5">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <span className="text-sm font-semibold text-red-800">Critical Medical Alerts</span>
          <span className="text-xs font-bold rounded-full px-2 py-0.5 bg-red-100 text-red-700">{data.length}</span>
        </div>
        <div className="space-y-1 ml-7">
          {lifeThreatening.map((a: any) => (
            <Link key={a.id} href={`/students/${a.studentId}`}>
              <div className="flex items-center gap-2 text-[11px] cursor-pointer hover:bg-red-50 rounded px-1 py-0.5 -mx-1">
                <span className="font-bold text-red-700">LIFE-THREATENING</span>
                <span className="text-gray-400">&middot;</span>
                <span className="text-gray-700">{a.studentFirst} {a.studentLast} (Gr. {a.studentGrade})</span>
                <span className="text-gray-400">&middot;</span>
                <span className="text-gray-600">{a.alertType}: {a.description}</span>
                {a.epiPenOnFile && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">EpiPen on file</span>}
              </div>
            </Link>
          ))}
          {severe.map((a: any) => (
            <Link key={a.id} href={`/students/${a.studentId}`}>
              <div className="flex items-center gap-2 text-[11px] cursor-pointer hover:bg-red-50 rounded px-1 py-0.5 -mx-1">
                <span className="font-semibold text-orange-600">Severe</span>
                <span className="text-gray-400">&middot;</span>
                <span className="text-gray-700">{a.studentFirst} {a.studentLast}</span>
                <span className="text-gray-400">&middot;</span>
                <span className="text-gray-600">{a.alertType}: {a.description}</span>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

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
  const { role, user, teacherId } = useRole();
  const isAdmin = role === "admin" || role === "coordinator";
  const firstName = user.name?.split(" ")[0] || "";
  const { filterParams, typedFilter } = useSchoolContext();
  const { data: summary, isError: summaryError, refetch: refetchSummary } = useGetDashboardSummary(typedFilter);
  const { data: riskOverview } = useGetDashboardRiskOverview(typedFilter);
  const { data: trend } = useGetMissedSessionsTrend(typedFilter);
  const { data: complianceByService } = useGetComplianceByService(typedFilter);
  const { data: alertsSummary } = useGetDashboardAlertsSummary(typedFilter);
  const { data: recentAlerts } = useListAlerts({ resolved: "false", ...filterParams } as any);
  const { data: deadlinesRaw } = useGetComplianceDeadlines();

  const showPersonalCaseload = CASELOAD_ROLES.has(role) && !!teacherId;
  const { data: providerSummaryAll } = useQuery<ProviderCaseloadSummary[]>({
    queryKey: ["provider-summary", filterParams],
    queryFn: () => authFetch(`/api/dashboard/provider-summary?${new URLSearchParams(filterParams).toString()}`).then(r => r.ok ? r.json() : []),
    staleTime: 60_000,
    enabled: showPersonalCaseload,
  });
  const myCaseload = useMemo((): ProviderCaseloadSummary | null => {
    if (!showPersonalCaseload || !providerSummaryAll || !teacherId) return null;
    return providerSummaryAll.find((p) => p.staffId === teacherId) ?? null;
  }, [showPersonalCaseload, providerSummaryAll, teacherId]);

  const { data: evalDash } = useQuery({
    queryKey: ["evaluations-dashboard"],
    queryFn: () => authFetch("/api/evaluations/dashboard").then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
  });
  const { data: transitionDash } = useQuery({
    queryKey: ["transitions-dashboard"],
    queryFn: () => authFetch("/api/transitions/dashboard").then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
  });
  const { data: meetingDash } = useQuery({
    queryKey: ["meetings-dashboard"],
    queryFn: () => authFetch("/api/iep-meetings/dashboard").then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
  });

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
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
            {getGreeting()}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-xs md:text-sm text-gray-400 mt-1 hidden sm:block">
            {isAdmin ? "District overview" : "Your caseload"} · IEP Year 2025–2026
          </p>
        </div>
      </div>

      {isAdmin && <SetupChecklist />}

      <CriticalMedicalAlertsBanner />
      <NeedsAttentionPanel />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <MetricCard
          title={myCaseload ? "Your Caseload" : "Active Students"}
          value={myCaseload ? myCaseload.assignedStudents : s?.totalActiveStudents}
          icon={Users}
          accent="emerald"
          subtitle={myCaseload ? "students assigned" : "on IEPs"}
          href="/students"
        />
        <MetricCard
          title={myCaseload ? "Sessions Delivered" : "Open Alerts"}
          value={myCaseload ? `${myCaseload.totalDeliveredMinutes} min` : alerts?.total}
          icon={myCaseload ? Clock : Bell}
          accent={myCaseload ? "emerald" : "red"}
          subtitle={myCaseload ? `of ${myCaseload.totalRequiredMinutes} required` : `${alerts?.critical ?? 0} critical`}
          href={myCaseload ? "/sessions" : "/alerts"}
        />
        <MetricCard
          title={myCaseload ? "Compliance" : "Makeup Needed"}
          value={myCaseload ? `${myCaseload.utilizationPercent}%` : s?.openMakeupObligations}
          icon={myCaseload ? CheckCircle : Clock}
          accent={myCaseload ? (myCaseload.utilizationPercent >= 80 ? "emerald" : "amber") : "amber"}
          subtitle={myCaseload ? "of your students" : (s?.uncoveredBlocksToday > 0 ? `sessions · ${s.uncoveredBlocksToday} uncovered today` : "sessions")}
          href={myCaseload ? "/compliance" : "/sessions"}
        />
        <MetricCard
          title={myCaseload ? "At Risk" : "Out of Compliance"}
          value={myCaseload ? myCaseload.studentsAtRisk : s?.outOfComplianceStudents}
          icon={AlertTriangle}
          accent="red"
          subtitle={myCaseload ? "your students" : "students"}
          href="/compliance"
        />
      </div>

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

      <CollapsibleSection title="Evaluations & Transitions" icon={FileSearch}>
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

        {(evalDash && !(evalDash.overdueEvaluations > 0 || evalDash.overdueReEvaluations > 0 || evalDash.openReferrals > 0))
          && (transitionDash && !(transitionDash.missingPlan > 0 || transitionDash.approachingTransitionAge > 0 || transitionDash.overdueFollowups > 0))
          && (
          <p className="text-sm text-gray-400 py-4 text-center">All evaluations and transitions are on track.</p>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="IEP Meetings" icon={MeetingIcon}>
        {meetingDash && (meetingDash.overdueCount > 0 || meetingDash.thisWeekCount > 0 || meetingDash.pendingConsentCount > 0) ? (
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
        ) : (
          <p className="text-sm text-gray-400 py-4 text-center">No upcoming meetings to report.</p>
        )}
      </CollapsibleSection>

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

      <CollapsibleSection title="Upcoming IEP Deadlines" icon={CalendarDays}>
        {deadlines.length > 0 ? (
          <Card className="border-gray-200/60">
            <CardHeader className="pb-0 flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-600">Next {deadlines.length} deadlines</CardTitle>
              <Link href="/compliance#timeline" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">View timeline</Link>
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
        ) : (
          <p className="text-sm text-gray-400 py-4 text-center">No upcoming deadlines.</p>
        )}
      </CollapsibleSection>
    </div>
  );
}
