import { Router, type IRouter, type Request, type Response } from "express";
import PDFDocument from "pdfkit";
import { db } from "@workspace/db";
import {
  studentsTable, iepDocumentsTable, serviceRequirementsTable, serviceTypesTable,
  sessionLogsTable, schoolsTable, iepGoalsTable, progressReportsTable,
  restraintIncidentsTable, teamMeetingsTable, iepAccommodationsTable,
  parentContactsTable, complianceEventsTable, meetingConsentRecordsTable,
  schoolYearsTable, staffTable, staffAssignmentsTable, exportHistoryTable,
  scheduledReportsTable,
} from "@workspace/db";
import { eq, and, desc, asc, lte, gte, sql, isNull, count } from "drizzle-orm";
import { getEnforcedDistrictId, requireDistrictScope } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import { logAudit } from "../lib/auditLog";
import { getPublicMeta } from "../lib/clerkClaims";

interface BufferedPDFDoc {
  bufferedPageRange(): { start: number; count: number };
}

const router: IRouter = Router();
// Non-platform-admin users without a district claim cannot access export routes.
router.use(requireDistrictScope);

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
  const { platformAdmin } = getPublicMeta(req);
  if (platformAdmin) {
    return { enforcedDistrictId: null, enforcedSchoolId: null, isPlatformAdmin: true };
  }
  // Use getEnforcedDistrictId so test-mode (x-test-district-id header) and
  // production (Clerk token) both work without requiring a query-string parameter.
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (districtId == null) {
    return { error: "Access denied: your account is not assigned to a district", status: 403 };
  }
  return { enforcedDistrictId: districtId, enforcedSchoolId: null, isPlatformAdmin: false };
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

    const { schoolId, status: statusParam, schoolYearId: iepYearId } = req.query;
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
    if (iepYearId) {
      // Use date-overlap semantics (same as students.ts) so that IEPs carried forward
      // from a prior year (active=true, iep_end_date >= new year's start) are included
      // without needing to mutate iep_documents.school_year_id during rollover.
      conditions.push(sql`${iepDocumentsTable.iepEndDate} >= (SELECT start_date FROM school_years WHERE id = ${Number(iepYearId)})` as ReturnType<typeof eq>);
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

    // If schoolYearId provided, override date range with that year's bounds
    let start = (startDate as string) || new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split("T")[0];
    let end = (endDate as string) || now.toISOString().split("T")[0];
    if (incidentYearId) {
      const [yearRow] = await db.select({ startDate: schoolYearsTable.startDate, endDate: schoolYearsTable.endDate })
        .from(schoolYearsTable).where(eq(schoolYearsTable.id, Number(incidentYearId)));
      if (yearRow) { start = yearRow.startDate; end = yearRow.endDate; }
    }

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

  const { platformAdmin } = getPublicMeta(req);

  if (!platformAdmin) {
    const callerDistrictId = getEnforcedDistrictId(req as AuthedRequest);
    if (callerDistrictId == null) {
      res.status(403).json({ error: "Access denied: your account is not assigned to a district" });
      return;
    }
    const scopeResult = await db.execute(
      sql`SELECT sc.district_id FROM students st LEFT JOIN schools sc ON sc.id = st.school_id WHERE st.id = ${studentId} LIMIT 1`
    );
    const scopeRow = (scopeResult.rows as Array<{ district_id: number | null }>)[0];
    const studentDistrictId = scopeRow?.district_id ?? null;
    if (studentDistrictId === null || callerDistrictId !== Number(studentDistrictId)) {
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

function recordExport(req: Request, opts: { reportType: string; reportLabel: string; format: string; fileName: string; recordCount: number; parameters?: Record<string, unknown> }) {
  const { platformAdmin } = getPublicMeta(req);
  const districtId = platformAdmin ? null : getEnforcedDistrictId(req as AuthedRequest);
  const exportedBy = (req as AuthedRequest).userId ?? "system";
  db.insert(exportHistoryTable).values({
    reportType: opts.reportType,
    reportLabel: opts.reportLabel,
    exportedBy,
    districtId,
    format: opts.format,
    fileName: opts.fileName,
    recordCount: opts.recordCount,
    parameters: opts.parameters ?? null,
  }).catch(e => console.error("Failed to record export history:", e));
}

const PDF_COLORS = { EMERALD: "#059669", GRAY_DARK: "#111827", GRAY_MID: "#6b7280", GRAY_LIGHT: "#e5e7eb" };

function initPdfDoc(): InstanceType<typeof PDFDocument> {
  return new PDFDocument({ size: "LETTER", margins: { top: 50, bottom: 60, left: 60, right: 60 }, bufferPages: true });
}

function pdfHeader(doc: InstanceType<typeof PDFDocument>, title: string, subtitle: string) {
  doc.fontSize(18).font("Helvetica-Bold").fillColor(PDF_COLORS.GRAY_DARK).text(title, { align: "center" });
  doc.moveDown(0.2);
  doc.fontSize(9).font("Helvetica").fillColor(PDF_COLORS.GRAY_MID).text(subtitle, { align: "center" });
  doc.moveDown(0.2);
  doc.fontSize(8).fillColor(PDF_COLORS.GRAY_MID).text(`Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, { align: "center" });
  doc.moveDown(0.5);
  doc.moveTo(60, doc.y).lineTo(552, doc.y).strokeColor(PDF_COLORS.GRAY_LIGHT).lineWidth(1).stroke();
  doc.moveDown(0.4);
}

function pdfSectionTitle(doc: InstanceType<typeof PDFDocument>, title: string) {
  doc.moveDown(0.4);
  doc.fontSize(12).font("Helvetica-Bold").fillColor(PDF_COLORS.EMERALD).text(title);
  doc.moveTo(60, doc.y + 2).lineTo(552, doc.y + 2).strokeColor("#d1fae5").lineWidth(1).stroke();
  doc.moveDown(0.3);
  doc.fontSize(9).font("Helvetica").fillColor(PDF_COLORS.GRAY_DARK);
}

function pdfTableRow(doc: InstanceType<typeof PDFDocument>, cols: { text: string; width: number; bold?: boolean; align?: "left" | "right" | "center" }[], y: number) {
  let x = 60;
  for (const col of cols) {
    doc.font(col.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(8.5)
      .fillColor(PDF_COLORS.GRAY_DARK)
      .text(col.text, x, y, { width: col.width, align: col.align ?? "left" });
    x += col.width;
  }
}

function pdfTableHeader(doc: InstanceType<typeof PDFDocument>, cols: { text: string; width: number }[]) {
  const y = doc.y;
  let x = 60;
  doc.rect(60, y - 2, 492, 14).fill("#f3f4f6");
  for (const col of cols) {
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(PDF_COLORS.GRAY_MID)
      .text(col.text.toUpperCase(), x, y, { width: col.width });
    x += col.width;
  }
  doc.y = y + 16;
}

function pdfFooters(doc: InstanceType<typeof PDFDocument>, reportName: string) {
  const pageCount = (doc as unknown as BufferedPDFDoc).bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).fillColor(PDF_COLORS.GRAY_MID)
      .text(`Trellis — ${reportName} | Page ${i + 1} of ${pageCount} | Confidential`, 60, 762, { align: "center", width: 492 });
  }
}

function districtCondition(enforcedDistrictId: number | null) {
  if (enforcedDistrictId === null) return undefined;
  return sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${enforcedDistrictId})`;
}

router.get("/reports/exports/compliance-summary.csv", async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const { schoolId, startDate, endDate, serviceTypeId, complianceStatus } = req.query;
    const now = new Date();
    const start = (startDate as string) || new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split("T")[0];
    const end = (endDate as string) || now.toISOString().split("T")[0];

    const conditions: any[] = [isNull(studentsTable.deletedAt), eq(studentsTable.status, "active")];
    const dc = districtCondition(scope.enforcedDistrictId);
    if (dc) conditions.push(dc);
    if (schoolId) conditions.push(eq(studentsTable.schoolId, Number(schoolId)));

    const students = await db.select({
      id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName,
      grade: studentsTable.grade, schoolName: schoolsTable.name,
    }).from(studentsTable).leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
      .where(and(...conditions)).orderBy(asc(studentsTable.lastName));

    if (students.length === 0) {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="Compliance_Summary.csv"`);
      res.send(buildCSV(["Student", "School", "Grade", "Service", "Required Min/Wk", "Delivered Min", "Compliance %", "Status"], []));
      return;
    }

    const sIds = students.map(s => s.id);
    const idList = sql.join(sIds.map(id => sql`${id}`), sql`, `);

    const reqConditions: any[] = [eq(serviceRequirementsTable.active, true), sql`${serviceRequirementsTable.studentId} IN (${idList})`];
    if (serviceTypeId) reqConditions.push(eq(serviceRequirementsTable.serviceTypeId, Number(serviceTypeId)));

    const sessConditions: any[] = [sql`${sessionLogsTable.studentId} IN (${idList})`, gte(sessionLogsTable.sessionDate, start), lte(sessionLogsTable.sessionDate, end)];
    if (serviceTypeId) sessConditions.push(eq(sessionLogsTable.serviceTypeId, Number(serviceTypeId)));

    const [reqs, sessions] = await Promise.all([
      db.select({
        studentId: serviceRequirementsTable.studentId,
        serviceTypeName: serviceTypesTable.name,
        requiredMinutes: serviceRequirementsTable.requiredMinutes,
        intervalType: serviceRequirementsTable.intervalType,
      }).from(serviceRequirementsTable)
        .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
        .where(and(...reqConditions)),

      db.select({
        studentId: sessionLogsTable.studentId,
        serviceTypeName: serviceTypesTable.name,
        status: sessionLogsTable.status,
        durationMinutes: sessionLogsTable.durationMinutes,
      }).from(sessionLogsTable)
        .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, sessionLogsTable.serviceTypeId))
        .where(and(...sessConditions)),
    ]);

    const sessionMap = new Map<string, { delivered: number; completed: number; missed: number }>();
    for (const s of sessions) {
      const key = `${s.studentId}|${s.serviceTypeName ?? ""}`;
      if (!sessionMap.has(key)) sessionMap.set(key, { delivered: 0, completed: 0, missed: 0 });
      const e = sessionMap.get(key)!;
      if (s.status === "completed" || s.status === "makeup") { e.completed++; e.delivered += s.durationMinutes ?? 0; }
      else if (s.status === "missed") e.missed++;
    }

    const reqsByStudent = new Map<number, typeof reqs>();
    for (const r of reqs) {
      if (!reqsByStudent.has(r.studentId)) reqsByStudent.set(r.studentId, []);
      reqsByStudent.get(r.studentId)!.push(r);
    }

    const statusMapping: Record<string, string> = { "compliant": "On Track", "at-risk": "At Risk", "non-compliant": "Out of Compliance" };
    const headers = ["Student", "School", "Grade", "Service", "Required Min/Wk", "Delivered Min", "Compliance %", "Status"];
    const csvRows: unknown[][] = [];
    for (const student of students) {
      const studentReqs = reqsByStudent.get(student.id) ?? [];
      for (const req of studentReqs) {
        const key = `${student.id}|${req.serviceTypeName ?? ""}`;
        const sm = sessionMap.get(key) ?? { delivered: 0, completed: 0, missed: 0 };
        const totalSessions = sm.completed + sm.missed;
        const pct = totalSessions > 0 ? Math.round((sm.completed / totalSessions) * 100) : 100;
        const status = pct >= 90 ? "On Track" : pct >= 75 ? "At Risk" : "Out of Compliance";
        if (complianceStatus && statusMapping[complianceStatus as string] && status !== statusMapping[complianceStatus as string]) continue;
        csvRows.push([
          `${student.lastName}, ${student.firstName}`, student.schoolName ?? "", student.grade ?? "",
          req.serviceTypeName ?? "", `${req.requiredMinutes ?? ""}/${req.intervalType ?? "week"}`,
          sm.delivered, `${pct}%`, status,
        ]);
      }
    }

    const filename = `Compliance_Summary_${start}_${end}.csv`;
    recordExport(req, { reportType: "compliance-summary", reportLabel: "Compliance Summary", format: "csv", fileName: filename, recordCount: csvRows.length, parameters: { start, end, schoolId, serviceTypeId, complianceStatus } });
    logAudit(req, { action: "read", targetTable: "service_requirements", summary: `Exported compliance summary CSV (${csvRows.length} rows)`, metadata: { reportType: "compliance-summary-csv", rowCount: csvRows.length } });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buildCSV(headers, csvRows));
  } catch (e: any) {
    console.error("GET /reports/exports/compliance-summary.csv error:", e);
    res.status(500).json({ error: "Failed to generate compliance summary" });
  }
});

router.get("/reports/exports/compliance-summary.pdf", async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const { schoolId, startDate, endDate, serviceTypeId, complianceStatus } = req.query;
    const now = new Date();
    const start = (startDate as string) || new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split("T")[0];
    const end = (endDate as string) || now.toISOString().split("T")[0];

    const conditions: any[] = [isNull(studentsTable.deletedAt), eq(studentsTable.status, "active")];
    const dc = districtCondition(scope.enforcedDistrictId);
    if (dc) conditions.push(dc);
    if (schoolId) conditions.push(eq(studentsTable.schoolId, Number(schoolId)));

    const students = await db.select({
      id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName,
      grade: studentsTable.grade, schoolName: schoolsTable.name,
    }).from(studentsTable).leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
      .where(and(...conditions)).orderBy(asc(studentsTable.lastName));

    const sIds = students.map(s => s.id);
    const idList = sIds.length > 0 ? sql.join(sIds.map(id => sql`${id}`), sql`, `) : sql`0`;

    const reqConditions: any[] = [eq(serviceRequirementsTable.active, true), sql`${serviceRequirementsTable.studentId} IN (${idList})`];
    if (serviceTypeId) reqConditions.push(eq(serviceRequirementsTable.serviceTypeId, Number(serviceTypeId)));

    const sessConditions: any[] = [sql`${sessionLogsTable.studentId} IN (${idList})`, gte(sessionLogsTable.sessionDate, start), lte(sessionLogsTable.sessionDate, end)];
    if (serviceTypeId) sessConditions.push(eq(sessionLogsTable.serviceTypeId, Number(serviceTypeId)));

    const [reqs, sessions] = await Promise.all([
      db.select({
        studentId: serviceRequirementsTable.studentId,
        serviceTypeName: serviceTypesTable.name,
        requiredMinutes: serviceRequirementsTable.requiredMinutes,
      }).from(serviceRequirementsTable)
        .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
        .where(and(...reqConditions)),
      db.select({
        studentId: sessionLogsTable.studentId,
        serviceTypeName: serviceTypesTable.name,
        status: sessionLogsTable.status,
        durationMinutes: sessionLogsTable.durationMinutes,
      }).from(sessionLogsTable)
        .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, sessionLogsTable.serviceTypeId))
        .where(and(...sessConditions)),
    ]);

    const sessionMap = new Map<string, { delivered: number; completed: number; missed: number }>();
    for (const s of sessions) {
      const key = `${s.studentId}|${s.serviceTypeName ?? ""}`;
      if (!sessionMap.has(key)) sessionMap.set(key, { delivered: 0, completed: 0, missed: 0 });
      const e = sessionMap.get(key)!;
      if (s.status === "completed" || s.status === "makeup") { e.completed++; e.delivered += s.durationMinutes ?? 0; }
      else if (s.status === "missed") e.missed++;
    }

    const reqsByStudent = new Map<number, typeof reqs>();
    for (const r of reqs) {
      if (!reqsByStudent.has(r.studentId)) reqsByStudent.set(r.studentId, []);
      reqsByStudent.get(r.studentId)!.push(r);
    }

    const statusMapping: Record<string, string> = { "compliant": "On Track", "at-risk": "At Risk", "non-compliant": "Out of Compliance" };
    let onTrack = 0, atRisk = 0, outOfCompliance = 0, totalDelivered = 0, totalRequired = 0;
    const rows: { name: string; school: string; grade: string; service: string; delivered: number; required: number; pct: number; status: string }[] = [];
    for (const student of students) {
      const studentReqs = reqsByStudent.get(student.id) ?? [];
      for (const r of studentReqs) {
        const key = `${student.id}|${r.serviceTypeName ?? ""}`;
        const sm = sessionMap.get(key) ?? { delivered: 0, completed: 0, missed: 0 };
        const total = sm.completed + sm.missed;
        const pct = total > 0 ? Math.round((sm.completed / total) * 100) : 100;
        const status = pct >= 90 ? "On Track" : pct >= 75 ? "At Risk" : "Out of Compliance";
        if (complianceStatus && statusMapping[complianceStatus as string] && status !== statusMapping[complianceStatus as string]) continue;
        if (status === "On Track") onTrack++;
        else if (status === "At Risk") atRisk++;
        else outOfCompliance++;
        totalDelivered += sm.delivered;
        totalRequired += (r.requiredMinutes ?? 0);
        rows.push({ name: `${student.lastName}, ${student.firstName}`, school: student.schoolName ?? "", grade: student.grade ?? "", service: r.serviceTypeName ?? "", delivered: sm.delivered, required: r.requiredMinutes ?? 0, pct, status });
      }
    }

    const doc = initPdfDoc();
    res.setHeader("Content-Type", "application/pdf");
    const filename = `Compliance_Summary_${start}_${end}.pdf`;
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    doc.pipe(res);

    pdfHeader(doc, "Compliance Summary Report", `${fmtDate(start)} through ${fmtDate(end)} — Prepared for School Committee`);

    pdfSectionTitle(doc, "Overview");
    const totalReqs = onTrack + atRisk + outOfCompliance;
    const compRate = totalReqs > 0 ? Math.round((onTrack / totalReqs) * 100) : 0;
    doc.font("Helvetica-Bold").fontSize(9).text(`Overall Compliance Rate: ${compRate}%`);
    doc.font("Helvetica").fontSize(9).text(`Active Students: ${students.length}  |  Service Requirements: ${totalReqs}`);
    doc.text(`On Track: ${onTrack}  |  At Risk: ${atRisk}  |  Out of Compliance: ${outOfCompliance}`);
    doc.text(`Total Delivered: ${totalDelivered.toLocaleString()} min  |  Total Required: ${totalRequired.toLocaleString()} min`);

    if (rows.length > 0) {
      pdfSectionTitle(doc, "Student Detail");
      const cols = [
        { text: "Student", width: 110 }, { text: "School", width: 80 }, { text: "Service", width: 85 },
        { text: "Delivered", width: 60 }, { text: "Required", width: 60 }, { text: "%", width: 40 }, { text: "Status", width: 57 },
      ];
      pdfTableHeader(doc, cols);
      for (const r of rows) {
        if (doc.y > 700) { doc.addPage(); pdfTableHeader(doc, cols); }
        const y = doc.y;
        pdfTableRow(doc, [
          { text: r.name, width: 110 }, { text: r.school, width: 80 }, { text: r.service, width: 85 },
          { text: String(r.delivered), width: 60, align: "right" }, { text: String(r.required), width: 60, align: "right" },
          { text: `${r.pct}%`, width: 40, align: "right" }, { text: r.status, width: 57, bold: r.status === "Out of Compliance" },
        ], y);
        doc.y = y + 13;
      }
    }

    pdfFooters(doc, "Compliance Summary");
    recordExport(req, { reportType: "compliance-summary", reportLabel: "Compliance Summary", format: "pdf", fileName: filename, recordCount: rows.length, parameters: { start, end, schoolId, serviceTypeId, complianceStatus } });
    logAudit(req, { action: "read", targetTable: "service_requirements", summary: `Exported compliance summary PDF (${rows.length} rows)`, metadata: { reportType: "compliance-summary-pdf" } });
    doc.end();
  } catch (e: any) {
    console.error("GET compliance-summary.pdf error:", e);
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate compliance summary PDF" });
  }
});

router.get("/reports/exports/services-by-provider.csv", async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const { startDate, endDate, schoolId, providerId, serviceTypeId } = req.query;
    const now = new Date();
    const start = (startDate as string) || new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split("T")[0];
    const end = (endDate as string) || now.toISOString().split("T")[0];

    const staffConditions: any[] = [isNull(staffTable.deletedAt), eq(staffTable.status, "active")];
    if (scope.enforcedDistrictId !== null) {
      staffConditions.push(sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${scope.enforcedDistrictId})`);
    }
    if (schoolId) staffConditions.push(eq(staffTable.schoolId, Number(schoolId)));
    if (providerId) staffConditions.push(eq(staffTable.id, Number(providerId)));

    const staffMembers = await db.select({
      id: staffTable.id, firstName: staffTable.firstName, lastName: staffTable.lastName,
      role: staffTable.role, schoolName: schoolsTable.name,
    }).from(staffTable).leftJoin(schoolsTable, eq(schoolsTable.id, staffTable.schoolId))
      .where(and(...staffConditions)).orderBy(asc(staffTable.lastName));

    if (staffMembers.length === 0) {
      const h = ["Provider", "Role", "School", "Service Type", "Sessions Completed", "Missed Sessions", "Total Minutes", "Unique Students"];
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="Services_By_Provider.csv"`);
      res.send(buildCSV(h, []));
      return;
    }

    const staffIds = staffMembers.map(s => s.id);
    const staffIdList = sql.join(staffIds.map(id => sql`${id}`), sql`, `);

    const sessConditions: any[] = [
      sql`${sessionLogsTable.staffId} IN (${staffIdList})`,
      gte(sessionLogsTable.sessionDate, start),
      lte(sessionLogsTable.sessionDate, end),
    ];
    if (serviceTypeId) sessConditions.push(eq(sessionLogsTable.serviceTypeId, Number(serviceTypeId)));

    const sessionData = await db.select({
      staffId: sessionLogsTable.staffId,
      serviceTypeName: serviceTypesTable.name,
      status: sessionLogsTable.status,
      durationMinutes: sessionLogsTable.durationMinutes,
      studentId: sessionLogsTable.studentId,
    }).from(sessionLogsTable)
      .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, sessionLogsTable.serviceTypeId))
      .where(and(...sessConditions));

    const providerMap = new Map<string, { completed: number; missed: number; minutes: number; students: Set<number> }>();
    for (const s of sessionData) {
      const key = `${s.staffId}|${s.serviceTypeName ?? "Other"}`;
      if (!providerMap.has(key)) providerMap.set(key, { completed: 0, missed: 0, minutes: 0, students: new Set() });
      const e = providerMap.get(key)!;
      if (s.status === "completed" || s.status === "makeup") { e.completed++; e.minutes += s.durationMinutes ?? 0; }
      else if (s.status === "missed") e.missed++;
      if (s.studentId) e.students.add(s.studentId);
    }

    const staffLookup = new Map(staffMembers.map(s => [s.id, s]));
    const headers = ["Provider", "Role", "School", "Service Type", "Sessions Completed", "Missed Sessions", "Total Minutes", "Unique Students"];
    const csvRows: unknown[][] = [];
    for (const [key, data] of providerMap) {
      const [staffIdStr, serviceType] = key.split("|");
      const staff = staffLookup.get(Number(staffIdStr));
      if (!staff) continue;
      const ROLE_LABELS: Record<string, string> = { bcba: "BCBA", provider: "Provider", para: "Paraprofessional", sped_teacher: "SPED Teacher", case_manager: "Case Manager", coordinator: "Coordinator", admin: "Admin" };
      csvRows.push([
        `${staff.lastName}, ${staff.firstName}`, ROLE_LABELS[staff.role] ?? staff.role, staff.schoolName ?? "",
        serviceType, data.completed, data.missed, data.minutes, data.students.size,
      ]);
    }
    csvRows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));

    const filename = `Services_By_Provider_${start}_${end}.csv`;
    recordExport(req, { reportType: "services-by-provider", reportLabel: "Services by Provider", format: "csv", fileName: filename, recordCount: csvRows.length, parameters: { start, end, schoolId, providerId, serviceTypeId } });
    logAudit(req, { action: "read", targetTable: "session_logs", summary: `Exported services-by-provider CSV (${csvRows.length} rows)`, metadata: { reportType: "services-by-provider-csv" } });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buildCSV(headers, csvRows));
  } catch (e: any) {
    console.error("GET services-by-provider.csv error:", e);
    res.status(500).json({ error: "Failed to generate services by provider report" });
  }
});

router.get("/reports/exports/services-by-provider.pdf", async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const { startDate, endDate, schoolId, providerId, serviceTypeId } = req.query;
    const now = new Date();
    const start = (startDate as string) || new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split("T")[0];
    const end = (endDate as string) || now.toISOString().split("T")[0];

    const staffConditions: any[] = [isNull(staffTable.deletedAt), eq(staffTable.status, "active")];
    if (scope.enforcedDistrictId !== null) {
      staffConditions.push(sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${scope.enforcedDistrictId})`);
    }
    if (schoolId) staffConditions.push(eq(staffTable.schoolId, Number(schoolId)));
    if (providerId) staffConditions.push(eq(staffTable.id, Number(providerId)));

    const staffMembers = await db.select({
      id: staffTable.id, firstName: staffTable.firstName, lastName: staffTable.lastName,
      role: staffTable.role, schoolName: schoolsTable.name,
    }).from(staffTable).leftJoin(schoolsTable, eq(schoolsTable.id, staffTable.schoolId))
      .where(and(...staffConditions)).orderBy(asc(staffTable.lastName));

    const staffIds = staffMembers.map(s => s.id);
    const staffIdList = staffIds.length > 0 ? sql.join(staffIds.map(id => sql`${id}`), sql`, `) : sql`0`;

    const sessConditions: any[] = [sql`${sessionLogsTable.staffId} IN (${staffIdList})`, gte(sessionLogsTable.sessionDate, start), lte(sessionLogsTable.sessionDate, end)];
    if (serviceTypeId) sessConditions.push(eq(sessionLogsTable.serviceTypeId, Number(serviceTypeId)));

    const sessionData = await db.select({
      staffId: sessionLogsTable.staffId,
      serviceTypeName: serviceTypesTable.name,
      status: sessionLogsTable.status,
      durationMinutes: sessionLogsTable.durationMinutes,
      studentId: sessionLogsTable.studentId,
    }).from(sessionLogsTable)
      .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, sessionLogsTable.serviceTypeId))
      .where(and(...sessConditions));

    const providerMap = new Map<number, { services: Map<string, { completed: number; missed: number; minutes: number; students: Set<number> }> }>();
    for (const s of sessionData) {
      if (!s.staffId) continue;
      if (!providerMap.has(s.staffId)) providerMap.set(s.staffId, { services: new Map() });
      const pm = providerMap.get(s.staffId)!;
      const svc = s.serviceTypeName ?? "Other";
      if (!pm.services.has(svc)) pm.services.set(svc, { completed: 0, missed: 0, minutes: 0, students: new Set() });
      const e = pm.services.get(svc)!;
      if (s.status === "completed" || s.status === "makeup") { e.completed++; e.minutes += s.durationMinutes ?? 0; }
      else if (s.status === "missed") e.missed++;
      if (s.studentId) e.students.add(s.studentId);
    }

    const doc = initPdfDoc();
    res.setHeader("Content-Type", "application/pdf");
    const filename = `Services_By_Provider_${start}_${end}.pdf`;
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    doc.pipe(res);

    pdfHeader(doc, "Services by Provider Report", `${fmtDate(start)} through ${fmtDate(end)} — For Superintendent Review`);

    const ROLE_LABELS: Record<string, string> = { bcba: "BCBA", provider: "Provider", para: "Paraprofessional", sped_teacher: "SPED Teacher", case_manager: "Case Manager", coordinator: "Coordinator", admin: "Admin" };
    let totalProviders = 0, totalSessions = 0, totalMinutes = 0;

    for (const staff of staffMembers) {
      const pm = providerMap.get(staff.id);
      if (!pm || pm.services.size === 0) continue;
      totalProviders++;

      if (doc.y > 680) doc.addPage();
      doc.moveDown(0.3);
      doc.font("Helvetica-Bold").fontSize(10).fillColor(PDF_COLORS.GRAY_DARK)
        .text(`${staff.lastName}, ${staff.firstName}`, { continued: true })
        .font("Helvetica").fontSize(9).fillColor(PDF_COLORS.GRAY_MID)
        .text(`  ${ROLE_LABELS[staff.role] ?? staff.role} — ${staff.schoolName ?? "Unassigned"}`);

      for (const [svc, data] of pm.services) {
        totalSessions += data.completed;
        totalMinutes += data.minutes;
        doc.font("Helvetica").fontSize(8.5).fillColor(PDF_COLORS.GRAY_DARK)
          .text(`  ${svc}: ${data.completed} sessions, ${data.minutes} min delivered, ${data.missed} missed, ${data.students.size} students`, { indent: 15 });
      }
    }

    doc.moveDown(0.5);
    pdfSectionTitle(doc, "Summary");
    doc.font("Helvetica").fontSize(9).text(`Active Providers: ${totalProviders}  |  Total Sessions: ${totalSessions}  |  Total Minutes: ${totalMinutes.toLocaleString()}`);

    pdfFooters(doc, "Services by Provider");
    recordExport(req, { reportType: "services-by-provider", reportLabel: "Services by Provider", format: "pdf", fileName: filename, recordCount: totalProviders, parameters: { start, end, schoolId, providerId, serviceTypeId } });
    logAudit(req, { action: "read", targetTable: "session_logs", summary: `Exported services-by-provider PDF`, metadata: { reportType: "services-by-provider-pdf" } });
    doc.end();
  } catch (e: any) {
    console.error("GET services-by-provider.pdf error:", e);
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate services by provider PDF" });
  }
});

