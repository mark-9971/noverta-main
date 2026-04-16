import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  teamMeetingsTable, studentsTable, staffTable, schoolsTable,
  iepMeetingAttendeesTable, priorWrittenNoticesTable, meetingConsentRecordsTable,
  iepDocumentsTable, meetingPrepItemsTable, iepGoalsTable,
  iepAccommodationsTable, parentMessagesTable, dataSessionsTable,
  programDataTable, behaviorDataTable,
} from "@workspace/db";
import { eq, and, desc, asc, gte, lte, count, inArray } from "drizzle-orm";
import type { AuthedRequest } from "../middlewares/auth";
import { requireRoles } from "../middlewares/auth";
import { logAudit } from "../lib/auditLog";
import { PRIVILEGED_STAFF_ROLES } from "../lib/permissions";
import { getActiveSchoolYearIdForStudent } from "../lib/activeSchoolYear";

const router: IRouter = Router();
const meetingAccess = requireRoles(...PRIVILEGED_STAFF_ROLES);

const MEETING_TYPES = [
  "annual_review", "initial_iep", "amendment", "reevaluation",
  "transition", "manifestation_determination", "eligibility",
  "progress_review", "other",
];

const MEETING_STATUSES = ["scheduled", "confirmed", "in_progress", "completed", "cancelled", "rescheduled"];

function pick(body: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in body) result[k] = body[k];
  }
  return result;
}

router.get("/iep-meetings/dashboard", meetingAccess, async (req, res): Promise<void> => {
  try {
    const { schoolId } = req.query;
    const today = new Date().toISOString().split("T")[0];
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

    const studentFilter = [];
    if (schoolId) studentFilter.push(eq(studentsTable.schoolId, Number(schoolId)));

    const allMeetings = await db.select({
      id: teamMeetingsTable.id,
      studentId: teamMeetingsTable.studentId,
      meetingType: teamMeetingsTable.meetingType,
      scheduledDate: teamMeetingsTable.scheduledDate,
      status: teamMeetingsTable.status,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      studentGrade: studentsTable.grade,
      consentStatus: teamMeetingsTable.consentStatus,
    })
      .from(teamMeetingsTable)
      .innerJoin(studentsTable, eq(teamMeetingsTable.studentId, studentsTable.id))
      .where(studentFilter.length > 0 ? and(...studentFilter) : undefined)
      .orderBy(asc(teamMeetingsTable.scheduledDate));

    const upcoming = allMeetings.filter(m =>
      m.status === "scheduled" && m.scheduledDate >= today && m.scheduledDate <= in30
    );
    const thisWeek = allMeetings.filter(m =>
      m.status === "scheduled" && m.scheduledDate >= today && m.scheduledDate <= in7
    );
    const overdue = allMeetings.filter(m =>
      m.status === "scheduled" && m.scheduledDate < today
    );
    const pendingConsent = allMeetings.filter(m =>
      m.status === "completed" && (!m.consentStatus || m.consentStatus === "pending")
    );
    const completed = allMeetings.filter(m => m.status === "completed");

    const iepDocs = await db.select({
      studentId: iepDocumentsTable.studentId,
      iepEndDate: iepDocumentsTable.iepEndDate,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      grade: studentsTable.grade,
    })
      .from(iepDocumentsTable)
      .innerJoin(studentsTable, eq(iepDocumentsTable.studentId, studentsTable.id))
      .where(and(
        eq(iepDocumentsTable.active, true),
        eq(studentsTable.status, "active"),
        ...(schoolId ? [eq(studentsTable.schoolId, Number(schoolId))] : []),
      ));

    const studentsWithScheduled = new Set(
      allMeetings
        .filter(m => m.status === "scheduled" && m.meetingType === "annual_review")
        .map(m => m.studentId)
    );

    const overdueAnnualReviews = iepDocs.filter(d => {
      if (!d.iepEndDate) return false;
      if (studentsWithScheduled.has(d.studentId)) return false;
      return d.iepEndDate < in30;
    });

    res.json({
      totalScheduled: allMeetings.filter(m => m.status === "scheduled").length,
      upcomingCount: upcoming.length,
      thisWeekCount: thisWeek.length,
      overdueCount: overdue.length,
      pendingConsentCount: pendingConsent.length,
      completedCount: completed.length,
      overdueAnnualReviews: overdueAnnualReviews.length,
      upcomingMeetings: upcoming.slice(0, 10).map(m => ({
        id: m.id,
        studentName: `${m.studentFirstName} ${m.studentLastName}`,
        studentGrade: m.studentGrade,
        meetingType: m.meetingType,
        scheduledDate: m.scheduledDate,
      })),
      overdueMeetings: overdue.slice(0, 10).map(m => ({
        id: m.id,
        studentName: `${m.studentFirstName} ${m.studentLastName}`,
        meetingType: m.meetingType,
        scheduledDate: m.scheduledDate,
      })),
      overdueAnnualReviewStudents: overdueAnnualReviews.slice(0, 10).map(d => ({
        studentId: d.studentId,
        studentName: `${d.firstName} ${d.lastName}`,
        grade: d.grade,
        iepEndDate: d.iepEndDate,
      })),
    });
  } catch (e: unknown) {
    console.error("GET /iep-meetings/dashboard error:", e);
    res.status(500).json({ error: "Failed to fetch meeting dashboard" });
  }
});

