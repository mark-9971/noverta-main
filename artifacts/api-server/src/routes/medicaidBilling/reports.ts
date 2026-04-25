import { Router, type IRouter } from "express";
import { db, medicaidReportSnapshotsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { getDistrictId } from "./shared";
import {
  computeAgingReport,
  computeDenialsReport,
  computeProviderProductivityReport,
  computeRevenueTrendReport,
  type AgingData,
  type AgingRow,
  type DenialsData,
  type ProductivityData,
  type RevenueTrendData,
} from "../../lib/medicaidReports";
import { sendAdminEmail } from "../../lib/email";

// tenant-scope: district-join
const router: IRouter = Router();

// ─── Snapshot types ───────────────────────────────────────────────────────────

type ReportType = "aging" | "denials" | "provider-productivity" | "revenue-trend";

const VALID_REPORT_TYPES: ReadonlySet<string> = new Set<ReportType>([
  "aging",
  "denials",
  "provider-productivity",
  "revenue-trend",
]);

function isValidReportType(v: string): v is ReportType {
  return VALID_REPORT_TYPES.has(v);
}

// Snapshot payloads use the shapes returned by the compute* helpers in
// `src/lib/medicaidReports.ts` (imported above).
type ReportData = AgingData | DenialsData | ProductivityData | RevenueTrendData;

// ─── Snapshot data shape validation ──────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

function validateSnapshotData(reportType: ReportType, data: unknown): string | null {
  if (!isRecord(data)) return "data must be an object";
  switch (reportType) {
    case "aging":
      if (!isArray(data.rows)) return "aging data must have rows array";
      if (!isArray(data.bucketTotals)) return "aging data must have bucketTotals array";
      return null;
    case "denials":
      if (!isArray(data.byReason)) return "denials data must have byReason array";
      if (!isArray(data.byService)) return "denials data must have byService array";
      if (!isRecord(data.totals)) return "denials data must have totals object";
      return null;
    case "provider-productivity":
      if (!isArray(data.providers)) return "productivity data must have providers array";
      return null;
    case "revenue-trend":
      if (!isArray(data.monthly)) return "revenue-trend data must have monthly array";
      if (!isArray(data.quarterly)) return "revenue-trend data must have quarterly array";
      return null;
  }
}

// ─── CSV generation helpers ───────────────────────────────────────────────────

function csvEscape(val: string | number | null | undefined): string {
  const s = String(val ?? "");
  if (/^[=+\-@\t\r]/.test(s)) return `"'${s.replace(/"/g, '""')}"`;
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(header: string, rows: (string | number | null | undefined)[][]): string {
  return [header, ...rows.map(r => r.map(csvEscape).join(","))].join("\n");
}

function snapshotToCsv(reportType: ReportType, data: ReportData, view?: string): string {
  if (reportType === "aging") {
    const d = data as AgingData;
    const BUCKET_ORDER = ["0-30", "31-60", "61-90", "90+"];
    const grouped: Record<string, Record<string, AgingRow>> = {};
    for (const row of d.rows) {
      if (!grouped[row.ageBucket]) grouped[row.ageBucket] = {};
      grouped[row.ageBucket][row.status] = row;
    }
    const out: (string | number | null)[][] = [];
    for (const b of BUCKET_ORDER) {
      for (const status of ["pending", "approved", "rejected", "exported"]) {
        const cell = grouped[b]?.[status];
        if (cell) out.push([b, status, cell.claimCount, cell.totalBilled, cell.avgDaysOld]);
      }
    }
    return buildCsv("Age Bucket,Status,Claims,Total Billed (est.),Avg Days Old", out);
  }

  if (reportType === "denials") {
    const d = data as DenialsData;
    const out = d.byReason.map(r => [r.reason, r.claimCount, r.totalBilled]);
    return buildCsv("Rejection Reason,Claims,Total Billed (est.)", out);
  }

  if (reportType === "provider-productivity") {
    const d = data as ProductivityData;
    const out = d.providers.map(p => [
      p.staffName, p.providerNpi ?? "", p.totalClaims, p.approvedClaims,
      p.rejectedClaims, p.pendingClaims, p.approvalRate,
      p.totalBilled, p.approvedBilled, p.totalUnits,
    ]);
    return buildCsv(
      "Provider,NPI,Total Claims,Approved Claims,Rejected Claims,Pending Claims,Approval Rate (%),Total Billed (est.),Approved Billed (est.),Total Units",
      out,
    );
  }

  if (reportType === "revenue-trend") {
    const d = data as RevenueTrendData;
    const resolvedView = view ?? d._view ?? "monthly";
    const isMonthly = resolvedView === "monthly";
    const periods = isMonthly ? d.monthly : d.quarterly;
    if (isMonthly) {
      const out = periods.map(p => [
        p.period, p.label, p.totalClaims, p.totalBilled, p.approvedBilled,
        p.pendingBilled ?? "", p.rejectedBilled, p.exportedBilled,
        p.prevPeriodBilled ?? "", p.changePercent !== null ? p.changePercent : "",
      ]);
      return buildCsv(
        "Period,Label,Claims,Total Billed (est.),Approved Billed (est.),Pending Billed,Rejected Billed,Exported Billed,Prev Period Billed,Change %",
        out,
      );
    } else {
      const out = periods.map(p => [
        p.period, p.label, p.totalClaims, p.totalBilled, p.approvedBilled,
        p.rejectedBilled, p.exportedBilled,
        p.prevPeriodBilled ?? "", p.changePercent !== null ? p.changePercent : "",
      ]);
      return buildCsv(
        "Period,Label,Claims,Total Billed (est.),Approved Billed (est.),Rejected Billed,Exported Billed,Prev Period Billed,Change %",
        out,
      );
    }
  }

  return "No data";
}

// ─── Snapshot endpoints ───────────────────────────────────────────────────────

interface SaveSnapshotBody {
  reportType: string;
  dateFrom?: string;
  dateTo?: string;
  label?: string;
  data: ReportData;
}

router.post("/medicaid/reports/snapshots", async (req, res): Promise<void> => {
  const authed = req as unknown as AuthedRequest;
  const districtId = getDistrictId(authed);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const body = req.body as SaveSnapshotBody;
  const { reportType, dateFrom, dateTo, label, data } = body;

  if (!isValidReportType(reportType)) {
    res.status(400).json({ error: "Invalid reportType" });
    return;
  }

  const dataError = validateSnapshotData(reportType, data);
  if (dataError) {
    res.status(400).json({ error: dataError });
    return;
  }

  const [snapshot] = await db
    .insert(medicaidReportSnapshotsTable)
    .values({
      districtId,
      reportType,
      label: label?.trim() || null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      savedByClerkId: authed.userId,
      savedByName: authed.displayName,
      data: data as unknown as Record<string, unknown>,
    })
    .returning();

  res.status(201).json(snapshot);
});

router.get("/medicaid/reports/snapshots", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { reportType } = req.query as Record<string, string>;
  const conditions = [eq(medicaidReportSnapshotsTable.districtId, districtId)];
  if (reportType && isValidReportType(reportType)) {
    conditions.push(eq(medicaidReportSnapshotsTable.reportType, reportType));
  }

  const snapshots = await db
    .select({
      id: medicaidReportSnapshotsTable.id,
      reportType: medicaidReportSnapshotsTable.reportType,
      label: medicaidReportSnapshotsTable.label,
      dateFrom: medicaidReportSnapshotsTable.dateFrom,
      dateTo: medicaidReportSnapshotsTable.dateTo,
      savedByName: medicaidReportSnapshotsTable.savedByName,
      createdAt: medicaidReportSnapshotsTable.createdAt,
    })
    .from(medicaidReportSnapshotsTable)
    .where(and(...conditions))
    .orderBy(desc(medicaidReportSnapshotsTable.createdAt))
    .limit(100);

  res.json({ snapshots });
});

router.get("/medicaid/reports/snapshots/:id/csv", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid snapshot id" });
    return;
  }

  const [snapshot] = await db
    .select()
    .from(medicaidReportSnapshotsTable)
    .where(and(
      eq(medicaidReportSnapshotsTable.id, id),
      eq(medicaidReportSnapshotsTable.districtId, districtId),
    ))
    .limit(1);

  if (!snapshot) {
    res.status(404).json({ error: "Snapshot not found" });
    return;
  }

  if (!isValidReportType(snapshot.reportType)) {
    res.status(422).json({ error: "Unknown report type in stored snapshot" });
    return;
  }

  const { view } = req.query as Record<string, string>;
  const csv = snapshotToCsv(snapshot.reportType, snapshot.data as ReportData, view);

  const period = [snapshot.dateFrom, snapshot.dateTo].filter(Boolean).join("-to-") || "all";
  const filename = `${snapshot.reportType}-snapshot-${snapshot.id}-${period}.csv`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

router.delete("/medicaid/reports/snapshots/:id", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid snapshot id" });
    return;
  }

  const deleted = await db
    .delete(medicaidReportSnapshotsTable)
    .where(and(
      eq(medicaidReportSnapshotsTable.id, id),
      eq(medicaidReportSnapshotsTable.districtId, districtId),
    ))
    .returning({ id: medicaidReportSnapshotsTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Snapshot not found" });
    return;
  }

  res.status(204).send();
});

