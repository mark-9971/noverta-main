// tenant-scope: district-join
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  exportHistoryTable, scheduledReportsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { logAudit } from "../../lib/auditLog";
import { resolveExportScope, buildCSV, fmtDate, type ReportFilters, ROLE_LABELS, initPdfDoc, pdfHeader, pdfTableHeader, pdfTableRow, pdfFooters } from "./utils";
import {
  fetchComplianceSummaryData,
  fetchStudentRosterData,
  fetchProviderSessionData,
  fetchCaseloadData,
} from "./fetchers";

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

    const { reportType, frequency, filters, recipientEmails, format } = req.body;

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

    const resolvedFormat = format === "pdf" ? "pdf" : "csv";
    const validFormats = ["csv", "pdf"];
    if (format && !validFormats.includes(format)) {
      res.status(400).json({ error: `Invalid format. Must be one of: ${validFormats.join(", ")}` });
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
      format: resolvedFormat,
      filters: filters ?? {},
      recipientEmails,
      createdBy,
      nextRunAt,
    }).returning();

    logAudit(req, { action: "create", targetTable: "scheduled_reports", targetId: created.id, summary: `Created scheduled ${frequency} ${resolvedFormat.toUpperCase()} report: ${reportType}` });

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

export async function buildScheduledReportPdf(opts: {
  label: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  frequency: string;
}): Promise<Buffer> {
  const { label, headers, rows, frequency } = opts;
  const doc = initPdfDoc();

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  pdfHeader(doc, label, `Scheduled ${frequency} report — ${dateStr} — ${rows.length} record${rows.length !== 1 ? "s" : ""}`);

  const totalWidth = 492;
  const colCount = Math.max(1, headers.length);
  const colWidth = Math.floor(totalWidth / colCount);
  const lastColWidth = totalWidth - colWidth * (colCount - 1);
  const cols = headers.map((h, i) => ({ text: h, width: i === colCount - 1 ? lastColWidth : colWidth }));

  if (rows.length > 0) {
    pdfTableHeader(doc, cols);
    for (const row of rows) {
      if (doc.y > 700) { doc.addPage(); pdfTableHeader(doc, cols); }
      const y = doc.y;
      pdfTableRow(doc, cols.map((c, i) => ({ text: String(row[i] ?? ""), width: c.width })), y);
      doc.y = y + 13;
    }
  } else {
    doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text("No records found for this report period.", { align: "center" });
  }

  pdfFooters(doc, label);

  return new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export async function generateReportCSVDirect(reportType: string, districtId: number, filters?: ReportFilters): Promise<{ csv: string; rowCount: number; headers: string[]; rows: (string | number | null | undefined)[][] } | null> {
  if (districtId <= 0) {
    console.error(`[generateReportCSVDirect] Refusing to generate report without valid district scope (districtId=${districtId})`);
    return null;
  }
  try {
    if (reportType === "compliance-summary") {
      const now = new Date();
      const start = filters?.startDate || new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split("T")[0];
      const end = filters?.endDate || now.toISOString().split("T")[0];

      const { students, reqsByStudent, sessionMap } = await fetchComplianceSummaryData(districtId, {
        start,
        end,
        schoolId: filters?.schoolId ?? null,
        serviceTypeId: filters?.serviceTypeId ?? null,
      });

      const headers = ["Student", "School", "Grade", "Service", "Required", "Delivered", "Compliance %", "Status"];
      if (students.length === 0) return { csv: buildCSV(headers, []), rowCount: 0, headers, rows: [] };

      const complianceMapping: Record<string, string> = { "compliant": "On Track", "at-risk": "At Risk", "non-compliant": "Out of Compliance" };
      const rows: (string | number)[][] = [];
      for (const student of students) {
        for (const r of (reqsByStudent.get(student.id) ?? [])) {
          const key = `${student.id}|${r.serviceTypeName ?? ""}`;
          const sm = sessionMap.get(key) ?? { delivered: 0, completed: 0, missed: 0 };
          const total = sm.completed + sm.missed;
          const pct = total > 0 ? Math.round((sm.completed / total) * 100) : 100;
          const status = pct >= 90 ? "On Track" : pct >= 75 ? "At Risk" : "Out of Compliance";
          if (filters?.complianceStatus && complianceMapping[filters.complianceStatus] && status !== complianceMapping[filters.complianceStatus]) continue;
          rows.push([`${student.lastName}, ${student.firstName}`, student.schoolName ?? "", student.grade ?? "", r.serviceTypeName ?? "", `${r.requiredMinutes ?? ""}/${r.intervalType ?? "week"}`, sm.delivered, `${pct}%`, status]);
        }
      }
      return { csv: buildCSV(headers, rows), rowCount: rows.length, headers, rows };
    }

    if (reportType === "student-roster") {
      const { students } = await fetchStudentRosterData(districtId, {
        schoolId: filters?.schoolId ?? null,
        statusFilter: "active",
      });
      const headers = ["Last Name", "First Name", "Grade", "School", "Status", "Disability", "Placement", "DOB", "Enrolled"];
      const rows = students.map(s => [s.lastName, s.firstName, s.grade ?? "", s.schoolName ?? "", s.status ?? "", s.disabilityCategory ?? "", s.placementType ?? "", fmtDate(s.dateOfBirth), fmtDate(s.enrolledAt)]);
      return { csv: buildCSV(headers, rows), rowCount: rows.length, headers, rows };
    }

    if (reportType === "services-by-provider") {
      const now = new Date();
      const start = filters?.startDate || new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split("T")[0];
      const end = filters?.endDate || now.toISOString().split("T")[0];

      const { staffMembers, sessionData } = await fetchProviderSessionData(districtId, {
        start,
        end,
        schoolId: filters?.schoolId ?? null,
        providerId: filters?.providerId ?? null,
        serviceTypeId: filters?.serviceTypeId ?? null,
      });

      const providerMap = new Map<string, { completed: number; missed: number; minutes: number; students: Set<number> }>();
      for (const s of sessionData) {
        const key = `${s.staffId}|${s.serviceTypeName ?? "Other"}`;
        if (!providerMap.has(key)) providerMap.set(key, { completed: 0, missed: 0, minutes: 0, students: new Set() });
        const e = providerMap.get(key)!;
        if (s.status === "completed" || s.status === "makeup") { e.completed++; e.minutes += s.durationMinutes ?? 0; } else if (s.status === "missed") e.missed++;
        if (s.studentId) e.students.add(s.studentId);
      }
      const staffLookup = new Map(staffMembers.map(s => [s.id, s]));
      const headers = ["Provider", "Role", "School", "Service Type", "Sessions Completed", "Missed", "Total Minutes", "Students"];
      const rows: (string | number)[][] = [];
      for (const [key, data] of providerMap) {
        const [staffIdStr, serviceType] = key.split("|");
        const staff = staffLookup.get(Number(staffIdStr));
        if (!staff) continue;
        rows.push([`${staff.lastName}, ${staff.firstName}`, ROLE_LABELS[staff.role] ?? staff.role, staff.schoolName ?? "", serviceType, data.completed, data.missed, data.minutes, data.students.size]);
      }
      return { csv: buildCSV(headers, rows), rowCount: rows.length, headers, rows };
    }

    if (reportType === "caseload-distribution") {
      const { staffMembers, assignments } = await fetchCaseloadData(districtId, {
        schoolId: filters?.schoolId ?? null,
      });

      const caseloadMap = new Map<number, Set<number>>();
      for (const a of assignments) {
        if (!caseloadMap.has(a.staffId)) caseloadMap.set(a.staffId, new Set());
        caseloadMap.get(a.staffId)!.add(a.studentId);
      }
      const headers = ["Staff Member", "Role", "School", "Caseload Size"];
      const rows: (string | number)[][] = staffMembers.map(s => [`${s.lastName}, ${s.firstName}`, ROLE_LABELS[s.role] ?? s.role, s.schoolName ?? "", caseloadMap.get(s.id)?.size ?? 0]);
      return { csv: buildCSV(headers, rows), rowCount: rows.length, headers, rows };
    }

    return null;
  } catch (e) {
    console.error(`[generateReportCSVDirect] Error generating ${reportType}:`, e);
    return null;
  }
}

export default router;