router.get("/iep-meetings", meetingAccess, async (req, res): Promise<void> => {
  try {
    const { studentId, schoolId, status, startDate, endDate, meetingType } = req.query;
    const conditions = [];
    if (studentId) conditions.push(eq(teamMeetingsTable.studentId, Number(studentId)));
    if (schoolId) conditions.push(eq(teamMeetingsTable.schoolId, Number(schoolId)));
    if (status && status !== "all") conditions.push(eq(teamMeetingsTable.status, status as string));
    if (startDate) conditions.push(gte(teamMeetingsTable.scheduledDate, startDate as string));
    if (endDate) conditions.push(lte(teamMeetingsTable.scheduledDate, endDate as string));
    if (meetingType && meetingType !== "all") conditions.push(eq(teamMeetingsTable.meetingType, meetingType as string));

    const meetings = await db.select({
      meeting: teamMeetingsTable,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      studentGrade: studentsTable.grade,
      schoolName: schoolsTable.name,
    })
      .from(teamMeetingsTable)
      .innerJoin(studentsTable, eq(teamMeetingsTable.studentId, studentsTable.id))
      .leftJoin(schoolsTable, eq(teamMeetingsTable.schoolId, schoolsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(teamMeetingsTable.scheduledDate));

    res.json(meetings.map(m => ({
      ...m.meeting,
      studentName: `${m.studentFirstName} ${m.studentLastName}`,
      studentGrade: m.studentGrade,
      schoolName: m.schoolName,
      createdAt: m.meeting.createdAt.toISOString(),
      updatedAt: m.meeting.updatedAt.toISOString(),
    })));
  } catch (e: unknown) {
    console.error("GET /iep-meetings error:", e);
    res.status(500).json({ error: "Failed to fetch meetings" });
  }
});

router.get("/iep-meetings/:id", meetingAccess, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid meeting ID" }); return; }

    const [row] = await db.select({
      meeting: teamMeetingsTable,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      studentGrade: studentsTable.grade,
      schoolName: schoolsTable.name,
    })
      .from(teamMeetingsTable)
      .innerJoin(studentsTable, eq(teamMeetingsTable.studentId, studentsTable.id))
      .leftJoin(schoolsTable, eq(teamMeetingsTable.schoolId, schoolsTable.id))
      .where(eq(teamMeetingsTable.id, id));

    if (!row) { res.status(404).json({ error: "Meeting not found" }); return; }

    const attendees = await db.select({
      attendee: iepMeetingAttendeesTable,
      staffFirstName: staffTable.firstName,
      staffLastName: staffTable.lastName,
    })
      .from(iepMeetingAttendeesTable)
      .leftJoin(staffTable, eq(iepMeetingAttendeesTable.staffId, staffTable.id))
      .where(eq(iepMeetingAttendeesTable.meetingId, id))
      .orderBy(asc(iepMeetingAttendeesTable.role));

    const notices = await db.select()
      .from(priorWrittenNoticesTable)
      .where(eq(priorWrittenNoticesTable.meetingId, id))
      .orderBy(desc(priorWrittenNoticesTable.createdAt));

    const consents = await db.select()
      .from(meetingConsentRecordsTable)
      .where(eq(meetingConsentRecordsTable.meetingId, id))
      .orderBy(desc(meetingConsentRecordsTable.createdAt));

    res.json({
      ...row.meeting,
      studentName: `${row.studentFirstName} ${row.studentLastName}`,
      studentGrade: row.studentGrade,
      schoolName: row.schoolName,
      createdAt: row.meeting.createdAt.toISOString(),
      updatedAt: row.meeting.updatedAt.toISOString(),
      attendeeRecords: attendees.map(a => ({
        ...a.attendee,
        staffName: a.staffFirstName ? `${a.staffFirstName} ${a.staffLastName}` : null,
        createdAt: a.attendee.createdAt.toISOString(),
        updatedAt: a.attendee.updatedAt.toISOString(),
      })),
      priorWrittenNotices: notices.map(n => ({
        ...n,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      })),
      consentRecords: consents.map(c => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
    });
  } catch (e: unknown) {
    console.error("GET /iep-meetings/:id error:", e);
    res.status(500).json({ error: "Failed to fetch meeting" });
  }
});

