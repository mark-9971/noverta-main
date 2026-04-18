import { Router, type Request, type Response } from "express";
import PDFDocument from "pdfkit";
import { db } from "@workspace/db";
import {
  studentsTable, schoolsTable, sessionLogsTable,
  staffTable, compensatoryObligationsTable, districtsTable,
} from "@workspace/db/schema";
import { eq, and, sql, gte, lte, isNull } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { getEnforcedDistrictId } from "../../middlewares/auth";

/** Resolves district for platform admins (via ?districtId query param) and district-scoped users (via token). */
function resolveDistrictId(req: Request): number | null {
  const enforced = getEnforcedDistrictId(req as AuthedRequest);
  if (enforced !== null) return enforced;
  const qd = req.query.districtId;
  if (qd) {
    const n = Number(qd);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}
import { computeAllActiveMinuteProgress } from "../../lib/minuteCalc";
import { getRateMap, minutesToDollars as sharedMinutesToDollars, type RateInfo } from "../compensatoryFinance/shared";
import { logAudit } from "../../lib/auditLog";
import { buildCSV, recordExport, PDF_COLORS, pdfSectionTitle, pdfTableHeader, pdfTableRow, pdfFooters } from "./utils";
import type { BufferedPDFDoc } from "./utils";

const router = Router();

function minutesToDollars(minutes: number, rate: RateInfo): number | null {
  return sharedMinutesToDollars(minutes, rate);
}

function riskLabel(status: string): string {
  switch (status) {
    case "out_of_compliance": return "Out of Compliance";
    case "at_risk": return "At Risk";
    case "slightly_behind": return "Slightly Behind";
    case "on_track": return "On Track";
    case "completed": return "Completed";
    default: return status;
  }
}

function getWeekRange(weeksAgo: number): { start: string; end: string; label: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday - weeksAgo * 7);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const short = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return { start: fmt(monday), end: fmt(sunday), label: `${short(monday)} – ${short(sunday)}` };
}

interface ReportData {
  meta: {
    districtName: string;
    generatedAt: string;
    currentWeek: string;
    weekStart: string;
    weekEnd: string;
    schoolFilter: number | null;
  };
  summary: {
    totalStudents: number;
    totalRequiredMinutes: number;
    totalDeliveredMinutes: number;
    totalShortfallMinutes: number;
    overallComplianceRate: number;
    totalCurrentExposure: number;
    existingCompensatoryExposure: number | null;
    existingCompensatoryUnpricedMinutes: number;
    unpricedShortfallMinutes: number;
    unpricedShortfallServiceTypes: string[];
    combinedExposure: number;
    rateConfigNote: string | null;
    riskCounts: { out_of_compliance: number; at_risk: number; slightly_behind: number; on_track: number };
  };
  urgentFlags: string[];
  studentShortfalls: {
    studentId: number; studentName: string; school: string; service: string;
    requiredMinutes: number; deliveredMinutes: number; shortfallMinutes: number;
    percentComplete: number; riskStatus: string; riskLabel: string;
    providerName: string; estimatedExposure: number | null; rateConfigured: boolean;
  }[];
  providerSummary: {
    providerName: string; studentsServed: number; totalDelivered: number;
    totalRequired: number; totalShortfall: number; complianceRate: number;
  }[];
  providersWithMissedThisWeek: {
    providerName: string; role: string; completedSessions: number;
    missedSessions: number; deliveredMinutes: number;
  }[];
  weeklyTrend: {
    weekLabel: string; weekStart: string; deliveredMinutes: number;
    completedSessions: number; missedSessions: number; cancelledSessions: number;
  }[];
}

