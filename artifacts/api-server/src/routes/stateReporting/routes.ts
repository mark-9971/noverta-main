import { Router, type IRouter } from "express";
import { db, exportHistoryTable, generatedDocumentsTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { requireRoles, getEnforcedDistrictId, type AuthedRequest } from "../../middlewares/auth";
import { getAuth } from "@clerk/express";
import { ADMIN_ROLES, buildCsv } from "./shared";
import { TEMPLATES } from "./templates";
import { compute30DayWindows, buildRestraint30DayCsv, buildRestraint30DayPdf } from "./restraint30Day";
import { computeIepTimelines, buildCorrectiveActionLetterPdf } from "./iepTimeline";

const router: IRouter = Router();

router.get("/state-reports/templates", requireRoles(...ADMIN_ROLES), async (_req, res): Promise<void> => {
  const list = Object.values(TEMPLATES).map((t) => ({
    key: t.key,
    label: t.label,
    description: t.description,
    columnCount: t.columns.length,
  }));
  res.json(list);
});

router.post("/state-reports/validate", requireRoles(...ADMIN_ROLES), async (req, res): Promise<void> => {
  try {
    const { reportType, schoolId, dateFrom, dateTo } = req.body as {
      reportType: string;
      schoolId?: number;
      dateFrom?: string;
      dateTo?: string;
    };
    const template = TEMPLATES[reportType];
    if (!template) {
      res.status(400).json({ error: "Unknown report type" });
      return;
    }
    const rows = await template.query({
      schoolId: schoolId ? Number(schoolId) : undefined,
      dateFrom,
      dateTo,
    });
    const allIssues = template.validate(rows as any);
    const errors = allIssues.filter((w) => w.severity === "error");
    const warns = allIssues.filter((w) => w.severity === "warning");
    res.json({
      recordCount: rows.length,
      errorCount: errors.length,
      warningCount: warns.length,
      errors,
      warnings: warns,
    });
  } catch (err: unknown) {
    console.error("Validation error:", err);
    res.status(500).json({ error: "Validation failed" });
  }
});

router.post("/state-reports/export", requireRoles(...ADMIN_ROLES), async (req, res): Promise<void> => {
  try {
    const { reportType, schoolId, dateFrom, dateTo, forceExport } = req.body as {
      reportType: string;
      schoolId?: number;
      forceExport?: boolean;
      dateFrom?: string;
      dateTo?: string;
    };
    const template = TEMPLATES[reportType];
    if (!template) {
      res.status(400).json({ error: "Unknown report type" });
      return;
    }

    const rows = await template.query({
      schoolId: schoolId ? Number(schoolId) : undefined,
      dateFrom,
      dateTo,
    });

    const allIssues = template.validate(rows as any);
    const errorCount = allIssues.filter((w) => w.severity === "error").length;
    const warnCount = allIssues.filter((w) => w.severity === "warning").length;

    if (errorCount > 0 && !forceExport) {
      const errors = allIssues.filter((w) => w.severity === "error");
      const warnings = allIssues.filter((w) => w.severity === "warning");
      res.status(422).json({
        error: "Export blocked — validation errors found",
        errorCount,
        warningCount: warnCount,
        message: `${errorCount} required field error${errorCount !== 1 ? "s" : ""} must be resolved before export. Use "Force Export" to override.`,
        errors,
        warnings,
        recordCount: rows.length,
      });
      return;
    }

    const csv = buildCsv(template.columns, rows as any);
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const fileName = `${template.key}_${timestamp}.csv`;

    const auth = getAuth(req);
    const userId = auth?.userId ?? "unknown";
    const districtId = getEnforcedDistrictId(req as AuthedRequest);

    await db.insert(exportHistoryTable).values({
      reportType: template.key,
      reportLabel: template.label,
      exportedBy: userId,
      schoolId: schoolId ? Number(schoolId) : null,
      districtId: districtId ?? null,
      parameters: { schoolId, dateFrom, dateTo, errorCount } as Record<string, unknown>,
      recordCount: rows.length,
      warningCount: warnCount,
      fileName,
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(csv);
  } catch (err: unknown) {
    console.error("Export error:", err);
    res.status(500).json({ error: "Export failed" });
  }
});

router.get("/state-reports/history", requireRoles(...ADMIN_ROLES), async (req, res): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const districtId = getEnforcedDistrictId(req as AuthedRequest);

    const rows = await db
      .select()
      .from(exportHistoryTable)
      .where(districtId != null ? eq(exportHistoryTable.districtId, districtId) : undefined)
      .orderBy(desc(exportHistoryTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(exportHistoryTable)
      .where(districtId != null ? eq(exportHistoryTable.districtId, districtId) : undefined);

    res.json({ rows, total: count });
  } catch (err: unknown) {
    console.error("Export history error:", err);
    res.status(500).json({ error: "Failed to load export history" });
  }
});

router.get("/state-reporting/restraint-30-day", requireRoles(...ADMIN_ROLES), async (req, res): Promise<void> => {
  try {
    const schoolId = req.query.schoolId ? Number(req.query.schoolId) : undefined;
    const dateFrom = (req.query.dateFrom ?? req.query.startDate) as string | undefined;
    const dateTo = (req.query.dateTo ?? req.query.endDate) as string | undefined;
    const format = (req.query.format as string | undefined) ?? "json";

    const report = await compute30DayWindows(req as AuthedRequest, { schoolId, dateFrom, dateTo });

    if (format === "csv") {
      const csv = buildRestraint30DayCsv(report.windows);
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const fileName = `restraint_30day_${timestamp}.csv`;

      const auth = getAuth(req);
      const userId = auth?.userId ?? "unknown";
      const districtId = getEnforcedDistrictId(req as AuthedRequest);

      await db.insert(exportHistoryTable).values({
        reportType: "restraint_30day",
        reportLabel: "DESE 30-Day Restraint Aggregate",
        exportedBy: userId,
        schoolId: schoolId ?? null,
        districtId: districtId ?? null,
        parameters: { schoolId, dateFrom, dateTo } as Record<string, unknown>,
        recordCount: report.windows.length,
        warningCount: report.nonCompliantWindows,
        fileName,
      });

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.send(csv);
      return;
    }

    if (format === "pdf") {
      const pdfBuf = await buildRestraint30DayPdf(report);
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const fileName = `restraint_30day_${timestamp}.pdf`;

      const auth = getAuth(req);
      const userId = auth?.userId ?? "unknown";
      const districtId = getEnforcedDistrictId(req as AuthedRequest);

      await db.insert(exportHistoryTable).values({
        reportType: "restraint_30day",
        reportLabel: "DESE 30-Day Restraint Aggregate (PDF)",
        exportedBy: userId,
        schoolId: schoolId ?? null,
        districtId: districtId ?? null,
        parameters: { schoolId, dateFrom, dateTo, format: "pdf" } as Record<string, unknown>,
        recordCount: report.windows.length,
        warningCount: report.nonCompliantWindows,
        fileName,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.send(pdfBuf);
      return;
    }

    res.json(report);
  } catch (err: unknown) {
    console.error("Restraint 30-day report error:", err);
    res.status(500).json({ error: "Failed to generate restraint report" });
  }
});

router.get("/state-reporting/iep-timeline", requireRoles(...ADMIN_ROLES), async (req, res): Promise<void> => {
  try {
    const schoolId = req.query.schoolId ? Number(req.query.schoolId) : undefined;
    const phase = (req.query.phase as "PL1" | "PL2" | "all" | undefined) ?? "all";

    const rows = await computeIepTimelines(req as AuthedRequest, { schoolId, phase });

    const summary = {
      total: rows.length,
      pl1Active: rows.filter((r) => r.phase === "PL1" || r.phase === "pre-consent").length,
      pl2Active: rows.filter((r) => r.phase === "PL2").length,
      breached: rows.filter((r) => r.hasActivePl1Breach || r.hasActivePl2Breach).length,
      atRisk: rows.filter((r) => {
        const activePhase = (r.phase === "PL1" || r.phase === "pre-consent") ? r.pl1 : r.pl2;
        return activePhase.status === "yellow" && !activePhase.breached;
      }).length,
    };

    res.json({ rows, summary });
  } catch (err: unknown) {
    console.error("IEP timeline error:", err);
    res.status(500).json({ error: "Failed to compute IEP timelines" });
  }
});

router.post("/state-reporting/corrective-action-letter", requireRoles(...ADMIN_ROLES), async (req, res): Promise<void> => {
  try {
    const { studentId, adminName, districtName } = req.body as {
      studentId: number;
      adminName?: string;
      districtName?: string;
    };

    if (!studentId) {
      res.status(400).json({ error: "studentId is required" });
      return;
    }

    const schoolId = undefined;
    const rows = await computeIepTimelines(req as AuthedRequest, { schoolId });
    const row = rows.find((r) => r.studentId === Number(studentId));

    if (!row) {
      res.status(404).json({ error: "No active timeline found for this student" });
      return;
    }

    if (!row.hasActivePl1Breach && !row.hasActivePl2Breach) {
      res.status(400).json({
        error: "Student has no active timeline breach — corrective action letter can only be generated for students with a PL1 or PL2 breach",
        studentId,
        phase: row.phase,
      });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const pdfBuf = await buildCorrectiveActionLetterPdf(
      row,
      adminName ?? "",
      districtName ?? "District",
      today
    );

    const auth = getAuth(req);
    const userId = auth?.userId ?? "unknown";
    const fileName = `corrective_action_${studentId}_${today.replace(/-/g, "")}.pdf`;

    await db.insert(generatedDocumentsTable).values({
      studentId: Number(studentId),
      type: "corrective_action_letter",
      status: "finalized",
      title: `IEP Timeline Corrective Action Letter — ${row.studentName} — ${today}`,
      htmlSnapshot: null,
      linkedRecordId: row.referralId ?? null,
      createdByName: userId,
      guardianVisible: false,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(pdfBuf);
  } catch (err: unknown) {
    console.error("Corrective action letter error:", err);
    res.status(500).json({ error: "Failed to generate corrective action letter" });
  }
});

export default router;
