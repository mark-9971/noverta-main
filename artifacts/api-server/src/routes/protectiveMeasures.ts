import { Router, type Request, type Response } from "express";
import { db, restraintIncidentsTable, studentsTable, staffTable } from "@workspace/db";
import { eq, desc, and, gte, lte, sql, count } from "drizzle-orm";

const router = Router();

router.get("/protective-measures/incidents", async (req: Request, res: Response) => {
  const { studentId, status, incidentType, startDate, endDate } = req.query;

  const conditions: any[] = [];
  if (studentId) conditions.push(eq(restraintIncidentsTable.studentId, Number(studentId)));
  if (status && status !== "all") conditions.push(eq(restraintIncidentsTable.status, String(status)));
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
      writtenReportSent: restraintIncidentsTable.writtenReportSent,
      adminReviewedBy: restraintIncidentsTable.adminReviewedBy,
      adminReviewedAt: restraintIncidentsTable.adminReviewedAt,
      status: restraintIncidentsTable.status,
      createdAt: restraintIncidentsTable.createdAt,
    })
    .from(restraintIncidentsTable)
    .leftJoin(studentsTable, eq(restraintIncidentsTable.studentId, studentsTable.id))
    .where(where)
    .orderBy(desc(restraintIncidentsTable.incidentDate), desc(restraintIncidentsTable.incidentTime));

  res.json(incidents);
});

router.get("/protective-measures/incidents/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [incident] = await db
    .select()
    .from(restraintIncidentsTable)
    .where(eq(restraintIncidentsTable.id, id));

  if (!incident) { res.status(404).json({ error: "Not found" }); return; }

  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, incident.studentId));

  let primaryStaff = null;
  if (incident.primaryStaffId) {
    const [s] = await db.select().from(staffTable).where(eq(staffTable.id, incident.primaryStaffId));
    primaryStaff = s ?? null;
  }

  let adminReviewer = null;
  if (incident.adminReviewedBy) {
    const [s] = await db.select().from(staffTable).where(eq(staffTable.id, incident.adminReviewedBy));
    adminReviewer = s ?? null;
  }

  let parentNotifier = null;
  if (incident.parentNotifiedBy) {
    const [s] = await db.select().from(staffTable).where(eq(staffTable.id, incident.parentNotifiedBy));
    parentNotifier = s ?? null;
  }

  let additionalStaff: any[] = [];
  if (incident.additionalStaffIds && Array.isArray(incident.additionalStaffIds) && incident.additionalStaffIds.length > 0) {
    for (const sid of incident.additionalStaffIds as number[]) {
      const [s] = await db.select().from(staffTable).where(eq(staffTable.id, sid));
      if (s) additionalStaff.push(s);
    }
  }

  res.json({
    ...incident,
    student,
    primaryStaff,
    adminReviewer,
    parentNotifier,
    additionalStaff,
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

  const [student] = await db.select({ id: studentsTable.id }).from(studentsTable).where(eq(studentsTable.id, studentId));
  if (!student) { res.status(404).json({ error: "Student not found" }); return; }

  const [incident] = await db.insert(restraintIncidentsTable).values({
    studentId,
    incidentDate: body.incidentDate,
    incidentTime: body.incidentTime,
    endTime: body.endTime || null,
    durationMinutes: body.durationMinutes ? Number(body.durationMinutes) : null,
    incidentType: body.incidentType,
    location: body.location || null,
    triggerDescription: body.triggerDescription || null,
    behaviorDescription: body.behaviorDescription,
    deescalationAttempts: body.deescalationAttempts || null,
    restraintType: body.restraintType || null,
    restraintDescription: body.restraintDescription || null,
    primaryStaffId: body.primaryStaffId ? Number(body.primaryStaffId) : null,
    additionalStaffIds: body.additionalStaffIds || null,
    studentInjury: body.studentInjury ?? false,
    studentInjuryDescription: body.studentInjuryDescription || null,
    staffInjury: body.staffInjury ?? false,
    staffInjuryDescription: body.staffInjuryDescription || null,
    medicalAttentionRequired: body.medicalAttentionRequired ?? false,
    medicalDetails: body.medicalDetails || null,
    parentNotified: body.parentNotified ?? false,
    parentNotifiedAt: body.parentNotifiedAt || null,
    parentNotifiedBy: body.parentNotifiedBy ? Number(body.parentNotifiedBy) : null,
    parentNotificationMethod: body.parentNotificationMethod || null,
    writtenReportSent: body.writtenReportSent ?? false,
    writtenReportSentAt: body.writtenReportSentAt || null,
    status: "pending_review",
    followUpPlan: body.followUpPlan || null,
    notes: body.notes || null,
  }).returning();

  res.status(201).json(incident);
});

router.patch("/protective-measures/incidents/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select({ id: restraintIncidentsTable.id }).from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const allowed = [
    "incidentDate", "incidentTime", "endTime", "durationMinutes", "incidentType", "location",
    "triggerDescription", "behaviorDescription", "deescalationAttempts", "restraintType",
    "restraintDescription", "primaryStaffId", "additionalStaffIds", "studentInjury",
    "studentInjuryDescription", "staffInjury", "staffInjuryDescription",
    "medicalAttentionRequired", "medicalDetails", "parentNotified", "parentNotifiedAt",
    "parentNotifiedBy", "parentNotificationMethod", "writtenReportSent", "writtenReportSentAt",
    "adminReviewedBy", "adminReviewedAt", "adminReviewNotes",
    "status", "followUpPlan", "notes",
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
  res.json(updated);
});

