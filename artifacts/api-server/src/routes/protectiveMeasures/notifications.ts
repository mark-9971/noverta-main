import { Router, type IRouter, type Request, type Response } from "express";
import { db, restraintIncidentsTable, incidentStatusHistoryTable, studentsTable, staffTable, schoolsTable, guardiansTable, communicationEventsTable } from "@workspace/db";
import { eq, desc, and, asc, inArray } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import { getPublicMetaAsync } from "../../lib/clerkClaims";
import { sendEmail, buildIncidentNotificationEmail } from "../../lib/email";
import { registerIncidentIdParam, getFullIncidentData } from "./utils";

// tenant-scope: district-join
const router: IRouter = Router();
registerIncidentIdParam(router);

router.post("/protective-measures/incidents/:id/parent-notification", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { notifiedById, method, verbal } = req.body;
  if (!notifiedById) { res.status(400).json({ error: "notifiedById is required" }); return; }

  const [existing] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const now = new Date().toISOString();

  if (verbal) {
    const [updated] = await db.update(restraintIncidentsTable).set({
      parentVerbalNotification: true,
      parentVerbalNotificationAt: now,
      parentNotifiedBy: Number(notifiedById),
    }).where(eq(restraintIncidentsTable.id, id)).returning();
    logAudit(req, {
      action: "update",
      targetTable: "restraint_incidents",
      targetId: id,
      studentId: existing.studentId,
      summary: `Verbal parent notification for restraint incident #${id}`,
    });
    res.json(updated);
    return;
  }

  const [updated] = await db.update(restraintIncidentsTable).set({
    parentNotified: true,
    parentNotifiedAt: now,
    parentNotifiedBy: Number(notifiedById),
    parentNotificationMethod: method || "phone",
  }).where(eq(restraintIncidentsTable.id, id)).returning();

  logAudit(req, {
    action: "update",
    targetTable: "restraint_incidents",
    targetId: id,
    studentId: existing.studentId,
    summary: `Parent notification (${method || "phone"}) for restraint incident #${id}`,
  });
  res.json(updated);
});

router.post("/protective-measures/incidents/:id/written-report", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { method } = req.body;

  const [existing] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const now = new Date().toISOString().split("T")[0];
  const [updated] = await db.update(restraintIncidentsTable).set({
    writtenReportSent: true,
    writtenReportSentAt: now,
    writtenReportSentMethod: method || "email",
    parentNotified: true,
    parentNotifiedAt: existing.parentNotifiedAt || now,
  }).where(eq(restraintIncidentsTable.id, id)).returning();

  logAudit(req, {
    action: "update",
    targetTable: "restraint_incidents",
    targetId: id,
    studentId: existing.studentId,
    summary: `Written report sent for restraint incident #${id} via ${method || "email"}`,
  });
  res.json(updated);
});

router.post("/protective-measures/incidents/:id/parent-notification-draft", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [incident] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, id));
  if (!incident) { res.status(404).json({ error: "Incident not found" }); return; }

  const { draft } = req.body;
  if (!draft || typeof draft !== "string") { res.status(400).json({ error: "draft text required" }); return; }

  const [updated] = await db.update(restraintIncidentsTable).set({
    parentNotificationDraft: draft,
  }).where(eq(restraintIncidentsTable.id, id)).returning();

  res.json(updated);
});

