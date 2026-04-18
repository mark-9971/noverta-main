import {
  db,
  studentsTable,
  schoolsTable,
  districtsTable,
  restraintIncidentsTable,
} from "@workspace/db";
import { eq, and, isNull, gte, lte, inArray } from "drizzle-orm";
import { getEnforcedDistrictId, type AuthedRequest } from "../../middlewares/auth";
import PDFDocument from "pdfkit";

export interface Restraint30DayWindow {
  studentId: number;
  studentName: string;
  externalId: string | null;
  schoolName: string | null;
  windowStart: string;
  windowEnd: string;
  incidentCount: number;
  physicalCount: number;
  mechanicalCount: number;
  seclCount: number;
  otherCount: number;
  restraintTypesSummary: string;
  parentNotifiedCount: number;
  parentNotificationCompliant: boolean;
  thirtyDayLogSent: boolean;
  incidentDates: string[];
}

export interface Restraint30DayReport {
  windows: Restraint30DayWindow[];
  districtCompliant: boolean;
  totalStudentsWithRestraints: number;
  totalWindows: number;
  nonCompliantWindows: number;
  generatedAt: string;
  dateFrom: string;
  dateTo: string;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function calDaysBetween(fromStr: string, toStr: string): number {
  const a = new Date(fromStr + "T12:00:00Z");
  const b = new Date(toStr + "T12:00:00Z");
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function categorizeRestraintType(type: string | null): "physical" | "mechanical" | "secl" | "other" {
  if (!type) return "other";
  const t = type.toLowerCase();
  if (t.includes("physical") || t.includes("hold") || t.includes("prone") || t.includes("supine") || t.includes("restraint")) return "physical";
  if (t.includes("mechanical")) return "mechanical";
  if (t.includes("seclu") || t.includes("isolation") || t.includes("time-out") || t.includes("timeout")) return "secl";
  return "other";
}

export async function compute30DayWindows(
  req: AuthedRequest,
  opts: { schoolId?: number; dateFrom?: string; dateTo?: string }
): Promise<Restraint30DayReport> {
  const districtId = getEnforcedDistrictId(req);
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = opts.dateFrom ?? addDays(today, -365);
  const dateTo = opts.dateTo ?? today;

  const studentConds = [
    eq(studentsTable.status, "active"),
    isNull(studentsTable.deletedAt),
  ] as ReturnType<typeof eq>[];
  if (opts.schoolId) studentConds.push(eq(studentsTable.schoolId, opts.schoolId));

  const students = await db
    .select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      externalId: studentsTable.externalId,
      schoolId: studentsTable.schoolId,
      schoolName: schoolsTable.name,
      districtId: districtsTable.id,
    })
    .from(studentsTable)
    .leftJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .leftJoin(districtsTable, eq(schoolsTable.districtId, districtsTable.id))
    .where(and(
      ...studentConds,
      districtId != null ? eq(districtsTable.id, districtId) : undefined!,
    ));

  const studentIds = students.map((s) => s.id);
  if (studentIds.length === 0) {
    return { windows: [], districtCompliant: true, totalStudentsWithRestraints: 0, totalWindows: 0, nonCompliantWindows: 0, generatedAt: new Date().toISOString(), dateFrom, dateTo };
  }

  const incidents = await db
    .select()
    .from(restraintIncidentsTable)
    .where(and(
      inArray(restraintIncidentsTable.studentId, studentIds),
      gte(restraintIncidentsTable.incidentDate, dateFrom),
      lte(restraintIncidentsTable.incidentDate, dateTo),
    ))
    .orderBy(restraintIncidentsTable.studentId, restraintIncidentsTable.incidentDate);

  const byStudent = new Map<number, typeof incidents>();
  for (const inc of incidents) {
    if (!byStudent.has(inc.studentId)) byStudent.set(inc.studentId, []);
    byStudent.get(inc.studentId)!.push(inc);
  }

  const studentMap = new Map(students.map((s) => [s.id, s]));
  const windows: Restraint30DayWindow[] = [];

