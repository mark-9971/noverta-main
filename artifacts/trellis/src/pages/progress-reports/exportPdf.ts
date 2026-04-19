import { ProgressReport, GoalProgressEntry, escapeHtml } from "./types";

type GoalFull = GoalProgressEntry & {
  behaviorTargetName?: string | null;
  behaviorMeasurementType?: string | null;
  behaviorTargetDirection?: string | null;
  behaviorSessionCount?: number | null;
  behaviorVariability?: number | null;
};

function ratingLabel(r: string) {
  return r === "mastered" ? "Mastered"
    : r === "sufficient_progress" ? "Sufficient Progress"
    : r === "some_progress" ? "Some Progress"
    : r === "insufficient_progress" ? "Insufficient Progress"
    : "Not Addressed";
}

function ratingBadgeCss(r: string) {
  return r === "mastered" ? "background:#d1fae5;color:#065f46;"
    : r === "sufficient_progress" ? "background:#dbeafe;color:#1e40af;"
    : r === "some_progress" ? "background:#fef3c7;color:#92400e;"
    : r === "insufficient_progress" ? "background:#fee2e2;color:#991b1b;"
    : "background:#f3f4f6;color:#6b7280;";
}

function ratingBorderColor(r: string) {
  return r === "mastered" ? "#059669"
    : r === "sufficient_progress" ? "#3b82f6"
    : r === "some_progress" ? "#f59e0b"
    : r === "insufficient_progress" ? "#ef4444"
    : "#d1d5db";
}

function trendSymbol(t: string) {
  return t === "improving" ? "▲" : t === "declining" ? "▼" : "→";
}

function trendCss(t: string) {
  return t === "improving" ? "color:#059669;" : t === "declining" ? "color:#dc2626;" : "color:#6b7280;";
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "N/A";
  try { return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); }
  catch { return d; }
}

function escapeNl(s: string) {
  return escapeHtml(s).replace(/\n/g, "<br>");
}