router.post("/iep-meetings", meetingAccess, async (req, res): Promise<void> => {
  try {
    const body = req.body;
    if (!body.studentId || !body.meetingType || !body.scheduledDate) {
      res.status(400).json({ error: "studentId, meetingType, and scheduledDate are required" });
      return;
    }
    if (!MEETING_TYPES.includes(body.meetingType)) {
      res.status(400).json({ error: `meetingType must be one of: ${MEETING_TYPES.join(", ")}` });
      return;
    }

    const [student] = await db.select({ id: studentsTable.id, schoolId: studentsTable.schoolId })
      .from(studentsTable)
      .where(eq(studentsTable.id, body.studentId));
    if (!student) { res.status(404).json({ error: "Student not found" }); return; }

    const schoolId = body.schoolId ?? student.schoolId ?? null;
    const schoolYearId = await getActiveSchoolYearIdForStudent(body.studentId);

    const [row] = await db.insert(teamMeetingsTable).values({
      studentId: body.studentId,
      iepDocumentId: body.iepDocumentId ?? null,
      schoolId,
      meetingType: body.meetingType,
      scheduledDate: body.scheduledDate,
      scheduledTime: body.scheduledTime ?? null,
      endTime: body.endTime ?? null,
      duration: body.duration ?? null,
      location: body.location ?? null,
      meetingFormat: body.meetingFormat ?? "in_person",
      status: "scheduled",
      agendaItems: body.agendaItems ?? null,
      notes: body.notes ?? null,
      ...(schoolYearId != null ? { schoolYearId } : {}),
    }).returning();

    if (body.invitees && Array.isArray(body.invitees) && body.invitees.length > 0) {
      const attendeeValues = body.invitees.map((inv: Record<string, unknown>) => ({
        meetingId: row.id,
        staffId: inv.staffId ? Number(inv.staffId) : null,
        name: String(inv.name || ""),
        role: String(inv.role || "team_member"),
        email: inv.email ? String(inv.email) : null,
        isRequired: inv.isRequired !== false,
      }));
      await db.insert(iepMeetingAttendeesTable).values(attendeeValues);
    }

    logAudit(req, {
      action: "create",
      targetTable: "team_meetings",
      targetId: row.id,
      studentId: body.studentId,
      summary: `Scheduled ${body.meetingType} meeting for student #${body.studentId} on ${body.scheduledDate}`,
    });

    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (e: unknown) {
    console.error("POST /iep-meetings error:", e);
    res.status(500).json({ error: "Failed to create meeting" });
  }
});

router.patch("/iep-meetings/:id", meetingAccess, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid meeting ID" }); return; }

    const allowed = [
      "scheduledDate", "scheduledTime", "endTime", "duration", "location",
      "meetingFormat", "status", "agendaItems", "notes", "actionItems",
      "outcome", "followUpDate", "minutesFinalized", "consentStatus",
      "noticeSentDate", "cancelledReason", "meetingType", "iepDocumentId",
    ];
    const updates = pick(req.body, allowed);
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    if (updates.status && !MEETING_STATUSES.includes(updates.status as string)) {
      res.status(400).json({ error: `status must be one of: ${MEETING_STATUSES.join(", ")}` });
      return;
    }

    const [row] = await db.update(teamMeetingsTable)
      .set(updates)
      .where(eq(teamMeetingsTable.id, id))
      .returning();

    if (!row) { res.status(404).json({ error: "Meeting not found" }); return; }

    logAudit(req, {
      action: "update",
      targetTable: "team_meetings",
      targetId: id,
      studentId: row.studentId,
      summary: `Updated meeting #${id}`,
      newValues: updates,
    });

    res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (e: unknown) {
    console.error("PATCH /iep-meetings/:id error:", e);
    res.status(500).json({ error: "Failed to update meeting" });
  }
});

router.delete("/iep-meetings/:id", meetingAccess, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid meeting ID" }); return; }

    const [meeting] = await db.select({ id: teamMeetingsTable.id, studentId: teamMeetingsTable.studentId })
      .from(teamMeetingsTable).where(eq(teamMeetingsTable.id, id));
    if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }

    await db.transaction(async (tx) => {
      await tx.delete(iepMeetingAttendeesTable).where(eq(iepMeetingAttendeesTable.meetingId, id));
      await tx.delete(priorWrittenNoticesTable).where(eq(priorWrittenNoticesTable.meetingId, id));
      await tx.delete(meetingConsentRecordsTable).where(eq(meetingConsentRecordsTable.meetingId, id));
      await tx.delete(teamMeetingsTable).where(eq(teamMeetingsTable.id, id));
    });

    logAudit(req, { action: "delete", targetTable: "team_meetings", targetId: id, studentId: meeting.studentId, summary: `Deleted meeting #${id} with child records` });
    res.json({ success: true });
  } catch (e: unknown) {
    console.error("DELETE /iep-meetings/:id error:", e);
    res.status(500).json({ error: "Failed to delete meeting" });
  }
});

router.post("/iep-meetings/:id/attendees", meetingAccess, async (req, res): Promise<void> => {
  try {
    const meetingId = parseInt(req.params.id);
    if (isNaN(meetingId)) { res.status(400).json({ error: "Invalid meeting ID" }); return; }

    const body = req.body;
    if (!body.name || !body.role) {
      res.status(400).json({ error: "name and role are required" });
      return;
    }

    const [meeting] = await db.select({ id: teamMeetingsTable.id })
      .from(teamMeetingsTable)
      .where(eq(teamMeetingsTable.id, meetingId));
    if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }

    const [row] = await db.insert(iepMeetingAttendeesTable).values({
      meetingId,
      staffId: body.staffId ? Number(body.staffId) : null,
      name: body.name,
      role: body.role,
      email: body.email ?? null,
      isRequired: body.isRequired !== false,
    }).returning();

    logAudit(req, { action: "create", targetTable: "iep_meeting_attendees", targetId: row.id, summary: `Added attendee ${body.name} to meeting #${meetingId}` });
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (e: unknown) {
    console.error("POST attendees error:", e);
    res.status(500).json({ error: "Failed to add attendee" });
  }
});

