import { Router, type IRouter, type Request, type Response } from "express";
import PDFDocument from "pdfkit";
import { db } from "@workspace/db";
import {
  studentsTable, iepDocumentsTable, serviceRequirementsTable, serviceTypesTable,
  sessionLogsTable, schoolsTable, iepGoalsTable, progressReportsTable,
  restraintIncidentsTable, teamMeetingsTable, iepAccommodationsTable,
  parentContactsTable, complianceEventsTable, meetingConsentRecordsTable,
} from "@workspace/db";
import { eq, and, desc, asc, lte, gte, sql } from "drizzle-orm";
import { requireRoles } from "../middlewares/auth";
import { PERMISSIONS } from "../lib/permissions";
import { logAudit } from "../lib/auditLog";
import { getPublicMeta } from "../lib/clerkClaims";

interface BufferedPDFDoc {
  bufferedPageRange(): { start: number; count: number };
}

const router: IRouter = Router();
router.use(requireRoles(...PERMISSIONS.reports.export));

function escapeCSV(val: unknown): string {
  const str = String(val ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCSV(headers: string[], rows: unknown[][]): string {
  return [
    headers.map(escapeCSV).join(","),
    ...rows.map(r => r.map(escapeCSV).join(",")),
  ].join("\n");
}

const ACTIVE_IEPS_HEADERS = [
  "Student Last Name", "Student First Name", "Grade", "Disability Category", "School",
  "IEP Start Date", "IEP End Date", "Annual Review Meeting Date", "IEP Type",
  "IEP Status", "Days Until Annual Review", "Annual Review Status",
] as const;

const SERVICE_MINUTES_HEADERS = [
  "Student Last Name", "Student First Name", "Grade", "School",
  "Service Type", "Mandated Minutes/Week", "Sessions Completed",
  "Delivered Minutes", "Missed Sessions", "Session Attendance %",
  "Reporting Period Start", "Reporting Period End",
] as const;

const INCIDENTS_HEADERS = [
  "Incident Date", "Incident Time", "School", "Student Last Name", "Student First Name",
  "Grade", "Disability Category", "Type of Restraint/Seclusion", "Duration (min)",
  "Location", "Student Injury", "Staff Injury", "Medical Attention Required",
  "DESE Report Required", "Parent Verbal Notification", "Written Report Sent",
  "Debrief Conducted", "Status",
] as const;

interface ExportScope {
  enforcedDistrictId: number | null;
  enforcedSchoolId: number | null;
  isPlatformAdmin: boolean;
}

function resolveExportScope(req: Request): ExportScope | { error: string; status: number } {
  const { districtId, platformAdmin } = getPublicMeta(req);
  if (platformAdmin) {
    return { enforcedDistrictId: null, enforcedSchoolId: null, isPlatformAdmin: true };
  }
  if (districtId === undefined) {
    return { error: "Access denied: your account is not assigned to a district", status: 403 };
  }
  return { enforcedDistrictId: Number(districtId), enforcedSchoolId: null, isPlatformAdmin: false };
}

function assertCSVHeaders(actual: readonly string[], canonical: readonly string[]): void {
  if (actual.length !== canonical.length) {
    throw new Error(`CSV header count mismatch: expected ${canonical.length}, got ${actual.length}`);
  }
  for (let i = 0; i < canonical.length; i++) {
    if (actual[i] !== canonical[i]) {
      throw new Error(`CSV header mismatch at position ${i}: expected "${canonical[i]}", got "${actual[i]}"`);
    }
  }
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return String(d);
  }
}

function daysUntil(dateStr: string | null | undefined): number | "" {
  if (!dateStr) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

router.get("/reports/exports/active-ieps.csv", async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const { schoolId, status: statusParam } = req.query;
    const statusFilter = typeof statusParam === "string" ? statusParam : "active";
    const effectiveDistrictId = scope.enforcedDistrictId;

    const conditions: ReturnType<typeof eq>[] = [
      eq(iepDocumentsTable.active, true),
    ];
    if (statusFilter !== "all") {
      conditions.push(eq(studentsTable.status, statusFilter) as ReturnType<typeof eq>);
    }
    if (schoolId) conditions.push(eq(studentsTable.schoolId, Number(schoolId)));
    if (effectiveDistrictId !== null) {
      conditions.push(sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${effectiveDistrictId})` as ReturnType<typeof eq>);
    }

    const rows = await db.select({
      studentId: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      grade: studentsTable.grade,
      disabilityCategory: studentsTable.disabilityCategory,
      schoolName: schoolsTable.name,
      iepStartDate: iepDocumentsTable.iepStartDate,
      iepEndDate: iepDocumentsTable.iepEndDate,
      meetingDate: iepDocumentsTable.meetingDate,
      iepType: iepDocumentsTable.iepType,
      status: iepDocumentsTable.status,
    })
      .from(studentsTable)
      .innerJoin(iepDocumentsTable, and(
        eq(iepDocumentsTable.studentId, studentsTable.id),
        eq(iepDocumentsTable.active, true)
      ))
      .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
      .where(and(...conditions))
      .orderBy(asc(iepDocumentsTable.iepEndDate), asc(studentsTable.lastName));

    const headers = [...ACTIVE_IEPS_HEADERS];
    assertCSVHeaders(headers, ACTIVE_IEPS_HEADERS);

    const csvRows = rows.map(r => {
      const days = daysUntil(r.iepEndDate);
      let reviewStatus = "Upcoming";
      if (typeof days === "number") {
        if (days < 0) reviewStatus = "OVERDUE";
        else if (days <= 30) reviewStatus = "Due within 30 days";
        else if (days <= 60) reviewStatus = "Due within 60 days";
      }
      return [
        r.lastName,
        r.firstName,
        r.grade ?? "",
        r.disabilityCategory ?? "",
        r.schoolName ?? "",
        fmtDate(r.iepStartDate),
        fmtDate(r.iepEndDate),
        fmtDate(r.meetingDate),
        r.iepType ?? "annual",
        r.status ?? "",
        typeof days === "number" ? days : "",
        reviewStatus,
      ];
    });

    logAudit(req, {
      action: "read",
      targetTable: "iep_documents",
      summary: `Exported active-ieps CSV (${csvRows.length} rows)`,
      metadata: { reportType: "active-ieps-csv", rowCount: csvRows.length },
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="Active_IEPs_${new Date().toISOString().split("T")[0]}.csv"`);
    res.send(buildCSV(headers, csvRows));
  } catch (e: any) {
    console.error("GET /reports/exports/active-ieps.csv error:", e);
    res.status(500).json({ error: "Failed to generate active IEPs export" });
  }
});