router.delete("/protective-measures/incidents/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select({ id: restraintIncidentsTable.id }).from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  await db.delete(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, id));
  res.json({ success: true });
});

router.post("/protective-measures/incidents/:id/admin-review", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { adminStaffId, notes } = req.body;
  if (!adminStaffId) { res.status(400).json({ error: "adminStaffId is required" }); return; }

  const [existing] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const today = new Date().toISOString().split("T")[0];
  const [updated] = await db.update(restraintIncidentsTable).set({
    adminReviewedBy: Number(adminStaffId),
    adminReviewedAt: today,
    adminReviewNotes: notes || null,
    status: "reviewed",
  }).where(eq(restraintIncidentsTable.id, id)).returning();

  res.json(updated);
});

router.post("/protective-measures/incidents/:id/parent-notification", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { notifiedById, method } = req.body;
  if (!notifiedById) { res.status(400).json({ error: "notifiedById is required" }); return; }

  const [existing] = await db.select().from(restraintIncidentsTable).where(eq(restraintIncidentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const now = new Date().toISOString();
  const [updated] = await db.update(restraintIncidentsTable).set({
    parentNotified: true,
    parentNotifiedAt: now,
    parentNotifiedBy: Number(notifiedById),
    parentNotificationMethod: method || "phone",
  }).where(eq(restraintIncidentsTable.id, id)).returning();

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
  const pendingReview = allIncidents.filter(i => i.status === "pending_review");
  const parentNotificationsPending = allIncidents.filter(i => !i.parentNotified);
  const withInjuries = allIncidents.filter(i => i.studentInjury || i.staffInjury);
  const writtenReportsPending = allIncidents.filter(i => i.parentNotified && !i.writtenReportSent);

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

  res.json({
    period: { startDate: start, endDate: end },
    totalIncidents,
    byType: {
      physical_restraint: restraints.length,
      seclusion: seclusions.length,
      time_out: timeouts.length,
    },
    pendingReview: pendingReview.length,
    parentNotificationsPending: parentNotificationsPending.length,
    writtenReportsPending: writtenReportsPending.length,
    injuries: withInjuries.length,
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
      incidentType: restraintIncidentsTable.incidentType,
      durationMinutes: restraintIncidentsTable.durationMinutes,
      restraintType: restraintIncidentsTable.restraintType,
      studentInjury: restraintIncidentsTable.studentInjury,
      staffInjury: restraintIncidentsTable.staffInjury,
      medicalAttentionRequired: restraintIncidentsTable.medicalAttentionRequired,
      parentNotified: restraintIncidentsTable.parentNotified,
      writtenReportSent: restraintIncidentsTable.writtenReportSent,
      adminReviewedAt: restraintIncidentsTable.adminReviewedAt,
      status: restraintIncidentsTable.status,
    })
    .from(restraintIncidentsTable)
    .leftJoin(studentsTable, eq(restraintIncidentsTable.studentId, studentsTable.id))
    .where(and(
      gte(restraintIncidentsTable.incidentDate, start),
      lte(restraintIncidentsTable.incidentDate, end),
    ))
    .orderBy(restraintIncidentsTable.incidentDate);

  const uniqueStudents = new Set(allIncidents.map(i => i.studentId));
  const restraintsOnly = allIncidents.filter(i => i.incidentType === "physical_restraint");
  const seclusionsOnly = allIncidents.filter(i => i.incidentType === "seclusion");

  const byDisability: Record<string, number> = {};
  for (const inc of allIncidents) {
    const cat = inc.disabilityCategory || "Unknown";
    byDisability[cat] = (byDisability[cat] || 0) + 1;
  }

  const byGrade: Record<string, number> = {};
  for (const inc of allIncidents) {
    const g = inc.studentGrade || "Unknown";
    byGrade[g] = (byGrade[g] || 0) + 1;
  }

  res.json({
    schoolYear,
    reportPeriod: { start, end },
    totalIncidents: allIncidents.length,
    totalRestraints: restraintsOnly.length,
    totalSeclusions: seclusionsOnly.length,
    uniqueStudentsInvolved: uniqueStudents.size,
    injuryIncidents: allIncidents.filter(i => i.studentInjury || i.staffInjury).length,
    studentInjuries: allIncidents.filter(i => i.studentInjury).length,
    staffInjuries: allIncidents.filter(i => i.staffInjury).length,
    medicalAttentionRequired: allIncidents.filter(i => i.medicalAttentionRequired).length,
    complianceMetrics: {
      parentNotificationRate: allIncidents.length > 0
        ? Math.round(allIncidents.filter(i => i.parentNotified).length / allIncidents.length * 100) : 100,
      writtenReportRate: allIncidents.length > 0
        ? Math.round(allIncidents.filter(i => i.writtenReportSent).length / allIncidents.length * 100) : 100,
      adminReviewRate: allIncidents.length > 0
        ? Math.round(allIncidents.filter(i => i.adminReviewedAt).length / allIncidents.length * 100) : 100,
    },
    byDisabilityCategory: byDisability,
    byGrade,
    incidents: allIncidents,
  });
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
    pendingReview: incidents.filter(i => i.status === "pending_review").length,
    withInjuries: incidents.filter(i => i.studentInjury || i.staffInjury).length,
  };

  res.json({ incidents, summary });
});

export default router;
