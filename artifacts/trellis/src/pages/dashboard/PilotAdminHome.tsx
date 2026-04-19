import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useMemo, useState, useEffect } from "react";
import {
  AlertTriangle, ArrowRight, CheckCircle2, ShieldCheck,
  Users, ListChecks,
  TrendingUp, TrendingDown, Minus, Compass, FileBarChart, Clock, RefreshCw, Loader2,
} from "lucide-react";
import { startShowcaseTour } from "@/components/ShowcaseTour";
import { useGetComplianceDeadlines } from "@workspace/api-client-react";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";
import { useSchoolContext } from "@/lib/school-context";
import PilotOnboardingChecklist from "@/components/onboarding/PilotOnboardingChecklist";
import CostRiskPanel from "@/components/dashboard/CostRiskPanel";
import PilotBaselinePanels from "@/components/dashboard/PilotBaselinePanels";
import PilotReadinessPanel from "@/components/dashboard/PilotReadinessPanel";
import SchoolComplianceBreakdown from "@/components/dashboard/SchoolComplianceBreakdown";
import ProviderDelivery from "@/components/dashboard/ProviderDelivery";
import SystemStatusBanner from "@/components/dashboard/SystemStatusBanner";
import { LifeThreateningAlertsBanner } from "./AlertBanners";
import { CollapsibleSection } from "./CollapsibleSection";
import {
  AccommodationComplianceCard, EvalsTransitionsSection,
  MeetingsSection, ContractRenewalsCard, DeadlinesSection,
  IepExpirationCard,
  CredentialExpirationCard,
} from "./SecondarySections";
import type { CredentialExpirationItem } from "./SecondarySections";
import ProviderCompletionCard from "./ProviderCompletionCard";
import ComplianceRiskAlertsWidget from "@/components/dashboard/ComplianceRiskAlertsWidget";
import { getGreeting, formatLastUpdated } from "./types";
import { computeHealthScore, type HealthScore } from "@/lib/health-score";

interface HealthScoreTrend {
  available: boolean;
  current?: { numeric: number; grade: string; snapshotDate: string };
  priorWeek?: { numeric: number; grade: string; snapshotDate: string };
  deltaPts?: number | null;
  sparkline?: { snapshotDate: string; numeric: number; grade: string }[];
}

interface SchoolHealthRow {
  schoolId: number | null;
  schoolName: string;
  totalStudents: number;
  complianceRate: number;
  exposurePerStudent: number;
  providerLoggingRate: number;
}

interface ComplianceRiskReport {
  meta: { districtName: string; reportPeriod: string; generatedAt?: string };
  summary: {
    totalStudents: number;
    totalServiceRequirements: number;
    totalDeliveredMinutes: number;
    overallComplianceRate: number;
    combinedExposure: number;
    studentsOutOfCompliance: number;
    studentsAtRisk: number;
    studentsOnTrack: number;
    totalShortfallMinutes: number;
    paceShortfall: number;
    paceAheadBy: number;
    paceComplianceRate: number;
    totalExpectedByNow: number;
  };
  needsAttention: {
    studentId: number;
    studentName: string;
    school: string;
    grade: string;
    service: string;
    shortfallMinutes: number;
    percentComplete: number;
    riskStatus: string;
    riskLabel: string;
    estimatedExposure: number | null;
    providerName: string;
  }[];
}

interface OnboardingStatus {
  isComplete: boolean;
  pilotChecklist?: { isComplete: boolean; completedCount: number; totalSteps: number };
}

interface WeekTrend {
  available: boolean;
  priorWeekEndDate?: string;
  overallComplianceRate?: number;
  studentsOutOfCompliance?: number;
  studentsAtRisk?: number;
  studentsOnTrack?: number;
  /**
   * Prior-week values for the secondary dashboard cards. Each block is
   * optional — if the API failed to compute a particular metric (e.g. the
   * accommodation rate query errored), the block is omitted and the UI
   * silently hides that delta arrow.
   */
  secondary?: {
    accommodation?: { overallComplianceRate: number };
    evaluations?: { overdueEvaluations: number; overdueReEvaluations: number };
    transitions?: { missingPlan: number; overdueFollowups: number };
    meetings?: { overdueCount: number };
  };
}

function statusBand(rate: number): { label: string; tone: "green" | "amber" | "red"; line: string } {
  if (rate >= 95) return { label: "On track", tone: "green", line: "Service delivery is meeting requirements district-wide." };
  if (rate >= 85) return { label: "Watch", tone: "amber", line: "Some students are slipping. Address shortfalls before they become compensatory." };
  return { label: "At risk", tone: "red", line: "Mandated minutes are not being delivered. Compensatory exposure is accumulating." };
}

