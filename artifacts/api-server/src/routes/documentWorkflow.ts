import { Router } from "express";
import { db, documentVersionsTable, approvalWorkflowsTable, workflowApprovalsTable, workflowReviewersTable, iepDocumentsTable, priorWrittenNoticesTable, studentsTable, teamMeetingsTable, iepGoalsTable, iepMeetingAttendeesTable, schoolsTable, staffTable, progressReportsTable, evaluationsTable } from "@workspace/db";
import { eq, and, desc, SQL, sql } from "drizzle-orm";
import { getEnforcedDistrictId, type AuthedRequest } from "../middlewares/auth";
import { logAudit } from "../lib/auditLog";
import { sendEmail } from "../lib/email";

const router = Router();

const DEFAULT_STAGES = ["draft", "team_review", "director_signoff", "parent_delivery"];
const VALID_DOC_TYPES = ["iep", "evaluation", "progress_report", "prior_written_notice", "incident_report"];
const VALID_STATUSES = ["in_progress", "completed", "rejected"];
const VALID_STAGES = ["draft", "team_review", "director_signoff", "parent_delivery"];
const STAGE_LABELS: Record<string, string> = {
  draft: "Draft",
  team_review: "Team Review",
  director_signoff: "Director Sign-off",
  parent_delivery: "Parent Delivery",
};

function getUserInfo(req: AuthedRequest) {
  return {
    userId: req.userId!,
    name: req.displayName || "Unknown",
  };
}

