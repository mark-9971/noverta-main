/**
 * Centralized read-path access to school_calendar_exceptions.
 *
 * Slice 2 of School Calendar v0: this module is the single place every
 * downstream read path goes through to ask "is this school/date a closure
 * or an early-release day, and by how much should expected service minutes
 * be reduced?". Lookups are tenant-scoped — callers must pass districtId,
 * which is enforced via a join through schools so a caller in district A
 * can never see exceptions from district B's schools.
 *
 * The write surface lives in routes/schools.ts (Settings → School Year →
 * School Closures & Early Release) and is intentionally untouched here.
 *
 * --- Early-release fallback rule ---
 * The current minute-progress model has NO time-of-day precision: a
 * service requirement says "X minutes per week", not "X minutes between
 * 10:00 and 10:30". When the data model lacks the precision needed to
 * prorate an early-release day exactly against a service window, we apply
 * a deterministic, conservative fallback: an early-release day counts as
 * EARLY_RELEASE_DAY_WEIGHT (0.5) of a normal instructional day for the
 * expected-minute denominator. A future slice that wires schedule_blocks
 * (which DO have start/end times) will switch to time-of-day proration via
 * dismissal_time and the helper signature is shaped to accept that input
 * (`serviceWindowStart`/`serviceWindowEnd`) without breaking callers.
 */
import { db, schoolCalendarExceptionsTable, schoolsTable } from "@workspace/db";
import { and, eq, gte, lte, inArray } from "drizzle-orm";

export type SchoolDayException = {
  schoolId: number;
  exceptionDate: string;          // YYYY-MM-DD
  type: "closure" | "early_release";
  dismissalTime: string | null;   // 'HH:MM' (24h) — required when type='early_release'
  reason: string;
};

/** Conservative fallback weight for an early-release day when the
 * consumer has no service-window time information. See module header. */
export const EARLY_RELEASE_DAY_WEIGHT = 0.5;

/** Unique cache key for the (schoolId, date) pair. Date is already an
 * ISO YYYY-MM-DD string in the DB so no normalization is needed. */
function key(schoolId: number, date: string): string {
  return `${schoolId}:${date}`;
}

/**
 * Look up a single school-day exception. Tenant-scoped: returns null if
 * the school doesn't exist, doesn't belong to the caller's district, or
 * has no exception on that date. Use this for one-off checks (e.g. the
 * Today view); for any range/loop, use `getSchoolDayExceptionsForRange`.
 */
export async function getSchoolDayException(args: {
  districtId: number;
  schoolId: number;
  date: string;
}): Promise<SchoolDayException | null> {
  const rows = await db
    .select({
      schoolId: schoolCalendarExceptionsTable.schoolId,
      exceptionDate: schoolCalendarExceptionsTable.exceptionDate,
      type: schoolCalendarExceptionsTable.type,
      dismissalTime: schoolCalendarExceptionsTable.dismissalTime,
      reason: schoolCalendarExceptionsTable.reason,
    })
    .from(schoolCalendarExceptionsTable)
    .innerJoin(schoolsTable, eq(schoolsTable.id, schoolCalendarExceptionsTable.schoolId))
    .where(and(
      eq(schoolCalendarExceptionsTable.schoolId, args.schoolId),
      eq(schoolCalendarExceptionsTable.exceptionDate, args.date),
      eq(schoolsTable.districtId, args.districtId),
    ))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    schoolId: row.schoolId,
    exceptionDate: row.exceptionDate,
    type: row.type as "closure" | "early_release",
    dismissalTime: row.dismissalTime,
    reason: row.reason,
  };
}

/**
 * Bulk-load every exception for a set of schools across a date range.
 * Returns a Map keyed by `${schoolId}:${YYYY-MM-DD}`. Always tenant-scoped
 * by districtId via a join through schools — schools that don't belong to
 * the district are silently filtered out.
 *
 * Returns an empty map (no DB call) when `schoolIds` is empty.
 */
