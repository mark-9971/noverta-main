import { Router, type IRouter, type Request, type Response } from "express";
import PDFDocument from "pdfkit";
import { db } from "@workspace/db";
import {
  districtsTable,
  pilotBaselineSnapshotsTable,
} from "@workspace/db/schema";
import {
  studentsTable,
  staffTable,
  sessionLogsTable,
} from "@workspace/db";
import { and, eq, gte, isNull, sql, count, lte } from "drizzle-orm";
import type { NextFunction } from "express";
import { getEnforcedDistrictId, requireAuth } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";
import { getPublicMeta } from "../../lib/clerkClaims";
import { logAudit } from "../../lib/auditLog";
import { computePilotBaselineMetrics } from "../../lib/pilotBaselineSnapshots";
import {
  PDF_COLORS,
  initPdfDoc,
  pdfFooters,
  type BufferedPDFDoc,
} from "./utils";

const router: IRouter = Router();

/**
 * Auth gate for the Pilot Readout: allow district admins/coordinators OR
 * platform admins (internal support / GTM). Platform admins are not always
 * captured by `requireRoles("admin","coordinator")` because their TrellisRole
 * may differ from their access level — they're identified by
 * `meta.platformAdmin`.
 */
function isPlatformAdminRequest(req: Request): boolean {
  if (
    process.env.NODE_ENV === "test" &&
    req.headers["x-test-platform-admin"] === "true"
  ) {
    return true;
  }
  return Boolean(getPublicMeta(req).platformAdmin);
}

function requireAdminOrPlatformAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  requireAuth(req, res, () => {
    const authed = req as unknown as AuthedRequest;
    if (
      isPlatformAdminRequest(req) ||
      authed.trellisRole === "admin" ||
      authed.trellisRole === "coordinator"
    ) {
      next();
      return;
    }
    res
      .status(403)
      .json({ error: "You don't have permission to access this resource" });
  });
}

interface ReadoutData {
  district: { id: number; name: string; isPilot: boolean; isDemo: boolean };
  pilotStart: string | null; // ISO date — baseline capturedAt
  pilotEndOrToday: string;   // ISO date — today
  baseline: {
    capturedAt: string;
    compliancePercent: number | null;
    exposureDollars: number;
    compEdMinutesOutstanding: number;
    overdueEvaluations: number;
    expiringIepsNext60: number;
  } | null;
  current: {
    compliancePercent: number | null;
    exposureDollars: number;
    compEdMinutesOutstanding: number;
    overdueEvaluations: number;
    expiringIepsNext60: number;
  };
  adoption: {
    activeStaffTotal: number;
    activeStaffLogging: number;
    sessionsLogged30d: number;
    sessionsLoggedAllTime: number;
    activeStudents: number;
  };
}

