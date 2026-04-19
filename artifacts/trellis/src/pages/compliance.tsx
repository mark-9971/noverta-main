import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListMinuteProgress, useGetComplianceByService } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ClipboardCheck, Timer, ListChecks, Calendar, AlertTriangle,
  Clock, DollarSign, Users, TrendingDown, ChevronDown, ChevronUp,
  Printer, ArrowRight, CheckCircle, FileBarChart, ShieldCheck, ShieldAlert, ExternalLink, Share2, Copy, Check,
  FileText, Loader2, Mail, CalendarPlus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EmptyState, EmptyStateStep, EmptyStateHeading, EmptyStateDetail } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Link, useSearch, useLocation } from "wouter";
import { RISK_CONFIG, RISK_PRIORITY_ORDER } from "@/lib/constants";
import { useSchoolContext } from "@/lib/school-context";
import { FeatureGate } from "@/components/FeatureGate";
import { type FeatureKey } from "@/lib/module-tiers";
import { authFetch } from "@/lib/auth-fetch";
import { buildBoardSummaryHtml, openPrintWindow } from "@/lib/print-document";
import ComplianceChecklist from "./compliance-checklist";
import ComplianceTimelinePage from "./compliance-timeline";
import ComplianceTrendsPage from "./compliance-trends";
import ComplianceRiskReportPage from "./compliance-risk-report";
import RecommendationsPanel from "@/components/compliance/RecommendationsPanel";
import ExposureDetailPanel from "@/components/compliance/ExposureDetailPanel";
const TABS = [
  { key: "risk-report", label: "Risk Report", icon: FileBarChart },
  { key: "minutes", label: "Service Minutes", icon: Timer },
  { key: "checklist", label: "Checklist", icon: ListChecks },
  { key: "timeline", label: "Timeline", icon: Calendar },
  { key: "trends", label: "Trends", icon: TrendingDown },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function resolveTab(search: string): TabKey {
  const key = new URLSearchParams(search).get("tab") ?? "";
  return TABS.some(t => t.key === key) ? (key as TabKey) : "risk-report";
}

function useQueryTab(): [TabKey, (tab: TabKey) => void] {
  const search = useSearch();
  const [, navigate] = useLocation();
  const [tab, setTabState] = useState<TabKey>(() => resolveTab(search));

  useEffect(() => {
    setTabState(resolveTab(search));
  }, [search]);

  function setTab(key: TabKey) {
    setTabState(key);
    navigate(`/compliance?tab=${key}`, { replace: true });
  }

  return [tab, setTab];
}

function fmtNum(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function fmtDollars(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

interface RiskReportData {
  meta: { districtName: string; generatedAt: string; reportPeriod: string };
  summary: {
    totalStudents: number;
    totalServiceRequirements: number;
    totalRequiredMinutes: number;
    totalDeliveredMinutes: number;
    totalShortfallMinutes: number;
    overallComplianceRate: number;
    totalExpectedByNow: number;
    paceShortfall: number;
    paceAheadBy: number;
    paceComplianceRate: number;
    totalCurrentExposure: number;
    existingCompensatoryExposure: number | null;
    combinedExposure: number;
    studentsOutOfCompliance: number;
    studentsAtRisk: number;
    studentsOnTrack: number;
  };
  needsAttention: {
    studentId: number;
    studentName: string;
    school: string;
    service: string;
    requiredMinutes: number;
    deliveredMinutes: number;
    shortfallMinutes: number;
    percentComplete: number;
    riskStatus: string;
    riskLabel: string;
    providerName: string;
    estimatedExposure: number;
  }[];
  providerSummary: {
    providerName: string;
    studentsServed: number;
    totalDelivered: number;
    totalRequired: number;
    totalShortfall: number;
    complianceRate: number;
  }[];
}

function DeseComplianceBanner() {
  const { data: restraintData } = useQuery<{ districtCompliant: boolean; nonCompliantWindows: number; totalWindows: number } | null>({
    queryKey: ["/api/state-reporting/restraint-30-day"],
    queryFn: async () => {
      const res = await authFetch("/api/state-reporting/restraint-30-day");
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const { data: iepData } = useQuery<{ summary: { breached: number; atRisk: number; total: number } } | null>({
    queryKey: ["/api/state-reporting/iep-timeline"],
    queryFn: async () => {
      const res = await authFetch("/api/state-reporting/iep-timeline");
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  if (!restraintData && !iepData) return null;

  const restraintOk = restraintData?.districtCompliant ?? true;
  const restraintBad = restraintData ? restraintData.nonCompliantWindows : 0;
  const restraintTotal = restraintData?.totalWindows ?? 0;
  const iepBreached = iepData?.summary?.breached ?? 0;
  const iepAtRisk = iepData?.summary?.atRisk ?? 0;
  const iepTotal = iepData?.summary?.total ?? 0;

  const iepTone =
    iepBreached > 0 ? "red" : iepAtRisk > 0 ? "amber" : "emerald";
  const iepToneClass =
    iepTone === "red"
      ? "bg-red-50 text-red-800 border-red-200 hover:bg-red-100"
      : iepTone === "amber"
        ? "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
        : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100";
  const restraintToneClass = restraintOk
    ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
    : "bg-red-50 text-red-800 border-red-200 hover:bg-red-100";

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
          MA DESE Compliance
        </span>
        <Link href="/state-reporting">
          <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 cursor-pointer">
            View all DESE reports <ExternalLink className="w-3 h-3" />
          </span>
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {restraintData && (
          <Link href="/state-reporting?tab=restraint">
            <div
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border cursor-pointer transition-colors ${restraintToneClass}`}
              data-testid="badge-restraint-30-day"
            >
              {restraintOk
                ? <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                : <ShieldAlert className="w-4 h-4 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold leading-tight">Restraint 30-Day</div>
                <div className="text-[11px] opacity-80 leading-tight mt-0.5">
                  {restraintOk
                    ? restraintTotal > 0
                      ? `All ${restraintTotal} window${restraintTotal !== 1 ? "s" : ""} compliant`
                      : "No active 30-day windows"
                    : `${restraintBad} of ${restraintTotal} window${restraintTotal !== 1 ? "s" : ""} non-compliant`}
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
            </div>
          </Link>
        )}
        {iepData?.summary && (
          <Link href="/state-reporting?tab=timeline">
            <div
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border cursor-pointer transition-colors ${iepToneClass}`}
              data-testid="badge-iep-timeline"
            >
              {iepTone === "red"
                ? <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                : iepTone === "amber"
                  ? <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  : <ShieldCheck className="w-4 h-4 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold leading-tight">IEP Timeline</div>
                <div className="text-[11px] opacity-80 leading-tight mt-0.5">
                  {iepBreached === 0 && iepAtRisk === 0
                    ? iepTotal > 0
                      ? `All ${iepTotal} timeline${iepTotal !== 1 ? "s" : ""} on track`
                      : "No active timelines"
                    : (
                      <>
                        {iepBreached > 0 && (
                          <span className="font-semibold">{iepBreached} breached</span>
                        )}
                        {iepBreached > 0 && iepAtRisk > 0 && <span className="opacity-60"> · </span>}
                        {iepAtRisk > 0 && (
                          <span className="font-semibold">{iepAtRisk} at risk</span>
                        )}
                        {iepTotal > 0 && (
                          <span className="opacity-60"> of {iepTotal}</span>
                        )}
                      </>
                    )}
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

function nameToInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? "?").toUpperCase() + ".";
  return ((parts[0]?.[0] ?? "?").toUpperCase() + "." + (parts[parts.length - 1]?.[0] ?? "?").toUpperCase() + ".");
}

function ServiceMinutesContent() {
  const { typedFilter } = useSchoolContext();
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [showAllProviders, setShowAllProviders] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleFrequency, setScheduleFrequency] = useState<"weekly" | "monthly">("weekly");
  const [scheduleEmails, setScheduleEmails] = useState("");
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [drilldownStudent, setDrilldownStudent] = useState<{ studentId: number; studentName: string } | null>(null);
  const { toast } = useToast();
  const { data: progress, isLoading: progressLoading, isError, refetch } = useListMinuteProgress(typedFilter);
  const { data: complianceByService } = useGetComplianceByService(typedFilter);

  const schoolId = (typedFilter as any)?.schoolId;
  const schoolYearId = (typedFilter as any)?.schoolYearId;
  const { data: riskReport, isLoading: reportLoading, isError: reportError } = useQuery<RiskReportData>({
    queryKey: ["/api/reports/compliance-risk-report", schoolId, schoolYearId],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (schoolId) p.set("schoolId", String(schoolId));
      if (schoolYearId) p.set("schoolYearId", String(schoolYearId));
      const qs = p.toString();
      const res = await authFetch(`/api/reports/compliance-risk-report${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(res.status === 403 ? "forbidden" : "Failed");
      return res.json();
    },
    staleTime: 30_000,
    retry: (count, err) => {
      if (err instanceof Error && err.message === "forbidden") return false;
      return count < 2;
    },
  });

  async function handleGenerateExecutiveSummary() {
    if (!riskReport) return;
    setGeneratingPdf(true);
    try {
      const p = new URLSearchParams();
      if (schoolId) p.set("schoolId", String(schoolId));
      if (schoolYearId) p.set("schoolYearId", String(schoolYearId));

      const now = new Date();
      const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      const trendParams = new URLSearchParams(p);
      trendParams.set("granularity", "weekly");
      trendParams.set("startDate", fourWeeksAgo.toISOString().split("T")[0]!);
      trendParams.set("endDate", now.toISOString().split("T")[0]!);

      const [execRes, trendRes] = await Promise.allSettled([
        authFetch(`/api/reports/executive-summary${p.toString() ? `?${p.toString()}` : ""}`),
        authFetch(`/api/reports/compliance-trend?${trendParams.toString()}`),
      ]);

      let annualReviewsDue30: number | null = null;
      if (execRes.status === "fulfilled" && execRes.value.ok) {
        const execData: { iepDeadlines?: { within30?: number } } = await execRes.value.json();
        const raw = execData?.iepDeadlines?.within30;
        annualReviewsDue30 = typeof raw === "number" ? raw : null;
      }

      let trendWeeks: { label: string; rate: number }[] = [];
      if (trendRes.status === "fulfilled" && trendRes.value.ok) {
        const trendData: { trend?: { label?: string; periodStart?: string; complianceRate?: number }[] } = await trendRes.value.json();
        const trend = trendData?.trend ?? [];
        const last4 = trend.slice(-4);
        trendWeeks = last4.map(w => ({
          label: w.label ?? w.periodStart?.slice(5, 10) ?? "",
          rate: typeof w.complianceRate === "number" ? Math.round(w.complianceRate) : 0,
        }));
      }

      const rs = riskReport.summary;

      const topRisk = [...(riskReport.needsAttention ?? [])]
        .sort((a, b) => (b.estimatedExposure ?? 0) - (a.estimatedExposure ?? 0))
        .slice(0, 5)
        .map(r => ({
          initials: nameToInitials(r.studentName),
          service: r.service,
          shortfallMinutes: r.shortfallMinutes,
          exposure: r.estimatedExposure,
        }));

      const providerRates = (riskReport.providerSummary ?? []).map(p => ({
        name: p.providerName,
        rate: p.complianceRate,
        shortfall: p.totalShortfall,
      }));

      const schoolYear = riskReport.meta?.reportPeriod ?? new Date().getFullYear() + "–" + (new Date().getFullYear() + 1);

      // Best-effort fetch of the district's branding logo. If it isn't
      // configured (or the request fails), buildBoardSummaryHtml falls back
      // to a text-only header.
      let districtLogoUrl: string | null = null;
      try {
        const statusRes = await authFetch("/api/district-data/status");
        if (statusRes.ok) {
          const status = await statusRes.json() as { districtId?: number };
          if (status.districtId != null) {
            const dRes = await authFetch(`/api/districts/${status.districtId}`);
            if (dRes.ok) {
              const d = await dRes.json() as { logoUrl?: string | null };
              if (typeof d.logoUrl === "string" && d.logoUrl.trim().length > 0) {
                districtLogoUrl = d.logoUrl;
              }
            }
          }
        }
      } catch {
        // Logo is optional — header falls back to text-only.
      }

      const html = buildBoardSummaryHtml({
        districtName: riskReport.meta?.districtName ?? "District",
        districtLogoUrl,
        schoolYear,
        generatedAt: new Date().toISOString(),
        complianceRate: rs.overallComplianceRate,
        trendWeeks,
        kpis: {
          studentsServed: rs.totalStudents,
          servicesDeliveredPct: rs.overallComplianceRate,
          financialExposure: rs.combinedExposure,
          annualReviewsDue30,
        },
        topRiskStudents: topRisk,
        providerRates,
      });

      openPrintWindow(html);

      try {
        const recordRes = await authFetch("/api/reports/executive-summary/record-export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schoolId: schoolId ?? undefined,
            schoolYearId: schoolYearId ?? undefined,
            districtName: riskReport.meta?.districtName ?? "District",
            schoolYear,
            complianceRate: rs.overallComplianceRate,
            studentsServed: rs.totalStudents,
            generatedAt: new Date().toISOString(),
            htmlSnapshot: html,
          }),
        });
        if (!recordRes.ok) {
          let detail = "";
          try { const body = await recordRes.json(); detail = body?.error ?? ""; } catch {}
          console.warn(`Executive summary saved to PDF but not to history (HTTP ${recordRes.status}${detail ? `: ${detail}` : ""})`);
        }
      } catch (recordErr) {
        console.warn("Failed to record executive summary in export history:", recordErr);
      }
    } catch (err) {
      console.error("Failed to generate executive summary PDF:", err);
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function handleScheduleExecutiveSummary() {
    const emails = scheduleEmails
      .split(/[,\n;]+/)
      .map(e => e.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      toast({ title: "Add at least one recipient", description: "Enter the email addresses that should receive this report.", variant: "destructive" });
      return;
    }
    const invalid = emails.filter(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (invalid.length > 0) {
      toast({ title: "Invalid email address", description: invalid.join(", "), variant: "destructive" });
      return;
    }

    setScheduleSubmitting(true);
    try {
      const filters: Record<string, unknown> = {};
      if (schoolId) filters.schoolId = schoolId;
      const res = await authFetch("/api/reports/exports/scheduled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: "executive-summary",
          frequency: scheduleFrequency,
          format: "pdf",
          recipientEmails: emails,
          filters,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      toast({
        title: "Scheduled",
        description: `Executive Summary will be emailed ${scheduleFrequency} to ${emails.length} recipient${emails.length === 1 ? "" : "s"}.`,
      });
      setScheduleDialogOpen(false);
      setScheduleEmails("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create schedule";
      toast({ title: "Failed to schedule report", description: msg, variant: "destructive" });
    } finally {
      setScheduleSubmitting(false);
    }
  }

  const isLoading = progressLoading || reportLoading;
  const progressList = (progress as any[]) ?? [];
  const s = riskReport?.summary;

  // We deliberately exclude "no_data" requirements from both the numerator and
  // the denominator so the headline percentage reflects students we actually
  // have evidence about. A student whose every requirement is "no_data" is
  // counted in `studentsAwaitingData` and surfaced in a banner instead of being
  // silently classified as on-track or off-track.
  const { studentsOnTrack, totalStudents, studentsAwaitingData } = useMemo(() => {
    type Bucket = "ontrack" | "offtrack" | "nodata";
    const byStudent = new Map<number, Bucket>();
    for (const p of progressList) {
      const sid = p.studentId as number;
      const status = p.riskStatus;
      const cur = byStudent.get(sid);
      if (status === "on_track" || status === "completed") {
        if (cur !== "offtrack") byStudent.set(sid, cur === undefined || cur === "nodata" ? "ontrack" : cur);
      } else if (status === "no_data") {
        if (cur === undefined) byStudent.set(sid, "nodata");
      } else {
        byStudent.set(sid, "offtrack");
      }
    }
    let onTrack = 0;
    let trackedTotal = 0;
    let awaiting = 0;
    for (const v of byStudent.values()) {
      if (v === "nodata") awaiting++;
      else {
        trackedTotal++;
        if (v === "ontrack") onTrack++;
      }
    }
    return { studentsOnTrack: onTrack, totalStudents: trackedTotal, studentsAwaitingData: awaiting };
  }, [progressList]);

  const counts = progressList.reduce((acc: any, p: any) => {
    acc[p.riskStatus] = (acc[p.riskStatus] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const serviceTypeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of progressList) {
      if (p.serviceTypeId != null && p.serviceTypeName) seen.set(String(p.serviceTypeId), p.serviceTypeName);
    }
    return Array.from(seen.entries()).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [progressList]);
  const providerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of progressList) {
      if (p.providerId != null) {
        seen.set(String(p.providerId), p.providerName || `Provider #${p.providerId}`);
      }
    }
    return Array.from(seen.entries()).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [progressList]);

  const filtered = progressList.filter(p => {
    const matchRisk = riskFilter === "all" || p.riskStatus === riskFilter;
    const matchType = serviceTypeFilter === "all" || String(p.serviceTypeId ?? "") === serviceTypeFilter;
    const matchProvider = providerFilter === "all" || String(p.providerId ?? "") === providerFilter;
    return matchRisk && matchType && matchProvider;
  }).sort((a, b) => {
    return RISK_PRIORITY_ORDER.indexOf(a.riskStatus) - RISK_PRIORITY_ORDER.indexOf(b.riskStatus);
  });

  const serviceData = (complianceByService as any[]) ?? [];
  const chartData = serviceData.map(d => ({
    name: d.serviceTypeName?.split(" ").slice(0, 2).join(" "),
    "On Track": d.onTrack,
    "Behind": d.slightlyBehind ?? 0,
    "At Risk": (d.atRisk ?? 0) + (d.outOfCompliance ?? 0),
  }));

  const hasReport = !!riskReport && !reportError;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (isError) return <ErrorBanner message="Failed to load compliance data." onRetry={() => refetch()} />;
  if (!s && progressList.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No Compliance Data Yet"
        action={{ label: "Go to Students", href: "/students" }}
        secondaryAction={{ label: "Import Data", href: "/import", variant: "outline" }}
      >
        <EmptyStateDetail>
          This dashboard tracks whether your district is delivering every minute of IEP-mandated services. It monitors required vs. delivered minutes, flags students falling behind, calculates compensatory exposure, and shows provider delivery rates — the data a SPED director needs before every team meeting.
        </EmptyStateDetail>
        <EmptyStateHeading>Before this dashboard can show data, you need:</EmptyStateHeading>
        <EmptyStateStep number={1}><strong>Students</strong> — Add your SPED roster (manually or via SIS import).</EmptyStateStep>
        <EmptyStateStep number={2}><strong>IEP Documents</strong> — Create an IEP for each student with start/end dates.</EmptyStateStep>
        <EmptyStateStep number={3}><strong>Service Requirements</strong> — Define what each IEP mandates (e.g., "Speech-Language Therapy, 120 min/month").</EmptyStateStep>
        <EmptyStateStep number={4}><strong>Session Logs</strong> — Providers log completed, missed, or cancelled sessions against those requirements.</EmptyStateStep>
        <EmptyStateDetail>
          Once sessions are flowing, this dashboard updates in real time — no manual report generation needed.
        </EmptyStateDetail>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-5">
      {hasReport && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            onClick={handleGenerateExecutiveSummary}
            disabled={generatingPdf}
          >
            {generatingPdf
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
              : <><FileText className="w-3.5 h-3.5" /> Generate Executive Summary</>
            }
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            onClick={() => setScheduleDialogOpen(true)}
            data-testid="button-schedule-executive-summary"
          >
            <Mail className="w-3.5 h-3.5" /> Schedule this report
          </Button>
        </div>
      )}

      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Executive Summary</DialogTitle>
            <DialogDescription>
              Email the Executive Summary PDF on a regular cadence — for example, to your superintendent. Recipients can unsubscribe with one click from the email footer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-frequency">Frequency</Label>
              <Select value={scheduleFrequency} onValueChange={(v) => setScheduleFrequency(v as "weekly" | "monthly")}>
                <SelectTrigger id="schedule-frequency" data-testid="select-schedule-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly (every Monday)</SelectItem>
                  <SelectItem value="monthly">Monthly (1st of each month)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-emails">Recipient emails</Label>
              <Input
                id="schedule-emails"
                placeholder="superintendent@district.org, board.chair@district.org"
                value={scheduleEmails}
                onChange={(e) => setScheduleEmails(e.target.value)}
                data-testid="input-schedule-emails"
              />
              <p className="text-xs text-gray-500">Separate multiple addresses with commas.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)} disabled={scheduleSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleScheduleExecutiveSummary}
              disabled={scheduleSubmitting}
              data-testid="button-confirm-schedule"
            >
              {scheduleSubmitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Scheduling…</> : "Schedule report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {reportError && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          Summary metrics, provider delivery, and needs-attention data are unavailable. Service requirement details are shown below.
        </div>
      )}
      {progressList.length === 0 && !isLoading && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">No service requirements yet</div>
            <div className="text-blue-800/80 text-[13px] mt-0.5">
              Compliance metrics will appear here once students have active service
              requirements with logged or scheduled minutes.
            </div>
          </div>
        </div>
      )}
      {studentsAwaitingData > 0 && progressList.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">No sessions logged yet this period</div>
            <div className="text-blue-800/80 text-[13px] mt-0.5">
              {studentsAwaitingData} student{studentsAwaitingData === 1 ? "" : "s"} have
              service requirements but no logged sessions in the current interval.
              Status will update once delivery data is recorded.
            </div>
          </div>
        </div>
      )}
      {hasReport && <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="border-l-4 border-l-gray-400">
          <CardContent className="p-3.5">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> Required
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{fmtNum(s?.totalRequiredMinutes ?? 0)}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              minutes this period
              {s?.totalExpectedByNow != null && s.totalExpectedByNow > 0 && (
                <span className="ml-1 text-gray-300">· {fmtNum(s.totalExpectedByNow)} expected so far</span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-3.5">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle className="h-3 w-3" /> Delivered
            </div>
            <div className="text-2xl font-bold text-emerald-700 mt-1">{fmtNum(s?.totalDeliveredMinutes ?? 0)}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              {s?.overallComplianceRate ?? 0}% of period total
              {s?.paceComplianceRate != null && s.paceComplianceRate !== s.overallComplianceRate && (
                <span className={`ml-1 font-medium ${s.paceComplianceRate >= 100 ? "text-emerald-600" : s.paceComplianceRate >= 85 ? "text-amber-600" : "text-red-600"}`}>
                  · {s.paceComplianceRate}% on pace
                </span>
              )}
            </div>
          </CardContent>
        </Card>
        {(() => {
          const paceShortfall = s?.paceShortfall ?? 0;
          const paceAheadBy = s?.paceAheadBy ?? 0;
          const onPace = paceShortfall === 0;
          return (
            <Card className={`border-l-4 ${onPace ? "border-l-emerald-500" : paceShortfall > 0 ? "border-l-red-500" : "border-l-emerald-500"}`}>
              <CardContent className="p-3.5">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingDown className="h-3 w-3" /> {onPace ? "Pace" : "Behind Pace"}
                </div>
                <div className={`text-2xl font-bold mt-1 ${onPace ? "text-emerald-700" : "text-red-700"}`}>
                  {onPace ? (paceAheadBy > 0 ? `+${fmtNum(paceAheadBy)}` : "On pace") : fmtNum(paceShortfall)}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {onPace
                    ? paceAheadBy > 0 ? "min ahead of schedule" : "on schedule"
                    : "minutes behind schedule"}
                </div>
              </CardContent>
            </Card>
          );
        })()}
        <Card className={`border-l-4 ${(s?.studentsAtRisk ?? 0) + (s?.studentsOutOfCompliance ?? 0) > 0 ? "border-l-amber-500" : "border-l-emerald-500"}`}>
          <CardContent className="p-3.5">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" /> At Risk
            </div>
            <div className={`text-2xl font-bold mt-1 ${(s?.studentsAtRisk ?? 0) + (s?.studentsOutOfCompliance ?? 0) > 0 ? "text-amber-700" : "text-emerald-700"}`}>
              {(s?.studentsOutOfCompliance ?? 0) + (s?.studentsAtRisk ?? 0)}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              of {s?.totalStudents ?? totalStudents} students
            </div>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${(s?.combinedExposure ?? 0) > 0 ? "border-l-red-500" : "border-l-emerald-500"}`}>
          <CardContent className="p-3.5">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="h-3 w-3" /> Exposure
            </div>
            <div className={`text-2xl font-bold mt-1 ${(s?.combinedExposure ?? 0) > 0 ? "text-red-700" : "text-emerald-700"}`}>
              {fmtDollars(s?.combinedExposure ?? 0)}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">estimated compensatory cost</div>
          </CardContent>
        </Card>
      </div>}

      <RecommendationsPanel
        riskReport={hasReport ? (riskReport as any) : undefined}
        riskReportError={!!reportError}
        progressList={progressList}
        complianceByService={serviceData}
        schoolId={schoolId}
      />

      {hasReport && (riskReport?.needsAttention?.length ?? 0) > 0 && (
        <Card className="border-red-200/60">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-red-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                Needs Attention ({riskReport!.needsAttention.length})
              </CardTitle>
              <div className="flex items-center gap-1">
                <Link href="/scheduling?tab=minutes">
                  <Button variant="ghost" size="sm" className="text-xs text-blue-600 hover:text-blue-700 gap-1 h-7">
                    <Calendar className="w-3 h-3" /> Schedule Sessions
                  </Button>
                </Link>
                <Link href="/compliance-risk-report">
                  <Button variant="ghost" size="sm" className="text-xs text-gray-500 gap-1 h-7">
                    Full Report <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Student</th>
                    <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Service</th>
                    <th className="text-right px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Required</th>
                    <th className="text-right px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Delivered</th>
                    <th className="text-right px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Shortfall</th>
                    <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Risk</th>
                    <th className="text-right px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Exposure</th>
                    <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Provider</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {riskReport!.needsAttention.slice(0, 10).map((r, i) => {
                    const cfg = RISK_CONFIG[r.riskStatus] ?? RISK_CONFIG.at_risk;
                    const isAtRisk = r.riskStatus === "at_risk" || r.riskStatus === "out_of_compliance";
                    return (
                      <tr key={`${r.studentId}-${r.service}-${i}`} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5">
                          <Link href={`/students/${r.studentId}`} className="text-[13px] font-medium text-gray-800 hover:text-emerald-700">
                            {r.studentName}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-[12px] text-gray-500">{r.service}</td>
                        <td className="px-4 py-2.5 text-[13px] text-gray-600 text-right tabular-nums">{r.requiredMinutes}</td>
                        <td className="px-4 py-2.5 text-[13px] text-gray-600 text-right tabular-nums">{r.deliveredMinutes}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="text-[13px] font-semibold text-red-700 tabular-nums">{r.shortfallMinutes}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                            {r.riskLabel}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {r.estimatedExposure > 0 ? (
                            <button
                              onClick={() => setDrilldownStudent({ studentId: r.studentId, studentName: r.studentName })}
                              className="text-[12px] font-medium text-red-700 tabular-nums underline decoration-dashed decoration-red-300 underline-offset-2 hover:text-red-900 transition-colors cursor-pointer"
                              title="Click to see itemised breakdown"
                              data-testid={`button-exposure-${r.studentId}`}
                            >
                              {fmtDollars(r.estimatedExposure)}
                            </button>
                          ) : (
                            <span className="text-[12px] font-medium text-gray-400 tabular-nums">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-[12px] text-gray-500">{r.providerName}</td>
                        <td className="px-4 py-2.5">
                          {isAtRisk && (
                            <Link
                              href={`/scheduling?tab=minutes&studentId=${r.studentId}`}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
                              data-testid={`link-schedule-${r.studentId}`}
                            >
                              <CalendarPlus className="w-3 h-3" /> Schedule sessions
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {riskReport!.needsAttention.length > 10 && (
              <div className="px-4 py-2 text-[11px] text-gray-400 text-center border-t border-gray-100">
                Showing 10 of {riskReport!.needsAttention.length} — <Link href="/compliance-risk-report" className="text-emerald-600 hover:underline">view full report</Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className={`grid grid-cols-1 gap-5 ${hasReport ? "lg:grid-cols-12" : ""}`}>
        <Card className={hasReport ? "lg:col-span-8" : ""}>
          <CardHeader className="pb-0 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-gray-700">Compliance by Service Type</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 px-4">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }} />
                  <Bar dataKey="On Track" fill="#10b981" radius={[2, 2, 0, 0]} stackId="a" />
                  <Bar dataKey="Behind" fill="#f59e0b" radius={[0, 0, 0, 0]} stackId="a" />
                  <Bar dataKey="At Risk" fill="#ef4444" radius={[2, 2, 0, 0]} stackId="a" />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-gray-400">No service data available</div>
            )}
          </CardContent>
        </Card>

        {hasReport && (
          <Card className="lg:col-span-4">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" />
                Provider Delivery
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {(riskReport?.providerSummary?.length ?? 0) === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">No provider data</div>
              ) : (
                <div className="space-y-2">
                  {(showAllProviders ? riskReport!.providerSummary : riskReport!.providerSummary.slice(0, 6)).map((p, i) => {
                    const pct = Math.min(100, p.complianceRate);
                    const color = pct >= 90 ? "#10b981" : pct >= 75 ? "#f59e0b" : "#ef4444";
                    return (
                      <div key={`${p.providerName}-${i}`} className="flex items-center gap-3">
                        <div className="w-24 truncate text-[12px] text-gray-600 font-medium" title={p.providerName}>
                          {p.providerName}
                        </div>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                        </div>
                        <div className="w-14 text-right">
                          <span className="text-[12px] font-semibold tabular-nums" style={{ color }}>{p.complianceRate.toFixed(0)}%</span>
                        </div>
                        {p.totalShortfall > 0 && (
                          <div className="w-16 text-right text-[11px] text-red-600 font-medium tabular-nums">
                            -{fmtNum(p.totalShortfall)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {riskReport!.providerSummary.length > 6 && (
                    <button onClick={() => setShowAllProviders(!showAllProviders)}
                      className="w-full text-center text-[11px] text-gray-400 hover:text-gray-600 py-1 flex items-center justify-center gap-1">
                      {showAllProviders ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {showAllProviders ? "Show less" : `Show all ${riskReport!.providerSummary.length}`}
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1">Filter:</span>
        <button aria-pressed={riskFilter === "all"} onClick={() => setRiskFilter("all")} className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all ${
          riskFilter === "all" ? "bg-gray-800 text-white" : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
        }`}>All ({progressList.length})</button>
        {["out_of_compliance", "at_risk", "slightly_behind", "no_data", "on_track"].map(r => {
          const cfg = RISK_CONFIG[r];
          return (
            <button key={r} aria-pressed={riskFilter === r} onClick={() => setRiskFilter(riskFilter === r ? "all" : r)} className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all ${
              riskFilter === r ? "bg-gray-800 text-white" : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
            }`}>{cfg.label} ({counts[r] ?? 0})</button>
          );
        })}
        <div className="w-px bg-gray-200 mx-1 self-stretch" />
        <select
          value={serviceTypeFilter}
          onChange={e => setServiceTypeFilter(e.target.value)}
          className="h-8 text-[12px] bg-white border border-gray-200 rounded-md px-2 text-gray-600 hover:border-gray-300"
        >
          <option value="all">All service types</option>
          {serviceTypeOptions.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <select
          value={providerFilter}
          onChange={e => setProviderFilter(e.target.value)}
          className="h-8 text-[12px] bg-white border border-gray-200 rounded-md px-2 text-gray-600 hover:border-gray-300"
        >
          <option value="all">All providers</option>
          {providerOptions.map(p => <option key={p.id} value={p.label}>{p.label}</option>)}
        </select>
        {(serviceTypeFilter !== "all" || providerFilter !== "all" || riskFilter !== "all") && (
          <button onClick={() => { setServiceTypeFilter("all"); setProviderFilter("all"); setRiskFilter("all"); }}
            className="text-[11px] text-gray-500 hover:text-gray-800 px-2 py-1 rounded-md border border-gray-200 bg-white hover:border-gray-300">
            Clear
          </button>
        )}
        <span className="text-[11px] text-gray-400 ml-auto">{filtered.length} of {progressList.length} records</span>
      </div>

      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No records match filter" description="Try a different risk filter." compact />
        ) : filtered.slice(0, 50).map((p: any, i: number) => {
          const cfg = RISK_CONFIG[p.riskStatus] ?? RISK_CONFIG.on_track;
          const pct = Math.min(100, p.percentComplete ?? 0);
          const isAtRisk = p.riskStatus === "at_risk" || p.riskStatus === "out_of_compliance";
          return (
            <Card key={i} className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Link href={`/students/${p.studentId}`} className="text-sm font-medium text-gray-800 truncate hover:text-emerald-700 block">{p.studentName}</Link>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{p.serviceTypeName}</p>
                </div>
                <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} flex-shrink-0`}>
                  {cfg.label}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: cfg.ringColor }} />
                </div>
                <span className="text-[11px] text-gray-500 font-medium">{pct}%</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-[11px] text-gray-400">{p.deliveredMinutes} / {p.requiredMinutes} min · {p.remainingMinutes > 0 ? `${p.remainingMinutes} min remaining` : "Complete"}</p>
                {isAtRisk && (
                  <Link
                    href={`/scheduling?tab=minutes&studentId=${p.studentId}`}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap flex-shrink-0"
                  >
                    <CalendarPlus className="w-3 h-3" /> Schedule
                  </Link>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="hidden md:block">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">
            All Service Requirements ({filtered.length})
          </h3>
          {!showAllStudents && filtered.length > 50 && (
            <Button variant="ghost" size="sm" onClick={() => setShowAllStudents(true)} className="text-xs text-gray-400 gap-1 h-7">
              Show all <ChevronDown className="w-3 h-3" />
            </Button>
          )}
          {showAllStudents && (
            <Button variant="ghost" size="sm" onClick={() => setShowAllStudents(false)} className="text-xs text-gray-400 gap-1 h-7">
              Show less <ChevronUp className="w-3 h-3" />
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Student</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Service</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Progress</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Delivered</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Remaining</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState icon={ClipboardCheck} title="No records match filter" description="Try a different risk filter." compact />
                  </td>
                </tr>
              ) : (showAllStudents ? filtered : filtered.slice(0, 50)).map((p: any, i: number) => {
                const cfg = RISK_CONFIG[p.riskStatus] ?? RISK_CONFIG.on_track;
                const pct = Math.min(100, p.percentComplete ?? 0);
                const isAtRisk = p.riskStatus === "at_risk" || p.riskStatus === "out_of_compliance";
                return (
                  <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-2.5">
                      <Link href={`/students/${p.studentId}`} className="text-[13px] font-medium text-gray-800 hover:text-emerald-700">
                        {p.studentName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-gray-500 max-w-[160px] truncate">{p.serviceTypeName}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 w-32">
                      <div className="flex items-center gap-2">
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: cfg.ringColor }} />
                        </div>
                        <span className="text-[11px] text-gray-500 w-8 text-right font-medium tabular-nums">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-gray-600 text-right tabular-nums">{p.deliveredMinutes} / {p.requiredMinutes}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`text-[12px] font-medium ${p.remainingMinutes > 0 ? cfg.color : "text-emerald-600"}`}>
                        {p.remainingMinutes > 0 ? `${p.remainingMinutes} min` : "Complete"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {isAtRisk && (
                        <Link
                          href={`/scheduling?tab=minutes&studentId=${p.studentId}`}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
                          data-testid={`link-schedule-row-${p.studentId}`}
                        >
                          <CalendarPlus className="w-3 h-3" /> Schedule sessions
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!showAllStudents && filtered.length > 50 && (
            <div className="px-4 py-2 text-[11px] text-gray-400 text-center border-t border-gray-100">
              Showing 50 of {filtered.length} —
              <button onClick={() => setShowAllStudents(true)} className="text-emerald-600 hover:underline ml-1">show all</button>
            </div>
          )}
        </div>
      </Card>

      <ExposureDetailPanel
        studentId={drilldownStudent?.studentId ?? null}
        studentName={drilldownStudent?.studentName}
        onClose={() => setDrilldownStudent(null)}
      />
    </div>
  );
}

function ShareSnapshotButton() {
  const { toast } = useToast();
  const [state, setState] = useState<"idle" | "loading" | "copied">("idle");

  async function handleShare() {
    setState("loading");
    try {
      const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
      const res = await authFetch(`${base}/api/compliance/share-snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed");
      const { token } = await res.json();
      const url = `${window.location.origin}${base}/share/compliance/${token}`;
      await navigator.clipboard.writeText(url);
      setState("copied");
      toast({ title: "Link copied!", description: "Snapshot link is valid for 7 days. Paste it anywhere to share." });
      setTimeout(() => setState("idle"), 3000);
    } catch {
      setState("idle");
      toast({ title: "Failed to create snapshot", description: "Please try again.", variant: "destructive" });
    }
  }

  return (
    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleShare} disabled={state === "loading"}>
      {state === "copied" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : state === "loading" ? (
        <div className="w-3.5 h-3.5 border border-gray-400 border-t-gray-700 rounded-full animate-spin" />
      ) : <Share2 className="w-3.5 h-3.5" />}
      {state === "copied" ? "Link copied!" : state === "loading" ? "Creating…" : "Share Snapshot"}
    </Button>
  );
}

export default function CompliancePage() {
  const [activeTab, setTab] = useQueryTab();

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Compliance & Service Delivery</h1>
          <p className="text-xs md:text-sm text-gray-400 mt-1">Required vs. delivered minutes · shortfall tracking · compensatory exposure</p>
        </div>
        {activeTab === "minutes" && (
          <div className="flex items-center gap-2">
            <ShareSnapshotButton />
            <Link href="/weekly-compliance-summary">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Printer className="w-3.5 h-3.5" /> Weekly Summary
              </Button>
            </Link>
          </div>
        )}
      </div>

      <DeseComplianceBanner />

      <div className="flex items-center gap-1 border-b border-gray-200 mb-5 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-all whitespace-nowrap ${
              activeTab === t.key
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "minutes" && <ServiceMinutesContent />}
      {activeTab === "checklist" && (
        <FeatureGate featureKey={"compliance.checklist" satisfies FeatureKey}>
          <ComplianceChecklist embedded />
        </FeatureGate>
      )}
      {activeTab === "timeline" && <ComplianceTimelinePage embedded />}
      {activeTab === "trends" && <ComplianceTrendsPage embedded />}
      {activeTab === "risk-report" && <ComplianceRiskReportPage embedded />}
    </div>
  );
}
