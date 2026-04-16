import { useState, useEffect, useCallback, useMemo } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  FileText, Plus, Download, CheckCircle, Clock, Edit3, Trash2,
  TrendingUp, TrendingDown, Minus, ArrowLeft, Users, Search,
  Loader2, Eye, Send, ChevronDown, ChevronUp, AlertTriangle,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface GoalProgressEntry {
  iepGoalId: number;
  goalArea: string;
  goalNumber: number;
  annualGoal: string;
  baseline: string | null;
  targetCriterion: string | null;
  currentPerformance: string;
  progressRating: string;
  progressCode: string;
  dataPoints: number;
  trendDirection: string;
  promptLevel?: string | null;
  percentCorrect?: number | null;
  behaviorValue?: number | null;
  behaviorGoal?: number | null;
  narrative: string;
  benchmarks?: string | null;
  measurementMethod?: string | null;
  serviceArea?: string | null;
}

interface ServiceBreakdown {
  serviceType: string;
  requiredMinutes: number;
  deliveredMinutes: number;
  missedSessions: number;
  completedSessions: number;
  compliancePercent: number;
}

interface ProgressReport {
  id: number;
  studentId: number;
  reportingPeriod: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  preparedBy: number | null;
  preparedByName: string | null;
  overallSummary: string | null;
  serviceDeliverySummary: string | null;
  recommendations: string | null;
  parentNotes: string | null;
  goalProgress: GoalProgressEntry[];
  studentDob: string | null;
  studentGrade: string | null;
  schoolName: string | null;
  districtName: string | null;
  iepStartDate: string | null;
  iepEndDate: string | null;
  serviceBreakdown: ServiceBreakdown[];
  parentNotificationDate: string | null;
  nextReportDate: string | null;
  createdAt: string;
  updatedAt: string;
  studentName?: string;
  studentFirstName?: string;
  studentLastName?: string;
}

interface StudentOption {
  id: number;
  firstName: string;
  lastName: string;
  grade: string | null;
}

const RATING_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  mastered: { label: "Mastered", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  sufficient_progress: { label: "Sufficient Progress", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  some_progress: { label: "Some Progress", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  insufficient_progress: { label: "Insufficient Progress", color: "text-red-700", bg: "bg-red-50 border-red-200" },
  not_addressed: { label: "Not Addressed", color: "text-gray-500", bg: "bg-gray-50 border-gray-200" },
};

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string; bg: string }> = {
  draft: { label: "Draft", icon: Edit3, color: "text-amber-700", bg: "bg-amber-50" },
  review: { label: "In Review", icon: Eye, color: "text-blue-700", bg: "bg-blue-50" },
  final: { label: "Final", icon: CheckCircle, color: "text-emerald-700", bg: "bg-emerald-50" },
  sent: { label: "Sent to Parent", icon: Send, color: "text-purple-700", bg: "bg-purple-50" },
};

function TrendIcon({ direction }: { direction: string }) {
  if (direction === "improving") return <TrendingUp className="w-4 h-4 text-emerald-600" />;
  if (direction === "declining") return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return d; }
}

const QUARTER_PRESETS = [
  { label: "Q1 (Sep–Nov)", periodStart: "-09-01", periodEnd: "-11-30", reportingPeriod: "Q1" },
  { label: "Q2 (Dec–Feb)", periodStart: "-12-01", periodEnd: "-02-28", reportingPeriod: "Q2" },
  { label: "Q3 (Mar–May)", periodStart: "-03-01", periodEnd: "-05-31", reportingPeriod: "Q3" },
  { label: "Q4 (Jun–Aug)", periodStart: "-06-01", periodEnd: "-08-31", reportingPeriod: "Q4" },
];

