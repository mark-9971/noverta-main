import { authFetch } from "./auth-fetch";

const TRELLIS_GREEN = "#059669";
const TRELLIS_GREEN_DARK = "#047857";
const GRAY_200 = "#e5e7eb";
const GRAY_600 = "#4b5563";

export function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(typeof d === "string" && !d.includes("T") ? d + "T12:00:00" : d)
      .toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return String(d ?? "—");
  }
}

export function fmtTime(t: string | null | undefined): string {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hr = parseInt(h ?? "0");
  return `${hr > 12 ? hr - 12 : hr || 12}:${m ?? "00"} ${hr >= 12 ? "PM" : "AM"}`;
}

export interface DocumentSection {
  heading: string;
  html: string;
}

export interface BuildDocumentOptions {
  documentTitle: string;
  documentSubtitle?: string;
  studentName: string;
  studentDob?: string | null;
  studentGrade?: string | null;
  school?: string | null;
  district?: string | null;
  generatedDate?: string;
  isDraft?: boolean;
  watermark?: string;
  sections: DocumentSection[];
  signatureLines?: string[];
  footerHtml?: string;
}

const SHARED_CSS = `
  * { box-sizing: border-box; }
  body {
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 12px;
    color: #111827;
    margin: 0;
    padding: 0;
    background: white;
  }
  .page-wrap { max-width: 8.5in; margin: 0 auto; padding: 0.5in 0.75in 0.75in; }
  .doc-header {
    border-bottom: 3px solid ${TRELLIS_GREEN};
    padding-bottom: 14px;
    margin-bottom: 20px;
  }
  .doc-header h1 {
    font-size: 18px;
    font-weight: bold;
    margin: 0 0 4px;
    color: #111827;
  }
  .doc-header .subtitle {
    font-size: 11px;
    color: ${GRAY_600};
    margin: 2px 0;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px 24px;
    font-size: 12px;
    background: #f9fafb;
    border: 1px solid ${GRAY_200};
    border-radius: 4px;
    padding: 10px 14px;
    margin-bottom: 18px;
  }
  .meta-grid .meta-item { display: flex; gap: 4px; }
  .meta-grid .meta-label { font-weight: 600; color: ${GRAY_600}; min-width: 90px; }
  h2 {
    font-size: 13px;
    font-weight: bold;
    color: ${TRELLIS_GREEN_DARK};
    border-bottom: 1.5px solid ${TRELLIS_GREEN};
    padding-bottom: 4px;
    margin: 20px 0 8px;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; font-size: 11px; }
  th {
    background: #f3f4f6;
    padding: 6px 8px;
    border: 1px solid ${GRAY_200};
    text-align: left;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: ${GRAY_600};
  }
  td { padding: 6px 8px; border: 1px solid ${GRAY_200}; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  .badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 600;
  }
  .badge-red { background: #fee2e2; color: #b91c1c; }
  .badge-amber { background: #fef3c7; color: #92400e; }
  .badge-green { background: #d1fae5; color: #065f46; }
  .badge-gray { background: #f3f4f6; color: #374151; }
  .field-box {
    background: #f9fafb;
    border: 1px solid ${GRAY_200};
    border-left: 3px solid ${TRELLIS_GREEN};
    border-radius: 4px;
    padding: 10px 12px;
    margin-bottom: 10px;
    font-size: 12px;
    line-height: 1.5;
  }
  .field-label { font-weight: 600; color: ${GRAY_600}; margin-bottom: 3px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
  .info-row { display: flex; gap: 8px; margin-bottom: 6px; }
  .info-cell { flex: 1; }
  .info-cell .label { font-size: 10px; font-weight: 600; color: ${GRAY_600}; text-transform: uppercase; }
  .info-cell .value { font-size: 12px; }
  .draft-watermark {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-35deg);
    font-size: 100px;
    font-weight: 900;
    color: rgba(0,0,0,0.04);
    pointer-events: none;
    z-index: 0;
    user-select: none;
    white-space: nowrap;
  }
  .sig-block {
    margin-top: 36px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 28px;
  }
  .sig-line {
    border-top: 1px solid #9ca3af;
    padding-top: 4px;
    font-size: 10px;
    color: ${GRAY_600};
  }
  .footer {
    margin-top: 32px;
    padding-top: 12px;
    border-top: 1.5px solid ${GRAY_200};
    font-size: 10px;
    color: #9ca3af;
  }
  .notice-box {
    background: #fef9c3;
    border: 1px solid #fde68a;
    border-radius: 4px;
    padding: 8px 12px;
    font-size: 11px;
    margin-top: 20px;
  }
  .notice-box strong { color: #92400e; }
  @media print {
    body { font-size: 11px; }
    .page-wrap { padding: 0.25in 0.5in 0.5in; }
    .no-print { display: none !important; }
    h2 { margin-top: 14px; }
    .draft-watermark { position: fixed; }
  }
`;

