import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, serviceRequirementsTable, serviceTypesTable,
  sessionLogsTable, schoolsTable,
} from "@workspace/db";
import { eq, and, asc, lte, gte, isNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import {
  resolveExportScope, buildCSV, fmtDate, districtCondition, recordExport,
  initPdfDoc, pdfHeader, pdfSectionTitle, pdfTableHeader, pdfTableRow, pdfFooters,
} from "./utils";

const router = Router();

router.get("/reports/exports/compliance-summary.csv", async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const { schoolId, startDate, endDate, serviceTypeId, complianceStatus } = req.query;
    const now = new Date();
    const start = (startDate as string) || new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split("T")[0];
    const end = (endDate as string) || now.toISOString().split("T")[0];

    const conditions: SQL[] = [isNull(studentsTable.deletedAt), eq(studentsTable.status, "active")];
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

    const reqConditions: SQL[] = [eq(serviceRequirementsTable.active, true), sql`${serviceRequirementsTable.studentId} IN (${idList})`];
    if (serviceTypeId) reqConditions.push(eq(serviceRequirementsTable.serviceTypeId, Number(serviceTypeId)));

    const sessConditions: SQL[] = [sql`${sessionLogsTable.studentId} IN (${idList})`, gte(sessionLogsTable.sessionDate, start), lte(sessionLogsTable.sessionDate, end), isNull(sessionLogsTable.deletedAt)];
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

    const conditions: SQL[] = [isNull(studentsTable.deletedAt), eq(studentsTable.status, "active")];
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

    const reqConditions: SQL[] = [eq(serviceRequirementsTable.active, true), sql`${serviceRequirementsTable.studentId} IN (${idList})`];
    if (serviceTypeId) reqConditions.push(eq(serviceRequirementsTable.serviceTypeId, Number(serviceTypeId)));

    const sessConditions: SQL[] = [sql`${sessionLogsTable.studentId} IN (${idList})`, gte(sessionLogsTable.sessionDate, start), lte(sessionLogsTable.sessionDate, end), isNull(sessionLogsTable.deletedAt)];
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

export default router;
