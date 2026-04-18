import {
  db,
  studentsTable,
  schoolsTable,
  districtsTable,
  evaluationReferralsTable,
  evaluationsTable,
  iepDocumentsTable,
} from "@workspace/db";
import { eq, and, isNull, inArray } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { getEnforcedDistrictId, type AuthedRequest } from "../../middlewares/auth";

export type ComplianceStatus = "green" | "yellow" | "red" | "complete";

export interface PhaseStatus {
  startDate: string | null;
  endDate: string | null;
  daysElapsed: number | null;
  daysAllowed: number;
  pctUsed: number | null;
  status: ComplianceStatus;
  breached: boolean;
  breachDate: string | null;
  daysRemaining: number | null;
  useSchoolDays: boolean;
}

export interface Pl2MeetingStatus {
  meetingScheduled: boolean;
  meetingDate: string | null;
  daysToMeeting: number | null;
}

export interface IepTimelineRow {
  studentId: number;
  studentName: string;
  externalId: string | null;
  schoolName: string | null;
  referralId: number | null;
  referralDate: string | null;
  consentDate: string | null;
  evaluationCompletedDate: string | null;
  iepMeetingDate: string | null;
  iepFinalizedDate: string | null;
  phase: "PL1" | "PL2" | "complete" | "pre-consent";
  pl1: PhaseStatus;
  pl2: PhaseStatus;
  pl2Meeting: Pl2MeetingStatus;
  hasActivePl1Breach: boolean;
  hasActivePl2Breach: boolean;
}


const US_FEDERAL_HOLIDAYS: Record<number, string[]> = {
  2023: [
    "2023-01-02","2023-01-16","2023-02-20","2023-05-29","2023-06-19",
    "2023-07-04","2023-09-04","2023-10-09","2023-11-10","2023-11-23","2023-12-25",
  ],
  2024: [
    "2024-01-01","2024-01-15","2024-02-19","2024-05-27","2024-06-19",
    "2024-07-04","2024-09-02","2024-10-14","2024-11-11","2024-11-28","2024-12-25",
  ],
  2025: [
    "2025-01-01","2025-01-20","2025-02-17","2025-05-26","2025-06-19",
    "2025-07-04","2025-09-01","2025-10-13","2025-11-11","2025-11-27","2025-12-25",
  ],
  2026: [
    "2026-01-01","2026-01-19","2026-02-16","2026-05-25","2026-06-19",
    "2026-07-04","2026-09-07","2026-10-12","2026-11-11","2026-11-26","2026-12-25",
  ],
};

const HOLIDAY_SET = new Set(Object.values(US_FEDERAL_HOLIDAYS).flat());

function isSchoolDay(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  if (HOLIDAY_SET.has(dateStr)) return false;
  return true;
}

