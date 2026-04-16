import { Router, type Request, type Response, type NextFunction } from "express";
import { db, restraintIncidentsTable, incidentSignaturesTable, incidentStatusHistoryTable, studentsTable, staffTable, schoolsTable } from "@workspace/db";
import { eq, desc, and, gte, lte, sql, count, inArray } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { logAudit } from "../lib/auditLog";
import { requireTierAccess } from "../middlewares/tierGate";
import { getPublicMeta } from "../lib/clerkClaims";
import { getEnforcedDistrictId, requireDistrictScope } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";

const router = Router();
// requireDistrictScope: non-platform-admin users without a district claim get 403.
// Applies before all handlers — guarantees getEnforcedDistrictId() is non-null for regular users.
router.use(requireDistrictScope);
router.use(requireTierAccess("clinical.protective_measures"));

/**
 * Tenant guard for all incident /:id routes (GET, PATCH, DELETE, POST sub-actions).
 * Runs once per request when Express resolves the :id parameter.
 * Returns 403 if the incident's student belongs to a different district than the caller.
 */
router.param("id", async (req: Request, res: Response, next: NextFunction, idStr: string) => {
  const id = Number(idStr);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid incident id" }); return; }

  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (districtId === null) { next(); return; } // no district context — allow (platform admin path)

  const [incident] = await db
    .select({ id: restraintIncidentsTable.id, studentId: restraintIncidentsTable.studentId })
    .from(restraintIncidentsTable)
    .where(eq(restraintIncidentsTable.id, id));

  if (!incident) { res.status(404).json({ error: "Not found" }); return; }

  const scopeRows = await db.execute(
    sql`SELECT sc.district_id FROM students s JOIN schools sc ON s.school_id = sc.id WHERE s.id = ${incident.studentId} LIMIT 1`
  );
  const incidentDistrictId = (scopeRows.rows[0] as { district_id: number | null } | undefined)?.district_id ?? null;
  if (incidentDistrictId === null || Number(incidentDistrictId) !== districtId) {
    res.status(403).json({ error: "Access denied: incident is outside your district" });
    return;
  }
  next();
});

router.get("/protective-measures/incidents", async (req: Request, res: Response) => {
  const { studentId, status, incidentType, startDate, endDate } = req.query;

  // Mandatory tenant scope — derived from auth token (or test header), never client query string.
  const districtId = getEnforcedDistrictId(req as AuthedRequest);

  const conditions: any[] = [];

  // Enforce district boundary: only incidents whose student belongs to a school in this district.
  if (districtId !== null) {
    conditions.push(
      sql`${restraintIncidentsTable.studentId} IN (
        SELECT s.id FROM students s
        JOIN schools sc ON s.school_id = sc.id
        WHERE sc.district_id = ${districtId}
      )`
    );
  }

  if (studentId) conditions.push(eq(restraintIncidentsTable.studentId, Number(studentId)));
  if (status && status !== "all") {
    if (String(status) === "notification_pending") {
      conditions.push(inArray(restraintIncidentsTable.status, ["under_review", "resolved"]));
      conditions.push(sql`${restraintIncidentsTable.parentNotificationSentAt} IS NULL`);
    } else {
      conditions.push(eq(restraintIncidentsTable.status, String(status)));
    }
  }
  if (incidentType && incidentType !== "all") conditions.push(eq(restraintIncidentsTable.incidentType, String(incidentType)));
  if (startDate) conditions.push(gte(restraintIncidentsTable.incidentDate, String(startDate)));
  if (endDate) conditions.push(lte(restraintIncidentsTable.incidentDate, String(endDate)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const incidents = await db
    .select({
      id: restraintIncidentsTable.id,
      studentId: restraintIncidentsTable.studentId,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      studentGrade: studentsTable.grade,
      incidentDate: restraintIncidentsTable.incidentDate,
      incidentTime: restraintIncidentsTable.incidentTime,
      endTime: restraintIncidentsTable.endTime,
      durationMinutes: restraintIncidentsTable.durationMinutes,
      incidentType: restraintIncidentsTable.incidentType,
      location: restraintIncidentsTable.location,
      behaviorDescription: restraintIncidentsTable.behaviorDescription,
      restraintType: restraintIncidentsTable.restraintType,
      primaryStaffId: restraintIncidentsTable.primaryStaffId,
      studentInjury: restraintIncidentsTable.studentInjury,
      staffInjury: restraintIncidentsTable.staffInjury,
      medicalAttentionRequired: restraintIncidentsTable.medicalAttentionRequired,
      parentNotified: restraintIncidentsTable.parentNotified,
      parentNotifiedAt: restraintIncidentsTable.parentNotifiedAt,
      parentVerbalNotification: restraintIncidentsTable.parentVerbalNotification,
      writtenReportSent: restraintIncidentsTable.writtenReportSent,
      adminReviewedBy: restraintIncidentsTable.adminReviewedBy,
      adminReviewedAt: restraintIncidentsTable.adminReviewedAt,
      deseReportRequired: restraintIncidentsTable.deseReportRequired,
      deseReportSentAt: restraintIncidentsTable.deseReportSentAt,
      status: restraintIncidentsTable.status,
      createdAt: restraintIncidentsTable.createdAt,
    })
    .from(restraintIncidentsTable)
    .leftJoin(studentsTable, eq(restraintIncidentsTable.studentId, studentsTable.id))
    .where(where)
    .orderBy(desc(restraintIncidentsTable.incidentDate), desc(restraintIncidentsTable.incidentTime));

  logAudit(req, {
    action: "read",
    targetTable: "restraint_incidents",
    studentId: studentId ? Number(studentId) : undefined,
    summary: `Viewed ${incidents.length} restraint incidents${studentId ? ` for student #${studentId}` : ""}`,
  });
  res.json(incidents);
});

router.get("/protective-measures/incidents/:id", async (req: Request, res: Response) => {
  // District ownership for :id routes is validated by router.param("id", ...) above.
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [incident] = await db
    .select()
    .from(restraintIncidentsTable)
    .where(eq(restraintIncidentsTable.id, id));

  if (!incident) { res.status(404).json({ error: "Not found" }); return; }

  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, incident.studentId));

  const staffIds = new Set<number>();
  if (incident.primaryStaffId) staffIds.add(incident.primaryStaffId);
  if (incident.adminReviewedBy) staffIds.add(incident.adminReviewedBy);
  if (incident.parentNotifiedBy) staffIds.add(incident.parentNotifiedBy);
  if (Array.isArray(incident.additionalStaffIds)) (incident.additionalStaffIds as number[]).forEach(id => staffIds.add(id));
  if (Array.isArray(incident.observerStaffIds)) (incident.observerStaffIds as number[]).forEach(id => staffIds.add(id));

  let staffMap: Record<number, any> = {};
  if (staffIds.size > 0) {
    const allStaff = await db.select().from(staffTable).where(inArray(staffTable.id, [...staffIds]));
    for (const s of allStaff) staffMap[s.id] = s;
  }

  const primaryStaff = incident.primaryStaffId ? staffMap[incident.primaryStaffId] || null : null;
  const adminReviewer = incident.adminReviewedBy ? staffMap[incident.adminReviewedBy] || null : null;
  const parentNotifier = incident.parentNotifiedBy ? staffMap[incident.parentNotifiedBy] || null : null;
  const additionalStaff = Array.isArray(incident.additionalStaffIds)
    ? (incident.additionalStaffIds as number[]).map(id => staffMap[id]).filter(Boolean)
    : [];
  const observerStaff = Array.isArray(incident.observerStaffIds)
    ? (incident.observerStaffIds as number[]).map(id => staffMap[id]).filter(Boolean)
    : [];

  const signatures = await db
    .select({
      id: incidentSignaturesTable.id,
      incidentId: incidentSignaturesTable.incidentId,
      staffId: incidentSignaturesTable.staffId,
      staffFirstName: staffTable.firstName,
      staffLastName: staffTable.lastName,
      staffTitle: staffTable.title,
      staffRole: staffTable.role,
      role: incidentSignaturesTable.role,
      signatureName: incidentSignaturesTable.signatureName,
      signedAt: incidentSignaturesTable.signedAt,
      requestedAt: incidentSignaturesTable.requestedAt,
      status: incidentSignaturesTable.status,
      notes: incidentSignaturesTable.notes,
    })
    .from(incidentSignaturesTable)
    .leftJoin(staffTable, eq(incidentSignaturesTable.staffId, staffTable.id))
    .where(eq(incidentSignaturesTable.incidentId, id))
    .orderBy(incidentSignaturesTable.requestedAt);

  logAudit(req, {
    action: "read",
    targetTable: "restraint_incidents",
    targetId: id,
    studentId: incident.studentId,
    summary: `Viewed restraint incident #${id}`,
  });
  res.json({
    ...incident,
    student,
    primaryStaff,
    adminReviewer,
    parentNotifier,
    additionalStaff,
    observerStaff,
    signatures,
  });
});

