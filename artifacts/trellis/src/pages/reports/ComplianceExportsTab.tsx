import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { useSchoolContext } from "@/lib/school-context";
import { useSchoolYears } from "@/lib/use-school-years";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ComplianceExportsTab() {
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
  const [scheduleForm, setScheduleForm] = useState<{ reportType: string; frequency: string; format: string; emails: string; startDate: string; endDate: string; schoolId: string; providerId: string; serviceTypeId: string; complianceStatus: string } | null>(null);
  const [providers, setProviders] = useState<{ id: number; name: string }[]>([]);
  const [serviceTypes, setServiceTypes] = useState<{ id: number; name: string }[]>([]);
  const [schools, setSchools] = useState<{ id: number; name: string }[]>([]);
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
    authFetch("/api/schools").then(r => r.ok ? r.json() : []).then((data: any) => {
      const list = Array.isArray(data) ? data : [];
      setSchools(list.map((s: any) => ({ id: s.id, name: s.name })));
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
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalid = emails.filter(e => !emailRegex.test(e));
    if (invalid.length > 0) { toast.error(`Invalid email format: ${invalid.join(", ")}`); return; }
    try {
      const res = await authFetch("/api/reports/exports/scheduled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: scheduleForm.reportType,
          frequency: scheduleForm.frequency,
          format: scheduleForm.format || "csv",
          recipientEmails: emails,
          filters: {
            startDate: scheduleForm.startDate || undefined,
            endDate: scheduleForm.endDate || undefined,
            schoolId: scheduleForm.schoolId !== "all" ? Number(scheduleForm.schoolId) : undefined,
            providerId: scheduleForm.providerId !== "all" ? Number(scheduleForm.providerId) : undefined,
            serviceTypeId: scheduleForm.serviceTypeId !== "all" ? Number(scheduleForm.serviceTypeId) : undefined,
            complianceStatus: scheduleForm.complianceStatus !== "all" ? scheduleForm.complianceStatus : undefined,
          },
        }),
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
                      Generates a PDF for a single student including IEP, goals, accommodations, progress reports, meetings, incidents, and parent contacts.
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
                    const canRedownload = (h.format === "csv" || h.format === "pdf") && ["compliance-summary", "services-by-provider", "student-roster", "caseload-distribution"].includes(h.reportType);
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
                        {canRedownload && (() => {
                          const fallbackExt = h.format === "pdf" ? "html" : "csv";
                          const fallbackName = `${h.reportType}.${fallbackExt}`;
                          const downloadName = h.format === "pdf"
                            ? (h.fileName ? h.fileName.replace(/\.pdf$/i, ".html") : fallbackName)
                            : (h.fileName || fallbackName);
                          return (
                          <Button size="sm" variant="ghost" className="text-[11px] gap-1 h-7 px-2"
                            onClick={() => downloadAuthFile(`/api/reports/exports/history/${h.id}/download`, downloadName)}
                            disabled={downloading === downloadName}>
                            <Download className="w-3 h-3" />
                            Re-download
                          </Button>
                          );
                        })()}
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
                onClick={() => setScheduleForm({ reportType: "compliance-summary", frequency: "weekly", format: "csv", emails: "", startDate: "", endDate: "", schoolId: "all", providerId: "all", serviceTypeId: "all", complianceStatus: "all" })}>
                + New Schedule
              </Button>
            )}
          </div>

          {scheduleForm && (
            <Card className="border-emerald-200 bg-emerald-50/20 mb-4">
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                    <label className="text-[11px] text-gray-500 font-medium block mb-1">Format</label>
                    <select value={scheduleForm.format} onChange={e => setScheduleForm({ ...scheduleForm, format: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-700 bg-white">
                      <option value="csv">CSV (spreadsheet)</option>
                      <option value="pdf">PDF (print-ready)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 font-medium block mb-1">Recipient Emails</label>
                    <input type="text" value={scheduleForm.emails} onChange={e => setScheduleForm({ ...scheduleForm, emails: e.target.value })}
                      placeholder="email@school.edu, admin@school.edu"
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-700" />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] text-gray-500 font-medium block mb-1">Start Date</label>
                    <input type="date" value={scheduleForm.startDate} onChange={e => setScheduleForm({ ...scheduleForm, startDate: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-700 bg-white" />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 font-medium block mb-1">End Date</label>
                    <input type="date" value={scheduleForm.endDate} onChange={e => setScheduleForm({ ...scheduleForm, endDate: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-700 bg-white" />
                  </div>
                  {schools.length > 0 && (
                    <div>
                      <label className="text-[11px] text-gray-500 font-medium block mb-1">School</label>
                      <select value={scheduleForm.schoolId} onChange={e => setScheduleForm({ ...scheduleForm, schoolId: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-700 bg-white">
                        <option value="all">All Schools</option>
                        {schools.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                      </select>
                    </div>
                  )}
                  {providers.length > 0 && (
                    <div>
                      <label className="text-[11px] text-gray-500 font-medium block mb-1">Provider</label>
                      <select value={scheduleForm.providerId} onChange={e => setScheduleForm({ ...scheduleForm, providerId: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-700 bg-white">
                        <option value="all">All Providers</option>
                        {providers.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                      </select>
                    </div>
                  )}
                  {serviceTypes.length > 0 && (
                    <div>
                      <label className="text-[11px] text-gray-500 font-medium block mb-1">Service Type</label>
                      <select value={scheduleForm.serviceTypeId} onChange={e => setScheduleForm({ ...scheduleForm, serviceTypeId: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-700 bg-white">
                        <option value="all">All Types</option>
                        {serviceTypes.map(st => <option key={st.id} value={String(st.id)}>{st.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-[11px] text-gray-500 font-medium block mb-1">Compliance</label>
                    <select value={scheduleForm.complianceStatus} onChange={e => setScheduleForm({ ...scheduleForm, complianceStatus: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-700 bg-white">
                      <option value="all">All Statuses</option>
                      <option value="compliant">Compliant</option>
                      <option value="non-compliant">Non-Compliant</option>
                      <option value="at-risk">At Risk</option>
                    </select>
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[13px] font-semibold text-gray-700">{REPORT_TYPE_LABELS[s.reportType] ?? s.reportType}</p>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">{s.frequency}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${(s.format ?? "csv") === "pdf" ? "bg-red-50 text-red-600 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                          {((s.format ?? "csv") as string).toUpperCase()}
                        </span>
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