async function validateDocumentExists(
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

function parsePositiveInt(val: unknown): number | null {
  const n = typeof val === "number" ? val : parseInt(String(val), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function assertStudentInDistrict(studentId: number, districtId: number): Promise<{ id: number; firstName: string; lastName: string } | null> {
  const [student] = await db.select({
    id: studentsTable.id,
    firstName: studentsTable.firstName,
    lastName: studentsTable.lastName,
  }).from(studentsTable)
    .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .where(and(eq(studentsTable.id, studentId), eq(schoolsTable.districtId, districtId)));
  return student || null;
}

function sendWorkflowNotification(studentId: number, reviewerEmail: string, reviewerName: string, subject: string, bodyHtml: string) {
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

async function notifyReviewersForStage(workflowId: number, stage: string, workflowTitle: string, studentId: number, studentName: string, districtId: number) {
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

async function notifyWorkflowCreator(workflow: { createdByUserId: string; createdByName: string; title: string; studentId: number }, action: string, reviewerName: string, comment: string | null, studentName: string, districtId: number) {
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

router.get("/document-workflow/versions/:documentType/:documentId", async (req, res) => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (!districtId) return res.status(403).json({ error: "No district scope" });
  const { documentType } = req.params;
  const docId = parsePositiveInt(req.params.documentId);
  if (!docId) return res.status(400).json({ error: "Invalid document ID" });

  const versions = await db.select().from(documentVersionsTable)
    .where(and(
      eq(documentVersionsTable.documentType, documentType),
      eq(documentVersionsTable.documentId, docId),
      eq(documentVersionsTable.districtId, districtId),
    ))
    .orderBy(desc(documentVersionsTable.versionNumber));

  res.json(versions);
});

router.post("/document-workflow/versions", async (req, res) => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (!districtId) return res.status(403).json({ error: "No district scope" });
  const user = getUserInfo(req as AuthedRequest);
  const { documentType, title, changeDescription, snapshotData } = req.body;
  const documentId = parsePositiveInt(req.body.documentId);
  const studentId = parsePositiveInt(req.body.studentId);

  if (!documentType || !documentId || !studentId || !title) {
    return res.status(400).json({ error: "Missing required fields: documentType, documentId, studentId, title" });
  }
  if (!VALID_DOC_TYPES.includes(documentType)) {
    return res.status(400).json({ error: `Invalid documentType. Must be one of: ${VALID_DOC_TYPES.join(", ")}` });
  }
  if (typeof title !== "string" || title.length > 500) {
    return res.status(400).json({ error: "Title must be a string under 500 characters" });
  }

  const student = await assertStudentInDistrict(studentId, districtId);
  if (!student) return res.status(404).json({ error: "Student not found in your district" });

  const existing = await db.select({ max: sql<number>`COALESCE(MAX(${documentVersionsTable.versionNumber}), 0)` })
    .from(documentVersionsTable)
    .where(and(
      eq(documentVersionsTable.documentType, documentType),
      eq(documentVersionsTable.documentId, documentId),
      eq(documentVersionsTable.districtId, districtId),
    ));

  const nextVersion = (existing[0]?.max ?? 0) + 1;

  const [version] = await db.insert(documentVersionsTable).values({
    documentType,
    documentId,
    studentId,
    districtId,
    versionNumber: nextVersion,
    title,
    changeDescription: typeof changeDescription === "string" ? changeDescription.slice(0, 2000) : null,
    snapshotData: typeof snapshotData === "string" ? snapshotData : null,
    authorUserId: user.userId,
    authorName: user.name,
  }).returning();

  logAudit(req, {
    action: "create",
    targetTable: "document_versions",
    targetId: version.id,
    studentId,
    summary: `Created version ${nextVersion} for ${documentType} #${documentId}`,
  });

  res.status(201).json(version);
});

router.get("/document-workflow/workflows", async (req, res) => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (!districtId) return res.status(403).json({ error: "No district scope" });

  const conditions: SQL[] = [eq(approvalWorkflowsTable.districtId, districtId)];

  if (req.query.status) {
    const s = req.query.status as string;
    if (!VALID_STATUSES.includes(s)) return res.status(400).json({ error: "Invalid status filter" });
    conditions.push(eq(approvalWorkflowsTable.status, s));
  }
  if (req.query.currentStage) {
    const s = req.query.currentStage as string;
    if (!VALID_STAGES.includes(s)) return res.status(400).json({ error: "Invalid stage filter" });
    conditions.push(eq(approvalWorkflowsTable.currentStage, s));
  }
  if (req.query.studentId) {
    const sid = parsePositiveInt(req.query.studentId);
    if (!sid) return res.status(400).json({ error: "Invalid studentId filter" });
    conditions.push(eq(approvalWorkflowsTable.studentId, sid));
  }

  const workflows = await db.select({
    id: approvalWorkflowsTable.id,
    documentType: approvalWorkflowsTable.documentType,
    documentId: approvalWorkflowsTable.documentId,
    studentId: approvalWorkflowsTable.studentId,
    title: approvalWorkflowsTable.title,
    currentStage: approvalWorkflowsTable.currentStage,
    stages: approvalWorkflowsTable.stages,
    status: approvalWorkflowsTable.status,
    createdByName: approvalWorkflowsTable.createdByName,
    completedAt: approvalWorkflowsTable.completedAt,
    createdAt: approvalWorkflowsTable.createdAt,
    updatedAt: approvalWorkflowsTable.updatedAt,
    studentFirstName: studentsTable.firstName,
    studentLastName: studentsTable.lastName,
  })
    .from(approvalWorkflowsTable)
    .leftJoin(studentsTable, eq(approvalWorkflowsTable.studentId, studentsTable.id))
    .where(and(...conditions))
    .orderBy(desc(approvalWorkflowsTable.updatedAt));

  res.json(workflows);
});

router.get("/document-workflow/workflows/:id", async (req, res) => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (!districtId) return res.status(403).json({ error: "No district scope" });
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid workflow ID" });

  const [workflow] = await db.select({
    id: approvalWorkflowsTable.id,
    documentType: approvalWorkflowsTable.documentType,
    documentId: approvalWorkflowsTable.documentId,
    studentId: approvalWorkflowsTable.studentId,
    title: approvalWorkflowsTable.title,
    currentStage: approvalWorkflowsTable.currentStage,
    stages: approvalWorkflowsTable.stages,
    status: approvalWorkflowsTable.status,
    createdByUserId: approvalWorkflowsTable.createdByUserId,
    createdByName: approvalWorkflowsTable.createdByName,
    completedAt: approvalWorkflowsTable.completedAt,
    createdAt: approvalWorkflowsTable.createdAt,
    updatedAt: approvalWorkflowsTable.updatedAt,
    studentFirstName: studentsTable.firstName,
    studentLastName: studentsTable.lastName,
  })
    .from(approvalWorkflowsTable)
    .leftJoin(studentsTable, eq(approvalWorkflowsTable.studentId, studentsTable.id))
    .where(and(
      eq(approvalWorkflowsTable.id, id),
      eq(approvalWorkflowsTable.districtId, districtId),
    ));

  if (!workflow) return res.status(404).json({ error: "Workflow not found" });

  const [approvals, reviewers] = await Promise.all([
    db.select().from(workflowApprovalsTable)
      .where(eq(workflowApprovalsTable.workflowId, id))
      .orderBy(desc(workflowApprovalsTable.createdAt)),
    db.select().from(workflowReviewersTable)
      .where(eq(workflowReviewersTable.workflowId, id)),
  ]);

  res.json({ ...workflow, approvals, reviewers });
});

router.post("/document-workflow/workflows", async (req, res) => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (!districtId) return res.status(403).json({ error: "No district scope" });
  const user = getUserInfo(req as AuthedRequest);
  const { documentType, title, stages, reviewers } = req.body;
  const documentId = parsePositiveInt(req.body.documentId);
  const studentId = parsePositiveInt(req.body.studentId);

  if (!documentType || !documentId || !studentId || !title) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  if (!VALID_DOC_TYPES.includes(documentType)) {
    return res.status(400).json({ error: `Invalid documentType. Must be one of: ${VALID_DOC_TYPES.join(", ")}` });
  }
  if (typeof title !== "string" || title.length > 500) {
    return res.status(400).json({ error: "Title must be a string under 500 characters" });
  }

  const student = await assertStudentInDistrict(studentId, districtId);
  if (!student) return res.status(404).json({ error: "Student not found in your district" });

  const docCheck = await validateDocumentExists(documentType, documentId, studentId);
  if (!docCheck.exists) return res.status(404).json({ error: docCheck.error || "Document not found for this student" });

  const workflowStages = Array.isArray(stages) && stages.length > 0 && stages.every((s: unknown) => typeof s === "string" && VALID_STAGES.includes(s))
    ? (stages as string[])
    : DEFAULT_STAGES;

  const [workflow] = await db.insert(approvalWorkflowsTable).values({
    documentType,
    documentId,
    studentId,
    districtId,
    title,
    currentStage: workflowStages[0],
    stages: workflowStages,
    status: "in_progress",
    createdByUserId: user.userId,
    createdByName: user.name,
  }).returning();

  if (Array.isArray(reviewers) && reviewers.length > 0) {
    const validReviewers = reviewers.filter(
      (r: unknown): r is { stage: string; userId: string; name: string } =>
        typeof r === "object" && r !== null &&
        typeof (r as Record<string, unknown>).stage === "string" &&
        VALID_STAGES.includes((r as Record<string, unknown>).stage as string) &&
        typeof (r as Record<string, unknown>).userId === "string" &&
        typeof (r as Record<string, unknown>).name === "string"
    );
    if (validReviewers.length > 0) {
      await db.insert(workflowReviewersTable).values(
        validReviewers.map(r => ({
          workflowId: workflow.id,
          stage: r.stage,
          reviewerUserId: r.userId,
          reviewerName: r.name,
        })),
      );
    }
  }

  const studentName = `${student.firstName} ${student.lastName}`;
  notifyReviewersForStage(workflow.id, workflowStages[0], title, studentId, studentName, districtId);

  logAudit(req, {
    action: "create",
    targetTable: "approval_workflows",
    targetId: workflow.id,
    studentId,
    summary: `Started approval workflow for ${documentType} #${documentId}`,
  });

  res.status(201).json(workflow);
});

async function checkReviewerAuth(workflowId: number, stage: string, userId: string): Promise<boolean> {
  const reviewers = await db.select().from(workflowReviewersTable)
    .where(and(
      eq(workflowReviewersTable.workflowId, workflowId),
      eq(workflowReviewersTable.stage, stage),
    ));
  if (reviewers.length === 0) return true;
  return reviewers.some(r => r.reviewerUserId === userId);
}

router.post("/document-workflow/workflows/:id/approve", async (req, res) => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (!districtId) return res.status(403).json({ error: "No district scope" });
  const user = getUserInfo(req as AuthedRequest);
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid workflow ID" });
  const comment = typeof req.body.comment === "string" ? req.body.comment.slice(0, 2000) : null;

  const [workflow] = await db.select().from(approvalWorkflowsTable)
    .where(and(eq(approvalWorkflowsTable.id, id), eq(approvalWorkflowsTable.districtId, districtId)));
  if (!workflow) return res.status(404).json({ error: "Workflow not found" });
  if (workflow.status !== "in_progress") return res.status(400).json({ error: "Workflow is not in progress" });

  const authorized = await checkReviewerAuth(id, workflow.currentStage, user.userId);
  if (!authorized) return res.status(403).json({ error: "You are not assigned as a reviewer for this stage" });

  const stages = workflow.stages as string[];
  const currentIdx = stages.indexOf(workflow.currentStage);
  const isLastStage = currentIdx >= stages.length - 1;

  const parentCommentId = parsePositiveInt(req.body.parentCommentId) || null;

  await db.insert(workflowApprovalsTable).values({
    workflowId: id,
    stage: workflow.currentStage,
    action: "approved",
    reviewerUserId: user.userId,
    reviewerName: user.name,
    comment,
    parentCommentId,
  });

  const student = await assertStudentInDistrict(workflow.studentId, districtId);
  const studentName = student ? `${student.firstName} ${student.lastName}` : "Unknown";

  if (isLastStage) {
    await db.update(approvalWorkflowsTable)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(approvalWorkflowsTable.id, id));
    notifyWorkflowCreator(workflow, "completed", user.name, comment, studentName, districtId);
  } else {
    const nextStage = stages[currentIdx + 1];
    await db.update(approvalWorkflowsTable)
      .set({ currentStage: nextStage })
      .where(eq(approvalWorkflowsTable.id, id));
    notifyReviewersForStage(id, nextStage, workflow.title, workflow.studentId, studentName, districtId);
  }

  logAudit(req, {
    action: "update",
    targetTable: "approval_workflows",
    targetId: id,
    studentId: workflow.studentId,
    summary: `Approved stage "${workflow.currentStage}" of workflow #${id}`,
  });

  const [updated] = await db.select().from(approvalWorkflowsTable).where(eq(approvalWorkflowsTable.id, id));
  res.json(updated);
});