router.post("/protective-measures/incidents", async (req: Request, res: Response) => {
  const body = req.body;
  if (!body.studentId || !body.incidentDate || !body.incidentTime || !body.incidentType || !body.behaviorDescription) {
    res.status(400).json({ error: "Missing required fields: studentId, incidentDate, incidentTime, incidentType, behaviorDescription" });
    return;
  }

  const studentId = Number(body.studentId);
  if (isNaN(studentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }

  // Validate that the student belongs to the caller's district before creating an incident.
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (districtId !== null) {
    const scopeRows = await db.execute(
      sql`SELECT sc.district_id FROM students s JOIN schools sc ON s.school_id = sc.id WHERE s.id = ${studentId} LIMIT 1`
    );
    const studentDistrictId = (scopeRows.rows[0] as { district_id: number | null } | undefined)?.district_id ?? null;
    if (studentDistrictId === null || Number(studentDistrictId) !== districtId) {
      res.status(403).json({ error: "Access denied: student is outside your district" });
      return;
    }
  }

  const [student] = await db.select({ id: studentsTable.id }).from(studentsTable).where(eq(studentsTable.id, studentId));
  if (!student) { res.status(404).json({ error: "Student not found" }); return; }

  const hasInjury = body.studentInjury || body.staffInjury;

  const [incident] = await db.insert(restraintIncidentsTable).values({
    studentId,
    incidentDate: body.incidentDate,
    incidentTime: body.incidentTime,
    endTime: body.endTime || null,
    durationMinutes: body.durationMinutes ? Number(body.durationMinutes) : null,
    incidentType: body.incidentType,
    location: body.location || null,
    precedingActivity: body.precedingActivity || null,
    triggerDescription: body.triggerDescription || null,
    behaviorDescription: body.behaviorDescription,
    deescalationAttempts: body.deescalationAttempts || null,
    alternativesAttempted: body.alternativesAttempted || null,
    justification: body.justification || null,
    restraintType: body.restraintType || null,
    restraintDescription: body.restraintDescription || null,
    primaryStaffId: body.primaryStaffId ? Number(body.primaryStaffId) : null,
    additionalStaffIds: body.additionalStaffIds || null,
    observerStaffIds: body.observerStaffIds || null,
    principalNotifiedName: body.principalNotifiedName || null,
    principalNotifiedAt: body.principalNotifiedAt || null,
    continuedOver20Min: body.continuedOver20Min ?? false,
    over20MinApproverName: body.over20MinApproverName || null,
    calmingStrategiesUsed: body.calmingStrategiesUsed || null,
    studentStateAfter: body.studentStateAfter || null,
    studentInjury: body.studentInjury ?? false,
    studentInjuryDescription: body.studentInjuryDescription || null,
    staffInjury: body.staffInjury ?? false,
    staffInjuryDescription: body.staffInjuryDescription || null,
    medicalAttentionRequired: body.medicalAttentionRequired ?? false,
    medicalDetails: body.medicalDetails || null,
    studentMoved: body.studentMoved ?? false,
    studentMovedTo: body.studentMovedTo || null,
    roomCleared: body.roomCleared ?? false,
    bodyPosition: body.bodyPosition || null,
    proceduresUsed: body.proceduresUsed || null,
    deescalationStrategies: body.deescalationStrategies || null,
    antecedentCategory: body.antecedentCategory || null,
    emergencyServicesCalled: body.emergencyServicesCalled ?? false,
    emergencyServicesCalledAt: body.emergencyServicesCalledAt || null,
    debriefConducted: body.debriefConducted ?? false,
    debriefDate: body.debriefDate || null,
    debriefNotes: body.debriefNotes || null,
    debriefParticipants: body.debriefParticipants || null,
    bipInPlace: body.bipInPlace ?? false,
    physicalEscortOnly: body.physicalEscortOnly ?? false,
    studentReturnedToActivity: body.studentReturnedToActivity || null,
    timeToCalm: body.timeToCalm ? Number(body.timeToCalm) : null,
    terminologyFramework: body.terminologyFramework || "standard",
    parentVerbalNotification: body.parentVerbalNotification ?? false,
    parentVerbalNotificationAt: body.parentVerbalNotificationAt || null,
    parentNotified: body.parentNotified ?? false,
    parentNotifiedAt: body.parentNotifiedAt || null,
    parentNotifiedBy: body.parentNotifiedBy ? Number(body.parentNotifiedBy) : null,
    parentNotificationMethod: body.parentNotificationMethod || null,
    writtenReportSent: body.writtenReportSent ?? false,
    writtenReportSentAt: body.writtenReportSentAt || null,
    writtenReportSentMethod: body.writtenReportSentMethod || null,
    parentCommentOpportunityGiven: body.parentCommentOpportunityGiven ?? false,
    parentComment: body.parentComment || null,
    studentComment: body.studentComment || null,
    deseReportRequired: hasInjury ? true : (body.deseReportRequired ?? false),
    deseReportSentAt: body.deseReportSentAt || null,
    thirtyDayLogSentToDese: body.thirtyDayLogSentToDese ?? false,
    reportingStaffSignature: body.reportingStaffSignature || null,
    reportingStaffSignedAt: body.reportingStaffSignedAt || null,
    adminSignature: body.adminSignature || null,
    adminSignedAt: body.adminSignedAt || null,
    status: "draft",
    followUpPlan: body.followUpPlan || null,
    notes: body.notes || null,
  }).returning();

  const now = new Date().toISOString();
  const sigRequests: Array<{ incidentId: number; staffId: number; role: string; requestedAt: string; status: string; signatureName?: string; signedAt?: string }> = [];

  if (body.primaryStaffId) {
    const isSelfSigned = body.reportingStaffSignature && Number(body.primaryStaffId) === Number(body.primaryStaffId);
    sigRequests.push({
      incidentId: incident.id,
      staffId: Number(body.primaryStaffId),
      role: "reporting_staff",
      requestedAt: now,
      status: body.reportingStaffSignature ? "signed" : "pending",
      signatureName: body.reportingStaffSignature || undefined,
      signedAt: body.reportingStaffSignature ? now : undefined,
    });
  }

  if (Array.isArray(body.additionalStaffIds)) {
    for (const sid of body.additionalStaffIds) {
      sigRequests.push({ incidentId: incident.id, staffId: Number(sid), role: "additional_staff", requestedAt: now, status: "pending" });
    }
  }

  if (Array.isArray(body.observerStaffIds)) {
    for (const sid of body.observerStaffIds) {
      sigRequests.push({ incidentId: incident.id, staffId: Number(sid), role: "observer", requestedAt: now, status: "pending" });
    }
  }

  const adminStaff = await db.select({ id: staffTable.id }).from(staffTable).where(eq(staffTable.role, "admin"));
  for (const admin of adminStaff) {
    sigRequests.push({ incidentId: incident.id, staffId: admin.id, role: "admin_reviewer", requestedAt: now, status: "pending" });
  }

  if (sigRequests.length > 0) {
    await db.insert(incidentSignaturesTable).values(sigRequests);
  }

  logAudit(req, {
    action: "create",
    targetTable: "restraint_incidents",
    targetId: incident.id,
    studentId: studentId,
    summary: `Created ${body.incidentType} incident for student #${studentId}`,
    newValues: { incidentType: body.incidentType, incidentDate: body.incidentDate, location: body.location } as Record<string, unknown>,
  });
  res.status(201).json(incident);
});

router.patch("/protective-measures/incidents/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const allowed = [
    "incidentDate", "incidentTime", "endTime", "durationMinutes", "incidentType", "location",
    "precedingActivity", "triggerDescription", "behaviorDescription", "deescalationAttempts",
    "alternativesAttempted", "justification", "restraintType", "restraintDescription",
    "primaryStaffId", "additionalStaffIds", "observerStaffIds",
    "principalNotifiedName", "principalNotifiedAt", "continuedOver20Min", "over20MinApproverName",
    "calmingStrategiesUsed", "studentStateAfter",
    "studentInjury", "studentInjuryDescription", "staffInjury", "staffInjuryDescription",
    "medicalAttentionRequired", "medicalDetails",
    "studentMoved", "studentMovedTo", "roomCleared", "bodyPosition",
    "proceduresUsed", "deescalationStrategies", "antecedentCategory",
    "emergencyServicesCalled", "emergencyServicesCalledAt",
    "debriefConducted", "debriefDate", "debriefNotes", "debriefParticipants",
    "bipInPlace", "physicalEscortOnly", "studentReturnedToActivity", "timeToCalm",
    "terminologyFramework",
    "parentVerbalNotification", "parentVerbalNotificationAt",
    "parentNotified", "parentNotifiedAt", "parentNotifiedBy", "parentNotificationMethod",
    "writtenReportSent", "writtenReportSentAt", "writtenReportSentMethod",
    "parentCommentOpportunityGiven", "parentComment", "studentComment",
    "deseReportRequired", "deseReportSentAt", "thirtyDayLogSentToDese",
    "reportingStaffSignature", "reportingStaffSignedAt",
    "adminReviewNotes",
    "followUpPlan", "notes",
  ];

  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [updated] = await db.update(restraintIncidentsTable).set(updates).where(eq(restraintIncidentsTable.id, id)).returning();
  logAudit(req, {
    action: "update",
    targetTable: "restraint_incidents",
    targetId: id,
    studentId: updated.studentId,
    summary: `Updated restraint incident #${id}`,
    oldValues: Object.fromEntries(Object.keys(updates).map(k => [k, (existing as Record<string, unknown>)[k]])),
    newValues: updates,
  });
  res.json(updated);
});

