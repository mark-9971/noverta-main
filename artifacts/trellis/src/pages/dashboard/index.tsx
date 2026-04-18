import {
  useGetDashboardSummary, useGetDashboardRiskOverview, useGetMissedSessionsTrend,
  useGetComplianceByService, useGetDashboardAlertsSummary, useListAlerts,
  useGetComplianceDeadlines,
} from "@workspace/api-client-react";
import { ErrorBanner } from "@/components/ui/error-banner";
import PilotAdminHome from "./PilotAdminHome";
import { TodayScheduleCard } from "@/components/dashboard/TodayScheduleCard";
import { useSchoolContext } from "@/lib/school-context";
import { useRole } from "@/lib/role-context";
import PilotOnboardingChecklist from "@/components/onboarding/PilotOnboardingChecklist";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { useMemo } from "react";
import { CASELOAD_ROLES, getGreeting, formatLastUpdated } from "./types";
import type { ProviderCaseloadSummary, DashboardSummaryExtended, RiskOverview, AlertsSummary } from "./types";
import type { Alert, ComplianceByService } from "@workspace/api-client-react";
import type { DashboardTabsProps } from "./DashboardTabs";
import { NeedsAttentionPanel, CriticalMedicalAlertsBanner, LifeThreateningAlertsBanner } from "./AlertBanners";
import { DashboardTabs } from "./DashboardTabs";
import RecentWins from "@/components/dashboard/RecentWins";

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

  const { data: evalDash } = useQuery<DashboardTabsProps["evalDash"]>({
    queryKey: ["evaluations-dashboard"],
    queryFn: () => authFetch("/api/evaluations/dashboard").then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
  });
  const { data: transitionDash } = useQuery<DashboardTabsProps["transitionDash"]>({
    queryKey: ["transitions-dashboard"],
    queryFn: () => authFetch("/api/transitions/dashboard").then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
  });
  const { data: meetingDash } = useQuery<DashboardTabsProps["meetingDash"]>({
    queryKey: ["meetings-dashboard"],
    queryFn: () => authFetch("/api/iep-meetings/dashboard").then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
  });
  const { data: accommodationCompliance } = useQuery<DashboardTabsProps["accommodationCompliance"]>({
    queryKey: ["accommodation-compliance-dash"],
    queryFn: () => authFetch("/api/accommodation-compliance?windowDays=30").then(r => r.ok ? r.json() : null),
    staleTime: 120_000,
  });

  const deadlines: DashboardTabsProps["deadlines"] = (() => {
    type RawEvent = { student?: { firstName: string; lastName: string }; eventType: string; daysRemaining?: number };
    const raw = deadlinesRaw as { events?: RawEvent[] } | RawEvent[] | undefined;
    const items: RawEvent[] = Array.isArray(raw) ? raw : (raw?.events ?? []);
    return items.slice(0, 6).map(e => ({
      studentName: e.student ? `${e.student.firstName} ${e.student.lastName}` : "Student",
      eventType: e.eventType,
      daysUntilDue: e.daysRemaining,
    }));
  })();

  const s = summary as DashboardSummaryExtended | null;
  const ro = riskOverview as RiskOverview | null;
  const alerts = alertsSummary as AlertsSummary | null;
  const recent: Alert[] = ((recentAlerts as Alert[] | undefined)?.slice(0, 5)) ?? [];

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

  const trendData = ((trend as { weekLabel?: string; completedCount?: number; missedCount?: number }[] | undefined)
    ?.slice(-8)
    .map(t => ({ ...t, weekLabel: t.weekLabel?.replace("Week of ", "") }))) ?? [];

  const serviceData: ComplianceByService[] = (complianceByService as ComplianceByService[] | undefined) ?? [];

  const iepYear = new Date().getMonth() >= 6
    ? `${new Date().getFullYear()}–${new Date().getFullYear() + 1}`
    : `${new Date().getFullYear() - 1}–${new Date().getFullYear()}`;

  if (summaryError) return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <ErrorBanner message="Failed to load dashboard data. The server may be unavailable." onRetry={() => refetchSummary()} />
    </div>
  );

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 md:space-y-5">
      {/* Page header */}
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

      {/* Persistent above-tab elements: onboarding checklist + alert banners */}
      {isAdmin && <PilotOnboardingChecklist variant="compact" defaultExpanded={false} />}
      <LifeThreateningAlertsBanner />
      <CriticalMedicalAlertsBanner />
      <NeedsAttentionPanel />

      {!isAdmin && <RecentWins days={30} />}

      {/* Today's Schedule — shown for providers with a linked staff record */}
      {showPersonalCaseload && <TodayScheduleCard />}

      {/* Three-tab layout */}
      <DashboardTabs
        isAdmin={isAdmin}
        myCaseload={myCaseload}
        hasTrackedData={hasTrackedData}
        onTrackPct={onTrackPct}
        complianceSubtitle={complianceSubtitle}
        s={s}
        ro={ro}
        alerts={alerts}
        recent={recent}
        riskPieData={riskPieData}
        trendData={trendData}
        serviceData={serviceData}
        evalDash={evalDash}
        transitionDash={transitionDash}
        meetingDash={meetingDash}
        accommodationCompliance={accommodationCompliance}
        deadlines={deadlines}
      />
    </div>
  );
}
