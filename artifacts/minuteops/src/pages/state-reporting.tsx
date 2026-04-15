import { useState, useCallback } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useSchoolContext } from "@/lib/school-context";
import { useQuery } from "@tanstack/react-query";
import { useListSchools } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  Download, AlertTriangle, CheckCircle2, XCircle,
  FileSpreadsheet, Clock, History,
  Shield, Info,
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

export default function StateReporting() {
  const { typedFilter } = useSchoolContext();
  const { data: schoolsRaw } = useListSchools();
  const schools = (schoolsRaw ?? []) as SchoolOption[];
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
        const data = await res.json() as { errorCount: number; message: string };
        setExportBlocked(data);
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

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1100px] mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">State Reporting</h1>
          <p className="text-xs text-gray-400 mt-1">
            Generate IDEA Part B, MA SIMS, and other mandated data exports
          </p>
        </div>
        <Button
          variant={showHistory ? "default" : "outline"}
          size="sm"
          onClick={() => setShowHistory(!showHistory)}
          className="text-[12px] gap-1.5"
        >
          <History className="w-3.5 h-3.5" />
          {showHistory ? "Report Builder" : "Export History"}
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
              <div className="py-12 text-center text-gray-400">
                <FileSpreadsheet className="w-8 h-8 mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-medium">No exports yet</p>
                <p className="text-xs mt-1">Generated reports will appear here</p>
              </div>
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
    </div>
  );
}
