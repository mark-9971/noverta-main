import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListMinuteProgress, useGetComplianceByService } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ClipboardCheck, Timer, ListChecks, Calendar, AlertTriangle,
  Clock, DollarSign, Users, TrendingDown, ChevronDown, ChevronUp,
  Printer, ArrowRight, CheckCircle, FileBarChart, Clipboard,
} from "lucide-react";
import { EmptyState, EmptyStateStep, EmptyStateHeading, EmptyStateDetail } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Link, useSearch, useLocation } from "wouter";
import { RISK_CONFIG, RISK_PRIORITY_ORDER } from "@/lib/constants";
import { useSchoolContext } from "@/lib/school-context";
import { FeatureGate } from "@/components/FeatureGate";
import { type FeatureKey } from "@/lib/module-tiers";
import { authFetch } from "@/lib/auth-fetch";
import ComplianceChecklist from "./compliance-checklist";
import ComplianceTimelinePage from "./compliance-timeline";
import ComplianceTrendsPage from "./compliance-trends";
import ComplianceRiskReportPage from "./compliance-risk-report";
import RecommendationsPanel from "@/components/compliance/RecommendationsPanel";
import Sessions from "./sessions";

const TABS = [
  { key: "minutes", label: "Service Minutes", icon: Timer },
  { key: "sessions", label: "Sessions", icon: Clipboard },
  { key: "checklist", label: "Checklist", icon: ListChecks },
  { key: "timeline", label: "Timeline", icon: Calendar },
  { key: "trends", label: "Trends", icon: TrendingDown },
  { key: "risk-report", label: "Risk Report", icon: FileBarChart },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function resolveTab(search: string): TabKey {
  const key = new URLSearchParams(search).get("tab") ?? "";
  return TABS.some(t => t.key === key) ? (key as TabKey) : "minutes";
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

function ServiceMinutesContent() {
  const { typedFilter } = useSchoolContext();
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [showAllProviders, setShowAllProviders] = useState(false);
  const { data: progress, isLoading: progressLoading, isError, refetch } = useListMinuteProgress(typedFilter);
  const { data: complianceByService } = useGetComplianceByService(typedFilter);

  const schoolId = (typedFilter as any)?.schoolId;
  const { data: riskReport, isLoading: reportLoading, isError: reportError } = useQuery<RiskReportData>({
    queryKey: ["/api/reports/compliance-risk-report", schoolId],
    queryFn: async () => {
      const params = schoolId ? `?schoolId=${schoolId}` : "";
      const res = await authFetch(`/api/reports/compliance-risk-report${params}`);
      if (!res.ok) throw new Error(res.status === 403 ? "forbidden" : "Failed");
      return res.json();
    },
    staleTime: 30_000,
    retry: (count, err) => {
      if (err instanceof Error && err.message === "forbidden") return false;
      return count < 2;
    },
  });

  const isLoading = progressLoading || reportLoading;
  const progressList = (progress as any[]) ?? [];
  const s = riskReport?.summary;

  const { studentsOnTrack, totalStudents } = useMemo(() => {
    const byStudent = new Map<number, boolean>();
    for (const p of progressList) {
      const sid = p.studentId as number;
      const isOnTrack = p.riskStatus === "on_track" || p.riskStatus === "completed";
      if (!byStudent.has(sid)) {
        byStudent.set(sid, isOnTrack);
      } else if (!isOnTrack) {
        byStudent.set(sid, false);
      }
    }
    let onTrack = 0;
    for (const v of byStudent.values()) if (v) onTrack++;
    return { studentsOnTrack: onTrack, totalStudents: byStudent.size };
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
      {reportError && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          Summary metrics, provider delivery, and needs-attention data are unavailable. Service requirement details are shown below.
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
              <Link href="/compliance-risk-report">
                <Button variant="ghost" size="sm" className="text-xs text-gray-500 gap-1 h-7">
                  Full Report <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {riskReport!.needsAttention.slice(0, 10).map((r, i) => {
                    const cfg = RISK_CONFIG[r.riskStatus] ?? RISK_CONFIG.at_risk;
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
                          <span className="text-[12px] font-medium text-red-700 tabular-nums">
                            {r.estimatedExposure > 0 ? fmtDollars(r.estimatedExposure) : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-[12px] text-gray-500">{r.providerName}</td>
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
        {["out_of_compliance", "at_risk", "slightly_behind", "on_track"].map(r => {
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
          return (
            <Link key={i} href={`/students/${p.studentId}`}>
              <Card className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{p.studentName}</p>
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
                <p className="text-[11px] text-gray-400 mt-1">{p.deliveredMinutes} / {p.requiredMinutes} min · {p.remainingMinutes > 0 ? `${p.remainingMinutes} min remaining` : "Complete"}</p>
              </Card>
            </Link>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState icon={ClipboardCheck} title="No records match filter" description="Try a different risk filter." compact />
                  </td>
                </tr>
              ) : (showAllStudents ? filtered : filtered.slice(0, 50)).map((p: any, i: number) => {
                const cfg = RISK_CONFIG[p.riskStatus] ?? RISK_CONFIG.on_track;
                const pct = Math.min(100, p.percentComplete ?? 0);
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
    </div>
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
            <Link href="/weekly-compliance-summary">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Printer className="w-3.5 h-3.5" /> Weekly Summary
              </Button>
            </Link>
          </div>
        )}
      </div>

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
      {activeTab === "sessions" && <Sessions embedded />}
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
