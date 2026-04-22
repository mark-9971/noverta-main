/**
 * V2 domain / roster — staff + student builders.
 *
 * The seeder calls `buildStaffSeeds(profile, target, shape)` and
 * `buildStudentDefs(profile, schoolCount, overrideTarget?, weights?)` to
 * materialize the roster shape before any DB writes. W2 extracted both
 * into `./v2/domain/roster/`. This test pins the structural contract:
 *
 *   - staff: per-profile slot composition, ratio fallback, PRE-1
 *     load-aware floor for SLP, override pass-through.
 *   - students: deterministic counts, scenario coverage, schoolIdx
 *     round-robin, healthy fill.
 */
import { describe, it, expect } from "vitest";
import {
  buildStaffSeeds,
  STAFF_BY_PROFILE,
  STAFF_RATIOS,
  SAMPLE_STAFF_POOL,
  buildStudentDefs,
  resolveSizeProfile,
  SIZE_PROFILES,
} from "@workspace/db/v2/domain";
import { setSeed } from "@workspace/db/v2/platform";

describe("v2/domain/roster/staff — buildStaffSeeds", () => {
  it("returns the canonical small-profile staff baseline (3 named seeds, no shape)", () => {
    // STAFF_BY_PROFILE.small = 1 CM + 1 BCBA + 1 SLP = 3 named seats.
    // Shape-driven multipliers (resolveSeedShape) lift this to ~5 in
    // the integration path; this unit pins the BASELINE composition.
    const out = buildStaffSeeds("small");
    expect(out.length).toBe(3);
    for (const s of out) {
      expect(SAMPLE_STAFF_POOL.some(p => p.firstName === s.firstName && p.lastName === s.lastName)).toBe(true);
    }
    expect(out.some(s => s.role === "case_manager")).toBe(true);
    expect(out.some(s => s.role === "bcba")).toBe(true);
    expect(out.some(s => s.role === "provider" && s.title.includes("Speech"))).toBe(true);
  });

  it("medium profile produces the full 8-slot composition baseline", () => {
    const out = buildStaffSeeds("medium", 60);
    expect(out.length).toBeGreaterThanOrEqual(8);
    const roles = new Set(out.map(s => s.role));
    expect(roles.has("case_manager")).toBe(true);
    expect(roles.has("provider")).toBe(true);
  });

  it("synthesizes additional staff when scaledCount exceeds the named pool", () => {
    const out = buildStaffSeeds("small", 20, {
      reqMinutesMonthlyRange: [60, 360],
      staffRatioMultiplier: 1,
      staffOverrides: { caseManager: 8 },
    });
    const cms = out.filter(s => s.role === "case_manager");
    expect(cms.length).toBe(8);
    const synthCms = cms.filter(s => /-case\d+$/.test(s.lastName));
    expect(synthCms.length).toBeGreaterThan(0);
  });

  it("PRE-1 load-aware floor lifts SLP count when caseload pressure is high", () => {
    const out = buildStaffSeeds("large", 300, {
      reqMinutesMonthlyRange: [60, 360],
      staffRatioMultiplier: 1,
      staffOverrides: {},
    });
    const slps = out.filter(s => s.role === "provider" && s.title.includes("Speech"));
    const largeSlot = STAFF_BY_PROFILE.large.find(s => s.titleIncludes === "Speech");
    expect(largeSlot).toBeDefined();
    expect(slps.length).toBeGreaterThan(largeSlot!.count);
  });

  it("STAFF_RATIOS keys all reference roles defined in STAFF_BY_PROFILE", () => {
    const slotKeys = new Set<string>();
    for (const profile of ["small", "medium", "large"] as const) {
      for (const slot of STAFF_BY_PROFILE[profile]) {
        slotKeys.add(slot.titleIncludes ? `${slot.role}:${slot.titleIncludes}` : slot.role);
      }
    }
    for (const k of slotKeys) {
      expect(STAFF_RATIOS[k]).toBeGreaterThan(0);
    }
  });
});

describe("v2/domain/roster/students — buildStudentDefs", () => {
  it("emits exactly profile.students entries by default", () => {
    setSeed(101);
    const defs = buildStudentDefs("medium", 5);
    expect(defs.length).toBe(SIZE_PROFILES.medium.students);
  });

  it("respects overrideTarget", () => {
    setSeed(202);
    const defs = buildStudentDefs("small", 5, 30);
    expect(defs.length).toBe(30);
  });

  it("rotates students across the supplied schools (no single-school bias)", () => {
    setSeed(303);
    const defs = buildStudentDefs("medium", 4);
    const schoolIdxs = new Set(defs.map(d => d.schoolIdx));
    expect(schoolIdxs.size).toBe(4);
  });

  it("is deterministic across two runs against the same seed + profile", () => {
    setSeed(909);
    const a = buildStudentDefs("small", 5);
    setSeed(909);
    const b = buildStudentDefs("small", 5);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].scenario).toBe(b[i].scenario);
      expect(a[i].schoolIdx).toBe(b[i].schoolIdx);
    }
  });

  it("emits stable scenario order: shortfall before urgent before healthy fill", () => {
    setSeed(7);
    const defs = buildStudentDefs("medium", 5);
    const firstShortfall = defs.findIndex(d => d.scenario === "shortfall");
    const firstUrgent = defs.findIndex(d => d.scenario === "urgent");
    const firstHealthy = defs.findIndex(d => d.scenario === "healthy");
    if (firstShortfall !== -1 && firstUrgent !== -1) {
      expect(firstShortfall).toBeLessThan(firstUrgent);
    }
    if (firstUrgent !== -1 && firstHealthy !== -1) {
      expect(firstUrgent).toBeLessThan(firstHealthy);
    }
  });

  it("transition scenario locks the high-school grade band + ID disability", () => {
    setSeed(11);
    const defs = buildStudentDefs("large", 5);
    const transitions = defs.filter(d => d.scenario === "transition");
    expect(transitions.length).toBeGreaterThan(0);
    for (const t of transitions) {
      expect(t.disability).toBe("Intellectual Disability");
      for (const g of t.grades) expect(["10", "11"]).toContain(g);
    }
  });
});

describe("v2/domain/roster/students — resolveSizeProfile", () => {
  it("returns the explicit profile unchanged for non-random inputs", () => {
    setSeed(1);
    expect(resolveSizeProfile("small")).toBe("small");
    expect(resolveSizeProfile("medium")).toBe("medium");
    expect(resolveSizeProfile("large")).toBe("large");
  });

  it("undefined falls back to medium", () => {
    setSeed(1);
    expect(resolveSizeProfile(undefined)).toBe("medium");
  });

  it("random picks one of small/medium/large deterministically per seed", () => {
    setSeed(42);
    const a = resolveSizeProfile("random");
    setSeed(42);
    const b = resolveSizeProfile("random");
    expect(a).toBe(b);
    expect(["small", "medium", "large"]).toContain(a);
  });
});
