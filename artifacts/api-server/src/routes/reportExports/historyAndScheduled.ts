import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, serviceRequirementsTable, serviceTypesTable,
  sessionLogsTable, schoolsTable, staffTable, staffAssignmentsTable,
  exportHistoryTable, scheduledReportsTable,
} from "@workspace/db";
import { eq, and, desc, asc, lte, gte, isNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { logAudit } from "../../lib/auditLog";
import { resolveExportScope, buildCSV, type ReportFilters } from "./utils";

const router = Router();

router.get("/reports/exports/history", async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const conditions: SQL[] = [];
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

    const conditions: SQL[] = [];
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

    const conditions: SQL[] = [eq(scheduledReportsTable.id, id)];
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
      const conditions: SQL[] = [isNull(studentsTable.deletedAt), eq(studentsTable.status, "active")];
      if (dc) conditions.push(dc);
      if (filters?.schoolId) conditions.push(eq(studentsTable.schoolId, filters.schoolId));

      const students = await db.select({ id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName, grade: studentsTable.grade, schoolName: schoolsTable.name })
        .from(studentsTable).leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId)).where(and(...conditions)).orderBy(asc(studentsTable.lastName));

      if (students.length === 0) return { csv: buildCSV(["Student", "School", "Grade", "Service", "Required", "Delivered", "Compliance %", "Status"], []), rowCount: 0 };

      const sIds = students.map(s => s.id);
      const idList = sql.join(sIds.map(id => sql`${id}`), sql`, `);

      const reqConditions: SQL[] = [eq(serviceRequirementsTable.active, true), sql`${serviceRequirementsTable.studentId} IN (${idList})`];
      if (filters?.serviceTypeId) reqConditions.push(eq(serviceRequirementsTable.serviceTypeId, filters.serviceTypeId));

      const sessConditions: SQL[] = [sql`${sessionLogsTable.studentId} IN (${idList})`, gte(sessionLogsTable.sessionDate, start), lte(sessionLogsTable.sessionDate, end), isNull(sessionLogsTable.deletedAt)];
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
      const conditions: SQL[] = [isNull(studentsTable.deletedAt), eq(studentsTable.status, "active")];
      if (dc) conditions.push(dc);
      if (filters?.schoolId) conditions.push(eq(studentsTable.schoolId, filters.schoolId));
      const students = await db.select({ id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName, grade: studentsTable.grade, status: studentsTable.status, disabilityCategory: studentsTable.disabilityCategory, placementType: studentsTable.placementType, schoolName: schoolsTable.name, dateOfBirth: studentsTable.dateOfBirth, enrolledAt: studentsTable.enrolledAt })
        .from(studentsTable).leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId)).where(and(...conditions)).orderBy(asc(studentsTable.lastName));
      const fmtDateSimple = (d: string | Date | null | undefined): string => { if (!d) return ""; try { return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" }); } catch { return String(d); } };
      const rows = students.map(s => [s.lastName, s.firstName, s.grade ?? "", s.schoolName ?? "", s.status ?? "", s.disabilityCategory ?? "", s.placementType ?? "", fmtDateSimple(s.dateOfBirth), fmtDateSimple(s.enrolledAt)]);
      return { csv: buildCSV(["Last Name", "First Name", "Grade", "School", "Status", "Disability", "Placement", "DOB", "Enrolled"], rows), rowCount: rows.length };
    }

    if (reportType === "services-by-provider" || reportType === "caseload-distribution") {
      const staffConditions: SQL[] = [isNull(staffTable.deletedAt), eq(staffTable.status, "active")];
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
      const sessConditions: SQL[] = [sql`${sessionLogsTable.staffId} IN (${staffIdList})`, gte(sessionLogsTable.sessionDate, start), lte(sessionLogsTable.sessionDate, end), isNull(sessionLogsTable.deletedAt)];
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
