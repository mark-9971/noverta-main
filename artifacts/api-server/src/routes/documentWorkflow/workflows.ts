import { Router } from "express";
import {
  db,
  approvalWorkflowsTable,
  workflowApprovalsTable,
  workflowReviewersTable,
  studentsTable,
  iepDocumentsTable,
  evaluationsTable,
  progressReportsTable,
  priorWrittenNoticesTable,
  communicationEventsTable,
  restraintIncidentsTable,
} from "@workspace/db";
import { eq, and, desc, SQL, sql } from "drizzle-orm";
import { getEnforcedDistrictId, type AuthedRequest } from "../../middlewares/auth";
import { logAudit } from "../../lib/auditLog";
import {
  DEFAULT_STAGES,
  VALID_DOC_TYPES,
  VALID_STAGES,
  VALID_STATUSES,
  assertStudentInDistrict,
  checkReviewerAuth,
  getUserInfo,
  notifyReviewersForStage,
  notifyWorkflowCreator,
  parsePositiveInt,
  validateDocumentExists,
} from "./shared";

const router = Router();

router.get("/document-workflow/workflows", async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (!districtId) return void res.status(403).json({ error: "No district scope" });

  const conditions: SQL[] = [eq(approvalWorkflowsTable.districtId, districtId)];

  if (req.query.status) {
    const s = req.query.status as string;
    if (!VALID_STATUSES.includes(s)) return void res.status(400).json({ error: "Invalid status filter" });
    conditions.push(eq(approvalWorkflowsTable.status, s));
  }
  if (req.query.currentStage) {
    const s = req.query.currentStage as string;
    if (!VALID_STAGES.includes(s)) return void res.status(400).json({ error: "Invalid stage filter" });
    conditions.push(eq(approvalWorkflowsTable.currentStage, s));
  }
  if (req.query.studentId) {
    const sid = parsePositiveInt(req.query.studentId);
    if (!sid) return void res.status(400).json({ error: "Invalid studentId filter" });
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

router.get("/document-workflow/workflows/:id", async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (!districtId) return void res.status(403).json({ error: "No district scope" });
  const id = parsePositiveInt(req.params.id);
  if (!id) return void res.status(400).json({ error: "Invalid workflow ID" });

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

  if (!workflow) return void res.status(404).json({ error: "Workflow not found" });

  const [approvals, reviewers, notifications] = await Promise.all([
    db.select().from(workflowApprovalsTable)
      .where(eq(workflowApprovalsTable.workflowId, id))
      .orderBy(desc(workflowApprovalsTable.createdAt)),
    db.select().from(workflowReviewersTable)
      .where(eq(workflowReviewersTable.workflowId, id)),
    db.select({
      id: communicationEventsTable.id,
      toEmail: communicationEventsTable.toEmail,
      toName: communicationEventsTable.toName,
      subject: communicationEventsTable.subject,
      status: communicationEventsTable.status,
      stage: sql<string | null>`${communicationEventsTable.metadata}->>'workflowStage'`,
      kind: sql<string | null>`${communicationEventsTable.metadata}->>'workflowNotificationKind'`,
      createdAt: communicationEventsTable.createdAt,
      sentAt: communicationEventsTable.sentAt,
      acceptedAt: communicationEventsTable.acceptedAt,
      deliveredAt: communicationEventsTable.deliveredAt,
      failedReason: communicationEventsTable.failedReason,
    })
      .from(communicationEventsTable)
      .where(and(
        eq(communicationEventsTable.studentId, workflow.studentId),
        sql`${communicationEventsTable.metadata}->>'workflowId' = ${String(id)}`,
      ))
      .orderBy(desc(communicationEventsTable.createdAt)),
  ]);

  res.json({ ...workflow, approvals, reviewers, notifications });
});

router.post("/document-workflow/workflows", async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (!districtId) return void res.status(403).json({ error: "No district scope" });
  const user = getUserInfo(req as unknown as AuthedRequest);
  const { documentType, title, stages, reviewers } = req.body;
  const documentId = parsePositiveInt(req.body.documentId);
  const studentId = parsePositiveInt(req.body.studentId);

  if (!documentType || !documentId || !studentId || !title) {
    return void res.status(400).json({ error: "Missing required fields" });
  }
  if (!VALID_DOC_TYPES.includes(documentType)) {
    return void res.status(400).json({ error: `Invalid documentType. Must be one of: ${VALID_DOC_TYPES.join(", ")}` });
  }
  if (typeof title !== "string" || title.length > 500) {
    return void res.status(400).json({ error: "Title must be a string under 500 characters" });
  }

  const student = await assertStudentInDistrict(studentId, districtId);
  if (!student) return void res.status(404).json({ error: "Student not found in your district" });

  const docCheck = await validateDocumentExists(documentType, documentId, studentId);
  if (!docCheck.exists) return void res.status(404).json({ error: docCheck.error || "Document not found for this student" });

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

router.post("/document-workflow/workflows/:id/approve", async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (!districtId) return void res.status(403).json({ error: "No district scope" });
  const user = getUserInfo(req as unknown as AuthedRequest);
  const id = parsePositiveInt(req.params.id);
  if (!id) return void res.status(400).json({ error: "Invalid workflow ID" });
  const comment = typeof req.body.comment === "string" ? req.body.comment.slice(0, 2000) : null;

  const [workflow] = await db.select().from(approvalWorkflowsTable)
    .where(and(eq(approvalWorkflowsTable.id, id), eq(approvalWorkflowsTable.districtId, districtId)));
  if (!workflow) return void res.status(404).json({ error: "Workflow not found" });
  if (workflow.status !== "in_progress") return void res.status(400).json({ error: "Workflow is not in progress" });

  const authorized = await checkReviewerAuth(id, workflow.currentStage, user.userId);
  if (!authorized) return void res.status(403).json({ error: "You are not assigned as a reviewer for this stage" });

  const stages = workflow.stages as string[];
  const currentIdx = stages.indexOf(workflow.currentStage);
  const isLastStage = currentIdx >= stages.length - 1;

  const parentCommentId = parsePositiveInt(req.body.parentCommentId) || null;
  const sectionRef = typeof req.body.sectionRef === "string" ? req.body.sectionRef.slice(0, 200) : null;

  await db.insert(workflowApprovalsTable).values({
    workflowId: id,
    stage: workflow.currentStage,
    action: "approved",
    reviewerUserId: user.userId,
    reviewerName: user.name,
    comment,
    parentCommentId,
    sectionRef,
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

router.post("/document-workflow/workflows/:id/reject", async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (!districtId) return void res.status(403).json({ error: "No district scope" });
  const user = getUserInfo(req as unknown as AuthedRequest);
  const id = parsePositiveInt(req.params.id);
  if (!id) return void res.status(400).json({ error: "Invalid workflow ID" });
  const comment = typeof req.body.comment === "string" ? req.body.comment.slice(0, 2000) : null;

  const [workflow] = await db.select().from(approvalWorkflowsTable)
    .where(and(eq(approvalWorkflowsTable.id, id), eq(approvalWorkflowsTable.districtId, districtId)));
  if (!workflow) return void res.status(404).json({ error: "Workflow not found" });
  if (workflow.status !== "in_progress") return void res.status(400).json({ error: "Workflow is not in progress" });

  const authorized = await checkReviewerAuth(id, workflow.currentStage, user.userId);
  if (!authorized) return void res.status(403).json({ error: "You are not assigned as a reviewer for this stage" });

  const parentCommentId = parsePositiveInt(req.body.parentCommentId) || null;
  const sectionRef = typeof req.body.sectionRef === "string" ? req.body.sectionRef.slice(0, 200) : null;

  await db.insert(workflowApprovalsTable).values({
    workflowId: id,
    stage: workflow.currentStage,
    action: "rejected",
    reviewerUserId: user.userId,
    reviewerName: user.name,
    comment,
    parentCommentId,
    sectionRef,
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

router.post("/document-workflow/workflows/:id/request-changes", async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (!districtId) return void res.status(403).json({ error: "No district scope" });
  const user = getUserInfo(req as unknown as AuthedRequest);
  const id = parsePositiveInt(req.params.id);
  if (!id) return void res.status(400).json({ error: "Invalid workflow ID" });
  const comment = typeof req.body.comment === "string" ? req.body.comment.trim() : "";

  if (!comment) return void res.status(400).json({ error: "Comment is required when requesting changes" });

  const [workflow] = await db.select().from(approvalWorkflowsTable)
    .where(and(eq(approvalWorkflowsTable.id, id), eq(approvalWorkflowsTable.districtId, districtId)));
  if (!workflow) return void res.status(404).json({ error: "Workflow not found" });
  if (workflow.status !== "in_progress") return void res.status(400).json({ error: "Workflow is not in progress" });

  const authorized = await checkReviewerAuth(id, workflow.currentStage, user.userId);
  if (!authorized) return void res.status(403).json({ error: "You are not assigned as a reviewer for this stage" });

  const stages = workflow.stages as string[];
  const parentCommentId = parsePositiveInt(req.body.parentCommentId) || null;
  const sectionRef = typeof req.body.sectionRef === "string" ? req.body.sectionRef.slice(0, 200) : null;

  await db.insert(workflowApprovalsTable).values({
    workflowId: id,
    stage: workflow.currentStage,
    action: "changes_requested",
    reviewerUserId: user.userId,
    reviewerName: user.name,
    comment: comment.slice(0, 2000),
    parentCommentId,
    sectionRef,
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

router.post("/document-workflow/workflows/:id/reviewers", async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (!districtId) return void res.status(403).json({ error: "No district scope" });
  const id = parsePositiveInt(req.params.id);
  if (!id) return void res.status(400).json({ error: "Invalid workflow ID" });

  const [workflow] = await db.select().from(approvalWorkflowsTable)
    .where(and(eq(approvalWorkflowsTable.id, id), eq(approvalWorkflowsTable.districtId, districtId)));
  if (!workflow) return void res.status(404).json({ error: "Workflow not found" });

  const { stage, userId, name } = req.body;
  if (!stage || !userId || !name) return void res.status(400).json({ error: "stage, userId, and name are required" });
  if (!VALID_STAGES.includes(stage)) return void res.status(400).json({ error: "Invalid stage" });

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

router.post("/document-workflow/workflows/:id/comments", async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (!districtId) return void res.status(403).json({ error: "No district scope" });
  const user = getUserInfo(req as unknown as AuthedRequest);
  const id = parsePositiveInt(req.params.id);
  if (!id) return void res.status(400).json({ error: "Invalid workflow ID" });

  const comment = typeof req.body.comment === "string" ? req.body.comment.trim() : "";
  if (!comment) return void res.status(400).json({ error: "Comment text is required" });

  const [workflow] = await db.select().from(approvalWorkflowsTable)
    .where(and(eq(approvalWorkflowsTable.id, id), eq(approvalWorkflowsTable.districtId, districtId)));
  if (!workflow) return void res.status(404).json({ error: "Workflow not found" });

  const parentCommentId = parsePositiveInt(req.body.parentCommentId) || null;
  const sectionRef = typeof req.body.sectionRef === "string" ? req.body.sectionRef.slice(0, 200) : null;

  if (parentCommentId) {
    const [parent] = await db.select({ id: workflowApprovalsTable.id })
      .from(workflowApprovalsTable)
      .where(and(eq(workflowApprovalsTable.id, parentCommentId), eq(workflowApprovalsTable.workflowId, id)));
    if (!parent) return void res.status(404).json({ error: "Parent comment not found" });
  }

  const [entry] = await db.insert(workflowApprovalsTable).values({
    workflowId: id,
    stage: workflow.currentStage,
    action: "comment",
    reviewerUserId: user.userId,
    reviewerName: user.name,
    comment: comment.slice(0, 2000),
    parentCommentId,
    sectionRef,
  }).returning();

  res.status(201).json(entry);
});

router.get("/document-workflow/workflows/:id/document-preview", async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (!districtId) return void res.status(403).json({ error: "No district scope" });
  const id = parsePositiveInt(req.params.id);
  if (!id) return void res.status(400).json({ error: "Invalid workflow ID" });

  const [workflow] = await db
    .select({
      documentType: approvalWorkflowsTable.documentType,
      documentId: approvalWorkflowsTable.documentId,
      studentId: approvalWorkflowsTable.studentId,
    })
    .from(approvalWorkflowsTable)
    .where(and(eq(approvalWorkflowsTable.id, id), eq(approvalWorkflowsTable.districtId, districtId)));

  if (!workflow) return void res.status(404).json({ error: "Workflow not found" });

  const { documentType, documentId, studentId } = workflow;

  let preview: Record<string, unknown> = { documentType, documentId };

  try {
    switch (documentType) {
      case "iep": {
        const [doc] = await db
          .select()
          .from(iepDocumentsTable)
          .where(and(eq(iepDocumentsTable.id, documentId), eq(iepDocumentsTable.studentId, studentId)));
        if (doc) {
          preview = {
            documentType,
            documentId,
            iepType: doc.iepType,
            version: doc.version,
            status: doc.status,
            iepStartDate: doc.iepStartDate,
            iepEndDate: doc.iepEndDate,
            meetingDate: doc.meetingDate,
            studentConcerns: doc.studentConcerns,
            parentConcerns: doc.parentConcerns,
            teamVision: doc.teamVision,
            plaafpAcademic: doc.plaafpAcademic,
            plaafpBehavioral: doc.plaafpBehavioral,
            plaafpCommunication: doc.plaafpCommunication,
            plaafpAdditional: doc.plaafpAdditional,
            esyEligible: doc.esyEligible,
            esyServices: doc.esyServices,
            assessmentParticipation: doc.assessmentParticipation,
            scheduleModifications: doc.scheduleModifications,
            transportationServices: doc.transportationServices,
          };
        }
        break;
      }
      case "evaluation": {
        const [doc] = await db
          .select()
          .from(evaluationsTable)
          .where(and(eq(evaluationsTable.id, documentId), eq(evaluationsTable.studentId, studentId)));
        if (doc) {
          preview = {
            documentType,
            documentId,
            evaluationType: doc.evaluationType,
            status: doc.status,
            startDate: doc.startDate,
            dueDate: doc.dueDate,
            completionDate: doc.completionDate,
            meetingDate: doc.meetingDate,
            reportSummary: doc.reportSummary,
            notes: doc.notes,
            evaluationAreas: doc.evaluationAreas,
            teamMembers: doc.teamMembers,
          };
        }
        break;
      }
      case "progress_report": {
        const [doc] = await db
          .select()
          .from(progressReportsTable)
          .where(and(eq(progressReportsTable.id, documentId), eq(progressReportsTable.studentId, studentId)));
        if (doc) {
          preview = {
            documentType,
            documentId,
            reportingPeriod: doc.reportingPeriod,
            periodStart: doc.periodStart,
            periodEnd: doc.periodEnd,
            status: doc.status,
            overallSummary: doc.overallSummary,
            serviceDeliverySummary: doc.serviceDeliverySummary,
            recommendations: doc.recommendations,
            parentNotes: doc.parentNotes,
            goalProgress: doc.goalProgress,
            serviceBreakdown: doc.serviceBreakdown,
            parentNotificationDate: doc.parentNotificationDate,
          };
        }
        break;
      }
      case "incident_report": {
        const [doc] = await db
          .select()
          .from(restraintIncidentsTable)
          .where(and(eq(restraintIncidentsTable.id, documentId), eq(restraintIncidentsTable.studentId, studentId)));
        if (doc) {
          preview = { ...doc, documentType, documentId };
        }
        break;
      }
      case "prior_written_notice": {
        const [doc] = await db
          .select()
          .from(priorWrittenNoticesTable)
          .where(and(eq(priorWrittenNoticesTable.id, documentId), eq(priorWrittenNoticesTable.studentId, studentId)));
        if (doc) {
          preview = {
            documentType,
            documentId,
            noticeType: doc.noticeType,
            status: doc.status,
            actionProposed: doc.actionProposed,
            actionDescription: doc.actionDescription,
            reasonForAction: doc.reasonForAction,
            optionsConsidered: doc.optionsConsidered,
            reasonOptionsRejected: doc.reasonOptionsRejected,
            evaluationInfo: doc.evaluationInfo,
            otherFactors: doc.otherFactors,
            issuedDate: doc.issuedDate,
            parentResponseDueDate: doc.parentResponseDueDate,
            notes: doc.notes,
          };
        }
        break;
      }
      default:
        break;
    }
  } catch {
    return void res.status(500).json({ error: "Failed to fetch document preview" });
  }

  res.json(preview);
});

export default router;