  for (const [studentId, incs] of byStudent) {
    const stu = studentMap.get(studentId)!;
    const sorted = [...incs].sort((a, b) => a.incidentDate.localeCompare(b.incidentDate));

    // Sliding-anchor rolling-window: each window is exactly [anchor, anchor+29].
    // On a multi-incident window, advance anchor to the 2nd incident so the next
    // window overlaps and catches transitively-adjacent pairs (e.g. days 1/20/40
    // produces windows [1,30]→{1,20} and [20,49]→{20,40} — both pairs caught).
    const clusters: Array<typeof sorted> = [];
    let i = 0;
    while (i < sorted.length) {
      const anchor = sorted[i];
      const windowCutoff = addDays(anchor.incidentDate, 29);
      const windowIncs: typeof sorted = [];
      for (let j = i; j < sorted.length && sorted[j].incidentDate <= windowCutoff; j++) {
        windowIncs.push(sorted[j]);
      }
      clusters.push(windowIncs);
      if (windowIncs.length >= 2) {
        // Advance anchor to the SECOND incident in this window (sliding anchor)
        i = sorted.findIndex((inc) => inc === windowIncs[1]);
      } else {
        i += 1;
      }
    }

    for (const clusterIncs of clusters) {
      const windowStart = clusterIncs[0].incidentDate;
      const windowEnd = addDays(windowStart, 29); // strict 30-calendar-day window

      let physicalCount = 0, mechanicalCount = 0, seclCount = 0, otherCount = 0, parentNotifiedCount = 0;
      for (const inc of clusterIncs) {
        const cat = categorizeRestraintType(inc.restraintType ?? inc.incidentType);
        if (cat === "physical") physicalCount++;
        else if (cat === "mechanical") mechanicalCount++;
        else if (cat === "secl") seclCount++;
        else otherCount++;
        if (inc.parentNotified) parentNotifiedCount++;
      }

      const typesSummary: string[] = [];
      if (physicalCount > 0) typesSummary.push(`Physical (${physicalCount})`);
      if (mechanicalCount > 0) typesSummary.push(`Mechanical (${mechanicalCount})`);
      if (seclCount > 0) typesSummary.push(`Seclusion (${seclCount})`);
      if (otherCount > 0) typesSummary.push(`Other (${otherCount})`);

      const logSent = clusterIncs.some((inc) => inc.thirtyDayLogSentToDese);

      windows.push({
        studentId,
        studentName: `${stu.lastName}, ${stu.firstName}`,
        externalId: stu.externalId,
        schoolName: stu.schoolName,
        windowStart,
        windowEnd,
        incidentCount: clusterIncs.length,
        physicalCount,
        mechanicalCount,
        seclCount,
        otherCount,
        restraintTypesSummary: typesSummary.join("; ") || "None",
        parentNotifiedCount,
        parentNotificationCompliant: parentNotifiedCount === clusterIncs.length,
        thirtyDayLogSent: logSent,
        incidentDates: clusterIncs.map((inc) => inc.incidentDate),
      });
    }
  }

  const nonCompliantWindows = windows.filter(
    (w) => !w.parentNotificationCompliant || (w.incidentCount > 1 && !w.thirtyDayLogSent)
  ).length;

  return {
    windows,
    districtCompliant: nonCompliantWindows === 0,
    totalStudentsWithRestraints: byStudent.size,
    totalWindows: windows.length,
    nonCompliantWindows,
    generatedAt: new Date().toISOString(),
    dateFrom,
    dateTo,
  };
}