async function loadReadoutData(districtId: number): Promise<ReadoutData> {
  const [district] = await db
    .select({ id: districtsTable.id, name: districtsTable.name, isPilot: districtsTable.isPilot, isDemo: districtsTable.isDemo })
    .from(districtsTable)
    .where(eq(districtsTable.id, districtId))
    .limit(1);

  if (!district) {
    throw new Error(`District ${districtId} not found`);
  }

  const [baselineRow] = await db
    .select()
    .from(pilotBaselineSnapshotsTable)
    .where(eq(pilotBaselineSnapshotsTable.districtId, districtId))
    .limit(1);

  const current = await computePilotBaselineMetrics(districtId);

  const today = new Date().toISOString().slice(0, 10);
  const d30 = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

  // Active staff in district (case managers, providers, coordinators, etc.)
  const [staffTotal] = await db
    .select({ n: count() })
    .from(staffTable)
    .where(and(
      eq(staffTable.status, "active"),
      isNull(staffTable.deletedAt),
      sql`${staffTable.role} IN ('provider','bcba','sped_teacher','case_manager','coordinator','para')`,
      sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${districtId})`,
    ));

  // Distinct staff who have logged at least one session in the trailing 30 days
  const loggingRows = await db
    .select({ staffId: sessionLogsTable.staffId })
    .from(sessionLogsTable)
    .where(and(
      gte(sessionLogsTable.sessionDate, d30),
      lte(sessionLogsTable.sessionDate, today),
      isNull(sessionLogsTable.deletedAt),
      sql`${sessionLogsTable.studentId} IN (SELECT s.id FROM students s JOIN schools sc ON sc.id = s.school_id WHERE sc.district_id = ${districtId})`,
    ))
    .groupBy(sessionLogsTable.staffId);

  // Sessions logged in trailing 30 days + all-time-since-baseline
  const [sess30] = await db
    .select({ n: count() })
    .from(sessionLogsTable)
    .where(and(
      gte(sessionLogsTable.sessionDate, d30),
      lte(sessionLogsTable.sessionDate, today),
      isNull(sessionLogsTable.deletedAt),
      sql`${sessionLogsTable.studentId} IN (SELECT s.id FROM students s JOIN schools sc ON sc.id = s.school_id WHERE sc.district_id = ${districtId})`,
    ));

  const baselineDate = baselineRow?.capturedAt
    ? new Date(baselineRow.capturedAt).toISOString().slice(0, 10)
    : null;

  let sessionsAllTime = 0;
  if (baselineDate) {
    const [sessAll] = await db
      .select({ n: count() })
      .from(sessionLogsTable)
      .where(and(
        gte(sessionLogsTable.sessionDate, baselineDate),
        isNull(sessionLogsTable.deletedAt),
        sql`${sessionLogsTable.studentId} IN (SELECT s.id FROM students s JOIN schools sc ON sc.id = s.school_id WHERE sc.district_id = ${districtId})`,
      ));
    sessionsAllTime = sessAll?.n ?? 0;
  }

  const [studs] = await db
    .select({ n: count() })
    .from(studentsTable)
    .where(and(
      eq(studentsTable.status, "active"),
      sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${districtId})`,
    ));

  return {
    district: { ...district, isDemo: district.isDemo ?? false },
    pilotStart: baselineDate,
    pilotEndOrToday: today,
    baseline: baselineRow
      ? {
          capturedAt: typeof baselineRow.capturedAt === "string"
            ? baselineRow.capturedAt
            : baselineRow.capturedAt.toISOString(),
          compliancePercent: baselineRow.compliancePercent,
          exposureDollars: baselineRow.exposureDollars,
          compEdMinutesOutstanding: baselineRow.compEdMinutesOutstanding,
          overdueEvaluations: baselineRow.overdueEvaluations,
          expiringIepsNext60: baselineRow.expiringIepsNext60,
        }
      : null,
    current,
    adoption: {
      activeStaffTotal: staffTotal?.n ?? 0,
      activeStaffLogging: loggingRows.length,
      sessionsLogged30d: sess30?.n ?? 0,
      sessionsLoggedAllTime: sessionsAllTime,
      activeStudents: studs?.n ?? 0,
    },
  };
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(Math.abs(n) >= 10_000 ? 0 : 1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString();
}

function fmtDateLong(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return String(d);
  }
}

function deltaLabel(
  baseline: number | null,
  current: number | null,
  lowerIsBetter: boolean,
  formatter: (n: number) => string,
): { text: string; color: string } {
  if (baseline == null || current == null) {
    return { text: "—", color: PDF_COLORS.GRAY_MID };
  }
  const d = current - baseline;
  if (d === 0) return { text: "no change", color: PDF_COLORS.GRAY_MID };
  const improved = lowerIsBetter ? d < 0 : d > 0;
  const sign = d > 0 ? "+" : "−";
  return {
    text: `${sign}${formatter(Math.abs(d))}`,
    color: improved ? PDF_COLORS.EMERALD : "#dc2626",
  };
}