router.post("/document-workflow/workflows/:id/reject", async (req, res) => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (!districtId) return res.status(403).json({ error: "No district scope" });
  const user = getUserInfo(req as AuthedRequest);
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid workflow ID" });
  const comment = typeof req.body.comment === "string" ? req.body.comment.slice(0, 2000) : null;

  const [workflow] = await db.select().from(approvalWorkflowsTable)
    .where(and(eq(approvalWorkflowsTable.id, id), eq(approvalWorkflowsTable.districtId, districtId)));
  if (!workflow) return res.status(404).json({ error: "Workflow not found" });
  if (workflow.status !== "in_progress") return res.status(400).json({ error: "Workflow is not in progress" });

  const authorized = await checkReviewerAuth(id, workflow.currentStage, user.userId);
  if (!authorized) return res.status(403).json({ error: "You are not assigned as a reviewer for this stage" });

  const parentCommentId = parsePositiveInt(req.body.parentCommentId) || null;

  await db.insert(workflowApprovalsTable).values({
    workflowId: id,
    stage: workflow.currentStage,
    action: "rejected",
    reviewerUserId: user.userId,
    reviewerName: user.name,
    comment,
    parentCommentId,
  });

  await db.update(approvalWorkflowsTable)
    .set({ status: "rejected" })
    .where(eq(approvalWorkflowsTable.id, id));

  const student = await assertStudentInDistrict(workflow.studentId, districtId);
  const studentName = student ? `${student.firstName} ${student.lastName}` : "Unknown";
  notifyWorkflowCreator(workflow, "rejected", user.name, comment, studentName, districtId);

  logAudit(req, {
    action: "update",
    targetTable: "approval_workflows",
    targetId: id,
    studentId: workflow.studentId,
    summary: `Rejected workflow #${id} at stage "${workflow.currentStage}"`,
  });

  const [updated] = await db.select().from(approvalWorkflowsTable).where(eq(approvalWorkflowsTable.id, id));
  res.json(updated);
});

