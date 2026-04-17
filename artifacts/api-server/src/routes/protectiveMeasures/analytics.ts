import { Router, type IRouter, type Request, type Response } from "express";
import { db, restraintIncidentsTable, incidentSignaturesTable, studentsTable, staffTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { RESTRAINT_TYPE_LABELS, INCIDENT_TYPE_LABELS } from "./utils";

// tenant-scope: district-join
const router: IRouter = Router();

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

  const headers = [
    "Incident ID", "School Year", "Student Name", "Student Grade", "Disability Category",
    "Date of Incident", "Time Restraint Began", "Time Restraint Ended", "Duration (Minutes)",
    "Incident Type", "Restraint Type", "Body Position", "Location", "Student Moved",
    "Student Moved To", "Room Cleared", "Preceding Activity", "Antecedent Category",
    "Behavior That Prompted Restraint", "De-escalation Strategies Used",
    "De-escalation Strategy Checklist", "Alternatives to Restraint Attempted",
    "Justification for Initiating Restraint", "Procedures Used", "Calming Strategies Used",
    "Student State After Incident", "Student Returned To Activity", "Time to Calm (Minutes)",
    "BIP in Place", "Physical Escort Only", "Emergency Services Called",
    "Primary Staff Name", "Primary Staff Title", "Additional Staff Names", "Observer Names",
    "Principal/Designee Notified", "Principal Notified At", "Continued Over 20 Minutes",
    "20+ Min Approver Name", "Student Injury", "Student Injury Description",
    "Staff Injury", "Staff Injury Description", "Medical Attention Required", "Medical Details",
    "Parent Verbal Notification (24hr)", "Parent Verbal Notification Time",
    "Written Report Sent to Parent", "Written Report Sent Date", "Written Report Method",
    "Parent Comment Opportunity Given", "Parent Comment", "Student Comment",
    "DESE Report Required (Injury)", "DESE Report Sent Date", "30-Day Log Sent to DESE",
    "Debrief Conducted", "Debrief Date", "Debrief Notes", "Admin Reviewed By", "Admin Review Date",
    "Reporting Staff Signature", "Reporting Staff Signed At", "Admin Signature", "Admin Signed At",
    "Status", "Follow-Up Plan", "Notes",
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
      INCIDENT_TYPE_LABELS[inc.incidentType] || inc.incidentType,
      inc.restraintType ? (RESTRAINT_TYPE_LABELS[inc.restraintType] || inc.restraintType) : "",
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

export default router;