function renderPdf(doc: InstanceType<typeof PDFDocument>, data: ReadoutData): void {
  const PAGE_W = 492;
  const LEFT = 60;
  const EMERALD = PDF_COLORS.EMERALD;
  const GRAY_DARK = PDF_COLORS.GRAY_DARK;
  const GRAY_MID = PDF_COLORS.GRAY_MID;

  // ── Cover page ────────────────────────────────────────────────────────────
  doc.rect(0, 0, 612, 220).fill(EMERALD);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(11)
    .text("NOVERTA", LEFT, 60, { characterSpacing: 4 });
  doc.fontSize(9).font("Helvetica").fillColor("#d1fae5")
    .text("Special Education Compliance Platform", LEFT, 78);

  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(28)
    .text("Pilot Readout", LEFT, 120, { width: PAGE_W });
  doc.fontSize(13).font("Helvetica").fillColor("#ecfdf5")
    .text(data.district.name, LEFT, 158, { width: PAGE_W });

  const pilotRange = data.pilotStart
    ? `${fmtDateLong(data.pilotStart)} – ${fmtDateLong(data.pilotEndOrToday)}`
    : `As of ${fmtDateLong(data.pilotEndOrToday)}`;
  doc.fontSize(10).fillColor("#a7f3d0")
    .text(`Pilot window: ${pilotRange}`, LEFT, 184, { width: PAGE_W });

  // Sample data banner (demo districts only)
  if (data.district.isDemo) {
    doc.rect(0, 220, 612, 24).fill("#fef3c7");
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#92400e")
      .text("SAMPLE DATA — NOT REAL STUDENT RECORDS", LEFT, 229, { width: 492, align: "center" });
  }

  // Headline metric below the cover band
  doc.fillColor(GRAY_DARK).font("Helvetica").fontSize(10);
  doc.y = 260;
  const headline = (() => {
    const b = data.baseline;
    const c = data.current;
    if (!b) return null;
    const recovered = Math.max(0, b.exposureDollars - c.exposureDollars);
    const compEdReduced = Math.max(0, b.compEdMinutesOutstanding - c.compEdMinutesOutstanding);
    return { recovered, compEdReduced };
  })();

  if (headline) {
    doc.fontSize(10).font("Helvetica").fillColor(GRAY_MID)
      .text("Bottom line", LEFT, doc.y, { characterSpacing: 1.2 });
    doc.moveDown(0.2);
    doc.fontSize(15).font("Helvetica-Bold").fillColor(GRAY_DARK)
      .text(
        `${fmtMoney(headline.recovered)} of compensatory exposure surfaced and addressed during the pilot, with ${fmtNum(headline.compEdReduced)} comp-ed minutes worked down.`,
        LEFT, doc.y, { width: PAGE_W, lineGap: 4 },
      );
    doc.moveDown(0.6);
    doc.fontSize(10).font("Helvetica").fillColor(GRAY_MID)
      .text(
        `Generated ${fmtDateLong(new Date().toISOString())} for ${data.district.name}. The numbers on the following pages are pulled live from your Noverta instance.`,
        LEFT, doc.y, { width: PAGE_W, lineGap: 2 },
      );
  } else {
    doc.fontSize(11).font("Helvetica").fillColor(GRAY_MID)
      .text(
        "No pre-Noverta baseline was captured for this district, so this readout shows current-state metrics only.",
        LEFT, doc.y, { width: PAGE_W },
      );
  }

  // ── Page 2: Wedge metric comparison table ─────────────────────────────────
  doc.addPage();
  sectionHeader(doc, "Wedge metrics: baseline vs. today");

  const rows: Array<{
    label: string;
    baseline: number | null;
    current: number | null;
    lowerIsBetter: boolean;
    fmt: (n: number) => string;
  }> = [
    {
      label: "Service-minute compliance",
      baseline: data.baseline?.compliancePercent ?? null,
      current: data.current.compliancePercent,
      lowerIsBetter: false,
      fmt: (n) => `${Math.round(n)} pts`,
    },
    {
      label: "Compensatory exposure (last 30 days)",
      baseline: data.baseline?.exposureDollars ?? null,
      current: data.current.exposureDollars,
      lowerIsBetter: true,
      fmt: (n) => fmtMoney(n).replace(/^[−+]?/, ""),
    },
    {
      label: "Comp-ed minutes outstanding",
      baseline: data.baseline?.compEdMinutesOutstanding ?? null,
      current: data.current.compEdMinutesOutstanding,
      lowerIsBetter: true,
      fmt: (n) => `${fmtNum(n)} min`,
    },
    {
      label: "Overdue evaluations",
      baseline: data.baseline?.overdueEvaluations ?? null,
      current: data.current.overdueEvaluations,
      lowerIsBetter: true,
      fmt: (n) => fmtNum(n),
    },
    {
      label: "IEPs expiring in next 60 days",
      baseline: data.baseline?.expiringIepsNext60 ?? null,
      current: data.current.expiringIepsNext60,
      lowerIsBetter: true,
      fmt: (n) => fmtNum(n),
    },
  ];

  // Table header
  const colX = { metric: LEFT, day0: LEFT + 220, today: LEFT + 320, change: LEFT + 410 };
  doc.rect(LEFT, doc.y, PAGE_W, 18).fill("#ecfdf5");
  const headerY = doc.y + 5;
  doc.fillColor(EMERALD).font("Helvetica-Bold").fontSize(8.5);
  doc.text("METRIC", colX.metric + 6, headerY);
  doc.text("DAY 0", colX.day0, headerY, { width: 90, align: "right" });
  doc.text("TODAY", colX.today, headerY, { width: 90, align: "right" });
  doc.text("CHANGE", colX.change, headerY, { width: PAGE_W - (colX.change - LEFT), align: "right" });
  doc.y += 22;

  for (const r of rows) {
    const yStart = doc.y;
    doc.font("Helvetica").fontSize(10).fillColor(GRAY_DARK)
      .text(r.label, colX.metric, yStart, { width: colX.day0 - colX.metric - 8 });
    doc.font("Helvetica").fontSize(10).fillColor(GRAY_MID)
      .text(r.baseline == null ? "—" : r.fmt(r.baseline), colX.day0, yStart, { width: 90, align: "right" });
    doc.font("Helvetica-Bold").fontSize(10).fillColor(GRAY_DARK)
      .text(r.current == null ? "—" : r.fmt(r.current), colX.today, yStart, { width: 90, align: "right" });
    const d = deltaLabel(r.baseline, r.current, r.lowerIsBetter, r.fmt);
    doc.font("Helvetica").fontSize(10).fillColor(d.color)
      .text(d.text, colX.change, yStart, { width: PAGE_W - (colX.change - LEFT), align: "right" });
    doc.y = Math.max(doc.y, yStart + 18);
    doc.moveTo(LEFT, doc.y).lineTo(LEFT + PAGE_W, doc.y).strokeColor("#f3f4f6").lineWidth(0.5).stroke();
    doc.y += 4;
  }

  // ── Section: Missed-session financial exposure recovery ───────────────────
  sectionHeader(doc, "Missed-session financial exposure");
  const exposureBaseline = data.baseline?.exposureDollars ?? null;
  const exposureNow = data.current.exposureDollars;
  const recovered = exposureBaseline != null ? Math.max(0, exposureBaseline - exposureNow) : null;
  paragraph(doc,
    `At the start of the pilot, Noverta surfaced ${fmtMoney(exposureBaseline)} of compensatory-education exposure from undelivered mandated minutes in the trailing 30 days. ` +
    `As of ${fmtDateLong(data.pilotEndOrToday)}, that figure stands at ${fmtMoney(exposureNow)}.`,
  );
  if (recovered != null && recovered > 0) {
    bullet(doc, `Exposure recovered: ${fmtMoney(recovered)} (${exposureBaseline! > 0 ? Math.round((recovered / exposureBaseline!) * 100) : 0}% reduction)`);
  } else if (recovered === 0) {
    bullet(doc, "Exposure is flat versus baseline — recovery has not yet shown up in the dollar figure, but underlying minute delivery is being tracked daily.");
  }
  bullet(doc, "Each shortfall is now visible by student and service, so providers and case managers can prioritize make-up sessions before they convert to a comp-ed obligation.");

  // ── Section: Comp-ed minutes flagged & addressed ──────────────────────────
  sectionHeader(doc, "Comp-ed minutes flagged and addressed");
  const compBaseline = data.baseline?.compEdMinutesOutstanding ?? null;
  const compNow = data.current.compEdMinutesOutstanding;
  const compReduced = compBaseline != null ? Math.max(0, compBaseline - compNow) : null;
  paragraph(doc,
    `Outstanding comp-ed minutes started at ${fmtNum(compBaseline)} and currently sit at ${fmtNum(compNow)}.`,
  );
  if (compReduced != null && compReduced > 0) {
    bullet(doc, `Worked down: ${fmtNum(compReduced)} minutes (${compBaseline! > 0 ? Math.round((compReduced / compBaseline!) * 100) : 0}% reduction).`);
  }
  bullet(doc, "Every active obligation now has an owner, a target completion date, and live burndown reporting in Noverta.");

  // ── Section: Adoption stats ───────────────────────────────────────────────
  sectionHeader(doc, "Adoption");
  const adopt = data.adoption;
  const adoptPct = adopt.activeStaffTotal > 0
    ? Math.round((adopt.activeStaffLogging / adopt.activeStaffTotal) * 100)
    : 0;
  bullet(doc, `${adopt.activeStaffLogging} of ${adopt.activeStaffTotal} active providers, case managers, and coordinators logged a session in the last 30 days (${adoptPct}%).`);
  bullet(doc, `${fmtNum(adopt.sessionsLogged30d)} sessions logged in the last 30 days.`);
  if (adopt.sessionsLoggedAllTime > 0) {
    bullet(doc, `${fmtNum(adopt.sessionsLoggedAllTime)} sessions logged across the full pilot window.`);
  }
  bullet(doc, `${fmtNum(adopt.activeStudents)} students with active records in the system.`);

  // ── Page 3: What's next ───────────────────────────────────────────────────
  doc.addPage();
  sectionHeader(doc, "What's next");
  paragraph(doc,
    "The pilot has proven Noverta can surface exposure, structure comp-ed work, and put compliance data in front of the team that owns it. To convert pilot wins into ongoing protection, we recommend:",
  );
  numberedItem(doc, 1,
    "Convert to a full subscription so baseline tracking, comp-ed burndown, and weekly compliance reporting continue without interruption.",
  );
  numberedItem(doc, 2,
    "Roll out the remaining provider, case manager, and paraprofessional accounts so the entire SPED team works from a single source of truth.",
  );
  numberedItem(doc, 3,
    "Enable annual review visibility and DESE-ready exports so end-of-year reporting and audits run themselves, not your team.",
  );
  numberedItem(doc, 4,
    "Schedule the quarterly business review so leadership has a recurring forum to inspect compliance health and surface emerging risk.",
  );

  doc.moveDown(1.2);
  doc.fontSize(9).font("Helvetica-Oblique").fillColor(GRAY_MID)
    .text(
      "Prepared by Noverta. Figures reflect the live state of your Noverta instance at the moment this PDF was generated and may shift as new data is logged.",
      LEFT, doc.y, { width: PAGE_W, align: "left" },
    );

  // Footer with page numbers
  pdfFooters(doc, "Pilot Readout");
}