export function buildDocumentHtml(opts: BuildDocumentOptions): string {
  const {
    documentTitle, documentSubtitle, studentName, studentDob, studentGrade,
    school, district, isDraft = false, watermark, sections,
    signatureLines = [], footerHtml = "", generatedDate,
  } = opts;

  const dateStr = generatedDate ?? new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const metaItems = [
    ["Student", studentName],
    ...(studentDob ? [["Date of Birth", fmtDate(studentDob)]] : []),
    ...(studentGrade ? [["Grade", studentGrade]] : []),
    ...(school ? [["School", school]] : []),
    ...(district ? [["District", district]] : []),
    ["Generated", dateStr],
    ...(isDraft ? [["Status", "DRAFT — For Team Review Only"]] : [["Status", "FINAL"]]),
  ];

  const metaHtml = metaItems.map(([label, value]) =>
    `<div class="meta-item"><span class="meta-label">${esc(label)}:</span><span>${esc(value ?? "")}</span></div>`
  ).join("");

  const sectionsHtml = sections.map(s =>
    `<h2>${esc(s.heading)}</h2>${s.html}`
  ).join("\n");

  const sigHtml = signatureLines.length > 0 ? `
    <div class="sig-block">
      ${signatureLines.map(l => `<div class="sig-line">${esc(l)}</div>`).join("")}
    </div>` : "";

  const watermarkHtml = (isDraft || watermark) ?
    `<div class="draft-watermark">${esc(watermark ?? "DRAFT")}</div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; script-src 'none'">
  <title>${esc(documentTitle)} — ${esc(studentName)}</title>
  <style>${SHARED_CSS}</style>
</head>
<body>
  ${watermarkHtml}
  <div class="page-wrap">
    <div class="doc-header">
      <h1>${esc(documentTitle)}</h1>
      ${documentSubtitle ? `<div class="subtitle">${esc(documentSubtitle)}</div>` : ""}
      ${isDraft ? `<div class="subtitle" style="color:#b45309;font-weight:600">⚠ DRAFT — For IEP Team Review Only — Not a Final Document</div>` : ""}
    </div>
    <div class="meta-grid">${metaHtml}</div>
    ${sectionsHtml}
    ${sigHtml}
    <div class="footer">
      ${footerHtml}
      <p style="margin:4px 0">Generated by Trellis · ${dateStr}</p>
    </div>
  </div>
</body>
</html>`;
}

export function openPrintWindow(html: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    URL.revokeObjectURL(url);
    alert("Please allow pop-ups for this site to open print preview.");
    return;
  }
  win.addEventListener("load", () => { setTimeout(() => win.print(), 300); });
  setTimeout(() => URL.revokeObjectURL(url), 300_000);
}

export interface BoardSummaryData {
  districtName: string;
  schoolYear: string;
  generatedAt: string;
  complianceRate: number;
  trendWeeks: { label: string; rate: number }[];
  kpis: {
    studentsServed: number;
    servicesDeliveredPct: number;
    financialExposure: number;
    annualReviewsDue30: number | null;
  };
  topRiskStudents: {
    initials: string;
    service: string;
    shortfallMinutes: number;
    exposure: number | null;
  }[];
  providerRates: {
    name: string;
    rate: number;
    shortfall: number;
  }[];
}