router.post("/protective-measures/incidents/:id/review-notification", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const actorStaffId = (await getPublicMetaAsync(req)).staffId ?? null;
  if (!actorStaffId) {
    res.status(401).json({ error: "Actor identity required to review a notification. Ensure your session is authenticated." });
    return;
  }

  const { action, note } = req.body as { action?: string; note?: string };
  if (!action || !["approve", "return"].includes(action)) {
    res.status(400).json({ error: "action must be 'approve' or 'return'" });
    return;
  }
  if (!note || !note.trim()) {
    res.status(400).json({ error: "note is required for notification review" });
    return;
  }

  const [incident] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, id));
  if (!incident) { res.status(404).json({ error: "Incident not found" }); return; }

  if (incident.status !== "under_review" && incident.status !== "resolved") {
    res.status(400).json({ error: "Incident must be admin-reviewed before notification can be reviewed" });
    return;
  }
  if (incident.parentNotificationSentAt) {
    res.status(400).json({ error: "Parent notification has already been sent; no further review is possible" });
    return;
  }

  await db.insert(incidentStatusHistoryTable).values({
    incidentId: id,
    fromStatus: "notification_draft",
    toStatus: action === "approve" ? "notification_approved" : "notification_returned",
    note: note.trim(),
    actorStaffId,
  });

  logAudit(req, {
    action: "update",
    targetTable: "restraint_incidents",
    targetId: id,
    studentId: incident.studentId,
    summary: `Notification review: ${action} on incident #${id}`,
    oldValues: {},
    newValues: { notificationReviewAction: action, note: note.trim() },
  });

  res.json({ success: true, action, incidentId: id });
});

