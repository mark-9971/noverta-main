import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, serviceTypesTable, sessionLogsTable, schoolsTable,
  staffTable, staffAssignmentsTable, iepDocumentsTable,
} from "@workspace/db";
import { eq, and, asc, lte, gte, isNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import {
  resolveExportScope, buildCSV, fmtDate, districtCondition, recordExport,
  initPdfDoc, pdfHeader, pdfSectionTitle, pdfTableHeader, pdfTableRow, pdfFooters,
  PDF_COLORS, ROLE_LABELS,
} from "./utils";

const router = Router();

router.get("/reports/exports/services-by-provider.csv", async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const { startDate, endDate, schoolId, providerId, serviceTypeId } = req.query;
    const now = new Date();
    const start = (startDate as string) || new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split("T")[0];
    const end = (endDate as string) || now.toISOString().split("T")[0];

    const staffConditions: SQL[] = [isNull(staffTable.deletedAt), eq(staffTable.status, "active")];
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

    const sessConditions: SQL[] = [
      sql`${sessionLogsTable.staffId} IN (${staffIdList})`,
      gte(sessionLogsTable.sessionDate, start),
      lte(sessionLogsTable.sessionDate, end),
      isNull(sessionLogsTable.deletedAt),
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

    const staffConditions: SQL[] = [isNull(staffTable.deletedAt), eq(staffTable.status, "active")];
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

    const sessConditions: SQL[] = [sql`${sessionLogsTable.staffId} IN (${staffIdList})`, gte(sessionLogsTable.sessionDate, start), lte(sessionLogsTable.sessionDate, end), isNull(sessionLogsTable.deletedAt)];
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

    const conditions: SQL[] = [isNull(studentsTable.deletedAt)];
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

    const conditions: SQL[] = [isNull(studentsTable.deletedAt)];
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

    const staffConditions: SQL[] = [isNull(staffTable.deletedAt), eq(staffTable.status, "active")];
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

    const staffConditions: SQL[] = [isNull(staffTable.deletedAt), eq(staffTable.status, "active")];
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

export default router;
