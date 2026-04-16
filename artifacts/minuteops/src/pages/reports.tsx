import { useState, useMemo, useEffect, useCallback } from "react";
import {
  useGetStudentMinuteSummaryReport, useGetMissedSessionsReport, useGetComplianceRiskReport,
  useGetExecutiveSummaryReport, useGetComplianceTrendReport, getAuditPackageReport,
  listStudents,
} from "@workspace/api-client-react";
import { authFetch } from "@/lib/auth-fetch";
import type {
  GetExecutiveSummaryReportParams, GetComplianceTrendReportParams,
  GetAuditPackageReportParams, ComplianceTrendResponse, ExecutiveSummaryResponse,
  AuditPackageResponse, SchoolTrend,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MiniProgressRing } from "@/components/ui/progress-ring";
import { ProgressRing } from "@/components/ui/progress-ring";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Link } from "wouter";
import { Download, Printer, FileText, TrendingUp, Shield, BarChart3, Calendar, Users, AlertTriangle, Heart, CheckCircle2, Clock, TrendingDown, Minus, FileDown } from "lucide-react";
import { RISK_CONFIG } from "@/lib/constants";
import { formatDate } from "@/lib/formatters";
import { toast } from "sonner";
import { useSchoolContext } from "@/lib/school-context";
import { useRole, type UserRole } from "@/lib/role-context";
import { useSchoolYears } from "@/lib/use-school-years";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

function sanitizeCell(v: string): string {
  const s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) return "'" + s;
  return s;
}