router.delete("/protective-measures/incidents/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  await db.delete(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, id));
  logAudit(req, {
    action: "delete",
    targetTable: "restraint_incidents",
    targetId: id,
    studentId: existing.studentId,
    summary: `Deleted restraint incident #${id} for student #${existing.studentId}`,
    oldValues: { incidentDate: existing.incidentDate, incidentType: existing.incidentType, status: existing.status, restraintType: existing.restraintType } as Record<string, unknown>,
  });
  res.json({ success: true });
});

router.post("/protective-measures/incidents/:id/transition", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { toStatus, note } = req.body;
  if (!toStatus || !note?.trim()) {
    res.status(400).json({ error: "toStatus and note are required" });
    return;
  }

  const actorStaffId = getPublicMeta(req).staffId ?? null;

  const TERMINAL_TRANSITIONS = new Set(["under_review", "resolved", "dese_reported"]);
  if (TERMINAL_TRANSITIONS.has(toStatus) && !actorStaffId) {
    res.status(401).json({ error: "Actor identity required for terminal transitions. Ensure your session is authenticated." });
    return;
  }

  const VALID_TRANSITIONS: Record<string, string[]> = {
    draft: ["open"],
    open: ["under_review"],
    under_review: ["resolved", "open"],
    resolved: ["dese_reported"],
    dese_reported: [],
  };

  const [existing] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const allowedNext = VALID_TRANSITIONS[existing.status] ?? [];
  if (!allowedNext.includes(toStatus)) {
    res.status(400).json({ error: `Cannot transition from '${existing.status}' to '${toStatus}'. Allowed: ${allowedNext.join(", ") || "none"}` });
    return;
  }

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { status: toStatus };

  if (toStatus === "resolved" || toStatus === "dese_reported") {
    updateData.resolutionNote = note.trim();
    updateData.resolvedAt = now;
    updateData.resolvedBy = actorStaffId;
  }
  if (toStatus === "under_review" && !existing.adminReviewedAt) {
    updateData.adminReviewNotes = note.trim();
    updateData.adminReviewedAt = now.split("T")[0];
    updateData.adminReviewedBy = actorStaffId;
  }

  const [updated] = await db.update(restraintIncidentsTable).set(updateData).where(eq(restraintIncidentsTable.id, id)).returning();

  await db.insert(incidentStatusHistoryTable).values({
    incidentId: id,
    fromStatus: existing.status,
    toStatus,
    note: note.trim(),
    actorStaffId: actorStaffId ?? undefined,
  });

  logAudit(req, {
    action: "update",
    targetTable: "restraint_incidents",
    targetId: id,
    studentId: existing.studentId,
    summary: `Status transition: ${existing.status} → ${toStatus} on incident #${id}`,
    oldValues: { status: existing.status } as Record<string, unknown>,
    newValues: { status: toStatus, note: note.trim() } as Record<string, unknown>,
  });

  res.json(updated);
});

router.get("/protective-measures/incidents/:id/status-history", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const history = await db
    .select({
      id: incidentStatusHistoryTable.id,
      incidentId: incidentStatusHistoryTable.incidentId,
      fromStatus: incidentStatusHistoryTable.fromStatus,
      toStatus: incidentStatusHistoryTable.toStatus,
      note: incidentStatusHistoryTable.note,
      actorStaffId: incidentStatusHistoryTable.actorStaffId,
      actorFirst: staffTable.firstName,
      actorLast: staffTable.lastName,
      createdAt: incidentStatusHistoryTable.createdAt,
    })
    .from(incidentStatusHistoryTable)
    .leftJoin(staffTable, eq(incidentStatusHistoryTable.actorStaffId, staffTable.id))
    .where(eq(incidentStatusHistoryTable.incidentId, id))
    .orderBy(desc(incidentStatusHistoryTable.createdAt));

  res.json(history);
});

router.post("/protective-measures/incidents/:id/admin-review", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const actorStaffId = getPublicMeta(req).staffId ?? null;
  if (!actorStaffId) {
    res.status(401).json({ error: "Authenticated actor identity required to perform admin review." });
    return;
  }

  const { notes, signature } = req.body;
  if (!notes || !String(notes).trim()) {
    res.status(400).json({ error: "Review notes are required." });
    return;
  }

  const [existing] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  if (existing.status !== "open") {
    res.status(400).json({ error: `Admin review requires incident to be in 'open' status. Current status: '${existing.status}'.` });
    return;
  }

  const now = new Date().toISOString();
  const [updated] = await db.update(restraintIncidentsTable).set({
    adminReviewedBy: Number(actorStaffId),
    adminReviewedAt: now.split("T")[0],
    adminReviewNotes: String(notes).trim(),
    adminSignature: signature || null,
    adminSignedAt: signature ? now : null,
    status: "under_review",
  }).where(eq(restraintIncidentsTable.id, id)).returning();

  await db.insert(incidentStatusHistoryTable).values({
    incidentId: id,
    fromStatus: existing.status,
    toStatus: "under_review",
    note: String(notes).trim(),
    actorStaffId: Number(actorStaffId),
  });

  logAudit(req, {
    action: "update",
    targetTable: "restraint_incidents",
    targetId: id,
    studentId: existing.studentId,
    summary: `Admin review of restraint incident #${id}`,
    oldValues: { status: existing.status, adminReviewedBy: existing.adminReviewedBy } as Record<string, unknown>,
    newValues: { status: "under_review", adminReviewedBy: Number(actorStaffId) } as Record<string, unknown>,
  });
  res.json(updated);
});

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

