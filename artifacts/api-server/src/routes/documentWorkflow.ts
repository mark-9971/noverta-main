import { Router } from "express";
import { db, documentVersionsTable, approvalWorkflowsTable, workflowApprovalsTable, iepDocumentsTable, priorWrittenNoticesTable, studentsTable, teamMeetingsTable, iepGoalsTable, schoolsTable } from "@workspace/db";
import { eq, and, desc, SQL, sql } from "drizzle-orm";
import { getEnforcedDistrictId, type AuthedRequest } from "../middlewares/auth";
import { logAudit } from "../lib/auditLog";

const router = Router();

const DEFAULT_STAGES = ["draft", "team_review", "director_signoff", "parent_delivery"];
const VALID_DOC_TYPES = ["iep", "evaluation", "progress_report", "prior_written_notice", "incident_report"];
const VALID_STATUSES = ["in_progress", "completed", "rejected"];
const VALID_STAGES = ["draft", "team_review", "director_signoff", "parent_delivery"];

function getUserInfo(req: AuthedRequest) {
  return {
    userId: req.userId!,
    name: req.userName || "Unknown",
  };
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

  const approvals = await db.select().from(workflowApprovalsTable)
    .where(eq(workflowApprovalsTable.workflowId, id))
    .orderBy(desc(workflowApprovalsTable.createdAt));

  res.json({ ...workflow, approvals });
});

router.post("/document-workflow/workflows", async (req, res) => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (!districtId) return res.status(403).json({ error: "No district scope" });
  const user = getUserInfo(req as AuthedRequest);
  const { documentType, title, stages } = req.body;
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

  logAudit(req, {
    action: "create",
    targetTable: "approval_workflows",
    targetId: workflow.id,
    studentId,
    summary: `Started approval workflow for ${documentType} #${documentId}`,
  });

  res.status(201).json(workflow);
});

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

  const stages = workflow.stages as string[];
  const currentIdx = stages.indexOf(workflow.currentStage);
  const isLastStage = currentIdx >= stages.length - 1;

  await db.insert(workflowApprovalsTable).values({
    workflowId: id,
    stage: workflow.currentStage,
    action: "approved",
    reviewerUserId: user.userId,
    reviewerName: user.name,
    comment,
  });

  if (isLastStage) {
    await db.update(approvalWorkflowsTable)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(approvalWorkflowsTable.id, id));
  } else {
    const nextStage = stages[currentIdx + 1];
    await db.update(approvalWorkflowsTable)
      .set({ currentStage: nextStage })
      .where(eq(approvalWorkflowsTable.id, id));
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

  await db.insert(workflowApprovalsTable).values({
    workflowId: id,
    stage: workflow.currentStage,
    action: "rejected",
    reviewerUserId: user.userId,
    reviewerName: user.name,
    comment,
  });

  await db.update(approvalWorkflowsTable)
    .set({ status: "rejected" })
    .where(eq(approvalWorkflowsTable.id, id));

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

  const stages = workflow.stages as string[];

  await db.insert(workflowApprovalsTable).values({
    workflowId: id,
    stage: workflow.currentStage,
    action: "changes_requested",
    reviewerUserId: user.userId,
    reviewerName: user.name,
    comment: comment.slice(0, 2000),
  });

  await db.update(approvalWorkflowsTable)
    .set({ currentStage: stages[0] })
    .where(eq(approvalWorkflowsTable.id, id));

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

  res.json({ byStage: summary, totalActive, totalCompleted, totalRejected });
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

  let meetingData: { id: number; meetingDate: string | null; meetingType: string | null; notes: string | null } | null = null;
  if (meetingId) {
    const [m] = await db.select({
      id: teamMeetingsTable.id,
      meetingDate: teamMeetingsTable.meetingDate,
      meetingType: teamMeetingsTable.meetingType,
      notes: teamMeetingsTable.notes,
    }).from(teamMeetingsTable)
      .innerJoin(studentsTable, eq(teamMeetingsTable.studentId, studentsTable.id))
      .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
      .where(and(eq(teamMeetingsTable.id, meetingId), eq(schoolsTable.districtId, districtId)));
    if (!m) return res.status(404).json({ error: "Meeting not found in your district" });
    meetingData = m;
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

  const actionDescription = meetingData
    ? `Based on team meeting held ${meetingData.meetingDate || "N/A"} (${meetingData.meetingType || "IEP meeting"}). ${meetingData.notes ? "Meeting notes: " + meetingData.notes : ""}`
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
    otherFactors: `Parent input was considered throughout the process.`,
    issuedDate: today,
    issuedBy: parseInt(user.userId, 10) || null,
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
