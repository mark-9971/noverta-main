// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  teamMeetingsTable, studentsTable, staffTable,
  priorWrittenNoticesTable, meetingConsentRecordsTable,
  iepDocumentsTable, meetingPrepItemsTable, dataSessionsTable,
  iepGoalsTable, parentMessagesTable, iepMeetingAttendeesTable,
  iepAccommodationsTable,
} from "@workspace/db";
import { eq, and, asc, count, gte } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { logAudit } from "../../lib/auditLog";
import { getActiveSchoolYearIdForStudent } from "../../lib/activeSchoolYear";
import { meetingAccess } from "./shared";
import { assertTeamMeetingInCallerDistrict } from "../../lib/districtScope";

const router: IRouter = Router();

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

router.post("/iep-meetings/:id/complete", meetingAccess, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid meeting ID" }); return; }
    if (!(await assertTeamMeetingInCallerDistrict(req as unknown as AuthedRequest, id, res))) return;

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

export const DEFAULT_PREP_ITEMS = [
  { itemType: "gather_progress_data", label: "Gather progress data", description: "Review recent session data and goal progress for all IEP goals", required: true, sortOrder: 1 },
  { itemType: "draft_review_goals", label: "Draft/review IEP goals", description: "Ensure all annual goals are drafted or reviewed with current data", required: true, sortOrder: 2 },
  { itemType: "contact_parent", label: "Contact parent/guardian", description: "Send meeting invitation and confirm parent attendance", required: true, sortOrder: 3 },
  { itemType: "confirm_attendance", label: "Confirm team attendance", description: "Add all required team members and confirm availability", required: true, sortOrder: 4 },
  { itemType: "prepare_pwn", label: "Prepare Prior Written Notice", description: "Draft PWN with proposed actions and rationale", required: true, sortOrder: 5 },
  { itemType: "set_location", label: "Set meeting location", description: "Reserve room or set up virtual meeting link", required: false, sortOrder: 6 },
  { itemType: "review_accommodations", label: "Review accommodations", description: "Review current accommodations for discussion at meeting", required: false, sortOrder: 7 },
  { itemType: "prepare_agenda", label: "Prepare meeting agenda", description: "Create or review the meeting agenda items", required: false, sortOrder: 8 },
];

export async function autoDetectPrepItems(meetingId: number, studentId: number): Promise<Record<string, boolean>> {
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

export default router;
