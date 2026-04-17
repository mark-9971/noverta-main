import { Router, type IRouter } from "express";
import { db, exportHistoryTable } from "@workspace/db";
import { desc, sql } from "drizzle-orm";
import { requireRoles } from "../../middlewares/auth";
import { getAuth } from "@clerk/express";
import { ADMIN_ROLES, buildCsv } from "./shared";
import { TEMPLATES } from "./templates";

// tenant-scope: district-join
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

    await db.insert(exportHistoryTable).values({
      reportType: template.key,
      reportLabel: template.label,
      exportedBy: userId,
      schoolId: schoolId ? Number(schoolId) : null,
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

    const rows = await db
      .select()
      .from(exportHistoryTable)
      .orderBy(desc(exportHistoryTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(exportHistoryTable);

    res.json({ rows, total: count });
  } catch (err: unknown) {
    console.error("Export history error:", err);
    res.status(500).json({ error: "Failed to load export history" });
  }
});

export default router;
