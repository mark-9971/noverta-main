import {
  useGetDashboardSummary, useGetDashboardRiskOverview, useGetMissedSessionsTrend,
  useGetComplianceByService, useGetDashboardAlertsSummary, useListAlerts,
  useGetComplianceDeadlines,
} from "@workspace/api-client-react";
import { AlertTriangle, Users, Clock, Bell, CheckCircle, Shield, Clipboard, ArrowRight, FileBarChart, DollarSign, ListChecks } from "lucide-react";
import { Link, useLocation } from "wouter";
import { ErrorBanner } from "@/components/ui/error-banner";
import PilotAdminHome from "./PilotAdminHome";
import { useSchoolContext } from "@/lib/school-context";
import { useRole } from "@/lib/role-context";
import PilotOnboardingChecklist from "@/components/onboarding/PilotOnboardingChecklist";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { useMemo } from "react";
import { CASELOAD_ROLES, getGreeting } from "./types";
import type { ProviderCaseloadSummary } from "./types";
import { NeedsAttentionPanel, CriticalMedicalAlertsBanner } from "./AlertBanners";
import { MetricCard } from "./MetricCard";
import { ComplianceRingCard, SessionTrendCard, ComplianceByServiceCard, RecentAlertsCard } from "./ChartsSection";
import { AccommodationComplianceCard, EvalsTransitionsSection, MeetingsSection, ContractRenewalsCard, DeadlinesSection } from "./SecondarySections";
import { CollapsibleSection } from "./CollapsibleSection";
import CostRiskPanel from "@/components/dashboard/CostRiskPanel";

export default function Dashboard() {
  const { role } = useRole();
  const isAdmin = role === "admin" || role === "coordinator";
  const [, navigate] = useLocation();
  const fullView = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "full";

  if (isAdmin && !fullView) {
    return <PilotAdminHome onShowFull={() => navigate("/?view=full")} />;
  }
  return <DashboardFull />;
}