router.post("/document-workflow/workflows/:id/request-changes", async (req, res) => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (!districtId) return res.status(403).json({ error: "No district scope" });
  const user = getUserInfo(req as AuthedRequest);
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid workflow ID" });
  const comment = typeof req.body.comment === "string" ? req.body.comment.trim() : "";

  if (!comment) return res.status(400).json({ error: "Comment is required when requesting changes" });

  const [workflow] = await db.select().from(approvalWorkflowsTable)
    .where(and(eq(approvalWorkflowsTable.id, id), eq(approvalWorkflowsTable.districtId, districtId)));
  if (!workflow) return res.status(404).json({ error: "Workflow not found" });
  if (workflow.status !== "in_progress") return res.status(400).json({ error: "Workflow is not in progress" });

  const authorized = await checkReviewerAuth(id, workflow.currentStage, user.userId);
  if (!authorized) return res.status(403).json({ error: "You are not assigned as a reviewer for this stage" });

  const stages = workflow.stages as string[];
  const parentCommentId = parsePositiveInt(req.body.parentCommentId) || null;

  await db.insert(workflowApprovalsTable).values({
    workflowId: id,
    stage: workflow.currentStage,
    action: "changes_requested",
    reviewerUserId: user.userId,
    reviewerName: user.name,
    comment: comment.slice(0, 2000),
    parentCommentId,
  });

  await db.update(approvalWorkflowsTable)
    .set({ currentStage: stages[0] })
    .where(eq(approvalWorkflowsTable.id, id));

  const student = await assertStudentInDistrict(workflow.studentId, districtId);
  const studentName = student ? `${student.firstName} ${student.lastName}` : "Unknown";
  notifyWorkflowCreator(workflow, "changes_requested", user.name, comment, studentName, districtId);
  notifyReviewersForStage(id, stages[0], workflow.title, workflow.studentId, studentName, districtId);

  logAudit(req, {
    action: "update",
    targetTable: "approval_workflows",
    targetId: id,
    studentId: workflow.studentId,
    summary: `Requested changes on workflow #${id} at stage "${workflow.currentStage}"`,
  });

  const [updated] = await db.select().from(approvalWorkflowsTable).where(eq(approvalWorkflowsTable.id, id));
  res.json(updated);
});

