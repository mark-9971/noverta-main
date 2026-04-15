import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  complianceEventsTable, goalBankTable, teamMeetingsTable,
  iepDocumentsTable, studentsTable, staffTable
} from "@workspace/db";
import { eq, desc, asc, and, sql, ilike, or, lte, gte } from "drizzle-orm";
import { getPublicMeta } from "../lib/clerkClaims";

const router: IRouter = Router();

router.get("/compliance-timeline", async (req, res): Promise<void> => {
  try {
    const { status, limit: limitParam } = req.query;
    const conditions: any[] = [];
    if (status && status !== "all") {
      conditions.push(eq(complianceEventsTable.status, status as string));
    }

    const events = await db.select({
      event: complianceEventsTable,
      student: {
        id: studentsTable.id,
        firstName: studentsTable.firstName,
        lastName: studentsTable.lastName,
        grade: studentsTable.grade,
      },
    })
      .from(complianceEventsTable)
      .innerJoin(studentsTable, eq(complianceEventsTable.studentId, studentsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(complianceEventsTable.dueDate))
      .limit(Number(limitParam) || 200);

    const today = new Date().toISOString().split("T")[0];
    const enriched = events.map(({ event, student }) => {
      const dueDate = event.dueDate;
      const daysRemaining = Math.ceil((new Date(dueDate).getTime() - new Date(today).getTime()) / 86400000);
      let computedStatus = event.status;
      if (event.status !== "completed") {
        if (daysRemaining < 0) computedStatus = "overdue";
        else if (daysRemaining <= 30) computedStatus = "due_soon";
        else computedStatus = "upcoming";
      }
      return {
        ...event,
        student,
        daysRemaining,
        computedStatus,
        createdAt: event.createdAt.toISOString(),
        updatedAt: event.updatedAt.toISOString(),
      };
    });

    res.json(enriched);
  } catch (e: any) {
    console.error("GET compliance-timeline error:", e);
    res.status(500).json({ error: "Failed to fetch compliance timeline" });
  }
});

router.get("/students/:studentId/compliance-events", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const events = await db.select().from(complianceEventsTable)
      .where(eq(complianceEventsTable.studentId, studentId))
      .orderBy(asc(complianceEventsTable.dueDate));

    const today = new Date().toISOString().split("T")[0];
    const enriched = events.map(event => {
      const daysRemaining = Math.ceil((new Date(event.dueDate).getTime() - new Date(today).getTime()) / 86400000);
      let computedStatus = event.status;
      if (event.status !== "completed") {
        if (daysRemaining < 0) computedStatus = "overdue";
        else if (daysRemaining <= 30) computedStatus = "due_soon";
        else computedStatus = "upcoming";
      }
      return { ...event, daysRemaining, computedStatus, createdAt: event.createdAt.toISOString(), updatedAt: event.updatedAt.toISOString() };
    });
    res.json(enriched);
  } catch (e: any) {
    console.error("GET student compliance-events error:", e);
    res.status(500).json({ error: "Failed to fetch compliance events" });
  }
});

router.post("/students/:studentId/compliance-events", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { eventType, title, dueDate, notes } = req.body;
    if (!eventType || !title || !dueDate) {
      res.status(400).json({ error: "eventType, title, and dueDate are required" });
      return;
    }
    const [event] = await db.insert(complianceEventsTable).values({
      studentId, eventType, title, dueDate, notes: notes || null, status: "upcoming",
    }).returning();
    res.status(201).json({ ...event, createdAt: event.createdAt.toISOString(), updatedAt: event.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("POST compliance-event error:", e);
    res.status(500).json({ error: "Failed to create compliance event" });
  }
});

router.patch("/compliance-events/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);

    if (req.body.status === "completed" && req.body.resolve !== true) {
      res.status(400).json({ error: "Cannot set status to completed directly. Use resolve:true with resolutionNote." });
      return;
    }

    const updates: Record<string, unknown> = {};
    for (const key of ["status", "completedDate", "notes", "title", "dueDate"]) {
      if (req.body[key] !== undefined && req.body[key] !== "completed") updates[key] = req.body[key];
    }
    if (req.body.resolve === true) {
      const resolutionNote = req.body.resolutionNote?.trim();
      if (!resolutionNote) {
        res.status(400).json({ error: "resolutionNote is required when resolving a compliance event" });
        return;
      }
      const actorStaffId = getPublicMeta(req).staffId ?? null;
      const now = new Date().toISOString();
      updates.status = "completed";
      updates.resolvedAt = now;
      updates.completedDate = now.split("T")[0];
      updates.resolutionNote = resolutionNote;
      if (actorStaffId) updates.resolvedBy = actorStaffId;
    }
    const [updated] = await db.update(complianceEventsTable).set(updates).where(eq(complianceEventsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("PATCH compliance-event error:", e);
    res.status(500).json({ error: "Failed to update compliance event" });
  }
});