router.patch("/iep-meetings/attendees/:id", meetingAccess, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid attendee ID" }); return; }

    const allowed = [
      "attended", "submittedWrittenInput", "writtenInputNotes",
      "arrivalTime", "departureTime", "rsvpStatus",
    ];
    const updates = pick(req.body, allowed);
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    const [row] = await db.update(iepMeetingAttendeesTable)
      .set(updates)
      .where(eq(iepMeetingAttendeesTable.id, id))
      .returning();

    if (!row) { res.status(404).json({ error: "Attendee not found" }); return; }

    logAudit(req, { action: "update", targetTable: "iep_meeting_attendees", targetId: id, summary: `Updated attendee #${id}` });
    res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (e: unknown) {
    console.error("PATCH attendees/:id error:", e);
    res.status(500).json({ error: "Failed to update attendee" });
  }
});

router.delete("/iep-meetings/attendees/:id", meetingAccess, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid attendee ID" }); return; }

    const [row] = await db.delete(iepMeetingAttendeesTable).where(eq(iepMeetingAttendeesTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Attendee not found" }); return; }

    logAudit(req, { action: "delete", targetTable: "iep_meeting_attendees", targetId: id, summary: `Removed attendee #${id} from meeting #${row.meetingId}` });
    res.json({ success: true });
  } catch (e: unknown) {
    console.error("DELETE attendees/:id error:", e);
    res.status(500).json({ error: "Failed to delete attendee" });
  }
});

router.post("/iep-meetings/:meetingId/notices", meetingAccess, async (req, res): Promise<void> => {
  try {
    const meetingId = parseInt(req.params.meetingId);
    if (isNaN(meetingId)) { res.status(400).json({ error: "Invalid meeting ID" }); return; }

    const body = req.body;
    if (!body.noticeType || !body.actionProposed) {
      res.status(400).json({ error: "noticeType and actionProposed are required" });
      return;
    }

    const [meeting] = await db.select({ id: teamMeetingsTable.id, studentId: teamMeetingsTable.studentId })
      .from(teamMeetingsTable)
      .where(eq(teamMeetingsTable.id, meetingId));
    if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }

    const [row] = await db.insert(priorWrittenNoticesTable).values({
      meetingId,
      studentId: meeting.studentId,
      noticeType: body.noticeType,
      actionProposed: body.actionProposed,
      actionDescription: body.actionDescription ?? null,
      reasonForAction: body.reasonForAction ?? null,
      optionsConsidered: body.optionsConsidered ?? null,
      reasonOptionsRejected: body.reasonOptionsRejected ?? null,
      evaluationInfo: body.evaluationInfo ?? null,
      otherFactors: body.otherFactors ?? null,
      issuedDate: body.issuedDate ?? null,
      issuedBy: body.issuedBy ?? null,
      parentResponseDueDate: body.parentResponseDueDate ?? null,
      status: body.status ?? "draft",
      notes: body.notes ?? null,
    }).returning();

    logAudit(req, {
      action: "create",
      targetTable: "prior_written_notices",
      targetId: row.id,
      studentId: meeting.studentId,
      summary: `Created ${body.noticeType} prior written notice for meeting #${meetingId}`,
    });

    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (e: unknown) {
    console.error("POST notices error:", e);
    res.status(500).json({ error: "Failed to create notice" });
  }
});

router.patch("/iep-meetings/notices/:id", meetingAccess, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid notice ID" }); return; }

    const allowed = [
      "noticeType", "actionProposed", "actionDescription", "reasonForAction",
      "optionsConsidered", "reasonOptionsRejected", "evaluationInfo", "otherFactors",
      "issuedDate", "issuedBy", "parentResponseDueDate", "parentResponseReceived",
      "parentResponseDate", "status", "notes",
    ];
    const updates = pick(req.body, allowed);
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    const [row] = await db.update(priorWrittenNoticesTable)
      .set(updates)
      .where(eq(priorWrittenNoticesTable.id, id))
      .returning();

    if (!row) { res.status(404).json({ error: "Notice not found" }); return; }

    logAudit(req, { action: "update", targetTable: "prior_written_notices", targetId: id, studentId: row.studentId, summary: `Updated PWN #${id}` });
    res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (e: unknown) {
    console.error("PATCH notices/:id error:", e);
    res.status(500).json({ error: "Failed to update notice" });
  }
});