async function computeReportData(districtId: number, schoolId?: number): Promise<ReportData> {
  const currentWeek = getWeekRange(0);
  const weekRanges = Array.from({ length: 8 }, (_, i) => getWeekRange(i)).reverse();

  const [districtRows, progress, rateMap] = await Promise.all([
    db.select({ name: districtsTable.name }).from(districtsTable).where(eq(districtsTable.id, districtId)),
    computeAllActiveMinuteProgress({ districtId, schoolId }),
    getRateMap(districtId),
  ]);

  const districtName = districtRows[0]?.name ?? "District";

  const studentIds = [...new Set(progress.map(p => p.studentId))];
  const schoolMap = new Map<number, { schoolName: string; grade: string }>();
  if (studentIds.length > 0) {
    const studentSchools = await db.select({
      studentId: studentsTable.id,
      schoolName: schoolsTable.name,
      grade: studentsTable.grade,
    }).from(studentsTable)
      .innerJoin(schoolsTable, and(eq(schoolsTable.id, studentsTable.schoolId), eq(schoolsTable.districtId, districtId)))
      .where(sql`${studentsTable.id} IN (${sql.join(studentIds.map(id => sql`${id}`), sql`, `)})`);
    for (const s of studentSchools) {
      schoolMap.set(s.studentId, { schoolName: s.schoolName ?? "", grade: s.grade ?? "" });
    }
  }

  let totalRequired = 0;
  let totalDelivered = 0;
  let totalExposure = 0;
  const uniqueStudents = new Set<number>();

  const studentShortfalls: ReportData["studentShortfalls"] = [];

  const providerMap = new Map<string, {
    providerName: string;
    studentsServed: Set<number>;
    totalDelivered: number;
    totalRequired: number;
    totalShortfall: number;
  }>();

  let unpricedShortfallMinutes = 0;
  const unpricedShortfallServiceTypes = new Set<string>();
  for (const p of progress) {
    const info = schoolMap.get(p.studentId);
    const shortfall = Math.max(0, p.requiredMinutes - p.deliveredMinutes);
    const rates = rateMap.get(p.serviceTypeId);
    const rateInfo: RateInfo = rates?.inHouse ?? { rate: null, source: "unconfigured" };
    // Per-row exposure stays null when the rate is unconfigured; we no longer
    // coerce to 0 here because that would conflate "actually no exposure" with
    // "couldn't be priced" for the JSON consumer.
    const exposureValue: number | null = shortfall > 0 ? minutesToDollars(shortfall, rateInfo) : 0;

    totalRequired += p.requiredMinutes;
    totalDelivered += p.deliveredMinutes;
    if (exposureValue != null) {
      totalExposure += exposureValue;
    } else if (shortfall > 0) {
      unpricedShortfallMinutes += shortfall;
      unpricedShortfallServiceTypes.add(p.serviceTypeName);
    }
    uniqueStudents.add(p.studentId);

    if (shortfall > 0) {
      studentShortfalls.push({
        studentId: p.studentId,
        studentName: p.studentName,
        school: info?.schoolName ?? "",
        service: p.serviceTypeName,
        requiredMinutes: p.requiredMinutes,
        deliveredMinutes: p.deliveredMinutes,
        shortfallMinutes: shortfall,
        percentComplete: p.percentComplete,
        riskStatus: p.riskStatus,
        riskLabel: riskLabel(p.riskStatus),
        providerName: p.providerName ?? "Unassigned",
        estimatedExposure: exposureValue,
        rateConfigured: exposureValue != null,
      });
    }

    const provKey = p.providerName ?? "Unassigned";
    if (!providerMap.has(provKey)) {
      providerMap.set(provKey, { providerName: provKey, studentsServed: new Set(), totalDelivered: 0, totalRequired: 0, totalShortfall: 0 });
    }
    const prov = providerMap.get(provKey)!;
    prov.studentsServed.add(p.studentId);
    prov.totalDelivered += p.deliveredMinutes;
    prov.totalRequired += p.requiredMinutes;
    prov.totalShortfall += shortfall;
  }

  studentShortfalls.sort((a, b) => b.shortfallMinutes - a.shortfallMinutes);

  const providerSummary = Array.from(providerMap.values())
    .map(p => ({
      providerName: p.providerName,
      studentsServed: p.studentsServed.size,
      totalDelivered: p.totalDelivered,
      totalRequired: p.totalRequired,
      totalShortfall: p.totalShortfall,
      complianceRate: p.totalRequired > 0 ? Math.round((p.totalDelivered / p.totalRequired) * 1000) / 10 : 100,
    }))
    .sort((a, b) => a.complianceRate - b.complianceRate);

  const totalShortfall = Math.max(0, totalRequired - totalDelivered);
  const overallComplianceRate = totalRequired > 0 ? Math.round((totalDelivered / totalRequired) * 1000) / 10 : 100;

  const riskCounts = { out_of_compliance: 0, at_risk: 0, slightly_behind: 0, on_track: 0 };
  const studentRisk = new Map<number, string>();
  for (const p of progress) {
    const current = studentRisk.get(p.studentId);
    const order = ["out_of_compliance", "at_risk", "slightly_behind", "on_track", "completed"];
    if (!current || order.indexOf(p.riskStatus) < order.indexOf(current)) {
      studentRisk.set(p.studentId, p.riskStatus);
    }
  }
  for (const [, status] of studentRisk) {
    if (status in riskCounts) riskCounts[status as keyof typeof riskCounts]++;
  }

  const eightWeeksAgo = weekRanges[0].start;
  const schoolJoinCondition = schoolId
    ? and(
        eq(studentsTable.schoolId, schoolsTable.id),
        eq(schoolsTable.districtId, districtId),
        eq(schoolsTable.id, schoolId),
      )
    : and(
        eq(studentsTable.schoolId, schoolsTable.id),
        eq(schoolsTable.districtId, districtId),
      );

  const weeklySessionData = await db
    .select({
      week: sql<string>`to_char(date_trunc('week', ${sessionLogsTable.sessionDate}::date), 'YYYY-MM-DD')`.as("week"),
      deliveredMinutes: sql<number>`coalesce(sum(case when ${sessionLogsTable.status} = 'completed' then ${sessionLogsTable.durationMinutes} else 0 end), 0)`,
      completedSessions: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'completed')`,
      missedSessions: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'missed')`,
      cancelledSessions: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'cancelled')`,
    })
    .from(sessionLogsTable)
    .innerJoin(studentsTable, eq(sessionLogsTable.studentId, studentsTable.id))
    .innerJoin(schoolsTable, schoolJoinCondition!)
    .where(and(gte(sessionLogsTable.sessionDate, eightWeeksAgo), isNull(sessionLogsTable.deletedAt)))
    .groupBy(sql`date_trunc('week', ${sessionLogsTable.sessionDate}::date)`)
    .orderBy(sql`date_trunc('week', ${sessionLogsTable.sessionDate}::date)`);

  const weeklyMap = new Map(weeklySessionData.map(w => [w.week, w]));
  const weeklyTrend = weekRanges.map(wr => {
    const d = weeklyMap.get(wr.start);
    return {
      weekLabel: wr.label,
      weekStart: wr.start,
      deliveredMinutes: Number(d?.deliveredMinutes ?? 0),
      completedSessions: Number(d?.completedSessions ?? 0),
      missedSessions: Number(d?.missedSessions ?? 0),
      cancelledSessions: Number(d?.cancelledSessions ?? 0),
    };
  });

  const currentWeekProviders = await db
    .select({
      staffId: staffTable.id,
      providerName: sql<string>`${staffTable.firstName} || ' ' || ${staffTable.lastName}`,
      role: staffTable.role,
      completedSessions: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'completed')`,
      missedSessions: sql<number>`count(*) filter (where ${sessionLogsTable.status} = 'missed')`,
      deliveredMinutes: sql<number>`coalesce(sum(case when ${sessionLogsTable.status} = 'completed' then ${sessionLogsTable.durationMinutes} else 0 end), 0)`,
    })
    .from(sessionLogsTable)
    .innerJoin(staffTable, eq(sessionLogsTable.staffId, staffTable.id))
    .innerJoin(studentsTable, eq(sessionLogsTable.studentId, studentsTable.id))
    .innerJoin(schoolsTable, schoolJoinCondition!)
    .where(and(
      gte(sessionLogsTable.sessionDate, currentWeek.start),
      lte(sessionLogsTable.sessionDate, currentWeek.end),
      isNull(sessionLogsTable.deletedAt),
    ))
    .groupBy(staffTable.id, staffTable.firstName, staffTable.lastName, staffTable.role)
    .orderBy(sql`count(*) filter (where ${sessionLogsTable.status} = 'missed') desc`);

  const providersWithMissed = currentWeekProviders
    .filter(p => Number(p.missedSessions) > 0)
    .map(p => ({
      providerName: p.providerName,
      role: p.role ?? "",
      completedSessions: Number(p.completedSessions),
      missedSessions: Number(p.missedSessions),
      deliveredMinutes: Number(p.deliveredMinutes),
    }));

  const urgentFlags: string[] = [];
  if (riskCounts.out_of_compliance > 0) {
    urgentFlags.push(`${riskCounts.out_of_compliance} student${riskCounts.out_of_compliance > 1 ? "s" : ""} out of compliance — review compensatory obligations`);
  }
  if (riskCounts.at_risk > 0) {
    urgentFlags.push(`${riskCounts.at_risk} student${riskCounts.at_risk > 1 ? "s" : ""} at risk of non-compliance — schedule make-up sessions`);
  }
  if (providersWithMissed.length > 0) {
    const totalMissed = providersWithMissed.reduce((s, p) => s + p.missedSessions, 0);
    urgentFlags.push(`${totalMissed} missed session${totalMissed > 1 ? "s" : ""} this week across ${providersWithMissed.length} provider${providersWithMissed.length > 1 ? "s" : ""}`);
  }
  if (totalExposure > 5000) {
    urgentFlags.push(`Estimated compensatory exposure exceeds $${Math.round(totalExposure / 1000)}K — review with legal/finance`);
  }
  const recentTrend = weeklyTrend.slice(-4);
  if (recentTrend.length >= 3) {
    const decreasing = recentTrend.every((w, i) => i === 0 || w.deliveredMinutes <= recentTrend[i - 1].deliveredMinutes);
    if (decreasing && recentTrend[0].deliveredMinutes > 0) {
      urgentFlags.push("Delivered minutes declining for 3+ consecutive weeks — investigate staffing/scheduling");
    }
  }

  const compObligationConditions = [
    eq(compensatoryObligationsTable.status, "pending"),
    eq(schoolsTable.districtId, districtId),
  ];
  if (schoolId) compObligationConditions.push(eq(schoolsTable.id, schoolId) as any);

  const outstandingObligations = await db.select({
    minutesOwed: compensatoryObligationsTable.minutesOwed,
    minutesDelivered: compensatoryObligationsTable.minutesDelivered,
  }).from(compensatoryObligationsTable)
    .innerJoin(studentsTable, eq(studentsTable.id, compensatoryObligationsTable.studentId))
    .innerJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
    .where(and(...compObligationConditions));

  // Existing compensatory obligations are not joined to a service type here,
  // so we do NOT fabricate a dollar exposure with a default rate. Surface
  // unpriced minutes separately.
  let existingCompUnpricedMinutes = 0;
  for (const ob of outstandingObligations) {
    const remaining = (ob.minutesOwed ?? 0) - (ob.minutesDelivered ?? 0);
    if (remaining > 0) existingCompUnpricedMinutes += remaining;
  }
  const existingCompExposure: number | null = null;

  const today = new Date();

  return {
    meta: {
      districtName,
      generatedAt: today.toISOString(),
      currentWeek: currentWeek.label,
      weekStart: currentWeek.start,
      weekEnd: currentWeek.end,
      schoolFilter: schoolId ?? null,
    },
    summary: {
      totalStudents: uniqueStudents.size,
      totalRequiredMinutes: totalRequired,
      totalDeliveredMinutes: totalDelivered,
      totalShortfallMinutes: totalShortfall,
      overallComplianceRate,
      totalCurrentExposure: totalExposure,
      existingCompensatoryExposure: existingCompExposure,
      existingCompensatoryUnpricedMinutes: existingCompUnpricedMinutes,
      unpricedShortfallMinutes,
      unpricedShortfallServiceTypes: [...unpricedShortfallServiceTypes],
      combinedExposure: Math.round(totalExposure * 100) / 100,
      rateConfigNote:
        unpricedShortfallMinutes > 0 || existingCompUnpricedMinutes > 0
          ? "Some service types do not have a configured hourly rate. Their minutes are reported but excluded from dollar exposure totals. Configure rates in Settings → Compensatory Finance → Rates."
          : null,
      riskCounts,
    },
    urgentFlags,
    studentShortfalls: studentShortfalls.slice(0, 25),
    providerSummary,
    providersWithMissedThisWeek: providersWithMissed,
    weeklyTrend,
  };
}

