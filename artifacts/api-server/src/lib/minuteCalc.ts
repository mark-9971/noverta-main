// DEPRECATED(batch-1): the `eq(serviceRequirementsTable.active, true)`
// filter in computeAllActiveMinuteProgress and the inline single-row read
// in computeMinuteProgress both bypass the supersede chain and silently
// lose mid-period transitions. Replace with
// `getActiveRequirements(studentId, intervalRange)` from
// `lib/domain-service-delivery` per the migration plan in
// docs/architecture/active-requirements.md (target: Batch 2).
import { db } from "@workspace/db";
import { sessionLogsTable, serviceRequirementsTable, serviceTypesTable, studentsTable, staffTable, schoolYearsTable, schoolsTable, scheduleBlocksTable } from "@workspace/db";
import { eq, and, gte, lte, sql, inArray, isNull, isNotNull } from "drizzle-orm";
import {
  getSchoolDayException,
  getSchoolDayExceptionsForRange,
  summarizeSchoolDayWeights,
  type SchoolDayException,
} from "./schoolCalendar";

export type RiskStatus = "on_track" | "slightly_behind" | "at_risk" | "out_of_compliance" | "completed" | "no_data";

// If no minutes have been delivered AND we are at least this far into the
// interval, surface a distinct "no_data" status instead of a cheery "on_track".
// This prevents a freshly-started period from showing green when the provider
// has not yet logged a single session.
const NO_DATA_ELAPSED_THRESHOLD = 0.10;

export function getIntervalDates(
  intervalType: string,
  startDate: string,
  endDate?: string | null,
  referenceDate?: Date
): { intervalStart: Date; intervalEnd: Date } {
  const now = referenceDate ?? new Date();

  if (intervalType === "monthly") {
    const intervalStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const intervalEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    if (endDate) {
      const reqEnd = new Date(endDate);
      return { intervalStart, intervalEnd: reqEnd < intervalEnd ? reqEnd : intervalEnd };
    }
    return { intervalStart, intervalEnd };
  }

  if (intervalType === "weekly") {
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { intervalStart: monday, intervalEnd: sunday };
  }

  if (intervalType === "quarterly") {
    const quarter = Math.floor(now.getMonth() / 3);
    const intervalStart = new Date(now.getFullYear(), quarter * 3, 1);
    const intervalEnd = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59);
    if (endDate) {
      const reqEnd = new Date(endDate);
      return { intervalStart, intervalEnd: reqEnd < intervalEnd ? reqEnd : intervalEnd };
    }
    return { intervalStart, intervalEnd };
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);
  return { intervalStart: today, intervalEnd: todayEnd };
}

export function computeRiskStatus(
  requiredMinutes: number,
  deliveredMinutes: number,
  expectedByNow: number,
  projectedMinutes: number
): RiskStatus {
  if (deliveredMinutes >= requiredMinutes) return "completed";

  // Distinguish "no data yet" from genuine on-track. If zero minutes delivered
  // and the interval has barely started, return "no_data" so dashboards do not
  // claim health that hasn't been demonstrated. Once the interval has elapsed
  // past NO_DATA_ELAPSED_THRESHOLD, the regular at-risk thresholds take over.
  if (deliveredMinutes === 0 && requiredMinutes > 0) {
    const elapsedRatio = requiredMinutes > 0 ? expectedByNow / requiredMinutes : 0;
    if (elapsedRatio < NO_DATA_ELAPSED_THRESHOLD) return "no_data";
  }

  if (projectedMinutes >= requiredMinutes * 0.95) return "on_track";
  if (deliveredMinutes < expectedByNow * 0.7) return "out_of_compliance";
  if (deliveredMinutes < expectedByNow * 0.85) return "at_risk";
  if (deliveredMinutes < expectedByNow * 0.95) return "slightly_behind";
  return "on_track";
}