router.post("/protective-measures/incidents/:id/send-parent-notification", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const actorStaffId = (await getPublicMetaAsync(req)).staffId ?? null;
  if (!actorStaffId) {
    res.status(401).json({ error: "Actor identity required to send parent notification. Ensure your session is authenticated." });
    return;
  }

  const [incident] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, id));
  if (!incident) { res.status(404).json({ error: "Incident not found" }); return; }

  if (incident.status !== "under_review" && incident.status !== "resolved") {
    res.status(400).json({ error: "Incident must be admin-reviewed before sending parent notification" });
    return;
  }

  if (incident.parentNotificationSentAt) {
    res.status(400).json({ error: "Parent notification has already been sent" });
    return;
  }

  const [latestReviewEntry] = await db.select().from(incidentStatusHistoryTable)
    .where(and(
      eq(incidentStatusHistoryTable.incidentId, id),
      inArray(incidentStatusHistoryTable.toStatus, ["notification_approved", "notification_returned"])
    ))
    .orderBy(desc(incidentStatusHistoryTable.createdAt))
    .limit(1);
  if (!latestReviewEntry || latestReviewEntry.toStatus !== "notification_approved") {
    res.status(400).json({ error: "Notification must be explicitly approved (and not subsequently returned) before sending. Use the 'Approve' action first." });
    return;
  }

  const { draft, method } = req.body;
  const senderId = actorStaffId;

  const [sender] = await db.select().from(staffTable).where(eq(staffTable.id, Number(senderId)));
  if (!sender) { res.status(404).json({ error: "Sender staff not found" }); return; }

  const allowedRoles = ["case_manager", "bcba", "coordinator", "admin"];
  if (!allowedRoles.includes(sender.role)) {
    res.status(403).json({ error: "Only SPED teachers, case managers, BCBAs, coordinators, or admins may authorize parent notifications" });
    return;
  }

  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, incident.studentId));

  type GuardianRow = typeof guardiansTable.$inferSelect;
  type SchoolRow = typeof schoolsTable.$inferSelect;

  const [schoolRow, guardianRow]: [SchoolRow | null, GuardianRow | null] = await Promise.all([
    student?.schoolId
      ? db.select().from(schoolsTable).where(eq(schoolsTable.id, student.schoolId)).then(r => r[0] ?? null)
      : Promise.resolve(null),
    db.select().from(guardiansTable)
      .where(eq(guardiansTable.studentId, incident.studentId))
      .orderBy(asc(guardiansTable.contactPriority), asc(guardiansTable.id))
      .limit(1)
      .then(rows => rows[0] ?? null),
  ]);

  const toEmail: string | null = guardianRow?.email ?? student?.parentEmail ?? null;
  const toName: string | null = guardianRow?.name ?? student?.parentGuardianName ?? null;
  const guardianId: number | undefined = guardianRow?.id ?? undefined;
  const studentName = student ? `${student.firstName} ${student.lastName}` : "Student";
  const schoolName = schoolRow ? schoolRow.name : "the school";
  const senderName = `${sender.firstName} ${sender.lastName}`;
  const senderTitle = sender.role ? sender.role.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : "Staff";
  const notificationDraft = (draft as string | undefined) || incident.parentNotificationDraft || "";
  const now = new Date().toISOString();
  const isEmailChannel = method === "email" || (!method && !!toEmail);

  type EmailResultShape = { success: boolean; communicationEventId?: number; error?: string; notConfigured?: boolean };
  let emailResult: EmailResultShape | null = null;

  if (isEmailChannel) {
    if (!toEmail) {
      res.status(422).json({ error: "No email address on file for this student or their guardians. Add a guardian email or choose a different notification method." });
      return;
    }

    const incidentDateStr = incident.incidentDate
      ? new Date(incident.incidentDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : now.substring(0, 10);
    const emailContent = buildIncidentNotificationEmail({
      studentName,
      guardianName: toName ?? "Parent/Guardian",
      incidentDate: incidentDateStr,
      incidentType: incident.restraintType ?? incident.incidentType ?? "protective_measure",
      schoolName,
      notificationDraft,
      senderName,
      senderTitle,
    });
    emailResult = await sendEmail({
      studentId: incident.studentId,
      type: "incident_parent_notification",
      subject: emailContent.subject,
      bodyHtml: emailContent.html,
      bodyText: emailContent.text,
      toEmail,
      toName: toName ?? undefined,
      staffId: Number(senderId),
      guardianId,
      linkedIncidentId: id,
      metadata: { incidentId: id, method: "email", sentBy: senderId },
    });

    if (!emailResult.success) {
      const [draftSaved] = await db.update(restraintIncidentsTable)
        .set({ parentNotificationDraft: notificationDraft })
        .where(eq(restraintIncidentsTable.id, id))
        .returning();
      logAudit(req, {
        action: "update",
        targetTable: "restraint_incidents",
        targetId: id,
        studentId: incident.studentId,
        summary: `Email send attempt for incident #${id}: ${emailResult.notConfigured ? "provider not configured (add RESEND_API_KEY)" : (emailResult.error ?? "delivery failed")}`,
      });
      res.json({
        ...draftSaved,
        sender: { firstName: sender.firstName, lastName: sender.lastName },
        parentEmail: toEmail,
        parentGuardianName: toName,
        emailResult: {
          success: false,
          communicationEventId: emailResult.communicationEventId,
          notConfigured: emailResult.notConfigured ?? false,
          error: emailResult.notConfigured
            ? "Email provider not configured. Add RESEND_API_KEY to enable delivery. The notification draft has been saved and can be retried."
            : (emailResult.error ?? "Email delivery failed. Please retry or choose a different delivery method."),
        },
        emailNotSent: true,
      });
      return;
    }
  }

  const [updated] = await db.update(restraintIncidentsTable).set({
    parentNotificationDraft: notificationDraft,
    parentNotificationSentAt: now,
    parentNotificationSentBy: Number(senderId),
    parentNotificationMethod: method || "email",
    parentNotificationPdfGenerated: true,
    parentNotified: true,
    parentNotifiedAt: now,
    parentNotifiedBy: Number(senderId),
    writtenReportSent: true,
    writtenReportSentAt: now,
    writtenReportSentMethod: method || "email",
  }).where(eq(restraintIncidentsTable.id, id)).returning();

  let nonEmailCommEventId: number | undefined;
  if (!isEmailChannel) {
    const deliveryChannel = method || "hand_delivered";
    const [commEvt] = await db.insert(communicationEventsTable).values({
      studentId: incident.studentId,
      type: "incident_parent_notification",
      channel: deliveryChannel,
      subject: `Restraint incident notification — ${incident.incidentDate ?? now.substring(0, 10)}`,
      status: "sent",
      staffId: Number(senderId),
      guardianId: guardianId ?? null,
      linkedIncidentId: id,
      metadata: { incidentId: id, method: deliveryChannel, sentBy: senderId },
    }).returning({ id: communicationEventsTable.id });
    nonEmailCommEventId = commEvt?.id;
  }

  logAudit(req, {
    action: "update",
    targetTable: "restraint_incidents",
    targetId: id,
    studentId: incident.studentId,
    summary: `Parent notification sent for restraint incident #${id} via ${method || "email"}${emailResult?.success ? " (email confirmed sent)" : ""}`,
  });

  res.json({
    ...updated,
    sender: { firstName: sender.firstName, lastName: sender.lastName },
    parentEmail: toEmail,
    parentGuardianName: toName,
    emailResult: emailResult
      ? { success: emailResult.success, communicationEventId: emailResult.communicationEventId, notConfigured: false, error: null }
      : null,
    communicationEventId: nonEmailCommEventId ?? null,
    emailNotSent: false,
  });
});