router.post("/protective-measures/incidents/:id/dese-report", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const actorStaffId = getPublicMeta(req).staffId ?? null;
  if (!actorStaffId) {
    res.status(401).json({ error: "Authenticated actor identity required to file DESE report." });
    return;
  }

  const { thirtyDayLogSent, note } = req.body;
  if (!note || !String(note).trim()) {
    res.status(400).json({ error: "A note is required when filing a DESE report." });
    return;
  }

  const [existing] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  if (existing.status !== "resolved") {
    res.status(400).json({ error: `DESE report requires incident to be in 'resolved' status. Current status: '${existing.status}'.` });
    return;
  }

  const now = new Date().toISOString();
  const dateOnly = now.split("T")[0];
  const updates: Record<string, unknown> = {
    deseReportSentAt: dateOnly,
    status: "dese_reported",
    resolutionNote: String(note).trim(),
    resolvedAt: existing.resolvedAt ?? now,
    resolvedBy: existing.resolvedBy ?? actorStaffId,
  };
  if (thirtyDayLogSent) updates.thirtyDayLogSentToDese = true;

  const [updated] = await db.update(restraintIncidentsTable).set(updates).where(eq(restraintIncidentsTable.id, id)).returning();

  await db.insert(incidentStatusHistoryTable).values({
    incidentId: id,
    fromStatus: existing.status,
    toStatus: "dese_reported",
    note: String(note).trim(),
    actorStaffId: Number(actorStaffId),
  });

  logAudit(req, {
    action: "update",
    targetTable: "restraint_incidents",
    targetId: id,
    studentId: existing.studentId,
    summary: `DESE report filed for restraint incident #${id}`,
    oldValues: { status: existing.status } as Record<string, unknown>,
    newValues: { status: "dese_reported", deseReportSentAt: dateOnly } as Record<string, unknown>,
  });
  res.json(updated);
});

router.post("/protective-measures/incidents/:id/signature", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { type, name } = req.body;
  if (!type || !name) { res.status(400).json({ error: "type and name required" }); return; }
  if (type !== "reporting_staff" && type !== "admin") { res.status(400).json({ error: "type must be 'reporting_staff' or 'admin'" }); return; }

  const [existing] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const now = new Date().toISOString();
  const updates: any = {};
  if (type === "reporting_staff") {
    updates.reportingStaffSignature = name;
    updates.reportingStaffSignedAt = now;
  } else {
    updates.adminSignature = name;
    updates.adminSignedAt = now;
  }

  const [updated] = await db.update(restraintIncidentsTable).set(updates).where(eq(restraintIncidentsTable.id, id)).returning();
  logAudit(req, {
    action: "update",
    targetTable: "restraint_incidents",
    targetId: id,
    studentId: existing.studentId,
    summary: `${type} signature added to restraint incident #${id}`,
  });
  res.json(updated);
});

router.get("/protective-measures/summary", async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;
  const start = String(startDate || "2025-09-01");
  const end = String(endDate || new Date().toISOString().split("T")[0]);

  const allIncidents = await db
    .select()
    .from(restraintIncidentsTable)
    .where(and(
      gte(restraintIncidentsTable.incidentDate, start),
      lte(restraintIncidentsTable.incidentDate, end),
    ));

  const totalIncidents = allIncidents.length;
  const restraints = allIncidents.filter(i => i.incidentType === "physical_restraint");
  const seclusions = allIncidents.filter(i => i.incidentType === "seclusion");
  const timeouts = allIncidents.filter(i => i.incidentType === "time_out");
  const pendingReview = allIncidents.filter(i => i.status === "open");
  const parentNotificationsPending = allIncidents.filter(i => !i.parentVerbalNotification);
  const writtenReportsPending = allIncidents.filter(i => !i.writtenReportSent);
  const withInjuries = allIncidents.filter(i => i.studentInjury || i.staffInjury);
  const deseReportsPending = allIncidents.filter(i => i.deseReportRequired && !i.deseReportSentAt);

  const studentCounts: Record<number, number> = {};
  for (const inc of allIncidents) {
    studentCounts[inc.studentId] = (studentCounts[inc.studentId] || 0) + 1;
  }
  const studentsWithMultiple = Object.entries(studentCounts).filter(([, c]) => c >= 3);

  const monthlyBreakdown: Record<string, { restraints: number; seclusions: number; timeouts: number; total: number }> = {};
  for (const inc of allIncidents) {
    const month = inc.incidentDate.substring(0, 7);
    if (!monthlyBreakdown[month]) monthlyBreakdown[month] = { restraints: 0, seclusions: 0, timeouts: 0, total: 0 };
    monthlyBreakdown[month].total++;
    if (inc.incidentType === "physical_restraint") monthlyBreakdown[month].restraints++;
    if (inc.incidentType === "seclusion") monthlyBreakdown[month].seclusions++;
    if (inc.incidentType === "time_out") monthlyBreakdown[month].timeouts++;
  }

  const avgDuration = restraints.length > 0
    ? Math.round(restraints.reduce((sum, r) => sum + (r.durationMinutes || 0), 0) / restraints.length)
    : 0;

  const pendingSigs = await db
    .select({ id: incidentSignaturesTable.id })
    .from(incidentSignaturesTable)
    .where(eq(incidentSignaturesTable.status, "pending"));

  res.json({
    period: { startDate: start, endDate: end },
    totalIncidents,
    byType: {
      physical_restraint: restraints.length,
      seclusion: seclusions.length,
      time_out: timeouts.length,
    },
    pendingReview: pendingReview.length,
    pendingSignatures: pendingSigs.length,
    parentNotificationsPending: parentNotificationsPending.length,
    writtenReportsPending: writtenReportsPending.length,
    injuries: withInjuries.length,
    deseReportsPending: deseReportsPending.length,
    averageRestraintDurationMinutes: avgDuration,
    studentsWithMultipleIncidents: studentsWithMultiple.map(([id, c]) => ({ studentId: Number(id), count: c })),
    monthlyBreakdown,
  });
});

