import { useState, useEffect, useCallback, useMemo } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";
import { toast } from "sonner";
import {
  ProgressReport, StudentOption, EditFields,
  QUARTER_PRESETS, STATUS_CONFIG,
} from "./types";
import { ReportList } from "./ReportList";
import { ReportDetail } from "./ReportDetail";
import { ReportEditor } from "./ReportEditor";
import { GenerateDialog, BatchDialog } from "./GenerateDialogs";
import { printProgressReport } from "./exportPdf";

export default function ProgressReportsPage() {
  const { teacherId } = useRole();
  const [view, setView] = useState<"list" | "detail" | "edit">("list");
  const [reports, setReports] = useState<ProgressReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedReport, setSelectedReport] = useState<ProgressReport | null>(null);

  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genStudentId, setGenStudentId] = useState("");
  const [genPreset, setGenPreset] = useState("Q1");
  const [genPeriodStart, setGenPeriodStart] = useState("");
  const [genPeriodEnd, setGenPeriodEnd] = useState("");
  const [genPeriodLabel, setGenPeriodLabel] = useState("Q1");

  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [studentSearch, setStudentSearch] = useState("");

  const [editFields, setEditFields] = useState<EditFields>({
    overallSummary: "", recommendations: "", parentNotes: "", goalProgress: [], status: "draft",
  });
  const [saving, setSaving] = useState(false);

  const [batchStudentIds, setBatchStudentIds] = useState<number[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ total: number; succeeded: number; failed: number } | null>(null);

  const currentYear = new Date().getFullYear();
  const schoolYear = new Date().getMonth() >= 7 ? currentYear : currentYear - 1;

  useEffect(() => {
    const preset = QUARTER_PRESETS.find(p => p.reportingPeriod === genPreset);
    if (preset) {
      const startYear = preset.reportingPeriod === "Q2" && preset.periodStart.startsWith("-12") ? schoolYear : schoolYear + (preset.periodStart.startsWith("-0") ? 1 : 0);
      const endYear = preset.reportingPeriod === "Q2" ? schoolYear + 1 : startYear;
      setGenPeriodStart(`${preset.reportingPeriod === "Q1" ? schoolYear : startYear}${preset.periodStart}`);
      setGenPeriodEnd(`${endYear}${preset.periodEnd}`);
      setGenPeriodLabel(preset.reportingPeriod);
    }
  }, [genPreset, schoolYear]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/progress-reports/all");
      if (!res.ok) throw new Error("Failed to load reports");
      const data: unknown = await res.json();
      setReports(Array.isArray(data) ? data as ProgressReport[] : []);
    } catch {
      toast.error("Failed to load reports");
    }
    setLoading(false);
  }, []);

  const loadStudents = useCallback(async () => {
    try {
      const res = await authFetch("/api/students");
      if (res.ok) {
        const data: unknown = await res.json();
        setStudents(Array.isArray(data) ? (data as StudentOption[]).filter(s => (s as Record<string, unknown>).status !== "archived") : []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadReports(); loadStudents(); }, [loadReports, loadStudents]);

  const filteredReports = useMemo(() => {
    let result = reports;
    if (filterStatus !== "all") result = result.filter(r => r.status === filterStatus);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        (r.studentName || "").toLowerCase().includes(q) ||
        (r.reportingPeriod || "").toLowerCase().includes(q) ||
        (r.schoolName || "").toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [reports, filterStatus, searchQuery]);

  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students;
    const q = studentSearch.toLowerCase();
    return students.filter(s => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q));
  }, [students, studentSearch]);

  async function openDetail(reportId: number) {
    try {
      const res = await authFetch(`/api/progress-reports/${reportId}`);
      if (!res.ok) throw new Error();
      const data: unknown = await res.json();
      setSelectedReport(data as ProgressReport);
      setView("detail");
    } catch {
      toast.error("Failed to load report");
    }
  }

  async function handleGenerate() {
    if (!genStudentId) { toast.error("Select a student"); return; }
    if (!genPeriodStart || !genPeriodEnd) { toast.error("Period dates required"); return; }
    setGenerating(true);
    try {
      const res = await authFetch(`/api/students/${genStudentId}/progress-reports/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodStart: genPeriodStart,
          periodEnd: genPeriodEnd,
          reportingPeriod: genPeriodLabel,
          preparedBy: teacherId || null,
        }),
      });
      if (!res.ok) {
        const err: unknown = await res.json();
        throw new Error((err as Record<string, string>).error || "Generation failed");
      }
      const report: unknown = await res.json();
      toast.success("Progress report generated");
      setGenerateDialogOpen(false);
      await loadReports();
      openDetail((report as ProgressReport).id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to generate report");
    }
    setGenerating(false);
  }

  async function handleBatchGenerate() {
    if (batchStudentIds.length === 0) { toast.error("Select at least one student"); return; }
    if (!genPeriodStart || !genPeriodEnd) { toast.error("Period dates required"); return; }
    setGenerating(true);
    setBatchProgress(null);
    try {
      const res = await authFetch("/api/progress-reports/batch-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentIds: batchStudentIds,
          periodStart: genPeriodStart,
          periodEnd: genPeriodEnd,
          reportingPeriod: genPeriodLabel,
          preparedBy: teacherId || null,
        }),
      });
      if (!res.ok) throw new Error("Batch generation failed");
      const data: unknown = await res.json();
      const summary = (data as Record<string, unknown>).summary as { total: number; succeeded: number; failed: number };
      setBatchProgress(summary);
      const msg = `Generated ${summary.succeeded} of ${summary.total} reports`;
      if (summary.succeeded === 0) {
        toast.warning(msg, { description: `${summary.failed} failed. Open the report list to see per-student errors.` });
      } else if (summary.failed > 0) {
        toast.warning(msg, { description: `${summary.failed} failed. Open the report list to see per-student errors.` });
      } else {
        toast.success(msg);
      }
      await loadReports();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Batch generation failed");
    }
    setGenerating(false);
  }

  function openEdit() {
    if (!selectedReport) return;
    setEditFields({
      overallSummary: selectedReport.overallSummary || "",
      recommendations: selectedReport.recommendations || "",
      parentNotes: selectedReport.parentNotes || "",
      goalProgress: selectedReport.goalProgress || [],
      status: selectedReport.status,
    });
    setView("edit");
  }

  async function handleSave() {
    if (!selectedReport) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/progress-reports/${selectedReport.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFields),
      });
      if (!res.ok) throw new Error();
      const updated: unknown = await res.json();
      setSelectedReport({ ...selectedReport, ...(updated as ProgressReport) });
      toast.success("Report saved");
      setView("detail");
      loadReports();
    } catch {
      toast.error("Failed to save report");
    }
    setSaving(false);
  }

  async function handleStatusChange(newStatus: string) {
    if (!selectedReport) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { status: newStatus };
      if (newStatus === "sent") {
        body.parentNotificationDate = new Date().toISOString().split("T")[0];
      }
      const res = await authFetch(`/api/progress-reports/${selectedReport.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData: unknown = await res.json().catch(() => null);
        throw new Error((errData as Record<string, string> | null)?.error || "Update failed");
      }
      const updated: unknown = await res.json();
      setSelectedReport({ ...selectedReport, ...(updated as ProgressReport), status: newStatus });
      toast.success(`Status updated to ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
      loadReports();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    }
    setSaving(false);
  }

  if (view === "detail" && selectedReport) {
    return <ReportDetail
      report={selectedReport}
      onBack={() => { setView("list"); setSelectedReport(null); }}
      onEdit={openEdit}
      onStatusChange={handleStatusChange}
      onPrint={() => printProgressReport(selectedReport)}
      saving={saving}
    />;
  }

  if (view === "edit" && selectedReport) {
    return <ReportEditor
      report={selectedReport}
      fields={editFields}
      setFields={setEditFields}
      onSave={handleSave}
      onCancel={() => setView("detail")}
      saving={saving}
    />;
  }

  const periodProps = { genPreset, setGenPreset, genPeriodStart, setGenPeriodStart, genPeriodEnd, setGenPeriodEnd };
  const searchProps = { studentSearch, setStudentSearch, filteredStudents };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 md:space-y-6">
      <ReportList
        reports={filteredReports} loading={loading}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        filterStatus={filterStatus} setFilterStatus={setFilterStatus}
        onOpenDetail={openDetail}
        onOpenGenerate={() => { setGenerateDialogOpen(true); setGenStudentId(""); }}
        onOpenBatch={() => { setBatchDialogOpen(true); setBatchStudentIds([]); setBatchProgress(null); }}
      />
      <GenerateDialog
        open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}
        {...searchProps} {...periodProps}
        genStudentId={genStudentId} setGenStudentId={setGenStudentId}
        generating={generating} onGenerate={handleGenerate}
      />
      <BatchDialog
        open={batchDialogOpen} onOpenChange={setBatchDialogOpen}
        students={students} {...searchProps} {...periodProps}
        batchStudentIds={batchStudentIds} setBatchStudentIds={setBatchStudentIds}
        batchProgress={batchProgress} generating={generating}
        onBatchGenerate={handleBatchGenerate}
      />
    </div>
  );
}
