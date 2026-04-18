// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  sessionLogsTable,
  staffTable,
  iepDocumentsTable,
  iepGoalsTable,
  complianceEventsTable,
  restraintIncidentsTable,
  communicationEventsTable,
  enrollmentEventsTable,
  progressReportsTable,
} from "@workspace/db";
import { eq, and, lte, gte, desc, sql, isNull, or } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { studentIdParamGuard } from "./idGuard";

const router: IRouter = Router();
router.param("id", studentIdParamGuard);

const JOURNEY_READ_ROLES = ["admin", "case_manager", "sped_teacher", "coordinator", "bcba"] as const;

export type JourneyEventType =
  | "session_delivered"
  | "session_missed"
  | "iep_created"
  | "iep_annual_review"
  | "goal_added"
  | "goal_milestone"
  | "goal_mastered"
  | "compliance_event"
  | "incident"
  | "communication"
  | "enrollment";

export interface JourneyEvent {
  id: string;
  type: JourneyEventType;
  date: string;
  time: string | null;
  title: string;
  description: string;
  linkTo: string | null;
  meta?: Record<string, unknown>;
}

interface JourneyCursor {
  date: string;
  time: string | null;
  id: string;
}

interface GoalProgressEntry {
  iepGoalId?: number;
  goalNumber?: number;
  goalArea?: string;
  annualGoal?: string;
  progressRating?: string;
  progressCode?: string;
  narrative?: string;
}

function isGoalProgressEntry(v: unknown): v is GoalProgressEntry {
  return typeof v === "object" && v !== null;
}

/** Combined sort key for an event. Sort is descending (later = bigger string). */
function eventSortKey(date: string, time: string | null): string {
  return `${date} ${time ?? "00:00"}`;
}

/** Returns true if ev comes AFTER the cursor position in descending (newest-first) order.
 *  In descending order, "after cursor" means the event's sortKey is smaller (older). */
function isAfterCursor(ev: JourneyEvent, cursor: JourneyCursor): boolean {
  const evKey = eventSortKey(ev.date, ev.time);
  const curKey = eventSortKey(cursor.date, cursor.time);
  if (evKey < curKey) return true;
  if (evKey === curKey && ev.id < cursor.id) return true;
  return false;
}