router.get("/reports/exports/student-roster.csv", async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const { schoolId, status: statusParam } = req.query;
    const statusFilter = typeof statusParam === "string" ? statusParam : "active";

    const conditions: any[] = [isNull(studentsTable.deletedAt)];
    if (statusFilter !== "all") conditions.push(eq(studentsTable.status, statusFilter));
    const dc = districtCondition(scope.enforcedDistrictId);
    if (dc) conditions.push(dc);
    if (schoolId) conditions.push(eq(studentsTable.schoolId, Number(schoolId)));

    const students = await db.select({
      id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName,
      grade: studentsTable.grade, dateOfBirth: studentsTable.dateOfBirth, status: studentsTable.status,
      disabilityCategory: studentsTable.disabilityCategory, placementType: studentsTable.placementType,
      schoolName: schoolsTable.name, enrolledAt: studentsTable.enrolledAt,
    }).from(studentsTable).leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
      .where(and(...conditions)).orderBy(asc(studentsTable.lastName));

    const sIds = students.map(s => s.id);
    const idList = sIds.length > 0 ? sql.join(sIds.map(id => sql`${id}`), sql`, `) : sql`0`;

    const iepRows = sIds.length > 0 ? await db.select({
      studentId: iepDocumentsTable.studentId,
      iepStartDate: iepDocumentsTable.iepStartDate,
      iepEndDate: iepDocumentsTable.iepEndDate,
      status: iepDocumentsTable.status,
    }).from(iepDocumentsTable)
      .where(and(eq(iepDocumentsTable.active, true), sql`${iepDocumentsTable.studentId} IN (${idList})`)) : [];

    const iepMap = new Map<number, typeof iepRows[0]>();
    for (const r of iepRows) iepMap.set(r.studentId, r);

    const headers = ["Last Name", "First Name", "Grade", "School", "Status", "Disability Category", "Placement", "Date of Birth", "Enrolled", "IEP Start", "IEP End", "IEP Status"];
    const csvRows = students.map(s => {
      const iep = iepMap.get(s.id);
      return [
        s.lastName, s.firstName, s.grade ?? "", s.schoolName ?? "", s.status ?? "", s.disabilityCategory ?? "",
        s.placementType ?? "", fmtDate(s.dateOfBirth), fmtDate(s.enrolledAt), fmtDate(iep?.iepStartDate), fmtDate(iep?.iepEndDate), iep?.status ?? "No IEP",
      ];
    });

    const filename = `Student_Roster_${new Date().toISOString().split("T")[0]}.csv`;
    recordExport(req, { reportType: "student-roster", reportLabel: "Student Roster", format: "csv", fileName: filename, recordCount: csvRows.length, parameters: { statusFilter, schoolId } });
    logAudit(req, { action: "read", targetTable: "students", summary: `Exported student roster CSV (${csvRows.length} rows)`, metadata: { reportType: "student-roster-csv" } });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buildCSV(headers, csvRows));
  } catch (e: any) {
    console.error("GET student-roster.csv error:", e);
    res.status(500).json({ error: "Failed to generate student roster" });
  }
});

