import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  X, Save, Database, FileCheck, Loader2, CheckCircle2, Edit2, Printer,
  TrendingUp, TrendingDown, Clock, AlertTriangle, Minus as MinusIcon, BarChart3
} from "lucide-react";
import { generateProgressReport, updateProgressReport } from "@workspace/api-client-react";
import { saveGeneratedDocument, buildDocumentHtml, openPrintWindow, esc as escDoc, fetchDistrictLogoUrl, type DocumentSection } from "@/lib/print-document";

export interface GoalProgressEntry {
  iepGoalId: number; goalArea: string; goalNumber: number; annualGoal: string;
  baseline: string | null; targetCriterion: string | null;
  currentPerformance: string; progressRating: string; progressCode: string; dataPoints: number;
  trendDirection: string; promptLevel?: string | null; percentCorrect?: number | null;
  behaviorValue?: number | null; behaviorGoal?: number | null; narrative: string;
  benchmarks?: string | null; measurementMethod?: string | null; serviceArea?: string | null;
}
export interface ServiceDeliveryBreakdown {
  serviceType: string; requiredMinutes: number; deliveredMinutes: number;
  missedSessions: number; completedSessions: number; compliancePercent: number;
}
export interface ProgressReport {
  id: number; studentId: number; reportingPeriod: string; periodStart: string;
  periodEnd: string; status: string; overallSummary: string | null;
  serviceDeliverySummary: string | null; recommendations: string | null;
  parentNotes: string | null; goalProgress: GoalProgressEntry[];
  preparedByName?: string | null; createdAt: string;
  studentDob?: string | null; studentGrade?: string | null;
  schoolName?: string | null; districtName?: string | null;
  iepStartDate?: string | null; iepEndDate?: string | null;
  serviceBreakdown?: ServiceDeliveryBreakdown[];
  parentNotificationDate?: string | null; nextReportDate?: string | null;
}

const PROGRESS_RATINGS: Record<string, { label: string; color: string; icon: any; bg: string }> = {
  mastered: { label: "Mastered", color: "text-emerald-700", icon: CheckCircle2, bg: "bg-emerald-50" },
  sufficient_progress: { label: "Sufficient Progress", color: "text-emerald-700", icon: TrendingUp, bg: "bg-emerald-50" },
  some_progress: { label: "Some Progress", color: "text-amber-700", icon: Clock, bg: "bg-amber-50" },
  insufficient_progress: { label: "Insufficient Progress", color: "text-red-700", icon: AlertTriangle, bg: "bg-red-50" },
  not_addressed: { label: "Not Addressed", color: "text-gray-500", icon: MinusIcon, bg: "bg-gray-50" },
};

const MA_PROGRESS_CODES: Record<string, { label: string; fullLabel: string; color: string; bg: string }> = {
  M: { label: "M", fullLabel: "Mastered", color: "text-emerald-700", bg: "bg-emerald-50" },
  SP: { label: "SP", fullLabel: "Sufficient Progress", color: "text-emerald-700", bg: "bg-emerald-50" },
  IP: { label: "IP", fullLabel: "Insufficient Progress", color: "text-amber-700", bg: "bg-amber-50" },
  NP: { label: "NP", fullLabel: "No Progress", color: "text-red-700", bg: "bg-red-50" },
  NA: { label: "NA", fullLabel: "Not Addressed", color: "text-gray-500", bg: "bg-gray-50" },
  R: { label: "R", fullLabel: "Regression", color: "text-red-800", bg: "bg-red-100" },
};

