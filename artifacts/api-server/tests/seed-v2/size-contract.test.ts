/**
 * T-V2-09 — Size-control contract proof.
 *
 * Pure-unit proof that the canonical V2 size contract:
 *
 *   1. honors `targetStudents` over `sizeProfile`
 *   2. honors `sizeProfile` when `targetStudents` is absent
 *   3. defaults to "medium" when both are absent
 *   4. resolves "random" to a member of {small, medium, large, xl}
 *   5. produces deterministic output given identical inputs
 *   6. surfaces a truthful `withinContract` flag
 *   7. cooperates with `buildStudentDefs` so the actual roster size
 *      matches the contract's resolved target across small / medium / large / xl
 *
 * No DB I/O — these proofs run against the pure domain layer.
 * The DB-backed end-to-end proof lives in
 * `__tests__/sampleData.demo-reset-v2.test.ts` (existing) which exercises
 * the canonical reset path; this file pins the contract resolver itself.
 */
import { describe, it, expect } from "vitest";
import {
  resolveSizeContract,
  buildSizeContractOutcome,
  buildStudentDefs,
  buildStaffSeeds,
  resolveSeedShape,
  SIZE_PROFILES,
  SIZE_PROFILE_RANGES,
} from "@workspace/db/v2/domain";
import { setSeed } from "@workspace/db/v2/platform";

describe("T-V2-09 — resolveSizeContract precedence", () => {
  it("exact targetStudents overrides sizeProfile", () => {
    const c = resolveSizeContract({ sizeProfile: "small", targetStudents: 1750 });
    expect(c.requestedTargetStudents).toBe(1750);
    expect(c.requestedSizeProfile).toBe("small");
    expect(c.resolvedSizeProfile).toBe("small");
    expect(c.resolvedTargetStudents).toBe(1750);
    // 1750 is well outside the 60-120 small band.
    expect(c.withinContract).toBe(false);
    expect(c.contractRange).toEqual({ min: 60, max: 120 });
  });

  it("sizeProfile alone resolves to its mid-point default and reports withinContract=true", () => {
    for (const profile of ["small", "medium", "large", "xl"] as const) {
      const c = resolveSizeContract({ sizeProfile: profile });
      expect(c.requestedSizeProfile).toBe(profile);
      expect(c.requestedTargetStudents).toBeNull();
      expect(c.resolvedSizeProfile).toBe(profile);
      expect(c.resolvedTargetStudents).toBe(SIZE_PROFILES[profile].students);
      expect(c.withinContract).toBe(true);
    }
  });

  it("absence of both inputs resolves to medium (operator default)", () => {
    const c = resolveSizeContract({});
    expect(c.requestedSizeProfile).toBeNull();
    expect(c.requestedTargetStudents).toBeNull();
    expect(c.resolvedSizeProfile).toBe("medium");
    expect(c.resolvedTargetStudents).toBe(350);
    expect(c.withinContract).toBe(true);
  });

  it("'random' picks one of small / medium / large / xl using the seeded RNG", () => {
    setSeed(12345);
    const a = resolveSizeContract({ sizeProfile: "random" });
    setSeed(12345);
    const b = resolveSizeContract({ sizeProfile: "random" });
    expect(["small", "medium", "large", "xl"]).toContain(a.resolvedSizeProfile);
    // Determinism: same seed → same chosen profile.
    expect(a.resolvedSizeProfile).toBe(b.resolvedSizeProfile);
  });

  it("targetStudents is clamped to [1, 5000]", () => {
    expect(resolveSizeContract({ targetStudents: -50 }).resolvedTargetStudents).toBe(1);
    expect(resolveSizeContract({ targetStudents: 99999 }).resolvedTargetStudents).toBe(5000);
  });

  it("identical inputs always produce identical contracts (determinism)", () => {
    const a = resolveSizeContract({ sizeProfile: "large", targetStudents: 950 });
    const b = resolveSizeContract({ sizeProfile: "large", targetStudents: 950 });
    expect(a).toEqual(b);
  });
});