router.get("/reports/weekly-compliance-summary", async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = resolveDistrictId(req);
    if (!districtId) {
      res.status(403).json({ error: "District context required" });
      return;
    }

    const rawSchoolId = req.query.schoolId ? Number(req.query.schoolId) : undefined;
    if (rawSchoolId !== undefined && (!Number.isInteger(rawSchoolId) || rawSchoolId <= 0)) {
      res.status(400).json({ error: "Invalid schoolId parameter" });
      return;
    }

    const report = await computeReportData(districtId, rawSchoolId);

    logAudit(req, {
      action: "read",
      targetTable: "service_requirements",
      summary: `Generated weekly compliance summary (${report.summary.totalStudents} students, week of ${report.meta.weekStart})`,
      metadata: { reportType: "weekly-compliance-summary" },
    });

    res.json(report);
  } catch (e: any) {
    console.error("GET /reports/weekly-compliance-summary error:", e);
    res.status(500).json({ error: "Failed to generate weekly compliance summary" });
  }
});

router.get("/reports/weekly-compliance-summary.pdf", async (req: Request, res: Response): Promise<void> => {
  let doc: InstanceType<typeof PDFDocument> | null = null;
  let piped = false;
  try {
    const districtId = resolveDistrictId(req);
    if (!districtId) { res.status(403).json({ error: "District context required" }); return; }

    const rawSchoolId = req.query.schoolId ? Number(req.query.schoolId) : undefined;
    if (rawSchoolId !== undefined && (!Number.isInteger(rawSchoolId) || rawSchoolId <= 0)) {
      res.status(400).json({ error: "Invalid schoolId parameter" }); return;
    }

    const report = await computeReportData(districtId, rawSchoolId);
    const s = report.summary;
    const genDate = new Date(report.meta.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const PAGE_W = 492;

    doc = new PDFDocument({ size: "LETTER", margins: { top: 50, bottom: 60, left: 60, right: 60 }, bufferPages: true });

    res.setHeader("Content-Type", "application/pdf");
    const fileName = `Weekly_Compliance_Summary_${report.meta.weekStart}.pdf`;
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    doc.pipe(res);
    piped = true;

    const ROW_PAD = 4;
    const MIN_ROW_H = 14;
    function estimateRowH(cells: { text: string; width: number }[]): number {
      let maxH = MIN_ROW_H;
      for (const c of cells) {
        const h = doc!.fontSize(8.5).font("Helvetica").heightOfString(c.text, { width: c.width }) + ROW_PAD;
        if (h > maxH) maxH = h;
      }
      return Math.ceil(maxH);
    }

    doc.rect(60, 36, PAGE_W, 24).fill("#f0fdf4");
    doc.fontSize(8).font("Helvetica").fillColor(PDF_COLORS.GRAY_MID)
      .text("[District Logo]", 66, 42, { width: 80 });
    doc.fontSize(8).font("Helvetica").fillColor(PDF_COLORS.GRAY_MID)
      .text("Prepared for district leadership", 340, 42, { width: 212, align: "right" });
    doc.y = 68;

    doc.fontSize(18).font("Helvetica-Bold").fillColor(PDF_COLORS.GRAY_DARK)
      .text("Weekly SPED Compliance Summary", { align: "center" });
    doc.moveDown(0.15);
    doc.fontSize(11).font("Helvetica").fillColor(PDF_COLORS.EMERALD)
      .text(report.meta.districtName, { align: "center" });
    doc.moveDown(0.1);
    doc.fontSize(9).font("Helvetica").fillColor(PDF_COLORS.GRAY_MID)
      .text(`Week of ${report.meta.currentWeek}  (${report.meta.weekStart} to ${report.meta.weekEnd})`, { align: "center" });
    doc.moveDown(0.1);
    doc.fontSize(8).fillColor(PDF_COLORS.GRAY_MID)
      .text(`Generated: ${genDate}`, { align: "center" });
    if (report.meta.schoolFilter) {
      doc.moveDown(0.1);
      doc.fontSize(8).fillColor(PDF_COLORS.GRAY_MID)
        .text(`Filtered by School ID: ${report.meta.schoolFilter}`, { align: "center" });
    }
    doc.moveDown(0.3);
    doc.moveTo(60, doc.y).lineTo(552, doc.y).strokeColor(PDF_COLORS.EMERALD).lineWidth(1.5).stroke();
    doc.moveDown(0.4);

    const statBoxW = 115;
    const statGap = 8;
    const statStartX = 60;
    const statY = doc.y;
    const statBoxH = 50;
    const stats = [
      { label: "REQUIRED MINUTES", value: s.totalRequiredMinutes.toLocaleString(), detail: `${s.totalStudents} students`, accent: "#3b82f6" },
      { label: "COMPLIANCE RATE", value: `${s.overallComplianceRate}%`, detail: `${s.totalDeliveredMinutes.toLocaleString()} delivered`, accent: s.overallComplianceRate >= 90 ? PDF_COLORS.EMERALD : s.overallComplianceRate >= 75 ? "#f59e0b" : "#ef4444" },
      { label: "TOTAL SHORTFALL", value: `${s.totalShortfallMinutes.toLocaleString()} min`, detail: `${s.riskCounts.out_of_compliance} non-compliant, ${s.riskCounts.at_risk} at risk`, accent: "#ef4444" },
      {
        label: "EST. EXPOSURE",
        value: `$${s.combinedExposure.toLocaleString()}`,
        detail: s.unpricedShortfallMinutes > 0 || s.existingCompensatoryUnpricedMinutes > 0
          ? `Current $${s.totalCurrentExposure.toLocaleString()} · ${(s.unpricedShortfallMinutes + s.existingCompensatoryUnpricedMinutes).toLocaleString()} min unpriced`
          : `Current $${s.totalCurrentExposure.toLocaleString()}`,
        accent: "#ef4444",
      },
    ];
    for (let i = 0; i < stats.length; i++) {
      const x = statStartX + i * (statBoxW + statGap);
      doc.rect(x, statY, statBoxW, statBoxH).fillAndStroke("#f9fafb", "#e5e7eb");
      doc.rect(x, statY, 3, statBoxH).fill(stats[i].accent);
      doc.fontSize(6.5).font("Helvetica-Bold").fillColor(PDF_COLORS.GRAY_MID)
        .text(stats[i].label, x + 8, statY + 6, { width: statBoxW - 14 });
      doc.fontSize(15).font("Helvetica-Bold").fillColor(PDF_COLORS.GRAY_DARK)
        .text(stats[i].value, x + 8, statY + 17, { width: statBoxW - 14 });
      doc.fontSize(6.5).font("Helvetica").fillColor(PDF_COLORS.GRAY_MID)
        .text(stats[i].detail, x + 8, statY + 36, { width: statBoxW - 14 });
    }
    doc.y = statY + statBoxH + 10;

    if (report.urgentFlags.length > 0) {
      doc.rect(60, doc.y, PAGE_W, 12 + report.urgentFlags.length * 12).fillAndStroke("#fef2f2", "#fecaca");
      const ufY = doc.y + 5;
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#991b1b")
        .text("URGENT FLAGS REQUIRING INTERVENTION", 68, ufY);
      let flagY = ufY + 13;
      for (const flag of report.urgentFlags) {
        doc.fontSize(7.5).font("Helvetica").fillColor("#7f1d1d")
          .text(`\u2022  ${flag}`, 72, flagY, { width: PAGE_W - 20 });
        flagY += 12;
      }
      doc.y = flagY + 4;
    }

    if (report.studentShortfalls.length > 0) {
      pdfSectionTitle(doc, `Students with Highest Shortfalls (${report.studentShortfalls.length})`);

      const sCols = [
        { text: "Student", width: 90 },
        { text: "School", width: 72 },
        { text: "Service", width: 68 },
        { text: "Required", width: 42 },
        { text: "Delivered", width: 42 },
        { text: "Shortfall", width: 42 },
        { text: "Risk", width: 60 },
        { text: "Exposure", width: 42 },
        { text: "Provider", width: 78 },
      ];
      pdfTableHeader(doc, sCols);

      for (let si = 0; si < report.studentShortfalls.length; si++) {
        const r = report.studentShortfalls[si];
        const rowData = [
          { text: r.studentName, width: 90 },
          { text: r.school, width: 72 },
          { text: r.service, width: 68 },
          { text: r.requiredMinutes.toLocaleString(), width: 42, align: "right" as const },
          { text: r.deliveredMinutes.toLocaleString(), width: 42, align: "right" as const },
          { text: r.shortfallMinutes.toLocaleString(), width: 42, align: "right" as const, bold: true },
          { text: r.riskLabel, width: 60 },
          { text: r.estimatedExposure == null ? "rate not set" : (r.estimatedExposure > 0 ? `$${r.estimatedExposure.toLocaleString()}` : "\u2014"), width: 42, align: "right" as const },
          { text: r.providerName, width: 78 },
        ];
        const rh = estimateRowH(rowData);
        if (doc.y + rh > 720) { doc.addPage(); doc.y = 50; pdfTableHeader(doc, sCols); }
        const rowY = doc.y;
        if (si % 2 === 0) doc.rect(60, rowY - 2, PAGE_W, rh).fill("#fafafa");
        pdfTableRow(doc, rowData, rowY);
        doc.y = rowY + rh;
      }
    } else {
      pdfSectionTitle(doc, "Students with Highest Shortfalls");
      doc.fontSize(9).font("Helvetica").fillColor(PDF_COLORS.GRAY_MID)
        .text("No students with shortfalls during this period.", { indent: 4 });
      doc.moveDown(0.3);
    }

    if (report.providersWithMissedThisWeek.length > 0) {
      if (doc.y > 650) doc.addPage();
      pdfSectionTitle(doc, `Providers with Missed Sessions This Week (${report.providersWithMissedThisWeek.length})`);

      const mCols = [
        { text: "Provider", width: 140 },
        { text: "Role", width: 90 },
        { text: "Completed", width: 72 },
        { text: "Missed", width: 72 },
        { text: "Minutes Delivered", width: 90 },
      ];
      pdfTableHeader(doc, mCols);

      for (let i = 0; i < report.providersWithMissedThisWeek.length; i++) {
        const r = report.providersWithMissedThisWeek[i];
        const cells = [
          { text: r.providerName, width: 140 },
          { text: r.role, width: 90 },
          { text: r.completedSessions.toString(), width: 72, align: "right" as const },
          { text: r.missedSessions.toString(), width: 72, align: "right" as const, bold: true },
          { text: r.deliveredMinutes.toLocaleString(), width: 90, align: "right" as const },
        ];
        const rh = estimateRowH(cells);
        if (doc.y + rh > 720) { doc.addPage(); doc.y = 50; pdfTableHeader(doc, mCols); }
        const rowY = doc.y;
        if (i % 2 === 0) doc.rect(60, rowY - 2, PAGE_W, rh).fill("#fafafa");
        pdfTableRow(doc, cells, rowY);
        doc.y = rowY + rh;
      }
    }

    if (doc.y > 580) doc.addPage();
    pdfSectionTitle(doc, `Provider Delivery Summary (${report.providerSummary.length})`);

    if (report.providerSummary.length > 0) {
      const pCols = [
        { text: "Provider", width: 130 },
        { text: "Students", width: 52 },
        { text: "Required", width: 68 },
        { text: "Delivered", width: 68 },
        { text: "Shortfall", width: 68 },
        { text: "Compliance", width: 68 },
      ];
      pdfTableHeader(doc, pCols);

      for (let i = 0; i < report.providerSummary.length; i++) {
        const r = report.providerSummary[i];
        const cells = [
          { text: r.providerName, width: 130 },
          { text: r.studentsServed.toString(), width: 52, align: "right" as const },
          { text: r.totalRequired.toLocaleString(), width: 68, align: "right" as const },
          { text: r.totalDelivered.toLocaleString(), width: 68, align: "right" as const },
          { text: r.totalShortfall > 0 ? r.totalShortfall.toLocaleString() : "\u2014", width: 68, align: "right" as const, bold: r.totalShortfall > 0 },
          { text: `${r.complianceRate.toFixed(1)}%`, width: 68, align: "right" as const },
        ];
        const rh = estimateRowH(cells);
        if (doc.y + rh > 720) { doc.addPage(); doc.y = 50; pdfTableHeader(doc, pCols); }
        const rowY = doc.y;
        if (i % 2 === 0) doc.rect(60, rowY - 2, PAGE_W, rh).fill("#fafafa");
        pdfTableRow(doc, cells, rowY);
        doc.y = rowY + rh;
      }
    } else {
      doc.fontSize(9).font("Helvetica").fillColor(PDF_COLORS.GRAY_MID)
        .text("No provider data available for this period.", { indent: 4 });
      doc.moveDown(0.3);
    }

    if (doc.y > 580) doc.addPage();
    pdfSectionTitle(doc, "8-Week Delivery Trend");

    if (report.weeklyTrend.length > 0) {
      const tCols = [
        { text: "Week", width: 130 },
        { text: "Delivered Min", width: 80 },
        { text: "Completed", width: 80 },
        { text: "Missed", width: 80 },
        { text: "Cancelled", width: 80 },
      ];
      pdfTableHeader(doc, tCols);

      for (let i = 0; i < report.weeklyTrend.length; i++) {
        const w = report.weeklyTrend[i];
        const rowY = doc.y;
        const isCurrent = i === report.weeklyTrend.length - 1;
        if (isCurrent) {
          doc.rect(60, rowY - 2, PAGE_W, 13).fill("#ecfdf5");
        } else if (i % 2 === 0) {
          doc.rect(60, rowY - 2, PAGE_W, 13).fill("#fafafa");
        }
        pdfTableRow(doc, [
          { text: w.weekLabel + (isCurrent ? " (current)" : ""), width: 130, bold: isCurrent },
          { text: w.deliveredMinutes.toLocaleString(), width: 80, align: "right" },
          { text: w.completedSessions.toString(), width: 80, align: "right" },
          { text: w.missedSessions.toString(), width: 80, align: "right" },
          { text: w.cancelledSessions.toString(), width: 80, align: "right" },
        ], rowY);
        doc.y = rowY + 14;
      }
    } else {
      doc.fontSize(9).font("Helvetica").fillColor(PDF_COLORS.GRAY_MID)
        .text("No session data available for the past 8 weeks.", { indent: 4 });
      doc.moveDown(0.3);
    }

    doc.moveDown(1);
    doc.moveTo(60, doc.y).lineTo(552, doc.y).strokeColor(PDF_COLORS.GRAY_LIGHT).lineWidth(0.5).stroke();
    doc.moveDown(0.3);
    doc.fontSize(7).font("Helvetica").fillColor(PDF_COLORS.GRAY_MID)
      .text("CONFIDENTIAL — Contains Protected Student Information (FERPA)", { align: "center" });
    doc.moveDown(0.15);
    doc.fontSize(7).font("Helvetica").fillColor(PDF_COLORS.GRAY_MID)
      .text("This document is intended for authorized school personnel only. Do not distribute without proper authorization.", { align: "center" });

    pdfFooters(doc, "Weekly SPED Compliance Summary");

    logAudit(req, {
      action: "read",
      targetTable: "service_requirements",
      summary: `Exported weekly compliance summary PDF (${report.summary.totalStudents} students, week of ${report.meta.weekStart})`,
      metadata: { reportType: "weekly-compliance-summary", format: "pdf" },
    });
    recordExport(req, { reportType: "weekly-compliance-summary", reportLabel: "Weekly Compliance Summary", format: "pdf", fileName, recordCount: report.studentShortfalls.length });

    doc.end();
  } catch (e: any) {
    console.error("GET /reports/weekly-compliance-summary.pdf error:", e);
    if (piped) {
      try { doc?.end(); } catch {}
    } else if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate PDF export" });
    }
  }
});