function sectionHeader(doc: InstanceType<typeof PDFDocument>, title: string): void {
  doc.moveDown(0.6);
  doc.fontSize(13).font("Helvetica-Bold").fillColor(PDF_COLORS.EMERALD).text(title, 60, doc.y);
  doc.moveTo(60, doc.y + 2).lineTo(552, doc.y + 2).strokeColor("#d1fae5").lineWidth(1).stroke();
  doc.moveDown(0.4);
  doc.fontSize(10).font("Helvetica").fillColor(PDF_COLORS.GRAY_DARK);
}

function paragraph(doc: InstanceType<typeof PDFDocument>, text: string): void {
  doc.fontSize(10).font("Helvetica").fillColor(PDF_COLORS.GRAY_DARK)
    .text(text, 60, doc.y, { width: 492, lineGap: 2 });
  doc.moveDown(0.4);
}

function bullet(doc: InstanceType<typeof PDFDocument>, text: string): void {
  const y = doc.y;
  doc.fontSize(10).font("Helvetica-Bold").fillColor(PDF_COLORS.EMERALD)
    .text("•", 64, y, { width: 10 });
  doc.font("Helvetica").fillColor(PDF_COLORS.GRAY_DARK)
    .text(text, 80, y, { width: 472, lineGap: 2 });
  doc.moveDown(0.25);
}