function countSchoolDaysBetween(fromStr: string, toStr: string): number {
  const from = new Date(fromStr + "T12:00:00Z");
  const to = new Date(toStr + "T12:00:00Z");
  if (to <= from) return 0;
  let count = 0;
  const cur = new Date(from);
  cur.setUTCDate(cur.getUTCDate() + 1);
  while (cur <= to) {
    const dateStr = cur.toISOString().slice(0, 10);
    if (isSchoolDay(dateStr)) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

function calendarDaysBetween(from: string, to: string): number {
  const a = new Date(from + "T12:00:00Z");
  const b = new Date(to + "T12:00:00Z");
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function addCalDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function schoolDayDeadline(startDate: string, daysAllowed: number): string {
  const cur = new Date(startDate + "T12:00:00Z");
  let counted = 0;
  while (counted < daysAllowed) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    if (isSchoolDay(cur.toISOString().slice(0, 10))) counted++;
  }
  return cur.toISOString().slice(0, 10);
}

function computePhase(
  startDate: string | null,
  endDate: string | null,
  daysAllowed: number,
  today: string,
  useSchoolDays: boolean
): PhaseStatus {
  if (!startDate) {
    return {
      startDate,
      endDate: null,
      daysElapsed: null,
      daysAllowed,
      pctUsed: null,
      status: "green",
      breached: false,
      breachDate: null,
      daysRemaining: null,
      useSchoolDays,
    };
  }

  const deadline = useSchoolDays
    ? schoolDayDeadline(startDate, daysAllowed)
    : addCalDays(startDate, daysAllowed);

  const measureDays = useSchoolDays ? countSchoolDaysBetween : calendarDaysBetween;
  const measureTo = endDate ?? today;
  const elapsed = measureDays(startDate, measureTo);
  const pct = elapsed / daysAllowed;
  const daysRemaining = Math.max(0, daysAllowed - elapsed);

  if (endDate) {
    return {
      startDate,
      endDate,
      daysElapsed: elapsed,
      daysAllowed,
      pctUsed: Math.round(pct * 100),
      status: "complete",
      breached: elapsed > daysAllowed,
      breachDate: elapsed > daysAllowed ? deadline : null,
      daysRemaining: 0,
      useSchoolDays,
    };
  }

  let status: ComplianceStatus;
  if (pct >= 1.0) status = "red";
  else if (pct >= 0.8) status = "yellow";
  else status = "green";

  return {
    startDate,
    endDate: null,
    daysElapsed: elapsed,
    daysAllowed,
    pctUsed: Math.round(pct * 100),
    status,
    breached: pct >= 1.0,
    breachDate: pct >= 1.0 ? deadline : null,
    daysRemaining,
    useSchoolDays,
  };
}

function computePreConsentPl1(referralDate: string, today: string): PhaseStatus {
  // Pre-consent: no legal deadline for referral→consent, but track elapsed school
  // days from referral so the dashboard surface aging referrals (not hidden as null).
  const elapsed = countSchoolDaysBetween(referralDate, today);
  const pct = elapsed / 45;
  const status: ComplianceStatus = pct >= 0.8 ? "yellow" : "green";
  return {
    startDate: referralDate,
    endDate: null,
    daysElapsed: elapsed,
    daysAllowed: 45,
    pctUsed: Math.round(pct * 100),
    status,
    breached: false,
    breachDate: null,
    daysRemaining: Math.max(0, 45 - elapsed),
    useSchoolDays: true,
  };
}

export async function computeIepTimelines(
  req: AuthedRequest,
  opts: { schoolId?: number; phase?: "PL1" | "PL2" | "all" }
): Promise<IepTimelineRow[]> {
  const districtId = getEnforcedDistrictId(req);
  const today = new Date().toISOString().slice(0, 10);

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
  if (studentIds.length === 0) return [];

  const referrals = await db
    .select()
    .from(evaluationReferralsTable)
    .where(and(
      inArray(evaluationReferralsTable.studentId, studentIds),
      isNull(evaluationReferralsTable.deletedAt),
    ));

  const referralIds = referrals.map((r) => r.id);
  const evaluations = referralIds.length > 0
    ? await db
        .select()
        .from(evaluationsTable)
        .where(and(
          inArray(evaluationsTable.referralId, referralIds),
          isNull(evaluationsTable.deletedAt),
        ))
    : [];

  const iepDocs = await db
    .select()
    .from(iepDocumentsTable)
    .where(and(
      inArray(iepDocumentsTable.studentId, studentIds),
      eq(iepDocumentsTable.active, true),
    ));

  const evalByReferral = new Map<number, typeof evaluations[0]>();
  for (const ev of evaluations) {
    if (ev.referralId != null) evalByReferral.set(ev.referralId, ev);
  }

  const iepsByStudent = new Map<number, typeof iepDocs>();
  for (const iep of iepDocs) {
    if (!iepsByStudent.has(iep.studentId)) iepsByStudent.set(iep.studentId, []);
    iepsByStudent.get(iep.studentId)!.push(iep);
  }

  const studentMap = new Map(students.map((s) => [s.id, s]));

  const activeReferralByStudent = new Map<number, typeof referrals[0]>();
  for (const ref of referrals) {
    if (ref.status === "open" || ref.status === "in_progress" || ref.status === "in-progress" || ref.status === "evaluation_in_progress") {
      const existing = activeReferralByStudent.get(ref.studentId);
      if (!existing || ref.referralDate > existing.referralDate) {
        activeReferralByStudent.set(ref.studentId, ref);
      }
    }
  }

  const rows: IepTimelineRow[] = [];

  for (const [studentId, ref] of activeReferralByStudent) {
    const stu = studentMap.get(studentId);
    if (!stu) continue;

    const ev = evalByReferral.get(ref.id);
    const evalCompletedDate = ev?.completionDate ?? null;

    // Only consider an IEP as completing PL2 if its start date is on or after
    // the evaluation completion date — this links it to THIS evaluation, not a
    // pre-existing IEP that happens to be active.
    const allStudentIeps = iepsByStudent.get(studentId) ?? [];
    const iep = evalCompletedDate
      ? allStudentIeps
          .filter((d) => d.iepStartDate >= evalCompletedDate)
          .sort((a, b) => a.iepStartDate.localeCompare(b.iepStartDate))[0] ?? null
      : allStudentIeps.sort((a, b) => a.iepStartDate.localeCompare(b.iepStartDate))[0] ?? null;

    const consentDate = ref.consentReceivedDate ?? null;
    const iepMeetingDate = iep?.meetingDate ?? ev?.meetingDate ?? null;
    const iepFinalizedDate = iep?.iepStartDate ?? null;

    // PL1: 45 school days from consent → evaluation completion.
    // Pre-consent: no legal deadline for referral→consent, but show referral aging
    // so the dashboard surfaces stale referrals rather than hiding them as null.
    const pl1 = (!consentDate && ref.referralDate)
      ? computePreConsentPl1(ref.referralDate, today)
      : computePhase(consentDate, evalCompletedDate, 45, today, true);
    const pl2 = computePhase(evalCompletedDate, iepFinalizedDate, 30, today, false);

    const pl2Meeting: Pl2MeetingStatus = {
      meetingScheduled: iepMeetingDate != null,
      meetingDate: iepMeetingDate,
      daysToMeeting: evalCompletedDate && iepMeetingDate
        ? calendarDaysBetween(evalCompletedDate, iepMeetingDate)
        : null,
    };

    let phase: IepTimelineRow["phase"] = "pre-consent";
    if (!consentDate) phase = "pre-consent";
    else if (!evalCompletedDate) phase = "PL1";
    else if (!iepFinalizedDate) phase = "PL2";
    else phase = "complete";

    if (phase === "complete") continue;

    const filterPhase = opts.phase ?? "all";
    if (filterPhase !== "all" && phase !== filterPhase && !(filterPhase === "PL1" && phase === "pre-consent")) continue;

    rows.push({
      studentId,
      studentName: `${stu.lastName}, ${stu.firstName}`,
      externalId: stu.externalId,
      schoolName: stu.schoolName,
      referralId: ref.id,
      referralDate: ref.referralDate,
      consentDate,
      evaluationCompletedDate: evalCompletedDate,
      iepMeetingDate,
      iepFinalizedDate,
      phase,
      pl1,
      pl2,
      pl2Meeting,
      hasActivePl1Breach: pl1.breached && (phase === "PL1" || phase === "pre-consent"),
      hasActivePl2Breach: pl2.breached && phase === "PL2",
    });
  }

  return rows.sort((a, b) => {
    const aDays = (a.phase === "PL1" || a.phase === "pre-consent") ? (a.pl1.daysRemaining ?? 9999) : (a.pl2.daysRemaining ?? 9999);
    const bDays = (b.phase === "PL1" || b.phase === "pre-consent") ? (b.pl1.daysRemaining ?? 9999) : (b.pl2.daysRemaining ?? 9999);
    return aDays - bDays;
  });
}

export function buildCorrectiveActionLetterPdf(
  row: IepTimelineRow,
  adminName: string,
  districtName: string,
  today: string
): Promise<Buffer> {
  if (!row.hasActivePl1Breach && !row.hasActivePl2Breach) {
    return Promise.reject(new Error("No active breach — corrective action letter cannot be generated for a compliant student"));
  }

  return new Promise((resolve, reject) => {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 60, bottom: 72, left: 72, right: 72 } });
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  doc.on("error", reject);

  const DARK = "#111827";
  const GRAY = "#6b7280";
  const RED = "#dc2626";

  const breachedPhase = row.hasActivePl1Breach ? "PL1 — Evaluation (45 school days)" : "PL2 — IEP Development (30 calendar days)";
  const breachDate = row.hasActivePl1Breach ? (row.pl1.breachDate ?? "—") : (row.pl2.breachDate ?? "—");
  const phaseDetail = row.hasActivePl1Breach
    ? `The district had 45 school days from parental consent (${row.consentDate ?? "N/A"}) to complete the evaluation. The deadline was ${breachDate}. The evaluation has not been completed as of ${today} — ${row.pl1.daysElapsed ?? 0} school days have elapsed out of the ${row.pl1.daysAllowed} allowed.`
    : `The district had 30 calendar days from evaluation completion (${row.evaluationCompletedDate ?? "N/A"}) to develop and finalize the IEP. The deadline was ${breachDate}${row.pl2Meeting.meetingScheduled ? `, with an IEP team meeting on ${row.pl2Meeting.meetingDate ?? ""}` : ""}. As of ${today}, ${row.pl2.daysElapsed ?? 0} calendar days have elapsed without an IEP being finalized (${row.pl2.daysAllowed} allowed).`;
  const requiredAction = row.hasActivePl1Breach
    ? "Complete the student's evaluation immediately and convene the IEP Team to review the findings."
    : "Convene the IEP Team meeting and finalize the student's IEP without further delay.";

  doc.fontSize(11).font("Helvetica-Bold").fillColor(DARK)
    .text("CORRECTIVE ACTION LETTER", { align: "center" });
  doc.fontSize(9).font("Helvetica").fillColor(GRAY)
    .text("IEP Timeline Breach — Issued Under 603 CMR 46.00 and M.G.L. c.71B", { align: "center" });
  doc.moveDown(0.5);

  doc.moveTo(72, doc.y).lineTo(540, doc.y).strokeColor("#e5e7eb").stroke();
  doc.moveDown(0.5);

  doc.fontSize(9).font("Helvetica-Bold").fillColor(DARK).text("Date: ", { continued: true })
    .font("Helvetica").text(today);
  doc.font("Helvetica-Bold").text("District: ", { continued: true })
    .font("Helvetica").text(districtName);
  doc.moveDown(0.5);

  doc.rect(72, doc.y, 468, 74).fill("#fef2f2");
  const boxY = doc.y - 74;
  doc.fillColor(DARK).fontSize(9).font("Helvetica-Bold")
    .text("Student:", 80, boxY + 8, { continued: true })
    .font("Helvetica").text(`  ${row.studentName}`);
  doc.font("Helvetica-Bold").text("SASID:", 80, boxY + 22, { continued: true })
    .font("Helvetica").text(`  ${row.externalId ?? "Not on file"}`);
  doc.font("Helvetica-Bold").text("School:", 80, boxY + 36, { continued: true })
    .font("Helvetica").text(`  ${row.schoolName ?? "N/A"}`);
  doc.font("Helvetica-Bold").fillColor(RED).text("Phase in Breach:", 80, boxY + 50, { continued: true })
    .font("Helvetica").text(`  ${breachedPhase}`);
  doc.font("Helvetica-Bold").fillColor(RED).text("Breach Date:", 80, boxY + 64, { continued: true })
    .font("Helvetica").text(`  ${breachDate}`);
  doc.moveDown(0.8);

  doc.fontSize(9.5).font("Helvetica").fillColor(DARK).moveDown(0.2)
    .text("This corrective action letter is issued in accordance with Massachusetts General Laws Chapter 71B and the DESE Special Education Program Review requirements. A timeline breach has been identified for the above-named student.", { lineGap: 3 });
  doc.moveDown(0.6);

  doc.fontSize(9).font("Helvetica-Bold").text("Findings:");
  doc.font("Helvetica").text(phaseDetail, { lineGap: 3 });
  doc.moveDown(0.6);

  doc.font("Helvetica-Bold").text("Required Action:");
  doc.font("Helvetica").text(requiredAction, { lineGap: 3 });
  doc.moveDown(0.6);

  doc.font("Helvetica").fillColor(GRAY).fontSize(8.5)
    .text("This notice must be filed in the student's educational record. The district must take corrective action immediately and document completion. Failure to comply may result in a finding of noncompliance during the DESE Program Review.", { lineGap: 2 });
  doc.moveDown(2);

  doc.moveTo(72, doc.y).lineTo(310, doc.y).strokeColor(DARK).lineWidth(0.5).stroke();
  doc.fontSize(8.5).fillColor(GRAY).text(adminName || "Administrator Signature", 72, doc.y + 4);
  doc.moveDown(2);
  doc.moveTo(72, doc.y).lineTo(220, doc.y).strokeColor(DARK).stroke();
  doc.text("Date", 72, doc.y + 4);

  doc.on("end", () => resolve(Buffer.concat(chunks)));
  doc.end();
  }); // end Promise
}