export async function getSchoolDayExceptionsForRange(args: {
  districtId: number;
  schoolIds: number[];
  startDate: string;              // inclusive, YYYY-MM-DD
  endDate: string;                // inclusive, YYYY-MM-DD
}): Promise<Map<string, SchoolDayException>> {
  if (args.schoolIds.length === 0) return new Map();

  const rows = await db
    .select({
      schoolId: schoolCalendarExceptionsTable.schoolId,
      exceptionDate: schoolCalendarExceptionsTable.exceptionDate,
      type: schoolCalendarExceptionsTable.type,
      dismissalTime: schoolCalendarExceptionsTable.dismissalTime,
      reason: schoolCalendarExceptionsTable.reason,
    })
    .from(schoolCalendarExceptionsTable)
    .innerJoin(schoolsTable, eq(schoolsTable.id, schoolCalendarExceptionsTable.schoolId))
    .where(and(
      inArray(schoolCalendarExceptionsTable.schoolId, args.schoolIds),
      eq(schoolsTable.districtId, args.districtId),
      gte(schoolCalendarExceptionsTable.exceptionDate, args.startDate),
      lte(schoolCalendarExceptionsTable.exceptionDate, args.endDate),
    ));

  const map = new Map<string, SchoolDayException>();
  for (const r of rows) {
    map.set(key(r.schoolId, r.exceptionDate), {
      schoolId: r.schoolId,
      exceptionDate: r.exceptionDate,
      type: r.type as "closure" | "early_release",
      dismissalTime: r.dismissalTime,
      reason: r.reason,
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Domain adjustment
// ---------------------------------------------------------------------------

/**
 * Return the day-weight for a single calendar day given an optional
 * exception for that day:
 *   - none           → 1   (a normal instructional day counts in full)
 *   - closure        → 0   (no expected minutes)
 *   - early_release  → 0.5 (fallback — see module header)
 *
 * Pure function. No DB access. Use this when you've already loaded
 * exceptions via `getSchoolDayExceptionsForRange` and are walking days
 * to compute a denominator.
 */
export function dayWeightForException(exception: SchoolDayException | null | undefined): number {
  if (!exception) return 1;
  if (exception.type === "closure") return 0;
  if (exception.type === "early_release") return EARLY_RELEASE_DAY_WEIGHT;
  // Defensive: an unknown type means "we don't know how to discount it",
  // so treat the day as full rather than silently zeroing it out.
  return 1;
}

/**
 * Adjust a single expected-minute value for a single school-day exception.
 *
 * Shape mirrors what the spec calls for so future callers with time-of-day
 * data can pass `serviceWindowStart`/`serviceWindowEnd` without changing
 * the signature. Today's callers (which lack that precision) just pass
 * `expectedMinutes` and `exception` and get the day-weighted reduction.
 *
 * Rules (with time-of-day data):
 *   - closure                              → 0
 *   - early_release, service ends ≤ dismissal → unchanged
 *   - early_release, service starts ≥ dismissal → 0
 *   - early_release, overlaps dismissal    → prorated to the part before dismissal
 *
 * Rules (without time-of-day data — current default):
 *   - closure        → 0
 *   - early_release  → expectedMinutes * EARLY_RELEASE_DAY_WEIGHT
 *   - none           → unchanged
 */
export function adjustExpectedMinutesForSchoolException(args: {
  expectedMinutes: number;
  exception: SchoolDayException | null | undefined;
  serviceWindowStart?: string;   // 'HH:MM' (24h), optional
  serviceWindowEnd?: string;     // 'HH:MM' (24h), optional
}): number {
  const { expectedMinutes, exception, serviceWindowStart, serviceWindowEnd } = args;
  if (!exception) return expectedMinutes;
  if (exception.type === "closure") return 0;

  if (exception.type === "early_release") {
    if (!exception.dismissalTime) {
      // Schema says dismissal_time is required for early_release, but be
      // defensive: if it's somehow missing, fall back to the day-weight rule
      // rather than crashing or returning a wrong number.
      return expectedMinutes * EARLY_RELEASE_DAY_WEIGHT;
    }

    // Time-of-day path: only used when callers supply the service window.
    if (serviceWindowStart && serviceWindowEnd) {
      const dismiss = parseHHMM(exception.dismissalTime);
      const winStart = parseHHMM(serviceWindowStart);
      const winEnd = parseHHMM(serviceWindowEnd);
      if (dismiss != null && winStart != null && winEnd != null && winEnd > winStart) {
        if (winStart >= dismiss) return 0;
        if (winEnd <= dismiss) return expectedMinutes;
        const ratio = (dismiss - winStart) / (winEnd - winStart);
        return Math.max(0, expectedMinutes * ratio);
      }
      // Bad input → fall through to the conservative day-weight rule.
    }

    return expectedMinutes * EARLY_RELEASE_DAY_WEIGHT;
  }

  return expectedMinutes;
}

function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

// ---------------------------------------------------------------------------
// Range walker — used by the minute-progress aggregator to convert a
// calendar-day range into "effective instructional days" for a school.
// ---------------------------------------------------------------------------

export type SchoolDayWeightSummary = {
  /** Sum of day weights across [startDate, endDate] inclusive. */
  totalWeight: number;
  /** Sum of day weights across [startDate, min(endDate, asOf)] inclusive. */
  elapsedWeight: number;
  /** Number of full closures inside the elapsed window. */
  closureDays: number;
  /** Number of early-release days inside the elapsed window. */
  earlyReleaseDays: number;
  /** Raw calendar-day count of the full range (inclusive). */
  totalCalendarDays: number;
  /** Raw calendar-day count of the elapsed slice (inclusive). */
  elapsedCalendarDays: number;
};

/**
 * Walk a date range one day at a time and produce weighted day counts
 * given a pre-loaded exception map for one school. Used by the minute
 * aggregator to discount the expected-minute denominator without touching
 * the IEP's stated requiredMinutes (which remains the contractual
 * obligation reported to the UI). Inclusive on both ends.
 */
export function summarizeSchoolDayWeights(args: {
  schoolId: number | null;
  exceptions: Map<string, SchoolDayException>;
  startDate: Date;
  endDate: Date;
  asOf: Date;
}): SchoolDayWeightSummary {
  const { schoolId, exceptions, startDate, endDate, asOf } = args;
  const startMs = stripTime(startDate).getTime();
  const endMs = stripTime(endDate).getTime();
  // Keep asOf's wall-clock time so the *current* day contributes a
  // fractional share of its weight to elapsedWeight — otherwise every
  // day jumps from 0 → full at midnight, which materially overstates
  // expectedMinutesByNow vs the legacy linear pacing for non-exception
  // days inside an exception-bearing window.
  const asOfMs = asOf.getTime();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  let totalWeight = 0;
  let elapsedWeight = 0;
  let closureDays = 0;
  let earlyReleaseDays = 0;
  let totalCalendarDays = 0;
  let elapsedCalendarDays = 0;

  for (let t = startMs; t <= endMs; t += ONE_DAY) {
    const d = new Date(t);
    const dateStr = isoDate(d);
    const ex = schoolId != null ? exceptions.get(`${schoolId}:${dateStr}`) ?? null : null;
    const w = dayWeightForException(ex);
    totalWeight += w;
    totalCalendarDays += 1;

    const dayEndMs = t + ONE_DAY;
    if (asOfMs >= dayEndMs) {
      // day fully in the past
      elapsedWeight += w;
      elapsedCalendarDays += 1;
      if (ex?.type === "closure") closureDays += 1;
      else if (ex?.type === "early_release") earlyReleaseDays += 1;
    } else if (asOfMs > t) {
      // day in progress — count fractional weight
      const frac = (asOfMs - t) / ONE_DAY;
      elapsedWeight += w * frac;
      elapsedCalendarDays += frac;
      if (ex?.type === "closure") closureDays += 1;
      else if (ex?.type === "early_release") earlyReleaseDays += 1;
    }
  }

  return {
    totalWeight,
    elapsedWeight,
    closureDays,
    earlyReleaseDays,
    totalCalendarDays,
    elapsedCalendarDays,
  };
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dy}`;
}