router.get("/document-workflow/dashboard/summary", async (req, res) => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (!districtId) return res.status(403).json({ error: "No district scope" });

  const rows = await db.select({
    currentStage: approvalWorkflowsTable.currentStage,
    status: approvalWorkflowsTable.status,
    count: sql<number>`count(*)::int`,
  })
    .from(approvalWorkflowsTable)
    .where(eq(approvalWorkflowsTable.districtId, districtId))
    .groupBy(approvalWorkflowsTable.currentStage, approvalWorkflowsTable.status);

  const summary: Record<string, number> = {};
  let totalActive = 0;
  let totalCompleted = 0;
  let totalRejected = 0;

  for (const row of rows) {
    if (row.status === "in_progress") {
      summary[row.currentStage] = (summary[row.currentStage] || 0) + row.count;
      totalActive += row.count;
    } else if (row.status === "completed") {
      totalCompleted += row.count;
    } else if (row.status === "rejected") {
      totalRejected += row.count;
    }
  }

  const agingRows = await db.select({
    id: approvalWorkflowsTable.id,
    title: approvalWorkflowsTable.title,
    currentStage: approvalWorkflowsTable.currentStage,
    updatedAt: approvalWorkflowsTable.updatedAt,
    daysInStage: sql<number>`EXTRACT(DAY FROM NOW() - ${approvalWorkflowsTable.updatedAt})::int`,
  })
    .from(approvalWorkflowsTable)
    .where(and(
      eq(approvalWorkflowsTable.districtId, districtId),
      eq(approvalWorkflowsTable.status, "in_progress"),
      sql`${approvalWorkflowsTable.updatedAt} < NOW() - INTERVAL '3 days'`,
    ))
    .orderBy(approvalWorkflowsTable.updatedAt);

  res.json({ byStage: summary, totalActive, totalCompleted, totalRejected, aging: agingRows });
});

