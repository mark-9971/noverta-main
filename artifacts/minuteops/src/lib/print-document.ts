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
      <p style="margin:4px 0">Generated by Trellis · Built to support · ${dateStr}</p>
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
