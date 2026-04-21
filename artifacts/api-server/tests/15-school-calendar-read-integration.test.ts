/**
 * School Calendar v0 — Slice 2 read-path integration
 *
 * Pure-unit coverage for the lib/schoolCalendar helpers, plus a thin
 * integration test that exercises computeMinuteProgress end-to-end with
 * a real district / school / student / requirement / sessions and
 * confirms closures and early-release days reduce expectedMinutesByNow
 * (and surface the new closureDayCount / earlyReleaseDayCount fields).
 *
 * Slice 1 already covers CRUD + invariants + tenant isolation for the
 * write path in 15-school-calendar-exceptions.test.ts; this file is the
 * matching coverage for the read path.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createDistrict,
  createSchool,
  createStaff,
  createStudent,
  createServiceType,
  cleanupDistrict,
  cleanupServiceType,
} from "./helpers";
import { db, schoolCalendarExceptionsTable, serviceRequirementsTable, sessionLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  EARLY_RELEASE_DAY_WEIGHT,
  dayWeightForException,
  adjustExpectedMinutesForSchoolException,
  summarizeSchoolDayWeights,
  getSchoolDayException,
  getSchoolDayExceptionsForRange,
  type SchoolDayException,
} from "../src/lib/schoolCalendar";
import { computeAllActiveMinuteProgress } from "../src/lib/minuteCalc";

// --------- helpers shared across the unit tests ---------------------------

function ex(date: string, type: "closure" | "early_release", dismissalTime: string | null = null): SchoolDayException {
  return { schoolId: 1, exceptionDate: date, type, dismissalTime, reason: "test" };
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dy}`;
}

// =========================================================================
// Pure unit tests — no DB needed
// =========================================================================

describe("lib/schoolCalendar pure helpers", () => {
  describe("dayWeightForException", () => {
    it("returns 1 for a normal day with no exception", () => {
      expect(dayWeightForException(null)).toBe(1);
      expect(dayWeightForException(undefined)).toBe(1);
    });
    it("returns 0 for a closure", () => {
      expect(dayWeightForException(ex("2026-01-05", "closure"))).toBe(0);
    });
    it("returns the documented fallback weight for early-release", () => {
      expect(dayWeightForException(ex("2026-01-06", "early_release", "12:00"))).toBe(EARLY_RELEASE_DAY_WEIGHT);
      expect(EARLY_RELEASE_DAY_WEIGHT).toBe(0.5);
    });
    it("treats unknown types defensively as a normal day (no silent zeroing)", () => {
      const weird = { ...ex("2026-01-07", "closure"), type: "holiday_party" as unknown as "closure" };
      expect(dayWeightForException(weird)).toBe(1);
    });
  });

  describe("adjustExpectedMinutesForSchoolException", () => {
    it("passes through the value when there's no exception", () => {
      expect(adjustExpectedMinutesForSchoolException({ expectedMinutes: 30, exception: null })).toBe(30);
    });
    it("zeros out closures regardless of any service window input", () => {
      expect(adjustExpectedMinutesForSchoolException({
        expectedMinutes: 30,
        exception: ex("2026-01-05", "closure"),
        serviceWindowStart: "09:00",
        serviceWindowEnd: "09:30",
      })).toBe(0);
    });
    it("applies the day-weight fallback for early-release without service window data", () => {
      expect(adjustExpectedMinutesForSchoolException({
        expectedMinutes: 30,
        exception: ex("2026-01-06", "early_release", "12:00"),
      })).toBe(15);
    });
    it("returns full minutes when the service window finishes before dismissal", () => {
      expect(adjustExpectedMinutesForSchoolException({
        expectedMinutes: 30,
        exception: ex("2026-01-06", "early_release", "12:00"),
        serviceWindowStart: "09:00",
        serviceWindowEnd: "09:30",
      })).toBe(30);
    });
    it("returns 0 when the service window starts at or after dismissal", () => {
      expect(adjustExpectedMinutesForSchoolException({
        expectedMinutes: 30,
        exception: ex("2026-01-06", "early_release", "12:00"),
        serviceWindowStart: "12:00",
        serviceWindowEnd: "12:30",
      })).toBe(0);
    });
    it("prorates a window that straddles dismissal", () => {
      const minutes = adjustExpectedMinutesForSchoolException({
        expectedMinutes: 30,
        exception: ex("2026-01-06", "early_release", "12:00"),
        serviceWindowStart: "11:30",
        serviceWindowEnd: "12:30",
      });
      expect(minutes).toBe(15); // half the window is before dismissal
    });
    it("falls back to the day-weight rule if dismissalTime is malformed", () => {
      const result = adjustExpectedMinutesForSchoolException({
        expectedMinutes: 30,
        exception: ex("2026-01-06", "early_release", "noon-ish"),
        serviceWindowStart: "11:30",
        serviceWindowEnd: "12:30",
      });
      expect(result).toBe(15);
    });
    it("falls back to the day-weight rule when dismissalTime is null even with timing inputs", () => {
      // Defensive — schema should prevent this, but if a row slips through
      // we must NOT silently treat it as zero or full; it should hit the
      // documented 0.5 fallback.
      const result = adjustExpectedMinutesForSchoolException({
        expectedMinutes: 40,
        exception: ex("2026-01-06", "early_release", null),
        serviceWindowStart: "10:00",
        serviceWindowEnd: "10:40",
      });
      expect(result).toBe(20);
    });
    it("mixed-windows realistic interval diverges from the 0.5 fallback at the totals level", () => {
      // Realistic shape: a provider has three 30-min back-to-back sessions
      // on an early-release day with dismissal at 12:00. We deliberately
      // pick windows so the exact total differs from the naive 0.5 total
      // (otherwise the test would not actually prove the helper is doing
      // exact proration vs accidentally averaging out).
      //   09:00-09:30 (before)   → exact 30, fallback 15
      //   11:30-12:30 (straddle) → exact 30 (50/50), fallback 30
      //   12:30-13:00 (after)    → exact 0,  fallback 15
      // exact total    = 30 + 30 + 0  = 60
      // fallback total = 15 + 30 + 15 = 60
      // Tied — replace the straddler with an asymmetric one.
      //   11:30-13:30 (straddle 30 min before / 90 min after, 120 min)
      //                          → exact 30, fallback 60
      // exact total    = 30 + 30 + 0  = 60
      // fallback total = 15 + 60 + 15 = 90
      const exception = ex("2026-01-06", "early_release", "12:00");
      const blocks = [
        { start: "09:00", end: "09:30", minutes: 30 },
        { start: "11:30", end: "13:30", minutes: 120 },
        { start: "12:30", end: "13:00", minutes: 30 },
      ];
      const exactTotal = blocks.reduce((sum, b) => sum + adjustExpectedMinutesForSchoolException({
        expectedMinutes: b.minutes,
        exception,
        serviceWindowStart: b.start,
        serviceWindowEnd: b.end,
      }), 0);
      const fallbackTotal = blocks.reduce((sum, b) => sum + adjustExpectedMinutesForSchoolException({
        expectedMinutes: b.minutes,
        exception,
      }), 0);
      expect(exactTotal).toBe(60);
      expect(fallbackTotal).toBe(90);
      expect(exactTotal).toBeLessThan(fallbackTotal);
    });
  });

  describe("summarizeSchoolDayWeights", () => {
    it("collapses to raw calendar days when no exceptions are present (end-of-day asOf)", () => {
      const start = new Date(2026, 0, 5);                    // Mon 00:00
      const end = new Date(2026, 0, 9);                      // Fri 00:00
      const asOf = new Date(2026, 0, 7, 23, 59, 59, 999);    // Wed end-of-day
      const summary = summarizeSchoolDayWeights({
        schoolId: 1, exceptions: new Map(), startDate: start, endDate: end, asOf,
      });
      expect(summary.totalCalendarDays).toBe(5);
      expect(summary.elapsedCalendarDays).toBeCloseTo(3, 4);
      expect(summary.totalWeight).toBe(5);
      expect(summary.elapsedWeight).toBeCloseTo(3, 4);
      expect(summary.closureDays).toBe(0);
      expect(summary.earlyReleaseDays).toBe(0);
    });

    it("counts closures and early-release days within the elapsed slice (end-of-day asOf)", () => {
      const start = new Date(2026, 0, 5);
      const end = new Date(2026, 0, 9);
      const asOf = new Date(2026, 0, 8, 23, 59, 59, 999);    // Thu end-of-day
      const map = new Map<string, SchoolDayException>();
      map.set(`1:${isoDate(new Date(2026, 0, 6))}`, ex(isoDate(new Date(2026, 0, 6)), "closure"));
      map.set(`1:${isoDate(new Date(2026, 0, 7))}`, ex(isoDate(new Date(2026, 0, 7)), "early_release", "12:00"));
      map.set(`1:${isoDate(new Date(2026, 0, 9))}`, ex(isoDate(new Date(2026, 0, 9)), "closure"));
      const summary = summarizeSchoolDayWeights({
        schoolId: 1, exceptions: map, startDate: start, endDate: end, asOf,
      });
      // Mon=1, Tue=0 (closure), Wed=0.5 (early), Thu=1 → elapsed weight = 2.5
      expect(summary.elapsedWeight).toBeCloseTo(2.5, 4);
      // Total: Mon=1, Tue=0, Wed=0.5, Thu=1, Fri=0 (closure) = 2.5
      expect(summary.totalWeight).toBe(2.5);
      expect(summary.closureDays).toBe(1);
      expect(summary.earlyReleaseDays).toBe(1);
    });

    it("treats the day containing asOf as fractional, not whole — preserves intraday pacing", () => {
      // Mon=normal, Tue=normal, Wed=normal. asOf = Wed noon.
      // Expect elapsed weight = 1 (Mon) + 1 (Tue) + 0.5 (Wed half) = 2.5
      const start = new Date(2026, 0, 5);
      const end = new Date(2026, 0, 7);
      const asOf = new Date(2026, 0, 7, 12, 0, 0, 0);
      const summary = summarizeSchoolDayWeights({
        schoolId: 1, exceptions: new Map(), startDate: start, endDate: end, asOf,
      });
      expect(summary.elapsedWeight).toBeCloseTo(2.5, 4);
      expect(summary.totalWeight).toBe(3);
    });

    it("a closure on the in-progress day still contributes 0 weight regardless of fraction", () => {
      const start = new Date(2026, 0, 5);
      const end = new Date(2026, 0, 7);
      const asOf = new Date(2026, 0, 7, 12, 0, 0, 0);   // Wed noon
      const map = new Map<string, SchoolDayException>();
      map.set(`1:${isoDate(new Date(2026, 0, 7))}`, ex(isoDate(new Date(2026, 0, 7)), "closure"));
      const summary = summarizeSchoolDayWeights({
        schoolId: 1, exceptions: map, startDate: start, endDate: end, asOf,
      });
      // Mon=1, Tue=1, Wed=0 (closure, fractional day but weight 0) → 2
      expect(summary.elapsedWeight).toBeCloseTo(2, 4);
      expect(summary.totalWeight).toBe(2);
      expect(summary.closureDays).toBe(1);   // closure counted once it has begun
    });

    it("Slice 6A — weekend days contribute 0 weight by default when schoolId is set", () => {
      // Mon Jan 5 → Sun Jan 11, 2026: Mon..Fri weekdays + Sat..Sun.
      // No exceptions. asOf = Sunday 23:00 → entire week elapsed.
      // weekday-aware totals: 5 instructional weekdays, 2 weekend days
      // collapsed to 0 weight. Closure/early-release counters stay 0.
      const start = new Date(2026, 0, 5);          // Mon
      const end = new Date(2026, 0, 11);           // Sun
      const asOf = new Date(2026, 0, 11, 23, 59, 59, 999);
      const summary = summarizeSchoolDayWeights({
        schoolId: 1, exceptions: new Map(), startDate: start, endDate: end, asOf,
      });
      expect(summary.totalCalendarDays).toBe(7);
      expect(summary.totalWeight).toBe(5);          // weekdays only
      expect(summary.elapsedWeight).toBeCloseTo(5, 4);
      expect(summary.weekendDaysElapsed).toBe(2);
      expect(summary.closureDays).toBe(0);
      expect(summary.earlyReleaseDays).toBe(0);
    });

    it("Slice 6A — explicit weekend exception still wins over the weekday-aware default", () => {
      // Sat Jan 10, 2026 marked as early_release in data. The weekday
      // default would give 0, but the data-driven exception takes
      // precedence and contributes 0.5 weight.
      const start = new Date(2026, 0, 10);          // Sat
      const end = new Date(2026, 0, 11);            // Sun
      const asOf = new Date(2026, 0, 11, 23, 59, 59, 999);
      const map = new Map<string, SchoolDayException>();
      map.set(`1:${isoDate(new Date(2026, 0, 10))}`, ex(isoDate(new Date(2026, 0, 10)), "early_release", "12:00"));
      const summary = summarizeSchoolDayWeights({
        schoolId: 1, exceptions: map, startDate: start, endDate: end, asOf,
      });
      // Sat = 0.5 (exception override), Sun = 0 (weekend default).
      expect(summary.totalWeight).toBe(0.5);
      expect(summary.elapsedWeight).toBeCloseTo(0.5, 4);
      expect(summary.earlyReleaseDays).toBe(1);
      // Sun was a default weekend (no exception), so it's counted.
      expect(summary.weekendDaysElapsed).toBe(1);
    });

    it("ignores exceptions when schoolId is null", () => {
      const start = new Date(2026, 0, 5);
      const end = new Date(2026, 0, 6);
      const asOf = new Date(2026, 0, 6, 23, 59, 59, 999);
      const map = new Map<string, SchoolDayException>();
      map.set(`1:${isoDate(start)}`, ex(isoDate(start), "closure"));
      const summary = summarizeSchoolDayWeights({
        schoolId: null, exceptions: map, startDate: start, endDate: end, asOf,
      });
      expect(summary.totalWeight).toBe(2);
      expect(summary.elapsedWeight).toBeCloseTo(2, 4);
      expect(summary.closureDays).toBe(0);
    });
  });
});

// =========================================================================
// Integration — real DB end-to-end through computeMinuteProgress.
// =========================================================================

describe("computeAllActiveMinuteProgress with school calendar exceptions", () => {
  let districtId: number;
  let schoolId: number;
  let staffId: number;
  let studentId: number;
  let serviceTypeId: number;

  // Pin a deterministic week (Mon Jan 5 → Sun Jan 11, 2026) and use
  // `asOfDate` to anchor "now" at end-of-Friday so the entire 5-day
  // school week is already elapsed regardless of when CI runs. The
  // weekly interval helper picks Mon..Sun based on asOfDate.
  const asOfFriday = new Date(2026, 0, 9, 23, 0, 0);  // Fri Jan 9 2026

  beforeAll(async () => {
    const d = await createDistrict({ name: "SCE Read District" });
    districtId = d.id;
    schoolId = (await createSchool(districtId, { name: "SCE Read School" })).id;
    staffId = (await createStaff(schoolId, { firstName: "Pat", lastName: "Provider", role: "service_provider" })).id;
    studentId = (await createStudent(schoolId, { firstName: "Sam", lastName: "Student" })).id;
    serviceTypeId = (await createServiceType({ name: "SCE Read Speech" })).id;
  });

  afterAll(async () => {
    await db.delete(sessionLogsTable).where(eq(sessionLogsTable.studentId, studentId));
    await db.delete(serviceRequirementsTable).where(eq(serviceRequirementsTable.studentId, studentId));
    await db.delete(schoolCalendarExceptionsTable).where(eq(schoolCalendarExceptionsTable.schoolId, schoolId));
    await cleanupDistrict(districtId);
    await cleanupServiceType(serviceTypeId);
  });

  it("getSchoolDayExceptionsForRange returns rows tenant-scoped to the district", async () => {
    await db.insert(schoolCalendarExceptionsTable).values([
      { schoolId, exceptionDate: "2026-02-01", type: "closure", reason: "Snow day", dismissalTime: null },
      { schoolId, exceptionDate: "2026-02-02", type: "early_release", reason: "PD half day", dismissalTime: "12:00" },
    ]);

    const inDistrict = await getSchoolDayExceptionsForRange({
      districtId, schoolIds: [schoolId], startDate: "2026-01-01", endDate: "2026-12-31",
    });
    expect(inDistrict.size).toBe(2);

    const otherDistrict = await getSchoolDayExceptionsForRange({
      districtId: districtId + 999_999, schoolIds: [schoolId], startDate: "2026-01-01", endDate: "2026-12-31",
    });
    expect(otherDistrict.size).toBe(0);

    const single = await getSchoolDayException({ districtId, schoolId, date: "2026-02-01" });
    expect(single?.type).toBe("closure");

    // Cleanup the rows added in this test so subsequent tests start clean.
    await db.delete(schoolCalendarExceptionsTable).where(eq(schoolCalendarExceptionsTable.schoolId, schoolId));
  });

  it("expectedMinutesByNow drops to 0 when every elapsed weekday is a closure", async () => {
    // Close every weekday in the test week. Sat+Sun have no exceptions
    // so they keep weight 1 each, but neither has elapsed by Fri so the
    // elapsed-weight numerator is 0 → expectedByNow = 0.
    await db.insert(schoolCalendarExceptionsTable).values(
      ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"].map(date => ({
        schoolId, exceptionDate: date, type: "closure" as const, reason: "Snow", dismissalTime: null,
      })),
    );

    const [req] = await db.insert(serviceRequirementsTable).values({
      studentId, serviceTypeId, providerId: staffId,
      requiredMinutes: 100, intervalType: "weekly",
      startDate: "2025-09-01", endDate: null, active: true,
    }).returning();

    try {
      const results = await computeAllActiveMinuteProgress({
        studentId, asOfDate: asOfFriday,
      });
      const result = results.find(r => r.serviceRequirementId === req.id);
      expect(result).toBeDefined();
      expect(result!.expectedMinutesByNow).toBe(0);
      expect(result!.closureDayCount).toBe(5);
      expect(result!.earlyReleaseDayCount).toBe(0);
      expect(result!.requiredMinutes).toBe(100); // IEP obligation unchanged
    } finally {
      await db.delete(serviceRequirementsTable).where(eq(serviceRequirementsTable.id, req.id));
      await db.delete(schoolCalendarExceptionsTable).where(eq(schoolCalendarExceptionsTable.schoolId, schoolId));
    }
  });

  it("early-release counts as 0.5 of a normal day in the expected-minute denominator", async () => {
    // Mon normal, Tue closure, Wed early-release, Thu normal, Fri normal.
    // Slice 6A — weekly interval Mon..Sun, weekend days now contribute
    // 0 weight (instructional-day baseline), so Sat+Sun no longer dilute
    // the denominator.
    //   weights (Mon..Sun) = [1, 0, 0.5, 1, 1, 0, 0]
    //   asOf = Fri 23:00 → Mon..Thu fully past + Fri at 23/24 fraction
    //   elapsedWeight = 1 + 0 + 0.5 + 1 + (1 * 23/24) ≈ 3.458
    //   totalWeight (Mon..Sun) = 3.5
    //   expectedByNow ≈ 100 * 3.458 / 3.5 ≈ 98.8
    await db.insert(schoolCalendarExceptionsTable).values([
      { schoolId, exceptionDate: "2026-01-06", type: "closure", reason: "x", dismissalTime: null },
      { schoolId, exceptionDate: "2026-01-07", type: "early_release", reason: "y", dismissalTime: "12:00" },
    ]);

    const [req] = await db.insert(serviceRequirementsTable).values({
      studentId, serviceTypeId, providerId: staffId,
      requiredMinutes: 100, intervalType: "weekly",
      startDate: "2025-09-01", endDate: null, active: true,
    }).returning();

    try {
      const results = await computeAllActiveMinuteProgress({
        studentId, asOfDate: asOfFriday,
      });
      const result = results.find(r => r.serviceRequirementId === req.id);
      expect(result).toBeDefined();
      expect(result!.closureDayCount).toBe(1);
      expect(result!.earlyReleaseDayCount).toBe(1);
      // Slice 6A: with weekend days no longer counted, expectedByNow
      // is bound by the weekday-only denominator.
      expect(result!.expectedMinutesByNow).toBeCloseTo(98.8, 0);
      expect(result!.expectedMinutesByNow).toBeGreaterThan(95);
      expect(result!.expectedMinutesByNow).toBeLessThanOrEqual(100);
      expect(result!.requiredMinutes).toBe(100);
    } finally {
      await db.delete(serviceRequirementsTable).where(eq(serviceRequirementsTable.id, req.id));
      await db.delete(schoolCalendarExceptionsTable).where(eq(schoolCalendarExceptionsTable.schoolId, schoolId));
    }
  });

  it("Slice 6A — a normal week with no exceptions still excludes weekends from the denominator", async () => {
    // No school_calendar_exceptions rows. The student IS assigned to a
    // school (the test scope's `schoolId`), so the new weekday-aware
    // baseline must apply: Mon..Fri = weight 1 each, Sat..Sun = 0.
    //   asOf = Fri 23:00 → Mon..Thu fully past + Fri at 23/24 fraction
    //   elapsedWeight = 4 + 23/24 ≈ 4.958
    //   totalWeight (Mon..Sun, weekends excluded) = 5
    //   expectedByNow ≈ 100 * 4.958 / 5 ≈ 99.2
    // The legacy linear math (100 * 4.958/7 ≈ 70.8) would understate
    // expected progress by treating Sat+Sun as instructional days.
    const [req] = await db.insert(serviceRequirementsTable).values({
      studentId, serviceTypeId, providerId: staffId,
      requiredMinutes: 100, intervalType: "weekly",
      startDate: "2025-09-01", endDate: null, active: true,
    }).returning();

    try {
      const results = await computeAllActiveMinuteProgress({
        studentId, asOfDate: asOfFriday,
      });
      const result = results.find(r => r.serviceRequirementId === req.id);
      expect(result).toBeDefined();
      expect(result!.closureDayCount).toBe(0);
      expect(result!.earlyReleaseDayCount).toBe(0);
      // Weekday-aware baseline puts us near 100% expected by Fri EOD.
      expect(result!.expectedMinutesByNow).toBeCloseTo(99.2, 0);
      // Crucially, must be materially higher than the legacy linear
      // value of ~70.8 — proves weekends are no longer in the denom.
      expect(result!.expectedMinutesByNow).toBeGreaterThan(90);
      expect(result!.requiredMinutes).toBe(100);
    } finally {
      await db.delete(serviceRequirementsTable).where(eq(serviceRequirementsTable.id, req.id));
    }
  });

  it("legacy fallback: a student with no school assignment uses linear calendar-day math", async () => {
    // Add an exception to the school but assign the student elsewhere
    // (school_id = null) — the exception must NOT bleed in.
    await db.insert(schoolCalendarExceptionsTable).values({
      schoolId, exceptionDate: "2026-01-06", type: "closure", reason: "Snow", dismissalTime: null,
    });
    const orphan = await createStudent(schoolId, { firstName: "Orphan", lastName: "NoSchool" });
    const { studentsTable } = await import("@workspace/db");
    await db.update(studentsTable).set({ schoolId: null }).where(eq(studentsTable.id, orphan.id));

    const [req] = await db.insert(serviceRequirementsTable).values({
      studentId: orphan.id, serviceTypeId, providerId: staffId,
      requiredMinutes: 100, intervalType: "weekly",
      startDate: "2025-09-01", endDate: null, active: true,
    }).returning();

    try {
      const results = await computeAllActiveMinuteProgress({
        studentId: orphan.id, asOfDate: asOfFriday,
      });
      const result = results.find(r => r.serviceRequirementId === req.id);
      expect(result).toBeDefined();
      expect(result!.closureDayCount).toBe(0);
      expect(result!.earlyReleaseDayCount).toBe(0);
      // Legacy linear math: with asOf = Fri 23:00 and intervalStart =
      // Mon 00:00, elapsed ≈ 4.96 days out of 7 → expected ≈ 70.8.
      expect(result!.expectedMinutesByNow).toBeCloseTo(70.8, 0);
    } finally {
      await db.delete(serviceRequirementsTable).where(eq(serviceRequirementsTable.id, req.id));
      await db.delete(studentsTable).where(eq(studentsTable.id, orphan.id));
      await db.delete(schoolCalendarExceptionsTable).where(eq(schoolCalendarExceptionsTable.schoolId, schoolId));
    }
  });
});