router.post("/iep-meetings/:meetingId/consent", meetingAccess, async (req, res): Promise<void> => {
  try {
    const meetingId = parseInt(req.params.meetingId);
    if (isNaN(meetingId)) { res.status(400).json({ error: "Invalid meeting ID" }); return; }

    const body = req.body;
    if (!body.consentType || !body.decision) {
      res.status(400).json({ error: "consentType and decision are required" });
      return;
    }

    const [meeting] = await db.select({ id: teamMeetingsTable.id, studentId: teamMeetingsTable.studentId })
      .from(teamMeetingsTable)
      .where(eq(teamMeetingsTable.id, meetingId));
    if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }

    const [row] = await db.insert(meetingConsentRecordsTable).values({
      meetingId,
      studentId: meeting.studentId,
      consentType: body.consentType,
      decision: body.decision,
      decisionDate: body.decisionDate ?? null,
      respondentName: body.respondentName ?? null,
      respondentRelationship: body.respondentRelationship ?? null,
      notes: body.notes ?? null,
      followUpRequired: body.followUpRequired ?? null,
      followUpDate: body.followUpDate ?? null,
    }).returning();

    logAudit(req, {
      action: "create",
      targetTable: "meeting_consent_records",
      targetId: row.id,
      studentId: meeting.studentId,
      summary: `Recorded ${body.decision} consent (${body.consentType}) for meeting #${meetingId}`,
    });

    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (e: unknown) {
    console.error("POST consent error:", e);
    res.status(500).json({ error: "Failed to record consent" });
  }
});

router.patch("/iep-meetings/consent/:id", meetingAccess, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid consent ID" }); return; }

    const allowed = [
      "decision", "decisionDate", "respondentName", "respondentRelationship",
      "notes", "followUpRequired", "followUpDate", "followUpCompleted",
    ];
    const updates = pick(req.body, allowed);
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    const [row] = await db.update(meetingConsentRecordsTable)
      .set(updates)
      .where(eq(meetingConsentRecordsTable.id, id))
      .returning();

    if (!row) { res.status(404).json({ error: "Consent record not found" }); return; }

    logAudit(req, { action: "update", targetTable: "meeting_consent_records", targetId: id, studentId: row.studentId, summary: `Updated consent #${id}` });
    res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (e: unknown) {
    console.error("PATCH consent/:id error:", e);
    res.status(500).json({ error: "Failed to update consent" });
  }
});

router.post("/iep-meetings/:id/complete", meetingAccess, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid meeting ID" }); return; }

    const body = req.body;
    const [row] = await db.update(teamMeetingsTable)
      .set({
        status: "completed",
        outcome: body.outcome ?? null,
        minutesFinalized: true,
        actionItems: body.actionItems ?? null,
        followUpDate: body.followUpDate ?? null,
      })
      .where(eq(teamMeetingsTable.id, id))
      .returning();

    if (!row) { res.status(404).json({ error: "Meeting not found" }); return; }

    logAudit(req, { action: "update", targetTable: "team_meetings", targetId: id, studentId: row.studentId, summary: `Completed meeting #${id}` });
    res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (e: unknown) {
    console.error("POST /iep-meetings/:id/complete error:", e);
    res.status(500).json({ error: "Failed to complete meeting" });
  }
});

const DEFAULT_PREP_ITEMS = [
  { itemType: "gather_progress_data", label: "Gather progress data", description: "Review recent session data and goal progress for all IEP goals", required: true, sortOrder: 1 },
  { itemType: "draft_review_goals", label: "Draft/review IEP goals", description: "Ensure all annual goals are drafted or reviewed with current data", required: true, sortOrder: 2 },
  { itemType: "contact_parent", label: "Contact parent/guardian", description: "Send meeting invitation and confirm parent attendance", required: true, sortOrder: 3 },
  { itemType: "confirm_attendance", label: "Confirm team attendance", description: "Add all required team members and confirm availability", required: true, sortOrder: 4 },
  { itemType: "prepare_pwn", label: "Prepare Prior Written Notice", description: "Draft PWN with proposed actions and rationale", required: true, sortOrder: 5 },
  { itemType: "set_location", label: "Set meeting location", description: "Reserve room or set up virtual meeting link", required: false, sortOrder: 6 },
  { itemType: "review_accommodations", label: "Review accommodations", description: "Review current accommodations for discussion at meeting", required: false, sortOrder: 7 },
  { itemType: "prepare_agenda", label: "Prepare meeting agenda", description: "Create or review the meeting agenda items", required: false, sortOrder: 8 },
];

async function autoDetectPrepItems(meetingId: number, studentId: number): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  const last90d = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  const [progressCheck, goalsCheck, parentCheck, attendeesCheck, pwnCheck, meetingCheck, accomCheck] = await Promise.all([
    db.select({ cnt: count() }).from(dataSessionsTable)
      .where(and(eq(dataSessionsTable.studentId, studentId), gte(dataSessionsTable.sessionDate, last90d))),
    db.select({ cnt: count() }).from(iepGoalsTable)
      .where(and(eq(iepGoalsTable.studentId, studentId), eq(iepGoalsTable.active, true))),
    db.select({ cnt: count() }).from(parentMessagesTable)
      .where(and(
        eq(parentMessagesTable.studentId, studentId),
        eq(parentMessagesTable.senderType, "staff"),
        gte(parentMessagesTable.createdAt, new Date(Date.now() - 30 * 86400000)),
      )),
    db.select({ cnt: count() }).from(iepMeetingAttendeesTable)
      .where(eq(iepMeetingAttendeesTable.meetingId, meetingId)),
    db.select({ cnt: count() }).from(priorWrittenNoticesTable)
      .where(eq(priorWrittenNoticesTable.meetingId, meetingId)),
    db.select({ location: teamMeetingsTable.location, agendaItems: teamMeetingsTable.agendaItems })
      .from(teamMeetingsTable).where(eq(teamMeetingsTable.id, meetingId)),
    db.select({ cnt: count() }).from(iepAccommodationsTable)
      .where(eq(iepAccommodationsTable.studentId, studentId)),
  ]);

  results.gather_progress_data = (progressCheck[0]?.cnt ?? 0) > 0;
  results.draft_review_goals = (goalsCheck[0]?.cnt ?? 0) > 0;
  results.contact_parent = (parentCheck[0]?.cnt ?? 0) > 0;
  results.confirm_attendance = (attendeesCheck[0]?.cnt ?? 0) >= 2;
  results.prepare_pwn = (pwnCheck[0]?.cnt ?? 0) > 0;
  results.set_location = !!(meetingCheck[0]?.location);
  results.review_accommodations = (accomCheck[0]?.cnt ?? 0) > 0;
  const agendaArr = meetingCheck[0]?.agendaItems;
  results.prepare_agenda = Array.isArray(agendaArr) && agendaArr.length > 0;

  return results;
}

