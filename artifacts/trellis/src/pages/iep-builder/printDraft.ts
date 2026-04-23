import { saveGeneratedDocument, buildDocumentHtml, openPrintWindow, esc as escDoc, fetchDistrictLogoUrl, type DocumentSection } from "@/lib/print-document";
import type { GeneratedDraft } from "./types";

export async function printDraft(draft: GeneratedDraft, studentId: number) {
  const districtLogoUrl = await fetchDistrictLogoUrl();
  const goalRows = draft.goalRecommendations.map(g => {
    const a = g.recommendation;
    return `<tr>
      <td style="font-weight:bold">${escDoc(String(g.goalNumber))}</td>
      <td>${escDoc(g.goalArea)}</td>
      <td>${escDoc(g.progressCode)}</td>
      <td>${escDoc(g.currentPerformance)}</td>
      <td style="font-style:italic">${escDoc(a.action.toUpperCase())}</td>
      <td>${escDoc(a.suggestedGoal)}</td>
      <td>${escDoc(a.suggestedCriterion)}</td>
    </tr>`;
  }).join("");

  const svcRows = draft.serviceRecommendations.map(s => `<tr>
    <td>${escDoc(s.serviceType ?? "")}</td>
    <td style="text-align:center">${s.currentMinutes ?? "—"} min/${escDoc(s.currentInterval ?? "")}</td>
    <td style="text-align:center">${s.compliancePercent}%</td>
    <td style="font-style:italic">${escDoc(s.action.toUpperCase())}</td>
    <td>${escDoc(s.rationale)}</td>
  </tr>`).join("");

  const plaafpHtml = [
    draft.plaafp.academic ? `<div class="field-box"><div class="field-label">Academic Performance</div>${escDoc(draft.plaafp.academic)}</div>` : "",
    draft.plaafp.behavioral ? `<div class="field-box"><div class="field-label">Behavioral / Functional</div>${escDoc(draft.plaafp.behavioral)}</div>` : "",
    draft.plaafp.communication ? `<div class="field-box"><div class="field-label">Communication</div>${escDoc(draft.plaafp.communication)}</div>` : "",
    draft.plaafp.parentInput ? `<div class="field-box"><div class="field-label">Parent/Guardian Input</div>${escDoc(draft.plaafp.parentInput)}</div>` : "",
    draft.plaafp.studentVoice ? `<div class="field-box"><div class="field-label">Student Voice</div>${escDoc(draft.plaafp.studentVoice)}</div>` : "",
  ].filter(Boolean).join("");

  const sections: DocumentSection[] = [
    {
      heading: "Present Levels of Academic Achievement and Functional Performance (PLAAFP)",
      html: plaafpHtml || "<p>No PLAAFP data available.</p>",
    },
    {
      heading: `Goal Recommendations for ${escDoc(draft.generatedFor)}`,
      html: `<table>
        <thead><tr><th>#</th><th>Area</th><th>Code</th><th>Current Performance</th><th>Action</th><th>Suggested Goal</th><th>Criterion</th></tr></thead>
        <tbody>${goalRows}</tbody>
      </table>`,
    },
    ...(draft.additionalGoalSuggestions?.length > 0 ? [{
      heading: "Additional Goal Suggestions",
      html: draft.additionalGoalSuggestions.map(s => `
        <div class="field-box"><div class="field-label">${escDoc(s.goalArea)} <small>(${escDoc(s.source)})</small></div>
        ${escDoc(s.suggestedGoal)}<br><em style="color:#6b7280">${escDoc(s.rationale)}</em></div>
      `).join(""),
    } as DocumentSection] : []),
    {
      heading: "Service Recommendations",
      html: `<table>
        <thead><tr><th>Service</th><th>Current</th><th>Compliance</th><th>Action</th><th>Rationale</th></tr></thead>
        <tbody>${svcRows}</tbody>
      </table>`,
    },
    ...(draft.accommodationRecommendations?.length > 0 ? [{
      heading: "Accommodations",
      html: draft.accommodationRecommendations.map(a =>
        `<div style="margin:3px 0">• <strong>${escDoc(a.description)}</strong> (${escDoc(a.category)}) — ${escDoc(a.action)}</div>`
      ).join(""),
    } as DocumentSection] : []),
    ...(draft.transitionPlan ? [{
      heading: "Transition Planning",
      html: [
        ...Object.entries(draft.transitionPlan.domains || {}).map(([domain, d]) =>
          `<div class="field-box">
            <div class="field-label">${escDoc(domain)}</div>
            <div><strong>Post-Secondary Goal:</strong> ${escDoc(d.goal)}</div>
            <div><strong>Transition Services:</strong> ${escDoc(d.services)}</div>
            ${d.assessment ? `<div><strong>Assessment:</strong> ${escDoc(d.assessment)}</div>` : ""}
          </div>`
        ),
        draft.transitionPlan.agencyLinkages ? `<div class="field-box"><div class="field-label">Agency Linkages</div>${escDoc(draft.transitionPlan.agencyLinkages)}</div>` : "",
      ].filter(Boolean).join(""),
    } as DocumentSection] : []),
    ...(draft.teamDiscussionNotes?.length > 0 ? [{
      heading: "IEP Team Discussion Items",
      html: draft.teamDiscussionNotes.map(n =>
        `<div style="background:#eff6ff;padding:8px 12px;border-radius:4px;border-left:3px solid #3b82f6;margin:4px 0;font-size:11px">• ${escDoc(n)}</div>`
      ).join(""),
    } as DocumentSection] : []),
    {
      heading: "Important Notice",
      html: `<div class="notice-box"><strong>⚠ DRAFT ONLY:</strong> ${escDoc(draft.disclaimer)}</div>`,
    },
  ];

  const html = buildDocumentHtml({
    documentTitle: "IEP Annual Review — Draft Recommendations",
    documentSubtitle: `School Year: ${escDoc(draft.generatedFor)} · IEP Period: ${escDoc(draft.iepStartDate)} to ${escDoc(draft.iepEndDate)}`,
    studentName: draft.studentName,
    districtLogoUrl,
    isDraft: true,
    watermark: "DRAFT",
    generatedDate: new Date(draft.generatedAt).toLocaleDateString(),
    sections,
    signatureLines: [
      "Case Manager / Date",
      "Parent/Guardian / Date",
      "Special Education Director / Date",
    ],
    footerHtml: `<p style="margin:3px 0">This document is a DRAFT assembled by the Noverta IEP Annual Review Draft Builder from existing IEP goals, services, and progress data. It is a starting point only — it requires review, edits, and approval by the full IEP team before becoming a final document. Do not distribute to families without team review.</p>`,
  });

  openPrintWindow(html);
  saveGeneratedDocument({
    studentId,
    type: "iep_draft",
    title: `IEP Annual Review Draft — ${draft.generatedFor ?? String(new Date().getFullYear())}`,
    htmlSnapshot: html,
    status: "draft",
  });
}