export default function ProgressReportsPage() {
  const { teacherId, role } = useRole();
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

  const [editFields, setEditFields] = useState<{
    overallSummary: string;
    recommendations: string;
    parentNotes: string;
    goalProgress: GoalProgressEntry[];
    status: string;
  }>({ overallSummary: "", recommendations: "", parentNotes: "", goalProgress: [], status: "draft" });
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
      toast.success(`Generated ${summary.succeeded} of ${summary.total} reports`);
      await loadReports();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Batch generation failed");
    }
    setGenerating(false);
  }

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

  function exportPdf() {
    if (!selectedReport) return;
    const r = selectedReport;
    const goals = r.goalProgress || [];
    const services = r.serviceBreakdown || [];

    const printContent = `
<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Progress Report - ${escapeHtml(r.studentName || "Student")}</title>
<style>
  @page { margin: 0.75in; size: letter; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.5; margin: 0; padding: 0; }
  .header { text-align: center; border-bottom: 3px solid #059669; padding-bottom: 12px; margin-bottom: 20px; }
  .header h1 { font-size: 16pt; color: #065f46; margin: 0 0 4px; }
  .header h2 { font-size: 12pt; color: #6b7280; margin: 0; font-weight: normal; }
  .header .legal { font-size: 9pt; color: #9ca3af; margin-top: 4px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 10pt; }
  .info-grid .label { color: #6b7280; font-weight: 600; }
  .section { margin-bottom: 20px; page-break-inside: avoid; }
  .section-title { font-size: 13pt; font-weight: 700; color: #065f46; border-bottom: 1px solid #d1fae5; padding-bottom: 4px; margin-bottom: 10px; }
  .goal-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 10px; page-break-inside: avoid; }
  .goal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .goal-area { font-weight: 700; font-size: 11pt; }
  .badge { padding: 2px 8px; border-radius: 12px; font-size: 9pt; font-weight: 600; }
  .badge-mastered { background: #d1fae5; color: #065f46; }
  .badge-sufficient { background: #dbeafe; color: #1e40af; }
  .badge-some { background: #fef3c7; color: #92400e; }
  .badge-insufficient { background: #fee2e2; color: #991b1b; }
  .badge-na { background: #f3f4f6; color: #6b7280; }
  .goal-detail { font-size: 10pt; color: #374151; margin: 4px 0; }
  .goal-narrative { font-size: 10pt; color: #1f2937; margin-top: 8px; padding: 8px; background: #f9fafb; border-radius: 4px; }
  .trend { display: inline-flex; align-items: center; gap: 4px; font-size: 10pt; }
  .trend-improving { color: #059669; }
  .trend-declining { color: #dc2626; }
  .trend-stable { color: #6b7280; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th { background: #f3f4f6; text-align: left; padding: 8px; font-weight: 600; border-bottom: 2px solid #e5e7eb; }
  td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
  .compliance-bar { height: 8px; border-radius: 4px; background: #e5e7eb; }
  .compliance-fill { height: 100%; border-radius: 4px; }
  .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 9pt; color: #9ca3af; text-align: center; }
  .recommendations { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; font-size: 10pt; }
  .parent-notes { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px; font-size: 10pt; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style>
</head><body>
<div class="header">
  <h1>${escapeHtml(r.districtName || "District")} Public Schools</h1>
  <h2>IEP Progress Report — ${escapeHtml(r.reportingPeriod)}</h2>
  <div class="legal">Pursuant to 603 CMR 28.07(8)</div>
</div>
<div class="info-grid">
  <div><span class="label">Student:</span> ${escapeHtml(r.studentName || `${r.studentFirstName || ""} ${r.studentLastName || ""}`)}</div>
  <div><span class="label">DOB:</span> ${escapeHtml(r.studentDob || "N/A")}</div>
  <div><span class="label">Grade:</span> ${escapeHtml(r.studentGrade || "N/A")}</div>
  <div><span class="label">School:</span> ${escapeHtml(r.schoolName || "N/A")}</div>
  <div><span class="label">IEP Period:</span> ${escapeHtml(r.iepStartDate || "N/A")} to ${escapeHtml(r.iepEndDate || "N/A")}</div>
  <div><span class="label">Report Period:</span> ${escapeHtml(r.periodStart)} to ${escapeHtml(r.periodEnd)}</div>
  <div><span class="label">Prepared By:</span> ${escapeHtml(r.preparedByName || "N/A")}</div>
  <div><span class="label">Status:</span> ${escapeHtml(r.status.charAt(0).toUpperCase() + r.status.slice(1))}</div>
</div>

<div class="section">
  <div class="section-title">Goal Progress</div>
  ${goals.map(g => {
    const ratingClass = g.progressRating === "mastered" ? "badge-mastered" :
      g.progressRating === "sufficient_progress" ? "badge-sufficient" :
      g.progressRating === "some_progress" ? "badge-some" :
      g.progressRating === "insufficient_progress" ? "badge-insufficient" : "badge-na";
    const trendClass = g.trendDirection === "improving" ? "trend-improving" :
      g.trendDirection === "declining" ? "trend-declining" : "trend-stable";
    const trendSymbol = g.trendDirection === "improving" ? "↑" : g.trendDirection === "declining" ? "↓" : "→";
    return `<div class="goal-card">
      <div class="goal-header">
        <span class="goal-area">${escapeHtml(g.goalArea)} — Goal #${escapeHtml(String(g.goalNumber))}</span>
        <span class="badge ${ratingClass}">${escapeHtml(g.progressCode)}</span>
      </div>
      <div class="goal-detail"><strong>Annual Goal:</strong> ${escapeHtml(g.annualGoal)}</div>
      ${g.baseline ? `<div class="goal-detail"><strong>Baseline:</strong> ${escapeHtml(g.baseline)}</div>` : ""}
      ${g.targetCriterion ? `<div class="goal-detail"><strong>Target:</strong> ${escapeHtml(g.targetCriterion)}</div>` : ""}
      <div class="goal-detail"><strong>Current Performance:</strong> ${escapeHtml(g.currentPerformance)}</div>
      <div class="goal-detail">
        <strong>Data Points:</strong> ${escapeHtml(String(g.dataPoints))} &nbsp;&nbsp;
        <span class="trend ${trendClass}"><strong>Trend:</strong> ${trendSymbol} ${escapeHtml(g.trendDirection)}</span>
      </div>
      <div class="goal-narrative">${escapeHtml(g.narrative)}</div>
    </div>`;
  }).join("")}
</div>

${services.length > 0 ? `<div class="section">
  <div class="section-title">Service Delivery</div>
  <table>
    <thead><tr><th>Service</th><th>Required</th><th>Delivered</th><th>Compliance</th><th>Sessions</th><th>Missed</th></tr></thead>
    <tbody>${services.map(s => `<tr>
      <td>${escapeHtml(s.serviceType)}</td>
      <td>${escapeHtml(String(Number(s.requiredMinutes) || 0))} min</td>
      <td>${escapeHtml(String(Number(s.deliveredMinutes) || 0))} min</td>
      <td><div class="compliance-bar"><div class="compliance-fill" style="width:${Math.min(Number(s.compliancePercent) || 0, 100)}%;background:${(Number(s.compliancePercent) || 0) >= 90 ? '#059669' : (Number(s.compliancePercent) || 0) >= 70 ? '#f59e0b' : '#dc2626'}"></div></div> ${escapeHtml(String(Number(s.compliancePercent) || 0))}%</td>
      <td>${escapeHtml(String(Number(s.completedSessions) || 0))}</td>
      <td>${escapeHtml(String(Number(s.missedSessions) || 0))}</td>
    </tr>`).join("")}</tbody>
  </table>
</div>` : ""}

${r.recommendations ? `<div class="section">
  <div class="section-title">Recommendations</div>
  <div class="recommendations">${escapeHtml(r.recommendations)}</div>
</div>` : ""}

${r.parentNotes ? `<div class="section">
  <div class="section-title">Notes to Parent/Guardian</div>
  <div class="parent-notes">${escapeHtml(r.parentNotes)}</div>
</div>` : ""}

<div class="footer">
  Generated ${new Date().toLocaleDateString()} | Trellis SPED Platform | Confidential Student Record
  ${r.nextReportDate ? `<br>Next Progress Report Due: ${r.nextReportDate}` : ""}
</div>
</body></html>`;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      setTimeout(() => { printWindow.print(); }, 500);
    }
  }

  if (view === "detail" && selectedReport) {
    return <ReportDetail report={selectedReport} onBack={() => { setView("list"); setSelectedReport(null); }}
      onEdit={openEdit} onStatusChange={handleStatusChange} onExportPdf={exportPdf} saving={saving} />;
  }

  if (view === "edit" && selectedReport) {
    return <ReportEditor report={selectedReport} fields={editFields} setFields={setEditFields}
      onSave={handleSave} onCancel={() => setView("detail")} saving={saving} />;
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 md:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Progress Reports</h1>
          <p className="text-xs md:text-sm text-gray-400 mt-1">Generate, review, and finalize IEP progress reports per 603 CMR 28.07(8)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setBatchDialogOpen(true); setBatchStudentIds([]); setBatchProgress(null); }}>
            <Users className="w-4 h-4 mr-1.5" /> Batch Generate
          </Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setGenerateDialogOpen(true); setGenStudentId(""); }}>
            <Plus className="w-4 h-4 mr-1.5" /> New Report
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search by student, period, or school..." className="pl-9 h-9" value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="review">In Review</SelectItem>
            <SelectItem value="final">Final</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
      ) : filteredReports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No progress reports found</p>
            <p className="text-sm text-gray-400 mt-1">Generate your first report using the button above</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredReports.map(report => {
            const statusConf = STATUS_CONFIG[report.status] || STATUS_CONFIG.draft;
            const StatusIcon = statusConf.icon;
            const goalCount = report.goalProgress?.length || 0;
            const masteredCount = report.goalProgress?.filter(g => g.progressRating === "mastered").length || 0;
            return (
              <Card key={report.id} className="hover:shadow-md transition-shadow cursor-pointer border-l-4"
                style={{ borderLeftColor: report.status === "final" || report.status === "sent" ? "#059669" : report.status === "review" ? "#3b82f6" : "#f59e0b" }}
                onClick={() => openDetail(report.id)}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-800 truncate">{report.studentName || `Student #${report.studentId}`}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConf.bg} ${statusConf.color}`}>
                          <StatusIcon className="w-3 h-3" /> {statusConf.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{report.reportingPeriod}</span>
                        <span>{formatDate(report.periodStart)} — {formatDate(report.periodEnd)}</span>
                        <span>{report.schoolName}</span>
                        {goalCount > 0 && <span>{masteredCount}/{goalCount} goals mastered</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-gray-400">
                      <span className="text-xs">{formatDate(report.createdAt)}</span>
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Generate Progress Report</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Student</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input placeholder="Search students..." className="pl-9" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />
              </div>
              <div className="mt-2 max-h-40 overflow-y-auto border rounded-lg">
                {filteredStudents.slice(0, 20).map(s => (
                  <button key={s.id} type="button"
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 transition-colors ${String(s.id) === genStudentId ? "bg-emerald-50 font-medium text-emerald-700" : ""}`}
                    onClick={() => setGenStudentId(String(s.id))}>
                    {s.firstName} {s.lastName} {s.grade ? `(${s.grade})` : ""}
                  </button>
                ))}
                {filteredStudents.length === 0 && <p className="text-sm text-gray-400 p-3">No students found</p>}
              </div>
            </div>
            <div>
              <Label>Reporting Period</Label>
              <Select value={genPreset} onValueChange={setGenPreset}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUARTER_PRESETS.map(p => <SelectItem key={p.reportingPeriod} value={p.reportingPeriod}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date</Label><Input type="date" value={genPeriodStart} onChange={e => setGenPeriodStart(e.target.value)} className="mt-1" /></div>
              <div><Label>End Date</Label><Input type="date" value={genPeriodEnd} onChange={e => setGenPeriodEnd(e.target.value)} className="mt-1" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateDialogOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleGenerate} disabled={generating}>
              {generating ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Generating...</> : <><FileText className="w-4 h-4 mr-1.5" /> Generate</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Batch Generate Progress Reports</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Reporting Period</Label>
              <Select value={genPreset} onValueChange={setGenPreset}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUARTER_PRESETS.map(p => <SelectItem key={p.reportingPeriod} value={p.reportingPeriod}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date</Label><Input type="date" value={genPeriodStart} onChange={e => setGenPeriodStart(e.target.value)} className="mt-1" /></div>
              <div><Label>End Date</Label><Input type="date" value={genPeriodEnd} onChange={e => setGenPeriodEnd(e.target.value)} className="mt-1" /></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Select Students ({batchStudentIds.length} selected)</Label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setBatchStudentIds(students.map(s => s.id))}>Select All</Button>
                  <Button variant="ghost" size="sm" onClick={() => setBatchStudentIds([])}>Clear</Button>
                </div>
              </div>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input placeholder="Search students..." className="pl-9" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-lg">
                {filteredStudents.map(s => (
                  <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={batchStudentIds.includes(s.id)}
                      onChange={e => {
                        if (e.target.checked) setBatchStudentIds(prev => [...prev, s.id]);
                        else setBatchStudentIds(prev => prev.filter(id => id !== s.id));
                      }}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                    {s.firstName} {s.lastName} {s.grade ? `(${s.grade})` : ""}
                  </label>
                ))}
              </div>
            </div>
            {batchProgress && (
              <div className={`p-3 rounded-lg text-sm ${batchProgress.failed > 0 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
                <strong>Results:</strong> {batchProgress.succeeded} generated, {batchProgress.failed} failed out of {batchProgress.total} total
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>Close</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleBatchGenerate}
              disabled={generating || batchStudentIds.length === 0}>
              {generating ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Generating {batchStudentIds.length}...</>
                : <><Users className="w-4 h-4 mr-1.5" /> Generate {batchStudentIds.length} Reports</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportDetail({ report, onBack, onEdit, onStatusChange, onExportPdf, saving }: {
  report: ProgressReport; onBack: () => void; onEdit: () => void;
  onStatusChange: (s: string) => void; onExportPdf: () => void; saving: boolean;
}) {
  const goals = report.goalProgress || [];
  const services = report.serviceBreakdown || [];
  const [expandedGoals, setExpandedGoals] = useState<Set<number>>(new Set(goals.map((_, i) => i)));

  const toggleGoal = (idx: number) => {
    setExpandedGoals(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const statusConf = STATUS_CONFIG[report.status] || STATUS_CONFIG.draft;
  const StatusIcon = statusConf.icon;

  const nextStatuses: { value: string; label: string }[] = [];
  if (report.status === "draft") nextStatuses.push({ value: "review", label: "Submit for Review" });
  if (report.status === "draft" || report.status === "review") nextStatuses.push({ value: "final", label: "Finalize" });
  if (report.status === "final") nextStatuses.push({ value: "sent", label: "Mark as Sent to Parent" });
  if (report.status !== "draft") nextStatuses.push({ value: "draft", label: "Revert to Draft" });

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1000px] mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={onEdit}><Edit3 className="w-4 h-4 mr-1.5" /> Edit</Button>
        <Button variant="outline" size="sm" onClick={onExportPdf}><Download className="w-4 h-4 mr-1.5" /> Export PDF</Button>
        {nextStatuses.map(ns => (
          <Button key={ns.value} size="sm" disabled={saving}
            className={ns.value === "final" ? "bg-emerald-600 hover:bg-emerald-700" : ns.value === "sent" ? "bg-purple-600 hover:bg-purple-700" : ""}
            variant={ns.value === "draft" ? "outline" : "default"}
            onClick={() => onStatusChange(ns.value)}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} {ns.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">{report.studentName || `${report.studentFirstName || ""} ${report.studentLastName || ""}`}</CardTitle>
              <p className="text-sm text-gray-500 mt-1">{report.reportingPeriod} — {formatDate(report.periodStart)} to {formatDate(report.periodEnd)}</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${statusConf.bg} ${statusConf.color}`}>
              <StatusIcon className="w-4 h-4" /> {statusConf.label}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-gray-500">DOB:</span> {report.studentDob || "N/A"}</div>
            <div><span className="text-gray-500">Grade:</span> {report.studentGrade || "N/A"}</div>
            <div><span className="text-gray-500">School:</span> {report.schoolName || "N/A"}</div>
            <div><span className="text-gray-500">District:</span> {report.districtName || "N/A"}</div>
            <div><span className="text-gray-500">IEP Period:</span> {report.iepStartDate || "N/A"} — {report.iepEndDate || "N/A"}</div>
            <div><span className="text-gray-500">Prepared By:</span> {report.preparedByName || "N/A"}</div>
            <div><span className="text-gray-500">Next Report:</span> {formatDate(report.nextReportDate)}</div>
            {report.parentNotificationDate && <div><span className="text-gray-500">Sent:</span> {formatDate(report.parentNotificationDate)}</div>}
          </div>
        </CardContent>
      </Card>

      {goals.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Goal Progress ({goals.length} goals)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {goals.map((g, idx) => {
              const rc = RATING_CONFIG[g.progressRating] || RATING_CONFIG.not_addressed;
              const expanded = expandedGoals.has(idx);
              return (
                <div key={idx} className={`border rounded-lg overflow-hidden ${rc.bg}`}>
                  <button type="button" className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => toggleGoal(idx)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{g.goalArea} — Goal #{g.goalNumber}</span>
                        <span className={`text-xs font-medium ${rc.color}`}>{g.progressCode}</span>
                        <TrendIcon direction={g.trendDirection} />
                      </div>
                      {!expanded && <p className="text-xs text-gray-500 mt-0.5 truncate">{g.currentPerformance}</p>}
                    </div>
                    {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </button>
                  {expanded && (
                    <div className="px-4 pb-3 space-y-2 text-sm border-t border-white/50">
                      <div><span className="text-gray-600 font-medium">Annual Goal:</span> {g.annualGoal}</div>
                      {g.baseline && <div><span className="text-gray-600 font-medium">Baseline:</span> {g.baseline}</div>}
                      {g.targetCriterion && <div><span className="text-gray-600 font-medium">Target:</span> {g.targetCriterion}</div>}
                      <div><span className="text-gray-600 font-medium">Current Performance:</span> {g.currentPerformance}</div>
                      <div className="flex items-center gap-4">
                        <span><span className="text-gray-600 font-medium">Data Points:</span> {g.dataPoints}</span>
                        <span className="flex items-center gap-1"><span className="text-gray-600 font-medium">Trend:</span> <TrendIcon direction={g.trendDirection} /> {g.trendDirection}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${rc.color}`}>{rc.label}</span>
                      </div>
                      <div className="bg-white/70 rounded p-2.5 text-gray-700 italic">{g.narrative}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {services.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Service Delivery</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-semibold text-gray-600">Service</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-600">Required</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-600">Delivered</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-600">Compliance</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-600">Sessions</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-600">Missed</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 px-3 font-medium">{s.serviceType}</td>
                      <td className="py-2 px-3 text-right">{s.requiredMinutes} min</td>
                      <td className="py-2 px-3 text-right">{s.deliveredMinutes} min</td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{
                              width: `${s.compliancePercent}%`,
                              backgroundColor: s.compliancePercent >= 90 ? "#059669" : s.compliancePercent >= 70 ? "#f59e0b" : "#dc2626"
                            }} />
                          </div>
                          <span className={s.compliancePercent >= 90 ? "text-emerald-600" : s.compliancePercent >= 70 ? "text-amber-600" : "text-red-600"}>
                            {s.compliancePercent}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right">{s.completedSessions}</td>
                      <td className="py-2 px-3 text-right text-red-500">{s.missedSessions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {report.recommendations && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Recommendations</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-gray-700 whitespace-pre-line">{report.recommendations}</p></CardContent>
        </Card>
      )}

      {report.parentNotes && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Notes to Parent/Guardian</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-gray-700 whitespace-pre-line">{report.parentNotes}</p></CardContent>
        </Card>
      )}
    </div>
  );
}

function ReportEditor({ report, fields, setFields, onSave, onCancel, saving }: {
  report: ProgressReport;
  fields: { overallSummary: string; recommendations: string; parentNotes: string; goalProgress: GoalProgressEntry[]; status: string };
  setFields: (f: typeof fields) => void;
  onSave: () => void; onCancel: () => void; saving: boolean;
}) {
  const updateGoalNarrative = (idx: number, narrative: string) => {
    const updated = [...fields.goalProgress];
    updated[idx] = { ...updated[idx], narrative };
    setFields({ ...fields, goalProgress: updated });
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1000px] mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="w-4 h-4 mr-1" /> Cancel</Button>
        <h1 className="text-lg font-bold text-gray-800 flex-1">Edit Progress Report</h1>
        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1.5" />} Save Changes
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Overall Summary</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={6} value={fields.overallSummary} onChange={e => setFields({ ...fields, overallSummary: e.target.value })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Goal Narratives</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {fields.goalProgress.map((g, idx) => {
            const rc = RATING_CONFIG[g.progressRating] || RATING_CONFIG.not_addressed;
            return (
              <div key={idx} className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-sm">{g.goalArea} — Goal #{g.goalNumber}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${rc.color} ${rc.bg}`}>{rc.label}</span>
                  <TrendIcon direction={g.trendDirection} />
                </div>
                <p className="text-xs text-gray-500 mb-2 line-clamp-2">{g.annualGoal}</p>
                <Textarea rows={3} value={g.narrative} onChange={e => updateGoalNarrative(idx, e.target.value)}
                  placeholder="Progress narrative for this goal..." />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Recommendations</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={4} value={fields.recommendations} onChange={e => setFields({ ...fields, recommendations: e.target.value })}
            placeholder="Recommendations for the IEP team..." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Notes to Parent/Guardian</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={4} value={fields.parentNotes} onChange={e => setFields({ ...fields, parentNotes: e.target.value })}
            placeholder="Additional notes for the parent/guardian..." />
        </CardContent>
      </Card>
    </div>
  );
}
