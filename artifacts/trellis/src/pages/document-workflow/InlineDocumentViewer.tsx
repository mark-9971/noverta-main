import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, FileText, Printer } from "lucide-react";
import { openPrintWindow, buildDocumentHtml, fmtDate, esc } from "@/lib/print-document";

interface GoalProgressEntry {
  iepGoalId: number;
  goalArea: string;
  goalNumber: number;
  annualGoal: string;
  progressRating: string;
  progressCode: string;
  narrative: string;
  [key: string]: unknown;
}

interface ServiceDeliveryBreakdown {
  serviceType: string;
  requiredMinutes: number;
  deliveredMinutes: number;
  compliancePercent: number;
  [key: string]: unknown;
}

interface DocumentPreview {
  documentType: string;
  documentId: number;
  [key: string]: unknown;
}

interface Props {
  workflowId: number;
  documentType: string;
  studentName: string;
}

function PreviewField({ label, value }: { label: string; value: unknown }) {
  if (!value && value !== false) return null;
  const text = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-xs text-gray-800 bg-white border border-gray-100 rounded p-2 leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function MetaRow({ items }: { items: { label: string; value: unknown }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
      {items.filter(({ value }) => value !== null && value !== undefined && value !== "").map(({ label, value }) => (
        <div key={label}>
          <span className="text-gray-500 font-medium">{label}: </span>
          <span className="text-gray-800">{String(value)}</span>
        </div>
      ))}
    </div>
  );
}

function IepPreview({ preview, studentName }: { preview: DocumentPreview; studentName: string }) {
  const iepTypeLabel = preview.iepType === "initial" ? "Initial IEP"
    : preview.iepType === "annual" ? "Annual IEP"
    : preview.iepType === "amendment" ? "Amendment"
    : String(preview.iepType ?? "");

  function handlePrint() {
    const s = (v: unknown) => esc(String(v ?? ""));
    const sections = [
      { heading: "Student & Team Concerns", html: [
        preview.studentConcerns && `<div class="field-box"><div class="field-label">Student Concerns</div>${s(preview.studentConcerns)}</div>`,
        preview.parentConcerns && `<div class="field-box"><div class="field-label">Parent/Guardian Concerns</div>${s(preview.parentConcerns)}</div>`,
        preview.teamVision && `<div class="field-box"><div class="field-label">Team Vision</div>${s(preview.teamVision)}</div>`,
      ].filter(Boolean).join("") || "<p>No concerns recorded.</p>" },
      { heading: "Present Levels of Academic Achievement and Functional Performance (PLAAFP)", html: [
        preview.plaafpAcademic && `<div class="field-box"><div class="field-label">Academic</div>${s(preview.plaafpAcademic)}</div>`,
        preview.plaafpBehavioral && `<div class="field-box"><div class="field-label">Behavioral</div>${s(preview.plaafpBehavioral)}</div>`,
        preview.plaafpCommunication && `<div class="field-box"><div class="field-label">Communication</div>${s(preview.plaafpCommunication)}</div>`,
        preview.plaafpAdditional && `<div class="field-box"><div class="field-label">Additional</div>${s(preview.plaafpAdditional)}</div>`,
      ].filter(Boolean).join("") || "<p>No PLAAFP data recorded.</p>" },
      { heading: "Services & Modifications", html: [
        preview.scheduleModifications && `<div class="field-box"><div class="field-label">Schedule Modifications</div>${s(preview.scheduleModifications)}</div>`,
        preview.transportationServices && `<div class="field-box"><div class="field-label">Transportation</div>${s(preview.transportationServices)}</div>`,
        preview.esyEligible !== null && preview.esyEligible !== undefined && `<div class="field-box"><div class="field-label">Extended School Year (ESY)</div>${preview.esyEligible ? "Eligible" : "Not Eligible"}${preview.esyServices ? ` — ${s(preview.esyServices)}` : ""}</div>`,
        preview.assessmentParticipation && `<div class="field-box"><div class="field-label">Assessment Participation</div>${s(preview.assessmentParticipation)}</div>`,
      ].filter(Boolean).join("") || "<p>No service details recorded.</p>" },
    ];
    const html = buildDocumentHtml({
      documentTitle: `${iepTypeLabel} — v${preview.version ?? 1}`,
      studentName,
      isDraft: preview.status === "draft",
      sections,
    });
    openPrintWindow(html);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">{iepTypeLabel} — Version {String(preview.version ?? 1)}</p>
        <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={handlePrint}>
          <Printer className="w-3 h-3" /> Print Preview
        </Button>
      </div>
      <MetaRow items={[
        { label: "IEP Start", value: preview.iepStartDate ? fmtDate(String(preview.iepStartDate)) : null },
        { label: "IEP End", value: preview.iepEndDate ? fmtDate(String(preview.iepEndDate)) : null },
        { label: "Meeting Date", value: preview.meetingDate ? fmtDate(String(preview.meetingDate)) : null },
        { label: "Status", value: preview.status ? String(preview.status) : null },
      ]} />
      <div className="space-y-2">
        <PreviewField label="Student Concerns" value={preview.studentConcerns} />
        <PreviewField label="Parent/Guardian Concerns" value={preview.parentConcerns} />
        <PreviewField label="Team Vision" value={preview.teamVision} />
        <PreviewField label="PLAAFP — Academic" value={preview.plaafpAcademic} />
        <PreviewField label="PLAAFP — Behavioral" value={preview.plaafpBehavioral} />
        <PreviewField label="PLAAFP — Communication" value={preview.plaafpCommunication} />
        <PreviewField label="PLAAFP — Additional" value={preview.plaafpAdditional} />
        <PreviewField label="Schedule Modifications" value={preview.scheduleModifications} />
        <PreviewField label="Transportation Services" value={preview.transportationServices} />
        {preview.esyEligible !== null && preview.esyEligible !== undefined && (
          <PreviewField label="Extended School Year (ESY)" value={preview.esyEligible ? `Eligible${preview.esyServices ? ` — ${preview.esyServices}` : ""}` : "Not Eligible"} />
        )}
        <PreviewField label="Assessment Participation" value={preview.assessmentParticipation} />
      </div>
    </div>
  );
}

function EvaluationPreview({ preview, studentName }: { preview: DocumentPreview; studentName: string }) {
  const areas = Array.isArray(preview.evaluationAreas) ? preview.evaluationAreas as { area: string; status: string; summary?: string }[] : [];
  const members = Array.isArray(preview.teamMembers) ? preview.teamMembers as { name: string; role: string; evaluationArea?: string }[] : [];

  function handlePrint() {
    const s = (v: unknown) => esc(String(v ?? ""));
    const areasHtml = areas.length > 0
      ? `<table><thead><tr><th>Area</th><th>Status</th><th>Summary</th></tr></thead><tbody>${areas.map(a =>
          `<tr><td>${s(a.area)}</td><td>${s(a.status)}</td><td>${a.summary ? s(a.summary) : "—"}</td></tr>`
        ).join("")}</tbody></table>`
      : "<p>No evaluation areas recorded.</p>";
    const membersHtml = members.length > 0
      ? `<table><thead><tr><th>Name</th><th>Role</th><th>Area</th></tr></thead><tbody>${members.map(m =>
          `<tr><td>${s(m.name)}</td><td>${s(m.role)}</td><td>${m.evaluationArea ? s(m.evaluationArea) : "—"}</td></tr>`
        ).join("")}</tbody></table>`
      : "<p>No team members recorded.</p>";
    const sections = [
      { heading: "Evaluation Overview", html: `<div class="field-box"><div class="field-label">Type</div>${s(String(preview.evaluationType ?? "").replace(/_/g, " "))}</div>${preview.reportSummary ? `<div class="field-box"><div class="field-label">Report Summary</div>${s(preview.reportSummary)}</div>` : ""}${preview.notes ? `<div class="field-box"><div class="field-label">Notes</div>${s(preview.notes)}</div>` : ""}` },
      { heading: "Evaluation Areas", html: areasHtml },
      { heading: "Team Members", html: membersHtml },
    ];
    const html = buildDocumentHtml({ documentTitle: "Evaluation Report", studentName, isDraft: preview.status === "draft", sections });
    openPrintWindow(html);
  }

  const typeLabel = String(preview.evaluationType ?? "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">{typeLabel} Evaluation</p>
        <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={handlePrint}>
          <Printer className="w-3 h-3" /> Print Preview
        </Button>
      </div>
      <MetaRow items={[
        { label: "Status", value: preview.status },
        { label: "Start", value: preview.startDate ? fmtDate(String(preview.startDate)) : null },
        { label: "Due", value: preview.dueDate ? fmtDate(String(preview.dueDate)) : null },
        { label: "Completed", value: preview.completionDate ? fmtDate(String(preview.completionDate)) : null },
        { label: "Meeting", value: preview.meetingDate ? fmtDate(String(preview.meetingDate)) : null },
      ]} />
      <PreviewField label="Report Summary" value={preview.reportSummary} />
      <PreviewField label="Notes" value={preview.notes} />
      {areas.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Evaluation Areas</p>
          <div className="space-y-1">
            {areas.map((a, i) => (
              <div key={i} className="flex items-start gap-2 p-1.5 bg-white border border-gray-100 rounded text-xs">
                <span className="font-medium text-gray-700 min-w-[100px]">{a.area}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-500 capitalize">{a.status}</span>
                {a.summary && <><span className="text-gray-400">·</span><span className="text-gray-600 flex-1">{a.summary}</span></>}
              </div>
            ))}
          </div>
        </div>
      )}
      {members.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Team Members</p>
          <div className="flex flex-wrap gap-1">
            {members.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 border border-slate-200">
                {m.name} — {m.role}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProgressReportPreview({ preview, studentName }: { preview: DocumentPreview; studentName: string }) {
  const goals = Array.isArray(preview.goalProgress) ? preview.goalProgress as GoalProgressEntry[] : [];
  const services = Array.isArray(preview.serviceBreakdown) ? preview.serviceBreakdown as ServiceDeliveryBreakdown[] : [];

  const progressColors: Record<string, string> = {
    met: "text-emerald-700 bg-emerald-50 border-emerald-200",
    emerging: "text-blue-700 bg-blue-50 border-blue-200",
    insufficient: "text-amber-700 bg-amber-50 border-amber-200",
    regression: "text-red-700 bg-red-50 border-red-200",
    not_started: "text-gray-600 bg-gray-50 border-gray-200",
  };

  function handlePrint() {
    const e = (v: unknown) => esc(String(v ?? ""));
    const goalsHtml = goals.length > 0
      ? `<table><thead><tr><th>#</th><th>Goal Area</th><th>Progress</th><th>Narrative</th></tr></thead><tbody>${goals.map(g =>
          `<tr><td>${e(g.goalNumber)}</td><td>${e(g.goalArea)}</td><td>${e(g.progressCode ?? g.progressRating)}</td><td>${g.narrative ? e(g.narrative) : "—"}</td></tr>`
        ).join("")}</tbody></table>`
      : "<p>No goal progress recorded.</p>";
    const servicesHtml = services.length > 0
      ? `<table><thead><tr><th>Service</th><th>Required Min.</th><th>Delivered Min.</th><th>Compliance</th></tr></thead><tbody>${services.map(s =>
          `<tr><td>${e(s.serviceType)}</td><td>${e(s.requiredMinutes)}</td><td>${e(s.deliveredMinutes)}</td><td>${e(s.compliancePercent)}%</td></tr>`
        ).join("")}</tbody></table>`
      : "";
    const sections = [
      { heading: "Report Summary", html: `${preview.overallSummary ? `<div class="field-box"><div class="field-label">Overall Summary</div>${e(preview.overallSummary)}</div>` : ""}${preview.serviceDeliverySummary ? `<div class="field-box"><div class="field-label">Service Delivery</div>${e(preview.serviceDeliverySummary)}</div>` : ""}${preview.recommendations ? `<div class="field-box"><div class="field-label">Recommendations</div>${e(preview.recommendations)}</div>` : ""}` },
      { heading: "Goal Progress", html: goalsHtml },
      ...(servicesHtml ? [{ heading: "Service Delivery Breakdown", html: servicesHtml }] : []),
      ...(preview.parentNotes ? [{ heading: "Parent Notes", html: `<div class="field-box">${e(preview.parentNotes)}</div>` }] : []),
    ];
    const html = buildDocumentHtml({ documentTitle: "Progress Report", documentSubtitle: e(preview.reportingPeriod), studentName, isDraft: preview.status === "draft", sections });
    openPrintWindow(html);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">Progress Report — {String(preview.reportingPeriod ?? "")}</p>
        <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={handlePrint}>
          <Printer className="w-3 h-3" /> Print Preview
        </Button>
      </div>
      <MetaRow items={[
        { label: "Period", value: preview.periodStart && preview.periodEnd ? `${fmtDate(String(preview.periodStart))} – ${fmtDate(String(preview.periodEnd))}` : null },
        { label: "Status", value: preview.status },
        { label: "Parent Notified", value: preview.parentNotificationDate ? fmtDate(String(preview.parentNotificationDate)) : null },
      ]} />
      <PreviewField label="Overall Summary" value={preview.overallSummary} />
      <PreviewField label="Service Delivery Summary" value={preview.serviceDeliverySummary} />
      <PreviewField label="Recommendations" value={preview.recommendations} />
      <PreviewField label="Parent Notes" value={preview.parentNotes} />
      {goals.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Goal Progress ({goals.length} goals)</p>
          <div className="space-y-1.5">
            {goals.map((g, i) => {
              const colorKey = g.progressCode?.toLowerCase() ?? "not_started";
              const colorClass = progressColors[colorKey] ?? progressColors.not_started;
              return (
                <div key={i} className="p-2 bg-white border border-gray-100 rounded text-xs space-y-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-gray-700">{g.goalArea} — Goal {g.goalNumber}</span>
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border ${colorClass}`}>
                      {g.progressCode ?? g.progressRating ?? "—"}
                    </span>
                  </div>
                  {g.annualGoal && <p className="text-gray-500 text-[10px] line-clamp-2">{g.annualGoal}</p>}
                  {g.narrative && <p className="text-gray-700">{g.narrative}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {services.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Service Delivery</p>
          <div className="space-y-1">
            {services.map((s, i) => (
              <div key={i} className="flex items-center gap-3 p-1.5 bg-white border border-gray-100 rounded text-xs">
                <span className="font-medium text-gray-700 min-w-[120px]">{s.serviceType}</span>
                <span className="text-gray-500">{s.deliveredMinutes}/{s.requiredMinutes} min</span>
                <span className={s.compliancePercent >= 80 ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
                  {s.compliancePercent}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PwnPreview({ preview, studentName }: { preview: DocumentPreview; studentName: string }) {
  function handlePrint() {
    const s = (v: unknown) => esc(String(v ?? ""));
    const sections = [
      { heading: "Action Details", html: [
        `<div class="field-box"><div class="field-label">Action Proposed</div>${s(preview.actionProposed) || "—"}</div>`,
        preview.actionDescription && `<div class="field-box"><div class="field-label">Description</div>${s(preview.actionDescription)}</div>`,
        preview.reasonForAction && `<div class="field-box"><div class="field-label">Reason for Action</div>${s(preview.reasonForAction)}</div>`,
      ].filter(Boolean).join("") },
      { heading: "Options & Considerations", html: [
        preview.optionsConsidered && `<div class="field-box"><div class="field-label">Options Considered</div>${s(preview.optionsConsidered)}</div>`,
        preview.reasonOptionsRejected && `<div class="field-box"><div class="field-label">Reasons for Rejecting Options</div>${s(preview.reasonOptionsRejected)}</div>`,
        preview.evaluationInfo && `<div class="field-box"><div class="field-label">Evaluation Information</div>${s(preview.evaluationInfo)}</div>`,
        preview.otherFactors && `<div class="field-box"><div class="field-label">Other Factors</div>${s(preview.otherFactors)}</div>`,
      ].filter(Boolean).join("") || "<p>None recorded.</p>" },
      ...(preview.notes ? [{ heading: "Notes", html: `<div class="field-box">${s(preview.notes)}</div>` }] : []),
    ];
    const html = buildDocumentHtml({ documentTitle: "Prior Written Notice", documentSubtitle: s(String(preview.noticeType ?? "").replace(/_/g, " ")), studentName, isDraft: preview.status === "draft", sections });
    openPrintWindow(html);
  }

  const noticeTypeLabel = String(preview.noticeType ?? "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">Prior Written Notice — {noticeTypeLabel}</p>
        <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={handlePrint}>
          <Printer className="w-3 h-3" /> Print Preview
        </Button>
      </div>
      <MetaRow items={[
        { label: "Status", value: preview.status },
        { label: "Issued", value: preview.issuedDate ? fmtDate(String(preview.issuedDate)) : null },
        { label: "Parent Response Due", value: preview.parentResponseDueDate ? fmtDate(String(preview.parentResponseDueDate)) : null },
      ]} />
      <PreviewField label="Action Proposed" value={preview.actionProposed} />
      <PreviewField label="Action Description" value={preview.actionDescription} />
      <PreviewField label="Reason for Action" value={preview.reasonForAction} />
      <PreviewField label="Options Considered" value={preview.optionsConsidered} />
      <PreviewField label="Reason Options Rejected" value={preview.reasonOptionsRejected} />
      <PreviewField label="Evaluation Information" value={preview.evaluationInfo} />
      <PreviewField label="Other Factors" value={preview.otherFactors} />
      <PreviewField label="Notes" value={preview.notes} />
    </div>
  );
}

function GenericPreview({ preview }: { preview: DocumentPreview }) {
  return (
    <div className="text-xs text-gray-500 p-3 bg-gray-50 rounded border border-gray-200">
      <p className="font-medium text-gray-700 mb-1 capitalize">{preview.documentType?.toString().replace(/_/g, " ")} #{preview.documentId}</p>
      <p>Inline preview is not available for this document type. Use the print preview or navigate to the document directly.</p>
    </div>
  );
}

export function InlineDocumentViewer({ workflowId, documentType, studentName }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPreview(null);
    setError(null);
    setOpen(false);
  }, [workflowId]);

  useEffect(() => {
    if (!open || preview) return;
    setLoading(true);
    setError(null);
    authFetch(`/api/document-workflow/workflows/${workflowId}/document-preview`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load document preview");
        return res.json() as Promise<DocumentPreview>;
      })
      .then(setPreview)
      .catch(() => setError("Could not load document preview."))
      .finally(() => setLoading(false));
  }, [open, workflowId, preview]);

  const docTypeLabel = documentType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-500" />
          <span>Document Preview — {docTypeLabel}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="p-3 bg-gray-50/50 border-t border-gray-100 max-h-[400px] overflow-y-auto">
          {loading && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
          {preview && !loading && (
            <>
              {preview.documentType === "iep" && <IepPreview preview={preview} studentName={studentName} />}
              {preview.documentType === "evaluation" && <EvaluationPreview preview={preview} studentName={studentName} />}
              {preview.documentType === "progress_report" && <ProgressReportPreview preview={preview} studentName={studentName} />}
              {preview.documentType === "prior_written_notice" && <PwnPreview preview={preview} studentName={studentName} />}
              {!["iep", "evaluation", "progress_report", "prior_written_notice"].includes(preview.documentType) && (
                <GenericPreview preview={preview} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