function fmtDollarsLocal(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function buildSparklineSvg(weeks: { label: string; rate: number }[]): string {
  if (weeks.length === 0) return "";
  const W = 160, H = 44, PAD = 6;
  const minRate = Math.max(0, Math.min(...weeks.map(w => w.rate)) - 5);
  const maxRate = Math.min(100, Math.max(...weeks.map(w => w.rate)) + 5);
  const range = Math.max(1, maxRate - minRate);
  const xStep = (W - PAD * 2) / Math.max(1, weeks.length - 1);

  const points = weeks.map((w, i) => ({
    x: PAD + i * xStep,
    y: PAD + ((maxRate - w.rate) / range) * (H - PAD * 2),
    rate: w.rate,
    label: w.label,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const lastPt = points[points.length - 1]!;
  const lastRate = lastPt.rate;
  const lineColor = lastRate >= 90 ? "#059669" : lastRate >= 75 ? "#d97706" : "#dc2626";

  const dots = points.map(p =>
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${lineColor}" />`
  ).join("");

  const labels = points.map(p =>
    `<text x="${p.x.toFixed(1)}" y="${H}" text-anchor="middle" font-size="8" fill="#9ca3af">${p.label}</text>`
  ).join("");

  return `<svg width="${W}" height="${H + 10}" viewBox="0 0 ${W} ${H + 10}" xmlns="http://www.w3.org/2000/svg">
    <path d="${pathD}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    ${labels}
  </svg>`;
}

export function buildBoardSummaryHtml(data: BoardSummaryData): string {
  const { districtName, schoolYear, generatedAt, complianceRate, trendWeeks, kpis, topRiskStudents, providerRates } = data;

  const dateStr = new Date(generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const rateColor = complianceRate >= 90 ? "#059669" : complianceRate >= 75 ? "#d97706" : "#dc2626";
  const rateBg = complianceRate >= 90 ? "#d1fae5" : complianceRate >= 75 ? "#fef3c7" : "#fee2e2";
  const rateBorder = complianceRate >= 90 ? "#6ee7b7" : complianceRate >= 75 ? "#fcd34d" : "#fca5a5";

  const sparkline = buildSparklineSvg(trendWeeks);

  const kpiBoxes = [
    { label: "Students Served", value: String(kpis.studentsServed), icon: "👥", color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe" },
    { label: "Services Delivered", value: `${kpis.servicesDeliveredPct}%`, icon: "✓", color: "#059669", bg: "#d1fae5", border: "#6ee7b7" },
    { label: "Financial Exposure", value: fmtDollarsLocal(kpis.financialExposure), icon: "$", color: kpis.financialExposure > 0 ? "#dc2626" : "#059669", bg: kpis.financialExposure > 0 ? "#fee2e2" : "#d1fae5", border: kpis.financialExposure > 0 ? "#fca5a5" : "#6ee7b7" },
    { label: "IEP Reviews Due (30d)", value: kpis.annualReviewsDue30 !== null ? String(kpis.annualReviewsDue30) : "N/A", icon: "📅", color: kpis.annualReviewsDue30 !== null && kpis.annualReviewsDue30 > 0 ? "#d97706" : "#059669", bg: kpis.annualReviewsDue30 !== null && kpis.annualReviewsDue30 > 0 ? "#fef3c7" : "#d1fae5", border: kpis.annualReviewsDue30 !== null && kpis.annualReviewsDue30 > 0 ? "#fcd34d" : "#6ee7b7" },
  ];

  const topRiskRows = topRiskStudents.slice(0, 5).map((s, i) => `
    <tr style="${i % 2 === 1 ? "background:#fafafa;" : ""}">
      <td style="padding:7px 10px;font-weight:700;color:#374151;font-size:12px">${esc(s.initials)}</td>
      <td style="padding:7px 10px;color:#6b7280;font-size:11px">${esc(s.service)}</td>
      <td style="padding:7px 10px;text-align:right;color:#dc2626;font-weight:600;font-size:12px">${s.shortfallMinutes} min</td>
      <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:12px;color:${s.exposure != null && s.exposure > 0 ? "#dc2626" : "#6b7280"}">
        ${s.exposure != null ? fmtDollarsLocal(s.exposure) : "—"}
      </td>
    </tr>`).join("");

  const providerBars = providerRates.map(p => {
    const pct = Math.min(100, Math.max(0, p.rate));
    const color = pct >= 90 ? "#059669" : pct >= 75 ? "#d97706" : "#dc2626";
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <div style="width:110px;flex-shrink:0;font-size:11px;color:#374151;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(p.name)}">${esc(p.name)}</div>
        <div style="flex:1;height:10px;background:#e5e7eb;border-radius:5px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:5px;transition:width 0.3s"></div>
        </div>
        <div style="width:38px;text-align:right;font-size:11px;font-weight:700;color:${color}">${pct.toFixed(0)}%</div>
        ${p.shortfall > 0 ? `<div style="width:50px;text-align:right;font-size:10px;color:#dc2626">-${p.shortfall}m</div>` : `<div style="width:50px"></div>`}
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; script-src 'none'">
  <title>District Compliance Health Summary — ${esc(districtName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Helvetica Neue", Arial, sans-serif;
      font-size: 11px;
      color: #111827;
      background: white;
    }
    @page { size: landscape; margin: 0.4in 0.5in; }
    @media print {
      body { font-size: 10px; }
      .no-print { display: none !important; }
    }
    .page {
      width: 100%;
      max-width: 10.5in;
      margin: 0 auto;
      padding: 0.3in 0.4in;
    }
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      border-bottom: 3px solid #059669;
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    .header-left h1 {
      font-size: 20px;
      font-weight: 800;
      color: #111827;
      letter-spacing: -0.02em;
    }
    .header-left .subtitle {
      font-size: 11px;
      color: #6b7280;
      margin-top: 2px;
    }
    .header-right {
      text-align: right;
      font-size: 10px;
      color: #9ca3af;
      line-height: 1.6;
    }
    .main-grid {
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }
    .left-col { flex: 0 0 200px; }
    .right-col { flex: 1; min-width: 0; }
    .rate-box {
      background: ${rateBg};
      border: 2px solid ${rateBorder};
      border-radius: 10px;
      padding: 14px 16px;
      text-align: center;
      margin-bottom: 12px;
    }
    .rate-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #6b7280;
      margin-bottom: 4px;
    }
    .rate-value {
      font-size: 52px;
      font-weight: 900;
      color: ${rateColor};
      line-height: 1;
    }
    .rate-sub {
      font-size: 10px;
      color: #9ca3af;
      margin-top: 4px;
    }
    .sparkline-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 6px;
    }
    .section-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #047857;
      border-bottom: 1.5px solid #059669;
      padding-bottom: 3px;
      margin-bottom: 8px;
    }
    .kpi-row {
      display: flex;
      gap: 10px;
      margin-bottom: 12px;
    }
    table.risk-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin: 0;
    }
    table.risk-table th {
      background: #f3f4f6;
      padding: 6px 10px;
      text-align: left;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #6b7280;
      border-bottom: 1px solid #e5e7eb;
    }
    table.risk-table th:last-child,
    table.risk-table td:last-child { text-align: right; }
    table.risk-table td {
      border-bottom: 1px solid #f3f4f6;
    }
    .two-col {
      display: flex;
      gap: 16px;
      margin-top: 12px;
    }
    .two-col > div { flex: 1; min-width: 0; }
    .footer {
      margin-top: 14px;
      padding-top: 8px;
      border-top: 1px solid #e5e7eb;
      font-size: 9px;
      color: #9ca3af;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="header-left">
        <h1>District Compliance Health Summary</h1>
        <div class="subtitle">${esc(districtName)} &nbsp;·&nbsp; ${esc(schoolYear)}</div>
      </div>
      <div class="header-right">
        <div><strong>Generated:</strong> ${esc(dateStr)}</div>
        <div style="margin-top:2px;font-size:9px;color:#d1d5db">Trellis SPED Management Platform</div>
      </div>
    </div>

    <div class="main-grid">
      <div class="left-col">
        <div class="rate-box">
          <div class="rate-label">Compliance Rate</div>
          <div class="rate-value">${complianceRate}%</div>
          <div class="rate-sub">overall service delivery</div>
          ${sparkline ? `<div class="sparkline-wrap">${sparkline}</div><div style="font-size:9px;color:#9ca3af;text-align:center;margin-top:2px">4-week trend</div>` : ""}
        </div>

        <div class="section-title">At a Glance</div>
        ${kpiBoxes.map(k => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:${k.bg};border:1px solid ${k.border};border-radius:6px;margin-bottom:6px">
            <div style="font-size:10px;color:#6b7280;font-weight:600">${esc(k.label)}</div>
            <div style="font-size:14px;font-weight:800;color:${k.color}">${esc(k.value)}</div>
          </div>`).join("")}
      </div>

      <div class="right-col">
        <div class="two-col">
          <div>
            <div class="section-title">Top Financial Risks (Students)</div>
            ${topRiskStudents.length === 0
              ? `<div style="color:#9ca3af;font-size:11px;padding:8px 0">No at-risk students identified.</div>`
              : `<table class="risk-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Service</th>
                    <th style="text-align:right">Shortfall</th>
                    <th style="text-align:right">Exposure</th>
                  </tr>
                </thead>
                <tbody>${topRiskRows}</tbody>
              </table>
              <div style="font-size:9px;color:#9ca3af;margin-top:4px">Student initials shown for privacy (FERPA)</div>`
            }
          </div>

          <div>
            <div class="section-title">Staff Delivery Rates</div>
            ${providerRates.length === 0
              ? `<div style="color:#9ca3af;font-size:11px;padding:8px 0">No provider data available.</div>`
              : providerBars
            }
          </div>
        </div>
      </div>
    </div>

    <div class="footer">
      Generated by Trellis SPED Management Platform &nbsp;·&nbsp; ${esc(dateStr)} &nbsp;·&nbsp; Confidential — For Board/Superintendent Use Only
    </div>
  </div>
</body>
</html>`;
}

export async function saveGeneratedDocument(params: {
  studentId: number;
  type: "incident_report" | "progress_report" | "iep_draft";
  title: string;
  htmlSnapshot: string;
  linkedRecordId?: number;
  status?: "draft" | "finalized";
}): Promise<{ id: number } | null> {
  try {
    const res = await authFetch("/api/generated-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    return await res.json() as { id: number };
  } catch {
    return null;
  }
}

export interface DailyCoverageSession {
  absenceDate: string | null;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  studentName: string | null;
  serviceTypeName: string | null;
  originalStaffName: string | null;
  substituteStaffName: string | null;
  isCovered: boolean;
  location: string | null;
}

export interface DailyCoverageSummary {
  date: string;
  totalSessions: number;
  covered: number;
  uncovered: number;
  coverageRate: number;
  absentStaffCount: number;
}

export function buildDailyCoverageReportHtml(opts: {
  date: string;
  summary: DailyCoverageSummary;
  sessions: DailyCoverageSession[];
  school?: string | null;
  district?: string | null;
}): string {
  const { date, summary, sessions, school, district } = opts;

  const displayDate = fmtDate(date);

  const absentStaffNames = Array.from(
    new Set(sessions.map(s => s.originalStaffName).filter(Boolean))
  ) as string[];

  const uncovered = sessions.filter(s => !s.isCovered);
  const covered = sessions.filter(s => s.isCovered);

  const DAY_LABELS: Record<string, string> = {
    monday: "Mon", tuesday: "Tue", wednesday: "Wed",
    thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun",
  };

  function fmt12(t: string): string {
    const [h, m] = t.split(":").map(Number);
    const ampm = (h ?? 0) < 12 ? "AM" : "PM";
    const h12 = (h ?? 0) % 12 || 12;
    return `${h12}:${String(m ?? 0).padStart(2, "0")} ${ampm}`;
  }

  function sessionRow(s: DailyCoverageSession, showSub: boolean): string {
    const day = DAY_LABELS[s.dayOfWeek] ?? s.dayOfWeek;
    const time = `${fmt12(s.startTime)}–${fmt12(s.endTime)}`;
    const student = esc(s.studentName ?? "—");
    const service = esc(s.serviceTypeName ?? "—");
    const original = esc(s.originalStaffName ?? "—");
    const location = esc(s.location ?? "—");
    if (showSub) {
      return `<tr>
        <td>${student}</td>
        <td>${service}</td>
        <td>${day} ${time}</td>
        <td>${original}</td>
        <td>${esc(s.substituteStaffName ?? "—")}</td>
        <td>${location}</td>
      </tr>`;
    }
    return `<tr>
      <td>${student}</td>
      <td>${service}</td>
      <td>${day} ${time}</td>
      <td>${original}</td>
      <td>${location}</td>
    </tr>`;
  }

  const rateColor = summary.coverageRate >= 80 ? "#065f46" : "#92400e";
  const rateBg = summary.coverageRate >= 80 ? "#d1fae5" : "#fef3c7";

  const summaryGrid = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px">
      <div style="background:#f9fafb;border:1px solid ${GRAY_200};border-radius:6px;padding:12px 14px;text-align:center">
        <div style="font-size:22px;font-weight:700;color:#111827">${summary.totalSessions}</div>
        <div style="font-size:10px;color:${GRAY_600};text-transform:uppercase;letter-spacing:0.04em;margin-top:2px">Total Sessions</div>
      </div>
      <div style="background:#f9fafb;border:1px solid ${GRAY_200};border-radius:6px;padding:12px 14px;text-align:center">
        <div style="font-size:22px;font-weight:700;color:#065f46">${summary.covered}</div>
        <div style="font-size:10px;color:${GRAY_600};text-transform:uppercase;letter-spacing:0.04em;margin-top:2px">Covered</div>
      </div>
      <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:6px;padding:12px 14px;text-align:center">
        <div style="font-size:22px;font-weight:700;color:#92400e">${summary.uncovered}</div>
        <div style="font-size:10px;color:#92400e;text-transform:uppercase;letter-spacing:0.04em;margin-top:2px">Uncovered</div>
      </div>
      <div style="background:${rateBg};border:1px solid ${rateBg};border-radius:6px;padding:12px 14px;text-align:center">
        <div style="font-size:22px;font-weight:700;color:${rateColor}">${summary.coverageRate}%</div>
        <div style="font-size:10px;color:${rateColor};text-transform:uppercase;letter-spacing:0.04em;margin-top:2px">Coverage Rate</div>
      </div>
    </div>`;

  const absentSection = absentStaffNames.length > 0
    ? `<h2>Absent Staff (${absentStaffNames.length})</h2>
       <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
         ${absentStaffNames.map(n => `<span style="background:#fee2e2;color:#b91c1c;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">${esc(n)}</span>`).join("")}
       </div>`
    : `<h2>Absent Staff</h2><p style="color:${GRAY_600};font-size:12px">No absences recorded for today.</p>`;

  const uncoveredSection = uncovered.length > 0
    ? `<h2>Sessions Needing Coverage (${uncovered.length})</h2>
       <table>
         <thead><tr><th>Student</th><th>Service</th><th>Time</th><th>Original Provider</th><th>Location</th></tr></thead>
         <tbody>${uncovered.map(s => sessionRow(s, false)).join("")}</tbody>
       </table>`
    : `<h2>Sessions Needing Coverage</h2>
       <p style="color:#065f46;font-size:12px;font-weight:600">All sessions are covered. ✓</p>`;

  const coveredSection = covered.length > 0
    ? `<h2>Covered Sessions (${covered.length})</h2>
       <table>
         <thead><tr><th>Student</th><th>Service</th><th>Time</th><th>Original Provider</th><th>Substitute</th><th>Location</th></tr></thead>
         <tbody>${covered.map(s => sessionRow(s, true)).join("")}</tbody>
       </table>`
    : "";

  const metaItems = [
    ...(school ? [`<div class="meta-item"><span class="meta-label">School:</span><span>${esc(school)}</span></div>`] : []),
    ...(district ? [`<div class="meta-item"><span class="meta-label">District:</span><span>${esc(district)}</span></div>`] : []),
    `<div class="meta-item"><span class="meta-label">Report Date:</span><span>${displayDate}</span></div>`,
    `<div class="meta-item"><span class="meta-label">Absent Staff:</span><span>${summary.absentStaffCount}</span></div>`,
    `<div class="meta-item"><span class="meta-label">Generated:</span><span>${new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span></div>`,
  ].join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; script-src 'none'">
  <title>Daily Coverage Report — ${esc(displayDate)}</title>
  <style>${SHARED_CSS}</style>
</head>
<body>
  <div class="page-wrap">
    <div class="doc-header">
      <h1>Daily Coverage Report</h1>
      <div class="subtitle">Front Office Coverage Sheet — ${esc(displayDate)}</div>
    </div>
    <div class="meta-grid">${metaItems}</div>
    ${summaryGrid}
    ${absentSection}
    ${uncoveredSection}
    ${coveredSection}
    <div class="footer">
      <p style="margin:4px 0">Generated by Trellis · ${esc(displayDate)} · For internal use only.</p>
    </div>
  </div>
</body>
</html>`;

  return html;
}

function yesNo(v: boolean | null | undefined): string {
  return v ? "Yes" : "No";
}

function boolField(label: string, value: boolean | null | undefined, note?: string | null): string {
  const icon = value ? `<span style="color:${TRELLIS_GREEN}">✓</span>` : `<span style="color:#6b7280">—</span>`;
  return `<div class="info-row">
    <div class="info-cell" style="flex:0 0 200px"><span class="label">${esc(label)}</span></div>
    <div class="info-cell">${icon} ${value ? "Yes" : "No"}${note ? ` — <em>${esc(note)}</em>` : ""}</div>
  </div>`;
}

export function buildIncidentReportHtml(opts: {
  incident: Record<string, unknown>;
  studentName: string;
  studentDob?: string | null;
  school?: string | null;
  district?: string | null;
  staffMap?: Record<number, string>;
}): string {
  const { incident: i, studentName, studentDob, school, district, staffMap = {} } = opts;

  function staffName(id: number | null | undefined): string {
    if (!id) return "—";
    return staffMap[id] ?? `Staff #${id}`;
  }

  const incidentDate = fmtDate(i.incidentDate as string);
  const startTime = fmtTime(i.incidentTime as string);
  const endTime = i.endTime ? fmtTime(i.endTime as string) : "—";
  const durationMin = i.durationMinutes ? `${i.durationMinutes} min` : "—";

  const incidentType = String(i.incidentType ?? "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  const sections: DocumentSection[] = [
    {
      heading: "Incident Information",
      html: `
        <div class="meta-grid" style="margin-bottom:12px">
          <div class="meta-item"><span class="meta-label">Date:</span><span>${incidentDate}</span></div>
          <div class="meta-item"><span class="meta-label">Start Time:</span><span>${startTime}</span></div>
          <div class="meta-item"><span class="meta-label">End Time:</span><span>${endTime}</span></div>
          <div class="meta-item"><span class="meta-label">Duration:</span><span>${durationMin}</span></div>
          <div class="meta-item"><span class="meta-label">Type:</span><span>${esc(incidentType)}</span></div>
          <div class="meta-item"><span class="meta-label">Location:</span><span>${esc(i.location as string)}</span></div>
          <div class="meta-item"><span class="meta-label">Primary Staff:</span><span>${staffName(i.primaryStaffId as number)}</span></div>
          <div class="meta-item"><span class="meta-label">Incident ID:</span><span>#${esc(String(i.id ?? ""))}</span></div>
        </div>`,
    },
    {
      heading: "Behavior & Context",
      html: `
        <div class="field-box"><div class="field-label">Preceding Activity</div>${esc(i.precedingActivity as string) || "—"}</div>
        <div class="field-box"><div class="field-label">Trigger Description</div>${esc(i.triggerDescription as string) || "—"}</div>
        <div class="field-box"><div class="field-label">Behavior Description</div>${esc(i.behaviorDescription as string) || "—"}</div>
        <div class="field-box"><div class="field-label">De-escalation Attempts</div>${esc(i.deescalationAttempts as string) || "—"}</div>
        <div class="field-box"><div class="field-label">Alternatives Attempted</div>${esc(i.alternativesAttempted as string) || "—"}</div>
        <div class="field-box"><div class="field-label">Justification</div>${esc(i.justification as string) || "—"}</div>`,
    },
    {
      heading: "Restraint Details",
      html: `
        <div class="meta-grid" style="margin-bottom:12px">
          <div class="meta-item"><span class="meta-label">Restraint Type:</span><span>${esc((i.restraintType as string ?? "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()))}</span></div>
          <div class="meta-item"><span class="meta-label">Body Position:</span><span>${esc(i.bodyPosition as string) || "—"}</span></div>
          <div class="meta-item"><span class="meta-label">Physical Escort:</span><span>${yesNo(i.physicalEscortOnly as boolean)}</span></div>
          <div class="meta-item"><span class="meta-label">Over 20 Min:</span><span>${yesNo(i.continuedOver20Min as boolean)}${i.over20MinApproverName ? ` (Approver: ${esc(i.over20MinApproverName as string)})` : ""}</span></div>
        </div>
        <div class="field-box"><div class="field-label">Restraint Description</div>${esc(i.restraintDescription as string) || "—"}</div>
        <div class="field-box"><div class="field-label">Calming Strategies Used</div>${esc(i.calmingStrategiesUsed as string) || "—"}</div>
        <div class="field-box"><div class="field-label">Student State After</div>${esc(i.studentStateAfter as string) || "—"}</div>`,
    },
    {
      heading: "Injuries & Medical",
      html: `
        <table>
          <thead><tr><th>Category</th><th>Injury</th><th>Details</th></tr></thead>
          <tbody>
            <tr>
              <td>Student</td>
              <td>${i.studentInjury ? `<span class="badge badge-red">Yes</span>` : `<span class="badge badge-green">No</span>`}</td>
              <td>${esc(i.studentInjuryDescription as string) || "—"}</td>
            </tr>
            <tr>
              <td>Staff</td>
              <td>${i.staffInjury ? `<span class="badge badge-red">Yes</span>` : `<span class="badge badge-green">No</span>`}</td>
              <td>${esc(i.staffInjuryDescription as string) || "—"}</td>
            </tr>
          </tbody>
        </table>
        ${boolField("Medical Attention Required", i.medicalAttentionRequired as boolean, i.medicalDetails as string)}
        ${boolField("Emergency Services Called", i.emergencyServicesCalled as boolean, i.emergencyServicesCalledAt as string)}`,
    },
    {
      heading: "Parent Notification",
      html: `
        <table>
          <thead><tr><th>Step</th><th>Completed</th><th>Detail</th></tr></thead>
          <tbody>
            <tr><td>Verbal Notification</td>
              <td>${i.parentVerbalNotification ? `<span class="badge badge-green">Yes</span>` : `<span class="badge badge-gray">No</span>`}</td>
              <td>${i.parentVerbalNotificationAt ? fmtDate(i.parentVerbalNotificationAt as string) : "—"}</td>
            </tr>
            <tr><td>Parent Notified</td>
              <td>${i.parentNotified ? `<span class="badge badge-green">Yes</span>` : `<span class="badge badge-gray">No</span>`}</td>
              <td>Method: ${esc(i.parentNotificationMethod as string) || "—"} · By: ${staffName(i.parentNotifiedBy as number)}</td>
            </tr>
            <tr><td>Written Report Sent</td>
              <td>${i.writtenReportSent ? `<span class="badge badge-green">Yes</span>` : `<span class="badge badge-gray">No</span>`}</td>
              <td>Method: ${esc(i.writtenReportSentMethod as string) || "—"}</td>
            </tr>
          </tbody>
        </table>`,
    },
    {
      heading: "Follow-Up & Debrief",
      html: `
        ${boolField("Debrief Conducted", i.debriefConducted as boolean, i.debriefDate ? `Date: ${fmtDate(i.debriefDate as string)}` : undefined)}
        <div class="field-box"><div class="field-label">Debrief Notes</div>${esc(i.debriefNotes as string) || "—"}</div>
        <div class="field-box"><div class="field-label">Follow-Up Plan</div>${esc(i.followUpPlan as string) || "—"}</div>
        ${boolField("BIP In Place", i.bipInPlace as boolean)}
        <div class="field-box"><div class="field-label">Notes</div>${esc(i.notes as string) || "—"}</div>`,
    },
    {
      heading: "Administrative Review",
      html: `
        <div class="meta-grid">
          <div class="meta-item"><span class="meta-label">Reviewed By:</span><span>${staffName(i.adminReviewedBy as number)}</span></div>
          <div class="meta-item"><span class="meta-label">Review Date:</span><span>${fmtDate(i.adminReviewedAt as string)}</span></div>
        </div>
        <div class="field-box"><div class="field-label">Review Notes</div>${esc(i.adminReviewNotes as string) || "—"}</div>`,
    },
    {
      heading: "DESE Reporting (603 CMR 46.03)",
      html: `
        <table>
          <thead><tr><th>Requirement</th><th>Status</th><th>Detail</th></tr></thead>
          <tbody>
            <tr>
              <td>DESE Report Required</td>
              <td>${i.deseReportRequired ? `<span class="badge badge-red">Yes — Required</span>` : `<span class="badge badge-green">No</span>`}</td>
              <td>Per 603 CMR 46.03, incidents involving injury or restraint exceeding 20 min require DESE reporting within 3 school days.</td>
            </tr>
            <tr>
              <td>DESE Report Sent</td>
              <td>${i.deseReportSentAt ? `<span class="badge badge-green">Sent</span>` : (i.deseReportRequired ? `<span class="badge badge-red">Pending</span>` : `<span class="badge badge-gray">N/A</span>`)}</td>
              <td>${i.deseReportSentAt ? `Sent: ${fmtDate(i.deseReportSentAt as string)}` : "—"}</td>
            </tr>
            <tr>
              <td>30-Day Log Submitted to DESE</td>
              <td>${i.thirtyDayLogSentToDese ? `<span class="badge badge-green">Yes</span>` : `<span class="badge badge-gray">No</span>`}</td>
              <td>Monthly incident log submitted per 603 CMR 46.03(3).</td>
            </tr>
          </tbody>
        </table>
        <div class="notice-box" style="margin-top:8px">
          <strong>DESE Reporting Obligations:</strong> Under 603 CMR 46.03, school districts must report each use of physical restraint that results in injury or lasts more than 20 consecutive minutes to the Department of Elementary and Secondary Education within 3 school days of the incident. Monthly incident logs must also be submitted.
        </div>`,
    },
  ];

  const html = buildDocumentHtml({
    documentTitle: "Restraint/Seclusion Incident Report",
    documentSubtitle: "Massachusetts 603 CMR 46.00 — Protective Measures Documentation",
    studentName,
    studentDob: studentDob ?? undefined,
    school: school ?? undefined,
    district: district ?? undefined,
    sections,
    signatureLines: [
      "Reporting Staff Signature / Date",
      "Administrator Signature / Date",
      "Parent/Guardian Signature / Date",
    ],
    footerHtml: `<p style="margin:2px 0">This report is confidential and subject to FERPA regulations. 603 CMR 46.00 documentation retained per district policy.</p>`,
  });

  return html;
}

function buildSparklineSvg(
  dataPoints: { date: string; value: number }[],
  color = "#059669",
): string {
  if (dataPoints.length < 2) return "";
  const W = 320, H = 72;
  const vals = dataPoints.map(d => d.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const padX = 6, padY = 10;

  function ptX(i: number) {
    return padX + (i / (dataPoints.length - 1)) * (W - 2 * padX);
  }
  function ptY(v: number) {
    return H - padY - ((v - min) / range) * (H - 2 * padY);
  }

  const polyline = dataPoints
    .map((d, i) => `${ptX(i).toFixed(1)},${ptY(d.value).toFixed(1)}`)
    .join(" ");

  const dots = dataPoints
    .map(
      (d, i) =>
        `<circle cx="${ptX(i).toFixed(1)}" cy="${ptY(d.value).toFixed(1)}" r="2.5" fill="${color}" opacity="0.85"/>`,
    )
    .join("");

  const topLabel = max !== min ? String(Math.round(max)) : "";
  const botLabel = min !== max ? String(Math.round(min)) : String(Math.round(min));

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block">
    <text x="3" y="${(padY + 2).toFixed(1)}" font-size="8" fill="#9ca3af">${topLabel}</text>
    <text x="3" y="${(H - 2).toFixed(1)}" font-size="8" fill="#9ca3af">${botLabel}</text>
    <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
  </svg>`;
}

export interface GoalPrintData {
  id: number;
  goalArea: string;
  goalNumber?: string | number | null;
  annualGoal: string;
  progressRating: string;
  trendDirection: string;
  dataPoints: { date: string; value: number; notes?: string | null }[];
  dataPointCount: number;
  latestValue: number | null;
  baseline_value: number | null;
  goal_value: number | null;
  measurementType?: string;
  yLabel?: string;
}

export function buildGoalProgressReportHtml(opts: {
  studentName: string;
  studentDob?: string | null;
  studentGrade?: string | null;
  school?: string | null;
  district?: string | null;
  goals: GoalPrintData[];
}): string {
  const { studentName, studentDob, studentGrade, school, district, goals } = opts;

  const RATING_LABELS: Record<string, string> = {
    mastered: "Mastered",
    sufficient_progress: "Sufficient Progress",
    some_progress: "Some Progress",
    insufficient_progress: "Insufficient Progress",
    not_addressed: "No Data",
  };
  const RATING_STYLES: Record<string, string> = {
    mastered: "background:#d1fae5;color:#065f46",
    sufficient_progress: "background:#dbeafe;color:#1e40af",
    some_progress: "background:#fef3c7;color:#92400e",
    insufficient_progress: "background:#fee2e2;color:#b91c1c",
    not_addressed: "background:#f3f4f6;color:#374151",
  };
  const TREND_LABELS: Record<string, string> = {
    improving: "\u2191 Improving",
    declining: "\u2193 Declining",
    flat: "\u2192 Stable",
    stable: "\u2192 Stable",
  };
  const SPARKLINE_COLORS: Record<string, string> = {
    mastered: "#059669",
    sufficient_progress: "#3b82f6",
    some_progress: "#f59e0b",
    insufficient_progress: "#ef4444",
    not_addressed: "#9ca3af",
  };

  const GOAL_CSS = `
    .goal-block {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 14px 16px;
      margin-bottom: 18px;
      page-break-inside: avoid;
    }
    .goal-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
    }
    .goal-area-tag {
      font-size: 10px;
      font-weight: 600;
      background: #ecfdf5;
      color: #065f46;
      padding: 2px 8px;
      border-radius: 9999px;
      display: inline-block;
      margin-bottom: 5px;
    }
    .goal-text { font-size: 12px; color: #111827; line-height: 1.55; }
    .goal-badges { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
    .rating-badge { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 9999px; white-space: nowrap; }
    .trend-label { font-size: 10px; color: #6b7280; white-space: nowrap; }
    .goal-metrics {
      display: flex; gap: 16px; font-size: 11px; color: #6b7280;
      margin: 8px 0; padding: 6px 10px; background: #f9fafb; border-radius: 4px; flex-wrap: wrap;
    }
    .goal-metrics strong { color: #374151; }
    .chart-wrap {
      margin: 10px 0 6px; padding: 8px 10px 4px;
      background: #fafafa; border: 1px solid #e5e7eb; border-radius: 4px;
    }
    .chart-title {
      font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 4px;
    }
    .chart-dates {
      display: flex; justify-content: space-between; font-size: 9px; color: #9ca3af; margin-top: 2px;
      padding: 0 6px;
    }
    .data-section-label {
      font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em;
      color: #9ca3af; font-weight: 600; margin: 10px 0 4px;
    }
    .notes-block {
      padding: 7px 10px; border-left: 3px solid #059669; background: #f0fdf4;
      border-radius: 0 4px 4px 0; font-size: 11px; color: #374151; margin-bottom: 6px;
    }
    .notes-date { font-size: 9px; color: #6b7280; margin-bottom: 2px; font-weight: 600; }
    .summary-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; margin-bottom: 6px;
    }
    .summary-tile {
      border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; text-align: center;
    }
    .summary-tile .count { font-size: 22px; font-weight: 700; }
    .summary-tile .slabel { font-size: 10px; color: #6b7280; }
  `;

  const ratingCounts: Record<string, number> = {};
  for (const g of goals) {
    ratingCounts[g.progressRating] = (ratingCounts[g.progressRating] || 0) + 1;
  }
  const orderedRatings = [
    "mastered", "sufficient_progress", "some_progress", "insufficient_progress", "not_addressed",
  ];

  const summaryHtml = `<style>${GOAL_CSS}</style>
    <div class="summary-grid">
      ${orderedRatings
        .filter(r => (ratingCounts[r] || 0) > 0)
        .map(r => {
          const colorMatch = RATING_STYLES[r]?.match(/color:([^;]+)/);
          const textColor = colorMatch ? colorMatch[1].trim() : "#111827";
          return `<div class="summary-tile">
            <div class="count" style="color:${textColor}">${ratingCounts[r]}</div>
            <div class="slabel">${esc(RATING_LABELS[r] || r)}</div>
          </div>`;
        }).join("")}
    </div>`;

  const goalsHtml = goals.map(g => {
    const ratingStyle = RATING_STYLES[g.progressRating] || RATING_STYLES.not_addressed;
    const ratingLabel = RATING_LABELS[g.progressRating] || g.progressRating;
    const trendLabel = TREND_LABELS[g.trendDirection] || "\u2192 Stable";
    const sparkColor = SPARKLINE_COLORS[g.progressRating] || "#059669";

    const sortedPoints = [...g.dataPoints].sort((a, b) => a.date.localeCompare(b.date));
    const firstDate = sortedPoints.length > 0 ? fmtDate(sortedPoints[0].date) : "\u2014";
    const lastDate = sortedPoints.length > 0 ? fmtDate(sortedPoints[sortedPoints.length - 1].date) : "\u2014";
    const sparkSvg = sortedPoints.length >= 2 ? buildSparklineSvg(sortedPoints, sparkColor) : "";

    const recentNotes = sortedPoints.filter(p => p.notes).slice(-3).reverse();

    const metricsHtml = `<div class="goal-metrics">
      <span>${g.dataPointCount} data point${g.dataPointCount !== 1 ? "s" : ""}</span>
      ${sortedPoints.length > 0 ? `<span>Period: ${firstDate} \u2013 ${lastDate}</span>` : ""}
      ${g.latestValue !== null ? `<span>Latest: <strong>${g.measurementType === "program" ? `${Math.round(g.latestValue)}%` : g.latestValue}</strong></span>` : ""}
      ${g.baseline_value !== null ? `<span>Baseline: ${g.measurementType === "program" ? `${Math.round(g.baseline_value)}%` : g.baseline_value}</span>` : ""}
      ${g.goal_value !== null ? `<span>Target: ${g.measurementType === "program" ? `${g.goal_value}%` : g.goal_value}</span>` : ""}
    </div>`;

    const chartHtml = sparkSvg
      ? `<div class="chart-wrap">
          <div class="chart-title">Progress Over Time${g.yLabel ? ` \u2014 ${esc(g.yLabel)}` : ""}</div>
          ${sparkSvg}
          <div class="chart-dates"><span>${firstDate}</span><span>${lastDate}</span></div>
        </div>`
      : g.dataPoints.length === 1
        ? `<p style="font-size:11px;color:#9ca3af;font-style:italic;margin:6px 0">1 data point recorded \u2014 chart will appear after more data is collected</p>`
        : "";

    const notesHtml = recentNotes.length > 0
      ? `<div class="data-section-label">Recent Session Notes</div>
         ${recentNotes.map(p => `<div class="notes-block"><div class="notes-date">${fmtDate(p.date)}</div>${esc(p.notes || "")}</div>`).join("")}`
      : "";

    return `<div class="goal-block">
      <div class="goal-header">
        <div style="flex:1;min-width:0">
          <div>
            <span class="goal-area-tag">${esc(g.goalArea)}</span>
            ${g.goalNumber ? `<span style="font-size:10px;color:#9ca3af;margin-left:4px">#${esc(String(g.goalNumber))}</span>` : ""}
          </div>
          <div class="goal-text">${esc(g.annualGoal)}</div>
        </div>
        <div class="goal-badges">
          <span class="rating-badge" style="${ratingStyle}">${esc(ratingLabel)}</span>
          <span class="trend-label">${esc(trendLabel)}</span>
        </div>
      </div>
      ${metricsHtml}
      ${chartHtml}
      ${notesHtml}
    </div>`;
  }).join("");

  return buildDocumentHtml({
    documentTitle: "IEP Goal Progress Report",
    documentSubtitle: "Prepared for IEP Team Meeting",
    studentName,
    studentDob: studentDob ?? undefined,
    studentGrade: studentGrade ?? undefined,
    school: school ?? undefined,
    district: district ?? undefined,
    sections: [
      { heading: `Progress Summary (${goals.length} Goal${goals.length !== 1 ? "s" : ""})`, html: summaryHtml },
      { heading: "Goal Details", html: goalsHtml },
    ],
    signatureLines: [
      "Case Manager / Date",
      "Parent/Guardian / Date",
      "Special Education Director / Date",
    ],
    footerHtml: `<p style="margin:2px 0">This document is confidential and subject to FERPA. Generated for IEP team meeting preparation only.</p>`,
  });
}