export function buildRestraint30DayCsv(windows: Restraint30DayWindow[]): string {
  const headers = [
    "Student Name", "SASID", "School", "Window Start", "Window End",
    "Total Incidents", "Physical", "Mechanical", "Seclusion", "Other",
    "Restraint Types", "Parent Notified Count", "Parent Notification Compliant",
    "30-Day Log Sent to DESE", "Incident Dates",
  ];

  function esc(v: string | number | boolean | null | undefined): string {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  const rows = windows.map((w) => [
    esc(w.studentName), esc(w.externalId ?? ""), esc(w.schoolName ?? ""),
    esc(w.windowStart), esc(w.windowEnd), esc(w.incidentCount),
    esc(w.physicalCount), esc(w.mechanicalCount), esc(w.seclCount), esc(w.otherCount),
    esc(w.restraintTypesSummary), esc(w.parentNotifiedCount),
    esc(w.parentNotificationCompliant ? "Yes" : "No"),
    esc(w.thirtyDayLogSent ? "Yes" : "No"),
    esc(w.incidentDates.join(", ")),
  ].join(","));

  return [headers.join(","), ...rows].join("\n");
}

export function buildRestraint30DayPdf(report: Restraint30DayReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 50, bottom: 60, left: 50, right: 50 }, bufferPages: true });
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  doc.on("error", reject);

  const GREEN = "#16a34a";
  const RED = "#dc2626";
  const GRAY = "#6b7280";
  const statusColor = report.districtCompliant ? GREEN : RED;
  const statusLabel = report.districtCompliant ? "COMPLIANT" : "ACTION REQUIRED";

  doc.fontSize(16).font("Helvetica-Bold").text("DESE 30-Day Restraint Aggregate Report");
  doc.fontSize(9).font("Helvetica").fillColor(GRAY)
    .text(`Period: ${report.dateFrom} to ${report.dateTo}   |   Generated: ${new Date(report.generatedAt).toLocaleString()}`);
  doc.moveDown(0.5);

  doc.roundedRect(50, doc.y, 140, 22, 4).fill(statusColor);
  doc.fontSize(10).font("Helvetica-Bold").fillColor("white")
    .text(statusLabel, 58, doc.y - 18, { width: 130, align: "center" });
  doc.moveDown(1.5);

  doc.fillColor("#111");
  const statY = doc.y;
  const stats = [
    { label: "Students with Restraints", value: String(report.totalStudentsWithRestraints) },
    { label: "30-Day Windows", value: String(report.totalWindows) },
    { label: "Non-Compliant Windows", value: String(report.nonCompliantWindows) },
  ];
  stats.forEach((s, i) => {
    const x = 50 + i * 175;
    doc.fontSize(20).font("Helvetica-Bold").fillColor(i === 2 && report.nonCompliantWindows > 0 ? RED : GREEN)
      .text(s.value, x, statY, { width: 160, align: "center" });
    doc.fontSize(8).font("Helvetica").fillColor(GRAY)
      .text(s.label, x, statY + 24, { width: 160, align: "center" });
  });
  doc.moveDown(3.5);

  const COL = [50, 150, 240, 320, 430, 480];
  const tableY = doc.y;
  doc.rect(50, tableY, 510, 16).fill("#f3f4f6");
  doc.fontSize(8).font("Helvetica-Bold").fillColor("#374151");
  const headers = ["Student", "School", "Window", "Incidents / Types", "Parent Notif.", "Status"];
  headers.forEach((h, i) => doc.text(h, COL[i], tableY + 4, { width: i < 5 ? COL[i + 1] - COL[i] - 4 : 80 }));

  let rowY = tableY + 18;
  doc.font("Helvetica").fontSize(7.5).fillColor("#111");

  for (const w of report.windows) {
    const compliant = w.parentNotificationCompliant && (w.incidentCount <= 1 || w.thirtyDayLogSent);
    if (rowY > 680) {
      doc.addPage();
      rowY = 50;
    }
    if (!compliant) {
      doc.rect(50, rowY - 1, 510, 22).fill("#fef2f2");
      doc.fillColor("#111");
    }
    doc.text(w.studentName.slice(0, 20), COL[0], rowY, { width: 95 });
    doc.text((w.schoolName ?? "—").slice(0, 14), COL[1], rowY, { width: 85 });
    doc.text(`${w.windowStart}\n${w.windowEnd}`, COL[2], rowY, { width: 75 });
    doc.text(`${w.incidentCount}x: ${w.restraintTypesSummary.slice(0, 28)}`, COL[3], rowY, { width: 105 });
    doc.text(`${w.parentNotifiedCount}/${w.incidentCount}`, COL[4], rowY, { width: 45 });
    doc.fontSize(9).font("Helvetica-Bold").fillColor(compliant ? GREEN : RED)
      .text(compliant ? "✓" : "✗", COL[5], rowY);
    doc.fontSize(7.5).font("Helvetica").fillColor("#111");
    rowY += 22;
    doc.moveTo(50, rowY - 2).lineTo(560, rowY - 2).strokeColor("#e5e7eb").stroke();
  }

  if (report.windows.length === 0) {
    doc.fontSize(10).fillColor(GRAY).text("No restraint incidents in this period.", 50, rowY + 10, { align: "center", width: 510 });
  }

  const range = (doc as unknown as { bufferedPageRange(): { start: number; count: number } }).bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).fillColor(GRAY).text(
      `DESE 30-Day Restraint Report  |  Page ${i - range.start + 1} of ${range.count}  |  Confidential`,
      50, 740, { align: "center", width: 510 }
    );
  }

  doc.on("end", () => resolve(Buffer.concat(chunks)));
  doc.end();
  }); // end Promise
}
