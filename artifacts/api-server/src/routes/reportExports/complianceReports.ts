// tenant-scope: district-join
import { Router, type Request, type Response } from "express";
import { logAudit } from "../../lib/auditLog";
import {
  resolveExportScope, buildCSV, fmtDate, recordExport,
  initPdfDoc, pdfHeader, pdfSectionTitle, pdfTableHeader, pdfTableRow, pdfFooters,
  csvAddDemoDisclaimer, pdfDemoBanner,
} from "./utils";
import { fetchComplianceSummaryData } from "./fetchers";
import { isDistrictDemo } from "../../lib/districtMode";

const router = Router();

const STATUS_MAPPING: Record<string, string> = {
  "compliant": "On Track",
  "at-risk": "At Risk",
  "non-compliant": "Out of Compliance",
};

function computeComplianceStatus(completed: number, missed: number): { pct: number; status: string } {
  const total = completed + missed;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 100;
  const status = pct >= 90 ? "On Track" : pct >= 75 ? "At Risk" : "Out of Compliance";
  return { pct, status };
}

router.get("/reports/exports/compliance-summary.csv", async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const isDemo = scope.enforcedDistrictId != null && await isDistrictDemo(scope.enforcedDistrictId);

    const { schoolId, startDate, endDate, serviceTypeId, complianceStatus } = req.query;
    const now = new Date();
    const start = (startDate as string) || new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split("T")[0];
    const end = (endDate as string) || now.toISOString().split("T")[0];

    const { students, reqsByStudent, sessionMap } = await fetchComplianceSummaryData(
      scope.enforcedDistrictId,
      {
        start,
        end,
        schoolId: schoolId ? Number(schoolId) : null,
        serviceTypeId: serviceTypeId ? Number(serviceTypeId) : null,
      },
    );

    if (students.length === 0) {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="Compliance_Summary.csv"`);
      let csv = buildCSV(["Student", "School", "Grade", "Service", "Required Min/Wk", "Delivered Min", "Compliance %", "Status"], []);
      if (isDemo) csv = csvAddDemoDisclaimer(csv);
      res.send(csv);
      return;
    }

    const headers = ["Student", "School", "Grade", "Service", "Required Min/Wk", "Delivered Min", "Compliance %", "Status"];
    const csvRows: unknown[][] = [];
    for (const student of students) {
      const studentReqs = reqsByStudent.get(student.id) ?? [];
      for (const req of studentReqs) {
        const key = `${student.id}|${req.serviceTypeName ?? ""}`;
        const sm = sessionMap.get(key) ?? { delivered: 0, completed: 0, missed: 0 };
        const { pct, status } = computeComplianceStatus(sm.completed, sm.missed);
        if (complianceStatus && STATUS_MAPPING[complianceStatus as string] && status !== STATUS_MAPPING[complianceStatus as string]) continue;
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
    let csvOutput = buildCSV(headers, csvRows);
    if (isDemo) csvOutput = csvAddDemoDisclaimer(csvOutput);
    res.send(csvOutput);
  } catch (e: any) {
    console.error("GET /reports/exports/compliance-summary.csv error:", e);
    res.status(500).json({ error: "Failed to generate compliance summary" });
  }
});

router.get("/reports/exports/compliance-summary.pdf", async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = resolveExportScope(req);
    if ("error" in scope) { res.status(scope.status).json({ error: scope.error }); return; }

    const isDemo = scope.enforcedDistrictId != null && await isDistrictDemo(scope.enforcedDistrictId);

    const { schoolId, startDate, endDate, serviceTypeId, complianceStatus } = req.query;
    const now = new Date();
    const start = (startDate as string) || new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split("T")[0];
    const end = (endDate as string) || now.toISOString().split("T")[0];

    const { students, reqsByStudent, sessionMap } = await fetchComplianceSummaryData(
      scope.enforcedDistrictId,
      {
        start,
        end,
        schoolId: schoolId ? Number(schoolId) : null,
        serviceTypeId: serviceTypeId ? Number(serviceTypeId) : null,
      },
    );

    let onTrack = 0, atRisk = 0, outOfCompliance = 0, totalDelivered = 0, totalRequired = 0;
    const rows: { name: string; school: string; grade: string; service: string; delivered: number; required: number; pct: number; status: string }[] = [];
    for (const student of students) {
      const studentReqs = reqsByStudent.get(student.id) ?? [];
      for (const r of studentReqs) {
        const key = `${student.id}|${r.serviceTypeName ?? ""}`;
        const sm = sessionMap.get(key) ?? { delivered: 0, completed: 0, missed: 0 };
        const { pct, status } = computeComplianceStatus(sm.completed, sm.missed);
        if (complianceStatus && STATUS_MAPPING[complianceStatus as string] && status !== STATUS_MAPPING[complianceStatus as string]) continue;
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
    if (isDemo) pdfDemoBanner(doc);

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