router.get("/protective-measures/dese-report", async (req: Request, res: Response) => {
  const schoolYear = String(req.query.schoolYear || "2025-2026");
  const [startYear] = schoolYear.split("-").map(Number);
  const start = `${startYear}-07-01`;
  const end = `${startYear + 1}-06-30`;

  const allIncidents = await db
    .select({
      id: restraintIncidentsTable.id,
      studentId: restraintIncidentsTable.studentId,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      studentGrade: studentsTable.grade,
      disabilityCategory: studentsTable.disabilityCategory,
      incidentDate: restraintIncidentsTable.incidentDate,
      incidentTime: restraintIncidentsTable.incidentTime,
      endTime: restraintIncidentsTable.endTime,
      durationMinutes: restraintIncidentsTable.durationMinutes,
      incidentType: restraintIncidentsTable.incidentType,
      location: restraintIncidentsTable.location,
      restraintType: restraintIncidentsTable.restraintType,
      behaviorDescription: restraintIncidentsTable.behaviorDescription,
      deescalationAttempts: restraintIncidentsTable.deescalationAttempts,
      alternativesAttempted: restraintIncidentsTable.alternativesAttempted,
      justification: restraintIncidentsTable.justification,
      precedingActivity: restraintIncidentsTable.precedingActivity,
      primaryStaffId: restraintIncidentsTable.primaryStaffId,
      studentInjury: restraintIncidentsTable.studentInjury,
      studentInjuryDescription: restraintIncidentsTable.studentInjuryDescription,
      staffInjury: restraintIncidentsTable.staffInjury,
      staffInjuryDescription: restraintIncidentsTable.staffInjuryDescription,
      medicalAttentionRequired: restraintIncidentsTable.medicalAttentionRequired,
      parentVerbalNotification: restraintIncidentsTable.parentVerbalNotification,
      parentVerbalNotificationAt: restraintIncidentsTable.parentVerbalNotificationAt,
      parentNotified: restraintIncidentsTable.parentNotified,
      parentNotifiedAt: restraintIncidentsTable.parentNotifiedAt,
      writtenReportSent: restraintIncidentsTable.writtenReportSent,
      writtenReportSentAt: restraintIncidentsTable.writtenReportSentAt,
      adminReviewedAt: restraintIncidentsTable.adminReviewedAt,
      deseReportRequired: restraintIncidentsTable.deseReportRequired,
      deseReportSentAt: restraintIncidentsTable.deseReportSentAt,
      reportingStaffSignature: restraintIncidentsTable.reportingStaffSignature,
      adminSignature: restraintIncidentsTable.adminSignature,
      status: restraintIncidentsTable.status,
    })
    .from(restraintIncidentsTable)
    .leftJoin(studentsTable, eq(restraintIncidentsTable.studentId, studentsTable.id))
    .where(and(
      gte(restraintIncidentsTable.incidentDate, start),
      lte(restraintIncidentsTable.incidentDate, end),
    ))
    .orderBy(restraintIncidentsTable.incidentDate);

  const staffIds = new Set<number>();
  for (const inc of allIncidents) {
    if (inc.primaryStaffId) staffIds.add(inc.primaryStaffId);
  }
  let staffMap: Record<number, any> = {};
  if (staffIds.size > 0) {
    const allStaff = await db.select().from(staffTable).where(inArray(staffTable.id, [...staffIds]));
    for (const s of allStaff) staffMap[s.id] = s;
  }

  const uniqueStudents = new Set(allIncidents.map(i => i.studentId));
  const restraintsOnly = allIncidents.filter(i => i.incidentType === "physical_restraint");
  const seclusionsOnly = allIncidents.filter(i => i.incidentType === "seclusion");

  const studentIncidentCounts: Record<number, number> = {};
  for (const inc of allIncidents) {
    studentIncidentCounts[inc.studentId] = (studentIncidentCounts[inc.studentId] || 0) + 1;
  }
  const studentsRestrainedMoreThanOnce = Object.values(studentIncidentCounts).filter(c => c > 1).length;

  const totalDuration = allIncidents.reduce((sum, i) => sum + (i.durationMinutes || 0), 0);

  const byDisability: Record<string, number> = {};
  for (const inc of allIncidents) {
    const cat = inc.disabilityCategory || "No Disability / Unknown";
    byDisability[cat] = (byDisability[cat] || 0) + 1;
  }

  const byGrade: Record<string, number> = {};
  for (const inc of allIncidents) {
    const g = inc.studentGrade || "Unknown";
    byGrade[g] = (byGrade[g] || 0) + 1;
  }

  const incidentsWithStaff = allIncidents.map(inc => ({
    ...inc,
    primaryStaffName: inc.primaryStaffId && staffMap[inc.primaryStaffId]
      ? `${staffMap[inc.primaryStaffId].firstName} ${staffMap[inc.primaryStaffId].lastName}`
      : null,
    primaryStaffTitle: inc.primaryStaffId && staffMap[inc.primaryStaffId]
      ? staffMap[inc.primaryStaffId].title || staffMap[inc.primaryStaffId].role
      : null,
  }));

  res.json({
    schoolYear,
    reportPeriod: { start, end },
    totalIncidents: allIncidents.length,
    totalRestraints: restraintsOnly.length,
    totalSeclusions: seclusionsOnly.length,
    uniqueStudentsInvolved: uniqueStudents.size,
    studentsRestrainedMoreThanOnce,
    totalDurationMinutes: totalDuration,
    injuryIncidents: allIncidents.filter(i => i.studentInjury || i.staffInjury).length,
    studentInjuries: allIncidents.filter(i => i.studentInjury).length,
    staffInjuries: allIncidents.filter(i => i.staffInjury).length,
    medicalAttentionRequired: allIncidents.filter(i => i.medicalAttentionRequired).length,
    complianceMetrics: {
      parentVerbalNotificationRate: allIncidents.length > 0
        ? Math.round(allIncidents.filter(i => i.parentVerbalNotification).length / allIncidents.length * 100) : 100,
      parentWrittenNotificationRate: allIncidents.length > 0
        ? Math.round(allIncidents.filter(i => i.parentNotified).length / allIncidents.length * 100) : 100,
      writtenReportRate: allIncidents.length > 0
        ? Math.round(allIncidents.filter(i => i.writtenReportSent).length / allIncidents.length * 100) : 100,
      adminReviewRate: allIncidents.length > 0
        ? Math.round(allIncidents.filter(i => i.adminReviewedAt).length / allIncidents.length * 100) : 100,
      deseInjuryReportRate: (() => {
        const injuryIncs = allIncidents.filter(i => i.deseReportRequired);
        return injuryIncs.length > 0
          ? Math.round(injuryIncs.filter(i => i.deseReportSentAt).length / injuryIncs.length * 100) : 100;
      })(),
      staffSignatureRate: allIncidents.length > 0
        ? Math.round(allIncidents.filter(i => i.reportingStaffSignature).length / allIncidents.length * 100) : 100,
      adminSignatureRate: allIncidents.length > 0
        ? Math.round(allIncidents.filter(i => i.adminSignature).length / allIncidents.length * 100) : 100,
    },
    byDisabilityCategory: byDisability,
    byGrade,
    incidents: incidentsWithStaff,
  });
});