export type MinuteProgressResult = {
  serviceRequirementId: number;
  studentId: number;
  studentName: string;
  serviceTypeId: number;
  serviceTypeName: string;
  providerId: number | null;
  providerName: string | null;
  intervalType: string;
  requiredMinutes: number;
  deliveredMinutes: number;
  remainingMinutes: number;
  percentComplete: number;
  expectedMinutesByNow: number;
  projectedMinutes: number;
  riskStatus: RiskStatus;
  intervalStart: string;
  intervalEnd: string;
  missedSessionsCount: number;
  makeupSessionsCount: number;
  /**
   * T03 (Phase A — closed-loop makeup): minutes represented by makeup
   * schedule blocks that are linked to an originating action item via
   * `schedule_blocks.source_action_item_id` (T02) and have NOT yet been
   * delivered (i.e. no session_log carries the same source_action_item_id
   * within the interval window). These minutes are *intent*, not delivery
   * — the wedge no longer treats "scheduled" as "delivered".
   * Defaults to 0 when no pending-makeup context is supplied (legacy
   * call sites / tests).
   */
  scheduledPendingMinutes: number;
  /**
   * T03 — number of pending makeup schedule blocks contributing to
   * `scheduledPendingMinutes` for this requirement. Surfaces a "1
   * makeup scheduled" affordance without a second query.
   */
  pendingMakeupBlocksCount: number;
  /**
   * T03 — required gap remaining after subtracting both delivered and
   * scheduled-pending minutes from the requirement, never below zero.
   * This is the honest "still needs intervention" bucket and replaces
   * the implicit "remainingMinutes minus pending" math the UI used to
   * do client-side. T05 will expose this as the canonical at-risk
   * delta across wedge surfaces.
   */
  stillAtRiskMinutes: number;
  /**
   * School Calendar v0 — Slice 2. Number of full-closure days for the
   * student's school that fall inside the elapsed slice of the current
   * interval. Surfaces the discount applied to expectedMinutesByNow so
   * the UI can show "2 closures this period" without a second query.
   */
  closureDayCount: number;
  /**
   * Same as `closureDayCount` but for early-release days. Each one
   * counts as 0.5 of a normal day in the denominator (see
   * lib/schoolCalendar.ts EARLY_RELEASE_DAY_WEIGHT) until time-of-day
   * proration ships in a later slice.
   */
  earlyReleaseDayCount: number;
};

// ---------------------------------------------------------------------------
// T03 — Phase A pending-makeup math helpers.
//
// "scheduledPending" minutes represent makeup intent — minutes the district
// has *committed to deliver* (a coordinator scheduled a makeup block from a
// risk/alert via the T02 deep link) but has not yet logged. The wedge used
// to silently treat a scheduled makeup as if the minutes were already in the
// bank, which made the at-risk math optimistic and broke the closed loop.
//
// Honesty rules baked in here:
//  1. Only blocks with `block_type = 'makeup'` AND a non-null
//     `source_action_item_id` (T02 linkage) count. Hand-entered makeups and
//     ordinary recurring service blocks never contribute to pending — they
//     either don't represent recovery intent or aren't traceable to a gap.
//  2. A block stops contributing the moment a session_log is written
//     carrying the same `source_action_item_id` (T04 will guarantee this
//     happens at session-create time). Until then, manually-logged makeups
//     can briefly cause a single deep-link block to count as both delivered
//     (via the session_log path, status=makeup) and pending (via this
//     helper). That tiny seam closes when T04 ships and is documented in
//     the architect note for this task.
//  3. Soft-deleted blocks (`deleted_at IS NOT NULL`) are excluded.
//  4. Block duration is computed from `start_time`/`end_time` parsed as
//     "HH:MM"; a single block contributes its single-instance duration —
//     recurring weekly makeup blocks are not multiplied across the interval
//     because Phase A makeup blocks created via the deep link are
//     one-shot (`isRecurring = false`, `weekOf` set).
//  5. `stillAtRiskMinutes = max(0, requiredMinutes - delivered - pending)`.
// ---------------------------------------------------------------------------