function encodeCursor(c: JourneyCursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

function decodeCursor(s: string): JourneyCursor | null {
  try {
    const obj = JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as unknown;
    if (
      typeof obj === "object" &&
      obj !== null &&
      "date" in obj &&
      "id" in obj &&
      typeof (obj as Record<string, unknown>).date === "string" &&
      typeof (obj as Record<string, unknown>).id === "string"
    ) {
      return {
        date: (obj as Record<string, unknown>).date as string,
        time:
          typeof (obj as Record<string, unknown>).time === "string"
            ? ((obj as Record<string, unknown>).time as string)
            : null,
        id: (obj as Record<string, unknown>).id as string,
      };
    }
    return null;
  } catch {
    return null;
  }
}

router.get("/students/:id/journey", async (req, res): Promise<void> => {
  const authRole = (req as AuthedRequest).trellisRole;
  if (!(JOURNEY_READ_ROLES as readonly string[]).includes(authRole ?? "")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const studentId = Number(req.params.id);
  if (!studentId) {
    res.status(400).json({ error: "Invalid student id" });
    return;
  }

  const limitParam = Math.min(Number(req.query.limit) || 100, 200);

  // Decode cursor if provided
  const cursorRaw = typeof req.query.cursor === "string" ? req.query.cursor : null;
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;

  // Window anchor: cursor date (inclusive) or tomorrow (so today is included)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const anchorDate = cursor ? cursor.date : tomorrow.toISOString().slice(0, 10);

  // Six months back from anchor (exclusive lower bound)
  const sixMonthsBack = new Date(anchorDate + "T00:00:00Z");
  sixMonthsBack.setMonth(sixMonthsBack.getMonth() - 6);
  const afterDate = sixMonthsBack.toISOString().slice(0, 10);

  // When cursor provided: use lte (inclusive of cursor date) so we can filter same-date overflow.
  // When no cursor: use lte(tomorrow) effectively meaning <= tomorrow.
  const beforeInclusiveStr = anchorDate; // used with lte

  const events: JourneyEvent[] = [];

  try {
    const [sessions, iepDocs, iepGoals, complianceEvts, incidents, commEvents, enrollEvts, progReports] =
      await Promise.all([
        // Sessions
        db
          .select({
            id: sessionLogsTable.id,
            sessionDate: sessionLogsTable.sessionDate,
            startTime: sessionLogsTable.startTime,
            status: sessionLogsTable.status,
            durationMinutes: sessionLogsTable.durationMinutes,
            staffFirstName: staffTable.firstName,
            staffLastName: staffTable.lastName,
            notes: sessionLogsTable.notes,
          })
          .from(sessionLogsTable)
          .leftJoin(staffTable, eq(staffTable.id, sessionLogsTable.staffId))
          .where(
            and(
              eq(sessionLogsTable.studentId, studentId),
              isNull(sessionLogsTable.deletedAt),
              gte(sessionLogsTable.sessionDate, afterDate),
              lte(sessionLogsTable.sessionDate, beforeInclusiveStr),
            ),
          )
          .orderBy(desc(sessionLogsTable.sessionDate)),

        // IEP Documents
        db
          .select({
            id: iepDocumentsTable.id,
            iepStartDate: iepDocumentsTable.iepStartDate,
            meetingDate: iepDocumentsTable.meetingDate,
            iepType: iepDocumentsTable.iepType,
            status: iepDocumentsTable.status,
            createdAt: iepDocumentsTable.createdAt,
          })
          .from(iepDocumentsTable)
          .where(
            and(
              eq(iepDocumentsTable.studentId, studentId),
              or(
                and(
                  gte(iepDocumentsTable.meetingDate, afterDate),
                  lte(iepDocumentsTable.meetingDate, beforeInclusiveStr),
                ),
                and(
                  gte(iepDocumentsTable.iepStartDate, afterDate),
                  lte(iepDocumentsTable.iepStartDate, beforeInclusiveStr),
                ),
              ),
            ),
          )
          .orderBy(desc(iepDocumentsTable.createdAt)),

        // IEP Goals
        db
          .select({
            id: iepGoalsTable.id,
            goalArea: iepGoalsTable.goalArea,
            annualGoal: iepGoalsTable.annualGoal,
            status: iepGoalsTable.status,
            startDate: iepGoalsTable.startDate,
            endDate: iepGoalsTable.endDate,
            createdAt: iepGoalsTable.createdAt,
            updatedAt: iepGoalsTable.updatedAt,
          })
          .from(iepGoalsTable)
          .where(
            and(
              eq(iepGoalsTable.studentId, studentId),
              or(
                and(
                  gte(sql`${iepGoalsTable.createdAt}::date`, afterDate),
                  lte(sql`${iepGoalsTable.createdAt}::date`, beforeInclusiveStr),
                ),
                and(
                  gte(sql`${iepGoalsTable.updatedAt}::date`, afterDate),
                  lte(sql`${iepGoalsTable.updatedAt}::date`, beforeInclusiveStr),
                ),
              ),
            ),
          )
          .orderBy(desc(iepGoalsTable.createdAt)),

        // Compliance events
        db
          .select({
            id: complianceEventsTable.id,
            eventType: complianceEventsTable.eventType,
            title: complianceEventsTable.title,
            dueDate: complianceEventsTable.dueDate,
            completedDate: complianceEventsTable.completedDate,
            status: complianceEventsTable.status,
            notes: complianceEventsTable.notes,
          })
          .from(complianceEventsTable)
          .where(
            and(
              eq(complianceEventsTable.studentId, studentId),
              or(
                and(
                  gte(complianceEventsTable.completedDate, afterDate),
                  lte(complianceEventsTable.completedDate, beforeInclusiveStr),
                ),
                and(
                  gte(complianceEventsTable.dueDate, afterDate),
                  lte(complianceEventsTable.dueDate, beforeInclusiveStr),
                ),
              ),
            ),
          )
          .orderBy(
            desc(sql`COALESCE(${complianceEventsTable.completedDate}, ${complianceEventsTable.dueDate})`),
          ),

        // Restraint incidents
        db
          .select({
            id: restraintIncidentsTable.id,
            incidentDate: restraintIncidentsTable.incidentDate,
            incidentTime: restraintIncidentsTable.incidentTime,
            incidentType: restraintIncidentsTable.incidentType,
            status: restraintIncidentsTable.status,
            durationMinutes: restraintIncidentsTable.durationMinutes,
            behaviorDescription: restraintIncidentsTable.behaviorDescription,
          })
          .from(restraintIncidentsTable)
          .where(
            and(
              eq(restraintIncidentsTable.studentId, studentId),
              gte(restraintIncidentsTable.incidentDate, afterDate),
              lte(restraintIncidentsTable.incidentDate, beforeInclusiveStr),
            ),
          )
          .orderBy(desc(restraintIncidentsTable.incidentDate)),

        // Communications
        db
          .select({
            id: communicationEventsTable.id,
            type: communicationEventsTable.type,
            subject: communicationEventsTable.subject,
            status: communicationEventsTable.status,
            sentAt: communicationEventsTable.sentAt,
            toName: communicationEventsTable.toName,
            createdAt: communicationEventsTable.createdAt,
          })
          .from(communicationEventsTable)
          .where(
            and(
              eq(communicationEventsTable.studentId, studentId),
              or(
                and(
                  gte(sql`${communicationEventsTable.sentAt}::date`, afterDate),
                  lte(sql`${communicationEventsTable.sentAt}::date`, beforeInclusiveStr),
                ),
                and(
                  gte(sql`${communicationEventsTable.createdAt}::date`, afterDate),
                  lte(sql`${communicationEventsTable.createdAt}::date`, beforeInclusiveStr),
                ),
              ),
            ),
          )
          .orderBy(desc(communicationEventsTable.createdAt)),

        // Enrollment events
        db
          .select({
            id: enrollmentEventsTable.id,
            eventType: enrollmentEventsTable.eventType,
            eventDate: enrollmentEventsTable.eventDate,
            reason: enrollmentEventsTable.reason,
            notes: enrollmentEventsTable.notes,
          })
          .from(enrollmentEventsTable)
          .where(
            and(
              eq(enrollmentEventsTable.studentId, studentId),
              gte(enrollmentEventsTable.eventDate, afterDate),
              lte(enrollmentEventsTable.eventDate, beforeInclusiveStr),
            ),
          )
          .orderBy(desc(enrollmentEventsTable.eventDate)),

        // Progress reports
        db
          .select({
            id: progressReportsTable.id,
            periodEnd: progressReportsTable.periodEnd,
            goalProgress: progressReportsTable.goalProgress,
            status: progressReportsTable.status,
            createdAt: progressReportsTable.createdAt,
          })
          .from(progressReportsTable)
          .where(
            and(
              eq(progressReportsTable.studentId, studentId),
              or(
                and(
                  gte(progressReportsTable.periodEnd, afterDate),
                  lte(progressReportsTable.periodEnd, beforeInclusiveStr),
                ),
                and(
                  gte(sql`${progressReportsTable.createdAt}::date`, afterDate),
                  lte(sql`${progressReportsTable.createdAt}::date`, beforeInclusiveStr),
                ),
              ),
            ),
          )
          .orderBy(desc(progressReportsTable.createdAt)),
      ]);

    // ── Sessions ──────────────────────────────────────────────────────────────
    for (const s of sessions) {
      const staffName =
        s.staffFirstName && s.staffLastName ? `${s.staffFirstName} ${s.staffLastName}` : "Unknown provider";
      const isDelivered = s.status === "completed";
      events.push({
        id: `session-${s.id}`,
        type: isDelivered ? "session_delivered" : "session_missed",
        date: s.sessionDate,
        time: s.startTime ?? null,
        title: isDelivered ? "Session Delivered" : "Session Missed",
        description: isDelivered
          ? `${s.durationMinutes ?? "?"} min with ${staffName}`
          : `Missed session — ${staffName}${s.notes ? ` · ${s.notes}` : ""}`,
        linkTo: `/students/${studentId}?tab=sessions&sessionId=${s.id}`,
        meta: { staffName, durationMinutes: s.durationMinutes, status: s.status, sessionId: s.id },
      });
    }

    // ── IEP Documents ─────────────────────────────────────────────────────────
    for (const doc of iepDocs) {
      const dateStr = doc.meetingDate ?? doc.iepStartDate ?? doc.createdAt.toISOString().slice(0, 10);
      const isAnnual = doc.iepType === "annual";
      events.push({
        id: `iep-${doc.id}`,
        type: isAnnual ? "iep_annual_review" : "iep_created",
        date: dateStr,
        time: null,
        title: isAnnual
          ? "Annual IEP Review"
          : doc.iepType === "amendment"
            ? "IEP Amendment"
            : "New IEP Created",
        description: `IEP ${doc.status === "draft" ? "draft" : "document"} · ${doc.iepType?.replace(/_/g, " ") ?? "initial"}`,
        linkTo: `/students/${studentId}/iep`,
        meta: { iepType: doc.iepType, status: doc.status, iepDocId: doc.id },
      });
    }

    // ── IEP Goals ─────────────────────────────────────────────────────────────
    for (const goal of iepGoals) {
      const createdStr = goal.createdAt.toISOString().slice(0, 10);
      if (createdStr >= afterDate && createdStr <= beforeInclusiveStr) {
        events.push({
          id: `goal-added-${goal.id}`,
          type: "goal_added",
          date: createdStr,
          time: goal.createdAt.toISOString().slice(11, 16),
          title: "IEP Goal Added",
          description: `${goal.goalArea}: ${goal.annualGoal.slice(0, 80)}${goal.annualGoal.length > 80 ? "…" : ""}`,
          linkTo: `/students/${studentId}?tab=iep`,
          meta: { goalArea: goal.goalArea, goalStatus: goal.status, goalId: goal.id },
        });
      }

      if (goal.status === "mastered" || goal.status === "completed") {
        const masteredDate = goal.endDate ?? goal.updatedAt.toISOString().slice(0, 10);
        if (masteredDate >= afterDate && masteredDate <= beforeInclusiveStr) {
          events.push({
            id: `goal-mastered-${goal.id}`,
            type: "goal_mastered",
            date: masteredDate,
            time: goal.endDate ? null : goal.updatedAt.toISOString().slice(11, 16),
            title: "Goal Mastered",
            description: `${goal.goalArea}: ${goal.annualGoal.slice(0, 80)}${goal.annualGoal.length > 80 ? "…" : ""}`,
            linkTo: `/students/${studentId}?tab=iep`,
            meta: { goalArea: goal.goalArea, goalId: goal.id },
          });
        }
      }
    }

    // ── Goal milestones from progress reports ─────────────────────────────────
    for (const report of progReports) {
      const dateStr = report.periodEnd ?? report.createdAt.toISOString().slice(0, 10);
      if (!Array.isArray(report.goalProgress)) continue;

      for (const rawGp of report.goalProgress) {
        if (!isGoalProgressEntry(rawGp)) continue;
        const gp = rawGp;
        const rating = gp.progressRating ?? "";
        const code = gp.progressCode ?? "";
        const isMastered = rating === "mastered" || code === "M";
        const isInProgress =
          rating === "some_progress" || rating === "minimal_progress" || rating === "making_progress";

        if (isMastered) {
          events.push({
            id: `report-goal-mastered-${report.id}-${gp.iepGoalId ?? gp.goalNumber ?? 0}`,
            type: "goal_mastered",
            date: dateStr,
            time: null,
            title: "Goal Mastered",
            description: `${gp.goalArea ?? "Goal"}: ${(gp.annualGoal ?? gp.narrative ?? "").slice(0, 80)}`,
            linkTo: `/students/${studentId}?tab=reports`,
            meta: { progressRating: rating, reportId: report.id },
          });
        } else if (isInProgress) {
          events.push({
            id: `report-goal-progress-${report.id}-${gp.iepGoalId ?? gp.goalNumber ?? 0}`,
            type: "goal_milestone",
            date: dateStr,
            time: null,
            title: "Goal Progress Update",
            description: `${gp.goalArea ?? "Goal"}: ${rating.replace(/_/g, " ")} — ${(gp.narrative ?? gp.annualGoal ?? "").slice(0, 60)}`,
            linkTo: `/students/${studentId}?tab=reports`,
            meta: { progressRating: rating, reportId: report.id },
          });
        }
      }
    }

    // ── Compliance events ─────────────────────────────────────────────────────
    for (const ce of complianceEvts) {
      const dateStr = ce.completedDate ?? ce.dueDate;
      if (!dateStr) continue;
      events.push({
        id: `compliance-${ce.id}`,
        type: "compliance_event",
        date: dateStr,
        time: null,
        title: ce.title ?? ce.eventType?.replace(/_/g, " ") ?? "Compliance Event",
        description: `${ce.status === "completed" ? "Completed" : ce.status ?? "Due"} · ${ce.eventType?.replace(/_/g, " ") ?? ""}${ce.notes ? ` · ${ce.notes}` : ""}`,
        linkTo: `/compliance`,
        meta: { eventType: ce.eventType, status: ce.status, dueDate: ce.dueDate },
      });
    }

    // ── Incidents ─────────────────────────────────────────────────────────────
    for (const inc of incidents) {
      events.push({
        id: `incident-${inc.id}`,
        type: "incident",
        date: inc.incidentDate,
        time: inc.incidentTime ?? null,
        title: `${inc.incidentType?.replace(/_/g, " ") ?? "Incident"} Incident`,
        description: `${inc.durationMinutes ? `${inc.durationMinutes} min · ` : ""}${inc.status ?? "reported"}${inc.behaviorDescription ? ` · ${inc.behaviorDescription.slice(0, 60)}` : ""}`,
        linkTo: `/protective-measures?studentId=${studentId}&incidentId=${inc.id}`,
        meta: { incidentType: inc.incidentType, status: inc.status, incidentId: inc.id },
      });
    }

    // ── Communications ────────────────────────────────────────────────────────
    for (const comm of commEvents) {
      if (comm.status === "queued" || comm.status === "failed") continue;
      const ts = comm.sentAt ?? comm.createdAt;
      const dateStr = ts.toISOString().slice(0, 10);
      const timeStr = ts.toISOString().slice(11, 16);
      events.push({
        id: `comm-${comm.id}`,
        type: "communication",
        date: dateStr,
        time: timeStr,
        title: comm.subject ?? comm.type?.replace(/_/g, " ") ?? "Communication Sent",
        description: `${comm.type?.replace(/_/g, " ") ?? "Email"} sent${comm.toName ? ` to ${comm.toName}` : ""}`,
        linkTo: `/students/${studentId}?tab=contacts`,
        meta: { commType: comm.type, status: comm.status },
      });
    }

    // ── Enrollment events ─────────────────────────────────────────────────────
    for (const ev of enrollEvts) {
      events.push({
        id: `enrollment-${ev.id}`,
        type: "enrollment",
        date: ev.eventDate,
        time: null,
        title:
          ev.eventType?.replace(/_/g, " ")?.replace(/^\w/, (c: string) => c.toUpperCase()) ??
          "Enrollment Event",
        description: ev.reason ?? ev.notes ?? ev.eventType?.replace(/_/g, " ") ?? "",
        linkTo: `/students/${studentId}?tab=contacts`,
        meta: { eventType: ev.eventType },
      });
    }

    // ── Sort by full datetime descending ──────────────────────────────────────
    events.sort((a, b) => {
      const cmp = eventSortKey(b.date, b.time).localeCompare(eventSortKey(a.date, a.time));
      if (cmp !== 0) return cmp;
      return b.id.localeCompare(a.id); // stable tiebreak
    });

    // ── Deduplicate by id ─────────────────────────────────────────────────────
    const seenIds = new Set<string>();
    const allEvents: JourneyEvent[] = [];
    for (const ev of events) {
      if (!seenIds.has(ev.id)) {
        seenIds.add(ev.id);
        allEvents.push(ev);
      }
    }

    // ── Cursor-based filtering ─────────────────────────────────────────────────
    // When a cursor is provided, skip events that should have appeared on earlier pages.
    // "After cursor" in descending sort = events with a lower sortKey or lower id at same key.
    const filtered = cursor ? allEvents.filter(ev => isAfterCursor(ev, cursor)) : allEvents;

    // ── Paginate ──────────────────────────────────────────────────────────────
    const paginated = filtered.slice(0, limitParam);
    const lastEv = paginated.length > 0 ? paginated[paginated.length - 1] : null;
    const nextCursor =
      paginated.length === limitParam && lastEv
        ? encodeCursor({ date: lastEv.date, time: lastEv.time, id: lastEv.id })
        : null;

    res.json({
      events: paginated,
      nextCursor,
      windowStart: afterDate,
      windowEnd: beforeInclusiveStr,
    });
  } catch (err) {
    console.error("Journey endpoint error:", err);
    res.status(500).json({ error: "Failed to load journey" });
  }
});

export default router;