function downloadCsv(filename: string, headers: string[], rows: string[][], meta?: { generatedAt?: string; preparedBy?: string | null }) {
  const escape = (v: string) => `"${sanitizeCell(v).replace(/"/g, '""')}"`;
  const metaLines: string[] = [];
  if (meta?.generatedAt) metaLines.push(`"Generated At","${sanitizeCell(meta.generatedAt)}"`);
  if (meta?.preparedBy) metaLines.push(`"Prepared By","${sanitizeCell(meta.preparedBy)}"`);
  if (metaLines.length) metaLines.push("");
  const csv = [...metaLines, headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${rows.length} rows to ${filename}`);
}

const EXPORT_ROLES: UserRole[] = ["admin", "case_manager", "coordinator"];

export default function Reports() {
  const { user } = useRole();
  const canExport = EXPORT_ROLES.includes(user.role as UserRole);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Reports</h1>
        <p className="text-xs md:text-sm text-gray-400 mt-1">Compliance, service delivery, and audit reports</p>
      </div>

      <Tabs defaultValue="executive">
        <TabsList className="flex-wrap">
          <TabsTrigger value="executive" className="gap-1.5"><Shield className="w-3.5 h-3.5" /> Executive Summary</TabsTrigger>
          <TabsTrigger value="trend" className="gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Compliance Trend</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Audit Package</TabsTrigger>
          <TabsTrigger value="minutes">Minutes</TabsTrigger>
          <TabsTrigger value="missed">Missed</TabsTrigger>
          <TabsTrigger value="risk">At-Risk</TabsTrigger>
          <TabsTrigger value="parent" className="gap-1.5"><Heart className="w-3.5 h-3.5" /> Parent Summary</TabsTrigger>
          {canExport && <TabsTrigger value="exports" className="gap-1.5"><FileDown className="w-3.5 h-3.5" /> Exports</TabsTrigger>}
        </TabsList>

        <TabsContent value="executive" className="mt-4"><ExecutiveSummaryTab /></TabsContent>
        <TabsContent value="trend" className="mt-4"><ComplianceTrendTab /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditPackageTab /></TabsContent>
        <TabsContent value="minutes" className="mt-4"><MinuteSummaryTab /></TabsContent>
        <TabsContent value="missed" className="mt-4"><MissedSessionsTab /></TabsContent>
        <TabsContent value="risk" className="mt-4"><RiskTab /></TabsContent>
        <TabsContent value="parent" className="mt-4"><ParentSummaryTab /></TabsContent>
        {canExport && <TabsContent value="exports" className="mt-4"><ComplianceExportsTab /></TabsContent>}
      </Tabs>
    </div>
  );
}

function ComplianceExportsTab() {
  const { filterParams } = useSchoolContext();
  const { years: schoolYears, activeYear } = useSchoolYears();
  const now = new Date();
  const [startDate, setStartDate] = useState(() => new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(() => now.toISOString().split("T")[0]);
  const [selectedYearId, setSelectedYearId] = useState<string>("all");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"reports" | "history" | "schedule">("reports");
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [scheduleForm, setScheduleForm] = useState<{ reportType: string; frequency: string; emails: string } | null>(null);
  const [providers, setProviders] = useState<{ id: number; name: string }[]>([]);
  const [serviceTypes, setServiceTypes] = useState<{ id: number; name: string }[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("all");
  const [selectedServiceTypeId, setSelectedServiceTypeId] = useState<string>("all");
  const [complianceFilter, setComplianceFilter] = useState<string>("all");

  useEffect(() => {
    authFetch("/api/staff?limit=200").then(r => r.ok ? r.json() : []).then((data: any) => {
      const list = Array.isArray(data) ? data : data?.data ?? [];
      setProviders(list.map((s: any) => ({ id: s.id, name: `${s.lastName}, ${s.firstName}` })));
    }).catch(() => {});
    authFetch("/api/service-types").then(r => r.ok ? r.json() : []).then((data: any) => {
      const list = Array.isArray(data) ? data : [];
      setServiceTypes(list.map((s: any) => ({ id: s.id, name: s.name })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeYear && selectedYearId === "all") {
      setSelectedYearId(String(activeYear.id));
    }
  }, [activeYear]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await authFetch("/api/reports/exports/history");
      if (res.ok) setHistory(await res.json());
    } catch {}
    setHistoryLoading(false);
  }, []);

  const loadSchedules = useCallback(async () => {
    try {
      const res = await authFetch("/api/reports/exports/scheduled");
      if (res.ok) setSchedules(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (activeSection === "history") loadHistory();
    if (activeSection === "schedule") loadSchedules();
  }, [activeSection]);

  async function downloadAuthFile(url: string, filename: string) {
    setDownloading(filename);
    try {
      const res = await authFetch(url);
      if (!res.ok) { toast.error(`Export failed: ${res.statusText}`); return; }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl; a.download = filename; a.click();
      URL.revokeObjectURL(objectUrl);
      toast.success(`Downloaded ${filename}`);
    } catch (e: any) {
      toast.error(`Download failed: ${e.message}`);
    } finally {
      setDownloading(null);
    }
  }

  async function handleCreateSchedule() {
    if (!scheduleForm) return;
    const emails = scheduleForm.emails.split(",").map(e => e.trim()).filter(Boolean);
    if (emails.length === 0) { toast.error("Enter at least one email address"); return; }
    try {
      const res = await authFetch("/api/reports/exports/scheduled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType: scheduleForm.reportType, frequency: scheduleForm.frequency, recipientEmails: emails }),
      });
      if (res.ok) {
        toast.success("Scheduled report created");
        setScheduleForm(null);
        loadSchedules();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to create schedule");
      }
    } catch { toast.error("Failed to create schedule"); }
  }

  async function handleDeleteSchedule(id: number) {
    try {
      const res = await authFetch(`/api/reports/exports/scheduled/${id}`, { method: "DELETE" });
      if (res.ok) { toast.success("Schedule removed"); loadSchedules(); }
    } catch { toast.error("Failed to remove schedule"); }
  }

  const schoolParam = filterParams.schoolId ? `&schoolId=${filterParams.schoolId}` : "";
  const districtParam = filterParams.districtId ? `&districtId=${filterParams.districtId}` : "";
  const scopeParams = `${schoolParam}${districtParam}`;
  const yearParam = selectedYearId !== "all" ? `&schoolYearId=${selectedYearId}` : "";
  const dateParams = `startDate=${startDate}&endDate=${endDate}`;
  const providerParam = selectedProviderId !== "all" ? `&providerId=${selectedProviderId}` : "";
  const serviceTypeParam = selectedServiceTypeId !== "all" ? `&serviceTypeId=${selectedServiceTypeId}` : "";
  const complianceParam = complianceFilter !== "all" ? `&complianceStatus=${complianceFilter}` : "";
  const extraFilters = `${providerParam}${serviceTypeParam}${complianceParam}`;

  const REPORT_TYPE_LABELS: Record<string, string> = {
    "compliance-summary": "Compliance Summary",
    "services-by-provider": "Services by Provider",
    "student-roster": "Student Roster",
    "caseload-distribution": "Caseload Distribution",
    "active-ieps": "Active IEPs",
    "service-minutes": "Service Minutes",
    "incidents": "Restraint & Seclusion Incidents",
  };

  const committeeReports = [
    {
      key: "compliance-summary",
      label: "Compliance Summary",
      description: "Per-student compliance status with service delivery breakdown. Ideal for school committee presentations.",
      csvUrl: `/api/reports/exports/compliance-summary.csv?${dateParams}${scopeParams}${serviceTypeParam}${complianceParam}`,
      pdfUrl: `/api/reports/exports/compliance-summary.pdf?${dateParams}${scopeParams}${serviceTypeParam}${complianceParam}`,
      csvFile: `Compliance_Summary_${startDate}_${endDate}.csv`,
      pdfFile: `Compliance_Summary_${startDate}_${endDate}.pdf`,
    },
    {
      key: "services-by-provider",
      label: "Services by Provider",
      description: "Session counts, minutes delivered, and students served by each provider. For superintendent review.",
      csvUrl: `/api/reports/exports/services-by-provider.csv?${dateParams}${scopeParams}${providerParam}${serviceTypeParam}`,
      pdfUrl: `/api/reports/exports/services-by-provider.pdf?${dateParams}${scopeParams}${providerParam}${serviceTypeParam}`,
      csvFile: `Services_By_Provider_${startDate}_${endDate}.csv`,
      pdfFile: `Services_By_Provider_${startDate}_${endDate}.pdf`,
    },
    {
      key: "student-roster",
      label: "Student Roster",
      description: "Full SPED student roster with disability category, placement, and IEP status.",
      csvUrl: `/api/reports/exports/student-roster.csv?${scopeParams.slice(1)}`,
      pdfUrl: `/api/reports/exports/student-roster.pdf?${scopeParams.slice(1)}`,
      csvFile: `Student_Roster_${now.toISOString().split("T")[0]}.csv`,
      pdfFile: `Student_Roster_${now.toISOString().split("T")[0]}.pdf`,
    },
    {
      key: "caseload-distribution",
      label: "Caseload Distribution",
      description: "Staff member caseload sizes by role and school. Identify imbalances.",
      csvUrl: `/api/reports/exports/caseload-distribution.csv?${scopeParams.slice(1)}`,
      pdfUrl: `/api/reports/exports/caseload-distribution.pdf?${scopeParams.slice(1)}`,
      csvFile: `Caseload_Distribution_${now.toISOString().split("T")[0]}.csv`,
      pdfFile: `Caseload_Distribution_${now.toISOString().split("T")[0]}.pdf`,
    },
  ];

  const dataExports = [
    {
      key: "active-ieps",
      label: "Active IEPs — Annual Review Timeline",
      description: "All active students with IEP start/end dates, days until annual review, and review status.",
      filename: `Active_IEPs_${now.toISOString().split("T")[0]}.csv`,
      url: `/api/reports/exports/active-ieps.csv?${scopeParams.slice(1)}${yearParam}`,
    },
    {
      key: "service-minutes",
      label: "Service Minutes — Mandated vs. Delivered",
      description: "Per-student, per-service breakdown of required minutes, sessions completed, and compliance percentage.",
      filename: `Service_Minutes_${startDate}_${endDate}.csv`,
      url: `/api/reports/exports/service-minutes.csv?${dateParams}${scopeParams}${yearParam}`,
    },
    {
      key: "incidents",
      label: "Restraint & Seclusion Incidents",
      description: "All incidents with DESE-required fields: type, duration, injuries, notifications, debrief, and status.",
      filename: `Incidents_${startDate}_${endDate}.csv`,
      url: `/api/reports/exports/incidents.csv?${dateParams}${schoolParam}${yearParam}`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
        {(["reports", "history", "schedule"] as const).map(s => (
          <button key={s} onClick={() => setActiveSection(s)}
            className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors ${activeSection === s ? "bg-emerald-50 text-emerald-700" : "text-gray-500 hover:text-gray-700"}`}>
            {s === "reports" ? "Generate Reports" : s === "history" ? "Export History" : "Scheduled Reports"}
          </button>
        ))}
      </div>

      {activeSection === "reports" && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="text-[11px] text-gray-500 font-medium block mb-1">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="form-input text-xs h-8 w-36" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-medium block mb-1">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="form-input text-xs h-8 w-36" />
            </div>
            {schoolYears.length > 0 && (
              <div>
                <label className="text-[11px] text-gray-500 font-medium block mb-1">School Year</label>
                <Select value={selectedYearId} onValueChange={setSelectedYearId}>
                  <SelectTrigger className="h-8 text-[12px] bg-white w-[130px]">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Years</SelectItem>
                    {[...schoolYears].reverse().map(y => (
                      <SelectItem key={y.id} value={String(y.id)}>{y.label}{y.isActive ? " *" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {providers.length > 0 && (
              <div>
                <label className="text-[11px] text-gray-500 font-medium block mb-1">Provider</label>
                <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
                  <SelectTrigger className="h-8 text-[12px] bg-white w-[160px]">
                    <SelectValue placeholder="Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Providers</SelectItem>
                    {providers.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {serviceTypes.length > 0 && (
              <div>
                <label className="text-[11px] text-gray-500 font-medium block mb-1">Service Type</label>
                <Select value={selectedServiceTypeId} onValueChange={setSelectedServiceTypeId}>
                  <SelectTrigger className="h-8 text-[12px] bg-white w-[160px]">
                    <SelectValue placeholder="Service Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {serviceTypes.map(st => (
                      <SelectItem key={st.id} value={String(st.id)}>{st.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-[11px] text-gray-500 font-medium block mb-1">Compliance</label>
              <Select value={complianceFilter} onValueChange={setComplianceFilter}>
                <SelectTrigger className="h-8 text-[12px] bg-white w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="compliant">Compliant</SelectItem>
                  <SelectItem value="non-compliant">Non-Compliant</SelectItem>
                  <SelectItem value="at-risk">At Risk</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Committee & Presentation Reports</p>
            <div className="space-y-3">
              {committeeReports.map(r => (
                <Card key={r.key}>
                  <CardContent className="p-4 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-800">{r.label}</p>
                      <p className="text-[12px] text-gray-500 leading-relaxed mt-0.5">{r.description}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" className="gap-1.5 text-[12px]"
                        onClick={() => downloadAuthFile(r.pdfUrl, r.pdfFile)} disabled={downloading === r.pdfFile}>
                        <FileText className="w-3.5 h-3.5" />
                        {downloading === r.pdfFile ? "…" : "PDF"}
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5 text-[12px]"
                        onClick={() => downloadAuthFile(r.csvUrl, r.csvFile)} disabled={downloading === r.csvFile}>
                        <Download className="w-3.5 h-3.5" />
                        {downloading === r.csvFile ? "…" : "CSV"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Data Exports (CSV)</p>
            <div className="space-y-3">
              {dataExports.map(exp => (
                <Card key={exp.key}>
                  <CardContent className="p-4 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[13px] font-semibold text-gray-800">{exp.label}</p>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">CSV</span>
                      </div>
                      <p className="text-[12px] text-gray-500 leading-relaxed">{exp.description}</p>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5 text-[12px] shrink-0"
                      onClick={() => downloadAuthFile(exp.url, exp.filename)} disabled={downloading === exp.filename}>
                      <Download className="w-3.5 h-3.5" />
                      {downloading === exp.filename ? "Downloading…" : "Download"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Student Full-Record Export (PDF)</p>
            <Card className="border-dashed">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <FileText className="w-8 h-8 text-gray-300 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-gray-700">Individual Student Record</p>
                    <p className="text-[12px] text-gray-500 mt-0.5 leading-relaxed">
                      Generates a comprehensive PDF for a single student including IEP, goals, accommodations, progress reports, meetings, incidents, and parent contacts.
                    </p>
                    <p className="text-[12px] text-emerald-700 mt-2">
                      Access from the student's IEP page — use the "Export Full Record" button.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {activeSection === "history" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700">Recent Exports</p>
            <Button size="sm" variant="outline" className="text-[12px]" onClick={loadHistory}>Refresh</Button>
          </div>
          {historyLoading ? <Skeleton className="h-48" /> : history.length === 0 ? (
            <Card><CardContent className="py-10 text-center"><p className="text-sm text-gray-400">No exports generated yet.</p></CardContent></Card>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Report</th>
                    <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Format</th>
                    <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Records</th>
                    <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">File</th>
                    <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Generated</th>
                    <th className="text-center px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {history.map((h: any) => {
                    const canRedownload = h.format === "csv" && ["compliance-summary", "services-by-provider", "student-roster", "caseload-distribution"].includes(h.reportType);
                    return (
                    <tr key={h.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2 text-[13px] text-gray-700 font-medium">{h.reportLabel}</td>
                      <td className="px-4 py-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${h.format === "pdf" ? "bg-red-50 text-red-600 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                          {(h.format || "csv").toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-[13px] text-gray-600 text-right font-mono">{h.recordCount}</td>
                      <td className="px-4 py-2 text-[11px] text-gray-400 font-mono max-w-[200px] truncate">{h.fileName}</td>
                      <td className="px-4 py-2 text-[12px] text-gray-500">{h.createdAt ? new Date(h.createdAt).toLocaleString() : ""}</td>
                      <td className="px-4 py-2 text-center">
                        {canRedownload && (
                          <Button size="sm" variant="ghost" className="text-[11px] gap-1 h-7 px-2"
                            onClick={() => downloadAuthFile(`/api/reports/exports/history/${h.id}/download`, h.fileName || `${h.reportType}.csv`)}
                            disabled={downloading === (h.fileName || `${h.reportType}.csv`)}>
                            <Download className="w-3 h-3" />
                            Re-download
                          </Button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeSection === "schedule" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-gray-700">Scheduled Reports</p>
              <p className="text-[12px] text-gray-400 mt-0.5">Automatically generate and deliver reports on a recurring schedule.</p>
            </div>
            {!scheduleForm && (
              <Button size="sm" className="gap-1.5 text-[12px] bg-emerald-700 hover:bg-emerald-800 text-white"
                onClick={() => setScheduleForm({ reportType: "compliance-summary", frequency: "weekly", emails: "" })}>
                + New Schedule
              </Button>
            )}
          </div>

          {scheduleForm && (
            <Card className="border-emerald-200 bg-emerald-50/20 mb-4">
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-gray-500 font-medium block mb-1">Report Type</label>
                    <select value={scheduleForm.reportType} onChange={e => setScheduleForm({ ...scheduleForm, reportType: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-700 bg-white">
                      <option value="compliance-summary">Compliance Summary</option>
                      <option value="services-by-provider">Services by Provider</option>
                      <option value="student-roster">Student Roster</option>
                      <option value="caseload-distribution">Caseload Distribution</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 font-medium block mb-1">Frequency</label>
                    <select value={scheduleForm.frequency} onChange={e => setScheduleForm({ ...scheduleForm, frequency: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-700 bg-white">
                      <option value="weekly">Weekly (Monday morning)</option>
                      <option value="monthly">Monthly (1st of month)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 font-medium block mb-1">Recipient Emails</label>
                    <input type="text" value={scheduleForm.emails} onChange={e => setScheduleForm({ ...scheduleForm, emails: e.target.value })}
                      placeholder="email@school.edu, admin@school.edu"
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-700" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" className="text-[12px]" onClick={() => setScheduleForm(null)}>Cancel</Button>
                  <Button size="sm" className="text-[12px] bg-emerald-700 hover:bg-emerald-800 text-white" onClick={handleCreateSchedule}>Create Schedule</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {schedules.length === 0 && !scheduleForm ? (
            <Card><CardContent className="py-10 text-center"><p className="text-sm text-gray-400">No scheduled reports configured.</p></CardContent></Card>
          ) : (
            <div className="space-y-2">
              {schedules.map((s: any) => (
                <Card key={s.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-semibold text-gray-700">{REPORT_TYPE_LABELS[s.reportType] ?? s.reportType}</p>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">{s.frequency}</span>
                        {s.enabled ? (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">Active</span>
                        ) : (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Paused</span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Recipients: {(s.recipientEmails ?? []).join(", ")}
                        {s.nextRunAt && ` · Next run: ${new Date(s.nextRunAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="text-[12px] text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDeleteSchedule(s.id)}>Remove</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExecutiveSummaryTab() {
  const { filterParams } = useSchoolContext();
  const { user } = useRole();
  const now = new Date();
  const [startDate, setStartDate] = useState(() => new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(() => now.toISOString().split("T")[0]);

  const params: GetExecutiveSummaryReportParams = { preparedBy: user.name, startDate, endDate };
  if (filterParams.schoolId) params.schoolId = Number(filterParams.schoolId);
  if (filterParams.districtId) params.districtId = Number(filterParams.districtId);
  const { data, isLoading: loading, isError } = useGetExecutiveSummaryReport(params);

  function handlePrint() {
    window.print();
  }

  if (loading) return <div className="space-y-4"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>;
  if (isError || !data) return <ErrorBanner message="Failed to load executive summary." />;

  const sd = data.serviceDelivery;
  const rc = data.riskCounts;
  const dl = data.iepDeadlines;
  const totalTracked = rc.onTrack + rc.slightlyBehind + rc.atRisk + rc.outOfCompliance;

  return (
    <div className="space-y-6 print:space-y-4" id="executive-summary">
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <div>
            <label className="text-[11px] text-gray-400 block mb-0.5">Date From</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-700" />
          </div>
          <div>
            <label className="text-[11px] text-gray-400 block mb-0.5">Date To</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-700" />
          </div>
          <p className="text-xs text-gray-400 self-end pb-1">Generated {new Date(data.generatedAt).toLocaleString()}{data.preparedBy ? ` by ${data.preparedBy}` : ""}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={handlePrint}>
          <Printer className="w-3.5 h-3.5" /> Print / PDF
        </Button>
      </div>

      <div className="print:block hidden text-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">SPED Compliance Executive Summary</h2>
        <p className="text-sm text-gray-500">Generated {new Date(data.generatedAt).toLocaleString()}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-gray-200/60">
          <CardContent className="p-5 flex flex-col items-center">
            <ProgressRing
              value={data.complianceRate}
              size={100}
              strokeWidth={10}
              label={`${data.complianceRate}%`}
              sublabel="Compliant"
              color={data.complianceRate >= 80 ? "#059669" : data.complianceRate >= 60 ? "#d97706" : "#dc2626"}
            />
            <p className="text-xs text-gray-500 mt-2">{data.totalActiveStudents} active students</p>
          </CardContent>
        </Card>

        <Card className="border-gray-200/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Risk Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <RiskRow label="On Track" count={rc.onTrack} total={totalTracked} color="#059669" />
            <RiskRow label="Slightly Behind" count={rc.slightlyBehind} total={totalTracked} color="#9ca3af" />
            <RiskRow label="At Risk" count={rc.atRisk} total={totalTracked} color="#dc2626" />
            <RiskRow label="Non-Compliant" count={rc.outOfCompliance} total={totalTracked} color="#991b1b" />
          </CardContent>
        </Card>

        <Card className="border-gray-200/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" /> Service Delivery
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">Delivered</span>
              <span className="font-mono text-gray-800">{sd.totalDeliveredMinutes.toLocaleString()} min</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">Required</span>
              <span className="font-mono text-gray-800">{sd.totalRequiredMinutes.toLocaleString()} min</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">Overall</span>
              <span className={`font-bold ${sd.overallPercent >= 85 ? "text-emerald-600" : "text-red-600"}`}>{sd.overallPercent}%</span>
            </div>
            <div className="h-px bg-gray-100 my-1" />
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Missed Sessions</span>
              <span className="text-red-500 font-medium">{sd.totalMissedSessions}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Makeup Sessions</span>
              <span className="text-emerald-600 font-medium">{sd.totalMakeupSessions}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> IEP Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {dl.overdue > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-red-600 font-medium">Overdue</span>
                <span className="font-bold text-red-600">{dl.overdue}</span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">Next 30 days</span>
              <span className="font-medium text-gray-800">{dl.within30}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">Next 60 days</span>
              <span className="font-medium text-gray-800">{dl.within60}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">Next 90 days</span>
              <span className="font-medium text-gray-800">{dl.within90}</span>
            </div>
            <div className="h-px bg-gray-100 my-1" />
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Open Alerts</span>
              <span className="text-gray-800 font-medium">{data.alerts.openAlerts}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Critical</span>
              <span className="text-red-600 font-medium">{data.alerts.criticalAlerts}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">Service Delivery by Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Service</th>
                  <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Students</th>
                  <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Delivered</th>
                  <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Required</th>
                  <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Complete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sd.byService.map((s, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-[13px] text-gray-700 font-medium">{s.serviceTypeName}</td>
                    <td className="px-4 py-2 text-[13px] text-gray-600 text-right">{s.studentCount}</td>
                    <td className="px-4 py-2 text-[13px] text-gray-600 font-mono text-right">{s.deliveredMinutes.toLocaleString()}</td>
                    <td className="px-4 py-2 text-[13px] text-gray-600 font-mono text-right">{s.requiredMinutes.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`text-[12px] font-bold ${s.percentComplete >= 85 ? "text-emerald-600" : s.percentComplete >= 70 ? "text-gray-600" : "text-red-600"}`}>
                        {s.percentComplete}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ComplianceTrendTab() {
  const { filterParams } = useSchoolContext();
  const { user } = useRole();
  const [granularity, setGranularity] = useState<string>("monthly");
  const [selectedSchools, setSelectedSchools] = useState<Set<number>>(new Set());

  const now = new Date();
  const [startDate, setStartDate] = useState(() => new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(() => now.toISOString().split("T")[0]);

  const queryParams: GetComplianceTrendReportParams = { startDate, endDate, granularity: granularity as "weekly" | "monthly", preparedBy: user.name };
  if (filterParams.schoolId) queryParams.schoolId = Number(filterParams.schoolId);
  if (filterParams.districtId) queryParams.districtId = Number(filterParams.districtId);

  const { data, isLoading: loading } = useGetComplianceTrendReport(queryParams);

  useEffect(() => {
    if (data?.schools && data.schools.length > 0 && selectedSchools.size === 0) {
      setSelectedSchools(new Set(data.schools.map(s => s.schoolId)));
    }
  }, [data?.schools]);

  const chartData = useMemo(() => {
    if (!data?.trend) return [];
    return data.trend.map(t => {
      const point: Record<string, string | number | null> = {
        period: t.period,
        label: formatPeriodLabel(t.period, granularity),
        overall: t.compliancePercent,
      };
      if (data.schools) {
        for (const school of data.schools) {
          if (selectedSchools.has(school.schoolId)) {
            const sp = school.trend.find(st => st.period === t.period);
            point[`school_${school.schoolId}`] = sp?.compliancePercent ?? null;
          }
        }
      }
      return point;
    });
  }, [data, selectedSchools, granularity]);

  const semesterLines = useMemo(() => {
    if (!data?.semesterMarkers || !chartData.length) return [];
    return ((data as any).semesterMarkers.map((m: any) => {
      const closest = chartData.reduce<{ label: string; dist: number }>((best, pt) => {
        const dist = Math.abs(new Date(pt.period as string).getTime() - new Date(m.date as string).getTime());
        return dist < best.dist ? { label: pt.label as string, dist } : best;
      }, { label: "", dist: Infinity });
      return { label: m.label as string, x: closest.label };
    }) as { label: string; x: string }[]).filter(m => m.x);
  }, [data?.semesterMarkers, chartData]);

  const SCHOOL_COLORS = ["#059669", "#dc2626", "#6b7280", "#d97706"];

  function toggleSchool(id: number) {
    setSelectedSchools(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportTrend() {
    if (!data?.trend) return;
    downloadCsv("compliance_trend.csv",
      ["Period", "Compliance %", "Students Tracked", "Minutes Delivered"],
      data.trend.map(t => [t.period, String(t.compliancePercent), String(t.studentsTracked), String(t.totalDelivered)]),
      { generatedAt: data.generatedAt, preparedBy: data.preparedBy }
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div>
            <label className="text-[11px] text-gray-400 block mb-0.5">From</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700" />
          </div>
          <div>
            <label className="text-[11px] text-gray-400 block mb-0.5">To</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700" />
          </div>
          <div>
            <label className="text-[11px] text-gray-400 block mb-0.5">Granularity</label>
            <select value={granularity} onChange={e => setGranularity(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700">
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={exportTrend} disabled={!data?.trend?.length}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </Button>
      </div>

      {data?.schools && data.schools.length > 1 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-400">Schools:</span>
          {data.schools.map((s, i) => (
            <button key={s.schoolId} onClick={() => toggleSchool(s.schoolId)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${selectedSchools.has(s.schoolId) ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200"}`}>
              <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: SCHOOL_COLORS[i % SCHOOL_COLORS.length] }} />
              {s.schoolName}
            </button>
          ))}
        </div>
      )}

      <Card className="border-gray-200/60">
        <CardContent className="p-4">
          {loading ? <Skeleton className="h-72" /> : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(v: number) => [`${v}%`, ""]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {semesterLines.map((m: { label: string; x: string }, i: number) => (
                  <ReferenceLine key={i} x={m.x} stroke="#d1d5db" strokeDasharray="4 4" label={{ value: m.label, position: "top" as any, fontSize: 10, fill: "#9ca3af" }} />
                ))}
                <Line type="monotone" dataKey="overall" name="District Overall" stroke="#111827" strokeWidth={2.5} dot={{ r: 3 }} />
                {data?.schools?.filter(s => selectedSchools.has(s.schoolId)).map((s, i) => (
                  <Line
                    key={s.schoolId}
                    type="monotone"
                    dataKey={`school_${s.schoolId}`}
                    name={s.schoolName}
                    stroke={SCHOOL_COLORS[i % SCHOOL_COLORS.length]}
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    dot={{ r: 2 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-72 flex items-center justify-center text-sm text-gray-400">No trend data available for this date range</div>
          )}
        </CardContent>
      </Card>

      {data?.trend && data.trend.length > 0 && (
        <Card className="border-gray-200/60">
          <CardContent className="p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Period</th>
                  <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Compliance</th>
                  <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Students</th>
                  <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Minutes Delivered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.trend.map(t => (
                  <tr key={t.period}>
                    <td className="px-4 py-2 text-[13px] text-gray-700 font-medium">{formatPeriodLabel(t.period, granularity)}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`text-[12px] font-bold ${t.compliancePercent >= 85 ? "text-emerald-600" : t.compliancePercent >= 70 ? "text-gray-600" : "text-red-600"}`}>
                        {t.compliancePercent}%
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[13px] text-gray-600 text-right">{t.studentsTracked}</td>
                    <td className="px-4 py-2 text-[13px] text-gray-600 font-mono text-right">{t.totalDelivered.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AuditPackageTab() {
  const { filterParams } = useSchoolContext();
  const { user } = useRole();
  const [data, setData] = useState<AuditPackageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 6);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [expandedStudent, setExpandedStudent] = useState<number | null>(null);

  function generate() {
    const params: GetAuditPackageReportParams = { startDate, endDate, preparedBy: user.name };
    if (filterParams.schoolId) params.schoolId = Number(filterParams.schoolId);
    if (filterParams.districtId) params.districtId = Number(filterParams.districtId);
    setLoading(true);
    getAuditPackageReport(params)
      .then(d => setData(d as AuditPackageResponse))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }

  function exportAuditCsv() {
    if (!data?.students) return;
    const headers = ["Student", "Grade", "School", "Service", "Required (min)", "Interval",
      "Completed Sessions", "Missed Sessions", "Makeup Sessions", "Delivered (min)", "Parent Contacts"];
    const rows: string[][] = [];
    for (const s of data.students) {
      for (const req of s.serviceRequirements) {
        rows.push([
          s.studentName, s.grade ?? "", s.school ?? "", req.serviceTypeName ?? "",
          String(req.requiredMinutes), req.intervalType,
          String(s.sessionSummary.totalCompleted), String(s.sessionSummary.totalMissed),
          String(s.sessionSummary.totalMakeup), String(s.sessionSummary.deliveredMinutes),
          String(s.parentContacts.length),
        ]);
      }
      if (s.serviceRequirements.length === 0) {
        rows.push([
          s.studentName, s.grade ?? "", s.school ?? "", "None", "0", "",
          String(s.sessionSummary.totalCompleted), String(s.sessionSummary.totalMissed),
          String(s.sessionSummary.totalMakeup), String(s.sessionSummary.deliveredMinutes),
          String(s.parentContacts.length),
        ]);
      }
    }
    const meta = { generatedAt: data.generatedAt, preparedBy: data.preparedBy };
    downloadCsv(`audit_package_${startDate}_${endDate}.csv`, headers, rows, meta);
  }

  function exportDetailedCsv() {
    if (!data?.students) return;
    const headers = ["Student", "Date", "Service", "Duration (min)", "Status", "Missed Reason", "Makeup", "Provider", "Notes"];
    const rows: string[][] = [];
    for (const s of data.students) {
      for (const sess of s.sessions) {
        rows.push([
          s.studentName, sess.date, sess.service ?? "", String(sess.duration),
          sess.status, sess.missedReason ?? "", sess.isMakeup ? "Yes" : "No", sess.provider ?? "", sess.notes ?? "",
        ]);
      }
    }
    const meta = { generatedAt: data.generatedAt, preparedBy: data.preparedBy };
    downloadCsv(`audit_sessions_detail_${startDate}_${endDate}.csv`, headers, rows, meta);
  }

  function exportParentContactsCsv() {
    if (!data?.students) return;
    const headers = ["Student", "Grade", "School", "Contact Date", "Method", "Notes"];
    const rows: string[][] = [];
    for (const s of data.students) {
      for (const c of s.parentContacts) {
        rows.push([s.studentName, s.grade ?? "", s.school ?? "", c.date, c.method ?? "", c.notes ?? ""]);
      }
      if (s.parentContacts.length === 0) {
        rows.push([s.studentName, s.grade ?? "", s.school ?? "", "", "No contacts recorded", ""]);
      }
    }
    const meta = { generatedAt: data.generatedAt, preparedBy: data.preparedBy };
    downloadCsv(`audit_parent_contacts_${startDate}_${endDate}.csv`, headers, rows, meta);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div>
            <label className="text-[11px] text-gray-400 block mb-0.5">Date From</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700" />
          </div>
          <div>
            <label className="text-[11px] text-gray-400 block mb-0.5">Date To</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700" />
          </div>
          <div className="pt-4">
            <Button size="sm" onClick={generate} disabled={loading} className="gap-1.5 text-[12px]"
              style={{ backgroundColor: "#059669" }}>
              {loading ? "Generating..." : "Generate Report"}
            </Button>
          </div>
        </div>
        {data?.students && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={exportAuditCsv}>
              <Download className="w-3.5 h-3.5" /> Summary CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={exportDetailedCsv}>
              <Download className="w-3.5 h-3.5" /> Detailed CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={exportParentContactsCsv}>
              <Download className="w-3.5 h-3.5" /> Parent Contacts CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={() => window.print()}>
              <Printer className="w-3.5 h-3.5" /> Print / PDF
            </Button>
          </div>
        )}
      </div>

      {data && (
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>Generated: {new Date(data.generatedAt).toLocaleString()}</span>
          <span>Date range: {data.dateRange.start} to {data.dateRange.end}</span>
          <span>{data.students.length} students</span>
        </div>
      )}

      {data && (
        <div className="hidden print:block mb-6">
          <h2 className="text-xl font-bold text-gray-900 text-center">SPED Audit Package</h2>
          <p className="text-sm text-gray-500 text-center">
            {data.dateRange.start} — {data.dateRange.end} | {data.students.length} students
            {data.preparedBy ? ` | Prepared by ${data.preparedBy}` : ""}
            {` | Generated ${new Date(data.generatedAt).toLocaleString()}`}
          </p>
        </div>
      )}

      {data?.students && data.students.length > 0 ? (
        <Card className="border-gray-200/60">
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {data.students.map(student => (
                <div key={student.studentId} className="print:break-inside-avoid">
                  <button
                    onClick={() => setExpandedStudent(expandedStudent === student.studentId ? null : student.studentId)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left print:hidden"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600">
                        {student.studentName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-800">{student.studentName}</span>
                        <span className="text-xs text-gray-400 ml-2">Gr. {student.grade ?? "?"}</span>
                        {student.school && <span className="text-xs text-gray-400 ml-2">{student.school}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{student.serviceRequirements.length} services</span>
                      <span className="text-emerald-600">{student.sessionSummary.totalCompleted} completed</span>
                      {student.sessionSummary.totalMissed > 0 && <span className="text-red-500">{student.sessionSummary.totalMissed} missed</span>}
                      <span>{student.sessionSummary.deliveredMinutes.toLocaleString()} min</span>
                      <span className={`transform transition-transform ${expandedStudent === student.studentId ? "rotate-180" : ""}`}>▼</span>
                    </div>
                  </button>
                  <div className="hidden print:block px-5 py-2 border-b border-gray-200">
                    <span className="text-sm font-semibold text-gray-800">{student.studentName}</span>
                    <span className="text-xs text-gray-400 ml-2">Gr. {student.grade ?? "?"}</span>
                    {student.school && <span className="text-xs text-gray-400 ml-2">{student.school}</span>}
                    <span className="text-xs text-gray-500 ml-3">{student.sessionSummary.totalCompleted} completed, {student.sessionSummary.totalMissed} missed, {student.sessionSummary.deliveredMinutes.toLocaleString()} min</span>
                  </div>
                  <div className={`px-5 pb-4 bg-gray-50/50 space-y-3 ${expandedStudent === student.studentId ? "" : "hidden print:block"}`}>
                      <div>
                        <h4 className="text-[11px] font-semibold text-gray-400 uppercase mb-1.5">Service Requirements</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {student.serviceRequirements.map((r, i) => (
                            <div key={i} className="bg-white rounded-lg border border-gray-100 p-2.5 text-xs">
                              <div className="font-medium text-gray-700">{r.serviceTypeName}</div>
                              <div className="text-gray-500 mt-0.5">{r.requiredMinutes} min/{r.intervalType} {r.provider && `· ${r.provider}`}</div>
                              <div className="text-gray-400 mt-0.5">{r.startDate} — {r.endDate ?? "ongoing"} {r.active ? "" : "(inactive)"}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {student.sessions.length > 0 && (
                        <div>
                          <h4 className="text-[11px] font-semibold text-gray-400 uppercase mb-1.5">
                            Recent Sessions ({student.sessions.length})
                          </h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-gray-100">
                                  <th className="text-left px-2 py-1.5 text-gray-400 font-semibold">Date</th>
                                  <th className="text-left px-2 py-1.5 text-gray-400 font-semibold">Service</th>
                                  <th className="text-left px-2 py-1.5 text-gray-400 font-semibold">Duration</th>
                                  <th className="text-left px-2 py-1.5 text-gray-400 font-semibold">Status</th>
                                  <th className="text-left px-2 py-1.5 text-gray-400 font-semibold">Reason</th>
                                  <th className="text-left px-2 py-1.5 text-gray-400 font-semibold">Provider</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {student.sessions.slice(-20).map((s, i) => (
                                  <tr key={i}>
                                    <td className="px-2 py-1.5 text-gray-600">{s.date}</td>
                                    <td className="px-2 py-1.5 text-gray-600">{s.service}</td>
                                    <td className="px-2 py-1.5 text-gray-600">{s.duration} min</td>
                                    <td className="px-2 py-1.5">
                                      <span className={s.status === "missed" ? "text-red-500 font-medium" : s.isMakeup ? "text-emerald-600" : "text-gray-600"}>
                                        {s.status}{s.isMakeup ? " (makeup)" : ""}
                                      </span>
                                    </td>
                                    <td className="px-2 py-1.5 text-gray-500">{s.status === "missed" ? (s.missedReason ?? "—") : "—"}</td>
                                    <td className="px-2 py-1.5 text-gray-500">{s.provider ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {student.parentContacts.length > 0 && (
                        <div>
                          <h4 className="text-[11px] font-semibold text-gray-400 uppercase mb-1.5">
                            Parent Contacts ({student.parentContacts.length})
                          </h4>
                          <div className="space-y-1.5">
                            {student.parentContacts.map((c, i) => (
                              <div key={i} className="bg-white rounded-lg border border-gray-100 p-2.5 text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-600 font-medium">{c.date}</span>
                                  <span className="text-gray-400">{c.method}</span>
                                  <span className="text-gray-700 font-medium">{c.subject}</span>
                                </div>
                                {c.outcome && <div className="text-gray-500 mt-0.5">Outcome: {c.outcome}</div>}
                                {c.parentName && <div className="text-gray-400 mt-0.5">Parent: {c.parentName}</div>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : data && (
        <div className="py-12 text-center text-sm text-gray-400">No students found for the selected filters</div>
      )}

      {!data && !loading && (
        <div className="py-16 text-center">
          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">Select a date range and click Generate Report</p>
          <p className="text-xs text-gray-400 mt-1">This report includes per-student service requirements, sessions, and parent contacts</p>
        </div>
      )}
    </div>
  );
}

function MinuteSummaryTab() {
  const { user } = useRole();
  const { data: minuteSummary, isLoading: loadingMinutes, isError: errMinutes, refetch: refetchMinutes } = useGetStudentMinuteSummaryReport();
  const minuteList = Array.isArray(minuteSummary) ? minuteSummary : [];

  function exportMinutes() {
    downloadCsv("minute_summary.csv",
      ["Student", "Service", "Delivered (min)", "Required (min)", "% Complete", "Status"],
      minuteList.map(r => [r.studentName, r.serviceTypeName, String(r.deliveredMinutes), String(r.requiredMinutes), String(Math.round(r.percentComplete ?? 0)), r.riskStatus]),
      { generatedAt: new Date().toISOString(), preparedBy: user.name }
    );
  }

  return (
    <Card>
      {errMinutes ? <ErrorBanner message="Failed to load minute summary." onRetry={() => refetchMinutes()} /> : <>
      <div className="flex items-center justify-end px-5 pt-3">
        <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={exportMinutes} disabled={minuteList.length === 0}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Student</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Service</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Delivered</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Required</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Progress</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loadingMinutes ? [...Array(10)].map((_, i) => (
              <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
            )) : minuteList.slice(0, 200).map((row, i) => {
              const cfg = RISK_CONFIG[row.riskStatus] ?? RISK_CONFIG.on_track;
              const pct = Math.min(100, row.percentComplete ?? 0);
              return (
                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/students/${row.studentId}`} className="text-[13px] font-medium text-gray-800 hover:text-emerald-700">
                      {row.studentName}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-gray-500 max-w-[160px] truncate">{row.serviceTypeName}</td>
                  <td className="px-5 py-3 text-[13px] text-gray-600 font-mono">{row.deliveredMinutes}</td>
                  <td className="px-5 py-3 text-[13px] text-gray-600 font-mono">{row.requiredMinutes}</td>
                  <td className="px-5 py-3 w-28">
                    <div className="flex items-center gap-2">
                      <MiniProgressRing value={pct} size={24} strokeWidth={2.5} color={cfg.ringColor} />
                      <span className="text-[12px] font-bold text-gray-700">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </>}
    </Card>
  );
}

function MissedSessionsTab() {
  const { user } = useRole();
  const { data: missedSessions, isLoading: loadingMissed, isError: errMissed, refetch: refetchMissed } = useGetMissedSessionsReport();
  const missedList = Array.isArray(missedSessions) ? missedSessions : [];

  function exportMissed() {
    downloadCsv("missed_sessions.csv",
      ["Student", "Service", "Date", "Reason", "Staff"],
      missedList.map(r => [r.studentName ?? "", r.serviceTypeName ?? "", r.sessionDate ?? "", (r as any).missedReason ?? "—", r.staffName ?? "—"]),
      { generatedAt: new Date().toISOString(), preparedBy: user.name }
    );
  }

  return (
    <Card>
      {errMissed ? <ErrorBanner message="Failed to load missed sessions." onRetry={() => refetchMissed()} /> : <>
      <div className="flex items-center justify-end px-5 pt-3">
        <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={exportMissed} disabled={missedList.length === 0}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Student</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Service</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Provider</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Duration</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Makeup</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loadingMissed ? [...Array(10)].map((_, i) => (
              <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
            )) : missedList.slice(0, 200).map((s, i) => (
              <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-5 py-3 text-[13px] text-gray-600 whitespace-nowrap">{formatDate(s.sessionDate)}</td>
                <td className="px-5 py-3">
                  <Link href={`/students/${s.studentId}`} className="text-[13px] font-medium text-gray-800 hover:text-emerald-700">
                    {s.studentName ?? `Student ${s.studentId}`}
                  </Link>
                </td>
                <td className="px-5 py-3 text-[13px] text-gray-500 max-w-[140px] truncate">{s.serviceTypeName ?? "—"}</td>
                <td className="px-5 py-3 text-[13px] text-gray-500">{s.staffName ?? "—"}</td>
                <td className="px-5 py-3 text-[13px] text-gray-600">{s.durationMinutes ?? "—"} min</td>
                <td className="px-5 py-3">
                  {s.isMakeup
                    ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Made Up</span>
                    : <span className="text-[11px] font-medium text-red-500">Needed</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>}
    </Card>
  );
}

function RiskTab() {
  const { user } = useRole();
  const { data: complianceRisk, isLoading: loadingRisk, isError: errRisk, refetch: refetchRisk } = useGetComplianceRiskReport();
  const riskList = Array.isArray(complianceRisk) ? complianceRisk : [];

  function exportRisk() {
    downloadCsv("at_risk_students.csv",
      ["Student", "Service", "Risk Status", "Delivered", "Required", "% Complete"],
      riskList.map(r => [r.studentName, r.serviceTypeName, r.riskStatus, String(r.deliveredMinutes), String(r.requiredMinutes), String(Math.round(r.percentComplete ?? 0))]),
      { generatedAt: new Date().toISOString(), preparedBy: user.name }
    );
  }

  return (
    <Card>
      {errRisk ? <ErrorBanner message="Failed to load compliance risk data." onRetry={() => refetchRisk()} /> : <>
      <div className="flex items-center justify-end px-5 pt-3">
        <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={exportRisk} disabled={riskList.length === 0}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Student</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Service</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Risk Level</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Delivered</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Progress</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Behind</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loadingRisk ? [...Array(10)].map((_, i) => (
              <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
            )) : riskList.slice(0, 200).map((r, i) => {
              const cfg = RISK_CONFIG[r.riskStatus] ?? RISK_CONFIG.on_track;
              const pct = Math.min(100, r.percentComplete ?? 0);
              return (
                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/students/${r.studentId}`} className="text-[13px] font-medium text-gray-800 hover:text-emerald-700">
                      {r.studentName}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-gray-500 max-w-[140px] truncate">{r.serviceTypeName}</td>
                  <td className="px-5 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-gray-600 font-mono">{r.deliveredMinutes} / {r.requiredMinutes}</td>
                  <td className="px-5 py-3 w-28">
                    <div className="flex items-center gap-2">
                      <MiniProgressRing value={pct} size={24} strokeWidth={2.5} color={cfg.ringColor} />
                      <span className="text-[12px] font-bold text-gray-700">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-[12px] font-medium text-red-600">{r.remainingMinutes} min</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </>}
    </Card>
  );
}

function RiskRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-gray-800">{count}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function formatPeriodLabel(period: string, granularity: string): string {
  if (granularity === "monthly") {
    const [y, m] = period.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[parseInt(m) - 1]} ${y}`;
  }
  const d = new Date(period + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface ParentSummaryData {
  student: { id: number; firstName: string; lastName: string; grade: string | null; schoolName: string | null };
  providers: Array<{ name: string; role: string; email: string | null }>;
  reportingPeriod: { label: string; start: string; end: string; status: string } | null;
  overallSummary: string | null;
  parentNotes: string | null;
  recommendations: string | null;
  goalSummaries: Array<{
    area: string; goalNumber: number; progressRating: string;
    statusLabel: string; statusColor: string; trendDirection: string;
    parentFriendlyNarrative: string; dataPoints: number;
    currentPerformance: string; targetCriterion: string | null;
  }>;
  servicesSummary: Array<{
    serviceType: string; requiredMinutes: number; deliveredMinutes: number;
    compliancePercent: number; sessionsSummary: string; parentFriendly: string;
  }>;
  availableReports: Array<{ id: number; reportingPeriod: string; periodStart: string; periodEnd: string; status: string; createdAt: string }>;
}

function StatusBadge({ color, label }: { color: string; label: string }) {
  const styles: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    gray: "bg-gray-50 text-gray-600 border-gray-200",
  };
  const icons: Record<string, any> = {
    emerald: CheckCircle2, blue: TrendingUp, amber: Clock, red: AlertTriangle, gray: Minus,
  };
  const Icon = icons[color] || Minus;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${styles[color] ?? styles.gray}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function TrendIcon({ direction }: { direction: string }) {
  if (direction === "improving") return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
  if (direction === "declining") return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-gray-400" />;
}

function ParentSummaryTab() {
  const [students, setStudents] = useState<Array<{ id: number; firstName: string; lastName: string }>>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [summary, setSummary] = useState<ParentSummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);

  useEffect(() => {
    listStudents().then(s => {
      setStudents(s as any[]);
      if ((s as any[]).length > 0 && !selectedStudentId) setSelectedStudentId((s as any[])[0].id);
    }).catch(() => {});
  }, []);

  const fetchSummary = useCallback(async (studentId: number) => {
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const data = await authFetch(`/api/reports/parent-summary/${studentId}`);
      setSummary(data as ParentSummaryData);
      setSelectedReportId(null);
    } catch { setError("Failed to load parent summary. Make sure this student has a progress report."); }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedStudentId) fetchSummary(selectedStudentId);
  }, [selectedStudentId, fetchSummary]);

  const handlePrint = () => window.print();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap print:hidden">
        <div>
          <label className="text-[12px] font-medium text-gray-500 block mb-1">Student</label>
          <select
            value={selectedStudentId ?? ""}
            onChange={e => setSelectedStudentId(parseInt(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200 min-w-[200px]"
          >
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
            ))}
          </select>
        </div>
        {summary && summary.availableReports.length > 1 && (
          <div>
            <label className="text-[12px] font-medium text-gray-500 block mb-1">Reporting Period</label>
            <select
              value={selectedReportId ?? ""}
              onChange={async e => {
                const rid = parseInt(e.target.value);
                setSelectedReportId(rid);
              }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              {summary.availableReports.map(r => (
                <option key={r.id} value={r.id}>{r.reportingPeriod} · {r.status === "final" ? "Final" : "Draft"}</option>
              ))}
            </select>
          </div>
        )}
        {summary && (
          <div className="ml-auto">
            <Button size="sm" variant="outline" className="text-[12px] h-9 gap-1.5" onClick={handlePrint}>
              <Printer className="w-3.5 h-3.5" /> Print / Save PDF
            </Button>
          </div>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">{error}</p>
            <p className="text-xs text-gray-400 mt-2">Generate a progress report from the student's IEP page first.</p>
            <Link href="/student-iep">
              <Button size="sm" className="mt-4 bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]">
                Go to Student IEP
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {summary && !loading && (
        <div className="space-y-6 print:space-y-4">
          <div className="print:block">
            <div className="border-b border-gray-100 pb-4 mb-6 print:mb-4">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 print:text-xl">
                    {summary.student.firstName} {summary.student.lastName}
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {summary.student.grade ? `Grade ${summary.student.grade}` : ""}
                    {summary.student.grade && summary.student.schoolName ? " · " : ""}
                    {summary.student.schoolName ?? ""}
                  </p>
                  {summary.reportingPeriod && (
                    <p className="text-xs text-gray-400 mt-1">
                      {summary.reportingPeriod.label}
                      {summary.reportingPeriod.start && summary.reportingPeriod.end
                        ? ` · ${summary.reportingPeriod.start} through ${summary.reportingPeriod.end}`
                        : ""}
                      {summary.reportingPeriod.status === "draft" && (
                        <span className="ml-2 px-1.5 py-0.5 bg-amber-50 text-amber-600 text-[10px] rounded font-semibold">DRAFT</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="text-right text-[11px] text-gray-400 print:text-xs">
                  <p className="font-semibold text-gray-600 text-xs">Prepared for Families</p>
                  <p>Generated {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
                </div>
              </div>
            </div>

            {!summary.reportingPeriod && (
              <Card className="border-amber-200 bg-amber-50/50 mb-4">
                <CardContent className="py-4 px-5">
                  <p className="text-sm font-semibold text-amber-800">No progress report found for this student.</p>
                  <p className="text-xs text-amber-700 mt-1">Go to the student's IEP page and generate a progress report to enable this summary.</p>
                </CardContent>
              </Card>
            )}

            {summary.overallSummary && (
              <Card className="bg-emerald-50/40 border-emerald-100 mb-4">
                <CardContent className="py-4 px-5">
                  <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide mb-1">Overall Progress</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{summary.overallSummary}</p>
                </CardContent>
              </Card>
            )}

            {summary.goalSummaries.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-base font-bold text-gray-800">Progress at a Glance</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 print:grid-cols-3">
                  {summary.goalSummaries.map((g, i) => (
                    <div key={i} className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm print:shadow-none print:border-gray-200">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide truncate">{g.area}</p>
                      <div className="mt-2 flex justify-center">
                        <StatusBadge color={g.statusColor} label={g.statusLabel} />
                      </div>
                      {g.dataPoints > 0 && (
                        <p className="text-[10px] text-gray-400 mt-1.5">{g.dataPoints} data points</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {summary.goalSummaries.length > 0 && (
              <div className="space-y-3 mt-6">
                <h3 className="text-base font-bold text-gray-800">Goal-by-Goal Summary</h3>
                {summary.goalSummaries.map((g, i) => (
                  <Card key={i} className="print:shadow-none print:border-gray-200">
                    <CardContent className="py-4 px-5">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Goal {g.goalNumber} · {g.area}</span>
                        <StatusBadge color={g.statusColor} label={g.statusLabel} />
                        <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                          <TrendIcon direction={g.trendDirection} />
                          {g.trendDirection === "improving" ? "Improving trend" : g.trendDirection === "declining" ? "Declining trend" : "Stable"}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{g.parentFriendlyNarrative}</p>
                      {(g.currentPerformance || g.targetCriterion) && (
                        <div className="flex gap-4 mt-3">
                          {g.currentPerformance && (
                            <div>
                              <p className="text-[10px] text-gray-400">Current</p>
                              <p className="text-[13px] font-semibold text-gray-700">{g.currentPerformance}</p>
                            </div>
                          )}
                          {g.targetCriterion && (
                            <div>
                              <p className="text-[10px] text-gray-400">Goal Target</p>
                              <p className="text-[13px] font-semibold text-gray-700">{g.targetCriterion}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {summary.servicesSummary.length > 0 && (
              <div className="space-y-3 mt-6">
                <h3 className="text-base font-bold text-gray-800">Services Received</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 print:grid-cols-2">
                  {summary.servicesSummary.map((s, i) => (
                    <Card key={i} className="print:shadow-none print:border-gray-200">
                      <CardContent className="py-4 px-5">
                        <p className="text-[13px] font-semibold text-gray-700">{s.serviceType}</p>
                        <p className="text-sm text-gray-600 mt-1">{s.parentFriendly}</p>
                        <div className="flex items-center gap-3 mt-3">
                          <div>
                            <p className="text-[10px] text-gray-400">Minutes Delivered</p>
                            <p className="text-[13px] font-bold text-gray-700">{s.deliveredMinutes}<span className="text-gray-400 font-normal"> / {s.requiredMinutes}</span></p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400">Attendance</p>
                            <p className={`text-[13px] font-bold ${s.compliancePercent >= 90 ? "text-emerald-600" : s.compliancePercent >= 75 ? "text-amber-600" : "text-red-500"}`}>
                              {Math.round(s.compliancePercent)}%
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {summary.recommendations && (
              <Card className="mt-6 bg-blue-50/40 border-blue-100 print:shadow-none">
                <CardContent className="py-4 px-5">
                  <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide mb-1">Recommendations &amp; Next Steps</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{summary.recommendations}</p>
                </CardContent>
              </Card>
            )}

            {summary.parentNotes && (
              <Card className="mt-4 print:shadow-none">
                <CardContent className="py-4 px-5">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Note to Family</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{summary.parentNotes}</p>
                </CardContent>
              </Card>
            )}

            {summary.providers.length > 0 && (
              <div className="mt-6 border-t border-gray-100 pt-4">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Your Child's Team</p>
                <div className="flex flex-wrap gap-4">
                  {summary.providers.map((p, i) => (
                    <div key={i} className="text-sm">
                      <p className="font-semibold text-gray-700">{p.name}</p>
                      <p className="text-gray-400 text-[11px] capitalize">{p.role.replace(/_/g, " ")}</p>
                      {p.email && <p className="text-gray-400 text-[11px]">{p.email}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {summary.goalSummaries.length === 0 && summary.servicesSummary.length === 0 && summary.reportingPeriod && (
              <Card>
                <CardContent className="py-10 text-center">
                  <Heart className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 font-medium">Progress report exists but has no goal or service data yet.</p>
                  <p className="text-xs text-gray-400 mt-1">Generate a new report from the student's IEP page to populate this summary.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