function parseHHMMtoMinutes(t: string | null | undefined): number {
  if (!t) return 0;
  const parts = t.split(":");
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function blockDurationMinutes(startTime: string, endTime: string): number {
  return Math.max(0, parseHHMMtoMinutes(endTime) - parseHHMMtoMinutes(startTime));
}

/**
 * Pure (no-DB) reducer used by both the live math path and the unit tests.
 * Given the candidate makeup blocks for a (studentId, serviceTypeId) pair
 * and the set of action-item ids that have already been delivered against,
 * return how many minutes are pending and how many distinct blocks they
 * came from.
 */
export type PendingMakeupBlock = {
  studentId: number | null;
  serviceTypeId: number | null;
  sourceActionItemId: string | null;
  startTime: string;
  endTime: string;
  // T03 architect fix — interval bounds. A Phase A deep-link makeup is
  // one-shot and carries `weekOf` (a YYYY-MM-DD anchor for that single
  // instance). Recurring blocks (rare for makeups) carry a date range
  // instead. Both shapes are tolerated so the reducer can decide block
  // eligibility per requirement-interval without re-querying.
  weekOf: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

/**
 * Returns true iff the block's eligibility window overlaps the
 * requirement's [intervalStartStr, intervalEndStr] window. Encodes the
 * Phase A rule: prefer `weekOf` for one-shot makeups; fall back to the
 * `effective_from`/`effective_to` envelope otherwise. Blocks with no
 * date anchor at all are NOT counted (the wedge does not credit
 * untimed intent toward a specific reporting interval).
 */
export function blockOverlapsInterval(
  b: Pick<PendingMakeupBlock, "weekOf" | "effectiveFrom" | "effectiveTo">,
  intervalStartStr: string,
  intervalEndStr: string,
): boolean {
  if (b.weekOf) {
    return b.weekOf >= intervalStartStr && b.weekOf <= intervalEndStr;
  }
  if (b.effectiveFrom || b.effectiveTo) {
    const from = b.effectiveFrom ?? "0000-01-01";
    const to = b.effectiveTo ?? "9999-12-31";
    return from <= intervalEndStr && to >= intervalStartStr;
  }
  return false;
}

/**
 * Pure (no-DB) reducer used by both the live math path and the unit tests.
 * Given the candidate makeup blocks for a (studentId, serviceTypeId) pair,
 * the per-requirement interval window, and the set of action-item ids that
 * have already been delivered against, return how many minutes are pending
 * and how many distinct blocks they came from.
 *
 * Architect fix (T03): interval bounds are enforced *here*, not at the
 * SQL layer, because the bulk path loads candidate blocks once across a
 * global window and then dispatches per requirement (which each have
 * their own interval). Without this filter, a block from Jan would
 * incorrectly reappear as pending in Feb's interval result.
 */
export function reducePendingMakeupMinutes(
  blocks: ReadonlyArray<PendingMakeupBlock>,
  deliveredActionItemIds: ReadonlySet<string>,
  reqStudentId: number,
  reqServiceTypeId: number,
  intervalStartStr: string,
  intervalEndStr: string,
): { minutes: number; count: number } {
  let minutes = 0;
  let count = 0;
  for (const b of blocks) {
    if (!b.sourceActionItemId) continue;
    if (deliveredActionItemIds.has(b.sourceActionItemId)) continue;
    if (b.studentId !== reqStudentId) continue;
    if (b.serviceTypeId !== reqServiceTypeId) continue;
    if (!blockOverlapsInterval(b, intervalStartStr, intervalEndStr)) continue;
    const mins = blockDurationMinutes(b.startTime, b.endTime);
    if (mins <= 0) continue;
    minutes += mins;
    count += 1;
  }
  return { minutes, count };
}

type PendingMakeupContext = {
  blocks: PendingMakeupBlock[];
  deliveredActionItemIds: Set<string>;
};

const EMPTY_PENDING_CONTEXT: PendingMakeupContext = {
  blocks: [],
  deliveredActionItemIds: new Set<string>(),
};

/**
 * Load the pending-makeup context for a set of (studentId, serviceTypeId,
 * intervalRange) tuples. Two queries:
 *   - all candidate makeup schedule blocks for the involved students that
 *     carry a source_action_item_id and aren't soft-deleted;
 *   - all session_log source_action_item_ids in the same student window so
 *     the reducer can subtract delivered intent without a per-req join.
 */
async function loadPendingMakeupContext(
  studentIds: ReadonlyArray<number>,
  intervalEarliestStr: string,
  intervalLatestStr: string,
): Promise<PendingMakeupContext> {
  if (studentIds.length === 0) return EMPTY_PENDING_CONTEXT;

  const blocks = await db
    .select({
      studentId: scheduleBlocksTable.studentId,
      serviceTypeId: scheduleBlocksTable.serviceTypeId,
      sourceActionItemId: scheduleBlocksTable.sourceActionItemId,
      startTime: scheduleBlocksTable.startTime,
      endTime: scheduleBlocksTable.endTime,
      weekOf: scheduleBlocksTable.weekOf,
      effectiveFrom: scheduleBlocksTable.effectiveFrom,
      effectiveTo: scheduleBlocksTable.effectiveTo,
    })
    .from(scheduleBlocksTable)
    .where(and(
      inArray(scheduleBlocksTable.studentId, studentIds as number[]),
      eq(scheduleBlocksTable.blockType, "makeup"),
      isNotNull(scheduleBlocksTable.sourceActionItemId),
      isNull(scheduleBlocksTable.deletedAt),
      // Coarse SQL-side window prefilter: keep candidates that *could*
      // overlap the global session-window. The per-requirement reducer
      // applies the precise per-interval check (blockOverlapsInterval).
      sql`(
        (${scheduleBlocksTable.weekOf} IS NOT NULL
          AND ${scheduleBlocksTable.weekOf} >= ${intervalEarliestStr}
          AND ${scheduleBlocksTable.weekOf} <= ${intervalLatestStr})
        OR (${scheduleBlocksTable.weekOf} IS NULL
          AND COALESCE(${scheduleBlocksTable.effectiveFrom}::text, '0000-01-01') <= ${intervalLatestStr}
          AND COALESCE(${scheduleBlocksTable.effectiveTo}::text, '9999-12-31') >= ${intervalEarliestStr})
      )`,
    ));

  const deliveredRows = await db
    .select({ sourceActionItemId: sessionLogsTable.sourceActionItemId })
    .from(sessionLogsTable)
    .where(and(
      inArray(sessionLogsTable.studentId, studentIds as number[]),
      isNotNull(sessionLogsTable.sourceActionItemId),
      gte(sessionLogsTable.sessionDate, intervalEarliestStr),
      lte(sessionLogsTable.sessionDate, intervalLatestStr),
      isNull(sessionLogsTable.deletedAt),
    ));

  const deliveredActionItemIds = new Set<string>();
  for (const r of deliveredRows) {
    if (r.sourceActionItemId) deliveredActionItemIds.add(r.sourceActionItemId);
  }

  return { blocks, deliveredActionItemIds };
}

export async function computeMinuteProgress(
  serviceRequirementId: number,
  /**
   * Slice 2 cleanup — optional deterministic clock so the single-row
   * path matches `computeAllActiveMinuteProgress({ asOfDate })`. Used
   * by historical reports, debug tooling, and tests that need stable
   * elapsed/expected math instead of `new Date()` at call time.
   */
  asOfDate?: Date,
): Promise<MinuteProgressResult | null> {
  const [req] = await db
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
      // School Calendar v0 — needed to look up that school's closures /
      // early-release days for the requirement's interval. Nullable
      // because some legacy student rows still lack a school assignment.
      schoolId: studentsTable.schoolId,
      districtId: schoolsTable.districtId,
    })
    .from(serviceRequirementsTable)
    .leftJoin(studentsTable, eq(studentsTable.id, serviceRequirementsTable.studentId))
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
    .leftJoin(staffTable, eq(staffTable.id, serviceRequirementsTable.providerId))
    .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
    .where(eq(serviceRequirementsTable.id, serviceRequirementId));

  if (!req) return null;

  const { intervalStart, intervalEnd } = getIntervalDates(req.intervalType, req.startDate, req.endDate, asOfDate);
  const intervalStartStr = intervalStart.toISOString().substring(0, 10);
  const intervalEndStr = intervalEnd.toISOString().substring(0, 10);

  const sessions = await db
    .select({
      durationMinutes: sessionLogsTable.durationMinutes,
      status: sessionLogsTable.status,
      isMakeup: sessionLogsTable.isMakeup,
    })
    .from(sessionLogsTable)
    .where(
      and(
        eq(sessionLogsTable.studentId, req.studentId),
        eq(sessionLogsTable.serviceRequirementId, serviceRequirementId),
        gte(sessionLogsTable.sessionDate, intervalStartStr),
        lte(sessionLogsTable.sessionDate, intervalEndStr),
        eq(sessionLogsTable.isCompensatory, false),
        isNull(sessionLogsTable.deletedAt)
      )
    );

  // Slice 2: load this school's exceptions inside the requirement window
  // so expectedMinutesByNow honors closures and early-release days. If
  // the student isn't tied to a school, or the school has no district,
  // we leave the map empty and the math degrades to the legacy behavior.
  const exceptions = req.schoolId != null && req.districtId != null
    ? await getSchoolDayExceptionsForRange({
        districtId: req.districtId,
        schoolIds: [req.schoolId],
        startDate: intervalStartStr,
        endDate: intervalEndStr,
      })
    : new Map<string, SchoolDayException>();

  const pendingCtx = await loadPendingMakeupContext(
    [req.studentId],
    intervalStartStr,
    intervalEndStr,
  );

  return buildProgressFromSessions(req, sessions, intervalStart, intervalEnd, intervalStartStr, intervalEndStr, asOfDate, {
    schoolId: req.schoolId,
    exceptions,
  }, pendingCtx);
}

