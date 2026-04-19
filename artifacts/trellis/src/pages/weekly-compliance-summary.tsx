import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Printer, Download, FileDown, AlertTriangle, CheckCircle, TrendingDown,
  Users, DollarSign, Clock, ArrowLeft, ChevronDown, ChevronUp,
} from "lucide-react";
import { Link } from "wouter";
import { openPrintWindow } from "@/lib/print-document";
import { toast } from "sonner";
import { EmptyState, EmptyStateStep, EmptyStateHeading, EmptyStateDetail } from "@/components/ui/empty-state";

interface StudentShortfall {
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
}

interface ProviderRow {
  providerName: string;
  studentsServed: number;
  totalDelivered: number;
  totalRequired: number;
  totalShortfall: number;
  complianceRate: number;
}

interface ProviderMissed {
  providerName: string;
  role: string;
  completedSessions: number;
  missedSessions: number;
  deliveredMinutes: number;
  missRatePct: number;
}

interface WeeklyTrend {
  weekLabel: string;
  weekStart: string;
  deliveredMinutes: number;
  completedSessions: number;
  missedSessions: number;
  cancelledSessions: number;
  missRatePct: number;
}

interface ReportData {
  meta: {
    districtName: string;
    generatedAt: string;
    currentWeek: string;
    weekStart: string;
    weekEnd: string;
    schoolFilter: number | null;
  };
  summary: {
    totalStudents: number;
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
    riskCounts: {
      out_of_compliance: number;
      at_risk: number;
      slightly_behind: number;
      on_track: number;
    };
    thisWeek: {
      completedSessions: number;
      missedSessions: number;
      cancelledSessions: number;
      totalSessions: number;
      deliveredMinutes: number;
      missRatePct: number;
    };
  };
  urgentFlags: string[];
  studentShortfalls: StudentShortfall[];
  providerSummary: ProviderRow[];
  providersWithMissedThisWeek: ProviderMissed[];
  weeklyTrend: WeeklyTrend[];
}

