import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Download, AlertTriangle, CheckCircle, TrendingDown, Users, DollarSign, Clock, ChevronDown, ChevronUp, Settings as SettingsIcon, CalendarPlus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link, useLocation } from "wouter";
import { openPrintWindow } from "@/lib/print-document";
import { toast } from "sonner";
import { EmptyState, EmptyStateStep, EmptyStateHeading, EmptyStateDetail } from "@/components/ui/empty-state";
import ExposureDetailPanel from "@/components/compliance/ExposureDetailPanel";
import { recommendAction, HANDLING_LABELS, HANDLING_BADGE } from "@/lib/action-recommendations";
import { useHandlingState } from "@/lib/use-handling-state";
import { useRole } from "@/lib/role-context";
import { buildScheduleMakeupHref, riskRowItemId } from "@/lib/schedule-makeup";

interface StudentRow {
  studentId: number;
  studentName: string;
  school: string;
  grade: string;
  service: string;
  serviceRequirementId: number;
  intervalType: string;
  requiredMinutes: number;
  deliveredMinutes: number;
  shortfallMinutes: number;
  percentComplete: number;
  riskStatus: string;
  riskLabel: string;
  providerName: string;
  estimatedExposure: number | null;
  rateConfigured?: boolean;
  missedSessions: number;
}

interface ProviderRow {
  providerName: string;
  studentsServed: number;
  totalDelivered: number;
  totalRequired: number;
  totalShortfall: number;
  complianceRate: number;
  servicesCount: number;
}

interface ReportData {
  meta: {
    districtName: string;
    generatedAt: string;
    reportPeriod: string;
    schoolFilter: number | null;
    complianceMinuteThreshold: number;
  };
  summary: {
    totalStudents: number;
    totalServiceRequirements: number;
    totalRequiredMinutes: number;
    totalDeliveredMinutes: number;
    totalShortfallMinutes: number;
    overallComplianceRate: number;
    totalCurrentExposure: number;
    existingCompensatoryExposure: number | null;
    existingCompensatoryUnpricedMinutes?: number;
    unpricedShortfallMinutes?: number;
    unpricedShortfallServiceTypes?: string[];
    rateConfigNote?: string | null;
    combinedExposure: number;
    studentsOutOfCompliance: number;
    studentsAtRisk: number;
    studentsOnTrack: number;
  };
  needsAttention: StudentRow[];
  studentDetail: StudentRow[];
  providerSummary: ProviderRow[];
}

function riskBadge(status: string, label: string) {
  const cls =
    status === "out_of_compliance" ? "bg-red-100 text-red-800 border-red-200" :
    status === "at_risk" ? "bg-amber-100 text-amber-800 border-amber-200" :
    status === "slightly_behind" ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
    "bg-emerald-100 text-emerald-800 border-emerald-200";
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>{label}</span>;
}

