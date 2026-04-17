import { ProgressReport, escapeHtml } from "./types";

/**
 * Render a progress report as print-ready HTML and trigger the
 * browser's print dialog. This does NOT produce a true PDF — it
 * relies on the user's OS "Save as PDF" option in the print dialog.
 *
 * The function (and its callers' button labels) used to be called
 * "Export PDF", which was misleading. If a true server-generated
 * PDF is ever needed for progress reports, add a PDFKit endpoint
 * under `routes/reportExports/` and wire a separate button to it.
 */
export function printProgressReport(r: ProgressReport) {
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
