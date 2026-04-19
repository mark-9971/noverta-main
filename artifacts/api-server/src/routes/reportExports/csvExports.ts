// tenant-scope: district-join
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, iepDocumentsTable, serviceRequirementsTable, serviceTypesTable,
  sessionLogsTable, schoolsTable, restraintIncidentsTable, schoolYearsTable,
} from "@workspace/db";
import { eq, and, desc, asc, lte, gte, isNull, sql } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import { isDistrictDemo } from "../../lib/districtMode";
import {
  resolveExportScope, buildCSV, assertCSVHeaders, fmtDate, daysUntil, csvAddDemoDisclaimer,
} from "./utils";

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

const router = Router();

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
        r.lastName, r.firstName, r.grade ?? "", r.disabilityCategory ?? "",
        r.schoolName ?? "", fmtDate(r.iepStartDate), fmtDate(r.iepEndDate),
        fmtDate(r.meetingDate), r.iepType ?? "annual", r.status ?? "",
        typeof days === "number" ? days : "", reviewStatus,
      ];
    });

    logAudit(req, {
      action: "read",
      targetTable: "iep_documents",
      summary: `Exported active-ieps CSV (${csvRows.length} rows)`,
      metadata: { reportType: "active-ieps-csv", rowCount: csvRows.length },
    });

    const demoDistrict = effectiveDistrictId != null && await isDistrictDemo(effectiveDistrictId);
    let csvOutput = buildCSV(headers, csvRows);
    if (demoDistrict) csvOutput = csvAddDemoDisclaimer(csvOutput);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="Active_IEPs_${new Date().toISOString().split("T")[0]}.csv"`);
    res.send(csvOutput);
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
    const isDemoSvc = effectiveDistrictId != null && await isDistrictDemo(effectiveDistrictId);
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
      id: studentsTable.id, firstName: studentsTable.firstName,
      lastName: studentsTable.lastName, grade: studentsTable.grade, schoolName: schoolsTable.name,
    })
      .from(studentsTable)
      .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
      .where(studentConditions.length > 0 ? and(...studentConditions) : undefined)
      .orderBy(asc(studentsTable.lastName), asc(studentsTable.firstName));

    if (students.length === 0) {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="Service_Minutes_${start}_${end}.csv"`);
      let emptyCSV = buildCSV([...SERVICE_MINUTES_HEADERS], []);
      if (isDemoSvc) emptyCSV = csvAddDemoDisclaimer(emptyCSV);
      res.send(emptyCSV);
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
          isNull(sessionLogsTable.deletedAt),
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
          student.lastName, student.firstName, student.grade ?? "",
          student.schoolName ?? "", req.serviceTypeName ?? "",
          `${req.requiredMinutes ?? ""}/${req.intervalType ?? "week"}`,
          summary.completed, summary.delivered, summary.missed,
          `${compliancePct}%`, fmtDate(start), fmtDate(end),
        ]);
      }
    }

    logAudit(req, {
      action: "read",
      targetTable: "session_logs",
      summary: `Exported service-minutes CSV (${csvRows.length} rows) ${start}–${end}`,
      metadata: { reportType: "service-minutes-csv", rowCount: csvRows.length, start, end },
    });

    let csvOutputSvc = buildCSV(headers, csvRows);
    if (isDemoSvc) csvOutputSvc = csvAddDemoDisclaimer(csvOutputSvc);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="Service_Minutes_${start}_${end}.csv"`);
    res.send(csvOutputSvc);
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
      fmtDate(i.incidentDate), i.incidentTime ?? "", i.schoolName ?? "",
      i.studentLastName ?? "", i.studentFirstName ?? "",
      i.studentGrade ?? "", i.studentDisability ?? "",
      TYPE_LABELS[i.incidentType] ?? i.incidentType,
      i.durationMinutes ?? "", i.location ?? "",
      i.studentInjury ? "Yes" : "No", i.staffInjury ? "Yes" : "No",
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

    const demoDistrictInc = effectiveDistrictId != null && await isDistrictDemo(effectiveDistrictId);
    let csvOutputInc = buildCSV(headers, csvRows);
    if (demoDistrictInc) csvOutputInc = csvAddDemoDisclaimer(csvOutputInc);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="Incidents_${start}_${end}.csv"`);
    res.send(csvOutputInc);
  } catch (e: any) {
    console.error("GET /reports/exports/incidents.csv error:", e);
    res.status(500).json({ error: "Failed to generate incidents export" });
  }
});

export default router;
