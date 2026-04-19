import { useState, useCallback, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useSchoolContext } from "@/lib/school-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useListSchools } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useSearch, useLocation } from "wouter";
import { DemoEmptyState } from "@/components/DemoEmptyState";
import {
  Download, AlertTriangle, CheckCircle2, XCircle,
  FileSpreadsheet, Clock, History,
  Shield, Info, FileText, Timer, ChevronDown, ChevronUp,
  Printer,
} from "lucide-react";

interface ReportTemplateMeta {
  key: string;
  label: string;
  description: string;
  columnCount: number;
}

interface ValidationWarning {
  studentId: number;
  studentName: string;
  field: string;
  message: string;
  severity: "error" | "warning";
}

interface ValidationResult {
  recordCount: number;
  errorCount: number;
  warningCount: number;
  errors: ValidationWarning[];
  warnings: ValidationWarning[];
}

interface ExportHistoryRow {
  id: number;
  reportType: string;
  reportLabel: string;
  exportedBy: string;
  schoolId: number | null;
  parameters: Record<string, unknown> | null;
  recordCount: number;
  warningCount: number;
  fileName: string;
  createdAt: string;
}

interface SchoolOption {
  id: number;
  name: string;
}

interface PhaseStatus {
  startDate: string | null;
  endDate: string | null;
  daysElapsed: number | null;
  daysAllowed: number;
  pctUsed: number | null;
  status: "green" | "yellow" | "red" | "complete";
  breached: boolean;
  daysRemaining: number | null;
}

interface IepTimelineRow {
  studentId: number;
  studentName: string;
  externalId: string | null;
  schoolName: string | null;
  referralId: number | null;
  referralDate: string | null;
  consentDate: string | null;
  evaluationCompletedDate: string | null;
  iepMeetingDate: string | null;
  iepFinalizedDate: string | null;
  phase: "PL1" | "PL2" | "complete" | "pre-consent";
  pl1: PhaseStatus;
  pl2: PhaseStatus;
  hasActivePl1Breach: boolean;
  hasActivePl2Breach: boolean;
}

interface IepTimelineSummary {
  total: number;
  pl1Active: number;
  pl2Active: number;
  breached: number;
  atRisk: number;
}

interface Restraint30DayWindow {
  studentId: number;
  studentName: string;
  externalId: string | null;
  schoolName: string | null;
  windowStart: string;
  windowEnd: string;
  incidentCount: number;
  physicalCount: number;
  mechanicalCount: number;
  seclCount: number;
  otherCount: number;
  restraintTypesSummary: string;
  parentNotifiedCount: number;
  parentNotificationCompliant: boolean;
  thirtyDayLogSent: boolean;
  incidentDates: string[];
}

interface Restraint30DayReport {
  windows: Restraint30DayWindow[];
  districtCompliant: boolean;
  totalStudentsWithRestraints: number;
  totalWindows: number;
  nonCompliantWindows: number;
  generatedAt: string;
  dateFrom: string;
  dateTo: string;
}

function ValidationPanel({ result }: { result: ValidationResult }) {
  const [showAll, setShowAll] = useState(false);
  const allIssues = [...result.errors, ...result.warnings];
  const displayed = showAll ? allIssues : allIssues.slice(0, 10);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-gray-500" />
          <span className="text-[13px] font-semibold text-gray-700">Pre-Export Validation</span>
          <span className="text-[11px] text-gray-400">{result.recordCount} records</span>
        </div>
        <div className="flex items-center gap-2">
          {result.errorCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700 border border-red-200">
              <XCircle className="w-3 h-3" /> {result.errorCount} error{result.errorCount !== 1 ? "s" : ""}
            </span>
          )}
          {result.warningCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
              <AlertTriangle className="w-3 h-3" /> {result.warningCount} warning{result.warningCount !== 1 ? "s" : ""}
            </span>
          )}
          {result.errorCount === 0 && result.warningCount === 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-3 h-3" /> All fields complete
            </span>
          )}
        </div>
      </div>

      {allIssues.length > 0 ? (
        <div className="divide-y divide-gray-50 max-h-[300px] overflow-y-auto">
          {displayed.map((w, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50/60 transition-colors">
              {w.severity === "error" ? (
                <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <span className="text-[12px] font-medium text-gray-700">
                  <Link href={`/students/${w.studentId}`} className="hover:text-emerald-700 underline">
                    {w.studentName}
                  </Link>
                  {" — "}
                  <span className="text-gray-500">{w.field}</span>
                </span>
                <p className="text-[11px] text-gray-400 mt-0.5">{w.message}</p>
              </div>
            </div>
          ))}
          {allIssues.length > 10 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full px-4 py-2 text-[12px] text-emerald-700 font-medium hover:bg-emerald-50/50 transition-colors"
            >
              Show all {allIssues.length} issues
            </button>
          )}
        </div>
      ) : (
        <div className="px-4 py-6 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
          <p className="text-[13px] text-gray-500 font-medium">All required fields are complete</p>
          <p className="text-[11px] text-gray-400 mt-1">{result.recordCount} records ready for export</p>
        </div>
      )}
    </div>
  );
}