router.get("/iep-meetings/:id/prep", meetingAccess, async (req, res): Promise<void> => {
  try {
    const meetingId = parseInt(req.params.id);
    if (isNaN(meetingId)) { res.status(400).json({ error: "Invalid meeting ID" }); return; }

    const [meeting] = await db.select({
      id: teamMeetingsTable.id,
      studentId: teamMeetingsTable.studentId,
      meetingType: teamMeetingsTable.meetingType,
      scheduledDate: teamMeetingsTable.scheduledDate,
    }).from(teamMeetingsTable).where(eq(teamMeetingsTable.id, meetingId));

    if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }

    let items = await db.select().from(meetingPrepItemsTable)
      .where(eq(meetingPrepItemsTable.meetingId, meetingId))
      .orderBy(asc(meetingPrepItemsTable.sortOrder));

    if (items.length === 0) {
      const toInsert = DEFAULT_PREP_ITEMS.map(item => ({
        meetingId,
        ...item,
        autoDetected: false,
        completedAt: null,
        completedByStaffId: null,
        notes: null,
      }));
      items = await db.insert(meetingPrepItemsTable).values(toInsert).onConflictDoNothing().returning();
      if (items.length === 0) {
        items = await db.select().from(meetingPrepItemsTable)
          .where(eq(meetingPrepItemsTable.meetingId, meetingId))
          .orderBy(asc(meetingPrepItemsTable.sortOrder));
      } else {
        items.sort((a, b) => a.sortOrder - b.sortOrder);
      }
    }

    const autoStatus = await autoDetectPrepItems(meetingId, meeting.studentId);

    const now = new Date();
    for (const item of items) {
      const detected = autoStatus[item.itemType] ?? false;
      if (detected && !item.completedAt && !item.autoDetected && !item.manuallyUnchecked) {
        await db.update(meetingPrepItemsTable)
          .set({ autoDetected: true, completedAt: now })
          .where(eq(meetingPrepItemsTable.id, item.id));
        item.autoDetected = true;
        item.completedAt = now;
      }
    }

    const completedCount = items.filter(i => i.completedAt !== null).length;
    const requiredItems = items.filter(i => i.required);
    const requiredCompleted = requiredItems.filter(i => i.completedAt !== null).length;

    res.json({
      meetingId,
      studentId: meeting.studentId,
      meetingType: meeting.meetingType,
      scheduledDate: meeting.scheduledDate,
      items: items.map(i => ({
        ...i,
        completedAt: i.completedAt?.toISOString() ?? null,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      })),
      readiness: {
        total: items.length,
        completed: completedCount,
        percentage: items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0,
        requiredTotal: requiredItems.length,
        requiredCompleted,
        requiredPercentage: requiredItems.length > 0 ? Math.round((requiredCompleted / requiredItems.length) * 100) : 0,
      },
    });
  } catch (e: unknown) {
    console.error("GET /iep-meetings/:id/prep error:", e);
    res.status(500).json({ error: "Failed to fetch meeting prep" });
  }
});