function buildProgressFromSessions(
  req: {
    id: number;
    studentId: number;
    serviceTypeId: number;
    providerId: number | null;
    requiredMinutes: number;
    intervalType: string;
    startDate: string;
    endDate: string | null;
    studentFirstName: string | null;
    studentLastName: string | null;
    serviceTypeName: string | null;
    providerFirstName: string | null;
    providerLastName: string | null;
  },
  sessions: { durationMinutes: number; status: string; isMakeup: boolean }[],
  intervalStart: Date,
  intervalEnd: Date,
  intervalStartStr: string,
  intervalEndStr: string,
  asOfDate?: Date,
  /**
   * Slice 2: optional school-day exception input. When supplied, the
   * elapsed/remaining day fractions are weighted by closures (=0) and
   * early-release days (=0.5 fallback) for the student's school. When
   * omitted (legacy callers / tests), the math falls back to the original
   * pure-calendar-day behavior so nothing else has to change at once.
   */
  schoolCalendarInput?: {
    schoolId: number | null;
    exceptions: Map<string, SchoolDayException>;
  },
  /**
   * T03 — pending-makeup context. When supplied, the result will report
   * `scheduledPendingMinutes`, `pendingMakeupBlocksCount`, and
   * `stillAtRiskMinutes`. When omitted, those fields default to 0 /
   * `remainingMinutes` so legacy callers and tests remain valid.
   */
  pendingMakeupCtx?: PendingMakeupContext,
): MinuteProgressResult {
  const completedSessions = sessions.filter(s => s.status === "completed" || s.status === "makeup");
  const missedSessions = sessions.filter(s => s.status === "missed");
  const makeupSessions = sessions.filter(s => s.isMakeup);

  const deliveredMinutes = completedSessions.reduce((sum, s) => sum + s.durationMinutes, 0);

  const now = asOfDate ?? new Date();
  const totalCalendarDays = Math.max(1, (intervalEnd.getTime() - intervalStart.getTime()) / (1000 * 60 * 60 * 24));
  const elapsedCalendarDays = Math.max(0, (now.getTime() - intervalStart.getTime()) / (1000 * 60 * 60 * 24));

  // Slice 2 — weight the day count by school-calendar exceptions so a
  // closure pulls expectedByNow toward zero for that day and an early
  // release counts as half a day.
  // Slice 6A — also weight by weekday so weekends contribute 0 weight
  // even when no exception is present. We therefore go through the
  // weekday-aware summarizer whenever we have a real school context
  // (schoolId is non-null), regardless of whether any exceptions exist
  // in the window. The legacy linear path is preserved only for
  // requirements with no school assignment, where we can't honestly
  // say which days are instructional.
  const haveSchoolContext =
    schoolCalendarInput != null && schoolCalendarInput.schoolId != null;
  let progressFraction: number;
  let closureDayCount = 0;
  let earlyReleaseDayCount = 0;

  if (haveSchoolContext) {
    const summary = summarizeSchoolDayWeights({
      schoolId: schoolCalendarInput!.schoolId,
      exceptions: schoolCalendarInput!.exceptions,
      startDate: intervalStart,
      endDate: intervalEnd,
      asOf: now,
    });
    closureDayCount = summary.closureDays;
    earlyReleaseDayCount = summary.earlyReleaseDays;
    if (summary.totalWeight > 0) {
      progressFraction = Math.min(1, summary.elapsedWeight / summary.totalWeight);
    } else {
      // Every day in the interval is a closure: nothing was expected.
      progressFraction = 0;
    }
  } else {
    progressFraction = Math.min(1, elapsedCalendarDays / totalCalendarDays);
  }

  const expectedByNow = req.requiredMinutes * progressFraction;

  const currentPacePerDay = elapsedCalendarDays > 0 ? deliveredMinutes / elapsedCalendarDays : 0;
  const remainingDays = Math.max(0, totalCalendarDays - elapsedCalendarDays);
  const projectedMinutes = deliveredMinutes + (currentPacePerDay * remainingDays);

  const remainingMinutes = Math.max(0, req.requiredMinutes - deliveredMinutes);
  const percentComplete = req.requiredMinutes > 0 ? Math.min(100, (deliveredMinutes / req.requiredMinutes) * 100) : 100;

  const riskStatus = computeRiskStatus(req.requiredMinutes, deliveredMinutes, expectedByNow, projectedMinutes);

  // T03 — bucket the recovery picture into delivered / scheduledPending /
  // stillAtRisk so the wedge stops conflating intent with delivery. When no
  // pending context was supplied (legacy callers / unit tests), pending is
  // 0 and stillAtRisk degrades to the existing remainingMinutes.
  const pending = pendingMakeupCtx
    ? reducePendingMakeupMinutes(
        pendingMakeupCtx.blocks,
        pendingMakeupCtx.deliveredActionItemIds,
        req.studentId,
        req.serviceTypeId,
        intervalStartStr,
        intervalEndStr,
      )
    : { minutes: 0, count: 0 };
  const scheduledPendingMinutes = pending.minutes;
  const pendingMakeupBlocksCount = pending.count;
  const stillAtRiskMinutes = Math.max(0, remainingMinutes - scheduledPendingMinutes);

  return {
    serviceRequirementId: req.id,
    studentId: req.studentId,
    studentName: `${req.studentFirstName} ${req.studentLastName}`,
    serviceTypeId: req.serviceTypeId,
    serviceTypeName: req.serviceTypeName ?? "",
    providerId: req.providerId ?? null,
    providerName: req.providerFirstName ? `${req.providerFirstName} ${req.providerLastName}` : null,
    intervalType: req.intervalType,
    requiredMinutes: req.requiredMinutes,
    deliveredMinutes,
    remainingMinutes,
    percentComplete: Math.round(percentComplete * 10) / 10,
    expectedMinutesByNow: Math.round(expectedByNow * 10) / 10,
    projectedMinutes: Math.round(projectedMinutes * 10) / 10,
    riskStatus,
    intervalStart: intervalStartStr,
    intervalEnd: intervalEndStr,
    missedSessionsCount: missedSessions.length,
    makeupSessionsCount: makeupSessions.length,
    scheduledPendingMinutes,
    pendingMakeupBlocksCount,
    stillAtRiskMinutes,
    closureDayCount,
    earlyReleaseDayCount,
  };
}