const toneStyles = {
  green: { ring: "ring-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  amber: { ring: "ring-amber-200", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  red:   { ring: "ring-red-200",   bg: "bg-red-50",   text: "text-red-700",   dot: "bg-red-500" },
  blue:  { ring: "ring-blue-200",  bg: "bg-blue-50",  text: "text-blue-700",  dot: "bg-blue-400" },
};

function fmtMoney(n: number): string {
  if (!n) return "$0";
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function formatSyncAge(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 6) return `${diffHr} hr ago`;
  return new Date(isoStr).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function LastSyncedLabel({
  isoStr,
  onRefresh,
  isRefreshing,
}: {
  isoStr: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  const [label, setLabel] = useState(() => formatSyncAge(isoStr));

  useEffect(() => {
    setLabel(formatSyncAge(isoStr));
    const timer = setInterval(() => setLabel(formatSyncAge(isoStr)), 30_000);
    return () => clearInterval(timer);
  }, [isoStr]);

  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 mt-1.5">
      <Clock className="w-3 h-3 flex-shrink-0" />
      Updated {label}
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="ml-1 inline-flex items-center justify-center rounded p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          aria-label="Refresh compliance data"
          title="Refresh compliance data"
          data-testid="button-refresh-compliance"
        >
          {isRefreshing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
        </button>
      )}
    </span>
  );
}

export default function PilotAdminHome() {
  const { user } = useRole();
  const { filterParams } = useSchoolContext();
  const firstName = user.name?.split(" ")[0] || "";
  const qs = new URLSearchParams(filterParams).toString();
  const params = qs ? `?${qs}` : "";

  const { data: risk, isLoading: riskLoading, isError: riskError, dataUpdatedAt: riskUpdatedAt, refetch: refetchRisk, isRefetching: riskRefetching } = useQuery<ComplianceRiskReport>({
    queryKey: ["pilot-home/compliance-risk-report", filterParams],
    queryFn: async () => {
      const r = await authFetch(`/api/reports/compliance-risk-report${params}`);
      if (!r.ok) throw new Error("compliance-risk-report failed");
      return r.json();
    },
    staleTime: 60_000,
  });

  // Health-score trend is intentionally district-wide: snapshots are captured
  // once per day per district and have no school/year axis, so we deliberately
  // do NOT pass `filterParams` here. Mixing a school-filtered "current" badge
  // with a district-wide "vs. last week" delta would compare different
  // populations. If a school-scoped trend is needed later, the snapshot table
  // and capture functions will need a school dimension first.
  const { data: healthTrend } = useQuery<HealthScoreTrend>({
    queryKey: ["pilot-home/health-score-trend"],
    queryFn: async () => {
      const r = await authFetch(`/api/dashboard/health-score-trend`);
      if (!r.ok) return { available: false };
      return r.json();
    },
    staleTime: 5 * 60_000,
  });

  const { data: weekTrend } = useQuery<WeekTrend>({
    queryKey: ["pilot-home/compliance-week-trend", filterParams],
    queryFn: async () => {
      const r = await authFetch(`/api/reports/compliance-week-trend${params}`);
      if (!r.ok) return { available: false };
      return r.json();
    },
    staleTime: 5 * 60_000,
  });

  // ── Onboarding status — used to gate weekly section and setup-mode display ──
  const { data: onboarding } = useQuery<OnboardingStatus>({
    queryKey: ["pilot-home/onboarding-status"],
    queryFn: async () => {
      const r = await authFetch("/api/onboarding/status");
      if (!r.ok) throw new Error("onboarding/status failed");
      return r.json();
    },
    staleTime: 5 * 60_000,
  });
  // Use the 8-step pilot readiness signal — NOT the legacy 3-step `isComplete`
  // which only checks SIS+schools+service types and collapses the onboarding UI
  // before the district is truly ready.
  const onboardingComplete = onboarding?.pilotChecklist?.isComplete ?? onboarding?.isComplete ?? false;


  const { data: dashSummary } = useQuery<{ errorsLast24h?: number; contractRenewals?: { id: number; agencyName: string; endDate: string }[] }>({
    queryKey: ["pilot-home/dashboard-summary", filterParams],
    queryFn: async () => {
      const r = await authFetch(`/api/dashboard/summary${params}`);
      if (!r.ok) throw new Error("dashboard/summary failed");
      return r.json();
    },
    staleTime: 60_000,
  });

  // ── Deferred queries — fire only when "Operational details" is first opened ─
  const [opsEnabled, setOpsEnabled] = useState(false);

  const { data: accommodationCompliance } = useQuery<{ totalStudents: number; overallComplianceRate: number; students: { overdueCount: number }[] }>({
    queryKey: ["accommodation-compliance-dash"],
    queryFn: () => authFetch("/api/accommodation-compliance?windowDays=30").then(r => r.ok ? r.json() : null),
    staleTime: 120_000,
    enabled: opsEnabled,
  });

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

  const { data: credentialExpiration } = useQuery<CredentialExpirationItem[]>({
    queryKey: ["credential-expiration"],
    queryFn: () => authFetch("/api/dashboard/credential-expiration").then(r => r.ok ? r.json() : []),
    staleTime: 120_000,
    enabled: opsEnabled,
  });

  const { data: deadlinesRaw } = useGetComplianceDeadlines({ enabled: opsEnabled } as any);
  const deadlines = (() => {
    const items: unknown[] = Array.isArray(deadlinesRaw) ? deadlinesRaw : ((deadlinesRaw as { events?: unknown[] })?.events ?? []);
    return (items as { student?: { firstName: string; lastName: string }; eventType: string; daysRemaining: number }[])
      .slice(0, 6)
      .map(e => ({
        studentName: e.student ? `${e.student.firstName} ${e.student.lastName}` : "Student",
        eventType: e.eventType,
        daysUntilDue: e.daysRemaining,
      }));
  })();

  const summary = risk?.summary;
  const hasData = !!summary && summary.totalStudents > 0;
  const rate = summary?.overallComplianceRate ?? 0;
  const band = useMemo(() => statusBand(rate), [rate]);

  // When students and service requirements exist but NO sessions have been
  // logged yet, suppress the red "At risk" tone — the district hasn't done
  // anything wrong, they've just finished setup and haven't started logging.
  const noSessionsLogged = hasData
    && (summary?.totalDeliveredMinutes ?? 0) === 0
    && (summary?.totalServiceRequirements ?? 0) > 0;

  const effectiveBand = noSessionsLogged
    ? { label: "Awaiting sessions", tone: "blue" as const, line: "No sessions have been logged yet this period. Compliance status will update once providers start recording." }
    : band;
  const tone = toneStyles[effectiveBand.tone];

  const healthScore = useMemo(() => {
    if (!summary || summary.totalStudents <= 0) return null;
    const exposurePerStudent = summary.combinedExposure / summary.totalStudents;
    const providerLoggingRate = 1.0;
    return computeHealthScore(rate, exposurePerStudent, providerLoggingRate);
  }, [summary, rate]);

  // Per-school health rows for the badge drill-down. Shares its query key
  // with SchoolComplianceBreakdown so react-query dedupes the network call.
  const { data: schoolHealthRows } = useQuery<SchoolHealthRow[]>({
    queryKey: ["dashboard/school-compliance", filterParams],
    queryFn: async () => {
      const r = await authFetch(`/api/dashboard/school-compliance${params}`);
      if (!r.ok) throw new Error("school-compliance failed");
      return r.json();
    },
    staleTime: 60_000,
    enabled: !!healthScore,
  });

  const schoolHealthBreakdown = useMemo(() => {
    if (!schoolHealthRows?.length) return [];
    return schoolHealthRows
      .map(row => ({
        schoolId: row.schoolId,
        schoolName: row.schoolName,
        score: computeHealthScore(row.complianceRate, row.exposurePerStudent, row.providerLoggingRate),
      }))
      .filter((r): r is { schoolId: number | null; schoolName: string; score: HealthScore } => r.score !== null)
      .sort((a, b) => a.score.numeric - b.score.numeric);
  }, [schoolHealthRows]);

  // Top students (dedupe needsAttention service-level rows, take worst per student)
  const topStudents = useMemo(() => {
    if (!risk?.needsAttention?.length) return [];
    const byStudent = new Map<number, ComplianceRiskReport["needsAttention"][number]>();
    for (const row of risk.needsAttention) {
      const cur = byStudent.get(row.studentId);
      if (!cur || row.percentComplete < cur.percentComplete) byStudent.set(row.studentId, row);
    }
    return Array.from(byStudent.values())
      .sort((a, b) => a.percentComplete - b.percentComplete || b.shortfallMinutes - a.shortfallMinutes)
      .slice(0, 6);
  }, [risk?.needsAttention]);

  const studentsAttentionCount = useMemo(() => {
    if (!risk?.needsAttention) return 0;
    return new Set(risk.needsAttention.map(r => r.studentId)).size;
  }, [risk?.needsAttention]);

  const isLoading = riskLoading;

  const trendAvailable = weekTrend?.available === true && summary !== undefined;
  const rateDelta = trendAvailable && weekTrend!.overallComplianceRate !== undefined
    ? Math.round((rate - weekTrend!.overallComplianceRate!) * 10) / 10
    : null;
  const outDelta = trendAvailable && weekTrend!.studentsOutOfCompliance !== undefined
    ? (summary!.studentsOutOfCompliance - weekTrend!.studentsOutOfCompliance!)
    : null;
  const atRiskDelta = trendAvailable && weekTrend!.studentsAtRisk !== undefined
    ? (summary!.studentsAtRisk - weekTrend!.studentsAtRisk!)
    : null;
  const onTrackDelta = trendAvailable && weekTrend!.studentsOnTrack !== undefined
    ? (summary!.studentsOnTrack - weekTrend!.studentsOnTrack!)
    : null;

  // ── Secondary card deltas (week-over-week).
  // Each is null unless we have both the current dashboard value AND the
  // matching prior-week value from /reports/compliance-week-trend.secondary.
  // The TrendDelta component hides itself when delta === null, so cards still
  // render cleanly even if the prior-week query failed for one metric.
  const accomRateDelta =
    accommodationCompliance && weekTrend?.secondary?.accommodation
      ? (accommodationCompliance.overallComplianceRate - weekTrend.secondary.accommodation.overallComplianceRate)
      : null;
  const evalsDeltas = evalDash && weekTrend?.secondary?.evaluations
    ? {
        overdueEvaluations: (evalDash.overdueEvaluations as number) - weekTrend.secondary.evaluations.overdueEvaluations,
        overdueReEvaluations: (evalDash.overdueReEvaluations as number) - weekTrend.secondary.evaluations.overdueReEvaluations,
      }
    : undefined;
  const transitionsDeltas = transitionDash && weekTrend?.secondary?.transitions
    ? {
        missingPlan: (transitionDash.missingPlan as number) - weekTrend.secondary.transitions.missingPlan,
        overdueFollowups: (transitionDash.overdueFollowups as number) - weekTrend.secondary.transitions.overdueFollowups,
      }
    : undefined;
  const meetingsOverdueDelta = meetingDash && weekTrend?.secondary?.meetings
    ? ((meetingDash as { overdueCount: number }).overdueCount - weekTrend.secondary.meetings.overdueCount)
    : null;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
            {getGreeting()}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-xs md:text-sm text-gray-500 mt-1">
            {risk?.meta?.districtName ? `${risk.meta.districtName} · ` : ""}
            Service-minute compliance for SPED
          </p>
        </div>
        <div className="flex items-center gap-2">
          {healthScore && (
            <HealthScoreBadge score={healthScore} trend={healthTrend} schools={schoolHealthBreakdown} />
          )}
          {/* Showcase tour entry — visible to admins on demo districts.
              The ShowcaseTour component itself is gated to admins where
              sample data is loaded; this button hides in the same case. */}
          <ShowcaseTourButton />
        </div>
      </div>

      {/* Life-threatening medical alert banner — dismissible per session */}
      <LifeThreateningAlertsBanner />

      {/*
        Setup/readiness is the dominant concern until the district is pilot-ready.
        We render the full checklist before any compliance signal so a brand-new
        admin sees their next step immediately, then the checklist collapses to a
        compact summary once isComplete = true.
       */}
      <div data-tour-id="readiness-checklist" className="space-y-4">
        {onboardingComplete ? (
          <PilotOnboardingChecklist variant="compact" defaultExpanded={false} />
        ) : (
          <>
            <PilotOnboardingChecklist variant="full" allowDismiss={true} />
            {/* Co-dominant readiness audit: surfaces alongside the setup checklist
                for as long as the district is pre-ready. Once isComplete = true,
                both collapse and PilotReadinessPanel falls back to its lower
                section position below. */}
            <PilotReadinessPanel />
          </>
        )}
        {/* Pointer to the unified first-run hub — the canonical page that
            walks an admin through sample data → checklist → readiness →
            first value → next actions in one coherent flow. */}
        {!onboardingComplete && (() => {
          // "Steps remaining" action label — sourced from the canonical
          // 9-step pilot checklist (NOT the legacy 4-step
          // `onboarding.totalSteps - onboarding.completedCount`, which would
          // cap the counter at 4 even though the real checklist has 9 items).
          const pcCompleted = onboarding?.pilotChecklist?.completedCount ?? 0;
          const pcTotal = onboarding?.pilotChecklist?.totalSteps ?? 0;
          const stepsRemaining = Math.max(0, pcTotal - pcCompleted);
          return (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
              <Link
                href="/onboarding"
                className="font-medium text-emerald-700 hover:text-emerald-800"
                data-testid="link-finish-setup"
              >
                Finish setup
                {pcTotal > 0 && (
                  <>
                    {" — "}
                    <span data-testid="text-steps-remaining">
                      {stepsRemaining} {stepsRemaining === 1 ? "step" : "steps"} remaining
                    </span>
                  </>
                )}{" "}
                <ArrowRight className="inline w-3 h-3 -mt-0.5" />
              </Link>
              <span>
                Prefer a single guided page?{" "}
                <Link
                  href="/onboarding"
                  className="text-emerald-700 hover:text-emerald-800 font-medium"
                  data-testid="link-first-run-hub"
                >
                  Open the first-run hub <ArrowRight className="inline w-3 h-3 -mt-0.5" />
                </Link>
              </span>
            </div>
          );
        })()}
      </div>

      {/* 1. Are we compliant? */}
      <section
        className={`rounded-2xl border bg-white p-5 md:p-6 shadow-sm ring-1 ${tone.ring}`}
        data-testid="section-overall-compliance"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <ShieldCheck className="w-3.5 h-3.5" /> Are we compliant?
              {riskUpdatedAt > 0 && (
                <span className="ml-1 text-[10px] text-gray-300 normal-case font-normal tracking-normal">
                  as of {formatLastUpdated(riskUpdatedAt)}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-4xl md:text-5xl font-bold text-gray-900 tabular-nums">
                {hasData ? `${rate.toFixed(1)}%` : "—"}
              </span>
              <span className="text-sm text-gray-500">of mandated minutes delivered</span>
            </div>
            {rateDelta !== null && (
              <RateTrendBadge delta={rateDelta} />
            )}
            <div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${tone.bg} ${tone.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
              {hasData ? effectiveBand.label : "Awaiting data"}
            </div>
            {risk?.meta?.generatedAt && (
              <div>
                <LastSyncedLabel
                  isoStr={risk.meta.generatedAt}
                  onRefresh={() => { void refetchRisk(); }}
                  isRefreshing={riskRefetching}
                />
              </div>
            )}
            <p className="mt-3 text-sm text-gray-600 max-w-xl">
              {hasData
                ? effectiveBand.line
                : "No service-minute data yet. Once your team starts logging sessions, your compliance status will appear here."}
            </p>
            {noSessionsLogged && (
              <p className="mt-2 text-xs text-blue-700 max-w-xl">
                Student counts above reflect 0 sessions delivered — this is expected right after setup.{" "}
                <a href="/sessions/new" className="underline hover:text-blue-900">Log your first session</a>{" "}
                or{" "}
                <a href="/import" className="underline hover:text-blue-900">import session logs</a> to see real compliance data.
              </p>
            )}
          </div>
          <div className="hidden sm:grid grid-cols-3 gap-3 text-right">
            <Stat label="Out of compliance" value={summary?.studentsOutOfCompliance ?? 0} accent="red" delta={outDelta} positiveIsGood={false} />
            <Stat label="At risk" value={summary?.studentsAtRisk ?? 0} accent="amber" delta={atRiskDelta} positiveIsGood={false} />
            <Stat label="On track" value={summary?.studentsOnTrack ?? 0} accent="green" delta={onTrackDelta} positiveIsGood={true} />
          </div>
        </div>
        <div className="sm:hidden grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-100">
          <Stat label="Out of compliance" value={summary?.studentsOutOfCompliance ?? 0} accent="red" delta={outDelta} positiveIsGood={false} />
          <Stat label="At risk" value={summary?.studentsAtRisk ?? 0} accent="amber" delta={atRiskDelta} positiveIsGood={false} />
          <Stat label="On track" value={summary?.studentsOnTrack ?? 0} accent="green" delta={onTrackDelta} positiveIsGood={true} />
        </div>
        {riskError && (
          <p className="mt-3 text-xs text-red-600">Couldn't load the compliance report. Refresh in a minute.</p>
        )}
      </section>

      {/* Pilot baseline + comparison — self-hides for non-pilot districts */}
      <PilotBaselinePanels />

      {/* 2. Where are we at risk? */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm" data-testid="section-students-at-risk">
        <div className="flex items-center justify-between px-5 md:px-6 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-gray-900">Where are we at risk?</h2>
          </div>
          {studentsAttentionCount > 0 && (
            <Link href="/compliance-risk-report" className="text-xs text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1" data-testid="link-view-all-risk">
              View all {studentsAttentionCount} <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
        {isLoading && !risk ? (
          <SkeletonRows />
        ) : topStudents.length === 0 ? (
          <EmptyHint icon={CheckCircle2} text={hasData ? "No students currently flagged for compliance risk." : "Risk data will appear once services and sessions are tracked."} />
        ) : (
          <ul className="divide-y divide-gray-100">
            {topStudents.map((s) => (
              <li key={s.studentId} className="px-5 md:px-6 py-3 flex items-center gap-4 hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link href={`/students/${s.studentId}`} className="text-sm font-medium text-gray-900 hover:text-emerald-700 truncate" data-testid={`link-student-${s.studentId}`}>
                      {s.studentName}
                    </Link>
                    <RiskPill status={s.riskStatus} label={s.riskLabel} />
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {[s.school, s.grade && `Grade ${s.grade}`, s.service, s.providerName !== "Unassigned" && s.providerName].filter(Boolean).join(" · ")}
                  </p>
                  <div className="md:hidden mt-1.5 flex items-center gap-2" data-testid={`mobile-progress-${s.studentId}`}>
                    <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${s.riskStatus === "out_of_compliance" ? "bg-red-500" : "bg-amber-400"}`}
                        style={{ width: `${Math.min(100, Math.max(0, s.percentComplete))}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-gray-600 tabular-nums">{s.percentComplete.toFixed(0)}%</span>
                  </div>
                </div>
                <div className="hidden md:block text-right min-w-[72px]">
                  <div className="text-sm font-semibold text-gray-900 tabular-nums">{s.percentComplete.toFixed(0)}%</div>
                  <div className="mt-1 w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${s.riskStatus === "out_of_compliance" ? "bg-red-500" : "bg-amber-400"}`}
                      style={{ width: `${Math.min(100, Math.max(0, s.percentComplete))}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">complete</div>
                </div>
                <div className="hidden sm:block text-right">
                  <div className="text-sm font-semibold text-gray-900 tabular-nums">{s.shortfallMinutes}</div>
                  <div className="text-[11px] text-gray-500">min short</div>
                </div>
                <div className="text-right">
                  {s.estimatedExposure != null ? (
                    <>
                      <div className="text-sm font-semibold text-red-700 tabular-nums">{fmtMoney(s.estimatedExposure)}</div>
                      <div className="text-[11px] text-gray-500">exposure</div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-semibold text-amber-700">Not priced</div>
                      <div className="text-[11px] text-gray-500">rate not configured</div>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Compliance risk alerts — open alerts from the weekly compliance job */}
      <ComplianceRiskAlertsWidget />

      {/* Action Center entry point — replaces the old action queue.
           The Action Center owns "what do I do next"; Dashboard is health at-a-glance. */}
      <Link href="/action-center">
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-white p-4 md:p-5 hover:shadow-sm transition-shadow cursor-pointer flex items-center gap-4 group" data-testid="banner-action-center">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0">
            <ListChecks className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm md:text-[15px] font-semibold text-gray-900">Go to Action Center</div>
            <div className="text-xs md:text-sm text-gray-500 mt-0.5">
              Prioritized to-do list — urgent items, missed sessions, schedule gaps, and upcoming deadlines.
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-emerald-700 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
        </div>
      </Link>

      {/* School breakdown + provider delivery side-by-side */}
      {onboardingComplete && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
          <SchoolComplianceBreakdown />
          <ProviderDelivery />
        </div>
      )}

      {/* Cost / exposure context — hidden during setup (no data yet) */}
      {onboardingComplete && <CostRiskPanel />}

      {/* Render the readiness panel at its lower position only after onboarding
          completes — pre-ready, it lives at the top alongside the setup
          checklist (see above) so first-login users see it immediately. */}
      {onboardingComplete && <PilotReadinessPanel />}

      {/* System Status — error count health indicator */}
      {dashSummary !== undefined && (
        <SystemStatusBanner errorsLast24h={dashSummary.errorsLast24h ?? 0} />
      )}

      {/* Provider activation nudge stat — small read-out of how many providers
          got an automated activation nudge in the last 7 days. Surfaces during
          a pilot so admins can see the system catching stalls in real time. */}
      <ProvidersNudgedThisWeek />

      {/* Operational details — collapsed by default so they don't compete with
          the compliance story, but fully accessible from the main dashboard. */}
      <CollapsibleSection
        title="Operational details"
        icon={ListChecks}
        defaultOpen={false}
        onFirstOpen={() => setOpsEnabled(true)}
      >
        {/* Provider session completion rate leaderboard */}
        <ProviderCompletionCard />

        {accommodationCompliance && <AccommodationComplianceCard accommodationCompliance={accommodationCompliance} rateDelta={accomRateDelta} />}
        <IepExpirationCard enabled={opsEnabled} />
        <EvalsTransitionsSection evalDash={evalDash} transitionDash={transitionDash} evalsDeltas={evalsDeltas} transitionsDeltas={transitionsDeltas} />
        <MeetingsSection meetingDash={meetingDash} overdueDelta={meetingsOverdueDelta} />
        {dashSummary?.contractRenewals && dashSummary.contractRenewals.length > 0 && (
          <ContractRenewalsCard contractRenewals={dashSummary.contractRenewals} />
        )}
        <CredentialExpirationCard credentials={credentialExpiration ?? []} />
        <DeadlinesSection deadlines={deadlines} />
      </CollapsibleSection>

    </div>
  );
}

function Stat({
  label, value, accent, delta, positiveIsGood,
}: {
  label: string;
  value: number;
  accent: "red" | "amber" | "green";
  delta?: number | null;
  positiveIsGood?: boolean;
}) {
  const color = accent === "red" ? "text-red-700" : accent === "amber" ? "text-amber-700" : "text-emerald-700";
  const hasDelta = delta !== null && delta !== undefined;
  const isGood = hasDelta ? (positiveIsGood ? delta! > 0 : delta! < 0) : false;
  const isBad = hasDelta ? (positiveIsGood ? delta! < 0 : delta! > 0) : false;
  const deltaColor = isGood ? "text-emerald-600" : isBad ? "text-red-600" : "text-gray-400";
  const DeltaIcon = hasDelta && delta !== 0 ? (delta! > 0 ? TrendingUp : TrendingDown) : Minus;
  const sign = hasDelta && delta! > 0 ? "+" : "";
  return (
    <div>
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] text-gray-500 leading-tight">{label}</div>
      {hasDelta && (
        <div className={`mt-0.5 flex items-center justify-end gap-0.5 text-[10px] font-medium ${deltaColor}`}>
          <DeltaIcon className="w-3 h-3" />
          <span>{sign}{delta}</span>
        </div>
      )}
    </div>
  );
}

function RateTrendBadge({ delta }: { delta: number }) {
  const isPositive = delta > 0;
  const isNeutral = delta === 0;
  const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;
  const colorCls = isNeutral
    ? "text-gray-400"
    : isPositive
    ? "text-emerald-600"
    : "text-red-600";
  const sign = delta > 0 ? "+" : "";
  return (
    <div className={`mt-1 flex items-center gap-1 text-xs font-medium ${colorCls}`}>
      <Icon className="w-3.5 h-3.5" />
      <span>{sign}{delta.toFixed(1)}% vs. last week</span>
    </div>
  );
}

function RiskPill({ status, label }: { status: string; label: string }) {
  const cls = status === "out_of_compliance"
    ? "bg-red-50 text-red-700"
    : status === "at_risk"
    ? "bg-amber-50 text-amber-700"
    : "bg-gray-100 text-gray-700";
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>{label}</span>;
}

function SkeletonRows() {
  return (
    <ul className="divide-y divide-gray-100">
      {[0, 1, 2, 3].map(i => (
        <li key={i} className="px-5 md:px-6 py-3 flex items-center gap-4">
          <div className="flex-1">
            <div className="h-3 bg-gray-100 rounded w-1/3 mb-1.5 animate-pulse" />
            <div className="h-2.5 bg-gray-50 rounded w-1/2 animate-pulse" />
          </div>
          <div className="h-6 w-12 bg-gray-100 rounded animate-pulse" />
        </li>
      ))}
    </ul>
  );
}

function EmptyHint({ icon: Icon, text }: { icon: typeof CheckCircle2; text: string }) {
  return (
    <div className="px-5 md:px-6 pb-5 pt-1 flex items-center gap-2 text-sm text-gray-500">
      <Icon className="w-4 h-4 text-emerald-500" />
      <span>{text}</span>
    </div>
  );
}

function ShowcaseTourButton() {
  const { data } = useQuery<{ hasSampleData: boolean }>({
    queryKey: ["sample-data/status"],
    queryFn: async () => {
      const r = await authFetch("/api/sample-data");
      if (!r.ok) throw new Error("sample-data status failed");
      return r.json();
    },
    staleTime: 60_000,
  });
  if (!data?.hasSampleData) return null;
  return (
    <button
      onClick={() => startShowcaseTour()}
      data-testid="button-launch-showcase-tour"
      className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 transition-colors"
      title="Walks through the strongest screen of every Trellis module"
    >
      <Compass className="w-3.5 h-3.5" />
      Take the showcase tour
    </button>
  );
}

const healthScoreColors: Record<"green" | "amber" | "red", { bg: string; text: string; ring: string; numText: string }> = {
  green: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200", numText: "text-emerald-800" },
  amber: { bg: "bg-amber-50",   text: "text-amber-700",   ring: "ring-amber-200",   numText: "text-amber-800" },
  red:   { bg: "bg-red-50",     text: "text-red-700",     ring: "ring-red-200",     numText: "text-red-800" },
};

function HealthScoreSparkline({ points }: { points: { snapshotDate: string; numeric: number }[] }) {
  if (points.length < 2) return null;
  const W = 220;
  const H = 36;
  const PAD = 2;
  const min = Math.min(...points.map(p => p.numeric));
  const max = Math.max(...points.map(p => p.numeric));
  const span = Math.max(1, max - min);
  const xStep = (W - PAD * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = PAD + i * xStep;
    const y = PAD + (H - PAD * 2) * (1 - (p.numeric - min) / span);
    return { x, y, ...p };
  });
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  return (
    <svg width={W} height={H} className="block" aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r={2.5} fill="currentColor" />
    </svg>
  );
}

function formatDelta(n: number): string {
  if (n > 0) return `+${n}`;
  return `${n}`;
}

const gradeTextColor: Record<HealthScore["color"], string> = {
  green: "text-emerald-300",
  amber: "text-amber-300",
  red: "text-red-300",
};

function HealthScoreBadge({
  score,
  trend,
  schools,
}: {
  score: HealthScore;
  trend?: HealthScoreTrend;
  schools: { schoolId: number | null; schoolName: string; score: HealthScore }[];
}) {
  const cls = healthScoreColors[score.color];
  const delta = trend?.available && typeof trend.deltaPts === "number" ? trend.deltaPts : null;
  const sparkline = trend?.available ? trend.sparkline ?? [] : [];

  const deltaTone =
    delta == null ? "text-gray-500"
    : delta > 0 ? "text-emerald-700"
    : delta < 0 ? "text-red-700"
    : "text-gray-500";
  const DeltaIcon = delta == null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;

  // Cap rendered rows so a 50-school district doesn't blow out the tooltip.
  const MAX_ROWS = 8;
  const visible = schools.slice(0, MAX_ROWS);
  const overflow = Math.max(0, schools.length - MAX_ROWS);
  return (
    <div
      className={`relative group flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl ring-1 ${cls.ring} ${cls.bg} cursor-default select-none`}
      data-testid="health-score-badge"
      aria-label={
        delta != null
          ? `District health score: ${score.grade} (${score.numeric}/100), ${formatDelta(delta)} pts vs. last week`
          : `District health score: ${score.grade} (${score.numeric}/100)`
      }
    >
      <div className="text-center leading-none">
        <div className={`text-2xl font-black tabular-nums ${cls.numText}`}>{score.grade}</div>
        <div className={`text-[10px] font-semibold ${cls.text} mt-0.5 tabular-nums`}>{score.numeric}/100</div>
      </div>
      <div className="flex flex-col items-start gap-0.5">
        <div className={`text-xs font-medium ${cls.text} hidden sm:block leading-tight`}>
          District Health
        </div>
        {delta != null && (
          <div
            className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${deltaTone}`}
            data-testid="health-score-delta"
            title={
              trend?.priorWeek
                ? `Last week: ${trend.priorWeek.numeric}/100 (${trend.priorWeek.grade}) on ${trend.priorWeek.snapshotDate}`
                : undefined
            }
          >
            <DeltaIcon className="w-3 h-3" />
            <span>{formatDelta(delta)} pts</span>
            <span className="text-gray-500 font-normal hidden sm:inline">vs. last wk</span>
          </div>
        )}
      </div>

      {/* Tooltip — district summary plus per-school drill-down */}
      <div
        className="pointer-events-none absolute right-0 top-full mt-2 z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg bg-gray-900 text-white text-[11px] leading-relaxed px-3 py-2.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        role="tooltip"
        data-testid="health-score-tooltip"
      >
        <p className="font-semibold mb-1.5 text-xs">District Health Score — {score.grade} ({score.numeric}/100)</p>
        <ul className="space-y-1 text-gray-300">
          <li>📋 Compliance: {score.breakdown.compliancePoints.toFixed(0)} pts <span className="text-gray-500">(60% weight)</span></li>
          <li>💰 Exposure risk: {score.breakdown.exposurePoints.toFixed(0)} pts <span className="text-gray-500">(20% weight)</span></li>
          <li>📝 Provider logging: {score.breakdown.loggingPoints.toFixed(0)} pts <span className="text-gray-500">(20% weight)</span></li>
        </ul>
        {sparkline.length >= 2 && (
          <div className="mt-2.5 pt-2 border-t border-gray-700">
            <p className="text-[10px] text-gray-400 mb-1">Last {sparkline.length} weeks</p>
            <div className="text-emerald-300" data-testid="health-score-sparkline">
              <HealthScoreSparkline points={sparkline} />
            </div>
            <div className="flex justify-between text-[9px] text-gray-500 tabular-nums mt-0.5">
              <span>{sparkline[0].numeric}</span>
              <span>{sparkline[sparkline.length - 1].numeric}</span>
            </div>
          </div>
        )}

        {visible.length > 0 && (
          <div className="mt-2.5 pt-2 border-t border-gray-700">
            <p className="font-semibold text-[11px] text-gray-200 mb-1.5">By school (worst first)</p>
            <div className="overflow-hidden rounded">
              <table className="w-full text-left tabular-nums" data-testid="health-score-school-table">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-gray-500">
                    <th className="font-medium pr-2 pb-1">School</th>
                    <th className="font-medium px-1 pb-1 text-center">Grade</th>
                    <th className="font-medium px-1 pb-1 text-right" title="Compliance points">Cmp</th>
                    <th className="font-medium px-1 pb-1 text-right" title="Exposure points">Exp</th>
                    <th className="font-medium pl-1 pb-1 text-right" title="Provider logging points">Log</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(s => (
                    <tr
                      key={s.schoolId ?? s.schoolName}
                      className="text-gray-300"
                      data-testid={`health-school-row-${s.schoolId ?? "unknown"}`}
                    >
                      <td className="pr-2 py-0.5 truncate max-w-[8.5rem]" title={s.schoolName}>{s.schoolName}</td>
                      <td className={`px-1 py-0.5 text-center font-bold ${gradeTextColor[s.score.color]}`}>
                        {s.score.grade}
                      </td>
                      <td className="px-1 py-0.5 text-right">{s.score.breakdown.compliancePoints.toFixed(0)}</td>
                      <td className="px-1 py-0.5 text-right">{s.score.breakdown.exposurePoints.toFixed(0)}</td>
                      <td className="pl-1 py-0.5 text-right">{s.score.breakdown.loggingPoints.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {overflow > 0 && (
              <p className="mt-1 text-[10px] text-gray-500">+{overflow} more school{overflow === 1 ? "" : "s"} not shown</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProvidersNudgedThisWeek() {
  const { data } = useQuery<{ providersNudgedThisWeek: number }>({
    queryKey: ["pilot-status/nudge-stats"],
    queryFn: async () => {
      const r = await authFetch("/api/pilot-status/nudge-stats");
      if (!r.ok) return { providersNudgedThisWeek: 0 };
      return r.json();
    },
    staleTime: 5 * 60_000,
  });
  const count = data?.providersNudgedThisWeek ?? 0;
  return (
    <div
      className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-3 text-sm"
      data-testid="stat-providers-nudged-this-week"
    >
      <Users className="w-4 h-4 text-emerald-700 flex-shrink-0" />
      <div className="flex-1">
        <span className="font-semibold text-gray-900 tabular-nums">{count}</span>{" "}
        <span className="text-gray-700">
          provider{count === 1 ? "" : "s"} nudged this week
        </span>
        <p className="text-xs text-gray-500 mt-0.5">
          Automated activation reminders sent in the last 7 days.
        </p>
      </div>
    </div>
  );
}