function DashboardFull() {
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

  // Quick actions are wedge-aligned: every primary tile points at a piece of
  // the compliance-risk story. "Log Session" stays as the daily caseload entry
  // point but is intentionally last so it doesn't outshine the wedge.
  const quickActions = [
    { label: "Compliance Risk Report", icon: AlertTriangle, href: "/compliance-risk-report", color: "text-red-700 bg-red-50 hover:bg-red-100" },
    { label: "Required vs Delivered", icon: Shield, href: "/compliance", color: "text-emerald-700 bg-emerald-50 hover:bg-emerald-100" },
    { label: "High-Risk Students", icon: Users, href: "/compliance-risk-report#needs-attention", color: "text-amber-700 bg-amber-50 hover:bg-amber-100" },
    { label: "Weekly Summary", icon: FileBarChart, href: "/weekly-compliance-summary", color: "text-blue-700 bg-blue-50 hover:bg-blue-100" },
    { label: "Compensatory Exposure", icon: DollarSign, href: "/compensatory-finance", color: "text-rose-700 bg-rose-50 hover:bg-rose-100" },
    { label: "Log Session", icon: Clipboard, href: "/sessions", color: "text-gray-700 bg-gray-50 hover:bg-gray-100" },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6 md:space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
            {getGreeting()}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-xs md:text-sm text-gray-400 mt-1 hidden sm:block">
            {isAdmin ? "District overview" : "Your caseload"} · IEP Year {new Date().getMonth() >= 6 ? `${new Date().getFullYear()}–${new Date().getFullYear() + 1}` : `${new Date().getFullYear() - 1}–${new Date().getFullYear()}`}
          </p>
        </div>
      </div>

      {/* Unified first-run checklist (replaces the legacy SetupChecklist).
          Single canonical 8-step tracker, hidden once the district is
          pilot-ready. Full first-run path lives at /onboarding. */}
      {isAdmin && <PilotOnboardingChecklist variant="compact" defaultExpanded={false} />}

      {/*
        Wedge banner: even on the "full operational" view, an admin's first
        eye-line is the Compliance Risk Report. Required-vs-delivered, high-
        risk students, and compensatory exposure all live there — pull the
        admin straight to it instead of letting them wander into secondary
        modules.
      */}
      {isAdmin && (
        <Link href="/compliance-risk-report">
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-white p-4 md:p-5 hover:shadow-sm transition-shadow cursor-pointer flex items-center gap-4 group" data-testid="banner-risk-report">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm md:text-[15px] font-semibold text-gray-900">Open the Compliance Risk Report</div>
              <div className="text-xs md:text-sm text-gray-500 mt-0.5">
                Required vs delivered minutes, high-risk students, compensatory exposure, and the next best actions — in one place.
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-emerald-700 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
          </div>
        </Link>
      )}

      {isAdmin && <CostRiskPanel />}

      <CriticalMedicalAlertsBanner />
      <NeedsAttentionPanel />

      {/*
        Top-line metrics are wedge-aligned for admins (overall compliance,
        high-risk students, compensatory exposure, urgent makeups). Caseload
        users see their personal counterparts.
      */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <MetricCard
          title={myCaseload ? "Your Caseload" : "Compliance Rate"}
          value={myCaseload ? myCaseload.assignedStudents : (trackedStudents > 0 ? `${onTrackPct}%` : "—")}
          icon={myCaseload ? Users : Shield}
          accent={myCaseload ? "emerald" : (onTrackPct >= 95 ? "emerald" : onTrackPct >= 85 ? "amber" : "red")}
          subtitle={myCaseload ? "students assigned" : `${onTrack} of ${trackedStudents} on track`}
          href={myCaseload ? "/students" : "/compliance"}
        />
        <MetricCard
          title={myCaseload ? "Sessions Delivered" : "High-Risk Students"}
          value={myCaseload ? `${myCaseload.totalDeliveredMinutes} min` : ((s?.outOfComplianceStudents ?? 0) + (ro?.atRisk ?? 0))}
          icon={myCaseload ? Clock : AlertTriangle}
          accent={myCaseload ? "emerald" : "red"}
          subtitle={myCaseload ? `of ${myCaseload.totalRequiredMinutes} required` : `${s?.outOfComplianceStudents ?? 0} out · ${ro?.atRisk ?? 0} at risk`}
          href={myCaseload ? "/sessions" : "/compliance-risk-report"}
        />
        <MetricCard
          title={myCaseload ? "Compliance" : "Urgent Actions"}
          value={myCaseload ? `${myCaseload.utilizationPercent}%` : ((alerts?.critical ?? 0) + (s?.openMakeupObligations ?? 0))}
          icon={myCaseload ? CheckCircle : Bell}
          accent={myCaseload ? (myCaseload.utilizationPercent >= 80 ? "emerald" : "amber") : "amber"}
          subtitle={myCaseload ? "of your students" : `${alerts?.critical ?? 0} critical · ${s?.openMakeupObligations ?? 0} makeups`}
          href={myCaseload ? "/compliance" : "/alerts"}
        />
        <MetricCard
          title={myCaseload ? "At Risk" : "Compensatory Exposure"}
          value={myCaseload ? myCaseload.studentsAtRisk : ((s?.totalShortfallMinutes ?? 0) > 0 ? `${(s.totalShortfallMinutes as number).toLocaleString()} min` : "0 min")}
          icon={myCaseload ? AlertTriangle : DollarSign}
          accent="red"
          subtitle={myCaseload ? "your students" : "shortfall behind required"}
          href={myCaseload ? "/compliance" : "/compliance-risk-report"}
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

      {/*
        Operational details — accommodations, evaluations, transitions, IEP
        meetings, agency contract renewals, IEP deadlines — are real but not
        the wedge. They live behind a single collapsed section so they don't
        compete with the compliance story for the admin's attention.
      */}
      <CollapsibleSection title="Operational details" icon={ListChecks} defaultOpen={false}>
        {accommodationCompliance && <AccommodationComplianceCard accommodationCompliance={accommodationCompliance} />}
        <EvalsTransitionsSection evalDash={evalDash} transitionDash={transitionDash} />
        <MeetingsSection meetingDash={meetingDash} />
        {isAdmin && s?.contractRenewals?.length > 0 && <ContractRenewalsCard contractRenewals={s.contractRenewals} />}
        <DeadlinesSection deadlines={deadlines} />
      </CollapsibleSection>
    </div>
  );
}
