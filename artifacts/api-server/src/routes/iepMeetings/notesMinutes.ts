// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  teamMeetingsTable, studentsTable, staffTable,
  iepMeetingAttendeesTable, priorWrittenNoticesTable, meetingConsentRecordsTable,
  iepDocumentsTable, meetingPrepItemsTable, iepGoalsTable,
  iepAccommodationsTable, parentMessagesTable, dataSessionsTable,
  programDataTable, behaviorDataTable,
} from "@workspace/db";
import { eq, and, desc, asc, gte, inArray } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { logAudit } from "../../lib/auditLog";
import { meetingAccess, pick } from "./shared";
import { DEFAULT_PREP_ITEMS, autoDetectPrepItems } from "./scheduling";
import {
  assertTeamMeetingInCallerDistrict,
  assertPriorWrittenNoticeInCallerDistrict,
  assertMeetingConsentRecordInCallerDistrict,
  assertMeetingPrepItemInCallerDistrict,
} from "../../lib/districtScope";

const router: IRouter = Router();

router.post("/iep-meetings/:meetingId/notices", meetingAccess, async (req, res): Promise<void> => {
  try {
    const meetingId = parseInt(req.params.meetingId as string, 10);
    if (isNaN(meetingId)) { res.status(400).json({ error: "Invalid meeting ID" }); return; }
    if (!(await assertTeamMeetingInCallerDistrict(req as unknown as AuthedRequest, meetingId, res))) return;

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
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid notice ID" }); return; }
    if (!(await assertPriorWrittenNoticeInCallerDistrict(req as unknown as AuthedRequest, id, res))) return;

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
    const meetingId = parseInt(req.params.meetingId as string, 10);
    if (isNaN(meetingId)) { res.status(400).json({ error: "Invalid meeting ID" }); return; }
    if (!(await assertTeamMeetingInCallerDistrict(req as unknown as AuthedRequest, meetingId, res))) return;

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
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid consent ID" }); return; }
    if (!(await assertMeetingConsentRecordInCallerDistrict(req as unknown as AuthedRequest, id, res))) return;

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

router.get("/iep-meetings/:id/prep", meetingAccess, async (req, res): Promise<void> => {
  try {
    const meetingId = parseInt(req.params.id as string, 10);
    if (isNaN(meetingId)) { res.status(400).json({ error: "Invalid meeting ID" }); return; }
    if (!(await assertTeamMeetingInCallerDistrict(req as unknown as AuthedRequest, meetingId, res))) return;

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
    const meetingId = parseInt(req.params.id as string, 10);
    const itemId = parseInt(req.params.itemId as string, 10);
    if (isNaN(meetingId) || isNaN(itemId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    if (!(await assertMeetingPrepItemInCallerDistrict(req as unknown as AuthedRequest, itemId, res))) return;

    const { completed, notes } = req.body as { completed?: boolean; notes?: string };
    const authedReq = req as unknown as AuthedRequest;

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
    const meetingId = parseInt(req.params.id as string, 10);
    if (isNaN(meetingId)) { res.status(400).json({ error: "Invalid meeting ID" }); return; }
    if (!(await assertTeamMeetingInCallerDistrict(req as unknown as AuthedRequest, meetingId, res))) return;

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
        : Promise.resolve([] as { targetId: number | null; value: string | null; date: string }[]),
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
        : Promise.resolve([] as { targetId: number | null; value: number | null; date: string }[]),
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