router.post("/compliance-events/recalculate", async (req, res): Promise<void> => {
  try {
    const students = await db.select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
    }).from(studentsTable).where(eq(studentsTable.status, "active"));

    const allDocs = await db.select().from(iepDocumentsTable)
      .where(eq(iepDocumentsTable.active, true))
      .orderBy(desc(iepDocumentsTable.iepEndDate));

    const docByStudent = new Map<number, typeof allDocs[0]>();
    for (const doc of allDocs) {
      if (!docByStudent.has(doc.studentId)) docByStudent.set(doc.studentId, doc);
    }

    const allEvents = await db.select().from(complianceEventsTable);
    const eventsByStudent = new Map<number, Set<string>>();
    for (const ev of allEvents) {
      if (!eventsByStudent.has(ev.studentId)) eventsByStudent.set(ev.studentId, new Set());
      eventsByStudent.get(ev.studentId)!.add(ev.eventType);
    }

    const newEvents: any[] = [];
    for (const student of students) {
      const doc = docByStudent.get(student.id);
      if (!doc) continue;
      const existingTypes = eventsByStudent.get(student.id) ?? new Set();

      if (!existingTypes.has("annual_review")) {
        newEvents.push({
          studentId: student.id,
          eventType: "annual_review",
          title: `Annual IEP Review — ${student.firstName} ${student.lastName}`,
          dueDate: doc.iepEndDate,
          status: "upcoming",
        });
      }

      if (!existingTypes.has("reeval_3yr")) {
        const reevalDate = new Date(doc.iepStartDate);
        reevalDate.setFullYear(reevalDate.getFullYear() + 3);
        newEvents.push({
          studentId: student.id,
          eventType: "reeval_3yr",
          title: `3-Year Reevaluation — ${student.firstName} ${student.lastName}`,
          dueDate: reevalDate.toISOString().split("T")[0],
          status: "upcoming",
        });
      }
    }

    if (newEvents.length > 0) {
      await db.insert(complianceEventsTable).values(newEvents);
    }

    res.json({ message: `Recalculated compliance events`, created: newEvents.length, studentsProcessed: students.length });
  } catch (e: any) {
    console.error("POST recalculate error:", e);
    res.status(500).json({ error: "Failed to recalculate compliance events" });
  }
});

router.get("/goal-bank", async (req, res): Promise<void> => {
  try {
    const { domain, goalArea, search, gradeRange } = req.query;
    const conditions: any[] = [eq(goalBankTable.active, true)];
    if (domain) conditions.push(eq(goalBankTable.domain, domain as string));
    if (goalArea) conditions.push(eq(goalBankTable.goalArea, goalArea as string));
    if (search) {
      conditions.push(or(
        ilike(goalBankTable.goalText, `%${search}%`),
        ilike(goalBankTable.tags, `%${search}%`),
        ilike(goalBankTable.goalArea, `%${search}%`)
      ));
    }

    const goals = await db.select().from(goalBankTable)
      .where(and(...conditions))
      .orderBy(asc(goalBankTable.domain), asc(goalBankTable.goalArea));

    const domains = [...new Set(goals.map(g => g.domain))];
    const goalAreas = [...new Set(goals.map(g => g.goalArea))];

    res.json({ goals, domains, goalAreas, total: goals.length });
  } catch (e: any) {
    console.error("GET goal-bank error:", e);
    res.status(500).json({ error: "Failed to fetch goal bank" });
  }
});