router.get("/reports/exports/service-minutes.csv", async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const { schoolId, startDate, endDate, status: statusParam2, schoolYearId } = req.query;
    const statusFilter2 = typeof statusParam2 === "string" ? statusParam2 : "active";
    const effectiveDistrictId = scope.enforcedDistrictId;
    const now = new Date();
    const start = (startDate as string) || new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split("T")[0];
    const end = (endDate as string) || now.toISOString().split("T")[0];

    const studentConditions: ReturnType<typeof eq>[] = [];
    if (statusFilter2 !== "all") {
      studentConditions.push(eq(studentsTable.status, statusFilter2) as ReturnType<typeof eq>);
    }
    if (schoolId) studentConditions.push(eq(studentsTable.schoolId, Number(schoolId)));
    if (effectiveDistrictId !== null) {
      studentConditions.push(sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${effectiveDistrictId})` as ReturnType<typeof eq>);
    }

    const students = await db.select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      grade: studentsTable.grade,
      schoolName: schoolsTable.name,
    })
      .from(studentsTable)
      .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
      .where(studentConditions.length > 0 ? and(...studentConditions) : undefined)
      .orderBy(asc(studentsTable.lastName), asc(studentsTable.firstName));

    if (students.length === 0) {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="Service_Minutes_${start}_${end}.csv"`);
      res.send(buildCSV([...SERVICE_MINUTES_HEADERS], []));
      return;
    }

    const sIds = students.map(s => s.id);
    const idList = sql.join(sIds.map(id => sql`${id}`), sql`, `);

    const [reqs, sessions] = await Promise.all([
      db.select({
        studentId: serviceRequirementsTable.studentId,
        serviceTypeName: serviceTypesTable.name,
        requiredMinutes: serviceRequirementsTable.requiredMinutes,
        intervalType: serviceRequirementsTable.intervalType,
      })
        .from(serviceRequirementsTable)
        .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
        .where(and(
          eq(serviceRequirementsTable.active, true),
          sql`${serviceRequirementsTable.studentId} IN (${idList})`
        )),

      db.select({
        studentId: sessionLogsTable.studentId,
        serviceTypeId: sessionLogsTable.serviceTypeId,
        serviceTypeName: serviceTypesTable.name,
        status: sessionLogsTable.status,
        durationMinutes: sessionLogsTable.durationMinutes,
      })
        .from(sessionLogsTable)
        .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, sessionLogsTable.serviceTypeId))
        .where(and(
          sql`${sessionLogsTable.studentId} IN (${idList})`,
          gte(sessionLogsTable.sessionDate, start),
          lte(sessionLogsTable.sessionDate, end),
          ...(schoolYearId ? [eq(sessionLogsTable.schoolYearId, Number(schoolYearId))] : []),
        )),
    ]);

    type SessionSummary = { completed: number; delivered: number; missed: number };
    const sessionMap = new Map<string, SessionSummary>();
    for (const s of sessions) {
      const key = `${s.studentId}|${s.serviceTypeName ?? ""}`;
      if (!sessionMap.has(key)) sessionMap.set(key, { completed: 0, delivered: 0, missed: 0 });
      const entry = sessionMap.get(key)!;
      if (s.status === "completed" || s.status === "makeup") {
        entry.completed++;
        entry.delivered += s.durationMinutes ?? 0;
      } else if (s.status === "missed") {
        entry.missed++;
      }
    }

    const reqsByStudent = new Map<number, typeof reqs>();
    for (const r of reqs) {
      if (!reqsByStudent.has(r.studentId)) reqsByStudent.set(r.studentId, []);
      reqsByStudent.get(r.studentId)!.push(r);
    }

    const headers = [...SERVICE_MINUTES_HEADERS];
    assertCSVHeaders(headers, SERVICE_MINUTES_HEADERS);

    const csvRows: unknown[][] = [];
    for (const student of students) {
      const studentReqs = reqsByStudent.get(student.id) ?? [];
      for (const req of studentReqs) {
        const key = `${student.id}|${req.serviceTypeName ?? ""}`;
        const summary = sessionMap.get(key) ?? { completed: 0, delivered: 0, missed: 0 };
        const totalSessions = summary.completed + summary.missed;
        const compliancePct = totalSessions > 0 ? Math.round((summary.completed / totalSessions) * 100) : 100;
        csvRows.push([
          student.lastName,
          student.firstName,
          student.grade ?? "",
          student.schoolName ?? "",
          req.serviceTypeName ?? "",
          `${req.requiredMinutes ?? ""}/${req.intervalType ?? "week"}`,
          summary.completed,
          summary.delivered,
          summary.missed,
          `${compliancePct}%`,
          fmtDate(start),
          fmtDate(end),
        ]);
      }
    }

    logAudit(req, {
      action: "read",
      targetTable: "session_logs",
      summary: `Exported service-minutes CSV (${csvRows.length} rows) ${start}–${end}`,
      metadata: { reportType: "service-minutes-csv", rowCount: csvRows.length, start, end },
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="Service_Minutes_${start}_${end}.csv"`);
    res.send(buildCSV(headers, csvRows));
  } catch (e: any) {
    console.error("GET /reports/exports/service-minutes.csv error:", e);
    res.status(500).json({ error: "Failed to generate service minutes export" });
  }
});

router.get("/reports/exports/incidents.csv", async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const { schoolId, startDate, endDate, schoolYearId: incidentYearId } = req.query;
    const effectiveDistrictId = scope.enforcedDistrictId;
    const now = new Date();
    const start = (startDate as string) || new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split("T")[0];
    const end = (endDate as string) || now.toISOString().split("T")[0];

    const conditions: ReturnType<typeof gte>[] = [
      gte(restraintIncidentsTable.incidentDate, start),
      lte(restraintIncidentsTable.incidentDate, end),
    ];
    if (schoolId) {
      conditions.push(sql`${restraintIncidentsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${Number(schoolId)})` as ReturnType<typeof gte>);
    }
    if (effectiveDistrictId !== null) {
      conditions.push(sql`${restraintIncidentsTable.studentId} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${effectiveDistrictId}))` as ReturnType<typeof gte>);
    }
    if (incidentYearId) {
      conditions.push(eq(restraintIncidentsTable.schoolYearId, Number(incidentYearId)) as unknown as ReturnType<typeof gte>);
    }

    const incidents = await db.select({
      id: restraintIncidentsTable.id,
      incidentDate: restraintIncidentsTable.incidentDate,
      incidentTime: restraintIncidentsTable.incidentTime,
      incidentType: restraintIncidentsTable.incidentType,
      durationMinutes: restraintIncidentsTable.durationMinutes,
      location: restraintIncidentsTable.location,
      studentInjury: restraintIncidentsTable.studentInjury,
      staffInjury: restraintIncidentsTable.staffInjury,
      medicalAttentionRequired: restraintIncidentsTable.medicalAttentionRequired,
      deseReportRequired: restraintIncidentsTable.deseReportRequired,
      parentVerbalNotification: restraintIncidentsTable.parentVerbalNotification,
      writtenReportSent: restraintIncidentsTable.writtenReportSent,
      debriefConducted: restraintIncidentsTable.debriefConducted,
      status: restraintIncidentsTable.status,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      studentGrade: studentsTable.grade,
      studentDisability: studentsTable.disabilityCategory,
      schoolName: schoolsTable.name,
    })
      .from(restraintIncidentsTable)
      .leftJoin(studentsTable, eq(studentsTable.id, restraintIncidentsTable.studentId))
      .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
      .where(and(...conditions))
      .orderBy(desc(restraintIncidentsTable.incidentDate));

    const TYPE_LABELS: Record<string, string> = {
      physical_restraint: "Physical Restraint",
      seclusion: "Seclusion",
      time_out: "Time-Out",
      physical_escort: "Physical Escort",
    };

    const headers = [...INCIDENTS_HEADERS];
    assertCSVHeaders(headers, INCIDENTS_HEADERS);

    const csvRows = incidents.map(i => [
      fmtDate(i.incidentDate),
      i.incidentTime ?? "",
      i.schoolName ?? "",
      i.studentLastName ?? "",
      i.studentFirstName ?? "",
      i.studentGrade ?? "",
      i.studentDisability ?? "",
      TYPE_LABELS[i.incidentType] ?? i.incidentType,
      i.durationMinutes ?? "",
      i.location ?? "",
      i.studentInjury ? "Yes" : "No",
      i.staffInjury ? "Yes" : "No",
      i.medicalAttentionRequired ? "Yes" : "No",
      i.deseReportRequired ? "Yes" : "No",
      i.parentVerbalNotification ? "Yes" : "No",
      i.writtenReportSent ? "Yes" : "No",
      i.debriefConducted ? "Yes" : "No",
      i.status ?? "",
    ]);

    logAudit(req, {
      action: "read",
      targetTable: "restraint_incidents",
      summary: `Exported incidents CSV (${csvRows.length} rows) ${start}–${end}`,
      metadata: { reportType: "incidents-csv", rowCount: csvRows.length, start, end },
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="Incidents_${start}_${end}.csv"`);
    res.send(buildCSV(headers, csvRows));
  } catch (e: any) {
    console.error("GET /reports/exports/incidents.csv error:", e);
    res.status(500).json({ error: "Failed to generate incidents export" });
  }
});