function numberedItem(doc: InstanceType<typeof PDFDocument>, n: number, text: string): void {
  const y = doc.y;
  doc.fontSize(10).font("Helvetica-Bold").fillColor(PDF_COLORS.EMERALD)
    .text(`${n}.`, 64, y, { width: 16 });
  doc.font("Helvetica").fillColor(PDF_COLORS.GRAY_DARK)
    .text(text, 84, y, { width: 468, lineGap: 2 });
  doc.moveDown(0.45);
}

/**
 * GET /api/reports/exports/pilot-readout.pdf
 *
 * One-click ROI readout for the superintendent / director-of-SPED conversion
 * meeting. Pulls baseline and live metrics for the caller's district (or, for
 * platform admins, an explicit ?districtId=) and renders a Noverta-branded PDF.
 */
router.get(
  "/reports/exports/pilot-readout.pdf",
  requireAdminOrPlatformAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const platformAdmin = isPlatformAdminRequest(req);

    // Resolve the target district. Admin/coordinator: their own district.
    // Platform admin (internal support): may target any district via ?districtId.
    let districtId: number | null = null;
    if (platformAdmin) {
      const q = req.query.districtId;
      const parsed = q != null ? parseInt(String(q), 10) : NaN;
      if (Number.isFinite(parsed)) {
        districtId = parsed;
      } else {
        districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
      }
    } else {
      districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
    }

    if (districtId == null) {
      res.status(400).json({ error: "District scope required" });
      return;
    }

    let data: ReadoutData;
    try {
      data = await loadReadoutData(districtId);
    } catch (err) {
      console.error("GET pilot-readout.pdf load error:", err);
      res.status(500).json({ error: "Failed to generate Pilot Readout PDF" });
      return;
    }

    const doc = initPdfDoc();
    res.setHeader("Content-Type", "application/pdf");
    const safeName = `pilot-readout-district-${districtId}.pdf`;
    res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
    doc.pipe(res);

    try {
      renderPdf(doc, data);

      logAudit(req, {
        action: "read",
        targetTable: "pilot_baseline_snapshots",
        targetId: districtId,
        summary: `Generated Pilot Readout PDF for district ${districtId} (${data.district.name})`,
        metadata: {
          reportType: "pilot-readout-pdf",
          districtId,
          districtName: data.district.name,
          isPilot: data.district.isPilot,
          baselineCapturedAt: data.baseline?.capturedAt ?? null,
        },
      });

      doc.end();
    } catch (err) {
      console.error("GET pilot-readout.pdf error:", err);
      if (!res.headersSent) {
        try { doc.end(); } catch {}
        res.status(500).json({ error: "Failed to generate Pilot Readout PDF" });
      } else {
        try { doc.end(); } catch {}
      }
    }
  },
);

export default router;
