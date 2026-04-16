import { db, workflowReviewersTable, schoolsTable, staffTable, studentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { sendEmail } from "../../lib/email";

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

export function sendWorkflowNotification(studentId: number, reviewerEmail: string, reviewerName: string, subject: string, bodyHtml: string) {
  sendEmail({
    studentId,
    type: "general",
    subject,
    bodyHtml,
    toEmail: reviewerEmail,
    toName: reviewerName,
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

    sendWorkflowNotification(
      studentId,
      email,
      reviewer.reviewerName,
      `Trellis: Document needs your review — ${stageLabel}`,
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
          <p style="color:#6b7280;font-size:13px">Log in to Trellis to review and take action.</p>
        </div>
      </div>`,
    );
  }
}

export async function notifyWorkflowCreator(workflow: { createdByUserId: string; createdByName: string; title: string; studentId: number }, action: string, reviewerName: string, comment: string | null, studentName: string, districtId: number) {
  const staffRows = await db.select({ email: staffTable.email })
    .from(staffTable)
    .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
    .where(and(eq(staffTable.externalId, workflow.createdByUserId), eq(schoolsTable.districtId, districtId)));
  const email = staffRows[0]?.email;
  if (!email) return;

  const actionLabel = action === "completed" ? "approved (all stages)" : action === "rejected" ? "rejected" : "returned for changes";

  sendWorkflowNotification(
    workflow.studentId,
    email,
    workflow.createdByName,
    `Trellis: Document ${actionLabel} — ${workflow.title}`,
    `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:${action === "rejected" ? "#dc2626" : action === "completed" ? "#059669" : "#d97706"};color:white;padding:16px 24px;border-radius:8px 8px 0 0">
        <h2 style="margin:0;font-size:18px">Document ${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)}</h2>
      </div>
      <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
        <p>Your document <strong>${workflow.title}</strong> for <strong>${studentName}</strong> has been ${actionLabel} by ${reviewerName}.</p>
        ${comment ? `<p style="margin-top:12px;padding:12px;background:#f3f4f6;border-radius:6px;color:#374151"><em>"${comment}"</em></p>` : ""}
        <p style="color:#6b7280;font-size:13px;margin-top:16px">Log in to Trellis to view details.</p>
      </div>
    </div>`,
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