router.get("/students/:studentId/iep-documents/:docId/completeness", async (req, res): Promise<void> => {
  try {
    const docId = parseInt(req.params.docId);
    const studentId = parseInt(req.params.studentId);

    const [doc] = await db.select().from(iepDocumentsTable).where(eq(iepDocumentsTable.id, docId));
    if (!doc) { res.status(404).json({ error: "IEP document not found" }); return; }
    if (doc.studentId !== studentId) { res.status(403).json({ error: "Document does not belong to this student" }); return; }

    const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));

    const checks: { section: string; field: string; label: string; complete: boolean }[] = [
      { section: "Dates", field: "iepStartDate", label: "IEP Start Date", complete: !!doc.iepStartDate },
      { section: "Dates", field: "iepEndDate", label: "IEP End Date", complete: !!doc.iepEndDate },
      { section: "Dates", field: "meetingDate", label: "Meeting Date", complete: !!doc.meetingDate },
      { section: "Concerns & Vision", field: "studentConcerns", label: "Student Concerns", complete: !!doc.studentConcerns?.trim() },
      { section: "Concerns & Vision", field: "parentConcerns", label: "Parent Concerns", complete: !!doc.parentConcerns?.trim() },
      { section: "Concerns & Vision", field: "teamVision", label: "Team Vision Statement", complete: !!doc.teamVision?.trim() },
      { section: "PLAAFP", field: "plaafpAcademic", label: "Academic Performance (PLAAFP A)", complete: !!doc.plaafpAcademic?.trim() },
      { section: "PLAAFP", field: "plaafpBehavioral", label: "Behavioral/Social-Emotional (PLAAFP B)", complete: !!doc.plaafpBehavioral?.trim() },
      { section: "PLAAFP", field: "plaafpCommunication", label: "Communication (PLAAFP C)", complete: !!doc.plaafpCommunication?.trim() },
      { section: "ESY", field: "esyEligible", label: "ESY Eligibility Determination", complete: doc.esyEligible !== null },
      { section: "Assessment", field: "assessmentParticipation", label: "Assessment Participation", complete: !!doc.assessmentParticipation?.trim() },
    ];

    if (student?.dateOfBirth) {
      const age = Math.floor((Date.now() - new Date(student.dateOfBirth).getTime()) / (365.25 * 86400000));
      if (age >= 14) {
        checks.push(
          { section: "Transition", field: "transitionAssessment", label: "Transition Assessment", complete: !!doc.transitionAssessment?.trim() },
          { section: "Transition", field: "transitionPostsecGoals", label: "Postsecondary Goals", complete: !!doc.transitionPostsecGoals?.trim() },
          { section: "Transition", field: "transitionServices", label: "Transition Services", complete: !!doc.transitionServices?.trim() },
        );
      }
    }

    const completedCount = checks.filter(c => c.complete).length;
    const totalCount = checks.length;
    const percentage = Math.round((completedCount / totalCount) * 100);

    const missingSections = checks.filter(c => !c.complete).map(c => ({ section: c.section, label: c.label }));
    const sectionSummary: Record<string, { total: number; completed: number }> = {};
    for (const c of checks) {
      if (!sectionSummary[c.section]) sectionSummary[c.section] = { total: 0, completed: 0 };
      sectionSummary[c.section].total++;
      if (c.complete) sectionSummary[c.section].completed++;
    }

    res.json({
      percentage,
      completedCount,
      totalCount,
      isComplete: percentage === 100,
      missingSections,
      sectionSummary,
      checks,
    });
  } catch (e: any) {
    console.error("GET completeness error:", e);
    res.status(500).json({ error: "Failed to check completeness" });
  }
});

router.post("/students/:studentId/iep-documents/:docId/amend", async (req, res): Promise<void> => {
  try {
    const docId = parseInt(req.params.docId);
    const studentId = parseInt(req.params.studentId);
    const { amendmentReason } = req.body;

    const [originalDoc] = await db.select().from(iepDocumentsTable).where(eq(iepDocumentsTable.id, docId));
    if (!originalDoc) { res.status(404).json({ error: "IEP document not found" }); return; }
    if (originalDoc.studentId !== studentId) { res.status(403).json({ error: "Document does not belong to this student" }); return; }

    const { id, createdAt, updatedAt, ...docFields } = originalDoc;

    const [amendment] = await db.insert(iepDocumentsTable).values({
      ...docFields,
      studentId,
      iepType: "amendment",
      version: (originalDoc.version || 1) + 1,
      amendmentOf: docId,
      amendmentReason: amendmentReason || null,
      status: "draft",
      active: false,
    }).returning();

    res.status(201).json({ ...amendment, createdAt: amendment.createdAt.toISOString(), updatedAt: amendment.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("POST amend error:", e);
    res.status(500).json({ error: "Failed to create amendment" });
  }
});

router.get("/students/:studentId/team-meetings", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const meetings = await db.select().from(teamMeetingsTable)
      .where(eq(teamMeetingsTable.studentId, studentId))
      .orderBy(desc(teamMeetingsTable.scheduledDate));
    res.json(meetings.map(m => ({ ...m, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() })));
  } catch (e: any) {
    console.error("GET team-meetings error:", e);
    res.status(500).json({ error: "Failed to fetch team meetings" });
  }
});