router.get("/protective-measures/incidents/:id/generate-draft", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const data = await getFullIncidentData(id);
  if (!data) { res.status(404).json({ error: "Incident not found" }); return; }

  const { incident, student, school, caseManager } = data;

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "[Date]";
  const formatTime = (t: string | null) => {
    if (!t) return "[Time]";
    const [h, m] = t.split(":");
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
  };

  const TYPE_LABELS: Record<string, string> = {
    physical_restraint: "physical restraint",
    seclusion: "seclusion",
    time_out: "time-out",
    physical_escort: "physical escort",
  };

  const studentName = student ? `${student.firstName} ${student.lastName}` : "your child";
  const parentName = student?.parentGuardianName || "Parent/Guardian";
  const schoolName = school?.name || "our school";
  const incidentType = TYPE_LABELS[incident.incidentType] || incident.incidentType;
  const cmName = caseManager ? `${caseManager.firstName} ${caseManager.lastName}` : "[Case Manager Name]";
  const cmTitle = caseManager?.title || "Case Manager";

  let draft = `Dear ${parentName},\n\n`;
  draft += `I am writing to inform you of an incident involving ${studentName} that occurred on ${formatDate(incident.incidentDate)} at approximately ${formatTime(incident.incidentTime)} at ${schoolName}.\n\n`;
  draft += `During the course of the school day, ${studentName} was involved in a situation that required the use of ${incidentType}. `;
  if (incident.durationMinutes) draft += `The ${incidentType} lasted approximately ${incident.durationMinutes} minutes. `;
  if (incident.location) draft += `The incident took place in ${incident.location}. `;
  draft += `\n\n`;

  draft += `Prior to the ${incidentType}, staff attempted the following de-escalation strategies: `;
  if (Array.isArray(incident.deescalationStrategies) && incident.deescalationStrategies.length > 0) {
    draft += `${(incident.deescalationStrategies as string[]).join(", ")}. `;
  } else if (incident.deescalationAttempts) {
    draft += `${incident.deescalationAttempts}. `;
  } else {
    draft += `[describe de-escalation attempts]. `;
  }
  draft += `The ${incidentType} was used as a last resort to ensure the safety of ${studentName} and others.\n\n`;

  if (incident.studentInjury) {
    draft += `Please be aware that ${studentName} sustained a minor injury during the incident. ${incident.studentInjuryDescription || "[Describe injury]"}. ${incident.medicalAttentionRequired ? "Medical attention was provided." : "No medical attention was required."}\n\n`;
  } else {
    draft += `${studentName} was not injured during the incident.\n\n`;
  }

  draft += `In accordance with Massachusetts regulation 603 CMR 46.00, you have the right to:\n`;
  draft += `  • Receive this written report within three (3) school working days of the incident\n`;
  draft += `  • Review and comment on this report\n`;
  draft += `  • Request a copy of the full restraint report\n`;
  draft += `  • Request a meeting to discuss the incident\n\n`;

  draft += `A complete restraint report is attached to this correspondence for your review. Please do not hesitate to contact me if you have any questions, concerns, or would like to schedule a meeting to discuss this incident and any supports we can put in place for ${studentName}.\n\n`;

  draft += `Sincerely,\n\n${cmName}\n${cmTitle}\n${schoolName}`;

  res.json({
    draft,
    parentEmail: student?.parentEmail || null,
    parentGuardianName: student?.parentGuardianName || null,
    caseManager: caseManager ? { id: caseManager.id, firstName: caseManager.firstName, lastName: caseManager.lastName, title: caseManager.title, role: caseManager.role } : null,
  });
});

export default router;
