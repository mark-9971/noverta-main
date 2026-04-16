import { Router } from "express";
import { db, priorWrittenNoticesTable, studentsTable, teamMeetingsTable, iepGoalsTable, iepMeetingAttendeesTable, schoolsTable, iepDocumentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getEnforcedDistrictId, type AuthedRequest } from "../../middlewares/auth";
import { logAudit } from "../../lib/auditLog";
import { assertStudentInDistrict, getUserInfo, parsePositiveInt } from "./shared";

const router = Router();

router.post("/document-workflow/generate-pwn", async (req, res) => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (!districtId) return res.status(403).json({ error: "No district scope" });
  const user = getUserInfo(req as AuthedRequest);
  void user;
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
      .where(and(eq(teamMeetingsTable.id, meetingId), eq(teamMeetingsTable.studentId, studentId), eq(schoolsTable.districtId, districtId)));
    if (!m) return res.status(404).json({ error: "Meeting not found for this student in your district" });
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