router.post("/document-workflow/workflows/:id/reviewers", async (req, res) => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (!districtId) return res.status(403).json({ error: "No district scope" });
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid workflow ID" });

  const [workflow] = await db.select().from(approvalWorkflowsTable)
    .where(and(eq(approvalWorkflowsTable.id, id), eq(approvalWorkflowsTable.districtId, districtId)));
  if (!workflow) return res.status(404).json({ error: "Workflow not found" });

  const { stage, userId, name } = req.body;
  if (!stage || !userId || !name) return res.status(400).json({ error: "stage, userId, and name are required" });
  if (!VALID_STAGES.includes(stage)) return res.status(400).json({ error: "Invalid stage" });

  const [reviewer] = await db.insert(workflowReviewersTable).values({
    workflowId: id,
    stage,
    reviewerUserId: userId,
    reviewerName: name,
  }).returning();

  logAudit(req, {
    action: "create",
    targetTable: "workflow_reviewers",
    targetId: reviewer.id,
    studentId: workflow.studentId,
    summary: `Assigned ${name} as reviewer for stage "${stage}" on workflow #${id}`,
  });

  res.status(201).json(reviewer);
});

router.post("/document-workflow/workflows/:id/comments", async (req, res) => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (!districtId) return res.status(403).json({ error: "No district scope" });
  const user = getUserInfo(req as AuthedRequest);
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid workflow ID" });

  const comment = typeof req.body.comment === "string" ? req.body.comment.trim() : "";
  if (!comment) return res.status(400).json({ error: "Comment text is required" });

  const [workflow] = await db.select().from(approvalWorkflowsTable)
    .where(and(eq(approvalWorkflowsTable.id, id), eq(approvalWorkflowsTable.districtId, districtId)));
  if (!workflow) return res.status(404).json({ error: "Workflow not found" });

  const parentCommentId = parsePositiveInt(req.body.parentCommentId) || null;

  if (parentCommentId) {
    const [parent] = await db.select({ id: workflowApprovalsTable.id })
      .from(workflowApprovalsTable)
      .where(and(eq(workflowApprovalsTable.id, parentCommentId), eq(workflowApprovalsTable.workflowId, id)));
    if (!parent) return res.status(404).json({ error: "Parent comment not found" });
  }

  const [entry] = await db.insert(workflowApprovalsTable).values({
    workflowId: id,
    stage: workflow.currentStage,
    action: "comment",
    reviewerUserId: user.userId,
    reviewerName: user.name,
    comment: comment.slice(0, 2000),
    parentCommentId,
  }).returning();

  res.status(201).json(entry);
});