function fmtDollars(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function fmtNum(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function riskBadge(status: string, label: string) {
  const cls =
    status === "out_of_compliance" ? "bg-red-100 text-red-800 border-red-200" :
    status === "at_risk" ? "bg-amber-100 text-amber-800 border-amber-200" :
    status === "slightly_behind" ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
    "bg-emerald-100 text-emerald-800 border-emerald-200";
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>{label}</span>;
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

  const urgentHtml = data.urgentFlags.length > 0 ? `
  <div class="urgent-box">
    <h3>Urgent Alerts</h3>
    <ul>${data.urgentFlags.map(f => `<li>${esc(f)}</li>`).join("")}</ul>
  </div>` : "";

  const shortfallRows = data.studentShortfalls.map(r => `
    <tr>
      <td>${esc(r.studentName)}</td>
      <td>${esc(r.school)}</td>
      <td>${esc(r.service)}</td>
      <td style="text-align:right">${r.requiredMinutes}</td>
      <td style="text-align:right">${r.deliveredMinutes}</td>
      <td style="text-align:right;font-weight:600;color:#b91c1c">${r.shortfallMinutes}</td>
      <td>${riskBadgeHtml(r.riskStatus, r.riskLabel)}</td>
      <td style="text-align:right">${r.estimatedExposure > 0 ? "$" + r.estimatedExposure.toLocaleString() : "—"}</td>
      <td>${esc(r.providerName)}</td>
    </tr>`).join("");

  const providerRows = data.providerSummary.map(r => `
    <tr>
      <td>${esc(r.providerName)}</td>
      <td style="text-align:right">${r.studentsServed}</td>
      <td style="text-align:right">${r.totalRequired.toLocaleString()}</td>
      <td style="text-align:right">${r.totalDelivered.toLocaleString()}</td>
      <td style="text-align:right;${r.totalShortfall > 0 ? "font-weight:600;color:#b91c1c" : ""}">${r.totalShortfall > 0 ? r.totalShortfall.toLocaleString() : "—"}</td>
      <td style="text-align:right">${r.complianceRate.toFixed(1)}%</td>
    </tr>`).join("");

  const missedRows = data.providersWithMissedThisWeek.map(r => {
    const missRateStyle = r.missRatePct >= 40 ? "color:#b91c1c;font-weight:700" : r.missRatePct >= 25 ? "color:#92400e;font-weight:600" : "";
    return `<tr>
      <td>${esc(r.providerName)}</td>
      <td>${esc(r.role)}</td>
      <td style="text-align:right">${r.completedSessions}</td>
      <td style="text-align:right;font-weight:600;color:#b91c1c">${r.missedSessions}</td>
      <td style="text-align:right;${missRateStyle}">${r.missRatePct}%</td>
      <td style="text-align:right">${r.deliveredMinutes.toLocaleString()}</td>
    </tr>`;
  }).join("");

  const trendRows = data.weeklyTrend.map(w => {
    const mrStyle = w.missRatePct >= 40 ? "color:#b91c1c;font-weight:700" : w.missRatePct >= 25 ? "color:#92400e;font-weight:600" : "";
    return `<tr>
      <td>${esc(w.weekLabel)}</td>
      <td style="text-align:right">${w.deliveredMinutes > 0 ? w.deliveredMinutes.toLocaleString() : "—"}</td>
      <td style="text-align:right">${w.completedSessions || "—"}</td>
      <td style="text-align:right;${w.missedSessions > 0 ? "color:#b91c1c" : ""}">${w.missedSessions || "—"}</td>
      <td style="text-align:right;${mrStyle}">${w.missRatePct > 0 ? w.missRatePct + "%" : "—"}</td>
      <td style="text-align:right">${w.cancelledSessions || "—"}</td>
    </tr>`;
  }).join("");

  const genDate = new Date(data.meta.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Weekly SPED Compliance Summary — ${esc(data.meta.districtName)}</title>
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
  .urgent-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; }
  .urgent-box h3 { font-size: 11px; font-weight: bold; color: #b91c1c; margin: 0 0 6px; text-transform: uppercase; }
  .urgent-box ul { margin: 0; padding-left: 16px; }
  .urgent-box li { font-size: 10px; color: #7f1d1d; margin-bottom: 3px; line-height: 1.4; }
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
    <h1>Weekly SPED Compliance Summary</h1>
    <div class="subtitle">${esc(data.meta.districtName)} — Week of ${esc(data.meta.currentWeek)}</div>
    <div class="meta">Generated ${genDate} | CONFIDENTIAL — Contains Protected Student Information (FERPA)</div>
  </div>

  <div class="summary-grid">
    <div class="stat-card info">
      <div class="label">Required Minutes</div>
      <div class="value">${s.totalRequiredMinutes.toLocaleString()}</div>
      <div class="detail">${s.totalStudents} students with services</div>
    </div>
    <div class="stat-card ${s.overallComplianceRate >= 90 ? "success" : s.overallComplianceRate >= 75 ? "warning" : "danger"}">
      <div class="label">Delivered / Compliance</div>
      <div class="value">${s.totalDeliveredMinutes.toLocaleString()} min</div>
      <div class="detail">${s.overallComplianceRate}% of required</div>
    </div>
    <div class="stat-card danger">
      <div class="label">Total Shortfall</div>
      <div class="value">${s.totalShortfallMinutes.toLocaleString()} min</div>
      <div class="detail">${s.riskCounts.out_of_compliance} out of compliance, ${s.riskCounts.at_risk} at risk</div>
    </div>
    <div class="stat-card danger">
      <div class="label">Estimated Exposure</div>
      <div class="value">$${s.combinedExposure.toLocaleString()}</div>
      <div class="detail">Current $${s.totalCurrentExposure.toLocaleString()} + Prior comp ${s.existingCompensatoryExposure != null ? `$${s.existingCompensatoryExposure.toLocaleString()}` : `${(s.existingCompensatoryUnpricedMinutes ?? 0).toLocaleString()} min (rate not configured)`}</div>
      ${s.rateConfigNote ? `<div class="detail" style="margin-top:4px;color:#92400e">${s.rateConfigNote.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>` : ""}
    </div>
  </div>

  ${urgentHtml}

  ${data.studentShortfalls.length > 0 ? `
  <h2>Students with Highest Shortfalls (${data.studentShortfalls.length})</h2>
  <table>
    <thead><tr><th>Student</th><th>School</th><th>Service</th><th style="text-align:right">Required</th><th style="text-align:right">Delivered</th><th style="text-align:right">Shortfall</th><th>Risk</th><th style="text-align:right">Exposure</th><th>Provider</th></tr></thead>
    <tbody>${shortfallRows}</tbody>
  </table>` : ""}

  ${data.providersWithMissedThisWeek.length > 0 ? `
  <h2>Providers with Missed Sessions This Week (${data.providersWithMissedThisWeek.length})</h2>
  <table>
    <thead><tr><th>Provider</th><th>Role</th><th style="text-align:right">Completed</th><th style="text-align:right">Missed</th><th style="text-align:right">Miss Rate</th><th style="text-align:right">Min Delivered</th></tr></thead>
    <tbody>${missedRows}</tbody>
  </table>` : ""}

  <h2>Provider Delivery Summary (${data.providerSummary.length})</h2>
  <table>
    <thead><tr><th>Provider</th><th style="text-align:right">Students</th><th style="text-align:right">Required</th><th style="text-align:right">Delivered</th><th style="text-align:right">Shortfall</th><th style="text-align:right">Compliance</th></tr></thead>
    <tbody>${providerRows}</tbody>
  </table>

  <h2>8-Week Delivery Trend</h2>
  <table>
    <thead><tr><th>Week</th><th style="text-align:right">Delivered Min</th><th style="text-align:right">Completed</th><th style="text-align:right">Missed</th><th style="text-align:right">Miss Rate</th><th style="text-align:right">Cancelled</th></tr></thead>
    <tbody>${trendRows}</tbody>
  </table>

  <div class="confidential">Trellis — Weekly SPED Compliance Summary | ${esc(data.meta.districtName)} | ${genDate} | CONFIDENTIAL</div>
</div>
</body></html>`;
}

export default function WeeklyComplianceSummaryPage() {
  const [schoolFilter, setSchoolFilter] = useState<string>("all");
  const [showAllShortfalls, setShowAllShortfalls] = useState(false);

  const schoolsQuery = useQuery({
    queryKey: ["/api/schools"],
    queryFn: async () => {
      const res = await authFetch("/api/schools");
      if (!res.ok) throw new Error("Failed to load schools");
      return res.json() as Promise<{ id: number; name: string }[]>;
    },
  });

  const reportQuery = useQuery({
    queryKey: ["/api/reports/weekly-compliance-summary", schoolFilter],
    queryFn: async () => {
      const params = schoolFilter !== "all" ? `?schoolId=${schoolFilter}` : "";
      const res = await authFetch(`/api/reports/weekly-compliance-summary${params}`);
      if (!res.ok) throw new Error("Failed to load report");
      return res.json() as Promise<ReportData>;
    },
  });

  const handlePrint = () => {
    if (!reportQuery.data) return;
    openPrintWindow(buildPrintHtml(reportQuery.data));
  };

  const handleDownloadPDF = async () => {
    try {
      const params = schoolFilter !== "all" ? `?schoolId=${schoolFilter}` : "";
      const res = await authFetch(`/api/reports/weekly-compliance-summary.pdf${params}`);
      if (!res.ok) {
        toast.error("Failed to generate PDF. Please try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Weekly_Compliance_Summary_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to generate PDF. Please try again.");
    }
  };

  const handleDownloadCSV = async () => {
    try {
      const params = schoolFilter !== "all" ? `?schoolId=${schoolFilter}` : "";
      const res = await authFetch(`/api/reports/weekly-compliance-summary.csv${params}`);
      if (!res.ok) {
        toast.error("Failed to download CSV. Please try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Weekly_Compliance_Summary_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download CSV. Please try again.");
    }
  };

  const data = reportQuery.data;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/compliance">
              <Button variant="ghost" size="sm" className="gap-1 text-xs text-gray-500 -ml-2 h-7">
                <ArrowLeft className="h-3 w-3" /> Compliance
              </Button>
            </Link>
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Weekly SPED Compliance Summary</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data ? `${data.meta.districtName} — Week of ${data.meta.currentWeek}` : "Loading..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={!data} className="gap-1.5">
            <FileDown className="h-4 w-4" /> PDF
          </Button>
          <Button size="sm" onClick={handlePrint} disabled={!data} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            <Printer className="h-4 w-4" /> Print
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
          title="No Weekly Data Available"
          action={{ label: "Go to Students", href: "/students" }}
          secondaryAction={{ label: "View Compliance Dashboard", href: "/compliance", variant: "outline" }}
        >
          <EmptyStateDetail>
            The Weekly Compliance Summary is a meeting-ready report for SPED directors. Each week it surfaces the most critical compliance gaps, flags providers with missed sessions, and tracks delivery trends over 8 weeks — all updated automatically from session logs.
          </EmptyStateDetail>
          <EmptyStateHeading>To generate a meaningful weekly summary:</EmptyStateHeading>
          <EmptyStateStep number={1}>Add students with active IEPs and service requirements.</EmptyStateStep>
          <EmptyStateStep number={2}>Have providers log their sessions (completed, missed, or cancelled).</EmptyStateStep>
          <EmptyStateStep number={3}>Come back each week — the report builds trend data over time for deeper insight.</EmptyStateStep>
        </EmptyState>
      )}

      {data && data.summary.totalStudents > 0 && (
        <>
          {/* ── THIS WEEK AT A GLANCE ─────────────────────────────────────────── */}
          {data.summary.thisWeek && data.summary.thisWeek.totalSessions > 0 && (
            <div className={`rounded-xl border px-4 py-3 ${
              data.summary.thisWeek.missRatePct >= 40
                ? "bg-red-50 border-red-200"
                : data.summary.thisWeek.missRatePct >= 25
                ? "bg-amber-50 border-amber-200"
                : "bg-emerald-50 border-emerald-200"
            }`}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">This Week (session activity)</p>
                  <p className="text-sm text-gray-500 mt-0.5">Logged sessions {data.meta.weekStart} – today</p>
                </div>
                <div className="flex items-center gap-6 flex-wrap">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-700">{data.summary.thisWeek.completedSessions}</div>
                    <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">Completed</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${data.summary.thisWeek.missedSessions > 0 ? "text-red-700" : "text-gray-400"}`}>
                      {data.summary.thisWeek.missedSessions}
                    </div>
                    <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">Missed</div>
                  </div>
                  {data.summary.thisWeek.cancelledSessions > 0 && (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-500">{data.summary.thisWeek.cancelledSessions}</div>
                      <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">Cancelled</div>
                    </div>
                  )}
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${
                      data.summary.thisWeek.missRatePct >= 40 ? "text-red-700" :
                      data.summary.thisWeek.missRatePct >= 25 ? "text-amber-700" : "text-emerald-700"
                    }`}>
                      {data.summary.thisWeek.missRatePct}%
                    </div>
                    <div className={`text-[11px] font-semibold uppercase tracking-wide ${
                      data.summary.thisWeek.missRatePct >= 40 ? "text-red-600" :
                      data.summary.thisWeek.missRatePct >= 25 ? "text-amber-600" : "text-emerald-600"
                    }`}>Miss Rate</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-700">{fmtNum(data.summary.thisWeek.deliveredMinutes)}</div>
                    <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">Min Delivered</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="border-l-4 border-l-gray-400">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <Clock className="h-3.5 w-3.5" /> Required Minutes
                </div>
                <div className="text-3xl font-bold mt-1">{fmtNum(data.summary.totalRequiredMinutes)}</div>
                <div className="text-xs text-muted-foreground">{data.summary.totalStudents} students with active services</div>
              </CardContent>
            </Card>
            <Card className={`border-l-4 ${data.summary.overallComplianceRate >= 90 ? "border-l-emerald-500" : data.summary.overallComplianceRate >= 75 ? "border-l-amber-500" : "border-l-red-500"}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <CheckCircle className="h-3.5 w-3.5" /> Delivered / Compliance
                </div>
                <div className="text-3xl font-bold mt-1">{data.summary.overallComplianceRate}%</div>
                <div className="text-xs text-muted-foreground">{fmtNum(data.summary.totalDeliveredMinutes)} of {fmtNum(data.summary.totalRequiredMinutes)} min</div>
              </CardContent>
            </Card>
            <Card className={`border-l-4 ${data.summary.totalShortfallMinutes > 0 ? "border-l-red-500" : "border-l-emerald-500"}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <TrendingDown className="h-3.5 w-3.5" /> Total Shortfall
                </div>
                <div className={`text-3xl font-bold mt-1 ${data.summary.totalShortfallMinutes > 0 ? "text-red-700" : ""}`}>
                  {fmtNum(data.summary.totalShortfallMinutes)} min
                </div>
                <div className="text-xs text-muted-foreground">
                  {data.summary.riskCounts.out_of_compliance} out of compliance, {data.summary.riskCounts.at_risk} at risk
                </div>
              </CardContent>
            </Card>
            <Card className={`border-l-4 ${data.summary.combinedExposure > 0 ? "border-l-red-500" : "border-l-emerald-500"}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <DollarSign className="h-3.5 w-3.5" /> Estimated Exposure
                </div>
                <div className={`text-3xl font-bold mt-1 ${data.summary.combinedExposure > 0 ? "text-red-700" : ""}`}>
                  {fmtDollars(data.summary.combinedExposure)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Current {fmtDollars(data.summary.totalCurrentExposure)} + Prior comp{" "}
                  {data.summary.existingCompensatoryExposure != null
                    ? fmtDollars(data.summary.existingCompensatoryExposure)
                    : `${(data.summary.existingCompensatoryUnpricedMinutes ?? 0).toLocaleString()} min (rate not configured)`}
                </div>
                {data.summary.rateConfigNote && (
                  <div className="text-[11px] text-amber-700 mt-1 leading-snug">
                    {data.summary.rateConfigNote}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {data.urgentFlags.length > 0 && (
            <Card className="border-red-200 bg-red-50/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <h2 className="text-sm font-bold text-red-800">Urgent Alerts Requiring Intervention</h2>
                </div>
                <ul className="space-y-1.5">
                  {data.urgentFlags.map((alert, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-red-800">
                      <span className="text-red-400 mt-0.5">•</span>
                      {alert}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {data.studentShortfalls.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <h2 className="text-sm font-bold">Students with Highest Shortfalls ({data.studentShortfalls.length})</h2>
                  {data.studentShortfalls.length > 15 && (
                    <Button variant="ghost" size="sm" onClick={() => setShowAllShortfalls(!showAllShortfalls)} className="gap-1 text-xs">
                      {showAllShortfalls ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {showAllShortfalls ? "Show Less" : `Show All ${data.studentShortfalls.length}`}
                    </Button>
                  )}
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
                      {(showAllShortfalls ? data.studentShortfalls : data.studentShortfalls.slice(0, 15)).map((r, i) => (
                        <tr key={`${r.studentId}-${r.service}-${i}`} className="border-t hover:bg-gray-50/50">
                          <td className="px-3 py-2">
                            <Link href={`/students/${r.studentId}`} className="font-medium text-gray-800 hover:text-emerald-700">
                              {r.studentName}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground text-xs">{r.school}</td>
                          <td className="px-3 py-2">{r.service}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.requiredMinutes}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.deliveredMinutes}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-red-700">{r.shortfallMinutes}</td>
                          <td className="px-3 py-2">{riskBadge(r.riskStatus, r.riskLabel)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.estimatedExposure > 0 ? fmtDollars(r.estimatedExposure) : "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground text-xs">{r.providerName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!showAllShortfalls && data.studentShortfalls.length > 15 && (
                  <div className="px-4 py-2 text-xs text-muted-foreground border-t bg-gray-50/50 text-center">
                    Showing 15 of {data.studentShortfalls.length} — click "Show All" or use Print/CSV for complete data
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {data.providersWithMissedThisWeek.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b flex items-center gap-2 bg-amber-50/50">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <h2 className="text-sm font-bold text-amber-800">Providers with Missed Sessions This Week ({data.providersWithMissedThisWeek.length})</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-muted-foreground uppercase tracking-wide">
                        <th className="px-3 py-2 text-left font-semibold">Provider</th>
                        <th className="px-3 py-2 text-left font-semibold">Role</th>
                        <th className="px-3 py-2 text-right font-semibold">Completed</th>
                        <th className="px-3 py-2 text-right font-semibold">Missed</th>
                        <th className="px-3 py-2 text-right font-semibold">Miss Rate</th>
                        <th className="px-3 py-2 text-right font-semibold">Min Delivered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.providersWithMissedThisWeek.map((r, i) => (
                        <tr key={`${r.providerName}-${i}`} className="border-t hover:bg-gray-50/50">
                          <td className="px-3 py-2 font-medium">{r.providerName}</td>
                          <td className="px-3 py-2 text-muted-foreground text-xs">{r.role}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.completedSessions}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-red-700">{r.missedSessions}</td>
                          <td className={`px-3 py-2 text-right tabular-nums font-semibold ${
                            r.missRatePct >= 40 ? "text-red-700" :
                            r.missRatePct >= 25 ? "text-amber-700" : "text-gray-600"
                          }`}>{r.missRatePct}%</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.deliveredMinutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
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

          {data.weeklyTrend.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-bold">8-Week Delivery Trend</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-muted-foreground uppercase tracking-wide">
                        <th className="px-3 py-2 text-left font-semibold">Week</th>
                        <th className="px-3 py-2 text-right font-semibold">Delivered Min</th>
                        <th className="px-3 py-2 text-right font-semibold">Completed</th>
                        <th className="px-3 py-2 text-right font-semibold">Missed</th>
                        <th className="px-3 py-2 text-right font-semibold">Miss Rate</th>
                        <th className="px-3 py-2 text-right font-semibold">Cancelled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.weeklyTrend.map((w, i) => {
                        const isCurrentWeek = i === data.weeklyTrend.length - 1;
                        const missRateColor = w.missRatePct >= 40 ? "text-red-700 font-bold" :
                          w.missRatePct >= 25 ? "text-amber-700 font-semibold" : "text-gray-600";
                        return (
                          <tr key={w.weekStart} className={`border-t hover:bg-gray-50/50 ${isCurrentWeek ? "bg-emerald-50/30 font-medium" : ""}`}>
                            <td className="px-3 py-2">{w.weekLabel}{isCurrentWeek ? <span className="ml-1.5 text-[10px] bg-emerald-100 text-emerald-700 font-semibold px-1.5 py-0.5 rounded">current</span> : ""}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{w.deliveredMinutes > 0 ? fmtNum(w.deliveredMinutes) : <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{w.completedSessions || <span className="text-gray-300">—</span>}</td>
                            <td className={`px-3 py-2 text-right tabular-nums ${w.missedSessions > 0 ? "text-red-700" : ""}`}>{w.missedSessions || <span className="text-gray-300">—</span>}</td>
                            <td className={`px-3 py-2 text-right tabular-nums ${w.missRatePct > 0 ? missRateColor : ""}`}>
                              {w.missRatePct > 0 ? `${w.missRatePct}%` : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{w.cancelledSessions || <span className="text-gray-300">—</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="text-xs text-muted-foreground text-center pt-2">
            Generated {new Date(data.meta.generatedAt).toLocaleString()} | CONFIDENTIAL — Contains Protected Student Information (FERPA)
          </div>
        </>
      )}
    </div>
  );
}
