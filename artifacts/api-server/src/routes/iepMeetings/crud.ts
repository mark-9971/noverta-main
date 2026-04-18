// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  teamMeetingsTable, studentsTable, staffTable, schoolsTable,
  iepMeetingAttendeesTable, emailDeliveriesTable,
  priorWrittenNoticesTable, meetingConsentRecordsTable,
} from "@workspace/db";
import { eq, and, desc, asc, gte, lte, inArray } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { logAudit } from "../../lib/auditLog";
import { getActiveSchoolYearIdForStudent } from "../../lib/activeSchoolYear";
import { meetingAccess, MEETING_TYPES, MEETING_STATUSES, pick } from "./shared";
import {
  assertStudentInCallerDistrict, assertSchoolInCallerDistrict,
  assertIepDocumentInCallerDistrict, assertTeamMeetingInCallerDistrict,
  allStaffInCallerDistrict,
} from "../../lib/districtScope";
import { sendParentFacingEmail, buildIepMeetingInvitationEmail } from "../../lib/email";

/**
 * Send meeting invitation emails to all attendees who have an email address.
 * Non-blocking / best-effort: failures are logged but do not abort the route.
 */
async function sendMeetingInvitations(
  meetingId: number,
  studentName: string,
  meetingType: string,
  scheduledDate: string,
  scheduledTime: string | null | undefined,
  location: string | null | undefined,
  meetingFormat: string | null | undefined,
  agendaItems: string[] | null | undefined,
  schoolName: string | undefined,
  senderName: string | undefined,
  attendees: { name: string; email: string | null }[],
): Promise<void> {
  const emailAttendees = attendees.filter((a) => a.email && /\S+@\S+\.\S+/.test(a.email));
  await Promise.allSettled(
    emailAttendees.map(async (a) => {
      try {
        const { subject, html, text } = buildIepMeetingInvitationEmail({
          recipientName: a.name,
          studentName,
          meetingType,
          scheduledDate,
          scheduledTime,
          location,
          meetingFormat,
          agendaItems: agendaItems ?? null,
          schoolName,
          senderName,
        });
        await sendParentFacingEmail({
          messageType: "iep_meeting_invitation",
          toEmail: a.email!,
          toName: a.name,
          subject,
          bodyHtml: html,
          bodyText: text,
          iepMeetingId: meetingId,
        });
      } catch (err) {
        console.error(`[IEP Meeting] Failed to send invitation to ${a.email}:`, err);
      }
    }),
  );
}