router.patch("/iep-meetings/:id/prep/:itemId", meetingAccess, async (req, res): Promise<void> => {
  try {
    const meetingId = parseInt(req.params.id);
    const itemId = parseInt(req.params.itemId);
    if (isNaN(meetingId) || isNaN(itemId)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const { completed, notes } = req.body as { completed?: boolean; notes?: string };
    const authedReq = req as AuthedRequest;

    const updateData: Record<string, unknown> = {};
    if (completed === true) {
      updateData.completedAt = new Date();
      updateData.completedByStaffId = authedReq.tenantStaffId ?? null;
      updateData.autoDetected = false;
      updateData.manuallyUnchecked = false;
    } else if (completed === false) {
      updateData.completedAt = null;
      updateData.completedByStaffId = null;
      updateData.autoDetected = false;
      updateData.manuallyUnchecked = true;
    }
    if (notes !== undefined) {
      if (typeof notes === "string" && notes.length > 2000) {
        res.status(400).json({ error: "Notes must be 2000 characters or less" }); return;
      }
      updateData.notes = notes;
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ error: "No updates provided" }); return;
    }

    const [row] = await db.update(meetingPrepItemsTable)
      .set(updateData)
      .where(and(eq(meetingPrepItemsTable.id, itemId), eq(meetingPrepItemsTable.meetingId, meetingId)))
      .returning();

    if (!row) { res.status(404).json({ error: "Prep item not found" }); return; }

    logAudit(req, { action: "update", targetTable: "meeting_prep_items", targetId: itemId, summary: `${completed ? "Completed" : "Unchecked"} prep item: ${row.label}` });
    res.json({ ...row, completedAt: row.completedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  } catch (e: unknown) {
    console.error("PATCH prep/:itemId error:", e);
    res.status(500).json({ error: "Failed to update prep item" });
  }
});

router.get("/iep-meetings/:id/agenda", meetingAccess, async (req, res): Promise<void> => {
  try {
    const meetingId = parseInt(req.params.id);
    if (isNaN(meetingId)) { res.status(400).json({ error: "Invalid meeting ID" }); return; }

    const [meeting] = await db.select({
      id: teamMeetingsTable.id,
      studentId: teamMeetingsTable.studentId,
      meetingType: teamMeetingsTable.meetingType,
      scheduledDate: teamMeetingsTable.scheduledDate,
      scheduledTime: teamMeetingsTable.scheduledTime,
      location: teamMeetingsTable.location,
      agendaItems: teamMeetingsTable.agendaItems,
    }).from(teamMeetingsTable).where(eq(teamMeetingsTable.id, meetingId));

    if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }

    const [student] = await db.select({
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      grade: studentsTable.grade,
    }).from(studentsTable).where(eq(studentsTable.id, meeting.studentId));

    const last90d = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

    const [goals, attendees, accommodations] = await Promise.all([
      db.select({
        id: iepGoalsTable.id,
        goalArea: iepGoalsTable.goalArea,
        goalNumber: iepGoalsTable.goalNumber,
        annualGoal: iepGoalsTable.annualGoal,
        status: iepGoalsTable.status,
        programTargetId: iepGoalsTable.programTargetId,
        behaviorTargetId: iepGoalsTable.behaviorTargetId,
        baseline: iepGoalsTable.baseline,
        targetCriterion: iepGoalsTable.targetCriterion,
        measurementMethod: iepGoalsTable.measurementMethod,
      }).from(iepGoalsTable)
        .where(and(eq(iepGoalsTable.studentId, meeting.studentId), eq(iepGoalsTable.active, true)))
        .orderBy(asc(iepGoalsTable.goalArea), asc(iepGoalsTable.goalNumber)),
      db.select({
        id: iepMeetingAttendeesTable.id,
        name: iepMeetingAttendeesTable.name,
        role: iepMeetingAttendeesTable.role,
        rsvpStatus: iepMeetingAttendeesTable.rsvpStatus,
      }).from(iepMeetingAttendeesTable)
        .where(eq(iepMeetingAttendeesTable.meetingId, meetingId)),
      db.select({
        id: iepAccommodationsTable.id,
        category: iepAccommodationsTable.category,
        description: iepAccommodationsTable.description,
      }).from(iepAccommodationsTable)
        .where(eq(iepAccommodationsTable.studentId, meeting.studentId)),
    ]);

    const programTargetIds = goals.filter(g => g.programTargetId).map(g => g.programTargetId as number);
    const behaviorTargetIds = goals.filter(g => g.behaviorTargetId).map(g => g.behaviorTargetId as number);

    const [programDataRows, behaviorDataRows] = await Promise.all([
      programTargetIds.length > 0
        ? db.select({
            targetId: programDataTable.programTargetId,
            value: programDataTable.percentCorrect,
            date: dataSessionsTable.sessionDate,
          })
          .from(programDataTable)
          .innerJoin(dataSessionsTable, eq(programDataTable.dataSessionId, dataSessionsTable.id))
          .where(and(
            inArray(programDataTable.programTargetId, programTargetIds),
            gte(dataSessionsTable.sessionDate, last90d),
          ))
          .orderBy(desc(dataSessionsTable.sessionDate))
        : Promise.resolve([]),
      behaviorTargetIds.length > 0
        ? db.select({
            targetId: behaviorDataTable.behaviorTargetId,
            value: behaviorDataTable.value,
            date: dataSessionsTable.sessionDate,
          })
          .from(behaviorDataTable)
          .innerJoin(dataSessionsTable, eq(behaviorDataTable.dataSessionId, dataSessionsTable.id))
          .where(and(
            inArray(behaviorDataTable.behaviorTargetId, behaviorTargetIds),
            gte(dataSessionsTable.sessionDate, last90d),
          ))
          .orderBy(desc(dataSessionsTable.sessionDate))
        : Promise.resolve([]),
    ]);

    const progressByGoalId: Record<number, { dataPoints: number; latestValue: number | null; trend: string }> = {};
    for (const goal of goals) {
      let dataPoints: { value: number | null; date: string }[] = [];
      if (goal.programTargetId) {
        dataPoints = programDataRows
          .filter(r => r.targetId === goal.programTargetId)
          .map(r => ({ value: r.value !== null ? parseFloat(String(r.value)) : null, date: r.date }));
      } else if (goal.behaviorTargetId) {
        dataPoints = behaviorDataRows
          .filter(r => r.targetId === goal.behaviorTargetId)
          .map(r => ({ value: r.value !== null ? parseFloat(String(r.value)) : null, date: r.date }));
      }
      const count = dataPoints.length;
      const latestValue = count > 0 ? dataPoints[0].value : null;
      let trend = "no_data";
      if (count >= 3) {
        const recent = dataPoints.slice(0, 3).filter(d => d.value !== null).map(d => d.value as number);
        const older = dataPoints.slice(Math.max(0, count - 3)).filter(d => d.value !== null).map(d => d.value as number);
        if (recent.length > 0 && older.length > 0) {
          const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
          const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
          trend = recentAvg > olderAvg + 5 ? "improving" : recentAvg < olderAvg - 5 ? "declining" : "stable";
        }
      } else if (count > 0) {
        trend = "limited_data";
      }
      progressByGoalId[goal.id] = { dataPoints: count, latestValue, trend };
    }

    const meetingTypeLabels: Record<string, string> = {
      annual_review: "Annual IEP Review",
      initial_iep: "Initial IEP Meeting",
      amendment: "IEP Amendment Meeting",
      reevaluation: "Re-evaluation Meeting",
      transition: "Transition Planning Meeting",
      manifestation_determination: "Manifestation Determination",
      eligibility: "Eligibility Determination",
      progress_review: "Progress Review Meeting",
      other: "Team Meeting",
    };

    const sections: { title: string; items: string[] }[] = [
      {
        title: "Opening",
        items: [
          "Welcome and introductions",
          "Review purpose and procedural safeguards",
          "Review meeting agenda",
        ],
      },
      {
        title: "Current Performance & Progress Summary",
        items: [
          `Review ${student?.firstName ?? "student"}'s present levels of performance`,
          `Current goals status: ${goals.length} active goal${goals.length !== 1 ? "s" : ""}`,
          ...goals.slice(0, 8).map(g => {
            const p = progressByGoalId[g.id];
            const trendLabel = p?.trend === "improving" ? "↑ Improving" : p?.trend === "declining" ? "↓ Declining" : p?.trend === "stable" ? "→ Stable" : p?.trend === "limited_data" ? "Limited data" : "No data";
            const valueStr = p?.latestValue !== null && p?.latestValue !== undefined ? ` (latest: ${p.latestValue}%)` : "";
            return `${g.goalArea} Goal #${g.goalNumber}: ${g.annualGoal?.slice(0, 60)}${(g.annualGoal?.length ?? 0) > 60 ? "..." : ""} — ${trendLabel}${valueStr}`;
          }),
        ],
      },
    ];

    if (accommodations.length > 0) {
      sections.push({
        title: "Accommodations Review",
        items: [
          `Review ${accommodations.length} current accommodation${accommodations.length !== 1 ? "s" : ""}`,
          "Discuss effectiveness and any needed changes",
        ],
      });
    }

    if (meeting.meetingType === "annual_review" || meeting.meetingType === "initial_iep") {
      sections.push({
        title: "Goal Development",
        items: [
          "Review and revise annual goals",
          "Discuss benchmarks and measurement methods",
          "Determine service delivery needs",
        ],
      });
    }

    if (meeting.meetingType === "transition" || meeting.meetingType === "annual_review") {
      sections.push({
        title: "Transition Planning",
        items: [
          "Review post-secondary goals",
          "Discuss transition services and agency referrals",
        ],
      });
    }

    sections.push({
      title: "Services & Placement",
      items: [
        "Review current service delivery model",
        "Discuss any changes to services or placement",
        "Review least restrictive environment considerations",
      ],
    });

    sections.push({
      title: "Closing",
      items: [
        "Summarize decisions and action items",
        "Review Prior Written Notice",
        "Obtain parent consent if applicable",
        "Schedule follow-up meeting if needed",
      ],
    });

    const goalProgressSummaries = goals.map(g => {
      const p = progressByGoalId[g.id];
      return {
        goalId: g.id,
        goalArea: g.goalArea,
        goalNumber: g.goalNumber,
        annualGoal: g.annualGoal,
        status: g.status,
        baseline: g.baseline,
        targetCriterion: g.targetCriterion,
        measurementMethod: g.measurementMethod,
        dataPoints: p?.dataPoints ?? 0,
        latestValue: p?.latestValue ?? null,
        trend: p?.trend ?? "no_data",
      };
    });

    res.json({
      meetingId,
      meetingType: meeting.meetingType,
      meetingTypeLabel: meetingTypeLabels[meeting.meetingType] ?? meeting.meetingType,
      scheduledDate: meeting.scheduledDate,
      scheduledTime: meeting.scheduledTime,
      location: meeting.location,
      studentName: student ? `${student.firstName} ${student.lastName}` : "Unknown",
      studentGrade: student?.grade ?? null,
      attendees: attendees.map(a => ({ name: a.name, role: a.role, rsvpStatus: a.rsvpStatus })),
      goalsCount: goals.length,
      accommodationsCount: accommodations.length,
      sections,
      goalProgressSummaries,
      customAgendaItems: meeting.agendaItems ?? [],
    });
  } catch (e: unknown) {
    console.error("GET /iep-meetings/:id/agenda error:", e);
    res.status(500).json({ error: "Failed to generate agenda" });
  }
});

export default router;