describe("T-V2-09 — buildSizeContractOutcome reports actuals", () => {
  it("flags honoredTargetStudents=true when actual matches resolved target (within 5%)", () => {
    const contract = resolveSizeContract({ sizeProfile: "medium" });
    const outcome = buildSizeContractOutcome(contract, {
      studentsCreated: 348,  // 350 target ± 2
      staffCreated: 22,
    });
    expect(outcome.honoredTargetStudents).toBe(true);
    expect(outcome.actualStudentsCreated).toBe(348);
    expect(outcome.actualStaffCreated).toBe(22);
  });

  it("flags honoredTargetStudents=false when actual diverges materially from resolved target", () => {
    const contract = resolveSizeContract({ sizeProfile: "large" });
    const outcome = buildSizeContractOutcome(contract, {
      studentsCreated: 200, // 1000 target → 80% drift, well past 5% tolerance
      staffCreated: 18,
    });
    expect(outcome.honoredTargetStudents).toBe(false);
  });
});

describe("T-V2-09 — end-to-end roster build at small / medium / large", () => {
  // The full DB-backed seeder is exercised by sampleData.demo-reset-v2.test.ts.
  // Here we run the pure roster builders against the resolved contracts so
  // the proof stays fast (no inserts) while still validating that the
  // student-count-as-requested promise survives buildStudentDefs.
  for (const { profile, expectStaffMin } of [
    { profile: "small"  as const, expectStaffMin: 5  },
    { profile: "medium" as const, expectStaffMin: 16 }, // 350 students / 22 ratio ≈ 16 case mgrs
    { profile: "large"  as const, expectStaffMin: 45 }, // 1000 students / 22 ratio ≈ 45 case mgrs
  ]) {
    it(`profile=${profile}: roster size matches resolved target and staff scales with it`, () => {
      const contract = resolveSizeContract({ sizeProfile: profile });
      // 5 schools is the canonical SCHOOL_NAMES.length.
      const defs = buildStudentDefs(
        contract.resolvedSizeProfile,
        5,
        contract.resolvedTargetStudents,
      );
      // Caps healthy fill at target — never exceeds it.
      expect(defs.length).toBe(contract.resolvedTargetStudents);

      // Ranges check: the resolved target lives inside its contract band.
      const range = SIZE_PROFILE_RANGES[profile];
      expect(defs.length).toBeGreaterThanOrEqual(range.min);
      expect(defs.length).toBeLessThanOrEqual(range.max);

      // Staff auto-scales via STAFF_RATIOS once targetStudents is known.
      const shape = resolveSeedShape({ sizeProfile: profile });
      const staff = buildStaffSeeds(
        contract.resolvedSizeProfile,
        contract.resolvedTargetStudents,
        shape,
      );
      expect(staff.length).toBeGreaterThanOrEqual(expectStaffMin);
      // Sanity: ALL profiles emit at least one case manager + one BCBA + one SLP.
      expect(staff.some(s => s.role === "case_manager")).toBe(true);
      expect(staff.some(s => s.role === "bcba")).toBe(true);
      expect(staff.some(s => s.title.includes("Speech"))).toBe(true);
    });
  }

  it("targetStudents=900 with profile=large resolves to 900 exactly and stays within contract", () => {
    const contract = resolveSizeContract({ sizeProfile: "large", targetStudents: 900 });
    expect(contract.resolvedTargetStudents).toBe(900);
    expect(contract.withinContract).toBe(true); // 900 ∈ [800, 1200]
    const defs = buildStudentDefs("large", 5, contract.resolvedTargetStudents);
    expect(defs.length).toBe(900);
  });

  it("targetStudents=1900 with profile=xl resolves to 1900 and stays within contract", () => {
    const contract = resolveSizeContract({ sizeProfile: "xl", targetStudents: 1900 });
    expect(contract.resolvedTargetStudents).toBe(1900);
    expect(contract.withinContract).toBe(true); // 1900 ∈ [1500, 2000]
    const defs = buildStudentDefs("xl", 5, contract.resolvedTargetStudents);
    expect(defs.length).toBe(1900);
  });
});
