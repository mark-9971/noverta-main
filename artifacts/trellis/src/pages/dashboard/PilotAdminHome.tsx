import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useMemo } from "react";
import {
  AlertTriangle, ArrowRight, CheckCircle2, FileWarning, ShieldCheck,
  CalendarClock, Users, ClipboardList, ExternalLink, Info,
} from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";
import { useSchoolContext } from "@/lib/school-context";
import PilotOnboardingChecklist from "@/components/onboarding/PilotOnboardingChecklist";
import CostRiskPanel from "@/components/dashboard/CostRiskPanel";
import PilotReadinessPanel from "@/components/dashboard/PilotReadinessPanel";
import SystemStatusBanner from "@/components/dashboard/SystemStatusBanner";
import { getGreeting } from "./types";

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

interface WeeklySummary {
  meta: { weekStart: string; weekEnd: string };
  summary: { totalStudents: number; combinedExposure: number };
  urgentFlags: string[];
  providersWithMissedThisWeek: {
    providerName: string;
    role: string;
    completedSessions: number;
    missedSessions: number;
    deliveredMinutes: number;
  }[];
}

interface OnboardingStatus {
  isComplete: boolean;
  completedCount: number;
  totalSteps: number;
  pilotChecklist?: { isComplete: boolean };
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

export default function PilotAdminHome({ onShowFull }: { onShowFull?: () => void }) {
  const { user } = useRole();
  const [, navigate] = useLocation();
  const { filterParams } = useSchoolContext();
  const firstName = user.name?.split(" ")[0] || "";
  const qs = new URLSearchParams(filterParams).toString();
  const params = qs ? `?${qs}` : "";

  const { data: risk, isLoading: riskLoading, isError: riskError } = useQuery<ComplianceRiskReport>({
    queryKey: ["pilot-home/compliance-risk-report", filterParams],
    queryFn: async () => {
      const r = await authFetch(`/api/reports/compliance-risk-report${params}`);
      if (!r.ok) throw new Error("compliance-risk-report failed");
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: weekly, isLoading: weeklyLoading, isError: weeklyError } = useQuery<WeeklySummary>({
    queryKey: ["pilot-home/weekly-compliance-summary", filterParams],
    queryFn: async () => {
      const r = await authFetch(`/api/reports/weekly-compliance-summary${params}`);
      if (!r.ok) throw new Error("weekly-compliance-summary failed");
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: onboarding } = useQuery<OnboardingStatus>({
    queryKey: ["pilot-home/onboarding-status"],
    queryFn: async () => {
      const r = await authFetch("/api/onboarding/status");
      if (!r.ok) throw new Error("onboarding/status failed");
      return r.json();
    },
    staleTime: 5 * 60_000,
  });

  const { data: dashSummary } = useQuery<{ errorsLast24h?: number }>({
    queryKey: ["pilot-home/dashboard-summary", filterParams],
    queryFn: async () => {
      const r = await authFetch(`/api/dashboard/summary${params}`);
      if (!r.ok) throw new Error("dashboard/summary failed");
      return r.json();
    },
    staleTime: 60_000,
  });

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

  const urgentFlags = weekly?.urgentFlags ?? [];
  const providersMissed = weekly?.providersWithMissedThisWeek ?? [];

  // Action queue
  const actions: { label: string; href?: string; onClick?: () => void; tone: "primary" | "muted" }[] = [];
  // Use the 8-step pilot readiness signal (students/requirements/sessions
  // imported, providers assigned, comms primed) — NOT the legacy 3-step
  // `isComplete` which only checks SIS+schools+service types and would
  // collapse the dominant onboarding UI before the district is truly ready.
  const onboardingComplete = onboarding?.pilotChecklist?.isComplete ?? onboarding?.isComplete ?? false;
  if (onboarding && !onboardingComplete) {
    const left = onboarding.totalSteps - onboarding.completedCount;
    actions.push({ label: `Finish setup — ${left} step${left === 1 ? "" : "s"} remaining`, href: "/setup", tone: "primary" });
  }
  if (studentsAttentionCount > 0) {
    actions.push({ label: `Review ${studentsAttentionCount} student${studentsAttentionCount === 1 ? "" : "s"} flagged for compliance risk`, href: "/compliance-risk-report", tone: "primary" });
  }
  if (urgentFlags.length > 0) {
    actions.push({ label: `Address ${urgentFlags.length} urgent flag${urgentFlags.length === 1 ? "" : "s"} from this week's summary`, href: "/weekly-compliance-summary", tone: "primary" });
  }
  if (providersMissed.length > 0) {
    const total = providersMissed.reduce((sum, p) => sum + p.missedSessions, 0);
    actions.push({ label: `Follow up with ${providersMissed.length} provider${providersMissed.length === 1 ? "" : "s"} on ${total} missed session${total === 1 ? "" : "s"} this week`, href: "/sessions", tone: "primary" });
  }
  if ((summary?.combinedExposure ?? 0) > 0) {
    actions.push({ label: `Review ${fmtMoney(summary!.combinedExposure)} in compensatory exposure`, href: "/cost-avoidance", tone: "primary" });
  }
  actions.push({ label: "Share this week's compliance summary with your team", href: "/weekly-compliance-summary", tone: "muted" });
  if (onShowFull) {
    actions.push({ label: "Open the full operational dashboard", onClick: onShowFull, tone: "muted" });
  }

  const isLoading = riskLoading || weeklyLoading;

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
        {onShowFull && (
          <button
            onClick={onShowFull}
            className="text-xs md:text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1.5"
            data-testid="button-show-full-dashboard"
          >
            View full district dashboard <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

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
            <PilotOnboardingChecklist variant="full" />
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
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-4xl md:text-5xl font-bold text-gray-900 tabular-nums">
                {hasData ? `${rate.toFixed(1)}%` : "—"}
              </span>
              <span className="text-sm text-gray-500">of mandated minutes delivered</span>
            </div>
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
            <Stat label="Out of compliance" value={summary?.studentsOutOfCompliance ?? 0} accent="red" />
            <Stat label="At risk" value={summary?.studentsAtRisk ?? 0} accent="amber" />
            <Stat label="On track" value={summary?.studentsOnTrack ?? 0} accent="green" />
          </div>
        </div>
        <div className="sm:hidden grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-100">
          <Stat label="Out of compliance" value={summary?.studentsOutOfCompliance ?? 0} accent="red" />
          <Stat label="At risk" value={summary?.studentsAtRisk ?? 0} accent="amber" />
          <Stat label="On track" value={summary?.studentsOnTrack ?? 0} accent="green" />
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
                <div className="hidden md:block text-right">
                  <div className="text-sm font-semibold text-gray-900 tabular-nums">{s.percentComplete.toFixed(0)}%</div>
                  <div className="text-[11px] text-gray-500">complete</div>
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

      {/* 3. What needs attention this week? */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm" data-testid="section-this-week">
        <div className="flex items-center justify-between px-5 md:px-6 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-900">What needs attention this week?</h2>
            {weekly?.meta?.weekStart && (
              <span className="text-xs text-gray-400">Week of {new Date(weekly.meta.weekStart).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            )}
          </div>
          <Link href="/weekly-compliance-summary" className="text-xs text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1" data-testid="link-open-weekly">
            Open weekly summary <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="px-5 md:px-6 pb-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {weeklyError ? (
            <div className="md:col-span-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 inline-flex items-start gap-2">
              <FileWarning className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Couldn't load this week's summary. Open <Link href="/weekly-compliance-summary" className="underline">the full report</Link> or try again in a minute.</span>
            </div>
          ) : weeklyLoading && !weekly ? (
            <div className="md:col-span-2 text-sm text-gray-400">Loading this week's data…</div>
          ) : (
            <>
              <div>
                <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-2">Urgent flags</div>
                {urgentFlags.length === 0 ? (
                  <p className="text-sm text-gray-500 inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> No urgent flags this week.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {urgentFlags.map((f, i) => (
                      <li key={i} className="text-sm text-gray-800 flex items-start gap-2">
                        <FileWarning className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-2">Providers with missed sessions</div>
                {providersMissed.length === 0 ? (
                  <p className="text-sm text-gray-500 inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Every provider logged their sessions this week.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {providersMissed.slice(0, 5).map((p, i) => (
                      <li key={i} className="text-sm text-gray-800 flex items-center justify-between gap-3">
                        <span className="truncate">
                          {p.providerName}
                          {p.role && <span className="text-xs text-gray-400 ml-1.5">{p.role}</span>}
                        </span>
                        <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap">
                          {p.missedSessions} missed · {p.completedSessions} logged
                        </span>
                      </li>
                    ))}
                    {providersMissed.length > 5 && (
                      <li className="text-xs text-gray-400">+ {providersMissed.length - 5} more</li>
                    )}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Cost / exposure context */}
      <CostRiskPanel />

      {/* 4. What should I do next? */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm" data-testid="section-next-actions">
        <div className="px-5 md:px-6 pt-5 pb-3 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-gray-900">What should I do next?</h2>
        </div>
        <ol className="divide-y divide-gray-100">
          {actions.map((a, i) => {
            const inner = (
              <div className={`px-5 md:px-6 py-3 flex items-center gap-3 cursor-pointer transition-colors ${a.tone === "primary" ? "hover:bg-emerald-50/40" : "hover:bg-gray-50"}`} data-testid={`action-${i}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 ${a.tone === "primary" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                  {i + 1}
                </span>
                <span className={`flex-1 text-sm ${a.tone === "primary" ? "text-gray-900 font-medium" : "text-gray-500 hover:text-gray-700"}`}>{a.label}</span>
                <ArrowRight className={`w-3.5 h-3.5 flex-shrink-0 ${a.tone === "primary" ? "text-emerald-500" : "text-gray-400"}`} />
              </div>
            );
            if (a.href) return <li key={i}><Link href={a.href}>{inner}</Link></li>;
            return <li key={i} onClick={a.onClick}>{inner}</li>;
          })}
        </ol>
      </section>

      {/* Render the readiness panel at its lower position only after onboarding
          completes — pre-ready, it lives at the top alongside the setup
          checklist (see above) so first-login users see it immediately. */}
      {onboardingComplete && <PilotReadinessPanel />}

      {/* System Status — error count health indicator */}
      {dashSummary !== undefined && (
        <SystemStatusBanner errorsLast24h={dashSummary.errorsLast24h ?? 0} />
      )}

      {/* Footer note */}
      <div className="text-xs text-gray-400 flex items-start gap-1.5 px-1">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>
          Trellis tracks whether mandated IEP minutes are being delivered. Service requirements, sessions, and rosters
          sync from your SIS — Trellis flags gaps but does not replace your SIS.
          {onShowFull && (
            <>
              {" "}
              <button onClick={onShowFull} className="underline hover:text-gray-600 inline-flex items-center gap-0.5">
                Open the full operational view <ExternalLink className="w-3 h-3" />
              </button>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: "red" | "amber" | "green" }) {
  const color = accent === "red" ? "text-red-700" : accent === "amber" ? "text-amber-700" : "text-emerald-700";
  return (
    <div>
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] text-gray-500 leading-tight">{label}</div>
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