router.get("/protective-measures/dese-export", async (req: Request, res: Response) => {
  const schoolYear = String(req.query.schoolYear || "2025-2026");
  const [startYear] = schoolYear.split("-").map(Number);
  const start = `${startYear}-07-01`;
  const end = `${startYear + 1}-06-30`;

  const allIncidents = await db
    .select()
    .from(restraintIncidentsTable)
    .leftJoin(studentsTable, eq(restraintIncidentsTable.studentId, studentsTable.id))
    .where(and(
      gte(restraintIncidentsTable.incidentDate, start),
      lte(restraintIncidentsTable.incidentDate, end),
    ))
    .orderBy(restraintIncidentsTable.incidentDate);

  const staffIds = new Set<number>();
  for (const row of allIncidents) {
    const inc = row.restraint_incidents;
    if (inc.primaryStaffId) staffIds.add(inc.primaryStaffId);
    if (inc.adminReviewedBy) staffIds.add(inc.adminReviewedBy);
    if (inc.parentNotifiedBy) staffIds.add(inc.parentNotifiedBy);
    if (Array.isArray(inc.additionalStaffIds)) (inc.additionalStaffIds as number[]).forEach(id => staffIds.add(id));
    if (Array.isArray(inc.observerStaffIds)) (inc.observerStaffIds as number[]).forEach(id => staffIds.add(id));
  }
  let staffMap: Record<number, any> = {};
  if (staffIds.size > 0) {
    const allStaff = await db.select().from(staffTable).where(inArray(staffTable.id, [...staffIds]));
    for (const s of allStaff) staffMap[s.id] = s;
  }

  const staffName = (id: number | null) => {
    if (!id || !staffMap[id]) return "";
    return `${staffMap[id].firstName} ${staffMap[id].lastName}`;
  };
  const staffTitle = (id: number | null) => {
    if (!id || !staffMap[id]) return "";
    return staffMap[id].title || staffMap[id].role || "";
  };
  const staffNames = (ids: number[] | null) => {
    if (!ids || !Array.isArray(ids)) return "";
    return ids.map(id => staffName(id)).filter(Boolean).join("; ");
  };

  const TYPE_MAP: Record<string, string> = {
    physical_restraint: "Physical Restraint",
    seclusion: "Seclusion",
    time_out: "Time-Out",
  };
  const RESTRAINT_MAP: Record<string, string> = {
    floor: "Floor Restraint",
    seated: "Seated Restraint",
    standing: "Standing Restraint",
    escort: "Physical Escort",
    other: "Other",
  };

  const headers = [
    "Incident ID",
    "School Year",
    "Student Name",
    "Student Grade",
    "Disability Category",
    "Date of Incident",
    "Time Restraint Began",
    "Time Restraint Ended",
    "Duration (Minutes)",
    "Incident Type",
    "Restraint Type",
    "Body Position",
    "Location",
    "Student Moved",
    "Student Moved To",
    "Room Cleared",
    "Preceding Activity",
    "Antecedent Category",
    "Behavior That Prompted Restraint",
    "De-escalation Strategies Used",
    "De-escalation Strategy Checklist",
    "Alternatives to Restraint Attempted",
    "Justification for Initiating Restraint",
    "Procedures Used",
    "Calming Strategies Used",
    "Student State After Incident",
    "Student Returned To Activity",
    "Time to Calm (Minutes)",
    "BIP in Place",
    "Physical Escort Only",
    "Emergency Services Called",
    "Primary Staff Name",
    "Primary Staff Title",
    "Additional Staff Names",
    "Observer Names",
    "Principal/Designee Notified",
    "Principal Notified At",
    "Continued Over 20 Minutes",
    "20+ Min Approver Name",
    "Student Injury",
    "Student Injury Description",
    "Staff Injury",
    "Staff Injury Description",
    "Medical Attention Required",
    "Medical Details",
    "Parent Verbal Notification (24hr)",
    "Parent Verbal Notification Time",
    "Written Report Sent to Parent",
    "Written Report Sent Date",
    "Written Report Method",
    "Parent Comment Opportunity Given",
    "Parent Comment",
    "Student Comment",
    "DESE Report Required (Injury)",
    "DESE Report Sent Date",
    "30-Day Log Sent to DESE",
    "Debrief Conducted",
    "Debrief Date",
    "Debrief Notes",
    "Admin Reviewed By",
    "Admin Review Date",
    "Reporting Staff Signature",
    "Reporting Staff Signed At",
    "Admin Signature",
    "Admin Signed At",
    "Status",
    "Follow-Up Plan",
    "Notes",
  ];

  const rows = allIncidents.map(row => {
    const inc = row.restraint_incidents;
    const stu = row.students;
    return [
      inc.id,
      schoolYear,
      stu ? `${stu.firstName} ${stu.lastName}` : "",
      stu?.grade || "",
      stu?.disabilityCategory || "",
      inc.incidentDate,
      inc.incidentTime,
      inc.endTime || "",
      inc.durationMinutes ?? "",
      TYPE_MAP[inc.incidentType] || inc.incidentType,
      inc.restraintType ? (RESTRAINT_MAP[inc.restraintType] || inc.restraintType) : "",
      inc.bodyPosition || "",
      inc.location || "",
      inc.studentMoved ? "Yes" : "No",
      inc.studentMovedTo || "",
      inc.roomCleared ? "Yes" : "No",
      inc.precedingActivity || "",
      inc.antecedentCategory || "",
      inc.behaviorDescription,
      inc.deescalationAttempts || "",
      Array.isArray(inc.deescalationStrategies) ? (inc.deescalationStrategies as string[]).join("; ") : "",
      inc.alternativesAttempted || "",
      inc.justification || "",
      Array.isArray(inc.proceduresUsed) ? (inc.proceduresUsed as string[]).join("; ") : "",
      inc.calmingStrategiesUsed || "",
      inc.studentStateAfter || "",
      inc.studentReturnedToActivity || "",
      inc.timeToCalm ?? "",
      inc.bipInPlace ? "Yes" : "No",
      inc.physicalEscortOnly ? "Yes" : "No",
      inc.emergencyServicesCalled ? "Yes" : "No",
      staffName(inc.primaryStaffId),
      staffTitle(inc.primaryStaffId),
      staffNames(inc.additionalStaffIds as number[] | null),
      staffNames(inc.observerStaffIds as number[] | null),
      inc.principalNotifiedName || "",
      inc.principalNotifiedAt || "",
      inc.continuedOver20Min ? "Yes" : "No",
      inc.over20MinApproverName || "",
      inc.studentInjury ? "Yes" : "No",
      inc.studentInjuryDescription || "",
      inc.staffInjury ? "Yes" : "No",
      inc.staffInjuryDescription || "",
      inc.medicalAttentionRequired ? "Yes" : "No",
      inc.medicalDetails || "",
      inc.parentVerbalNotification ? "Yes" : "No",
      inc.parentVerbalNotificationAt || "",
      inc.writtenReportSent ? "Yes" : "No",
      inc.writtenReportSentAt || "",
      inc.writtenReportSentMethod || "",
      inc.parentCommentOpportunityGiven ? "Yes" : "No",
      inc.parentComment || "",
      inc.studentComment || "",
      inc.deseReportRequired ? "Yes" : "No",
      inc.deseReportSentAt || "",
      inc.thirtyDayLogSentToDese ? "Yes" : "No",
      inc.debriefConducted ? "Yes" : "No",
      inc.debriefDate || "",
      inc.debriefNotes || "",
      staffName(inc.adminReviewedBy),
      inc.adminReviewedAt || "",
      inc.reportingStaffSignature || "",
      inc.reportingStaffSignedAt || "",
      inc.adminSignature || "",
      inc.adminSignedAt || "",
      inc.status,
      inc.followUpPlan || "",
      inc.notes || "",
    ];
  });

  const escapeCSV = (val: any) => {
    const str = String(val ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csv = [
    headers.map(escapeCSV).join(","),
    ...rows.map(row => row.map(escapeCSV).join(","))
  ].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="DESE_Restraint_Report_${schoolYear}.csv"`);
  res.send(csv);
});

router.get("/protective-measures/dese-30day-log/:incidentId", async (req: Request, res: Response) => {
  const incidentId = Number(req.params.incidentId);
  if (isNaN(incidentId)) { res.status(400).json({ error: "Invalid incidentId" }); return; }

  const [incident] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, incidentId));
  if (!incident) { res.status(404).json({ error: "Not found" }); return; }

  const incDate = new Date(incident.incidentDate);
  const thirtyDaysAgo = new Date(incDate);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString().split("T")[0];

  const priorIncidents = await db
    .select({
      id: restraintIncidentsTable.id,
      studentId: restraintIncidentsTable.studentId,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      incidentDate: restraintIncidentsTable.incidentDate,
      incidentTime: restraintIncidentsTable.incidentTime,
      durationMinutes: restraintIncidentsTable.durationMinutes,
      incidentType: restraintIncidentsTable.incidentType,
      restraintType: restraintIncidentsTable.restraintType,
      studentInjury: restraintIncidentsTable.studentInjury,
      staffInjury: restraintIncidentsTable.staffInjury,
      status: restraintIncidentsTable.status,
    })
    .from(restraintIncidentsTable)
    .leftJoin(studentsTable, eq(restraintIncidentsTable.studentId, studentsTable.id))
    .where(and(
      gte(restraintIncidentsTable.incidentDate, startDate),
      lte(restraintIncidentsTable.incidentDate, incident.incidentDate),
    ))
    .orderBy(restraintIncidentsTable.incidentDate);

  res.json({
    triggeringIncident: incident,
    period: { start: startDate, end: incident.incidentDate },
    totalIncidentsInPeriod: priorIncidents.length,
    incidents: priorIncidents,
  });
});

router.get("/protective-measures/incidents/:id/signatures", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const sigs = await db
    .select({
      id: incidentSignaturesTable.id,
      incidentId: incidentSignaturesTable.incidentId,
      staffId: incidentSignaturesTable.staffId,
      staffFirstName: staffTable.firstName,
      staffLastName: staffTable.lastName,
      staffTitle: staffTable.title,
      staffRole: staffTable.role,
      role: incidentSignaturesTable.role,
      signatureName: incidentSignaturesTable.signatureName,
      signedAt: incidentSignaturesTable.signedAt,
      requestedAt: incidentSignaturesTable.requestedAt,
      status: incidentSignaturesTable.status,
      notes: incidentSignaturesTable.notes,
    })
    .from(incidentSignaturesTable)
    .leftJoin(staffTable, eq(incidentSignaturesTable.staffId, staffTable.id))
    .where(eq(incidentSignaturesTable.incidentId, id))
    .orderBy(incidentSignaturesTable.requestedAt);

  res.json(sigs);
});

router.post("/protective-measures/incidents/:id/signatures/:sigId/sign", async (req: Request, res: Response) => {
  const incidentId = Number(req.params.id);
  const sigId = Number(req.params.sigId);
  if (isNaN(incidentId) || isNaN(sigId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { signatureName, notes } = req.body;
  if (!signatureName) { res.status(400).json({ error: "signatureName required" }); return; }

  const [existing] = await db.select().from(incidentSignaturesTable)
    .where(and(eq(incidentSignaturesTable.id, sigId), eq(incidentSignaturesTable.incidentId, incidentId)));
  if (!existing) { res.status(404).json({ error: "Signature request not found" }); return; }

  if (existing.status !== "pending") {
    res.status(400).json({ error: "Signature has already been completed" });
    return;
  }

  const now = new Date().toISOString();
  const [updated] = await db.update(incidentSignaturesTable).set({
    signatureName,
    signedAt: now,
    status: "signed",
    notes: notes || existing.notes,
  }).where(eq(incidentSignaturesTable.id, sigId)).returning();

  if (existing.role === "reporting_staff") {
    await db.update(restraintIncidentsTable).set({
      reportingStaffSignature: signatureName,
      reportingStaffSignedAt: now,
    }).where(eq(restraintIncidentsTable.id, incidentId));
  }

  if (existing.role === "admin_reviewer") {
    const [incident] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, incidentId));
    if (incident && !incident.adminSignature) {
      await db.update(restraintIncidentsTable).set({
        adminSignature: signatureName,
        adminSignedAt: now,
        adminReviewedBy: existing.staffId,
        adminReviewedAt: now.split("T")[0],
      }).where(eq(restraintIncidentsTable.id, incidentId));
    }
  }

  logAudit(req, {
    action: "update",
    targetTable: "incident_signatures",
    targetId: sigId,
    summary: `Signature signed for incident #${incidentId} (role: ${existing.role})`,
  });
  res.json(updated);
});