router.get("/reports/exports/student-roster.pdf", async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const { schoolId, status: statusParam } = req.query;
    const statusFilter = typeof statusParam === "string" ? statusParam : "active";

    const conditions: any[] = [isNull(studentsTable.deletedAt)];
    if (statusFilter !== "all") conditions.push(eq(studentsTable.status, statusFilter));
    const dc = districtCondition(scope.enforcedDistrictId);
    if (dc) conditions.push(dc);
    if (schoolId) conditions.push(eq(studentsTable.schoolId, Number(schoolId)));

    const students = await db.select({
      id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName,
      grade: studentsTable.grade, status: studentsTable.status, disabilityCategory: studentsTable.disabilityCategory,
      placementType: studentsTable.placementType, schoolName: schoolsTable.name,
    }).from(studentsTable).leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
      .where(and(...conditions)).orderBy(asc(studentsTable.lastName));

    const sIds = students.map(s => s.id);
    const idList = sIds.length > 0 ? sql.join(sIds.map(id => sql`${id}`), sql`, `) : sql`0`;

    const iepRows = sIds.length > 0 ? await db.select({
      studentId: iepDocumentsTable.studentId, iepEndDate: iepDocumentsTable.iepEndDate, status: iepDocumentsTable.status,
    }).from(iepDocumentsTable).where(and(eq(iepDocumentsTable.active, true), sql`${iepDocumentsTable.studentId} IN (${idList})`)) : [];
    const iepMap = new Map<number, typeof iepRows[0]>();
    for (const r of iepRows) iepMap.set(r.studentId, r);

    const doc = initPdfDoc();
    res.setHeader("Content-Type", "application/pdf");
    const filename = `Student_Roster_${new Date().toISOString().split("T")[0]}.pdf`;
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    doc.pipe(res);

    pdfHeader(doc, "SPED Student Roster", `${students.length} students — ${statusFilter === "all" ? "All statuses" : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}`);

    const bySchool = new Map<string, typeof students>();
    for (const s of students) {
      const school = s.schoolName ?? "Unassigned";
      if (!bySchool.has(school)) bySchool.set(school, []);
      bySchool.get(school)!.push(s);
    }

    for (const [school, schoolStudents] of bySchool) {
      pdfSectionTitle(doc, `${school} (${schoolStudents.length} students)`);
      const cols = [
        { text: "Student", width: 130 }, { text: "Grade", width: 45 }, { text: "Disability", width: 100 },
        { text: "Placement", width: 80 }, { text: "IEP End", width: 70 }, { text: "IEP Status", width: 67 },
      ];
      pdfTableHeader(doc, cols);
      for (const s of schoolStudents) {
        if (doc.y > 700) { doc.addPage(); pdfTableHeader(doc, cols); }
        const iep = iepMap.get(s.id);
        const y = doc.y;
        pdfTableRow(doc, [
          { text: `${s.lastName}, ${s.firstName}`, width: 130 }, { text: s.grade ?? "", width: 45 },
          { text: s.disabilityCategory ?? "", width: 100 }, { text: s.placementType ?? "", width: 80 },
          { text: fmtDate(iep?.iepEndDate), width: 70 }, { text: iep?.status ?? "No IEP", width: 67 },
        ], y);
        doc.y = y + 13;
      }
    }

    pdfFooters(doc, "Student Roster");
    recordExport(req, { reportType: "student-roster", reportLabel: "Student Roster", format: "pdf", fileName: filename, recordCount: students.length, parameters: { statusFilter, schoolId } });
    logAudit(req, { action: "read", targetTable: "students", summary: `Exported student roster PDF (${students.length} rows)`, metadata: { reportType: "student-roster-pdf" } });
    doc.end();
  } catch (e: any) {
    console.error("GET student-roster.pdf error:", e);
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate student roster PDF" });
  }
});