const router: IRouter = Router();

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

    // Batch-fetch email delivery summaries for these meetings.
    const meetingIds = meetings.map((m) => m.meeting.id);
    const deliverySummaryMap = new Map<number, { totalSent: number; delivered: number; bounced: number; pending: number }>();
    if (meetingIds.length > 0) {
      const deliveries = await db
        .select({
          iepMeetingId: emailDeliveriesTable.iepMeetingId,
          status: emailDeliveriesTable.status,
        })
        .from(emailDeliveriesTable)
        .where(inArray(emailDeliveriesTable.iepMeetingId, meetingIds));
      for (const d of deliveries) {
        if (!d.iepMeetingId) continue;
        const s = deliverySummaryMap.get(d.iepMeetingId) ?? { totalSent: 0, delivered: 0, bounced: 0, pending: 0 };
        s.totalSent++;
        if (d.status === "delivered") s.delivered++;
        else if (d.status === "bounced" || d.status === "complained" || d.status === "failed") s.bounced++;
        else s.pending++;
        deliverySummaryMap.set(d.iepMeetingId, s);
      }
    }

    res.json(meetings.map(m => ({
      ...m.meeting,
      studentName: `${m.studentFirstName} ${m.studentLastName}`,
      studentGrade: m.studentGrade,
      schoolName: m.schoolName,
      createdAt: m.meeting.createdAt.toISOString(),
      updatedAt: m.meeting.updatedAt.toISOString(),
      emailDeliverySummary: deliverySummaryMap.get(m.meeting.id) ?? null,
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

    // Body-IDOR defense: every body-supplied FK (student/school/iepDoc/invitees[].staffId)
    // must belong to caller's district before we accept the write.
    const authed = req as AuthedRequest;
    if (!(await assertStudentInCallerDistrict(authed, Number(body.studentId), res))) return;
    if (body.schoolId != null
      && !(await assertSchoolInCallerDistrict(authed, Number(body.schoolId), res))) return;
    if (body.iepDocumentId != null
      && !(await assertIepDocumentInCallerDistrict(authed, Number(body.iepDocumentId), res))) return;
    if (Array.isArray(body.invitees)) {
      const inviteeStaffIds = body.invitees
        .map((inv: Record<string, unknown>) => inv?.staffId)
        .filter((v): v is number | string => v != null)
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n));
      if (inviteeStaffIds.length > 0 && !(await allStaffInCallerDistrict(authed, inviteeStaffIds))) {
        res.status(403).json({ error: "One or more invitees are not in your district" });
        return;
      }
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

    let attendeeList: { name: string; email: string | null }[] = [];
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
      attendeeList = attendeeValues.map((a) => ({ name: a.name, email: a.email }));
    }

    logAudit(req, {
      action: "create",
      targetTable: "team_meetings",
      targetId: row.id,
      studentId: body.studentId,
      summary: `Scheduled ${body.meetingType} meeting for student #${body.studentId} on ${body.scheduledDate}`,
    });

    // Send invitation emails to all attendees who have an email address.
    if (attendeeList.length > 0) {
      const [studentRow] = await db
        .select({ firstName: studentsTable.firstName, lastName: studentsTable.lastName, schoolName: schoolsTable.name })
        .from(studentsTable)
        .leftJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
        .where(eq(studentsTable.id, body.studentId))
        .limit(1);
      const studentName = studentRow ? `${studentRow.firstName} ${studentRow.lastName}` : `Student #${body.studentId}`;
      const schoolName = studentRow?.schoolName ?? undefined;
      void sendMeetingInvitations(
        row.id, studentName, body.meetingType, body.scheduledDate,
        body.scheduledTime ?? null, body.location ?? null, body.meetingFormat ?? null,
        body.agendaItems ?? null, schoolName,
        (req as AuthedRequest).displayName ?? undefined, attendeeList,
      );
    }

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

    // Tenant guard: meeting itself + any iepDocumentId swap must be in district.
    const authed = req as AuthedRequest;
    if (!(await assertTeamMeetingInCallerDistrict(authed, id, res))) return;
    if (req.body?.iepDocumentId != null
      && !(await assertIepDocumentInCallerDistrict(authed, Number(req.body.iepDocumentId), res))) return;

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

    // Re-send invitations if significant fields changed (date, time, location).
    const SIGNIFICANT_FIELDS = new Set(["scheduledDate", "scheduledTime", "location", "meetingFormat"]);
    const hasSignificantChange = Object.keys(updates).some((k) => SIGNIFICANT_FIELDS.has(k));
    if (hasSignificantChange) {
      try {
        const existingAttendees = await db
          .select({ name: iepMeetingAttendeesTable.name, email: iepMeetingAttendeesTable.email })
          .from(iepMeetingAttendeesTable)
          .where(eq(iepMeetingAttendeesTable.meetingId, id));
        const [studentRow] = await db
          .select({ firstName: studentsTable.firstName, lastName: studentsTable.lastName, schoolName: schoolsTable.name })
          .from(studentsTable)
          .leftJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
          .where(eq(studentsTable.id, row.studentId))
          .limit(1);
        const studentName = studentRow ? `${studentRow.firstName} ${studentRow.lastName}` : `Student #${row.studentId}`;
        const schoolName = studentRow?.schoolName ?? undefined;
        void sendMeetingInvitations(
          row.id, studentName, row.meetingType, row.scheduledDate,
          row.scheduledTime, row.location, row.meetingFormat,
          row.agendaItems as string[] | null, schoolName,
          (req as AuthedRequest).displayName ?? undefined,
          existingAttendees.map((a) => ({ name: a.name, email: a.email })),
        );
      } catch (err) {
        console.error("[IEP PATCH] Failed to resend invitations:", err);
      }
    }

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

    // Tenant guard before destructive cascade.
    if (!(await assertTeamMeetingInCallerDistrict(req as AuthedRequest, id, res))) return;

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

export default router;