const TREND_ICONS: Record<string, { icon: any; color: string; label: string }> = {
  improving: { icon: TrendingUp, color: "text-emerald-500", label: "Improving" },
  declining: { icon: TrendingDown, color: "text-red-500", label: "Declining" },
  stable: { icon: MinusIcon, color: "text-gray-400", label: "Stable" },
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function GenerateReportModal({ studentId, onClose, onGenerated }: {
  studentId: number; onClose: () => void; onGenerated: (report: ProgressReport) => void;
}) {
  const now = new Date();
  const currentMonth = now.getMonth();
  let qStart: string, qEnd: string, qLabel: string;

  if (currentMonth < 3) {
    qStart = `${now.getFullYear()}-01-01`;
    qEnd = `${now.getFullYear()}-03-31`;
    qLabel = `Q3 - Winter ${now.getFullYear()}`;
  } else if (currentMonth < 6) {
    qStart = `${now.getFullYear()}-04-01`;
    qEnd = `${now.getFullYear()}-06-30`;
    qLabel = `Q4 - Spring ${now.getFullYear()}`;
  } else if (currentMonth < 9) {
    qStart = `${now.getFullYear()}-07-01`;
    qEnd = `${now.getFullYear()}-09-30`;
    qLabel = `Q1 - Summer ${now.getFullYear()}`;
  } else {
    qStart = `${now.getFullYear()}-10-01`;
    qEnd = `${now.getFullYear()}-12-31`;
    qLabel = `Q2 - Fall ${now.getFullYear()}`;
  }

  const [periodStart, setPeriodStart] = useState(qStart);
  const [periodEnd, setPeriodEnd] = useState(qEnd);
  const [reportingPeriod, setReportingPeriod] = useState(qLabel);
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);
    const report = await generateProgressReport(studentId, { periodStart, periodEnd, reportingPeriod });
    onGenerated(report as unknown as ProgressReport);
    setGenerating(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 md:p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-bold text-gray-800">Generate Progress Report</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="bg-emerald-50 rounded-lg p-3 mb-4 text-[12px] text-emerald-800">
          <Database className="w-4 h-4 inline mr-1.5" />
          The report aggregates program and behavior data sessions within the selected date range and assembles a templated progress narrative for each IEP goal from the recorded data points. No language model is used — narratives are generated from your data, not written by AI.
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[12px] font-medium text-gray-500">Reporting Period Name</label>
            <input value={reportingPeriod} onChange={e => setReportingPeriod(e.target.value)}
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-gray-500">Start Date</label>
              <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-500">End Date</label>
              <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose} className="text-[12px] h-9 md:h-8">Cancel</Button>
          <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-9 md:h-8" disabled={generating} onClick={generate}>
            {generating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FileCheck className="w-3.5 h-3.5 mr-1" />}
            {generating ? "Generating..." : "Generate Report"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ReportDetailModal({ report, studentName, onClose, onUpdated }: {
  report: ProgressReport; studentName: string; onClose: () => void;
  onUpdated: (updated: Partial<ProgressReport>) => void;
}) {
  const [editingNarrative, setEditingNarrative] = useState<number | null>(null);
  const [narrativeText, setNarrativeText] = useState("");
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryText, setSummaryText] = useState(report.overallSummary ?? "");
  const [recommendationsText, setRecommendationsText] = useState(report.recommendations ?? "");
  const [parentNotesText, setParentNotesText] = useState(report.parentNotes ?? "");
  const [saving, setSaving] = useState(false);

  const goalProgress = (report.goalProgress ?? []) as GoalProgressEntry[];
  const serviceBreakdown = (report.serviceBreakdown ?? []) as ServiceDeliveryBreakdown[];

  async function saveChanges() {
    setSaving(true);
    const updatedGoals = [...goalProgress];
    if (editingNarrative !== null) {
      const idx = updatedGoals.findIndex(g => g.iepGoalId === editingNarrative);
      if (idx >= 0) updatedGoals[idx] = { ...updatedGoals[idx], narrative: narrativeText };
    }

    await updateProgressReport(report.id, {
        overallSummary: summaryText,
        recommendations: recommendationsText,
        parentNotes: parentNotesText || null,
        goalProgress: updatedGoals,
      });
    onUpdated({
      overallSummary: summaryText,
      recommendations: recommendationsText,
      parentNotes: parentNotesText || null,
      goalProgress: updatedGoals,
    });
    setEditingNarrative(null);
    setEditingSummary(false);
    setSaving(false);
  }

  async function finalizeReport() {
    setSaving(true);
    await updateProgressReport(report.id, { status: "final" });
    onUpdated({ status: "final" });
    setSaving(false);
  }

  async function printReport() {
    const districtLogoUrl = await fetchDistrictLogoUrl();
    const goalRows = goalProgress.map(gp => `
      <tr>
        <td>${escDoc(String(gp.goalNumber))}</td>
        <td>${escDoc(gp.goalArea)}${gp.serviceArea ? ` (${escDoc(gp.serviceArea)})` : ""}</td>
        <td>${escDoc(gp.annualGoal)}</td>
        <td>${escDoc(gp.baseline) || "N/A"}</td>
        <td style="text-align:center;font-weight:bold">${escDoc(gp.progressCode)}</td>
        <td>${escDoc(gp.currentPerformance)}</td>
        <td>${escDoc(gp.narrative)}</td>
      </tr>
    `).join("");
    const svcRows = serviceBreakdown.map(s => `
      <tr>
        <td>${escDoc(s.serviceType)}</td>
        <td style="text-align:center">${s.requiredMinutes}</td>
        <td style="text-align:center">${s.deliveredMinutes}</td>
        <td style="text-align:center">${s.completedSessions}</td>
        <td style="text-align:center">${s.missedSessions}</td>
        <td style="text-align:center;font-weight:bold">${s.compliancePercent}%</td>
      </tr>
    `).join("");

    const sections: DocumentSection[] = [
      {
        heading: "Progress Code Key",
        html: `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;font-size:11px;padding:8px;background:#f9fafb;border-radius:4px;margin-bottom:10px">
          <div><strong>M</strong> = Mastered</div><div><strong>SP</strong> = Sufficient Progress</div><div><strong>IP</strong> = Insufficient Progress</div>
          <div><strong>NP</strong> = No Progress</div><div><strong>R</strong> = Regression</div><div><strong>NA</strong> = Not Addressed</div>
        </div>`,
      },
      {
        heading: "Goal-by-Goal Progress",
        html: `<table>
          <thead><tr><th>#</th><th>Area</th><th>Annual Goal</th><th>Baseline</th><th>Code</th><th>Current Performance</th><th>Narrative</th></tr></thead>
          <tbody>${goalRows}</tbody>
        </table>`,
      },
      ...(serviceBreakdown.length > 0 ? [{
        heading: "Service Delivery Summary",
        html: `<table>
          <thead><tr><th>Service</th><th>Required Min</th><th>Delivered Min</th><th>Sessions</th><th>Missed</th><th>Compliance</th></tr></thead>
          <tbody>${svcRows}</tbody>
        </table>`,
      } as DocumentSection] : []),
      {
        heading: "Recommendations",
        html: `<div class="field-box">${escDoc(report.recommendations) || "None"}</div>`,
      },
      ...(report.parentNotes ? [{
        heading: "Parent/Guardian Notes",
        html: `<div class="field-box">${escDoc(report.parentNotes)}</div>`,
      } as DocumentSection] : []),
      ...(report.iepStartDate ? [{
        heading: "IEP Period",
        html: `<div class="field-box">${escDoc(formatDate(report.iepStartDate))} — ${escDoc(formatDate(report.iepEndDate || ""))}</div>`,
      } as DocumentSection] : []),
    ];

    const html = buildDocumentHtml({
      documentTitle: "Massachusetts IEP Progress Report",
      documentSubtitle: "Pursuant to 603 CMR 28.07(8)",
      studentName,
      studentDob: report.studentDob,
      studentGrade: report.studentGrade,
      school: report.schoolName,
      district: report.districtName,
      districtLogoUrl,
      isDraft: report.status !== "final",
      generatedDate: `${formatDate(report.periodStart)} — ${formatDate(report.periodEnd)}`,
      sections,
      signatureLines: ["Educator Signature / Date", "Parent/Guardian Signature / Date"],
      footerHtml: `<p style="margin:3px 0">Pursuant to 603 CMR 28.07(8), parents/guardians must be informed of IEP goal progress as often as non-disabled peers. Parents may request an IEP Team meeting at any time.</p>${report.nextReportDate ? `<p style="margin:3px 0"><strong>Next Report Due:</strong> ${escDoc(formatDate(report.nextReportDate))}</p>` : ""}${report.preparedByName ? `<p style="margin:3px 0"><strong>Prepared By:</strong> ${escDoc(report.preparedByName)}</p>` : ""}`,
    });

    openPrintWindow(html);
    saveGeneratedDocument({
      studentId: report.studentId,
      type: "progress_report",
      title: `IEP Progress Report — ${formatDate(report.periodStart)} to ${formatDate(report.periodEnd)}${report.status !== "final" ? " (Draft)" : ""}`,
      htmlSnapshot: html,
      linkedRecordId: report.id,
      status: report.status === "final" ? "finalized" : "draft",
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-3xl shadow-xl my-auto max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 p-4 md:p-5 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{report.reportingPeriod}</h2>
            <p className="text-xs text-gray-400">{studentName} · {formatDate(report.periodStart)} — {formatDate(report.periodEnd)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={printReport}>
              <Printer className="w-3.5 h-3.5 mr-1" /> Print / Save as PDF
            </Button>
            {report.status === "draft" && (
              <Button size="sm" variant="outline" className="text-[12px] h-8 text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={finalizeReport} disabled={saving}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Finalize
              </Button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-4 md:p-5 space-y-5">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider mb-2">603 CMR 28.07(8) — IEP Progress Report</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-[12px] text-gray-700">
              <div><span className="text-gray-400">Student:</span> {studentName}</div>
              <div><span className="text-gray-400">DOB:</span> {report.studentDob ? formatDate(report.studentDob) : "N/A"}</div>
              <div><span className="text-gray-400">Grade:</span> {report.studentGrade || "N/A"}</div>
              <div><span className="text-gray-400">School:</span> {report.schoolName || "N/A"}</div>
              <div><span className="text-gray-400">District:</span> {report.districtName || "N/A"}</div>
              <div><span className="text-gray-400">Period:</span> {formatDate(report.periodStart)} — {formatDate(report.periodEnd)}</div>
              {report.iepStartDate && <div><span className="text-gray-400">IEP:</span> {formatDate(report.iepStartDate)} — {formatDate(report.iepEndDate || "")}</div>}
              {report.nextReportDate && <div><span className="text-gray-400">Next Report:</span> {formatDate(report.nextReportDate)}</div>}
            </div>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5">
            {Object.entries(MA_PROGRESS_CODES).map(([code, cfg]) => {
              const cnt = goalProgress.filter(g => g.progressCode === code).length;
              return (
                <div key={code} className={`${cfg.bg} rounded-lg p-2 text-center`}>
                  <p className={`text-lg font-bold ${cfg.color}`}>{cnt}</p>
                  <p className={`text-[9px] font-medium ${cfg.color}`}>{code} — {cfg.fullLabel}</p>
                </div>
              );
            })}
          </div>

          {serviceBreakdown.length > 0 && (
            <div>
              <h3 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Service Delivery Compliance</h3>
              <div className="space-y-1.5">
                {serviceBreakdown.map((s, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-gray-700">{s.serviceType}</p>
                      <p className="text-[11px] text-gray-400">{s.completedSessions} sessions · {s.deliveredMinutes} of {s.requiredMinutes} min</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.missedSessions > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">{s.missedSessions} missed</span>}
                      <span className={`text-[12px] font-bold ${s.compliancePercent >= 90 ? "text-emerald-700" : s.compliancePercent >= 75 ? "text-amber-600" : "text-red-600"}`}>
                        {s.compliancePercent}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider">Overall Summary</h3>
              {report.status === "draft" && (
                <button className="text-[11px] text-emerald-700 hover:text-emerald-900" onClick={() => setEditingSummary(!editingSummary)}>
                  <Edit2 className="w-3 h-3 inline mr-0.5" /> Edit
                </button>
              )}
            </div>
            {editingSummary ? (
              <div className="space-y-2">
                <textarea value={summaryText} onChange={e => setSummaryText(e.target.value)} rows={6}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none font-mono" />
                <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]" onClick={saveChanges} disabled={saving}>
                  <Save className="w-3.5 h-3.5 mr-1" /> Save
                </Button>
              </div>
            ) : (
              <p className="text-[12px] text-gray-600 whitespace-pre-line bg-gray-50 rounded-lg p-3">{report.overallSummary}</p>
            )}
          </div>

          <div>
            <h3 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Goal-by-Goal Progress</h3>
            <div className="space-y-3">
              {goalProgress.map((gp) => {
                const rating = PROGRESS_RATINGS[gp.progressRating] ?? PROGRESS_RATINGS.not_addressed;
                const trend = TREND_ICONS[gp.trendDirection] ?? TREND_ICONS.stable;
                const RatingIcon = rating.icon;
                const TrendIcon = trend.icon;

                return (
                  <Card key={gp.iepGoalId}>
                    <CardContent className="p-3.5 md:p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-7 h-7 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-700 text-[11px] font-bold flex-shrink-0">
                          {gp.goalNumber}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider">{gp.goalArea}</span>
                            {gp.serviceArea && gp.serviceArea !== gp.goalArea && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">{gp.serviceArea}</span>
                            )}
                          </div>
                          <p className="text-[13px] font-medium text-gray-700 mt-0.5">{gp.annualGoal}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
                        <div className={`${MA_PROGRESS_CODES[gp.progressCode]?.bg || rating.bg} rounded-lg p-2 text-center`}>
                          <p className={`text-lg font-bold ${MA_PROGRESS_CODES[gp.progressCode]?.color || rating.color}`}>{gp.progressCode}</p>
                          <p className={`text-[9px] font-medium mt-0.5 ${MA_PROGRESS_CODES[gp.progressCode]?.color || rating.color}`}>
                            {MA_PROGRESS_CODES[gp.progressCode]?.fullLabel || rating.label}
                          </p>
                        </div>
                        <div className={`${rating.bg} rounded-lg p-2 text-center`}>
                          <RatingIcon className={`w-4 h-4 mx-auto ${rating.color}`} />
                          <p className={`text-[10px] font-semibold mt-0.5 ${rating.color}`}>{rating.label}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                          <TrendIcon className={`w-4 h-4 mx-auto ${trend.color}`} />
                          <p className="text-[10px] font-medium text-gray-500 mt-0.5">{trend.label}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                          <BarChart3 className="w-4 h-4 mx-auto text-gray-400" />
                          <p className="text-[10px] font-medium text-gray-500 mt-0.5">{gp.dataPoints} pts</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                          <p className="text-sm font-bold text-emerald-700">
                            {gp.percentCorrect != null ? `${gp.percentCorrect}%` : gp.behaviorValue != null ? gp.behaviorValue : "—"}
                          </p>
                          <p className="text-[10px] font-medium text-gray-500 mt-0.5">Current</p>
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] text-gray-400 uppercase tracking-wider">Narrative</p>
                          {report.status === "draft" && (
                            <button className="text-[10px] text-emerald-700 hover:text-emerald-900"
                              onClick={() => { setEditingNarrative(gp.iepGoalId); setNarrativeText(gp.narrative); }}>
                              <Edit2 className="w-3 h-3 inline mr-0.5" /> Edit
                            </button>
                          )}
                        </div>
                        {editingNarrative === gp.iepGoalId ? (
                          <div className="space-y-2">
                            <textarea value={narrativeText} onChange={e => setNarrativeText(e.target.value)} rows={3}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
                            <div className="flex gap-2">
                              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] h-7" onClick={saveChanges} disabled={saving}>Save</Button>
                              <Button size="sm" variant="outline" className="text-[11px] h-7" onClick={() => setEditingNarrative(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[12px] text-gray-600">{gp.narrative}</p>
                        )}
                      </div>

                      {(gp.baseline || gp.targetCriterion || gp.promptLevel || gp.measurementMethod) && (
                        <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400 flex-wrap">
                          {gp.baseline && <span>Baseline: {gp.baseline}</span>}
                          {gp.targetCriterion && <span>Target: {gp.targetCriterion}</span>}
                          {gp.promptLevel && <span>Prompt: {gp.promptLevel}</span>}
                          {gp.measurementMethod && <span>Method: {gp.measurementMethod}</span>}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider">Recommendations</h3>
              {report.status === "draft" && !editingSummary && (
                <button className="text-[11px] text-emerald-700 hover:text-emerald-900" onClick={() => setEditingSummary(true)}>
                  <Edit2 className="w-3 h-3 inline mr-0.5" /> Edit
                </button>
              )}
            </div>
            {editingSummary ? (
              <textarea value={recommendationsText} onChange={e => setRecommendationsText(e.target.value)} rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
            ) : (
              <p className="text-[13px] text-gray-600">{report.recommendations || "None"}</p>
            )}
          </div>

          <div>
            <h3 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Parent / Guardian Notes</h3>
            {report.status === "draft" ? (
              <textarea value={parentNotesText} onChange={e => setParentNotesText(e.target.value)} rows={2}
                placeholder="Optional notes for parent/guardian..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
            ) : (
              <p className="text-[13px] text-gray-600">{report.parentNotes || "None"}</p>
            )}
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-[11px] text-gray-500 leading-relaxed">
              <strong>Parent/Guardian Notification (603 CMR 28.07(8)):</strong> This progress report is provided pursuant to Massachusetts regulations
              requiring that parents/guardians be informed of their child's progress toward IEP goals at least as often as parents of non-disabled children
              are informed of their child's progress. You have the right to request an IEP Team meeting at any time to discuss your child's progress.
            </p>
          </div>

          {report.status === "draft" && editingSummary && (
            <div className="flex justify-end">
              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]" onClick={saveChanges} disabled={saving}>
                <Save className="w-3.5 h-3.5 mr-1" /> Save All Changes
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
