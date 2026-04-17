/**
 * Forward-looking service-delivery forecast.
 *
 * The existing minuteCalc/cost-avoidance logic is mostly retrospective: it
 * sums what was delivered and projects the trend forward as a straight line.
 * That misses the most common real-world failure mode: a provider is going
 * to be out for the next 3 weeks, the schedule blocks for those weeks have
 * no substitute assigned, and the student will silently fall out of
 * compliance even though they're "on track" today.
 *
 * This forecaster reads the *planned* schedule (schedule_blocks) and
 * subtracts staff_absences whose schedule_block × date is not covered by a
 * substitute (coverage_instances.substitute_staff_id IS NULL or
 * is_covered = false). It then compares the resulting projected minutes to
 * the service requirement and surfaces a remediable risk.
 *
 * Read-only — no writes. Safe to call from any GET route.
 */

import { db } from "@workspace/db";
import {
  serviceRequirementsTable,
  serviceTypesTable,
  studentsTable,
  staffTable,
  schoolsTable,
  scheduleBlocksTable,
  staffAbsencesTable,
  coverageInstancesTable,
  sessionLogsTable,
} from "@workspace/db";
import { and, eq, gte, lte, isNull, inArray, sql } from "drizzle-orm";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export type ForecastRiskStatus =
  | "on_track"
  | "slightly_behind"
  | "at_risk"
  | "out_of_compliance";

export interface AbsenceImpact {
  date: string;             // YYYY-MM-DD
  staffId: number;
  staffName: string | null;
  blockId: number;
  blockMinutes: number;
  absenceType: string;
  isCovered: boolean;       // true = substitute assigned, no minute loss
  substituteStaffId: number | null;
  substituteStaffName: string | null;
}

export interface ServiceForecastRow {
  serviceRequirementId: number;
  studentId: number;
  studentName: string;
  serviceTypeId: number;
  serviceTypeName: string;
  providerId: number | null;
  providerName: string | null;
  intervalType: string;
  intervalStart: string;
  intervalEnd: string;
  horizonStart: string;     // first planned-future date considered
  horizonEnd: string;       // last planned-future date considered
  requiredMinutes: number;
  deliveredMinutes: number;
  // Sum of minutes for planned blocks that are NOT blocked by an
  // uncovered absence (these will probably happen).
  plannedRemainingMinutes: number;
  // Sum of minutes for planned blocks blocked by an uncovered absence
  // (these will probably NOT happen unless someone covers).
  plannedLostMinutes: number;
  projectedMinutes: number; // delivered + plannedRemaining
  projectedShortfallMinutes: number; // max(0, required - projected)
  projectedPercent: number; // projected / required (capped at 100)
  forecastRiskStatus: ForecastRiskStatus;
  // Concrete absences causing the risk — used to suggest remediation.
  absenceImpacts: AbsenceImpact[];
}

export interface ServiceForecastSummary {
  totalRows: number;
  studentsAtRisk: number;
  totalProjectedShortfallMinutes: number;
  byStatus: Record<ForecastRiskStatus, number>;
  // Staff whose absences are causing the most projected loss — useful for
  // "who do I need to find a sub for first" triage.
  topImpactedStaff: Array<{ staffId: number; staffName: string | null; lostMinutes: number; affectedStudents: number }>;
}

export interface ServiceForecastResult {
  rows: ServiceForecastRow[];
  summary: ServiceForecastSummary;
  generatedAt: string;
  horizonWeeks: number;
}

interface ComputeOpts {
  districtId: number;
  horizonWeeks?: number;    // default 4
  studentId?: number;       // narrow to a single student
  staffId?: number;         // narrow to a single staff member
}

function ymd(d: Date): string {
  return d.toISOString().substring(0, 10);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
}
function startOfWeekMonday(d: Date): Date {
  const out = new Date(d);
  const dow = out.getDay();
  out.setDate(out.getDate() - (dow === 0 ? 6 : dow - 1));
  out.setHours(0, 0, 0, 0);
  return out;
}
function endOfWeekSunday(d: Date): Date {
  const start = startOfWeekMonday(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}
function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}
function endOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3 + 3, 0, 23, 59, 59);
}

