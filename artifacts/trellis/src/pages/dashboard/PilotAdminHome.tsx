import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, CheckCircle2, ShieldCheck,
  Users, Info, ListChecks,
  TrendingUp, TrendingDown, Minus, Compass,
} from "lucide-react";
import { startShowcaseTour } from "@/components/ShowcaseTour";
import { useGetComplianceDeadlines } from "@workspace/api-client-react";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";
import { useSchoolContext } from "@/lib/school-context";
import PilotOnboardingChecklist from "@/components/onboarding/PilotOnboardingChecklist";
import CostRiskPanel from "@/components/dashboard/CostRiskPanel";
import PilotReadinessPanel from "@/components/dashboard/PilotReadinessPanel";
import SystemStatusBanner from "@/components/dashboard/SystemStatusBanner";
import { LifeThreateningAlertsBanner } from "./AlertBanners";
import { CollapsibleSection } from "./CollapsibleSection";
import {
  AccommodationComplianceCard, EvalsTransitionsSection,
  MeetingsSection, ContractRenewalsCard, DeadlinesSection,
} from "./SecondarySections";
import { getGreeting, formatLastUpdated } from "./types";

interface ComplianceRiskReport {
  meta: { districtName: string; reportPeriod: string };
  summary: {
    totalStudents: number;
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
  completedCount: number;
  totalSteps: number;
  pilotChecklist?: { isComplete: boolean };
}

interface WeekTrend {
  available: boolean;
  priorWeekEndDate?: string;
  overallComplianceRate?: number;
  studentsOutOfCompliance?: number;
  studentsAtRisk?: number;
  studentsOnTrack?: number;
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
};

function fmtMoney(n: number): string {
  if (!n) return "$0";
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

export default function PilotAdminHome() {
  const { user } = useRole();
  const { filterParams } = useSchoolContext();
  const firstName = user.name?.split(" ")[0] || "";
  const qs = new URLSearchParams(filterParams).toString();
  const params = qs ? `?${qs}` : "";

  const { data: risk, isLoading: riskLoading, isError: riskError, dataUpdatedAt: riskUpdatedAt } = useQuery<ComplianceRiskReport>({
    queryKey: ["pilot-home/compliance-risk-report", filterParams],
    queryFn: async () => {
      const r = await authFetch(`/api/reports/compliance-risk-report${params}`);
      if (!r.ok) throw new Error("compliance-risk-report failed");
      return r.json();
    },
    staleTime: 60_000,
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
  const tone = toneStyles[band.tone];

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
        {/* Showcase tour entry — visible to admins on demo districts.
            The ShowcaseTour component itself is gated to admins where
            sample data is loaded; this button hides in the same case. */}
        <ShowcaseTourButton />
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
        {!onboardingComplete && (
          <div className="text-xs text-gray-500">
            Prefer a single guided page?{" "}
            <Link
              href="/onboarding"
              className="text-emerald-700 hover:text-emerald-800 font-medium"
              data-testid="link-first-run-hub"
            >
              Open the first-run hub <ArrowRight className="inline w-3 h-3 -mt-0.5" />
            </Link>
          </div>
        )}
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
              {hasData ? band.label : "Awaiting data"}
            </div>
            <p className="mt-3 text-sm text-gray-600 max-w-xl">
              {hasData
                ? band.line
                : "No service-minute data yet. Once your team starts logging sessions, your compliance status will appear here."}
            </p>
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

      {/* Operational details — collapsed by default so they don't compete with
          the compliance story, but fully accessible from the main dashboard. */}
      <CollapsibleSection
        title="Operational details"
        icon={ListChecks}
        defaultOpen={false}
        onFirstOpen={() => setOpsEnabled(true)}
      >
        {accommodationCompliance && <AccommodationComplianceCard accommodationCompliance={accommodationCompliance} />}
        <EvalsTransitionsSection evalDash={evalDash} transitionDash={transitionDash} />
        <MeetingsSection meetingDash={meetingDash} />
        {dashSummary?.contractRenewals && dashSummary.contractRenewals.length > 0 && (
          <ContractRenewalsCard contractRenewals={dashSummary.contractRenewals} />
        )}
        <DeadlinesSection deadlines={deadlines} />
      </CollapsibleSection>

      {/* Footer note */}
      <div className="text-xs text-gray-400 flex items-start gap-1.5 px-1">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>
          Trellis tracks whether mandated IEP minutes are being delivered. Service requirements, sessions, and rosters
          sync from your SIS — Trellis flags gaps but does not replace your SIS.
        </span>
      </div>
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

