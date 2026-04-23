/**
 * V2 domain / reference — bounds, size profiles, pools, date helpers.
 *
 * Wave 2 extracted the long-lived reference catalogs out of
 * `seed-sample-data.ts`. This test pins the structural contract the
 * seeder + future simulator (W3) rely on so a careless edit to the
 * pools or bounds is caught at the smallest possible blast radius.
 */
import { describe, it, expect } from "vitest";
import {
  SAMPLE_BOUNDS,
  SIZE_PROFILES,
  SIZE_PROFILE_RANGES,
  DEFAULT_RANDOM_ROSTER_RANGE,
  DISABILITY_MAP,
  DISABILITY_POOL,
  GRADES_ELEM, GRADES_MIDDLE, GRADES_HIGH, GRADES_ALL,
  SCHOOL_NAMES,
  FIRST_NAMES, LAST_NAMES,
  SERVICE_TYPE_DEFAULTS,
  daysAgo, addDays, minToTime, isWeekday, collectWeekdays,
} from "@workspace/db/v2/domain";

describe("v2/domain/reference — bounds + size profiles", () => {
  it("SAMPLE_BOUNDS holds the canonical IEP/session ranges", () => {
    expect(SAMPLE_BOUNDS.requiredMinutes).toEqual([60, 360]);
  });

  it("SIZE_PROFILES exposes small/medium/large/xl with T-V2-09 contract counts", () => {
    // T-V2-09 — defaults are the mid-points of SIZE_PROFILE_RANGES so the
    // canonical V2 path lands inside the documented band for every profile.
    expect(SIZE_PROFILES.small.students).toBe(90);
    expect(SIZE_PROFILES.medium.students).toBe(350);
    expect(SIZE_PROFILES.large.students).toBe(1000);
    expect(SIZE_PROFILES.xl.students).toBe(1750);
    expect(SIZE_PROFILES.large.staff).toBeGreaterThan(SIZE_PROFILES.small.staff);
    expect(SIZE_PROFILES.xl.staff).toBeGreaterThan(SIZE_PROFILES.large.staff);
  });

  it("SIZE_PROFILE_RANGES match the brief: 60-120 / 200-500 / 800-1200 / 1500-2000", () => {
    expect(SIZE_PROFILE_RANGES.small).toEqual({ min: 60, max: 120 });
    expect(SIZE_PROFILE_RANGES.medium).toEqual({ min: 200, max: 500 });
    expect(SIZE_PROFILE_RANGES.large).toEqual({ min: 800, max: 1200 });
    expect(SIZE_PROFILE_RANGES.xl).toEqual({ min: 1500, max: 2000 });
  });

  it("Each profile's default students value sits inside its contract range", () => {
    for (const key of ["small", "medium", "large", "xl"] as const) {
      const def = SIZE_PROFILES[key].students;
      const range = SIZE_PROFILE_RANGES[key];
      expect(def).toBeGreaterThanOrEqual(range.min);
      expect(def).toBeLessThanOrEqual(range.max);
    }
  });

  it("DEFAULT_RANDOM_ROSTER_RANGE remains exported for back-compat (T-V2-09 retired the implicit override)", () => {
    const [lo, hi] = DEFAULT_RANDOM_ROSTER_RANGE;
    expect(lo).toBe(50);
    expect(hi).toBe(100);
  });
});

describe("v2/domain/reference — pools", () => {
  it("DISABILITY_MAP values appear in DISABILITY_POOL (full-name mapping)", () => {
    for (const long of Object.values(DISABILITY_MAP).flat()) {
      expect(DISABILITY_POOL).toContain(long);
    }
  });

  it("Grade pools are non-empty and GRADES_ALL is the union", () => {
    expect(GRADES_ELEM.length).toBeGreaterThan(0);
    expect(GRADES_MIDDLE.length).toBeGreaterThan(0);
    expect(GRADES_HIGH.length).toBeGreaterThan(0);
    const union = new Set([...GRADES_ELEM, ...GRADES_MIDDLE, ...GRADES_HIGH]);
    for (const g of GRADES_ALL) expect(union.has(g)).toBe(true);
  });

  it("SCHOOL_NAMES, FIRST_NAMES, LAST_NAMES are populated", () => {
    expect(SCHOOL_NAMES.length).toBeGreaterThanOrEqual(5);
    expect(FIRST_NAMES.length).toBeGreaterThanOrEqual(20);
    expect(LAST_NAMES.length).toBeGreaterThanOrEqual(20);
  });

  it("SERVICE_TYPE_DEFAULTS includes the canonical SLP/OT/PT/Counseling/ABA names", () => {
    const names = SERVICE_TYPE_DEFAULTS.map(s => s.name);
    expect(names).toContain("Speech-Language Therapy");
    expect(names).toContain("Occupational Therapy");
    expect(names).toContain("Physical Therapy");
    expect(names).toContain("Counseling");
    expect(names).toContain("ABA Therapy");
  });
});

describe("v2/domain/reference — date helpers", () => {
  it("daysAgo(0) returns a Date close to now (±1 day)", () => {
    const d = daysAgo(0);
    const drift = Math.abs(d.getTime() - Date.now());
    expect(drift).toBeLessThan(86_400_000);
  });

  it("addDays + addDays(-) is an inverse around an ISO date string", () => {
    const start = "2026-04-15";
    const fwd = addDays(start, 7);
    const back = addDays(fwd, -7);
    expect(back).toBe(start);
  });

  it("minToTime renders HH:MM zero-padded", () => {
    expect(minToTime(0)).toBe("00:00");
    expect(minToTime(9 * 60 + 5)).toBe("09:05");
    expect(minToTime(23 * 60 + 59)).toBe("23:59");
  });

  it("isWeekday flags Mon–Fri true and Sat/Sun false", () => {
    // 2026-04-13 is Monday, 2026-04-17 Friday, 2026-04-18 Saturday, 19 Sunday.
    expect(isWeekday("2026-04-13")).toBe(true);
    expect(isWeekday("2026-04-17")).toBe(true);
    expect(isWeekday("2026-04-18")).toBe(false);
    expect(isWeekday("2026-04-19")).toBe(false);
  });

  it("collectWeekdays returns weekdays in a 7-day window before today", () => {
    // Anchor on a known Monday; the previous 7 days span Sun..Sun → 5 weekdays.
    const days = collectWeekdays("2026-04-20", 7);
    expect(days.length).toBe(5);
    for (const d of days) expect(isWeekday(d)).toBe(true);
  });
});