router.post("/students/:studentId/team-meetings", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { meetingType, scheduledDate, scheduledTime, location, notes, attendees, consentStatus, noticeSentDate } = req.body;
    if (!meetingType || !scheduledDate) {
      res.status(400).json({ error: "meetingType and scheduledDate are required" });
      return;
    }
    const [meeting] = await db.insert(teamMeetingsTable).values({
      studentId, meetingType, scheduledDate,
      scheduledTime: scheduledTime || null,
      location: location || null,
      notes: notes || null,
      attendees: attendees || null,
      consentStatus: consentStatus || null,
      noticeSentDate: noticeSentDate || null,
      status: "scheduled",
    }).returning();
    res.status(201).json({ ...meeting, createdAt: meeting.createdAt.toISOString(), updatedAt: meeting.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("POST team-meeting error:", e);
    res.status(500).json({ error: "Failed to create team meeting" });
  }
});

router.patch("/team-meetings/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const updates: any = {};
    for (const key of ["meetingType", "scheduledDate", "scheduledTime", "duration", "location", "meetingFormat", "status", "agendaItems", "notes", "attendees", "actionItems", "outcome", "followUpDate", "minutesFinalized", "consentStatus", "noticeSentDate"]) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const [updated] = await db.update(teamMeetingsTable).set(updates).where(eq(teamMeetingsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("PATCH team-meeting error:", e);
    res.status(500).json({ error: "Failed to update team meeting" });
  }
});

router.delete("/team-meetings/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(teamMeetingsTable).where(eq(teamMeetingsTable.id, id));
    res.json({ success: true });
  } catch (e: any) {
    console.error("DELETE team-meeting error:", e);
    res.status(500).json({ error: "Failed to delete team meeting" });
  }
});

router.get("/dashboard/compliance-deadlines", async (req, res): Promise<void> => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const thirtyDaysStr = thirtyDays.toISOString().split("T")[0];

    const events = await db.select({
      event: complianceEventsTable,
      student: {
        id: studentsTable.id,
        firstName: studentsTable.firstName,
        lastName: studentsTable.lastName,
        grade: studentsTable.grade,
      },
    })
      .from(complianceEventsTable)
      .innerJoin(studentsTable, eq(complianceEventsTable.studentId, studentsTable.id))
      .where(and(
        sql`${complianceEventsTable.status} != 'completed'`,
        lte(complianceEventsTable.dueDate, thirtyDaysStr),
      ))
      .orderBy(asc(complianceEventsTable.dueDate))
      .limit(20);

    const enriched = events.map(({ event, student }) => {
      const daysRemaining = Math.ceil((new Date(event.dueDate).getTime() - new Date(today).getTime()) / 86400000);
      return {
        ...event,
        student,
        daysRemaining,
        computedStatus: daysRemaining < 0 ? "overdue" : daysRemaining <= 7 ? "critical" : "due_soon",
        createdAt: event.createdAt.toISOString(),
        updatedAt: event.updatedAt.toISOString(),
      };
    });

    const overdue = enriched.filter(e => e.computedStatus === "overdue").length;
    const critical = enriched.filter(e => e.computedStatus === "critical").length;
    const dueSoon = enriched.filter(e => e.computedStatus === "due_soon").length;

    res.json({ events: enriched, summary: { overdue, critical, dueSoon, total: enriched.length } });
  } catch (e: any) {
    console.error("GET compliance-deadlines error:", e);
    res.status(500).json({ error: "Failed to fetch compliance deadlines" });
  }
});

export default router;
