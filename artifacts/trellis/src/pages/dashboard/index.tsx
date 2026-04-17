import {
  useGetDashboardSummary, useGetDashboardRiskOverview, useGetMissedSessionsTrend,
  useGetComplianceByService, useGetDashboardAlertsSummary, useListAlerts,
  useGetComplianceDeadlines,
} from "@workspace/api-client-react";
import { AlertTriangle, Users, Clock, Bell, CalendarDays, CheckCircle, Shield, Clipboard, FileText } from "lucide-react";
import { Link } from "wouter";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useSchoolContext } from "@/lib/school-context";
import { useRole } from "@/lib/role-context";
import { SetupChecklist } from "@/components/onboarding/SetupChecklist";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { useMemo } from "react";
import { CASELOAD_ROLES, getGreeting } from "./types";
import type { ProviderCaseloadSummary } from "./types";
import { NeedsAttentionPanel, CriticalMedicalAlertsBanner } from "./AlertBanners";
import { MetricCard } from "./MetricCard";
import { ComplianceRingCard, SessionTrendCard, ComplianceByServiceCard, RecentAlertsCard } from "./ChartsSection";
import { AccommodationComplianceCard, EvalsTransitionsSection, MeetingsSection, ContractRenewalsCard, DeadlinesSection } from "./SecondarySections";

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
  const { data: accommodationCompliance } = useQuery<{ totalStudents: number; overallComplianceRate: number; students: { overdueCount: number }[] }>({
    queryKey: ["accommodation-compliance-dash"],
    queryFn: () => authFetch("/api/accommodation-compliance?windowDays=30").then(r => r.ok ? r.json() : null),
    staleTime: 120_000,
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
  const trackedStudents = s?.trackedStudents ?? totalStudents;
  const onTrack = s?.onTrackStudents ?? 0;
  const onTrackPct = trackedStudents > 0 ? Math.round((onTrack / trackedStudents) * 100) : 0;

  const riskPieData = ro ? [
    { name: "On Track", value: ro.onTrack },
    { name: "Slightly Behind", value: ro.slightlyBehind },
    { name: "At Risk", value: ro.atRisk },
    { name: "Out of Compliance", value: ro.outOfCompliance },
  ].filter(d => d.value > 0) : [];

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

  const quickActions = [
    { label: "Log Session", icon: Clipboard, href: "/sessions", color: "text-emerald-600 bg-emerald-50 hover:bg-emerald-100" },
    { label: "Student Lookup", icon: Users, href: "/students", color: "text-blue-600 bg-blue-50 hover:bg-blue-100" },
    { label: "Compliance", icon: Shield, href: "/compliance", color: "text-amber-600 bg-amber-50 hover:bg-amber-100" },
    { label: "Accommodations", icon: CheckCircle, href: "/accommodation-lookup", color: "text-purple-600 bg-purple-50 hover:bg-purple-100" },
    { label: "Progress Reports", icon: FileText, href: "/progress-reports", color: "text-cyan-600 bg-cyan-50 hover:bg-cyan-100" },
    { label: "IEP Meetings", icon: CalendarDays, href: "/iep-meetings", color: "text-indigo-600 bg-indigo-50 hover:bg-indigo-100" },
  ];

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

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {quickActions.map(action => (
          <Link key={action.href} href={action.href}>
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-medium cursor-pointer transition-colors ${action.color}`}>
              <action.icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{action.label}</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <ComplianceRingCard ro={ro} riskPieData={riskPieData} onTrackPct={onTrackPct} />
        <SessionTrendCard trendData={trendData} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ComplianceByServiceCard serviceData={serviceData} />
        <RecentAlertsCard recent={recent} />
      </div>

      {accommodationCompliance && <AccommodationComplianceCard accommodationCompliance={accommodationCompliance} />}

      <EvalsTransitionsSection evalDash={evalDash} transitionDash={transitionDash} />
      <MeetingsSection meetingDash={meetingDash} />

      {isAdmin && s?.contractRenewals?.length > 0 && <ContractRenewalsCard contractRenewals={s.contractRenewals} />}

      <DeadlinesSection deadlines={deadlines} />
    </div>
  );
}