export async function computeAllActiveMinuteProgress(filters?: {
  studentId?: number;
  studentIds?: number[];
  staffId?: number;
  serviceTypeId?: number;
  programId?: number;
  riskStatus?: string;
  schoolId?: number;
  districtId?: number;
  startDate?: string;
  endDate?: string;
  asOfDate?: Date;
}): Promise<MinuteProgressResult[]> {
  const conditions: ReturnType<typeof eq>[] = [eq(serviceRequirementsTable.active, true) as any];
  if (filters?.studentId) conditions.push(eq(serviceRequirementsTable.studentId, filters.studentId) as any);
  if (filters?.studentIds && filters.studentIds.length > 0) conditions.push(inArray(serviceRequirementsTable.studentId, filters.studentIds) as any);
  if (filters?.serviceTypeId) conditions.push(eq(serviceRequirementsTable.serviceTypeId, filters.serviceTypeId) as any);
  if (filters?.staffId) conditions.push(eq(serviceRequirementsTable.providerId, filters.staffId) as any);
  if (filters?.schoolId) conditions.push(sql`${studentsTable.id} IN (SELECT id FROM students WHERE school_id = ${filters.schoolId})` as any);
  if (filters?.districtId) conditions.push(sql`${studentsTable.id} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${filters.districtId}))` as any);

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
      // Slice 2 — needed to honor school closures / early-release days
      // when computing expectedMinutesByNow. School → district join lets
      // us tenant-scope the exceptions lookup without a second query.
      schoolId: studentsTable.schoolId,
      schoolDistrictId: schoolsTable.districtId,
    })
    .from(serviceRequirementsTable)
    .leftJoin(studentsTable, eq(studentsTable.id, serviceRequirementsTable.studentId))
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
    .leftJoin(staffTable, eq(staffTable.id, serviceRequirementsTable.providerId))
    .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
    .where(conditions.length === 1 ? conditions[0] : and(...conditions));

  if (reqs.length === 0) return [];

  const reqIds = reqs.map(r => r.id);

  const intervalsByType = new Map<string, { intervalStart: Date; intervalEnd: Date; startStr: string; endStr: string }>();
  for (const r of reqs) {
    const key = `${r.intervalType}|${r.startDate}|${r.endDate ?? ""}`;
    if (!intervalsByType.has(key)) {
      const { intervalStart, intervalEnd } = getIntervalDates(r.intervalType, r.startDate, r.endDate, filters?.asOfDate);
      intervalsByType.set(key, {
        intervalStart,
        intervalEnd,
        startStr: intervalStart.toISOString().substring(0, 10),
        endStr: intervalEnd.toISOString().substring(0, 10),
      });
    }
  }

  let globalEarliestStr = "9999-12-31";
  let globalLatestStr = "0000-01-01";
  for (const iv of intervalsByType.values()) {
    if (iv.startStr < globalEarliestStr) globalEarliestStr = iv.startStr;
    if (iv.endStr > globalLatestStr) globalLatestStr = iv.endStr;
  }

  const sessionStartStr = filters?.startDate && filters.startDate > globalEarliestStr ? filters.startDate : globalEarliestStr;
  const sessionEndStr = filters?.endDate && filters.endDate < globalLatestStr ? filters.endDate : globalLatestStr;

  // Slice 2 — bulk-load every relevant school's exceptions across the
  // global window in a single query, grouped by district to keep the
  // tenant-scope check explicit. Reqs whose student has no school (legacy
  // data) are skipped — they get an empty map and the legacy math.
  const schoolsByDistrict = new Map<number, Set<number>>();
  for (const r of reqs) {
    if (r.schoolId == null || r.schoolDistrictId == null) continue;
    let set = schoolsByDistrict.get(r.schoolDistrictId);
    if (!set) {
      set = new Set();
      schoolsByDistrict.set(r.schoolDistrictId, set);
    }
    set.add(r.schoolId);
  }
  const exceptionsBySchool = new Map<number, Map<string, SchoolDayException>>();
  for (const [did, schoolSet] of schoolsByDistrict.entries()) {
    const map = await getSchoolDayExceptionsForRange({
      districtId: did,
      schoolIds: Array.from(schoolSet),
      startDate: globalEarliestStr,
      endDate: globalLatestStr,
    });
    // Re-bucket by schoolId so each requirement only sees its own school.
    for (const [k, v] of map.entries()) {
      const sid = v.schoolId;
      let perSchool = exceptionsBySchool.get(sid);
      if (!perSchool) {
        perSchool = new Map();
        exceptionsBySchool.set(sid, perSchool);
      }
      perSchool.set(k, v);
    }
  }

  // T03 — load pending-makeup context once for all involved students,
  // bounded by the global window we're already scanning sessions over.
  const allStudentIds = Array.from(new Set(reqs.map(r => r.studentId)));
  const pendingCtx = await loadPendingMakeupContext(
    allStudentIds,
    sessionStartStr,
    sessionEndStr,
  );

  const allSessions = await db
    .select({
      serviceRequirementId: sessionLogsTable.serviceRequirementId,
      durationMinutes: sessionLogsTable.durationMinutes,
      status: sessionLogsTable.status,
      isMakeup: sessionLogsTable.isMakeup,
      isCompensatory: sessionLogsTable.isCompensatory,
      sessionDate: sessionLogsTable.sessionDate,
    })
    .from(sessionLogsTable)
    .where(
      and(
        inArray(sessionLogsTable.serviceRequirementId, reqIds),
        gte(sessionLogsTable.sessionDate, sessionStartStr),
        lte(sessionLogsTable.sessionDate, sessionEndStr),
        eq(sessionLogsTable.isCompensatory, false),
        isNull(sessionLogsTable.deletedAt)
      )
    );

  const sessionsByReqId = new Map<number, typeof allSessions>();
  for (const s of allSessions) {
    if (s.serviceRequirementId == null) continue;
    if (!sessionsByReqId.has(s.serviceRequirementId)) sessionsByReqId.set(s.serviceRequirementId, []);
    sessionsByReqId.get(s.serviceRequirementId)!.push(s);
  }

  const results: MinuteProgressResult[] = [];
  for (const req of reqs) {
    const key = `${req.intervalType}|${req.startDate}|${req.endDate ?? ""}`;
    const iv = intervalsByType.get(key)!;

    const reqSessions = sessionsByReqId.get(req.id) ?? [];
    const filterStart = filters?.startDate && filters.startDate > iv.startStr ? filters.startDate : iv.startStr;
    const filterEnd = filters?.endDate && filters.endDate < iv.endStr ? filters.endDate : iv.endStr;
    const filteredSessions = reqSessions
      .filter(s => s.sessionDate >= filterStart && s.sessionDate <= filterEnd)
      .map(s => ({ durationMinutes: s.durationMinutes, status: s.status, isMakeup: s.isMakeup }));

    const perSchoolExceptions = req.schoolId != null
      ? exceptionsBySchool.get(req.schoolId) ?? new Map<string, SchoolDayException>()
      : new Map<string, SchoolDayException>();

    results.push(buildProgressFromSessions(
      req,
      filteredSessions,
      iv.intervalStart,
      iv.intervalEnd,
      iv.startStr,
      iv.endStr,
      filters?.asOfDate,
      { schoolId: req.schoolId, exceptions: perSchoolExceptions },
      pendingCtx,
    ));
  }

  if (filters?.riskStatus) {
    return results.filter(r => r.riskStatus === filters.riskStatus);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Cached per-student worst-risk aggregation.
//
// The Students list and the dashboard both want the same answer: "for each
// active student, what is the worst risk tier across their requirements?"
// Recomputing that inline per request (previously a hand-written CTE in the
// students route) was expensive for large districts. This helper runs the
// shared JS pipeline (computeAllActiveMinuteProgress) once and caches the
// derived map for a short window so repeated filter clicks are near-instant.
// ---------------------------------------------------------------------------

export type AggregateRiskStatus = "on_track" | "slightly_behind" | "at_risk" | "out_of_compliance";

type RiskMapScope = { districtId?: number; schoolId?: number };

const RISK_PRIORITY: Record<string, number> = {
  out_of_compliance: 4,
  at_risk: 3,
  slightly_behind: 2,
  on_track: 1,
  completed: 0,
  no_data: 0,
};

const RISK_MAP_TTL_MS = 30_000;

type RiskMapCacheEntry = {
  expiresAt: number;
  promise: Promise<Map<number, AggregateRiskStatus>>;
};

const riskMapCache = new Map<string, RiskMapCacheEntry>();

function riskMapCacheKey(scope: RiskMapScope): string {
  return `d=${scope.districtId ?? ""}|s=${scope.schoolId ?? ""}`;
}

function aggregateFromProgress(
  all: MinuteProgressResult[]
): Map<number, AggregateRiskStatus> {
  const map = new Map<number, AggregateRiskStatus>();
  for (const p of all) {
    const candidate: AggregateRiskStatus =
      p.riskStatus === "out_of_compliance" ? "out_of_compliance"
      : p.riskStatus === "at_risk" ? "at_risk"
      : p.riskStatus === "slightly_behind" ? "slightly_behind"
      : "on_track";
    const cur = map.get(p.studentId);
    if (!cur || (RISK_PRIORITY[candidate] ?? 0) > (RISK_PRIORITY[cur] ?? 0)) {
      map.set(p.studentId, candidate);
    }
  }
  return map;
}

export async function getCachedStudentRiskMap(
  scope: RiskMapScope = {}
): Promise<Map<number, AggregateRiskStatus>> {
  const key = riskMapCacheKey(scope);
  const now = Date.now();
  const entry = riskMapCache.get(key);
  if (entry && entry.expiresAt > now) return entry.promise;

  const promise = (async () => {
    const all = await computeAllActiveMinuteProgress({
      districtId: scope.districtId,
      schoolId: scope.schoolId,
    });
    return aggregateFromProgress(all);
  })();

  riskMapCache.set(key, { expiresAt: now + RISK_MAP_TTL_MS, promise });
  promise.catch(() => {
    // Don't poison the cache with a failed request.
    const cur = riskMapCache.get(key);
    if (cur && cur.promise === promise) riskMapCache.delete(key);
  });
  return promise;
}

export function invalidateStudentRiskMapCache(): void {
  riskMapCache.clear();
}
