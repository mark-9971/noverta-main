import {
  useGetDashboardSummary, useGetDashboardRiskOverview, useGetMissedSessionsTrend,
  useGetComplianceByService, useGetDashboardAlertsSummary,
  useGetComplianceDeadlines,
} from "@workspace/api-client-react";
import { AlertTriangle, Users, Clock, Bell, CheckCircle, Shield } from "lucide-react";
import { Link } from "wouter";
import { ErrorBanner } from "@/components/ui/error-banner";
import PilotAdminHome from "./PilotAdminHome";
import { useSchoolContext } from "@/lib/school-context";
import { useRole } from "@/lib/role-context";
import PilotOnboardingChecklist from "@/components/onboarding/PilotOnboardingChecklist";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { useMemo, useState } from "react";
import { CASELOAD_ROLES, getGreeting, formatLastUpdated } from "./types";
import type { ProviderCaseloadSummary } from "./types";
import { NeedsAttentionPanel, CriticalMedicalAlertsBanner, LifeThreateningAlertsBanner } from "./AlertBanners";
import { MetricCard } from "./MetricCard";
import { ComplianceRingCard, SessionTrendCard, ComplianceByServiceCard } from "./ChartsSection";
import { AccommodationComplianceCard, EvalsTransitionsSection, MeetingsSection, ContractRenewalsCard, DeadlinesSection } from "./SecondarySections";
import { CollapsibleSection } from "./CollapsibleSection";
import CostRiskPanel from "@/components/dashboard/CostRiskPanel";
import SystemStatusBanner from "@/components/dashboard/SystemStatusBanner";

export default function Dashboard() {
  const { role } = useRole();
  const isAdmin = role === "admin" || role === "coordinator";
  if (isAdmin) return <PilotAdminHome />;
  return <DashboardFull />;
}

function DashboardFull() {
  const { role, user, teacherId } = useRole();
  const isAdmin = role === "admin" || role === "coordinator";
  const firstName = user.name?.split(" ")[0] || "";
  const { filterParams, typedFilter } = useSchoolContext();

  // ── Core queries — fire on mount ────────────────────────────────────────────
  const {
    data: summary,
    isError: summaryError,
    refetch: refetchSummary,
    dataUpdatedAt: summaryUpdatedAt,
  } = useGetDashboardSummary(typedFilter);
  const { data: riskOverview } = useGetDashboardRiskOverview(typedFilter);
  const { data: trend } = useGetMissedSessionsTrend(typedFilter);
  const { data: complianceByService } = useGetComplianceByService(typedFilter);
  const { data: alertsSummary } = useGetDashboardAlertsSummary(typedFilter);

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

  // ── Deferred queries — fire only when "Operational details" is first opened ─
  const [opsEnabled, setOpsEnabled] = useState(false);

  const { data: evalDash } = useQuery({
    queryKey: ["evaluations-dashboard"],
    queryFn: () => authFetch("/api/evaluations/dashboard").then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
    enabled: opsEnabled,
  });
  const { data: transitionDash } = useQuery({
    queryKey: ["transitions-dashboard"],
    queryFn: () => authFetch("/api/transitions/dashboard").then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
    enabled: opsEnabled,
  });
  const { data: meetingDash } = useQuery({
    queryKey: ["meetings-dashboard"],
    queryFn: () => authFetch("/api/iep-meetings/dashboard").then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
    enabled: opsEnabled,
  });
  const { data: accommodationCompliance } = useQuery<{ totalStudents: number; overallComplianceRate: number; students: { overdueCount: number }[] }>({
    queryKey: ["accommodation-compliance-dash"],
    queryFn: () => authFetch("/api/accommodation-compliance?windowDays=30").then(r => r.ok ? r.json() : null),
    staleTime: 120_000,
    enabled: opsEnabled,
  });
  const { data: deadlinesRaw } = useGetComplianceDeadlines({ enabled: opsEnabled } as any);

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

  const totalStudents = s?.totalActiveStudents ?? 0;
  const trackedStudents = s?.trackedStudents ?? totalStudents;
  const onTrack = s?.onTrackStudents ?? 0;
  const noDataStudents = s?.noDataStudents ?? 0;
  const studentsNeedingSetup = s?.studentsNeedingSetup ?? 0;
  const hasTrackedData = trackedStudents > 0;
  const onTrackPct = hasTrackedData ? Math.round((onTrack / trackedStudents) * 100) : 0;
  const complianceSubtitle = hasTrackedData
    ? `${onTrack} of ${trackedStudents} on track${noDataStudents > 0 ? ` · ${noDataStudents} not started` : ""}`
    : (studentsNeedingSetup > 0
        ? `${studentsNeedingSetup} students need service requirements`
        : (totalStudents > 0 ? "No service requirements yet" : "No active students yet"));

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

  const iepYear = new Date().getMonth() >= 6
    ? `${new Date().getFullYear()}–${new Date().getFullYear() + 1}`
    : `${new Date().getFullYear() - 1}–${new Date().getFullYear()}`;

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
            {isAdmin ? "District overview" : "Your caseload"} · IEP Year {iepYear}
            {summaryUpdatedAt > 0 && (
              <span className="ml-2 text-[10px] text-gray-300">· as of {formatLastUpdated(summaryUpdatedAt)}</span>
            )}
          </p>
        </div>
      </div>

      {isAdmin && <PilotOnboardingChecklist variant="compact" defaultExpanded={false} />}

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

      <LifeThreateningAlertsBanner />
      <CriticalMedicalAlertsBanner />
      <NeedsAttentionPanel />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <MetricCard
          title={myCaseload ? "Your Caseload" : "Compliance Rate"}
          value={myCaseload ? myCaseload.assignedStudents : (hasTrackedData ? `${onTrackPct}%` : "—")}
          icon={myCaseload ? Users : Shield}
          accent={myCaseload
            ? "emerald"
            : (!hasTrackedData
              ? "amber"
              : (onTrackPct >= 95 ? "emerald" : onTrackPct >= 85 ? "amber" : "red"))}
          subtitle={myCaseload ? "students assigned" : complianceSubtitle}
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


      {isAdmin && s && (
        <SystemStatusBanner errorsLast24h={s?.errorsLast24h ?? 0} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <ComplianceRingCard ro={ro} riskPieData={riskPieData} onTrackPct={onTrackPct} />
        <SessionTrendCard trendData={trendData} />
      </div>

      <ComplianceByServiceCard serviceData={serviceData} />

      {/*
        Operational details — accommodations, evaluations, transitions, IEP
        meetings, agency contract renewals, IEP deadlines. Collapsed by default
        so they don't compete with the compliance story. Queries for this section
        are deferred until the section is first opened (onFirstOpen callback).
      */}
      <CollapsibleSection
        title="Operational details"
        icon={ListChecks}
        defaultOpen={false}
        onFirstOpen={() => setOpsEnabled(true)}
      >
        {accommodationCompliance && <AccommodationComplianceCard accommodationCompliance={accommodationCompliance} />}
        <EvalsTransitionsSection evalDash={evalDash} transitionDash={transitionDash} />
        <MeetingsSection meetingDash={meetingDash} />
        {isAdmin && s?.contractRenewals?.length > 0 && <ContractRenewalsCard contractRenewals={s.contractRenewals} />}
        <DeadlinesSection deadlines={deadlines} />
      </CollapsibleSection>
    </div>
  );
}
