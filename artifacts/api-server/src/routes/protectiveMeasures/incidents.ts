import { Router, type IRouter, type Request, type Response } from "express";
import { db, restraintIncidentsTable, incidentSignaturesTable, studentsTable, staffTable } from "@workspace/db";
import { eq, sql, inArray } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { logAudit } from "../../lib/auditLog";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";
import { registerIncidentIdParam, getFullIncidentData, INCIDENT_TYPE_LABELS, BODY_POSITION_LABELS } from "./utils";

const router: IRouter = Router();
registerIncidentIdParam(router);

router.get("/protective-measures/incidents/:id", async (req: Request, res: Response) => {
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
    status: body.draftSource === "quick" ? "draft_quick" : "draft",
    followUpPlan: body.followUpPlan || null,
    notes: body.notes || null,
  }).returning();

  const now = new Date().toISOString();
  const sigRequests: Array<{ incidentId: number; staffId: number; role: string; requestedAt: string; status: string; signatureName?: string; signedAt?: string }> = [];

  if (body.primaryStaffId) {
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

router.get("/protective-measures/incidents/:id/dese-export", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  let data: Awaited<ReturnType<typeof getFullIncidentData>>;
  try {
    data = await getFullIncidentData(id);
  } catch (e: any) {
    console.error("DESE export: getFullIncidentData error:", e);
    res.status(500).json({ error: "Failed to load incident data" });
    return;
  }
  if (!data) { res.status(404).json({ error: "Incident not found" }); return; }

  if (data.incident.status !== "dese_reported") {
    res.status(400).json({ error: "Incident must be in dese_reported status to export" });
    return;
  }

  const { student, school, primaryStaff, adminReviewer } = data;
  let { incident } = data;

  if (!incident.deseReportSentAt) {
    const stampedAt = new Date().toISOString();
    const [updated] = await db
      .update(restraintIncidentsTable)
      .set({ deseReportSentAt: stampedAt })
      .where(eq(restraintIncidentsTable.id, id))
      .returning();
    incident = updated;
    logAudit(req, {
      action: "update",
      targetTable: "restraint_incidents",
      targetId: id,
      studentId: incident.studentId ?? undefined,
      summary: `Auto-stamped DESE report sent date for incident ${id}`,
      newValues: { deseReportSentAt: stampedAt },
    });
  }

  const fmtDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" }) : "";
  const fmtTime = (t: string | null | undefined) => {
    if (!t) return "";
    const [h, m] = t.split(":");
    const hr = parseInt(h ?? "0");
    return `${hr > 12 ? hr - 12 : hr || 12}:${m ?? "00"} ${hr >= 12 ? "PM" : "AM"}`;
  };
  const yesNo = (v: boolean | null | undefined) => (v ? "Yes" : "No");
  const csvEsc = (v: string | null | undefined) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const studentName = student ? `${student.firstName} ${student.lastName}` : `Student #${incident.studentId}`;
  const primaryStaffName = primaryStaff ? `${primaryStaff.firstName} ${primaryStaff.lastName}` : "";
  const adminName = adminReviewer ? `${adminReviewer.firstName} ${adminReviewer.lastName}` : "";

  const headers = [
    "Incident ID",
    "School Name",
    "School Year",
    "Student Name",
    "Student ID",
    "Student Grade",
    "Student Date of Birth",
    "Disability Category",
    "Incident Date",
    "Incident Time",
    "End Time",
    "Duration (minutes)",
    "Incident Type",
    "Location",
    "Primary Staff",
    "BIP in Place",
    "Physical Escort Only",
    "Restraint Type",
    "Body Position",
    "Continued Over 20 Min",
    "Over 20 Min Approver",
    "Behavior Description",
    "Trigger / Antecedent",
    "Preceding Activity",
    "De-escalation Attempts",
    "Alternatives Attempted",
    "Justification",
    "Student Injury",
    "Student Injury Description",
    "Staff Injury",
    "Staff Injury Description",
    "Medical Attention Required",
    "Medical Details",
    "Emergency Services Called",
    "Parent Verbal Notification",
    "Parent Verbal Notification Date",
    "Parent Notified",
    "Parent Notified Date",
    "Parent Notification Method",
    "Written Report Sent",
    "Written Report Sent Date",
    "Written Report Method",
    "Parent Comment Opportunity Given",
    "Admin Reviewed By",
    "Admin Review Date",
    "DESE Report Required",
    "DESE Report Sent Date",
    "30-Day Log Sent to DESE",
    "Status",
    "Incident Record Created",
  ];

  const schoolYear = (() => {
    if (!incident.incidentDate) return "";
    const year = new Date(incident.incidentDate).getFullYear();
    const month = new Date(incident.incidentDate).getMonth() + 1;
    return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
  })();

  const row = [
    incident.id,
    csvEsc(school?.name),
    csvEsc(schoolYear),
    csvEsc(studentName),
    incident.studentId,
    csvEsc(student?.grade),
    fmtDate(student?.dateOfBirth),
    csvEsc(student?.disabilityCategory),
    fmtDate(incident.incidentDate),
    fmtTime(incident.incidentTime),
    fmtTime(incident.endTime),
    incident.durationMinutes ?? "",
    csvEsc(INCIDENT_TYPE_LABELS[incident.incidentType] ?? incident.incidentType),
    csvEsc(incident.location),
    csvEsc(primaryStaffName),
    yesNo(incident.bipInPlace),
    yesNo(incident.physicalEscortOnly),
    csvEsc(incident.restraintType),
    csvEsc(incident.bodyPosition),
    yesNo(incident.continuedOver20Min),
    csvEsc(incident.over20MinApproverName),
    csvEsc(incident.behaviorDescription),
    csvEsc(incident.triggerDescription),
    csvEsc(incident.precedingActivity),
    csvEsc(incident.deescalationAttempts),
    csvEsc(incident.alternativesAttempted),
    csvEsc(incident.justification),
    yesNo(incident.studentInjury),
    csvEsc(incident.studentInjuryDescription),
    yesNo(incident.staffInjury),
    csvEsc(incident.staffInjuryDescription),
    yesNo(incident.medicalAttentionRequired),
    csvEsc(incident.medicalDetails),
    yesNo(incident.emergencyServicesCalled),
    yesNo(incident.parentVerbalNotification),
    fmtDate(incident.parentVerbalNotificationAt),
    yesNo(incident.parentNotified),
    fmtDate(incident.parentNotifiedAt),
    csvEsc(incident.parentNotificationMethod),
    yesNo(incident.writtenReportSent),
    fmtDate(incident.writtenReportSentAt),
    csvEsc(incident.writtenReportSentMethod),
    yesNo(incident.parentCommentOpportunityGiven),
    csvEsc(adminName),
    fmtDate(incident.adminReviewedAt),
    yesNo(incident.deseReportRequired),
    fmtDate(incident.deseReportSentAt),
    yesNo(incident.thirtyDayLogSentToDese),
    csvEsc(incident.status),
    fmtDate(incident.createdAt),
  ];

  const csv = [headers.join(","), row.join(",")].join("\r\n");

  logAudit(req, {
    action: "read",
    targetTable: "restraint_incidents",
    targetId: id,
    studentId: incident.studentId ?? undefined,
    summary: `Generated DESE CSV export for incident ${id}`,
    metadata: { reportType: "dese-export-csv", incidentId: id },
  });

  const filename = `dese-report-incident-${id}-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

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
  field("Type", INCIDENT_TYPE_LABELS[incident.incidentType] || incident.incidentType);
  field("Location", incident.location || undefined);
  if (incident.restraintType) field("Restraint Type", incident.restraintType);
  if (incident.bodyPosition) field("Body Position During Restraint", BODY_POSITION_LABELS[incident.bodyPosition] || incident.bodyPosition);
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

export default router;