function truncateUserId(id: string): string {
  if (!id || id === "unknown") return "System";
  if (id.length > 16) return id.slice(0, 8) + "…" + id.slice(-4);
  return id;
}

function PhaseBar({ phase, label }: { phase: PhaseStatus; label: string }) {
  if (!phase.startDate) {
    return (
      <div className="text-[11px] text-gray-400 italic">—</div>
    );
  }
  if (phase.status === "complete") {
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full bg-gray-300" style={{ width: `${Math.min(100, phase.pctUsed ?? 0)}%` }} />
        </div>
        <span className="text-[10px] text-gray-400">Done ({phase.daysElapsed}d)</span>
        {phase.breached && <span className="text-[10px] text-red-500 font-semibold">Breached</span>}
      </div>
    );
  }
  const barColor = phase.status === "red" ? "bg-red-500" : phase.status === "yellow" ? "bg-amber-400" : "bg-emerald-400";
  const textColor = phase.status === "red" ? "text-red-600" : phase.status === "yellow" ? "text-amber-600" : "text-emerald-600";
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] text-gray-500">{label}</span>
        <span className={`text-[10px] font-semibold ${textColor}`}>
          {phase.daysRemaining !== null && phase.daysRemaining > 0
            ? `${phase.daysRemaining}d left`
            : phase.breached
              ? `${Math.abs(phase.daysElapsed! - phase.daysAllowed)}d over`
              : "—"}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all`}
          style={{ width: `${Math.min(100, phase.pctUsed ?? 0)}%` }}
        />
      </div>
      <div className="text-[10px] text-gray-400 mt-0.5">{phase.daysElapsed}d / {phase.daysAllowed}d</div>
    </div>
  );
}

function StatusBadge({ status, label }: { status: "green" | "yellow" | "red" | "complete" | "current"; label?: string }) {
  if (status === "complete") {
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500">Done</span>;
  }
  if (status === "green") {
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700">{label ?? "On Track"}</span>;
  }
  if (status === "yellow") {
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700">{label ?? "At Risk"}</span>;
  }
  return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700">{label ?? "Breached"}</span>;
}

function RestraintTab({ schools }: { schools: SchoolOption[] }) {
  const [selectedSchool, setSelectedSchool] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const { data: report, isLoading, refetch } = useQuery<Restraint30DayReport>({
    queryKey: ["restraint-30day", selectedSchool, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ dateFrom, dateTo });
      if (selectedSchool) params.set("schoolId", selectedSchool);
      const res = await authFetch(`/api/state-reporting/restraint-30-day?${params}`);
      if (!res.ok) throw new Error("Failed to load restraint report");
      return res.json();
    },
  });

  async function handleExportCsv() {
    const params = new URLSearchParams({ dateFrom, dateTo, format: "csv" });
    if (selectedSchool) params.set("schoolId", selectedSchool);
    const res = await authFetch(`/api/state-reporting/restraint-30-day?${params}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="?(.+?)"?$/);
    const fileName = match?.[1] ?? "restraint_30day.csv";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  async function handlePrintPdf() {
    const params = new URLSearchParams({ dateFrom, dateTo, format: "pdf" });
    if (selectedSchool) params.set("schoolId", selectedSchool);
    const res = await authFetch(`/api/state-reporting/restraint-30-day?${params}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="?(.+?)"?$/);
    const fileName = match?.[1] ?? "restraint_30day.pdf";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function toggleRow(idx: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  const complianceBadge = report
    ? report.districtCompliant
      ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200"><CheckCircle2 className="w-3.5 h-3.5" /> Restraint Compliant</span>
      : <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-red-100 text-red-800 border border-red-200"><XCircle className="w-3.5 h-3.5" /> {report.nonCompliantWindows} Non-Compliant Window{report.nonCompliantWindows !== 1 ? "s" : ""}</span>
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-800">DESE 30-Day Restraint Aggregate</h2>
          <p className="text-[12px] text-gray-500 mt-0.5">One row per student per 30-day window with incident count, type breakdown, and parent notification status</p>
        </div>
        {complianceBadge}
      </div>

      <Card className="border-gray-100">
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-[12px] font-semibold text-gray-500 mb-1.5 block">School Scope</label>
              <select
                value={selectedSchool}
                onChange={(e) => setSelectedSchool(e.target.value)}
                className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              >
                <option value="">All Schools</option>
                {schools.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-semibold text-gray-500 mb-1.5 block">Date From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            </div>
            <div>
              <label className="text-[12px] font-semibold text-gray-500 mb-1.5 block">Date To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            </div>
            <div className="flex items-end gap-2">
              <Button size="sm" variant="outline" onClick={handleExportCsv} className="text-[12px] gap-1.5 h-9 flex-1">
                <Download className="w-3.5 h-3.5" /> CSV
              </Button>
              <Button size="sm" variant="outline" onClick={handlePrintPdf} className="text-[12px] gap-1.5 h-9 flex-1">
                <Printer className="w-3.5 h-3.5" /> Print
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {report && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Students w/ Restraints", value: report.totalStudentsWithRestraints, color: "text-gray-800" },
            { label: "30-Day Windows", value: report.totalWindows, color: "text-gray-800" },
            { label: "Non-Compliant", value: report.nonCompliantWindows, color: report.nonCompliantWindows > 0 ? "text-red-600" : "text-emerald-600" },
          ].map((stat) => (
            <Card key={stat.label} className="border-gray-100">
              <CardContent className="pt-4 pb-3 text-center">
                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-gray-100">
        <CardContent className="pt-0 p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !report?.windows.length ? (
            <DemoEmptyState setupHint="Restraint and seclusion incidents are entered by school staff as they occur. The sample district has no live incident history; real tenants populate this from day-to-day operations.">
              <div className="py-16 text-center text-gray-400">
                <FileText className="w-8 h-8 mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-medium">No restraint incidents in this period</p>
              </div>
            </DemoEmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2.5 px-3 font-semibold text-gray-500 text-[11px]">Student</th>
                    <th className="text-left py-2.5 px-3 font-semibold text-gray-500 text-[11px]">School</th>
                    <th className="text-left py-2.5 px-3 font-semibold text-gray-500 text-[11px]">Window</th>
                    <th className="text-center py-2.5 px-3 font-semibold text-gray-500 text-[11px]">Incidents</th>
                    <th className="text-left py-2.5 px-3 font-semibold text-gray-500 text-[11px]">Types</th>
                    <th className="text-center py-2.5 px-3 font-semibold text-gray-500 text-[11px]">Parent Notified</th>
                    <th className="text-center py-2.5 px-3 font-semibold text-gray-500 text-[11px]">Log → DESE</th>
                    <th className="text-center py-2.5 px-3 font-semibold text-gray-500 text-[11px]">Status</th>
                    <th className="py-2.5 px-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {report.windows.map((w, idx) => {
                    const compliant = w.parentNotificationCompliant && (w.incidentCount <= 1 || w.thirtyDayLogSent);
                    const expanded = expandedRows.has(idx);
                    return (
                      <>
                        <tr key={idx} className={`hover:bg-gray-50/60 transition-colors ${!compliant ? "bg-red-50/30" : ""}`}>
                          <td className="py-2.5 px-3">
                            <Link href={`/students/${w.studentId}`} className="font-medium text-gray-700 hover:text-emerald-700 underline">{w.studentName}</Link>
                            {w.externalId && <span className="text-[10px] text-gray-400 block">{w.externalId}</span>}
                          </td>
                          <td className="py-2.5 px-3 text-gray-500">{w.schoolName ?? "—"}</td>
                          <td className="py-2.5 px-3 text-gray-500 text-[11px] font-mono whitespace-nowrap">{w.windowStart} – {w.windowEnd}</td>
                          <td className="py-2.5 px-3 text-center font-semibold text-gray-700">{w.incidentCount}</td>
                          <td className="py-2.5 px-3 text-gray-500 max-w-[160px] truncate" title={w.restraintTypesSummary}>{w.restraintTypesSummary}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={w.parentNotificationCompliant ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>
                              {w.parentNotifiedCount}/{w.incidentCount}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {w.thirtyDayLogSent
                              ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                              : w.incidentCount > 1
                                ? <XCircle className="w-4 h-4 text-red-400 mx-auto" />
                                : <span className="text-[10px] text-gray-400">N/A</span>}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {compliant
                              ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700">Compliant</span>
                              : <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700">Action Needed</span>}
                          </td>
                          <td className="py-2.5 px-3">
                            <button onClick={() => toggleRow(idx)} className="text-gray-400 hover:text-gray-600">
                              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr key={`${idx}-exp`}>
                            <td colSpan={9} className="px-3 py-2 bg-gray-50/60 text-[11px] text-gray-500">
                              <span className="font-medium">Incident dates:</span> {w.incidentDates.join(", ")}
                              &nbsp;|&nbsp; <span className="font-medium">Physical:</span> {w.physicalCount}
                              &nbsp;|&nbsp; <span className="font-medium">Mechanical:</span> {w.mechanicalCount}
                              &nbsp;|&nbsp; <span className="font-medium">Seclusion:</span> {w.seclCount}
                              &nbsp;|&nbsp; <span className="font-medium">Other:</span> {w.otherCount}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function IepTimelineTab({ schools }: { schools: SchoolOption[] }) {
  const [selectedSchool, setSelectedSchool] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<"all" | "PL1" | "PL2">("all");
  const [sortBy, setSortBy] = useState<"days" | "name">("days");
  const [generatingLetter, setGeneratingLetter] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ rows: IepTimelineRow[]; summary: IepTimelineSummary }>({
    queryKey: ["iep-timeline", selectedSchool, phaseFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ phase: phaseFilter });
      if (selectedSchool) params.set("schoolId", selectedSchool);
      const res = await authFetch(`/api/state-reporting/iep-timeline?${params}`);
      if (!res.ok) throw new Error("Failed to load IEP timelines");
      return res.json();
    },
  });

  const rows = data?.rows ?? [];
  const summary = data?.summary;

  const sorted = [...rows].sort((a, b) => {
    if (sortBy === "name") return a.studentName.localeCompare(b.studentName);
    const aDays = (a.phase === "PL1" || a.phase === "pre-consent" ? a.pl1.daysRemaining : a.pl2.daysRemaining) ?? 9999;
    const bDays = (b.phase === "PL1" || b.phase === "pre-consent" ? b.pl1.daysRemaining : b.pl2.daysRemaining) ?? 9999;
    return aDays - bDays;
  });

  async function handlePrintPdf() {
    const params = new URLSearchParams({ phase: phaseFilter, format: "pdf" });
    if (selectedSchool) params.set("schoolId", selectedSchool);
    const res = await authFetch(`/api/state-reporting/iep-timeline?${params}`);
    if (!res.ok) { alert("Could not generate PDF report."); return; }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="?(.+?)"?$/);
    const fileName = match?.[1] ?? "iep_timeline_compliance.pdf";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  async function handleGenerateLetter(studentId: number) {
    setGeneratingLetter(studentId);
    try {
      const res = await authFetch("/api/state-reporting/corrective-action-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });
      if (!res.ok) { alert("Could not generate letter — no active breach found."); return; }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?(.+?)"?$/);
      const fileName = match?.[1] ?? `corrective_action_${studentId}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } finally {
      setGeneratingLetter(null);
    }
  }

  const complianceBadge = summary
    ? summary.breached > 0
      ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-red-100 text-red-800 border border-red-200"><XCircle className="w-3.5 h-3.5" /> {summary.breached} IEP Timeline Breach{summary.breached !== 1 ? "es" : ""}</span>
      : summary.atRisk > 0
        ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-amber-100 text-amber-800 border border-amber-200"><AlertTriangle className="w-3.5 h-3.5" /> {summary.atRisk} At Risk</span>
        : <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200"><CheckCircle2 className="w-3.5 h-3.5" /> All Timelines Compliant</span>
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-800">IEP Timeline Compliance</h2>
          <p className="text-[12px] text-gray-500 mt-0.5">
            PL1: 45 school days from consent to evaluation &nbsp;|&nbsp; PL2: 30 calendar days from evaluation to IEP
          </p>
        </div>
        {complianceBadge}
      </div>

      <Card className="border-gray-100">
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-[12px] font-semibold text-gray-500 mb-1.5 block">School Scope</label>
              <select value={selectedSchool} onChange={(e) => setSelectedSchool(e.target.value)}
                className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-300">
                <option value="">All Schools</option>
                {schools.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-semibold text-gray-500 mb-1.5 block">Phase</label>
              <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value as "all" | "PL1" | "PL2")}
                className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-300">
                <option value="all">All Active Phases</option>
                <option value="PL1">PL1 — Evaluation</option>
                <option value="PL2">PL2 — IEP Development</option>
              </select>
            </div>
            <div>
              <label className="text-[12px] font-semibold text-gray-500 mb-1.5 block">Sort By</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "days" | "name")}
                className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-300">
                <option value="days">Days Remaining (urgent first)</option>
                <option value="name">Student Name</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button size="sm" variant="outline" onClick={handlePrintPdf} className="text-[12px] gap-1.5 h-9 w-full" title="Generate a printable PDF report for DESE Program Review">
                <Printer className="w-3.5 h-3.5" /> Print / PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Active Timelines", value: summary.total, color: "text-gray-800" },
            { label: "In PL1 (Eval)", value: summary.pl1Active, color: "text-blue-700" },
            { label: "In PL2 (IEP)", value: summary.pl2Active, color: "text-indigo-700" },
            { label: "Breached", value: summary.breached, color: summary.breached > 0 ? "text-red-600" : "text-emerald-600" },
          ].map((stat) => (
            <Card key={stat.label} className="border-gray-100">
              <CardContent className="pt-4 pb-3 text-center">
                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-gray-100">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !sorted.length ? (
            <div className="py-16 text-center text-gray-400">
              <Timer className="w-8 h-8 mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium">No active IEP timelines</p>
              <p className="text-xs mt-1">All evaluations and IEPs are complete, or no open referrals found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2.5 px-3 font-semibold text-gray-500 text-[11px]">Student</th>
                    <th className="text-left py-2.5 px-3 font-semibold text-gray-500 text-[11px]">School</th>
                    <th className="text-center py-2.5 px-3 font-semibold text-gray-500 text-[11px]">Phase</th>
                    <th className="text-left py-2.5 px-3 font-semibold text-gray-500 text-[11px]">PL1 — Evaluation (45d)</th>
                    <th className="text-left py-2.5 px-3 font-semibold text-gray-500 text-[11px]">PL2 — IEP Dev (30d)</th>
                    <th className="text-center py-2.5 px-3 font-semibold text-gray-500 text-[11px]">Status</th>
                    <th className="py-2.5 px-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sorted.map((row) => {
                    const overallBreached = row.hasActivePl1Breach || row.hasActivePl2Breach;
                    const activePhase = (row.phase === "PL1" || row.phase === "pre-consent") ? row.pl1 : row.pl2;
                    const overallStatus = overallBreached ? "red" : activePhase.status === "yellow" ? "yellow" : "green";

                    return (
                      <tr key={row.studentId} className={`hover:bg-gray-50/60 transition-colors ${overallBreached ? "bg-red-50/20" : ""}`}>
                        <td className="py-3 px-3">
                          <Link href={`/students/${row.studentId}`} className="font-medium text-gray-700 hover:text-emerald-700 underline">{row.studentName}</Link>
                          {row.externalId && <span className="text-[10px] text-gray-400 block">{row.externalId}</span>}
                        </td>
                        <td className="py-3 px-3 text-gray-500">{row.schoolName ?? "—"}</td>
                        <td className="py-3 px-3 text-center">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            row.phase === "PL1" || row.phase === "pre-consent"
                              ? "bg-blue-50 text-blue-700"
                              : row.phase === "PL2"
                                ? "bg-indigo-50 text-indigo-700"
                                : "bg-gray-100 text-gray-500"
                          }`}>
                            {row.phase === "pre-consent" ? "Awaiting Consent" : row.phase}
                          </span>
                        </td>
                        <td className="py-3 px-3 min-w-[160px]">
                          <PhaseBar phase={row.pl1} label="PL1" />
                        </td>
                        <td className="py-3 px-3 min-w-[160px]">
                          <PhaseBar phase={row.pl2} label="PL2" />
                        </td>
                        <td className="py-3 px-3 text-center">
                          <StatusBadge
                            status={overallStatus as "green" | "yellow" | "red"}
                            label={overallBreached ? "Breached" : overallStatus === "yellow" ? "At Risk" : "On Track"}
                          />
                        </td>
                        <td className="py-3 px-3">
                          {overallBreached && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-[11px] gap-1 h-7 border-red-200 text-red-700 hover:bg-red-50 whitespace-nowrap"
                              disabled={generatingLetter === row.studentId}
                              onClick={() => handleGenerateLetter(row.studentId)}
                            >
                              <FileText className="w-3 h-3" />
                              {generatingLetter === row.studentId ? "Generating…" : "Letter"}
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
        </CardContent>
      </Card>
    </div>
  );
}

type TabKey = "sims" | "restraint" | "timeline";

const VALID_TABS: TabKey[] = ["sims", "restraint", "timeline"];

function resolveTabFromSearch(search: string): TabKey {
  const key = new URLSearchParams(search).get("tab") ?? "";
  return (VALID_TABS as string[]).includes(key) ? (key as TabKey) : "sims";
}

export default function StateReporting() {
  const { typedFilter } = useSchoolContext();
  const { data: schoolsRaw } = useListSchools();
  const schools = (schoolsRaw ?? []) as SchoolOption[];
  const search = useSearch();
  const [, navigate] = useLocation();

  const [activeTab, setActiveTabState] = useState<TabKey>(() => resolveTabFromSearch(search));

  useEffect(() => {
    setActiveTabState(resolveTabFromSearch(search));
  }, [search]);

  const setActiveTab = useCallback((next: TabKey) => {
    setActiveTabState(next);
    navigate(`/state-reporting?tab=${next}`, { replace: true });
  }, [navigate]);
  const [selectedReport, setSelectedReport] = useState<string>("idea_child_count");
  const [selectedSchool, setSelectedSchool] = useState<string>(typedFilter.schoolId ? String(typedFilter.schoolId) : "");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportBlocked, setExportBlocked] = useState<{ errorCount: number; message: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { data: templates, isLoading: templatesLoading } = useQuery<ReportTemplateMeta[]>({
    queryKey: ["state-report-templates"],
    queryFn: async () => {
      const res = await authFetch("/api/state-reports/templates");
      if (!res.ok) throw new Error("Failed to load templates");
      return res.json();
    },
  });

  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery<{ rows: ExportHistoryRow[]; total: number }>({
    queryKey: ["export-history"],
    queryFn: async () => {
      const res = await authFetch("/api/state-reports/history?limit=20");
      if (!res.ok) throw new Error("Failed to load history");
      return res.json();
    },
    enabled: showHistory,
  });

  const { data: restraintReport } = useQuery<Restraint30DayReport>({
    queryKey: ["restraint-30day-badge"],
    queryFn: async () => {
      const res = await authFetch("/api/state-reporting/restraint-30-day");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: iepData } = useQuery<{ rows: IepTimelineRow[]; summary: IepTimelineSummary }>({
    queryKey: ["iep-timeline-badge"],
    queryFn: async () => {
      const res = await authFetch("/api/state-reporting/iep-timeline");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const selectedTemplate = templates?.find((t) => t.key === selectedReport);

  function buildRequestBody() {
    const body: Record<string, unknown> = { reportType: selectedReport };
    if (selectedSchool) body.schoolId = Number(selectedSchool);
    if (dateFrom) body.dateFrom = dateFrom;
    if (dateTo) body.dateTo = dateTo;
    return body;
  }

  const handleValidate = useCallback(async () => {
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await authFetch("/api/state-reports/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequestBody()),
      });
      if (res.ok) {
        setValidationResult(await res.json());
      }
    } finally {
      setValidating(false);
    }
  }, [selectedReport, selectedSchool, dateFrom, dateTo]);

  const handleExport = useCallback(async (force = false) => {
    setExporting(true);
    setExportBlocked(null);
    try {
      const body = buildRequestBody();
      if (force) (body as Record<string, unknown>).forceExport = true;
      const res = await authFetch("/api/state-reports/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 422) {
        const data = await res.json() as {
          errorCount: number;
          warningCount: number;
          message: string;
          errors: ValidationWarning[];
          warnings: ValidationWarning[];
          recordCount: number;
        };
        setExportBlocked({ errorCount: data.errorCount, message: data.message });
        setValidationResult({
          recordCount: data.recordCount,
          errorCount: data.errorCount,
          warningCount: data.warningCount,
          errors: data.errors,
          warnings: data.warnings,
        });
        return;
      }
      if (res.ok) {
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition") ?? "";
        const match = disposition.match(/filename="?(.+?)"?$/);
        const fileName = match?.[1] ?? `${selectedReport}_export.csv`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        refetchHistory();
      }
    } finally {
      setExporting(false);
    }
  }, [selectedReport, selectedSchool, dateFrom, dateTo, refetchHistory]);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; badge?: React.ReactNode }[] = [
    {
      key: "sims",
      label: "SIMS / IDEA Exports",
      icon: <FileSpreadsheet className="w-4 h-4" />,
    },
    {
      key: "restraint",
      label: "Restraint 30-Day",
      icon: <Shield className="w-4 h-4" />,
      badge: restraintReport
        ? restraintReport.districtCompliant
          ? <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">✓</span>
          : <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">{restraintReport.nonCompliantWindows}</span>
        : null,
    },
    {
      key: "timeline",
      label: "IEP Timelines",
      icon: <Timer className="w-4 h-4" />,
      badge: iepData?.summary
        ? iepData.summary.breached > 0
          ? <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">{iepData.summary.breached}</span>
          : iepData.summary.atRisk > 0
            ? <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">{iepData.summary.atRisk}</span>
            : <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">✓</span>
        : null,
    },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1100px] mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">State Reporting</h1>
          <p className="text-xs text-gray-400 mt-1">
            Generate IDEA Part B, MA SIMS, DESE restraint reports, and IEP timeline compliance
          </p>
        </div>
        <Button
          variant={showHistory ? "default" : "outline"}
          size="sm"
          onClick={() => setShowHistory(!showHistory)}
          className="text-[12px] gap-1.5"
        >
          <History className="w-3.5 h-3.5" />
          {showHistory ? "Back to Reports" : "Export History"}
        </Button>
      </div>

      {showHistory ? (
        <Card className="border-gray-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-[14px] font-semibold text-gray-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              Export History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
              </div>
            ) : !historyData?.rows?.length ? (
              <DemoEmptyState setupHint="State-report exports are generated by admins on demand and are not pre-populated in the sample dataset.">
                <div className="py-12 text-center text-gray-400">
                  <FileSpreadsheet className="w-8 h-8 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm font-medium">No exports yet</p>
                  <p className="text-xs mt-1">Generated reports will appear here</p>
                </div>
              </DemoEmptyState>
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 px-2 font-semibold text-gray-500">Report</th>
                      <th className="text-left py-2 px-2 font-semibold text-gray-500">File</th>
                      <th className="text-center py-2 px-2 font-semibold text-gray-500">Records</th>
                      <th className="text-center py-2 px-2 font-semibold text-gray-500">Warnings</th>
                      <th className="text-left py-2 px-2 font-semibold text-gray-500">User</th>
                      <th className="text-right py-2 px-2 font-semibold text-gray-500">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {historyData.rows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-2.5 px-2 text-gray-700 font-medium">{row.reportLabel}</td>
                        <td className="py-2.5 px-2 text-gray-500 font-mono text-[11px]">{row.fileName}</td>
                        <td className="py-2.5 px-2 text-center text-gray-600">{row.recordCount}</td>
                        <td className="py-2.5 px-2 text-center">
                          {row.warningCount > 0 ? (
                            <span className="text-amber-600 font-semibold">{row.warningCount}</span>
                          ) : (
                            <span className="text-emerald-500">0</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-gray-400 text-[11px] font-mono" title={row.exportedBy}>
                          {truncateUserId(row.exportedBy)}
                        </td>
                        <td className="py-2.5 px-2 text-right text-gray-400">
                          {new Date(row.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex gap-1 border-b border-gray-200">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === tab.key
                    ? "border-emerald-500 text-emerald-700"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.badge}
              </button>
            ))}
          </div>

          {activeTab === "sims" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {templatesLoading ? (
                  [...Array(2)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)
                ) : templates?.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => { setSelectedReport(t.key); setValidationResult(null); }}
                    className={`rounded-xl border p-4 text-left transition-all hover:shadow-sm ${
                      selectedReport === t.key
                        ? "border-emerald-300 bg-emerald-50/40 ring-2 ring-emerald-200 ring-offset-1"
                        : "border-gray-100 bg-white hover:border-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <FileSpreadsheet className={`w-4 h-4 ${selectedReport === t.key ? "text-emerald-600" : "text-gray-400"}`} />
                      <span className="text-[13px] font-semibold text-gray-800">{t.label}</span>
                    </div>
                    <p className="text-[12px] text-gray-500 leading-relaxed">{t.description}</p>
                    <p className="text-[11px] text-gray-400 mt-2">{t.columnCount} columns</p>
                  </button>
                ))}
              </div>

              <Card className="border-gray-100">
                <CardContent className="pt-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[12px] font-semibold text-gray-500 mb-1.5 block">School Scope</label>
                      <select
                        value={selectedSchool}
                        onChange={(e) => { setSelectedSchool(e.target.value); setValidationResult(null); }}
                        className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                      >
                        <option value="">All Schools (District-wide)</option>
                        {schools.map((s) => (
                          <option key={s.id} value={String(s.id)}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[12px] font-semibold text-gray-500 mb-1.5 block">Date From</label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => { setDateFrom(e.target.value); setValidationResult(null); }}
                        className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                      />
                    </div>
                    <div>
                      <label className="text-[12px] font-semibold text-gray-500 mb-1.5 block">Date To</label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => { setDateTo(e.target.value); setValidationResult(null); }}
                        className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleValidate}
                        disabled={validating}
                        className="text-[12px] gap-1.5 h-9 flex-1"
                      >
                        <Shield className={`w-3.5 h-3.5 ${validating ? "animate-pulse" : ""}`} />
                        {validating ? "Validating…" : "Validate"}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleExport(false)}
                        disabled={exporting}
                        className="text-[12px] gap-1.5 h-9 flex-1 bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Download className={`w-3.5 h-3.5 ${exporting ? "animate-bounce" : ""}`} />
                        {exporting ? "Generating…" : "Export CSV"}
                      </Button>
                    </div>
                  </div>

                  {selectedTemplate && (
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50/60 border border-blue-100 rounded-lg text-[12px] text-blue-700">
                      <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium">{selectedTemplate.label}</span>
                        <span className="text-blue-500 ml-1">— {selectedTemplate.description}</span>
                        <br />
                        <span className="text-blue-400 text-[11px]">
                          Date range filters IEPs active during that window. Leave blank to include all active IEPs.
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {exportBlocked && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[13px] font-semibold text-red-800">Export Blocked</p>
                      <p className="text-[12px] text-red-600 mt-0.5">{exportBlocked.message}</p>
                      <p className="text-[11px] text-red-400 mt-1">
                        Resolve the errors above, or force-export with incomplete data.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExport(true)}
                    disabled={exporting}
                    className="text-[12px] gap-1.5 border-red-200 text-red-700 hover:bg-red-100"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {exporting ? "Exporting…" : "Force Export (with errors)"}
                  </Button>
                </div>
              )}

              {validationResult && <ValidationPanel result={validationResult} />}
            </>
          )}

          {activeTab === "restraint" && <RestraintTab schools={schools} />}
          {activeTab === "timeline" && <IepTimelineTab schools={schools} />}
        </>
      )}
    </div>
  );
}