router.get("/reports/exports/caseload-distribution.csv", async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const { schoolId } = req.query;

    const staffConditions: any[] = [isNull(staffTable.deletedAt), eq(staffTable.status, "active")];
    if (scope.enforcedDistrictId !== null) {
      staffConditions.push(sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${scope.enforcedDistrictId})`);
    }
    if (schoolId) staffConditions.push(eq(staffTable.schoolId, Number(schoolId)));

    const staffMembers = await db.select({
      id: staffTable.id, firstName: staffTable.firstName, lastName: staffTable.lastName,
      role: staffTable.role, schoolName: schoolsTable.name,
    }).from(staffTable).leftJoin(schoolsTable, eq(schoolsTable.id, staffTable.schoolId))
      .where(and(...staffConditions)).orderBy(asc(staffTable.lastName));

    const staffIds = staffMembers.map(s => s.id);
    const staffIdList = staffIds.length > 0 ? sql.join(staffIds.map(id => sql`${id}`), sql`, `) : sql`0`;

    const assignments = staffIds.length > 0 ? await db.select({
      staffId: staffAssignmentsTable.staffId,
      studentId: staffAssignmentsTable.studentId,
      assignmentType: staffAssignmentsTable.assignmentType,
    }).from(staffAssignmentsTable)
      .where(sql`${staffAssignmentsTable.staffId} IN (${staffIdList})`) : [];

    const caseloadMap = new Map<number, { students: Set<number>; types: Set<string> }>();
    for (const a of assignments) {
      if (!caseloadMap.has(a.staffId)) caseloadMap.set(a.staffId, { students: new Set(), types: new Set() });
      const c = caseloadMap.get(a.staffId)!;
      c.students.add(a.studentId);
      if (a.assignmentType) c.types.add(a.assignmentType);
    }

    const ROLE_LABELS: Record<string, string> = { bcba: "BCBA", provider: "Provider", para: "Paraprofessional", sped_teacher: "SPED Teacher", case_manager: "Case Manager", coordinator: "Coordinator", admin: "Admin" };
    const headers = ["Staff Member", "Role", "School", "Caseload Size", "Assignment Types"];
    const csvRows = staffMembers.map(s => {
      const c = caseloadMap.get(s.id);
      return [
        `${s.lastName}, ${s.firstName}`, ROLE_LABELS[s.role] ?? s.role, s.schoolName ?? "",
        c ? c.students.size : 0, c ? [...c.types].join(", ") : "",
      ];
    });

    const filename = `Caseload_Distribution_${new Date().toISOString().split("T")[0]}.csv`;
    recordExport(req, { reportType: "caseload-distribution", reportLabel: "Caseload Distribution", format: "csv", fileName: filename, recordCount: csvRows.length, parameters: { schoolId } });
    logAudit(req, { action: "read", targetTable: "staff_assignments", summary: `Exported caseload distribution CSV (${csvRows.length} rows)`, metadata: { reportType: "caseload-distribution-csv" } });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buildCSV(headers, csvRows));
  } catch (e: any) {
    console.error("GET caseload-distribution.csv error:", e);
    res.status(500).json({ error: "Failed to generate caseload distribution" });
  }
});

router.get("/reports/exports/caseload-distribution.pdf", async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const { schoolId } = req.query;

    const staffConditions: any[] = [isNull(staffTable.deletedAt), eq(staffTable.status, "active")];
    if (scope.enforcedDistrictId !== null) {
      staffConditions.push(sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${scope.enforcedDistrictId})`);
    }
    if (schoolId) staffConditions.push(eq(staffTable.schoolId, Number(schoolId)));

    const staffMembers = await db.select({
      id: staffTable.id, firstName: staffTable.firstName, lastName: staffTable.lastName,
      role: staffTable.role, schoolName: schoolsTable.name,
    }).from(staffTable).leftJoin(schoolsTable, eq(schoolsTable.id, staffTable.schoolId))
      .where(and(...staffConditions)).orderBy(asc(staffTable.lastName));

    const staffIds = staffMembers.map(s => s.id);
    const staffIdList = staffIds.length > 0 ? sql.join(staffIds.map(id => sql`${id}`), sql`, `) : sql`0`;

    const assignments = staffIds.length > 0 ? await db.select({
      staffId: staffAssignmentsTable.staffId,
      studentId: staffAssignmentsTable.studentId,
    }).from(staffAssignmentsTable).where(sql`${staffAssignmentsTable.staffId} IN (${staffIdList})`) : [];

    const caseloadMap = new Map<number, Set<number>>();
    for (const a of assignments) {
      if (!caseloadMap.has(a.staffId)) caseloadMap.set(a.staffId, new Set());
      caseloadMap.get(a.staffId)!.add(a.studentId);
    }

    const doc = initPdfDoc();
    res.setHeader("Content-Type", "application/pdf");
    const filename = `Caseload_Distribution_${new Date().toISOString().split("T")[0]}.pdf`;
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    doc.pipe(res);

    pdfHeader(doc, "Caseload Distribution Report", `${staffMembers.length} staff members — Current assignments`);

    const ROLE_LABELS: Record<string, string> = { bcba: "BCBA", provider: "Provider", para: "Paraprofessional", sped_teacher: "SPED Teacher", case_manager: "Case Manager", coordinator: "Coordinator", admin: "Admin" };

    const sizes = staffMembers.map(s => caseloadMap.get(s.id)?.size ?? 0);
    const avg = sizes.length > 0 ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : 0;
    const max = Math.max(0, ...sizes);
    const min = sizes.length > 0 ? Math.min(...sizes) : 0;

    pdfSectionTitle(doc, "Summary");
    doc.font("Helvetica").fontSize(9).text(`Total Staff: ${staffMembers.length}  |  Average Caseload: ${avg}  |  Max: ${max}  |  Min: ${min}`);

    const byRole = new Map<string, typeof staffMembers>();
    for (const s of staffMembers) {
      const role = ROLE_LABELS[s.role] ?? s.role;
      if (!byRole.has(role)) byRole.set(role, []);
      byRole.get(role)!.push(s);
    }

    for (const [role, roleStaff] of byRole) {
      pdfSectionTitle(doc, `${role} (${roleStaff.length})`);
      const cols = [{ text: "Staff Member", width: 180 }, { text: "School", width: 150 }, { text: "Caseload Size", width: 100 }];
      pdfTableHeader(doc, cols);
      for (const s of roleStaff) {
        if (doc.y > 700) { doc.addPage(); pdfTableHeader(doc, cols); }
        const y = doc.y;
        const caseloadSize = caseloadMap.get(s.id)?.size ?? 0;
        pdfTableRow(doc, [
          { text: `${s.lastName}, ${s.firstName}`, width: 180 },
          { text: s.schoolName ?? "", width: 150 },
          { text: String(caseloadSize), width: 100, align: "right", bold: caseloadSize > avg * 1.5 },
        ], y);
        doc.y = y + 13;
      }
    }

    pdfFooters(doc, "Caseload Distribution");
    recordExport(req, { reportType: "caseload-distribution", reportLabel: "Caseload Distribution", format: "pdf", fileName: filename, recordCount: staffMembers.length, parameters: { schoolId } });
    logAudit(req, { action: "read", targetTable: "staff_assignments", summary: `Exported caseload distribution PDF`, metadata: { reportType: "caseload-distribution-pdf" } });
    doc.end();
  } catch (e: any) {
    console.error("GET caseload-distribution.pdf error:", e);
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate caseload distribution PDF" });
  }
});