router.post("/medicaid/reports/snapshots/:id/email", async (req, res): Promise<void> => {
  const authed = req as unknown as AuthedRequest;
  const districtId = getDistrictId(authed);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid snapshot id" });
    return;
  }

  const body = (req.body ?? {}) as { toEmail?: string; message?: string; view?: string };
  const toEmail = (body.toEmail ?? "").trim();
  const message = (body.message ?? "").trim();

  // Basic email validation
  if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    res.status(400).json({ error: "A valid recipient email is required" });
    return;
  }

  const [snapshot] = await db
    .select()
    .from(medicaidReportSnapshotsTable)
    .where(and(
      eq(medicaidReportSnapshotsTable.id, id),
      eq(medicaidReportSnapshotsTable.districtId, districtId),
    ))
    .limit(1);

  if (!snapshot) {
    res.status(404).json({ error: "Snapshot not found" });
    return;
  }

  if (!isValidReportType(snapshot.reportType)) {
    res.status(422).json({ error: "Unknown report type in stored snapshot" });
    return;
  }

  const csv = snapshotToCsv(snapshot.reportType, snapshot.data as ReportData, body.view);
  const period = [snapshot.dateFrom, snapshot.dateTo].filter(Boolean).join(" to ") || "all dates";
  const filename = `${snapshot.reportType}-snapshot-${snapshot.id}.csv`;
  const reportLabel: Record<string, string> = {
    aging: "Claim Aging",
    denials: "Denial Analysis",
    "provider-productivity": "Provider Productivity",
    "revenue-trend": "Revenue Trend",
  };
  const label = snapshot.label || `${reportLabel[snapshot.reportType] ?? snapshot.reportType} snapshot`;
  const senderName = authed.displayName || "A Noverta user";
  const savedOn = new Date(snapshot.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const subject = `Noverta Billing Report: ${label}`;

  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const messageBlock = message
    ? `<div style="background:#f9fafb;border-left:3px solid #6366f1;padding:12px 16px;margin:16px 0;font-size:13px;color:#374151;white-space:pre-wrap">${escape(message)}</div>`
    : "";

  const html = `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
<div style="background:#065f46;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
<h2 style="margin:0;font-size:18px">Noverta — ${escape(label)}</h2>
</div>
<div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
<p style="margin-top:0">${escape(senderName)} shared a saved billing report snapshot with you from Noverta.</p>
<ul style="color:#374151;font-size:13px">
<li><strong>Report:</strong> ${escape(reportLabel[snapshot.reportType] ?? snapshot.reportType)}</li>
<li><strong>Period:</strong> ${escape(period)}</li>
<li><strong>Saved on:</strong> ${escape(savedOn)} by ${escape(snapshot.savedByName ?? "Unknown")}</li>
</ul>
${messageBlock}
<p style="color:#6b7280;font-size:13px">The snapshot data is attached as a CSV file.</p>
</div>
<div style="text-align:center;padding:12px;color:#9ca3af;font-size:11px">Noverta SPED Compliance Platform — Confidential</div>
</div>`;

  const text = `${senderName} shared a Noverta billing report snapshot.\n\nReport: ${reportLabel[snapshot.reportType] ?? snapshot.reportType}\nPeriod: ${period}\nSaved on: ${savedOn} by ${snapshot.savedByName ?? "Unknown"}\n\n${message ? message + "\n\n" : ""}The snapshot data is attached as a CSV file.`;

  const result = await sendAdminEmail({
    to: [toEmail],
    subject,
    html,
    text,
    notificationType: "medicaid_snapshot_email",
    attachments: [{ filename, content: Buffer.from(csv, "utf-8") }],
  });

  if (!result.success) {
    if (result.notConfigured) {
      res.status(503).json({ error: "Email provider not configured. Add RESEND_API_KEY to enable email delivery." });
      return;
    }
    res.status(502).json({ error: result.error ?? "Failed to send email" });
    return;
  }

  res.json({ success: true });
});

// ─── Claim aging ──────────────────────────────────────────────────────────────

router.get("/medicaid/reports/aging", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { dateFrom, dateTo, status } = req.query as Record<string, string>;
  const data = await computeAgingReport(districtId, { dateFrom, dateTo, status });
  res.json(data);
});

// ─── Denial / rejection analysis ──────────────────────────────────────────────

router.get("/medicaid/reports/denials", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const data = await computeDenialsReport(districtId, { dateFrom, dateTo });
  res.json(data);
});

// ─── Provider productivity ────────────────────────────────────────────────────

router.get("/medicaid/reports/provider-productivity", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const data = await computeProviderProductivityReport(districtId, { dateFrom, dateTo });
  res.json(data);
});

// ─── Revenue trend ────────────────────────────────────────────────────────────

router.get("/medicaid/reports/revenue-trend", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const data = await computeRevenueTrendReport(districtId, { dateFrom, dateTo });
  res.json(data);
});

export default router;