function fmtDollars(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtNum(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function pctBar(pct: number) {
  const w = Math.min(100, Math.max(0, pct));
  const color = pct >= 90 ? "bg-emerald-500" : pct >= 75 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
      </div>
      <span className="text-xs text-gray-600 font-medium w-10 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

function buildPrintHtml(data: ReportData): string {
  const s = data.summary;
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const riskBadgeHtml = (status: string, label: string) => {
    const bg = status === "out_of_compliance" ? "#fee2e2" : status === "at_risk" ? "#fef3c7" : status === "slightly_behind" ? "#fef9c3" : "#d1fae5";
    const color = status === "out_of_compliance" ? "#b91c1c" : status === "at_risk" ? "#92400e" : status === "slightly_behind" ? "#854d0e" : "#065f46";
    return `<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:10px;font-weight:600;background:${bg};color:${color}">${esc(label)}</span>`;
  };

  const pctBarHtml = (pct: number) => {
    const w = Math.min(100, Math.max(0, pct));
    const color = pct >= 90 ? "#059669" : pct >= 75 ? "#f59e0b" : "#ef4444";
    return `<div style="display:flex;align-items:center;gap:6px"><div style="width:60px;height:6px;background:#f3f4f6;border-radius:3px;overflow:hidden"><div style="height:100%;width:${w}%;background:${color};border-radius:3px"></div></div><span style="font-size:10px;color:#6b7280">${pct.toFixed(0)}%</span></div>`;
  };

  const needsAttnRows = data.needsAttention.slice(0, 25).map(r => `
    <tr>
      <td>${esc(r.studentName)}</td>
      <td>${esc(r.school)}</td>
      <td>${esc(r.service)}</td>
      <td style="text-align:right">${r.requiredMinutes}</td>
      <td style="text-align:right">${r.deliveredMinutes}</td>
      <td style="text-align:right;font-weight:600;color:#b91c1c">${r.shortfallMinutes}</td>
      <td>${riskBadgeHtml(r.riskStatus, r.riskLabel)}</td>
      <td style="text-align:right">${(r.estimatedExposure ?? 0) > 0 ? "$" + (r.estimatedExposure ?? 0).toLocaleString() : "—"}</td>
      <td>${esc(r.providerName)}</td>
    </tr>`).join("");

  const studentRows = data.studentDetail.map(r => `
    <tr>
      <td>${esc(r.studentName)}</td>
      <td>${esc(r.school)}</td>
      <td>${esc(r.grade)}</td>
      <td>${esc(r.service)}</td>
      <td style="text-align:right">${r.requiredMinutes}</td>
      <td style="text-align:right">${r.deliveredMinutes}</td>
      <td style="text-align:right">${r.shortfallMinutes > 0 ? r.shortfallMinutes : "—"}</td>
      <td>${pctBarHtml(r.percentComplete)}</td>
      <td>${riskBadgeHtml(r.riskStatus, r.riskLabel)}</td>
      <td style="text-align:right">${(r.estimatedExposure ?? 0) > 0 ? "$" + (r.estimatedExposure ?? 0).toLocaleString() : "—"}</td>
      <td>${esc(r.providerName)}</td>
    </tr>`).join("");

  const providerRows = data.providerSummary.map(r => `
    <tr>
      <td>${esc(r.providerName)}</td>
      <td style="text-align:right">${r.studentsServed}</td>
      <td style="text-align:right">${r.totalRequired.toLocaleString()}</td>
      <td style="text-align:right">${r.totalDelivered.toLocaleString()}</td>
      <td style="text-align:right;${r.totalShortfall > 0 ? "font-weight:600;color:#b91c1c" : ""}">${r.totalShortfall > 0 ? r.totalShortfall.toLocaleString() : "—"}</td>
      <td>${pctBarHtml(r.complianceRate)}</td>
    </tr>`).join("");

  const genDate = new Date(data.meta.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Compliance Risk Report — ${esc(data.meta.districtName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; font-size: 11px; color: #111827; margin: 0; padding: 0; background: white; }
  .page-wrap { max-width: 8.5in; margin: 0 auto; padding: 0.4in 0.5in 0.5in; }
  .header { border-bottom: 3px solid #059669; padding-bottom: 10px; margin-bottom: 16px; }
  .header h1 { font-size: 18px; font-weight: bold; margin: 0 0 2px; color: #111827; }
  .header .subtitle { font-size: 11px; color: #6b7280; margin: 2px 0; }
  .header .meta { font-size: 9px; color: #9ca3af; }
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
  .stat-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; }
  .stat-card .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; margin-bottom: 2px; }
  .stat-card .value { font-size: 20px; font-weight: 700; color: #111827; }
  .stat-card .detail { font-size: 9px; color: #6b7280; margin-top: 2px; }
  .stat-card.danger { border-left: 3px solid #ef4444; }
  .stat-card.warning { border-left: 3px solid #f59e0b; }
  .stat-card.success { border-left: 3px solid #059669; }
  .stat-card.info { border-left: 3px solid #3b82f6; }
  h2 { font-size: 12px; font-weight: bold; color: #047857; border-bottom: 1.5px solid #059669; padding-bottom: 3px; margin: 18px 0 8px; text-transform: uppercase; letter-spacing: 0.02em; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 14px; font-size: 10px; }
  th { background: #f3f4f6; padding: 5px 6px; border: 1px solid #e5e7eb; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.03em; color: #6b7280; }
  td { padding: 4px 6px; border: 1px solid #e5e7eb; vertical-align: middle; }
  tr:nth-child(even) td { background: #fafafa; }
  .confidential { margin-top: 16px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 8px; color: #9ca3af; text-align: center; }
  @media print {
    body { font-size: 10px; }
    .page-wrap { padding: 0.2in 0.4in 0.4in; }
    .summary-grid { gap: 6px; }
    h2 { margin-top: 12px; }
    table { font-size: 9px; }
    .stat-card .value { font-size: 17px; }
    .no-print { display: none !important; }
  }
  @page { margin: 0.3in; size: letter landscape; }
</style></head><body>
<div class="page-wrap">
  <div class="header">
    <h1>Compliance Risk Report</h1>
    <div class="subtitle">${esc(data.meta.districtName)} — ${esc(data.meta.reportPeriod)}</div>
    <div class="meta">Generated ${genDate} | Compliance threshold: ${data.meta.complianceMinuteThreshold}% of required minutes | CONFIDENTIAL — Contains Protected Student Information (FERPA)</div>
  </div>

  <div class="summary-grid">
    <div class="stat-card info">
      <div class="label">Students with Services</div>
      <div class="value">${s.totalStudents}</div>
      <div class="detail">${s.totalServiceRequirements} service requirements</div>
    </div>
    <div class="stat-card ${s.overallComplianceRate >= 90 ? "success" : s.overallComplianceRate >= 75 ? "warning" : "danger"}">
      <div class="label">Overall Compliance</div>
      <div class="value">${s.overallComplianceRate}%</div>
      <div class="detail">${s.totalDeliveredMinutes.toLocaleString()} of ${s.totalRequiredMinutes.toLocaleString()} min delivered</div>
    </div>
    <div class="stat-card danger">
      <div class="label">Total Shortfall</div>
      <div class="value">${s.totalShortfallMinutes.toLocaleString()} min</div>
      <div class="detail">${s.studentsOutOfCompliance} out of compliance, ${s.studentsAtRisk} at risk</div>
    </div>
    <div class="stat-card danger">
      <div class="label">Estimated Exposure</div>
      <div class="value">$${s.combinedExposure.toLocaleString()}</div>
      <div class="detail">Current: $${s.totalCurrentExposure.toLocaleString()} + Prior comp: ${s.existingCompensatoryExposure != null ? `$${s.existingCompensatoryExposure.toLocaleString()}` : `${(s.existingCompensatoryUnpricedMinutes ?? 0).toLocaleString()} min (rate not configured)`}</div>
      ${s.rateConfigNote ? `<div class="detail" style="margin-top:4px;color:#92400e">${esc(s.rateConfigNote)}</div>` : ""}
    </div>
  </div>

  ${data.needsAttention.length > 0 ? `
  <h2>Needs Attention This Period (${data.needsAttention.length} items)</h2>
  <table>
    <thead><tr><th>Student</th><th>School</th><th>Service</th><th style="text-align:right">Required</th><th style="text-align:right">Delivered</th><th style="text-align:right">Shortfall</th><th>Risk</th><th style="text-align:right">Exposure</th><th>Provider</th></tr></thead>
    <tbody>${needsAttnRows}</tbody>
  </table>` : ""}

  <h2>Full Student Compliance Detail (${data.studentDetail.length} rows)</h2>
  <table>
    <thead><tr><th>Student</th><th>School</th><th>Gr</th><th>Service</th><th style="text-align:right">Required</th><th style="text-align:right">Delivered</th><th style="text-align:right">Shortfall</th><th>Progress</th><th>Risk</th><th style="text-align:right">Exposure</th><th>Provider</th></tr></thead>
    <tbody>${studentRows}</tbody>
  </table>

  <h2>Provider Delivery Summary (${data.providerSummary.length} providers)</h2>
  <table>
    <thead><tr><th>Provider</th><th style="text-align:right">Students</th><th style="text-align:right">Required Min</th><th style="text-align:right">Delivered Min</th><th style="text-align:right">Shortfall</th><th>Compliance</th></tr></thead>
    <tbody>${providerRows}</tbody>
  </table>

  <div class="confidential">Trellis — Compliance Risk Report | ${esc(data.meta.districtName)} | ${genDate} | CONFIDENTIAL</div>
</div>
</body></html>`;
}

const RISK_ORDER: Record<string, number> = {
  out_of_compliance: 0,
  at_risk: 1,
  slightly_behind: 2,
  no_data: 3,
  on_track: 4,
  completed: 5,
};

/**
 * Phase 1D — Needs-Attention row with inline "Schedule makeup" CTA and
 * a handling-state pill. The inline CTA only renders when the row has
 * hard-evidence missed sessions (matching the recommendation engine's
 * `missed_sessions` decision). The pill only renders when handling
 * state is non-default. State is keyed by `risk-row:<sid>:<reqId>` so
 * it round-trips with the same id used elsewhere in Phase 1D.
 */
function RiskAttentionRow({
  r, highlightFirst, setDrilldownStudent, riskBadge, fmtDollars,
}: {
  r: StudentRow;
  highlightFirst: boolean;
  setDrilldownStudent: (s: { studentId: number; studentName: string; serviceRequirementId: number }) => void;
  riskBadge: (status: string, label: string) => React.ReactNode;
  fmtDollars: (n: number) => string;
}) {
  const { role } = useRole();
  const { getState, setState } = useHandlingState(`${role}::risk-report`);
  const itemId = riskRowItemId(r.studentId, r.serviceRequirementId);
  const handlingState = getState(itemId);
  const handlingActive = handlingState !== "needs_action";
  const handlingBadge = HANDLING_BADGE[handlingState];
  const [, navigate] = useLocation();

  const rec = recommendAction({
    category: "compliance",
    alertType: r.missedSessions > 0 ? "missed_sessions" : "service_minutes_behind",
    source: r.missedSessions > 0 ? "alert" : "risk_report",
    riskStatus: r.riskStatus,
    requiredMinutes: r.requiredMinutes,
    shortfallMinutes: r.shortfallMinutes,
    hasMissedEvidence: r.missedSessions > 0,
    serviceRequirementId: r.serviceRequirementId,
  }, { currentUserRole: role ?? undefined });

  // Show inline CTA when the engine actually recommends scheduling a
  // makeup. Avoids inviting the user to schedule when the more honest
  // next step is "ask the provider" or "review with case manager."
  const showInlineMakeup = rec.recommendedAction === "schedule_makeup";

  function launchMakeup() {
    setState(itemId, "recovery_scheduled");
    navigate(buildScheduleMakeupHref({
      studentId: r.studentId,
      serviceRequirementId: r.serviceRequirementId,
      from: "compliance",
    }));
  }

  return (
    <tr
      className="border-t hover:bg-gray-50/50"
      {...(highlightFirst ? { "data-tour-id": "shortfall-student", "data-demo-highlight": "risk" } : {})}
    >
      <td className="px-3 py-2 font-medium">
        <Link href={`/students/${r.studentId}?from=compliance`} className="text-blue-700 hover:underline hover:text-blue-900 transition-colors" data-testid={`link-risk-student-${r.studentId}`}>
          {r.studentName}
        </Link>
        <div className="text-[10px] text-gray-500 mt-0.5 leading-tight flex items-center gap-1.5 flex-wrap" data-testid={`text-risk-recommendation-${r.studentId}`}>
          <span>
            Next: <span className="font-semibold text-gray-700">{rec.primaryActionLabel}</span> ·{" "}
            {rec.recommendedOwner === "you" ? "You" : rec.ownerLabel}
          </span>
          {showInlineMakeup && (
            <button
              type="button"
              onClick={launchMakeup}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
              title="Open the Scheduling Hub with this requirement preselected"
              data-testid={`button-risk-schedule-makeup-${r.studentId}-${r.serviceRequirementId}`}
            >
              <CalendarPlus className="w-3 h-3" /> Schedule makeup
            </button>
          )}
          {handlingActive && (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold ring-1 ${handlingBadge.bg} ${handlingBadge.fg} ${handlingBadge.ring}`}
              data-testid={`handling-state-${itemId}`}
              title="Marked from this surface — derived UI state, not a server-side assignment"
            >
              {HANDLING_LABELS[handlingState]}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{r.school}</td>
      <td className="px-3 py-2">{r.service}</td>
      <td className="px-3 py-2 text-right tabular-nums">{r.requiredMinutes}</td>
      <td className="px-3 py-2 text-right tabular-nums">{r.deliveredMinutes}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        <span className="font-semibold text-red-700">{r.shortfallMinutes}</span>
        {r.missedSessions > 0 && (
          <div className="text-[10px] text-red-400 font-normal leading-none mt-0.5">{r.missedSessions} session{r.missedSessions === 1 ? "" : "s"} missed</div>
        )}
      </td>
      <td className="px-3 py-2">{riskBadge(r.riskStatus, r.riskLabel)}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {r.estimatedExposure != null && r.estimatedExposure > 0 ? (
          <button
            onClick={() => setDrilldownStudent({ studentId: r.studentId, studentName: r.studentName, serviceRequirementId: r.serviceRequirementId })}
            className="text-red-700 font-semibold underline decoration-dashed decoration-red-300 underline-offset-2 hover:text-red-900 transition-colors cursor-pointer"
            title="Click to see itemised breakdown"
          >
            {fmtDollars(r.estimatedExposure)}
          </button>
        ) : "—"}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{r.providerName}</td>
    </tr>
  );
}

const RISK_FILTERS = [
  { value: "all", label: "All" },
  { value: "out_of_compliance", label: "Out of Compliance" },
  { value: "at_risk", label: "At Risk" },
  { value: "slightly_behind", label: "Slightly Behind" },
  { value: "on_track", label: "On Track" },
] as const;

export default function ComplianceRiskReportPage({ embedded }: { embedded?: boolean } = {}) {
  const [schoolFilter, setSchoolFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [drilldownStudent, setDrilldownStudent] = useState<{ studentId: number; studentName: string; serviceRequirementId: number } | null>(null);

  const schoolsQuery = useQuery({
    queryKey: ["/api/schools"],
    queryFn: async () => {
      const res = await authFetch("/api/schools");
      if (!res.ok) throw new Error("Failed to load schools");
      return res.json() as Promise<{ id: number; name: string }[]>;
    },
  });

  const reportQuery = useQuery({
    queryKey: ["/api/reports/compliance-risk-report", schoolFilter],
    queryFn: async () => {
      const params = schoolFilter !== "all" ? `?schoolId=${schoolFilter}` : "";
      const res = await authFetch(`/api/reports/compliance-risk-report${params}`);
      if (!res.ok) throw new Error("Failed to load report");
      return res.json() as Promise<ReportData>;
    },
  });

  const handlePrint = () => {
    if (!reportQuery.data) return;
    const html = buildPrintHtml(reportQuery.data);
    openPrintWindow(html);
  };

  const handleDownloadCSV = async () => {
    try {
      const params = schoolFilter !== "all" ? `?schoolId=${schoolFilter}` : "";
      const res = await authFetch(`/api/reports/compliance-risk-report.csv${params}`);
      if (!res.ok) {
        toast.error("Failed to download CSV. Please try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Compliance_Risk_Report_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download CSV. Please try again.");
    }
  };

  const data = reportQuery.data;

  const filteredDetail = data
    ? [...data.studentDetail]
        .sort((a, b) => (RISK_ORDER[a.riskStatus] ?? 9) - (RISK_ORDER[b.riskStatus] ?? 9))
        .filter(r => riskFilter === "all" || r.riskStatus === riskFilter)
    : [];

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {!embedded && (
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Compliance Risk Report</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {data ? `${data.meta.districtName} — ${data.meta.reportPeriod}` : "Loading..."}
            </p>
          </div>
        )}
        {embedded && data && (
          <p className="text-xs text-gray-400">{data.meta.districtName} — {data.meta.reportPeriod}</p>
        )}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {data && (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/settings"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-medium hover:bg-emerald-100 transition-colors"
                    data-testid="compliance-threshold-pill"
                  >
                    <SettingsIcon className="h-3 w-3" />
                    Threshold: {data.meta.complianceMinuteThreshold}%
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-xs leading-snug">
                    Students must receive at least <strong>{data.meta.complianceMinuteThreshold}%</strong> of their required service minutes to be considered on track. This drives the risk status labels in this report.
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">Click to change in Settings.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Select value={schoolFilter} onValueChange={setSchoolFilter}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="All Schools" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Schools</SelectItem>
              {(schoolsQuery.data ?? []).map(s => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleDownloadCSV} disabled={!data} className="gap-1.5">
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <Button size="sm" onClick={handlePrint} disabled={!data} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            <Printer className="h-4 w-4" />
            Print Report
          </Button>
        </div>
      </div>

      {reportQuery.isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-emerald-600 border-t-transparent rounded-full" />
        </div>
      )}

      {reportQuery.error && (
        <Card><CardContent className="py-10 text-center text-red-600">Failed to load report data. Please try again.</CardContent></Card>
      )}

      {data && data.summary.totalStudents === 0 && (
        <EmptyState
          icon={AlertTriangle}
          title="No Compliance Data Available"
          action={{ label: "Go to Students", href: "/students" }}
          secondaryAction={{ label: "View Compliance Dashboard", href: "/compliance", variant: "outline" }}
        >
          <EmptyStateDetail>
            The Compliance Risk Report is designed for SPED directors and coordinators preparing for team meetings, audits, or administrative reviews. It aggregates delivery gaps across your entire district and highlights the students and providers who need immediate attention.
          </EmptyStateDetail>
          <EmptyStateHeading>This report needs data from:</EmptyStateHeading>
          <EmptyStateStep number={1}><strong>Students with active IEPs</strong> and service requirements defining what's mandated.</EmptyStateStep>
          <EmptyStateStep number={2}><strong>Session logs</strong> showing what's actually been delivered by each provider.</EmptyStateStep>
          <EmptyStateStep number={3}><strong>Service type rates</strong> (optional) for calculating dollar exposure estimates.</EmptyStateStep>
          <EmptyStateDetail>
            Once your providers begin logging sessions, this report will show compliance rates, shortfalls, risk rankings, and compensatory exposure — ready to print or export for any meeting.
          </EmptyStateDetail>
        </EmptyState>
      )}

      {data && data.summary.totalStudents > 0 && data.summary.totalServiceRequirements === 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <span className="font-semibold">No service requirements configured.</span>{" "}
              The {data.summary.totalStudents} student{data.summary.totalStudents === 1 ? "" : "s"} on your roster
              {" "}don't have IEP service requirements yet, so compliance cannot be calculated.{" "}
              <Link href="/students" className="underline hover:text-amber-700">Open a student record</Link> to add requirements, or{" "}
              <Link href="/import" className="underline hover:text-amber-700">import your data</Link> from a CSV.
            </div>
          </CardContent>
        </Card>
      )}

      {data && data.summary.totalStudents > 0 && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-tour-id="compliance-summary">
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <Users className="h-3.5 w-3.5" />
                  Students with Services
                </div>
                <div className="text-3xl font-bold mt-1">{data.summary.totalStudents}</div>
                <div className="text-xs text-muted-foreground">{data.summary.totalServiceRequirements} service requirements</div>
              </CardContent>
            </Card>
            <Card className={`border-l-4 ${data.summary.overallComplianceRate >= 90 ? "border-l-emerald-500" : data.summary.overallComplianceRate >= 75 ? "border-l-amber-500" : "border-l-red-500"}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Overall Compliance
                </div>
                <div className="text-3xl font-bold mt-1">{data.summary.overallComplianceRate}%</div>
                <div className="text-xs text-muted-foreground">{fmtNum(data.summary.totalDeliveredMinutes)} of {fmtNum(data.summary.totalRequiredMinutes)} min</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <Clock className="h-3.5 w-3.5" />
                  Total Shortfall
                </div>
                <div className="text-3xl font-bold mt-1 text-red-700">{fmtNum(data.summary.totalShortfallMinutes)} min</div>
                <div className="text-xs text-muted-foreground">{data.summary.studentsOutOfCompliance} out of compliance, {data.summary.studentsAtRisk} at risk</div>
              </CardContent>
            </Card>
            {(() => {
              const allUnpriced = data.summary.combinedExposure === 0
                && (data.summary.unpricedShortfallMinutes ?? 0) > 0;
              return (
                <Card className={`border-l-4 ${allUnpriced ? "border-l-amber-400" : "border-l-red-500"}`} data-tour-id="cost-risk">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <DollarSign className="h-3.5 w-3.5" />
                      Estimated Exposure
                    </div>
                    {allUnpriced ? (
                      <>
                        <div className="text-3xl font-bold mt-1 text-amber-700">Unpriced</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {fmtNum(data.summary.unpricedShortfallMinutes ?? 0)} min shortfall — no rates configured
                        </div>
                        <div className="text-[11px] text-amber-700 mt-1 leading-snug">
                          Dollar exposure cannot be calculated until service type rates are set.{" "}
                          <Link href="/settings?tab=finance" className="underline">Configure rates →</Link>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-3xl font-bold mt-1 text-red-700">{fmtDollars(data.summary.combinedExposure)}</div>
                        <div className="text-xs text-muted-foreground">
                          Current {fmtDollars(data.summary.totalCurrentExposure)} + Prior comp{" "}
                          {data.summary.existingCompensatoryExposure != null
                            ? fmtDollars(data.summary.existingCompensatoryExposure)
                            : `${fmtNum(data.summary.existingCompensatoryUnpricedMinutes ?? 0)} min (rate not configured)`}
                        </div>
                        {data.summary.rateConfigNote && (
                          <div className="text-[11px] text-amber-700 mt-1 leading-snug">
                            {data.summary.rateConfigNote}
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })()}
          </div>

          {data.needsAttention.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b bg-red-50/50 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <h2 className="text-sm font-bold text-red-800">Needs Attention This Period ({data.needsAttention.length})</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-muted-foreground uppercase tracking-wide">
                        <th className="px-3 py-2 text-left font-semibold">Student</th>
                        <th className="px-3 py-2 text-left font-semibold">School</th>
                        <th className="px-3 py-2 text-left font-semibold">Service</th>
                        <th className="px-3 py-2 text-right font-semibold">Required</th>
                        <th className="px-3 py-2 text-right font-semibold">Delivered</th>
                        <th className="px-3 py-2 text-right font-semibold">Shortfall</th>
                        <th className="px-3 py-2 text-left font-semibold">Risk</th>
                        <th className="px-3 py-2 text-right font-semibold">Exposure</th>
                        <th className="px-3 py-2 text-left font-semibold">Provider</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.needsAttention.map((r, i) => (
                        <RiskAttentionRow
                          key={`${r.studentId}-${r.service}-${i}`}
                          r={r}
                          highlightFirst={i === 0}
                          setDrilldownStudent={setDrilldownStudent}
                          riskBadge={riskBadge}
                          fmtDollars={fmtDollars}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                  <h2 className="text-sm font-bold whitespace-nowrap">
                    All Students ({filteredDetail.length}{riskFilter !== "all" ? ` of ${data.studentDetail.length}` : ""})
                  </h2>
                  <div className="flex gap-1 flex-wrap">
                    {RISK_FILTERS.map(f => (
                      <button
                        key={f.value}
                        onClick={() => { setRiskFilter(f.value); setShowAllStudents(false); }}
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
                          riskFilter === f.value
                            ? f.value === "out_of_compliance" ? "bg-red-600 text-white border-red-600"
                              : f.value === "at_risk" ? "bg-amber-500 text-white border-amber-500"
                              : f.value === "slightly_behind" ? "bg-yellow-400 text-yellow-900 border-yellow-400"
                              : f.value === "on_track" ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-gray-800 text-white border-gray-800"
                            : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                {filteredDetail.length > 20 && (
                  <Button variant="ghost" size="sm" onClick={() => setShowAllStudents(!showAllStudents)} className="gap-1 text-xs shrink-0">
                    {showAllStudents ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {showAllStudents ? "Show Less" : `Show All ${filteredDetail.length}`}
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="px-3 py-2 text-left font-semibold">Student</th>
                      <th className="px-3 py-2 text-left font-semibold">School</th>
                      <th className="px-3 py-2 text-left font-semibold">Gr</th>
                      <th className="px-3 py-2 text-left font-semibold">Service</th>
                      <th className="px-3 py-2 text-right font-semibold">Required</th>
                      <th className="px-3 py-2 text-right font-semibold">Delivered</th>
                      <th className="px-3 py-2 text-right font-semibold">Shortfall</th>
                      <th className="px-3 py-2 text-left font-semibold">Progress</th>
                      <th className="px-3 py-2 text-left font-semibold">Risk</th>
                      <th className="px-3 py-2 text-right font-semibold">Exposure</th>
                      <th className="px-3 py-2 text-left font-semibold">Provider</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDetail.length === 0 && (
                      <tr>
                        <td colSpan={11} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          No students match the selected filter.
                        </td>
                      </tr>
                    )}
                    {(showAllStudents ? filteredDetail : filteredDetail.slice(0, 20)).map((r, i) => (
                      <tr key={`${r.studentId}-${r.service}-${i}`} className="border-t hover:bg-gray-50/50">
                        <td className="px-3 py-2 font-medium">
                          <Link href={`/students/${r.studentId}?from=compliance`} className="text-blue-700 hover:underline hover:text-blue-900 transition-colors">
                            {r.studentName}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{r.school}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{r.grade}</td>
                        <td className="px-3 py-2">{r.service}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.requiredMinutes}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.deliveredMinutes}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.shortfallMinutes > 0 ? <span className="font-semibold text-red-700">{r.shortfallMinutes}</span> : "—"}</td>
                        <td className="px-3 py-2">{pctBar(r.percentComplete)}</td>
                        <td className="px-3 py-2">{riskBadge(r.riskStatus, r.riskLabel)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.estimatedExposure != null && r.estimatedExposure > 0 ? (
                            <button
                              onClick={() => setDrilldownStudent({ studentId: r.studentId, studentName: r.studentName, serviceRequirementId: r.serviceRequirementId })}
                              className="text-red-700 font-semibold underline decoration-dashed decoration-red-300 underline-offset-2 hover:text-red-900 transition-colors cursor-pointer"
                              title="Click to see itemised breakdown"
                            >
                              {fmtDollars(r.estimatedExposure)}
                            </button>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{r.providerName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!showAllStudents && filteredDetail.length > 20 && (
                <div className="px-4 py-2 text-xs text-muted-foreground border-t bg-gray-50/50 text-center">
                  Showing 20 of {filteredDetail.length} — click "Show All" to expand or use Print/CSV for complete data
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-bold">Provider Delivery Summary ({data.providerSummary.length})</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="px-3 py-2 text-left font-semibold">Provider</th>
                      <th className="px-3 py-2 text-right font-semibold">Students</th>
                      <th className="px-3 py-2 text-right font-semibold">Required Min</th>
                      <th className="px-3 py-2 text-right font-semibold">Delivered Min</th>
                      <th className="px-3 py-2 text-right font-semibold">Shortfall</th>
                      <th className="px-3 py-2 text-left font-semibold">Compliance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.providerSummary.map((r, i) => (
                      <tr key={`${r.providerName}-${i}`} className="border-t hover:bg-gray-50/50">
                        <td className="px-3 py-2 font-medium">{r.providerName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.studentsServed}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.totalRequired)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.totalDelivered)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.totalShortfall > 0 ? <span className="font-semibold text-red-700">{fmtNum(r.totalShortfall)}</span> : "—"}</td>
                        <td className="px-3 py-2">{pctBar(r.complianceRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="text-xs text-muted-foreground text-center pt-2">
            Generated {new Date(data.meta.generatedAt).toLocaleString()} | CONFIDENTIAL — Contains Protected Student Information (FERPA)
          </div>
        </>
      )}

      <ExposureDetailPanel
        studentId={drilldownStudent?.studentId ?? null}
        studentName={drilldownStudent?.studentName}
        serviceRequirementId={drilldownStudent?.serviceRequirementId}
        onClose={() => setDrilldownStudent(null)}
      />
    </div>
  );
}