router.post("/protective-measures/incidents/:id/signatures/request", async (req: Request, res: Response) => {
  const incidentId = Number(req.params.id);
  if (isNaN(incidentId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { staffId, role } = req.body;
  if (!staffId || !role) { res.status(400).json({ error: "staffId and role required" }); return; }

  const [existingIncident] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, incidentId));
  if (!existingIncident) { res.status(404).json({ error: "Incident not found" }); return; }

  const [existingSig] = await db.select().from(incidentSignaturesTable)
    .where(and(
      eq(incidentSignaturesTable.incidentId, incidentId),
      eq(incidentSignaturesTable.staffId, Number(staffId)),
      eq(incidentSignaturesTable.role, role),
    ));
  if (existingSig) {
    res.status(409).json({ error: "Signature request already exists for this staff member and role", existing: existingSig });
    return;
  }

  const now = new Date().toISOString();
  const [sig] = await db.insert(incidentSignaturesTable).values({
    incidentId,
    staffId: Number(staffId),
    role,
    requestedAt: now,
    status: "pending",
  }).returning();

  logAudit(req, {
    action: "create",
    targetTable: "incident_signatures",
    targetId: sig.id,
    summary: `Signature request created for incident #${incidentId} (staff #${staffId}, role: ${role})`,
    newValues: { incidentId, staffId: Number(staffId), role, status: "pending" } as Record<string, unknown>,
  });
  res.status(201).json(sig);
});

router.get("/protective-measures/pending-signatures", async (req: Request, res: Response) => {
  const { staffId } = req.query;
  const conditions: any[] = [eq(incidentSignaturesTable.status, "pending")];
  if (staffId) conditions.push(eq(incidentSignaturesTable.staffId, Number(staffId)));

  const pending = await db
    .select({
      id: incidentSignaturesTable.id,
      incidentId: incidentSignaturesTable.incidentId,
      staffId: incidentSignaturesTable.staffId,
      role: incidentSignaturesTable.role,
      requestedAt: incidentSignaturesTable.requestedAt,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      incidentDate: restraintIncidentsTable.incidentDate,
      incidentType: restraintIncidentsTable.incidentType,
    })
    .from(incidentSignaturesTable)
    .innerJoin(restraintIncidentsTable, eq(incidentSignaturesTable.incidentId, restraintIncidentsTable.id))
    .leftJoin(studentsTable, eq(restraintIncidentsTable.studentId, studentsTable.id))
    .where(and(...conditions))
    .orderBy(desc(incidentSignaturesTable.requestedAt));

  res.json(pending);
});

router.get("/students/:id/protective-measures", async (req: Request, res: Response) => {
  const studentId = Number(req.params.id);
  if (isNaN(studentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }

  const incidents = await db
    .select()
    .from(restraintIncidentsTable)
    .where(eq(restraintIncidentsTable.studentId, studentId))
    .orderBy(desc(restraintIncidentsTable.incidentDate));

  const summary = {
    totalIncidents: incidents.length,
    thisMonth: incidents.filter(i => i.incidentDate >= new Date().toISOString().substring(0, 8) + "01").length,
    pendingReview: incidents.filter(i => i.status === "open").length,
    withInjuries: incidents.filter(i => i.studentInjury || i.staffInjury).length,
    deseReportsPending: incidents.filter(i => i.deseReportRequired && !i.deseReportSentAt).length,
  };

  logAudit(req, {
    action: "read",
    targetTable: "restraint_incidents",
    studentId: studentId,
    summary: `Viewed ${incidents.length} protective measures for student #${studentId}`,
  });
  res.json({ incidents, summary });
});

async function getFullIncidentData(incidentId: number) {
  const [incident] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, incidentId));
  if (!incident) return null;

  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, incident.studentId));
  let school = null;
  if (student?.schoolId) {
    const [s] = await db.select().from(schoolsTable).where(eq(schoolsTable.id, student.schoolId));
    school = s || null;
  }

  const staffIds = new Set<number>();
  if (incident.primaryStaffId) staffIds.add(incident.primaryStaffId);
  if (incident.adminReviewedBy) staffIds.add(incident.adminReviewedBy);
  if (incident.parentNotifiedBy) staffIds.add(incident.parentNotifiedBy);
  if (incident.parentNotificationSentBy) staffIds.add(incident.parentNotificationSentBy);
  if (Array.isArray(incident.additionalStaffIds)) (incident.additionalStaffIds as number[]).forEach(id => staffIds.add(id));
  if (Array.isArray(incident.observerStaffIds)) (incident.observerStaffIds as number[]).forEach(id => staffIds.add(id));

  let staffMap: Record<number, any> = {};
  if (staffIds.size > 0) {
    const allStaff = await db.select().from(staffTable).where(inArray(staffTable.id, [...staffIds]));
    for (const s of allStaff) staffMap[s.id] = s;
  }

  let caseManager = null;
  if (student?.caseManagerId) {
    const [cm] = await db.select().from(staffTable).where(eq(staffTable.id, student.caseManagerId));
    caseManager = cm || null;
  }

  return {
    incident, student, school, staffMap, caseManager,
    primaryStaff: incident.primaryStaffId ? staffMap[incident.primaryStaffId] || null : null,
    adminReviewer: incident.adminReviewedBy ? staffMap[incident.adminReviewedBy] || null : null,
    additionalStaff: Array.isArray(incident.additionalStaffIds)
      ? (incident.additionalStaffIds as number[]).map(id => staffMap[id]).filter(Boolean) : [],
    observerStaff: Array.isArray(incident.observerStaffIds)
      ? (incident.observerStaffIds as number[]).map(id => staffMap[id]).filter(Boolean) : [],
  };
}