router.get("/reports/exports/student/:studentId/full-record.pdf", async (req: Request, res: Response): Promise<void> => {
  const studentId = parseInt(req.params.studentId);
  if (isNaN(studentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }

  const { districtId: callerDistrictId, platformAdmin } = getPublicMeta(req);

  if (!platformAdmin) {
    const scopeResult = await db.execute(
      sql`SELECT sc.district_id FROM students st LEFT JOIN schools sc ON sc.id = st.school_id WHERE st.id = ${studentId} LIMIT 1`
    );
    const scopeRow = (scopeResult.rows as Array<{ district_id: number | null }>)[0];
    const studentDistrictId = scopeRow?.district_id ?? null;
    if (callerDistrictId === undefined) {
      res.status(403).json({ error: "Access denied: your account is not assigned to a district" });
      return;
    }
    if (studentDistrictId === null || Number(callerDistrictId) !== Number(studentDistrictId)) {
      res.status(403).json({ error: "Access denied: student is outside your district" });
      return;
    }
  }

  const doc = new PDFDocument({ size: "LETTER", margins: { top: 50, bottom: 60, left: 60, right: 60 }, bufferPages: true });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="student-record-${studentId}.pdf"`);
  doc.pipe(res);

  const safeStr = (v: unknown): string => v == null ? "" : String(v);

  const fmtDateLong = (d: string | null | undefined): string => {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); }
    catch { return safeStr(d); }
  };

  try {
    const [
      [student],
      iepDocs,
      goals,
      incidents,
      meetings,
      accommodations,
      contacts,
      progressReports,
      complianceEvents,
      consentRecords,
    ] = await Promise.all([
      db.select({
        id: studentsTable.id,
        firstName: studentsTable.firstName,
        lastName: studentsTable.lastName,
        grade: studentsTable.grade,
        dateOfBirth: studentsTable.dateOfBirth,
        disabilityCategory: studentsTable.disabilityCategory,
        placementType: studentsTable.placementType,
        primaryLanguage: studentsTable.primaryLanguage,
        parentGuardianName: studentsTable.parentGuardianName,
        parentEmail: studentsTable.parentEmail,
        parentPhone: studentsTable.parentPhone,
        schoolName: schoolsTable.name,
      })
        .from(studentsTable)
        .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
        .where(eq(studentsTable.id, studentId)),

      db.select().from(iepDocumentsTable)
        .where(eq(iepDocumentsTable.studentId, studentId))
        .orderBy(desc(iepDocumentsTable.iepStartDate))
        .limit(5),

      db.select().from(iepGoalsTable)
        .where(and(eq(iepGoalsTable.studentId, studentId), eq(iepGoalsTable.active, true)))
        .orderBy(asc(iepGoalsTable.goalArea), asc(iepGoalsTable.goalNumber)),

      db.select({
        id: restraintIncidentsTable.id,
        incidentDate: restraintIncidentsTable.incidentDate,
        incidentType: restraintIncidentsTable.incidentType,
        durationMinutes: restraintIncidentsTable.durationMinutes,
        behaviorDescription: restraintIncidentsTable.behaviorDescription,
        studentInjury: restraintIncidentsTable.studentInjury,
        staffInjury: restraintIncidentsTable.staffInjury,
        status: restraintIncidentsTable.status,
        deseReportRequired: restraintIncidentsTable.deseReportRequired,
        parentVerbalNotification: restraintIncidentsTable.parentVerbalNotification,
        writtenReportSent: restraintIncidentsTable.writtenReportSent,
      })
        .from(restraintIncidentsTable)
        .where(eq(restraintIncidentsTable.studentId, studentId))
        .orderBy(desc(restraintIncidentsTable.incidentDate))
        .limit(50),

      db.select({
        id: teamMeetingsTable.id,
        meetingType: teamMeetingsTable.meetingType,
        scheduledDate: teamMeetingsTable.scheduledDate,
        status: teamMeetingsTable.status,
        outcome: teamMeetingsTable.outcome,
        minutesFinalized: teamMeetingsTable.minutesFinalized,
        consentStatus: teamMeetingsTable.consentStatus,
        noticeSentDate: teamMeetingsTable.noticeSentDate,
      })
        .from(teamMeetingsTable)
        .where(eq(teamMeetingsTable.studentId, studentId))
        .orderBy(desc(teamMeetingsTable.scheduledDate))
        .limit(20),

      db.select().from(iepAccommodationsTable)
        .where(and(eq(iepAccommodationsTable.studentId, studentId), eq(iepAccommodationsTable.active, true))),

      db.select({
        contactDate: parentContactsTable.contactDate,
        contactType: parentContactsTable.contactType,
        contactMethod: parentContactsTable.contactMethod,
        subject: parentContactsTable.subject,
        outcome: parentContactsTable.outcome,
        parentName: parentContactsTable.parentName,
      })
        .from(parentContactsTable)
        .where(eq(parentContactsTable.studentId, studentId))
        .orderBy(desc(parentContactsTable.contactDate))
        .limit(30),

      db.select({
        reportingPeriod: progressReportsTable.reportingPeriod,
        periodStart: progressReportsTable.periodStart,
        periodEnd: progressReportsTable.periodEnd,
        status: progressReportsTable.status,
        overallSummary: progressReportsTable.overallSummary,
        recommendations: progressReportsTable.recommendations,
        createdAt: progressReportsTable.createdAt,
      })
        .from(progressReportsTable)
        .where(eq(progressReportsTable.studentId, studentId))
        .orderBy(desc(progressReportsTable.createdAt))
        .limit(10),

      db.select({
        eventType: complianceEventsTable.eventType,
        title: complianceEventsTable.title,
        dueDate: complianceEventsTable.dueDate,
        status: complianceEventsTable.status,
        completedDate: complianceEventsTable.completedDate,
      })
        .from(complianceEventsTable)
        .where(eq(complianceEventsTable.studentId, studentId))
        .orderBy(asc(complianceEventsTable.dueDate)),

      db.select({
        consentType: meetingConsentRecordsTable.consentType,
        decision: meetingConsentRecordsTable.decision,
        decisionDate: meetingConsentRecordsTable.decisionDate,
        respondentName: meetingConsentRecordsTable.respondentName,
        respondentRelationship: meetingConsentRecordsTable.respondentRelationship,
        notes: meetingConsentRecordsTable.notes,
        followUpRequired: meetingConsentRecordsTable.followUpRequired,
        followUpDate: meetingConsentRecordsTable.followUpDate,
        createdAt: meetingConsentRecordsTable.createdAt,
      })
        .from(meetingConsentRecordsTable)
        .where(eq(meetingConsentRecordsTable.studentId, studentId))
        .orderBy(desc(meetingConsentRecordsTable.createdAt))
        .limit(30),
    ]);

    if (!student) {
      doc.fontSize(14).text("Student not found.");
      doc.end();
      return;
    }

    const PAGE_W = 492;
    const EMERALD = "#059669";
    const GRAY_DARK = "#111827";
    const GRAY_MID = "#6b7280";

    const sectionTitle = (title: string) => {
      doc.moveDown(0.6);
      doc.fontSize(13).font("Helvetica-Bold").fillColor(EMERALD).text(title);
      doc.moveTo(60, doc.y + 2).lineTo(552, doc.y + 2).strokeColor("#d1fae5").lineWidth(1).stroke();
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica").fillColor(GRAY_DARK);
    };

    const row = (label: string, value: string) => {
      doc.font("Helvetica-Bold").text(`${label}: `, { continued: true }).font("Helvetica").text(value || "—");
    };

    doc.fontSize(20).font("Helvetica-Bold").fillColor(GRAY_DARK)
      .text("Student Record Export", { align: "center" });
    doc.moveDown(0.2);
    doc.fontSize(10).font("Helvetica").fillColor(GRAY_MID)
      .text("Massachusetts SPED — 603 CMR 28.00 / 46.00 — Confidential", { align: "center" });
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor(GRAY_MID)
      .text(`Generated: ${fmtDateLong(new Date().toISOString().split("T")[0])}`, { align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(60, doc.y).lineTo(552, doc.y).strokeColor("#e5e7eb").lineWidth(1).stroke();

    sectionTitle("Student Information");
    row("Name", `${safeStr(student.firstName)} ${safeStr(student.lastName)}`);
    row("Date of Birth", fmtDateLong(student.dateOfBirth));
    row("Grade", safeStr(student.grade));
    row("School", safeStr(student.schoolName));
    row("Disability Category", safeStr(student.disabilityCategory));
    row("Placement Type", safeStr(student.placementType));
    row("Primary Language", safeStr(student.primaryLanguage));
    row("Parent / Guardian", safeStr(student.parentGuardianName));
    if (student.parentEmail) row("Parent Email", safeStr(student.parentEmail));
    if (student.parentPhone) row("Parent Phone", safeStr(student.parentPhone));

    if (iepDocs.length > 0) {
      sectionTitle("IEP Documents");
      for (const d of iepDocs) {
        doc.font("Helvetica-Bold").fontSize(10).fillColor(GRAY_DARK)
          .text(`${d.iepType ?? "Annual"} IEP — ${fmtDateLong(d.iepStartDate)} to ${fmtDateLong(d.iepEndDate)}`, { indent: 10 });
        doc.font("Helvetica").fontSize(9).fillColor(GRAY_MID);
        if (d.meetingDate) doc.text(`  Meeting Date: ${fmtDateLong(d.meetingDate)}`, { indent: 20 });
        doc.text(`  Status: ${safeStr(d.status)} | Active: ${d.active ? "Yes" : "No"}`, { indent: 20 });
        if (d.plaafpAcademic) {
          doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY_DARK).text("  Academic PLAAFP:", { indent: 20 });
          doc.font("Helvetica").fontSize(9).fillColor(GRAY_MID)
            .text(d.plaafpAcademic.slice(0, 500) + (d.plaafpAcademic.length > 500 ? "…" : ""), { indent: 30, width: PAGE_W - 30 });
        }
        doc.moveDown(0.3);
      }
    }

    if (goals.length > 0) {
      sectionTitle("Active IEP Goals");
      const byArea = goals.reduce<Record<string, typeof goals>>((acc, g) => {
        if (!acc[g.goalArea]) acc[g.goalArea] = [];
        acc[g.goalArea].push(g);
        return acc;
      }, {});
      for (const [area, areaGoals] of Object.entries(byArea)) {
        doc.font("Helvetica-Bold").fontSize(10).fillColor(GRAY_DARK).text(area, { indent: 10 });
        for (const g of areaGoals) {
          doc.font("Helvetica").fontSize(9).fillColor(GRAY_MID)
            .text(`  Goal ${g.goalNumber}: ${safeStr(g.annualGoal)}`, { indent: 20, width: PAGE_W - 20 });
          if (g.baseline) doc.text(`  Baseline: ${safeStr(g.baseline)}`, { indent: 30 });
          if (g.targetCriterion) doc.text(`  Target: ${safeStr(g.targetCriterion)}`, { indent: 30 });
          doc.moveDown(0.2);
        }
      }
    }

    if (accommodations.length > 0) {
      sectionTitle("Accommodations");
      for (const a of accommodations) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY_DARK)
          .text(`${safeStr(a.category).charAt(0).toUpperCase() + safeStr(a.category).slice(1)}: `, { continued: true, indent: 10 })
          .font("Helvetica").fillColor(GRAY_MID).text(safeStr(a.description));
        if (a.setting) doc.text(`  Setting: ${safeStr(a.setting)} | Frequency: ${safeStr(a.frequency)}`, { indent: 20 });
      }
    }

    if (progressReports.length > 0) {
      sectionTitle("Progress Reports");
      for (const r of progressReports) {
        doc.font("Helvetica-Bold").fontSize(10).fillColor(GRAY_DARK)
          .text(`${safeStr(r.reportingPeriod)} (${fmtDateLong(r.periodStart)} – ${fmtDateLong(r.periodEnd)})`, { indent: 10 });
        doc.font("Helvetica").fontSize(9).fillColor(GRAY_MID)
          .text(`Status: ${safeStr(r.status)} | Generated: ${r.createdAt ? fmtDateLong(r.createdAt.toISOString().split("T")[0]) : "—"}`, { indent: 20 });
        if (r.overallSummary) {
          doc.text(r.overallSummary.slice(0, 400) + (r.overallSummary.length > 400 ? "…" : ""), { indent: 20, width: PAGE_W - 20 });
        }
        doc.moveDown(0.3);
      }
    }

    if (meetings.length > 0) {
      sectionTitle("Team Meetings");
      for (const m of meetings) {
        const mtgLabel: Record<string, string> = {
          annual: "Annual IEP Review",
          initial: "Initial Eligibility",
          reevaluation: "Reevaluation",
          amendment: "IEP Amendment",
          transition: "Transition Planning",
          manifestation: "Manifestation Determination",
          eligibility: "Eligibility Meeting",
          other: "Other Meeting",
        };
        doc.font("Helvetica-Bold").fontSize(10).fillColor(GRAY_DARK)
          .text(`${mtgLabel[m.meetingType] ?? m.meetingType} — ${fmtDateLong(m.scheduledDate)}`, { indent: 10 });
        doc.font("Helvetica").fontSize(9).fillColor(GRAY_MID)
          .text(`Status: ${safeStr(m.status)} | Notice Sent: ${m.noticeSentDate ? fmtDateLong(m.noticeSentDate) : "No"}`, { indent: 20 });
        if (m.outcome) doc.text(`Outcome: ${m.outcome}`, { indent: 20, width: PAGE_W - 20 });
        doc.moveDown(0.2);
      }
    }

    if (incidents.length > 0) {
      sectionTitle("Restraint / Seclusion Incidents");
      const TYPE_LABELS: Record<string, string> = {
        physical_restraint: "Physical Restraint", seclusion: "Seclusion",
        time_out: "Time-Out", physical_escort: "Physical Escort",
      };
      for (const i of incidents) {
        doc.font("Helvetica-Bold").fontSize(10).fillColor(GRAY_DARK)
          .text(`${fmtDateLong(i.incidentDate)} — ${TYPE_LABELS[i.incidentType] ?? i.incidentType}`, { indent: 10 });
        doc.font("Helvetica").fontSize(9).fillColor(GRAY_MID)
          .text(`Duration: ${i.durationMinutes ?? "—"} min | Student Injury: ${i.studentInjury ? "Yes" : "No"} | Status: ${safeStr(i.status)}`, { indent: 20 });
        doc.text(`DESE Report: ${i.deseReportRequired ? "Required" : "Not required"} | Parent Notified: ${i.parentVerbalNotification ? "Yes" : "No"}`, { indent: 20 });
        if (i.behaviorDescription) doc.text(i.behaviorDescription.slice(0, 200), { indent: 20, width: PAGE_W - 20 });
        doc.moveDown(0.2);
      }
    }

    if (contacts.length > 0) {
      sectionTitle("Parent Contact Log");
      for (const c of contacts) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY_DARK)
          .text(`${fmtDateLong(c.contactDate)} — ${safeStr(c.contactType)} (${safeStr(c.contactMethod)})`, { indent: 10 });
        if (c.subject) doc.font("Helvetica").fontSize(9).fillColor(GRAY_MID)
          .text(`Subject: ${c.subject}`, { indent: 20, width: PAGE_W - 20 });
        if (c.outcome) doc.text(`Outcome: ${c.outcome}`, { indent: 20 });
        doc.moveDown(0.2);
      }
    }

    if (complianceEvents.length > 0) {
      sectionTitle("Compliance Events");
      for (const e of complianceEvents) {
        const statusColor = e.status === "completed" ? EMERALD : e.status === "overdue" ? "#ef4444" : GRAY_MID;
        doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY_DARK)
          .text(`${safeStr(e.title)} — Due: ${fmtDateLong(e.dueDate)}`, { indent: 10 });
        doc.font("Helvetica").fontSize(9).fillColor(statusColor)
          .text(`Status: ${safeStr(e.status)}${e.completedDate ? ` (completed ${fmtDateLong(e.completedDate)})` : ""}`, { indent: 20 });
        doc.moveDown(0.2);
      }
    }

    if (consentRecords.length > 0) {
      sectionTitle("Consent & Acknowledgment History");
      const CONSENT_LABELS: Record<string, string> = {
        iep_initial: "Initial IEP Consent",
        iep_amendment: "IEP Amendment Consent",
        evaluation: "Evaluation Consent",
        placement: "Placement Consent",
        reeval: "Re-evaluation Consent",
        reevaluation: "Re-evaluation Consent",
        services: "Services Consent",
        other: "Other Consent",
      };
      for (const cr of consentRecords) {
        const label = CONSENT_LABELS[cr.consentType] ?? safeStr(cr.consentType);
        const decisionDate = cr.decisionDate ? fmtDateLong(cr.decisionDate) : fmtDateLong(cr.createdAt?.toISOString());
        doc.font("Helvetica-Bold").fontSize(10).fillColor(GRAY_DARK)
          .text(`${label} — ${decisionDate}`, { indent: 10 });
        doc.font("Helvetica").fontSize(9).fillColor(GRAY_MID)
          .text(`Decision: ${safeStr(cr.decision)}${cr.respondentName ? ` | Respondent: ${cr.respondentName}${cr.respondentRelationship ? ` (${cr.respondentRelationship})` : ""}` : ""}`, { indent: 20 });
        if (cr.notes) doc.text(`Notes: ${cr.notes.slice(0, 200)}`, { indent: 20, width: PAGE_W - 20 });
        if (cr.followUpRequired === "yes" && cr.followUpDate) {
          doc.text(`Follow-up required by: ${fmtDateLong(cr.followUpDate)}`, { indent: 20 });
        }
        doc.moveDown(0.2);
      }
    }

    const pageCount = (doc as unknown as BufferedPDFDoc).bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor(GRAY_MID)
        .text(
          `Trellis — Confidential Student Record | Page ${i + 1} of ${pageCount} | Generated ${new Date().toLocaleDateString()}`,
          60, 762, { align: "center", width: PAGE_W }
        );
    }

    logAudit(req, {
      action: "read",
      targetTable: "students",
      targetId: studentId,
      studentId,
      summary: `Exported full student record PDF for student ${studentId}`,
      metadata: { reportType: "full-record-pdf" },
    });

    doc.end();
  } catch (e: any) {
    console.error("GET student full-record.pdf error:", e);
    if (!res.headersSent) {
      try { doc.end(); } catch {}
      res.status(500).json({ error: "Failed to generate student record PDF" });
    } else {
      try { doc.end(); } catch {}
    }
  }
});

export default router;