router.post("/document-workflow/generate-pwn", async (req, res) => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (!districtId) return res.status(403).json({ error: "No district scope" });
  const user = getUserInfo(req as AuthedRequest);
  const studentId = parsePositiveInt(req.body.studentId);
  const meetingId = req.body.meetingId ? parsePositiveInt(req.body.meetingId) : null;

  if (!studentId) return res.status(400).json({ error: "Valid studentId is required" });

  const student = await assertStudentInDistrict(studentId, districtId);
  if (!student) return res.status(404).json({ error: "Student not found in your district" });

  let meetingData: { id: number; meetingDate: string | null; meetingType: string | null; notes: string | null; actionItems: { id: string; description: string; assignee: string; dueDate: string | null; status: string }[] | null } | null = null;
  let attendees: { name: string; role: string; attended: boolean | null }[] = [];

  if (meetingId) {
    const [m] = await db.select({
      id: teamMeetingsTable.id,
      meetingDate: teamMeetingsTable.meetingDate,
      meetingType: teamMeetingsTable.meetingType,
      notes: teamMeetingsTable.notes,
      actionItems: teamMeetingsTable.actionItems,
    }).from(teamMeetingsTable)
      .innerJoin(studentsTable, eq(teamMeetingsTable.studentId, studentsTable.id))
      .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
      .where(and(eq(teamMeetingsTable.id, meetingId), eq(schoolsTable.districtId, districtId)));
    if (!m) return res.status(404).json({ error: "Meeting not found in your district" });
    meetingData = m;

    attendees = await db.select({
      name: iepMeetingAttendeesTable.name,
      role: iepMeetingAttendeesTable.role,
      attended: iepMeetingAttendeesTable.attended,
    }).from(iepMeetingAttendeesTable)
      .where(eq(iepMeetingAttendeesTable.meetingId, meetingId));
  }

  const goals = await db.select({
    id: iepGoalsTable.id,
    annualGoal: iepGoalsTable.annualGoal,
    area: iepGoalsTable.area,
  }).from(iepGoalsTable)
    .innerJoin(iepDocumentsTable, eq(iepGoalsTable.iepDocumentId, iepDocumentsTable.id))
    .where(and(
      eq(iepDocumentsTable.studentId, studentId),
      eq(iepDocumentsTable.active, true),
    ));

  const today = new Date().toISOString().split("T")[0];
  const responseDue = new Date(Date.now() + 10 * 86400000).toISOString().split("T")[0];

  const goalsText = goals.length > 0
    ? goals.map(g => `- ${g.area || "General"}: ${g.annualGoal}`).join("\n")
    : "No active IEP goals on file.";

  const teamMembersText = attendees.length > 0
    ? attendees.map(a => `- ${a.name} (${a.role})${a.attended === false ? " — excused" : ""}`).join("\n")
    : "No team member records on file.";

  const decisionsText = meetingData?.actionItems && meetingData.actionItems.length > 0
    ? meetingData.actionItems.map(ai => `- ${ai.description} (Assigned: ${ai.assignee}${ai.dueDate ? `, Due: ${ai.dueDate}` : ""})`).join("\n")
    : "No action items/decisions recorded.";

  const actionDescription = meetingData
    ? `Based on team meeting held ${meetingData.meetingDate || "N/A"} (${meetingData.meetingType || "IEP meeting"}).\n\nTeam Members Present:\n${teamMembersText}\n\nDecisions/Action Items:\n${decisionsText}${meetingData.notes ? "\n\nMeeting Notes: " + meetingData.notes : ""}`
    : `Prior Written Notice for ${student.firstName} ${student.lastName}.`;

  const [pwn] = await db.insert(priorWrittenNoticesTable).values({
    meetingId: meetingId || null,
    studentId,
    noticeType: "proposal",
    actionProposed: `Proposed IEP services and goals for ${student.firstName} ${student.lastName}`,
    actionDescription,
    reasonForAction: `The IEP team has determined the following services and goals are appropriate based on evaluation data, progress monitoring, and team input.`,
    optionsConsidered: `The team considered continuation of current services, modification of service delivery, and changes to goals and accommodations.`,
    reasonOptionsRejected: `Options were evaluated based on student progress data, assessment results, and team discussion. Selected options best meet the student's identified needs.`,
    evaluationInfo: `Current IEP goals:\n${goalsText}`,
    otherFactors: `Parent input was considered throughout the process.\n\nTeam composition:\n${teamMembersText}`,
    issuedDate: today,
    issuedBy: (req as AuthedRequest).tenantStaffId || null,
    parentResponseDueDate: responseDue,
    status: "draft",
  }).returning();

  logAudit(req, {
    action: "create",
    targetTable: "prior_written_notices",
    targetId: pwn.id,
    studentId,
    summary: `Auto-generated Prior Written Notice from meeting data`,
  });

  res.status(201).json(pwn);
});

export default router;