router.get("/reports/weekly-compliance-summary.csv", async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = resolveDistrictId(req);
    if (!districtId) { res.status(403).json({ error: "District context required" }); return; }

    const rawSchoolId = req.query.schoolId ? Number(req.query.schoolId) : undefined;
    if (rawSchoolId !== undefined && (!Number.isInteger(rawSchoolId) || rawSchoolId <= 0)) {
      res.status(400).json({ error: "Invalid schoolId parameter" }); return;
    }
    const schoolId = rawSchoolId;

    const progress = await computeAllActiveMinuteProgress({ districtId, schoolId });
    const rateMap = await getRateMap(districtId);

    const studentIds = [...new Set(progress.map(p => p.studentId))];
    const schoolMap = new Map<number, string>();
    if (studentIds.length > 0) {
      const studentSchools = await db.select({
        studentId: studentsTable.id,
        schoolName: schoolsTable.name,
      }).from(studentsTable)
        .innerJoin(schoolsTable, and(eq(schoolsTable.id, studentsTable.schoolId), eq(schoolsTable.districtId, districtId)))
        .where(sql`${studentsTable.id} IN (${sql.join(studentIds.map(id => sql`${id}`), sql`, `)})`);
      for (const s of studentSchools) schoolMap.set(s.studentId, s.schoolName ?? "");
    }

    const headers = ["Student", "School", "Service", "Required Minutes", "Delivered Minutes", "Shortfall", "% Complete", "Risk Status", "Provider", "Est. Exposure ($)"];
    const rows = progress
      .filter(p => p.requiredMinutes - p.deliveredMinutes > 0)
      .sort((a, b) => (b.requiredMinutes - b.deliveredMinutes) - (a.requiredMinutes - a.deliveredMinutes))
      .map(p => {
        const shortfall = Math.max(0, p.requiredMinutes - p.deliveredMinutes);
        const rates = rateMap.get(p.serviceTypeId);
        // In-house rate is used for the CSV exposure column. If the service type
        // has no configured in-house rate we emit "RATE NOT CONFIGURED" instead
        // of fabricating a $75/hr default — same contract used by the JSON
        // compliance risk report.
        const exposure = rates?.inHouse?.rate != null
          ? sharedMinutesToDollars(shortfall, rates.inHouse)
          : null;
        return [
          p.studentName,
          schoolMap.get(p.studentId) ?? "",
          p.serviceTypeName,
          p.requiredMinutes,
          p.deliveredMinutes,
          shortfall,
          p.percentComplete,
          riskLabel(p.riskStatus),
          p.providerName ?? "Unassigned",
          exposure != null ? exposure : "RATE NOT CONFIGURED",
        ];
      });

    const csv = buildCSV(headers, rows);
    const fileName = `weekly-compliance-summary-${new Date().toISOString().split("T")[0]}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    logAudit(req, {
      action: "read",
      targetTable: "service_requirements",
      summary: `Exported weekly compliance summary CSV (${rows.length} rows)`,
      metadata: { reportType: "weekly-compliance-summary", format: "csv" },
    });
    recordExport(req, { reportType: "weekly-compliance-summary", reportLabel: "Weekly Compliance Summary", format: "csv", fileName, recordCount: rows.length });

    res.send(csv);
  } catch (e: any) {
    console.error("GET /reports/weekly-compliance-summary.csv error:", e);
    res.status(500).json({ error: "Failed to generate CSV export" });
  }
});

export default router;