function intervalForToday(intervalType: string, today: Date): { start: Date; end: Date } {
  if (intervalType === "weekly") return { start: startOfWeekMonday(today), end: endOfWeekSunday(today) };
  if (intervalType === "quarterly") return { start: startOfQuarter(today), end: endOfQuarter(today) };
  // default: monthly
  return { start: startOfMonth(today), end: endOfMonth(today) };
}

function parseHHMMtoMinutes(t: string): number {
  // "HH:MM" or "HH:MM:SS" — best-effort
  const parts = t.split(":");
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function blockMinutes(startTime: string, endTime: string): number {
  const s = parseHHMMtoMinutes(startTime);
  const e = parseHHMMtoMinutes(endTime);
  return Math.max(0, e - s);
}

function classifyForecast(percent: number): ForecastRiskStatus {
  // Tighter thresholds than retrospective minuteCalc because we are
  // looking at the END of the period, not "by now."
  if (percent >= 95) return "on_track";
  if (percent >= 85) return "slightly_behind";
  if (percent >= 70) return "at_risk";
  return "out_of_compliance";
}

/**
 * Enumerate every dated occurrence of a recurring schedule block within
 * [from, to]. Honors weekly/biweekly recurrence and effective_from/to.
 * One-off (non-recurring) blocks are not expanded — they are a separate
 * concept and out of scope here.
 */
function expandBlockOccurrences(
  block: { id: number; dayOfWeek: string; isRecurring: boolean; recurrenceType: string; effectiveFrom: string | null; effectiveTo: string | null },
  from: Date,
  to: Date,
): string[] {
  if (!block.isRecurring) return [];
  const targetDow = DAY_NAMES.indexOf(block.dayOfWeek.toLowerCase());
  if (targetDow < 0) return [];

  const effFrom = block.effectiveFrom ? new Date(block.effectiveFrom) : null;
  const effTo = block.effectiveTo ? new Date(block.effectiveTo) : null;

  const out: string[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);

  // Advance cursor to the first matching weekday on/after `from`.
  const delta = (targetDow - cursor.getDay() + 7) % 7;
  cursor.setDate(cursor.getDate() + delta);

  // Biweekly anchor: align to effective_from week if provided, else to the
  // ISO week of `from`. The exact anchor doesn't matter for short horizons
  // as long as it's stable across calls.
  const anchor = effFrom ?? from;
  const anchorMs = startOfWeekMonday(anchor).getTime();

  while (cursor <= to) {
    if (effFrom && cursor < effFrom) { cursor.setDate(cursor.getDate() + 7); continue; }
    if (effTo && cursor > effTo) break;

    if (block.recurrenceType === "biweekly") {
      const weekOffset = Math.floor((startOfWeekMonday(cursor).getTime() - anchorMs) / (7 * 24 * 60 * 60 * 1000));
      if (weekOffset % 2 !== 0) { cursor.setDate(cursor.getDate() + 7); continue; }
    }
    out.push(ymd(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return out;
}

export async function computeServiceForecast(opts: ComputeOpts): Promise<ServiceForecastResult> {
  const horizonWeeks = Math.max(1, Math.min(12, opts.horizonWeeks ?? 4));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const horizonEnd = new Date(today);
  horizonEnd.setDate(today.getDate() + horizonWeeks * 7);

  // Active service requirements scoped to the district via student → school.
  const reqConditions: any[] = [
    eq(serviceRequirementsTable.active, true),
    sql`${studentsTable.id} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${opts.districtId}))`,
  ];
  if (opts.studentId) reqConditions.push(eq(serviceRequirementsTable.studentId, opts.studentId));
  if (opts.staffId) reqConditions.push(eq(serviceRequirementsTable.providerId, opts.staffId));

  const reqs = await db
    .select({
      id: serviceRequirementsTable.id,
      studentId: serviceRequirementsTable.studentId,
      serviceTypeId: serviceRequirementsTable.serviceTypeId,
      providerId: serviceRequirementsTable.providerId,
      requiredMinutes: serviceRequirementsTable.requiredMinutes,
      intervalType: serviceRequirementsTable.intervalType,
      startDate: serviceRequirementsTable.startDate,
      endDate: serviceRequirementsTable.endDate,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      serviceTypeName: serviceTypesTable.name,
      providerFirstName: staffTable.firstName,
      providerLastName: staffTable.lastName,
    })
    .from(serviceRequirementsTable)
    .leftJoin(studentsTable, eq(studentsTable.id, serviceRequirementsTable.studentId))
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
    .leftJoin(staffTable, eq(staffTable.id, serviceRequirementsTable.providerId))
    .where(and(...reqConditions));

  if (reqs.length === 0) {
    return {
      rows: [],
      summary: { totalRows: 0, studentsAtRisk: 0, totalProjectedShortfallMinutes: 0, byStatus: { on_track: 0, slightly_behind: 0, at_risk: 0, out_of_compliance: 0 }, topImpactedStaff: [] },
      generatedAt: today.toISOString(),
      horizonWeeks,
    };
  }

  const reqIds = reqs.map(r => r.id);
  const studentIds = Array.from(new Set(reqs.map(r => r.studentId)));

  // Earliest interval start across all requirements (for delivered-minutes query).
  let earliestIntervalStart = today;
  let latestIntervalEnd = horizonEnd;
  const intervalByReq = new Map<number, { start: Date; end: Date }>();
  for (const r of reqs) {
    const iv = intervalForToday(r.intervalType, today);
    intervalByReq.set(r.id, iv);
    if (iv.start < earliestIntervalStart) earliestIntervalStart = iv.start;
    if (iv.end > latestIntervalEnd) latestIntervalEnd = iv.end;
  }

  // Delivered minutes (completed/makeup) per requirement, period-to-date.
  const sessions = await db
    .select({
      serviceRequirementId: sessionLogsTable.serviceRequirementId,
      durationMinutes: sessionLogsTable.durationMinutes,
      status: sessionLogsTable.status,
      sessionDate: sessionLogsTable.sessionDate,
    })
    .from(sessionLogsTable)
    .where(and(
      inArray(sessionLogsTable.serviceRequirementId, reqIds),
      gte(sessionLogsTable.sessionDate, ymd(earliestIntervalStart)),
      lte(sessionLogsTable.sessionDate, ymd(today)),
      eq(sessionLogsTable.isCompensatory, false),
      isNull(sessionLogsTable.deletedAt),
    ));

  const deliveredByReq = new Map<number, number>();
  for (const s of sessions) {
    if (s.serviceRequirementId == null) continue;
    if (s.status !== "completed" && s.status !== "makeup") continue;
    const iv = intervalByReq.get(s.serviceRequirementId);
    if (!iv) continue;
    if (s.sessionDate < ymd(iv.start)) continue;
    deliveredByReq.set(
      s.serviceRequirementId,
      (deliveredByReq.get(s.serviceRequirementId) ?? 0) + s.durationMinutes,
    );
  }

  // Schedule blocks for these students. We match a block to a requirement by
  // (studentId, serviceTypeId). A block with a NULL serviceTypeId is a
  // generic time slot (homeroom etc) and is ignored for forecasting.
  const blocks = await db
    .select({
      id: scheduleBlocksTable.id,
      staffId: scheduleBlocksTable.staffId,
      studentId: scheduleBlocksTable.studentId,
      serviceTypeId: scheduleBlocksTable.serviceTypeId,
      dayOfWeek: scheduleBlocksTable.dayOfWeek,
      startTime: scheduleBlocksTable.startTime,
      endTime: scheduleBlocksTable.endTime,
      isRecurring: scheduleBlocksTable.isRecurring,
      recurrenceType: scheduleBlocksTable.recurrenceType,
      effectiveFrom: scheduleBlocksTable.effectiveFrom,
      effectiveTo: scheduleBlocksTable.effectiveTo,
      blockType: scheduleBlocksTable.blockType,
      staffFirstName: staffTable.firstName,
      staffLastName: staffTable.lastName,
    })
    .from(scheduleBlocksTable)
    .leftJoin(staffTable, eq(staffTable.id, scheduleBlocksTable.staffId))
    .where(and(
      inArray(scheduleBlocksTable.studentId, studentIds),
      isNull(scheduleBlocksTable.deletedAt),
      eq(scheduleBlocksTable.blockType, "service"),
    ));

  // Group blocks by (studentId, serviceTypeId) for fast lookup.
  const blocksByKey = new Map<string, typeof blocks>();
  const involvedStaffIds = new Set<number>();
  for (const b of blocks) {
    if (b.studentId == null || b.serviceTypeId == null) continue;
    involvedStaffIds.add(b.staffId);
    const key = `${b.studentId}|${b.serviceTypeId}`;
    if (!blocksByKey.has(key)) blocksByKey.set(key, []);
    blocksByKey.get(key)!.push(b);
  }

  // Absences for involved staff in the horizon window.
  const horizonStartStr = ymd(today);
  const horizonEndStr = ymd(horizonEnd);
  const absences = involvedStaffIds.size > 0
    ? await db
        .select()
        .from(staffAbsencesTable)
        .where(and(
          inArray(staffAbsencesTable.staffId, Array.from(involvedStaffIds)),
          gte(staffAbsencesTable.absenceDate, horizonStartStr),
          lte(staffAbsencesTable.absenceDate, horizonEndStr),
        ))
    : [];

  const absenceByStaffDate = new Map<string, typeof absences[number]>();
  for (const a of absences) {
    absenceByStaffDate.set(`${a.staffId}|${a.absenceDate}`, a);
  }

  // Coverage instances for the relevant blocks/dates.
  const blockIds = blocks.map(b => b.id);
  const coverages = blockIds.length > 0
    ? await db
        .select({
          scheduleBlockId: coverageInstancesTable.scheduleBlockId,
          absenceDate: coverageInstancesTable.absenceDate,
          isCovered: coverageInstancesTable.isCovered,
          substituteStaffId: coverageInstancesTable.substituteStaffId,
          subFirstName: staffTable.firstName,
          subLastName: staffTable.lastName,
        })
        .from(coverageInstancesTable)
        .leftJoin(staffTable, eq(staffTable.id, coverageInstancesTable.substituteStaffId))
        .where(and(
          inArray(coverageInstancesTable.scheduleBlockId, blockIds),
          gte(coverageInstancesTable.absenceDate, horizonStartStr),
          lte(coverageInstancesTable.absenceDate, horizonEndStr),
        ))
    : [];

  const coverageByBlockDate = new Map<string, typeof coverages[number]>();
  for (const c of coverages) {
    coverageByBlockDate.set(`${c.scheduleBlockId}|${c.absenceDate}`, c);
  }

  // Build per-requirement forecast.
  const rows: ServiceForecastRow[] = [];
  const staffImpact = new Map<number, { staffName: string | null; lostMinutes: number; students: Set<number> }>();

  for (const req of reqs) {
    const iv = intervalByReq.get(req.id)!;
    const periodEndForForecast = iv.end < horizonEnd ? iv.end : horizonEnd;
    const planFrom = today;
    const planTo = periodEndForForecast;

    // Match blocks to this requirement by (studentId, serviceTypeId).
    // If the requirement specifies a provider, narrow to blocks for THAT
    // provider — otherwise a co-treating provider's block would be counted
    // as projected delivery for both requirements and over-state coverage.
    const candidateBlocks = blocksByKey.get(`${req.studentId}|${req.serviceTypeId}`) ?? [];
    const matchingBlocks = req.providerId != null
      ? candidateBlocks.filter(b => b.staffId === req.providerId)
      : candidateBlocks;

    let plannedRemainingMinutes = 0;
    let plannedLostMinutes = 0;
    const impacts: AbsenceImpact[] = [];

    for (const block of matchingBlocks) {
      const mins = blockMinutes(block.startTime, block.endTime);
      if (mins === 0) continue;
      const occurrences = expandBlockOccurrences(block, planFrom, planTo);
      for (const date of occurrences) {
        const absence = absenceByStaffDate.get(`${block.staffId}|${date}`);
        if (!absence) {
          plannedRemainingMinutes += mins;
          continue;
        }
        const cov = coverageByBlockDate.get(`${block.id}|${date}`);
        const covered = !!(cov && cov.isCovered && cov.substituteStaffId);
        if (covered) {
          plannedRemainingMinutes += mins;
        } else {
          plannedLostMinutes += mins;
        }
        impacts.push({
          date,
          staffId: block.staffId,
          staffName: block.staffFirstName ? `${block.staffFirstName} ${block.staffLastName}` : null,
          blockId: block.id,
          blockMinutes: mins,
          absenceType: absence.absenceType,
          isCovered: covered,
          substituteStaffId: cov?.substituteStaffId ?? null,
          substituteStaffName: cov?.subFirstName ? `${cov.subFirstName} ${cov.subLastName}` : null,
        });
        if (!covered) {
          const cur = staffImpact.get(block.staffId) ?? { staffName: block.staffFirstName ? `${block.staffFirstName} ${block.staffLastName}` : null, lostMinutes: 0, students: new Set<number>() };
          cur.lostMinutes += mins;
          cur.students.add(req.studentId);
          staffImpact.set(block.staffId, cur);
        }
      }
    }

    const delivered = deliveredByReq.get(req.id) ?? 0;
    const projected = delivered + plannedRemainingMinutes;
    const required = req.requiredMinutes;
    const projectedShortfall = Math.max(0, required - projected);
    const projectedPercent = required > 0 ? Math.min(100, Math.round((projected / required) * 1000) / 10) : 100;
    const status = required > 0 ? classifyForecast((projected / required) * 100) : "on_track";

    rows.push({
      serviceRequirementId: req.id,
      studentId: req.studentId,
      studentName: `${req.studentFirstName ?? ""} ${req.studentLastName ?? ""}`.trim(),
      serviceTypeId: req.serviceTypeId,
      serviceTypeName: req.serviceTypeName ?? "",
      providerId: req.providerId,
      providerName: req.providerFirstName ? `${req.providerFirstName} ${req.providerLastName}` : null,
      intervalType: req.intervalType,
      intervalStart: ymd(iv.start),
      intervalEnd: ymd(iv.end),
      horizonStart: horizonStartStr,
      horizonEnd: ymd(planTo),
      requiredMinutes: required,
      deliveredMinutes: delivered,
      plannedRemainingMinutes,
      plannedLostMinutes,
      projectedMinutes: projected,
      projectedShortfallMinutes: projectedShortfall,
      projectedPercent,
      forecastRiskStatus: status,
      absenceImpacts: impacts,
    });
  }

  const studentsAtRisk = new Set<number>();
  let totalShortfall = 0;
  const byStatus: Record<ForecastRiskStatus, number> = { on_track: 0, slightly_behind: 0, at_risk: 0, out_of_compliance: 0 };
  for (const r of rows) {
    byStatus[r.forecastRiskStatus] += 1;
    if (r.forecastRiskStatus === "at_risk" || r.forecastRiskStatus === "out_of_compliance") {
      studentsAtRisk.add(r.studentId);
      totalShortfall += r.projectedShortfallMinutes;
    }
  }

  const topImpactedStaff = Array.from(staffImpact.entries())
    .map(([staffId, v]) => ({ staffId, staffName: v.staffName, lostMinutes: v.lostMinutes, affectedStudents: v.students.size }))
    .sort((a, b) => b.lostMinutes - a.lostMinutes)
    .slice(0, 10);

  return {
    rows: rows.sort((a, b) => {
      // Sort highest-risk first, then largest projected shortfall.
      const order: Record<ForecastRiskStatus, number> = { out_of_compliance: 0, at_risk: 1, slightly_behind: 2, on_track: 3 };
      const c = order[a.forecastRiskStatus] - order[b.forecastRiskStatus];
      if (c !== 0) return c;
      return b.projectedShortfallMinutes - a.projectedShortfallMinutes;
    }),
    summary: {
      totalRows: rows.length,
      studentsAtRisk: studentsAtRisk.size,
      totalProjectedShortfallMinutes: totalShortfall,
      byStatus,
      topImpactedStaff,
    },
    generatedAt: new Date().toISOString(),
    horizonWeeks,
  };
}
