import { db, workflowReviewersTable, schoolsTable, staffTable, studentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { sendEmail, getAppBaseUrl } from "../../lib/email";

function buildWorkflowLink(workflowId: number, focus: "review" | "overview"): string | null {
  const base = getAppBaseUrl();
  if (!base) return null;
  return `${base}/document-workflow?workflowId=${workflowId}&focus=${focus}`;
}

function linkButtonHtml(url: string, label: string, color: string): string {
  return `<p style="margin:20px 0"><a href="${url}" style="display:inline-block;background:${color};color:white;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">${label}</a></p>
        <p style="color:#6b7280;font-size:12px;word-break:break-all">Or paste this link into your browser:<br><a href="${url}" style="color:#6b7280">${url}</a></p>`;
}

export const DEFAULT_STAGES = ["draft", "team_review", "director_signoff", "parent_delivery"];
export const VALID_DOC_TYPES = ["iep", "evaluation", "progress_report", "prior_written_notice", "incident_report"];
export const VALID_STATUSES = ["in_progress", "completed", "rejected"];
export const VALID_STAGES = ["draft", "team_review", "director_signoff", "parent_delivery"];
export const STAGE_LABELS: Record<string, string> = {
  draft: "Draft",
  team_review: "Team Review",
  director_signoff: "Director Sign-off",
  parent_delivery: "Parent Delivery",
};

export function getUserInfo(req: AuthedRequest) {
  return {
    userId: req.userId!,
    name: req.displayName || "Unknown",
  };
}

export function parsePositiveInt(val: unknown): number | null {
  const n = typeof val === "number" ? val : parseInt(String(val), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function assertStudentInDistrict(studentId: number, districtId: number): Promise<{ id: number; firstName: string; lastName: string } | null> {
  const [student] = await db.select({
    id: studentsTable.id,
    firstName: studentsTable.firstName,
    lastName: studentsTable.lastName,
  }).from(studentsTable)
    .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .where(and(eq(studentsTable.id, studentId), eq(schoolsTable.districtId, districtId)));
  return student || null;
}

import { iepDocumentsTable, evaluationsTable, progressReportsTable, priorWrittenNoticesTable } from "@workspace/db";

export async function validateDocumentExists(
  documentType: string,
  documentId: number,
  studentId: number,
): Promise<{ exists: boolean; error?: string }> {
  try {
    switch (documentType) {
      case "iep": {
        const [doc] = await db.select({ id: iepDocumentsTable.id }).from(iepDocumentsTable)
          .where(and(eq(iepDocumentsTable.id, documentId), eq(iepDocumentsTable.studentId, studentId)));
        if (!doc) return { exists: false, error: "IEP document not found for this student" };
        break;
      }
      case "evaluation": {
        const [doc] = await db.select({ id: evaluationsTable.id }).from(evaluationsTable)
          .where(and(eq(evaluationsTable.id, documentId), eq(evaluationsTable.studentId, studentId)));
        if (!doc) return { exists: false, error: "Evaluation not found for this student" };
        break;
      }
      case "progress_report": {
        const [doc] = await db.select({ id: progressReportsTable.id }).from(progressReportsTable)
          .where(and(eq(progressReportsTable.id, documentId), eq(progressReportsTable.studentId, studentId)));
        if (!doc) return { exists: false, error: "Progress report not found for this student" };
        break;
      }
      case "prior_written_notice": {
        const [doc] = await db.select({ id: priorWrittenNoticesTable.id }).from(priorWrittenNoticesTable)
          .where(and(eq(priorWrittenNoticesTable.id, documentId), eq(priorWrittenNoticesTable.studentId, studentId)));
        if (!doc) return { exists: false, error: "Prior Written Notice not found for this student" };
        break;
      }
      default:
        return { exists: true };
    }
    return { exists: true };
  } catch {
    return { exists: false, error: "Failed to validate document" };
  }
}

export function sendWorkflowNotification(
  studentId: number,
  reviewerEmail: string,
  reviewerName: string,
  subject: string,
  bodyHtml: string,
  meta: { workflowId: number; stage: string; kind: "reviewer_assigned" | "creator_update" },
) {
  sendEmail({
    studentId,
    type: "general",
    subject,
    bodyHtml,
    toEmail: reviewerEmail,
    toName: reviewerName,
    metadata: {
      workflowId: meta.workflowId,
      workflowStage: meta.stage,
      workflowNotificationKind: meta.kind,
    },
  }).catch(err => {
    console.error("[DocumentWorkflow] Notification failed:", err);
  });
}

export async function notifyReviewersForStage(workflowId: number, stage: string, workflowTitle: string, studentId: number, studentName: string, districtId: number) {
  const reviewers = await db.select().from(workflowReviewersTable)
    .where(and(eq(workflowReviewersTable.workflowId, workflowId), eq(workflowReviewersTable.stage, stage)));

  if (reviewers.length === 0) return;

  const stageLabel = STAGE_LABELS[stage] || stage;

  for (const reviewer of reviewers) {
    const staffRows = await db.select({ email: staffTable.email })
      .from(staffTable)
      .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
      .where(and(eq(staffTable.externalId, reviewer.reviewerUserId), eq(schoolsTable.districtId, districtId)));
    const email = staffRows[0]?.email;
    if (!email) continue;

    const link = buildWorkflowLink(workflowId, "review");
    sendWorkflowNotification(
      studentId,
      email,
      reviewer.reviewerName,
      `Noverta: Document needs your review — ${stageLabel}`,
      `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#059669;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0;font-size:18px">Document Review Required</h2>
        </div>
        <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
          <p>A document requires your review at the <strong>${stageLabel}</strong> stage.</p>
          <ul style="color:#374151">
            <li><strong>Document:</strong> ${workflowTitle}</li>
            <li><strong>Student:</strong> ${studentName}</li>
            <li><strong>Stage:</strong> ${stageLabel}</li>
          </ul>
          ${link ? linkButtonHtml(link, "Review document", "#059669") : `<p style="color:#6b7280;font-size:13px">Log in to Noverta to review and take action.</p>`}
        </div>
      </div>`,
      { workflowId, stage, kind: "reviewer_assigned" },
    );
  }
}

export async function notifyWorkflowCreator(workflow: { id: number; createdByUserId: string; createdByName: string; title: string; studentId: number; currentStage: string }, action: string, reviewerName: string, comment: string | null, studentName: string, districtId: number) {
  const staffRows = await db.select({ email: staffTable.email })
    .from(staffTable)
    .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
    .where(and(eq(staffTable.externalId, workflow.createdByUserId), eq(schoolsTable.districtId, districtId)));
  const email = staffRows[0]?.email;
  if (!email) return;

  const actionLabel = action === "completed" ? "approved (all stages)" : action === "rejected" ? "rejected" : "returned for changes";
  const headerColor = action === "rejected" ? "#dc2626" : action === "completed" ? "#059669" : "#d97706";
  const link = buildWorkflowLink(workflow.id, "overview");

  sendWorkflowNotification(
    workflow.studentId,
    email,
    workflow.createdByName,
    `Noverta: Document ${actionLabel} — ${workflow.title}`,
    `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:${headerColor};color:white;padding:16px 24px;border-radius:8px 8px 0 0">
        <h2 style="margin:0;font-size:18px">Document ${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)}</h2>
      </div>
      <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
        <p>Your document <strong>${workflow.title}</strong> for <strong>${studentName}</strong> has been ${actionLabel} by ${reviewerName}.</p>
        ${comment ? `<p style="margin-top:12px;padding:12px;background:#f3f4f6;border-radius:6px;color:#374151"><em>"${comment}"</em></p>` : ""}
        ${link ? linkButtonHtml(link, "View document workflow", headerColor) : `<p style="color:#6b7280;font-size:13px;margin-top:16px">Log in to Noverta to view details.</p>`}
      </div>
    </div>`,
    { workflowId: workflow.id, stage: workflow.currentStage, kind: "creator_update" },
  );
}

export async function checkReviewerAuth(workflowId: number, stage: string, userId: string): Promise<boolean> {
  const reviewers = await db.select().from(workflowReviewersTable)
    .where(and(
      eq(workflowReviewersTable.workflowId, workflowId),
      eq(workflowReviewersTable.stage, stage),
    ));
  if (reviewers.length === 0) return true;
  return reviewers.some(r => r.reviewerUserId === userId);
}