router.get("/reports/exports/history", async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const conditions: any[] = [];
    if (scope.enforcedDistrictId !== null) {
      conditions.push(eq(exportHistoryTable.districtId, scope.enforcedDistrictId));
    }

    const history = await db.select({
      id: exportHistoryTable.id,
      reportType: exportHistoryTable.reportType,
      reportLabel: exportHistoryTable.reportLabel,
      format: exportHistoryTable.format,
      fileName: exportHistoryTable.fileName,
      recordCount: exportHistoryTable.recordCount,
      exportedBy: exportHistoryTable.exportedBy,
      createdAt: exportHistoryTable.createdAt,
    }).from(exportHistoryTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(exportHistoryTable.createdAt))
      .limit(50);

    res.json(history);
  } catch (e: any) {
    console.error("GET /reports/exports/history error:", e);
    res.status(500).json({ error: "Failed to fetch export history" });
  }
});

router.get("/reports/exports/history/:id/download", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const conditions: ReturnType<typeof eq>[] = [eq(exportHistoryTable.id, id)];
    if (scope.enforcedDistrictId !== null) {
      conditions.push(eq(exportHistoryTable.districtId, scope.enforcedDistrictId));
    }

    const [entry] = await db.select().from(exportHistoryTable).where(and(...conditions));
    if (!entry) { res.status(404).json({ error: "Export not found" }); return; }

    const validTypes = ["compliance-summary", "services-by-provider", "student-roster", "caseload-distribution"];
    if (!validTypes.includes(entry.reportType)) {
      res.status(400).json({ error: "Report type does not support regeneration" });
      return;
    }

    if (entry.format !== "csv") {
      res.status(400).json({ error: "Re-download is only supported for CSV exports" });
      return;
    }

    const params = (entry.parameters as Record<string, unknown>) ?? {};
    const reportFilters: ReportFilters = {
      startDate: params.start as string | undefined,
      endDate: params.end as string | undefined,
      schoolId: params.schoolId ? Number(params.schoolId) : undefined,
      providerId: params.providerId ? Number(params.providerId) : undefined,
      serviceTypeId: params.serviceTypeId ? Number(params.serviceTypeId) : undefined,
      complianceStatus: params.complianceStatus as string | undefined,
    };

    const effectiveDistrictId = entry.districtId ?? scope.enforcedDistrictId;
    if (!effectiveDistrictId || effectiveDistrictId <= 0) {
      res.status(400).json({ error: "Cannot regenerate report without a valid district scope" });
      return;
    }
    const result = await generateReportCSVDirect(entry.reportType, effectiveDistrictId, reportFilters);
    if (!result) { res.status(500).json({ error: "Failed to regenerate report" }); return; }

    const filename = entry.fileName || `${entry.reportType}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(result.csv);
  } catch (e: unknown) {
    console.error("GET /reports/exports/history/:id/download error:", e);
    res.status(500).json({ error: "Failed to regenerate report" });
  }
});

router.get("/reports/exports/scheduled", async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const conditions: any[] = [];
    if (scope.enforcedDistrictId !== null) {
      conditions.push(eq(scheduledReportsTable.districtId, scope.enforcedDistrictId));
    }

    const schedules = await db.select().from(scheduledReportsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(scheduledReportsTable.createdAt));

    res.json(schedules);
  } catch (e: any) {
    console.error("GET /reports/exports/scheduled error:", e);
    res.status(500).json({ error: "Failed to fetch scheduled reports" });
  }
});

router.post("/reports/exports/scheduled", async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const { reportType, frequency, filters, recipientEmails } = req.body;

    if (!reportType || !frequency || !recipientEmails || !Array.isArray(recipientEmails) || recipientEmails.length === 0) {
      res.status(400).json({ error: "Missing required fields: reportType, frequency, recipientEmails" });
      return;
    }

    const validReportTypes = ["compliance-summary", "services-by-provider", "student-roster", "caseload-distribution"];
    if (!validReportTypes.includes(reportType)) {
      res.status(400).json({ error: `Invalid reportType. Must be one of: ${validReportTypes.join(", ")}` });
      return;
    }

    const validFreqs = ["weekly", "monthly"];
    if (!validFreqs.includes(frequency)) {
      res.status(400).json({ error: `Invalid frequency. Must be one of: ${validFreqs.join(", ")}` });
      return;
    }

    if (scope.enforcedDistrictId === null) {
      res.status(400).json({ error: "District scope is required to create scheduled reports. Platform admins must specify a district." });
      return;
    }
    const districtId = scope.enforcedDistrictId;
    const createdBy = (req as AuthedRequest).userId ?? "system";

    const now = new Date();
    let nextRunAt: Date;
    if (frequency === "weekly") {
      nextRunAt = new Date(now);
      nextRunAt.setDate(nextRunAt.getDate() + (7 - nextRunAt.getDay()) % 7 + 1);
      nextRunAt.setHours(6, 0, 0, 0);
    } else {
      nextRunAt = new Date(now.getFullYear(), now.getMonth() + 1, 1, 6, 0, 0, 0);
    }

    const [created] = await db.insert(scheduledReportsTable).values({
      districtId,
      reportType,
      frequency,
      filters: filters ?? {},
      recipientEmails,
      createdBy,
      nextRunAt,
    }).returning();

    logAudit(req, { action: "create", targetTable: "scheduled_reports", targetId: created.id, summary: `Created scheduled ${frequency} report: ${reportType}` });

    res.status(201).json(created);
  } catch (e: any) {
    console.error("POST /reports/exports/scheduled error:", e);
    res.status(500).json({ error: "Failed to create scheduled report" });
  }
});

router.delete("/reports/exports/scheduled/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const conditions: any[] = [eq(scheduledReportsTable.id, id)];
    if (scope.enforcedDistrictId !== null) {
      conditions.push(eq(scheduledReportsTable.districtId, scope.enforcedDistrictId));
    }

    const deleted = await db.delete(scheduledReportsTable).where(and(...conditions)).returning();
    if (deleted.length === 0) { res.status(404).json({ error: "Scheduled report not found" }); return; }

    logAudit(req, { action: "delete", targetTable: "scheduled_reports", targetId: id, summary: `Deleted scheduled report ${id}` });
    res.json({ success: true });
  } catch (e: any) {
    console.error("DELETE /reports/exports/scheduled error:", e);
    res.status(500).json({ error: "Failed to delete scheduled report" });
  }
});

export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  schoolId?: number;
  providerId?: number;
  serviceTypeId?: number;
  complianceStatus?: string;
}

export async function generateReportCSVDirect(reportType: string, districtId: number, filters?: ReportFilters): Promise<{ csv: string; rowCount: number } | null> {
  if (districtId <= 0) {
    console.error(`[generateReportCSVDirect] Refusing to generate report without valid district scope (districtId=${districtId})`);
    return null;
  }
  try {
    const dc = sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${districtId})`;

    if (reportType === "compliance-summary") {
      const now = new Date();
      const start = filters?.startDate || new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split("T")[0];
      const end = filters?.endDate || now.toISOString().split("T")[0];
      const conditions: any[] = [isNull(studentsTable.deletedAt), eq(studentsTable.status, "active")];
      if (dc) conditions.push(dc);
      if (filters?.schoolId) conditions.push(eq(studentsTable.schoolId, filters.schoolId));

      const students = await db.select({ id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName, grade: studentsTable.grade, schoolName: schoolsTable.name })
        .from(studentsTable).leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId)).where(and(...conditions)).orderBy(asc(studentsTable.lastName));

      if (students.length === 0) return { csv: buildCSV(["Student", "School", "Grade", "Service", "Required", "Delivered", "Compliance %", "Status"], []), rowCount: 0 };

      const sIds = students.map(s => s.id);
      const idList = sql.join(sIds.map(id => sql`${id}`), sql`, `);

      const reqConditions: any[] = [eq(serviceRequirementsTable.active, true), sql`${serviceRequirementsTable.studentId} IN (${idList})`];
      if (filters?.serviceTypeId) reqConditions.push(eq(serviceRequirementsTable.serviceTypeId, filters.serviceTypeId));

      const sessConditions: any[] = [sql`${sessionLogsTable.studentId} IN (${idList})`, gte(sessionLogsTable.sessionDate, start), lte(sessionLogsTable.sessionDate, end)];
      if (filters?.serviceTypeId) sessConditions.push(eq(sessionLogsTable.serviceTypeId, filters.serviceTypeId));

      const [reqs, sessions] = await Promise.all([
        db.select({ studentId: serviceRequirementsTable.studentId, serviceTypeName: serviceTypesTable.name, requiredMinutes: serviceRequirementsTable.requiredMinutes, intervalType: serviceRequirementsTable.intervalType })
          .from(serviceRequirementsTable).leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId)).where(and(...reqConditions)),
        db.select({ studentId: sessionLogsTable.studentId, serviceTypeName: serviceTypesTable.name, status: sessionLogsTable.status, durationMinutes: sessionLogsTable.durationMinutes })
          .from(sessionLogsTable).leftJoin(serviceTypesTable, eq(serviceTypesTable.id, sessionLogsTable.serviceTypeId)).where(and(...sessConditions)),
      ]);

      const sessionMap = new Map<string, { delivered: number; completed: number; missed: number }>();
      for (const s of sessions) {
        const key = `${s.studentId}|${s.serviceTypeName ?? ""}`;
        if (!sessionMap.has(key)) sessionMap.set(key, { delivered: 0, completed: 0, missed: 0 });
        const e = sessionMap.get(key)!;
        if (s.status === "completed" || s.status === "makeup") { e.completed++; e.delivered += s.durationMinutes ?? 0; } else if (s.status === "missed") e.missed++;
      }
      const reqsByStudent = new Map<number, typeof reqs>();
      for (const r of reqs) { if (!reqsByStudent.has(r.studentId)) reqsByStudent.set(r.studentId, []); reqsByStudent.get(r.studentId)!.push(r); }

      const rows: unknown[][] = [];
      for (const student of students) {
        for (const r of (reqsByStudent.get(student.id) ?? [])) {
          const key = `${student.id}|${r.serviceTypeName ?? ""}`;
          const sm = sessionMap.get(key) ?? { delivered: 0, completed: 0, missed: 0 };
          const total = sm.completed + sm.missed;
          const pct = total > 0 ? Math.round((sm.completed / total) * 100) : 100;
          const status = pct >= 90 ? "On Track" : pct >= 75 ? "At Risk" : "Out of Compliance";
          const complianceMapping: Record<string, string> = { "compliant": "On Track", "at-risk": "At Risk", "non-compliant": "Out of Compliance" };
          if (filters?.complianceStatus && complianceMapping[filters.complianceStatus] && status !== complianceMapping[filters.complianceStatus]) continue;
          rows.push([`${student.lastName}, ${student.firstName}`, student.schoolName ?? "", student.grade ?? "", r.serviceTypeName ?? "", `${r.requiredMinutes ?? ""}/${r.intervalType ?? "week"}`, sm.delivered, `${pct}%`, status]);
        }
      }
      return { csv: buildCSV(["Student", "School", "Grade", "Service", "Required", "Delivered", "Compliance %", "Status"], rows), rowCount: rows.length };
    }

    if (reportType === "student-roster") {
      const conditions: any[] = [isNull(studentsTable.deletedAt), eq(studentsTable.status, "active")];
      if (dc) conditions.push(dc);
      if (filters?.schoolId) conditions.push(eq(studentsTable.schoolId, filters.schoolId));
      const students = await db.select({ id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName, grade: studentsTable.grade, status: studentsTable.status, disabilityCategory: studentsTable.disabilityCategory, placementType: studentsTable.placementType, schoolName: schoolsTable.name, dateOfBirth: studentsTable.dateOfBirth, enrolledAt: studentsTable.enrolledAt })
        .from(studentsTable).leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId)).where(and(...conditions)).orderBy(asc(studentsTable.lastName));
      const rows = students.map(s => [s.lastName, s.firstName, s.grade ?? "", s.schoolName ?? "", s.status ?? "", s.disabilityCategory ?? "", s.placementType ?? "", fmtDate(s.dateOfBirth), fmtDate(s.enrolledAt)]);
      return { csv: buildCSV(["Last Name", "First Name", "Grade", "School", "Status", "Disability", "Placement", "DOB", "Enrolled"], rows), rowCount: rows.length };
    }

    if (reportType === "services-by-provider" || reportType === "caseload-distribution") {
      const staffConditions: any[] = [isNull(staffTable.deletedAt), eq(staffTable.status, "active")];
      if (districtId) staffConditions.push(sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${districtId})`);
      if (filters?.schoolId) staffConditions.push(eq(staffTable.schoolId, filters.schoolId));
      if (filters?.providerId) staffConditions.push(eq(staffTable.id, filters.providerId));
      const staffMembers = await db.select({ id: staffTable.id, firstName: staffTable.firstName, lastName: staffTable.lastName, role: staffTable.role, schoolName: schoolsTable.name })
        .from(staffTable).leftJoin(schoolsTable, eq(schoolsTable.id, staffTable.schoolId)).where(and(...staffConditions)).orderBy(asc(staffTable.lastName));

      if (reportType === "caseload-distribution") {
        const staffIds = staffMembers.map(s => s.id);
        const staffIdList = staffIds.length > 0 ? sql.join(staffIds.map(id => sql`${id}`), sql`, `) : sql`0`;
        const assignments = staffIds.length > 0 ? await db.select({ staffId: staffAssignmentsTable.staffId, studentId: staffAssignmentsTable.studentId }).from(staffAssignmentsTable).where(sql`${staffAssignmentsTable.staffId} IN (${staffIdList})`) : [];
        const caseloadMap = new Map<number, Set<number>>();
        for (const a of assignments) { if (!caseloadMap.has(a.staffId)) caseloadMap.set(a.staffId, new Set()); caseloadMap.get(a.staffId)!.add(a.studentId); }
        const ROLE_LABELS: Record<string, string> = { bcba: "BCBA", provider: "Provider", para: "Paraprofessional", sped_teacher: "SPED Teacher", case_manager: "Case Manager" };
        const rows = staffMembers.map(s => [`${s.lastName}, ${s.firstName}`, ROLE_LABELS[s.role] ?? s.role, s.schoolName ?? "", caseloadMap.get(s.id)?.size ?? 0]);
        return { csv: buildCSV(["Staff Member", "Role", "School", "Caseload Size"], rows), rowCount: rows.length };
      }

      const now = new Date();
      const start = filters?.startDate || new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split("T")[0];
      const end = filters?.endDate || now.toISOString().split("T")[0];
      const staffIds = staffMembers.map(s => s.id);
      const staffIdList = staffIds.length > 0 ? sql.join(staffIds.map(id => sql`${id}`), sql`, `) : sql`0`;
      const sessConditions: any[] = [sql`${sessionLogsTable.staffId} IN (${staffIdList})`, gte(sessionLogsTable.sessionDate, start), lte(sessionLogsTable.sessionDate, end)];
      if (filters?.serviceTypeId) sessConditions.push(eq(sessionLogsTable.serviceTypeId, filters.serviceTypeId));
      const sessionData = staffIds.length > 0 ? await db.select({ staffId: sessionLogsTable.staffId, serviceTypeName: serviceTypesTable.name, status: sessionLogsTable.status, durationMinutes: sessionLogsTable.durationMinutes, studentId: sessionLogsTable.studentId })
        .from(sessionLogsTable).leftJoin(serviceTypesTable, eq(serviceTypesTable.id, sessionLogsTable.serviceTypeId)).where(and(...sessConditions)) : [];
      const providerMap = new Map<string, { completed: number; missed: number; minutes: number; students: Set<number> }>();
      for (const s of sessionData) {
        const key = `${s.staffId}|${s.serviceTypeName ?? "Other"}`;
        if (!providerMap.has(key)) providerMap.set(key, { completed: 0, missed: 0, minutes: 0, students: new Set() });
        const e = providerMap.get(key)!;
        if (s.status === "completed" || s.status === "makeup") { e.completed++; e.minutes += s.durationMinutes ?? 0; } else if (s.status === "missed") e.missed++;
        if (s.studentId) e.students.add(s.studentId);
      }
      const staffLookup = new Map(staffMembers.map(s => [s.id, s]));
      const ROLE_LABELS: Record<string, string> = { bcba: "BCBA", provider: "Provider", para: "Paraprofessional", sped_teacher: "SPED Teacher", case_manager: "Case Manager" };
      const rows: unknown[][] = [];
      for (const [key, data] of providerMap) {
        const [staffIdStr, serviceType] = key.split("|");
        const staff = staffLookup.get(Number(staffIdStr));
        if (!staff) continue;
        rows.push([`${staff.lastName}, ${staff.firstName}`, ROLE_LABELS[staff.role] ?? staff.role, staff.schoolName ?? "", serviceType, data.completed, data.missed, data.minutes, data.students.size]);
      }
      return { csv: buildCSV(["Provider", "Role", "School", "Service Type", "Sessions Completed", "Missed", "Total Minutes", "Students"], rows), rowCount: rows.length };
    }

    return null;
  } catch (e) {
    console.error(`[generateReportCSVDirect] Error generating ${reportType}:`, e);
    return null;
  }
}

export default router;