function goalSummaryTable(goals: GoalFull[]) {
  if (!goals.length) return "";
  const rows = goals.map(g => {
    const border = ratingBorderColor(g.progressRating);
    const badgeCss = ratingBadgeCss(g.progressRating);
    const ts = trendSymbol(g.trendDirection);
    const tcss = trendCss(g.trendDirection);
    return `<tr>
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;font-weight:600;border-left:3px solid ${border};padding-left:8px;">${escapeHtml(g.goalArea)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;color:#374151;font-size:9.5pt;max-width:260px;">${escapeHtml(g.annualGoal.slice(0, 120))}${g.annualGoal.length > 120 ? "…" : ""}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;text-align:center;white-space:nowrap;">
        <span style="padding:2px 8px;border-radius:10px;font-size:8.5pt;font-weight:700;${badgeCss}">${escapeHtml(ratingLabel(g.progressRating))}</span>
      </td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:700;font-size:11pt;${tcss}">${ts}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f0f0f0;text-align:center;color:#6b7280;font-size:9.5pt;">${g.dataPoints}</td>
    </tr>`;
  }).join("");
  return `<div class="section" style="page-break-inside:avoid;">
    <div class="section-title">Progress at a Glance</div>
    <table>
      <thead>
        <tr style="background:#f8fafb;">
          <th style="padding:8px 10px;text-align:left;font-size:9pt;color:#4b5563;font-weight:700;border-bottom:2px solid #e5e7eb;">Goal Area</th>
          <th style="padding:8px 10px;text-align:left;font-size:9pt;color:#4b5563;font-weight:700;border-bottom:2px solid #e5e7eb;">Annual Goal (summary)</th>
          <th style="padding:8px 10px;text-align:center;font-size:9pt;color:#4b5563;font-weight:700;border-bottom:2px solid #e5e7eb;">Rating</th>
          <th style="padding:8px 10px;text-align:center;font-size:9pt;color:#4b5563;font-weight:700;border-bottom:2px solid #e5e7eb;">Trend</th>
          <th style="padding:8px 10px;text-align:center;font-size:9pt;color:#4b5563;font-weight:700;border-bottom:2px solid #e5e7eb;">Data Pts</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function goalCards(goals: GoalFull[]) {
  if (!goals.length) return "";
  const cards = goals.map(g => {
    const border = ratingBorderColor(g.progressRating);
    const badgeCss = ratingBadgeCss(g.progressRating);
    const ts = trendSymbol(g.trendDirection);
    const tcss = trendCss(g.trendDirection);
    const isBehavior = !!g.behaviorTargetName;
    const highVariability = isBehavior
      && g.behaviorVariability != null
      && g.behaviorValue != null
      && g.behaviorValue > 0
      && g.behaviorVariability > g.behaviorValue * 0.5;

    const behaviorChips = isBehavior ? `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0;">
        <span style="padding:2px 7px;border-radius:10px;font-size:8.5pt;background:#ede9fe;color:#5b21b6;font-weight:600;">Behavior: ${escapeHtml(g.behaviorTargetName || "")}</span>
        ${g.behaviorMeasurementType ? `<span style="padding:2px 7px;border-radius:10px;font-size:8.5pt;background:#f1f5f9;color:#475569;">Measure: ${escapeHtml(g.behaviorMeasurementType)}</span>` : ""}
        ${g.behaviorTargetDirection ? `<span style="padding:2px 7px;border-radius:10px;font-size:8.5pt;background:#f1f5f9;color:#475569;text-transform:capitalize;">Direction: ${escapeHtml(g.behaviorTargetDirection)}</span>` : ""}
        ${g.behaviorSessionCount != null ? `<span style="padding:2px 7px;border-radius:10px;font-size:8.5pt;background:#f1f5f9;color:#475569;">${g.behaviorSessionCount} session${g.behaviorSessionCount === 1 ? "" : "s"} w/ data</span>` : ""}
      </div>` : "";

    const variabilityWarning = highVariability ? `
      <div style="margin:6px 0;padding:7px 10px;background:#fffbeb;border:1px solid #fcd34d;border-radius:5px;font-size:9pt;color:#92400e;">
        ⚠ Notable session-to-session variability observed (SD ≈ ${g.behaviorVariability}). Data should be interpreted with caution.
      </div>` : "";

    const promptRow = g.promptLevel ? `<div class="goal-detail"><strong>Prompt Level:</strong> ${escapeHtml(g.promptLevel)}</div>` : "";
    const pctRow = g.percentCorrect != null ? `<div class="goal-detail"><strong>% Correct:</strong> ${g.percentCorrect}%</div>` : "";
    const benchmarksRow = g.benchmarks ? `<div class="goal-detail"><strong>Benchmarks:</strong> ${escapeNl(g.benchmarks)}</div>` : "";
    const measureRow = g.measurementMethod ? `<div class="goal-detail"><strong>Measurement:</strong> ${escapeHtml(g.measurementMethod)}</div>` : "";

    return `<div style="border:1px solid #e5e7eb;border-left:4px solid ${border};border-radius:6px;padding:12px 14px;margin-bottom:12px;page-break-inside:avoid;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;gap:8px;">
        <div>
          <span style="font-weight:700;font-size:11pt;color:#111827;">${escapeHtml(g.goalArea)} — Goal #${g.goalNumber}</span>
          ${g.serviceArea ? `<span style="font-size:9pt;color:#6b7280;margin-left:8px;">${escapeHtml(g.serviceArea)}</span>` : ""}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <span style="font-size:11pt;font-weight:700;${tcss}">${ts} ${escapeHtml(g.trendDirection)}</span>
          <span style="padding:3px 10px;border-radius:12px;font-size:8.5pt;font-weight:700;${badgeCss}">${escapeHtml(ratingLabel(g.progressRating))}</span>
        </div>
      </div>
      <div class="goal-detail"><strong>Annual Goal:</strong> ${escapeNl(g.annualGoal)}</div>
      ${g.baseline ? `<div class="goal-detail"><strong>Baseline:</strong> ${escapeHtml(g.baseline)}</div>` : ""}
      ${g.targetCriterion ? `<div class="goal-detail"><strong>Target Criterion:</strong> ${escapeHtml(g.targetCriterion)}</div>` : ""}
      ${benchmarksRow}
      ${measureRow}
      ${isBehavior ? behaviorChips : ""}
      ${promptRow}
      ${pctRow}
      <div class="goal-detail"><strong>Current Performance:</strong> ${escapeNl(g.currentPerformance)}</div>
      <div class="goal-detail" style="color:#6b7280;"><strong>Data Points Collected:</strong> ${g.dataPoints}</div>
      ${variabilityWarning}
      <div style="margin-top:8px;padding:9px 11px;background:#f9fafb;border-radius:4px;font-size:10pt;color:#1f2937;font-style:italic;line-height:1.55;">${escapeNl(g.narrative)}</div>
    </div>`;
  }).join("");

  return `<div class="section">
    <div class="section-title">Goal Progress Detail</div>
    ${cards}
  </div>`;
}

/**
 * Render a progress report as print-ready HTML and trigger the
 * browser's print dialog. This does NOT produce a true PDF — it
 * relies on the user's OS "Save as PDF" option in the print dialog.
 *
 * Uses window.onload to trigger print reliably instead of setTimeout.
 */
export function printProgressReport(r: ProgressReport) {
  const goals = (r.goalProgress || []) as GoalFull[];
  const services = r.serviceBreakdown || [];

  const studentFullName = r.studentName || `${r.studentFirstName || ""} ${r.studentLastName || ""}`.trim() || "Student";

  const printContent = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<title>IEP Progress Report — ${escapeHtml(studentFullName)}</title>
<style>
  @page {
    margin: 0.75in;
    size: letter;
  }
  * { box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 11pt;
    color: #111827;
    line-height: 1.55;
    margin: 0;
    padding: 0;
    background: #fff;
  }

  /* ── Header ── */
  .report-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    border-bottom: 3px solid #059669;
    padding-bottom: 14px;
    margin-bottom: 20px;
  }
  .report-header-left h1 {
    font-size: 17pt;
    font-weight: 800;
    color: #065f46;
    margin: 0 0 2px;
    letter-spacing: -0.3px;
  }
  .report-header-left h2 {
    font-size: 12pt;
    color: #374151;
    margin: 0 0 3px;
    font-weight: 500;
  }
  .report-header-left .legal {
    font-size: 8.5pt;
    color: #9ca3af;
  }
  .report-header-right {
    text-align: right;
    font-size: 9pt;
    color: #6b7280;
    white-space: nowrap;
    padding-top: 3px;
  }
  .confidential-badge {
    display: inline-block;
    background: #fef2f2;
    color: #991b1b;
    border: 1px solid #fecaca;
    border-radius: 4px;
    font-size: 8pt;
    font-weight: 700;
    padding: 2px 7px;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  /* ── Info Grid ── */
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 6px 20px;
    background: #f8fafc;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 12px 16px;
    margin-bottom: 22px;
    font-size: 9.5pt;
  }
  .info-grid .lbl { color: #6b7280; font-weight: 600; display: block; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.3px; }
  .info-grid .val { color: #111827; font-weight: 500; }

  /* ── Sections ── */
  .section { margin-bottom: 22px; }
  .section-title {
    font-size: 12pt;
    font-weight: 700;
    color: #065f46;
    border-bottom: 1.5px solid #d1fae5;
    padding-bottom: 5px;
    margin-bottom: 12px;
    letter-spacing: -0.2px;
  }

  /* ── Narrative boxes ── */
  .summary-box {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-left: 4px solid #059669;
    border-radius: 6px;
    padding: 12px 15px;
    font-size: 10.5pt;
    line-height: 1.6;
    color: #1a2e1e;
  }
  .service-summary-box {
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    border-left: 4px solid #0284c7;
    border-radius: 6px;
    padding: 11px 15px;
    font-size: 10pt;
    line-height: 1.55;
    color: #1e3a5f;
    margin-bottom: 14px;
  }
  .recommendations-box {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-left: 4px solid #3b82f6;
    border-radius: 6px;
    padding: 12px 15px;
    font-size: 10pt;
    line-height: 1.6;
  }
  .parent-notes-box {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-left: 4px solid #16a34a;
    border-radius: 6px;
    padding: 12px 15px;
    font-size: 10pt;
    line-height: 1.6;
  }

  /* ── Goal detail ── */
  .goal-detail { font-size: 10pt; color: #374151; margin: 4px 0; }
  .goal-detail strong { color: #111827; }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th { background: #f8fafc; text-align: left; padding: 8px 10px; font-weight: 700; font-size: 9pt; color: #4b5563; border-bottom: 2px solid #e5e7eb; }
  td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  tr:last-child td { border-bottom: none; }

  /* ── Compliance bar ── */
  .comp-bar { display:inline-block; width: 50px; height: 7px; background: #e5e7eb; border-radius: 4px; vertical-align: middle; overflow: hidden; }
  .comp-fill { height: 100%; border-radius: 4px; }

  /* ── Signature block ── */
  .sig-block {
    margin-top: 32px;
    padding-top: 20px;
    border-top: 1.5px solid #e5e7eb;
    page-break-inside: avoid;
  }
  .sig-block h4 { font-size: 10pt; font-weight: 700; color: #374151; margin: 0 0 14px; }
  .sig-row { display: flex; gap: 32px; margin-bottom: 24px; }
  .sig-field { flex: 1; }
  .sig-line { border-bottom: 1px solid #6b7280; margin-bottom: 3px; height: 22px; }
  .sig-label { font-size: 8pt; color: #6b7280; }

  /* ── Footer ── */
  .footer {
    margin-top: 24px;
    padding-top: 10px;
    border-top: 1px solid #e5e7eb;
    font-size: 8.5pt;
    color: #9ca3af;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  /* ── Print adjustments ── */
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .report-header, .sig-block { page-break-after: avoid; }
    .section { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<!-- Header -->
<div class="report-header">
  <div class="report-header-left">
    <h1>${escapeHtml(r.districtName || "School District")}</h1>
    <h2>IEP Progress Report &mdash; ${escapeHtml(r.reportingPeriod)}</h2>
    <div class="legal">Pursuant to 603 CMR 28.07(8) &nbsp;&bull;&nbsp; IDEA 2004, 20 U.S.C. § 1414(d)(1)(A)(i)(III)</div>
  </div>
  <div class="report-header-right">
    <div class="confidential-badge">CONFIDENTIAL</div><br>
    Special Education Record<br>
    ${r.schoolName ? escapeHtml(r.schoolName) + "<br>" : ""}
    Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
  </div>
</div>

<!-- Student Info -->
<div class="info-grid">
  <div><span class="lbl">Student</span><span class="val">${escapeHtml(studentFullName)}</span></div>
  <div><span class="lbl">Date of Birth</span><span class="val">${escapeHtml(fmtDate(r.studentDob))}</span></div>
  <div><span class="lbl">Grade</span><span class="val">${escapeHtml(r.studentGrade || "N/A")}</span></div>
  <div><span class="lbl">IEP Period</span><span class="val">${escapeHtml(fmtDate(r.iepStartDate))} &ndash; ${escapeHtml(fmtDate(r.iepEndDate))}</span></div>
  <div><span class="lbl">Report Period</span><span class="val">${escapeHtml(fmtDate(r.periodStart))} &ndash; ${escapeHtml(fmtDate(r.periodEnd))}</span></div>
  <div><span class="lbl">Prepared By</span><span class="val">${escapeHtml(r.preparedByName || "N/A")}</span></div>
  <div><span class="lbl">Status</span><span class="val" style="text-transform:capitalize;">${escapeHtml(r.status)}</span></div>
  ${r.nextReportDate ? `<div><span class="lbl">Next Report Due</span><span class="val">${escapeHtml(fmtDate(r.nextReportDate))}</span></div>` : ""}
  ${r.parentNotificationDate ? `<div><span class="lbl">Sent to Parent</span><span class="val">${escapeHtml(fmtDate(r.parentNotificationDate))}</span></div>` : ""}
</div>

<!-- Overall Summary -->
${r.overallSummary ? `<div class="section" style="page-break-inside:avoid;">
  <div class="section-title">Overall Summary</div>
  <div class="summary-box">${escapeNl(r.overallSummary)}</div>
</div>` : ""}

<!-- Goals at a Glance -->
${goalSummaryTable(goals)}

<!-- Goal Progress Detail -->
${goalCards(goals)}

<!-- Service Delivery -->
${services.length > 0 ? `<div class="section" style="page-break-inside:avoid;">
  <div class="section-title">Service Delivery</div>
  ${r.serviceDeliverySummary ? `<div class="service-summary-box" style="margin-bottom:14px;">${escapeNl(r.serviceDeliverySummary)}</div>` : ""}
  <table>
    <thead>
      <tr>
        <th>Service Type</th>
        <th style="text-align:right;">Required</th>
        <th style="text-align:right;">Delivered</th>
        <th style="text-align:center;">Compliance</th>
        <th style="text-align:right;">Completed</th>
        <th style="text-align:right;">Missed</th>
      </tr>
    </thead>
    <tbody>
      ${services.map(s => {
        const pct = Math.min(Number(s.compliancePercent) || 0, 100);
        const barColor = pct >= 90 ? "#059669" : pct >= 70 ? "#f59e0b" : "#dc2626";
        const pctColor = pct >= 90 ? "#065f46" : pct >= 70 ? "#92400e" : "#991b1b";
        return `<tr>
          <td style="font-weight:600;">${escapeHtml(s.serviceType)}</td>
          <td style="text-align:right;">${Number(s.requiredMinutes) || 0} min</td>
          <td style="text-align:right;">${Number(s.deliveredMinutes) || 0} min</td>
          <td style="text-align:center;">
            <span class="comp-bar"><span class="comp-fill" style="width:${pct}%;background:${barColor};display:block;"></span></span>
            <span style="font-weight:700;color:${pctColor};margin-left:5px;">${pct}%</span>
          </td>
          <td style="text-align:right;">${Number(s.completedSessions) || 0}</td>
          <td style="text-align:right;color:${Number(s.missedSessions) > 0 ? "#dc2626" : "#374151"};font-weight:${Number(s.missedSessions) > 0 ? "600" : "400"};">${Number(s.missedSessions) || 0}</td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>
</div>` : ""}

<!-- Recommendations -->
${r.recommendations ? `<div class="section" style="page-break-inside:avoid;">
  <div class="section-title">Recommendations</div>
  <div class="recommendations-box">${escapeNl(r.recommendations)}</div>
</div>` : ""}

<!-- Notes to Parent/Guardian -->
${r.parentNotes ? `<div class="section" style="page-break-inside:avoid;">
  <div class="section-title">Notes to Parent / Guardian</div>
  <div class="parent-notes-box">${escapeNl(r.parentNotes)}</div>
</div>` : ""}

<!-- Signature Block -->
<div class="sig-block">
  <h4>Signatures</h4>
  <div class="sig-row">
    <div class="sig-field">
      <div class="sig-line"></div>
      <div class="sig-label">Prepared By (print name &amp; title)</div>
    </div>
    <div class="sig-field" style="max-width:160px;">
      <div class="sig-line"></div>
      <div class="sig-label">Signature</div>
    </div>
    <div class="sig-field" style="max-width:120px;">
      <div class="sig-line"></div>
      <div class="sig-label">Date</div>
    </div>
  </div>
  <div class="sig-row">
    <div class="sig-field">
      <div class="sig-line"></div>
      <div class="sig-label">Parent / Guardian (print name)</div>
    </div>
    <div class="sig-field" style="max-width:160px;">
      <div class="sig-line"></div>
      <div class="sig-label">Signature</div>
    </div>
    <div class="sig-field" style="max-width:120px;">
      <div class="sig-line"></div>
      <div class="sig-label">Date</div>
    </div>
  </div>
  <p style="font-size:8pt;color:#9ca3af;margin:0;">
    Parent/guardian receipt of this progress report does not constitute agreement with the content.
    Contact the special education coordinator to discuss findings or request a team meeting.
  </p>
</div>

<!-- Footer -->
<div class="footer">
  <span>Trellis SPED Platform &mdash; Confidential Student Record &mdash; 603 CMR 28.07(8)</span>
  <span>${escapeHtml(studentFullName)} &bull; ${escapeHtml(r.reportingPeriod)}</span>
</div>

</body></html>`;

  const pw = window.open("", "_blank");
  if (!pw) return;
  pw.document.write(printContent);
  pw.document.close();
  pw.onload = () => pw.print();
  setTimeout(() => {
    if (!pw.closed) pw.print();
  }, 800);
}