router.get("/protective-measures/incidents/:id/report-pdf", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  let data: Awaited<ReturnType<typeof getFullIncidentData>>;
  try {
    data = await getFullIncidentData(id);
  } catch (e: any) {
    console.error("PDF: getFullIncidentData error:", e);
    res.status(500).json({ error: "Failed to load incident data" });
    return;
  }
  if (!data) { res.status(404).json({ error: "Incident not found" }); return; }

  const { incident, student, school, primaryStaff, adminReviewer, additionalStaff, observerStaff, caseManager } = data;

  const doc = new PDFDocument({ size: "LETTER", margins: { top: 50, bottom: 50, left: 60, right: 60 } });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=restraint-report-${id}.pdf`);
  doc.pipe(res);

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—";
  const formatTime = (t: string | null) => {
    if (!t) return "—";
    const [h, m] = t.split(":");
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
  };

  const TYPE_LABELS: Record<string, string> = {
    physical_restraint: "Physical Restraint",
    seclusion: "Seclusion",
    time_out: "Time-Out",
    physical_escort: "Physical Escort",
  };

  const BODY_POSITIONS: Record<string, string> = {
    prone: "Prone (face down)", supine: "Supine (face up)", seated: "Seated",
    standing: "Standing", side_lying: "Side Lying", kneeling: "Kneeling",
  };

  doc.fontSize(18).font("Helvetica-Bold").text("Physical Restraint / Seclusion Incident Report", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica").fillColor("#666666").text("Massachusetts DESE Compliance — 603 CMR 46.00", { align: "center" });
  if (school) doc.text(school.name, { align: "center" });
  doc.moveDown(0.5);
  doc.moveTo(60, doc.y).lineTo(552, doc.y).strokeColor("#cccccc").stroke();
  doc.moveDown(0.5);

  const sectionTitle = (title: string) => {
    doc.moveDown(0.3);
    doc.fontSize(12).font("Helvetica-Bold").fillColor("#059669").text(title);
    doc.moveDown(0.2);
    doc.fontSize(10).font("Helvetica").fillColor("#111111");
  };

  const field = (label: string, value: string | null | undefined) => {
    if (!value) return;
    doc.font("Helvetica-Bold").text(`${label}: `, { continued: true }).font("Helvetica").text(value);
  };

  sectionTitle("Student Information");
  field("Student Name", student ? `${student.firstName} ${student.lastName}` : `ID: ${incident.studentId}`);
  field("Grade", student?.grade || undefined);
  field("Date of Birth", student?.dateOfBirth ? formatDate(student.dateOfBirth) : undefined);
  field("Disability Category", student?.disabilityCategory || undefined);
  if (caseManager) field("Case Manager", `${caseManager.firstName} ${caseManager.lastName}`);
  if (student?.parentGuardianName) field("Parent/Guardian", student.parentGuardianName);

  sectionTitle("Incident Overview");
  field("Date of Incident", formatDate(incident.incidentDate));
  field("Time", formatTime(incident.incidentTime));
  if (incident.endTime) field("End Time", formatTime(incident.endTime));
  field("Duration", incident.durationMinutes ? `${incident.durationMinutes} minutes` : undefined);
  field("Type", TYPE_LABELS[incident.incidentType] || incident.incidentType);
  field("Location", incident.location || undefined);
  if (incident.restraintType) field("Restraint Type", incident.restraintType);
  if (incident.bodyPosition) field("Body Position During Restraint", BODY_POSITIONS[incident.bodyPosition] || incident.bodyPosition);
  field("BIP in Place", incident.bipInPlace ? "Yes" : "No");
  if (incident.physicalEscortOnly) field("Physical Escort Only", "Yes");

  sectionTitle("Behavioral Context");
  if (incident.antecedentCategory) field("Antecedent Category", incident.antecedentCategory.replace(/_/g, " "));
  if (incident.precedingActivity) field("Preceding Activity", incident.precedingActivity);
  if (incident.triggerDescription) field("Trigger / Antecedent", incident.triggerDescription);
  field("Behavior Description", incident.behaviorDescription);
  if (Array.isArray(incident.deescalationStrategies) && incident.deescalationStrategies.length > 0) {
    field("De-escalation Strategies Used", (incident.deescalationStrategies as string[]).join(", "));
  }
  if (incident.deescalationAttempts) field("Additional De-escalation Details", incident.deescalationAttempts);
  if (incident.alternativesAttempted) field("Alternatives Attempted", incident.alternativesAttempted);
  if (incident.justification) field("Justification for Restraint/Seclusion", incident.justification);
  if (Array.isArray(incident.proceduresUsed) && incident.proceduresUsed.length > 0) {
    field("Procedures / Holds Used", (incident.proceduresUsed as string[]).join(", "));
  }

  sectionTitle("Staff Involved");
  if (primaryStaff) field("Primary Staff (Administered Restraint)", `${primaryStaff.firstName} ${primaryStaff.lastName} — ${primaryStaff.title || primaryStaff.role}`);
  if (additionalStaff.length > 0) field("Additional Staff", additionalStaff.map((s: any) => `${s.firstName} ${s.lastName}`).join(", "));
  if (observerStaff.length > 0) field("Observers", observerStaff.map((s: any) => `${s.firstName} ${s.lastName}`).join(", "));

  sectionTitle("Environment & Safety");
  if (incident.studentMoved) field("Student Moved", incident.studentMovedTo ? `Yes — ${incident.studentMovedTo}` : "Yes");
  if (incident.roomCleared) field("Room Cleared", "Yes");
  if (incident.emergencyServicesCalled) field("Emergency Services Called", "Yes");
  if (incident.calmingStrategiesUsed) field("Calming Strategies Used", incident.calmingStrategiesUsed);
  if (incident.studentStateAfter) field("Student State After Incident", incident.studentStateAfter);
  if (incident.studentReturnedToActivity) field("Student Returned To", incident.studentReturnedToActivity.replace(/_/g, " "));
  if (incident.timeToCalm) field("Time to Calm", `${incident.timeToCalm} minutes`);

  sectionTitle("Injuries");
  field("Student Injury", incident.studentInjury ? "Yes" : "No");
  if (incident.studentInjury && incident.studentInjuryDescription) field("Student Injury Description", incident.studentInjuryDescription);
  field("Staff Injury", incident.staffInjury ? "Yes" : "No");
  if (incident.staffInjury && incident.staffInjuryDescription) field("Staff Injury Description", incident.staffInjuryDescription);
  if (incident.medicalAttentionRequired) field("Medical Attention Required", "Yes");

  if (incident.debriefConducted) {
    sectionTitle("Post-Incident Debrief");
    field("Debrief Date", formatDate(incident.debriefDate));
    if (incident.debriefNotes) field("Debrief Notes", incident.debriefNotes);
  }

  sectionTitle("Signatures & Review");
  if (incident.reportingStaffSignature) field("Reporting Staff Signature", `${incident.reportingStaffSignature} — ${formatDate(incident.reportingStaffSignedAt)}`);
  if (incident.adminSignature) field("Administrator Signature", `${incident.adminSignature} — ${formatDate(incident.adminSignedAt)}`);
  if (adminReviewer) field("Reviewed By", `${adminReviewer.firstName} ${adminReviewer.lastName}`);
  if (incident.adminReviewNotes) field("Admin Review Notes", incident.adminReviewNotes);

  try {
    doc.moveDown(1);
    doc.moveTo(60, doc.y).lineTo(552, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.5);
    doc.fontSize(8).fillColor("#999999").text(`Report generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} — Incident #${id}`, { align: "center" });
  } catch (e: any) {
    console.error("PDF footer render error:", e);
  }

  logAudit(req, {
    action: "read",
    targetTable: "restraint_incidents",
    targetId: id,
    studentId: incident.studentId ?? undefined,
    summary: `Exported incident report PDF for incident ${id}`,
    metadata: { reportType: "incident-report-pdf", incidentId: id },
  });

  doc.end();
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

  const actorStaffId = getPublicMeta(req).staffId ?? null;
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

  const actorStaffId = getPublicMeta(req).staffId ?? null;
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

  const now = new Date().toISOString();
  const [updated] = await db.update(restraintIncidentsTable).set({
    parentNotificationDraft: draft || incident.parentNotificationDraft,
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

  logAudit(req, {
    action: "update",
    targetTable: "restraint_incidents",
    targetId: id,
    studentId: incident.studentId,
    summary: `Parent notification sent for restraint incident #${id} via ${method || "email"}`,
  });
  res.json({
    ...updated,
    sender: { firstName: sender.firstName, lastName: sender.lastName },
    parentEmail: student?.parentEmail || null,
    parentGuardianName: student?.parentGuardianName || null,
  });
});

router.get("/protective-measures/incidents/:id/generate-draft", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const data = await getFullIncidentData(id);
  if (!data) { res.status(404).json({ error: "Incident not found" }); return; }

  const { incident, student, school, primaryStaff, caseManager } = data;

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
