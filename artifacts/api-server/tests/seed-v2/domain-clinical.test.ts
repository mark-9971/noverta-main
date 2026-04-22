/**
 * V2 domain / clinical — IEP content banks.
 *
 * GOAL_BANK and ACCOM_BANK seed every student's IEP. Wave 2 extracted
 * them out of `seed-sample-data.ts`. This test pins:
 *   - both banks are populated and well-formed,
 *   - GOAL_BANK is keyed by IEP goal area (Communication, Academics, …),
 *     each entry holds {annual, baseline, criterion} triples,
 *   - ACCOM_BANK entries are {category, description} objects.
 */
import { describe, it, expect } from "vitest";
import { GOAL_BANK, ACCOM_BANK } from "@workspace/db/v2/domain";

describe("v2/domain/clinical — banks", () => {
  it("GOAL_BANK covers the canonical goal areas the seeder samples from", () => {
    const keys = Object.keys(GOAL_BANK);
    for (const required of ["Communication", "Social Skills", "Academics", "Behavior"]) {
      expect(keys).toContain(required);
    }
  });

  it("Every GOAL_BANK entry holds {annual, baseline, criterion} triples", () => {
    for (const [area, goals] of Object.entries(GOAL_BANK)) {
      expect(Array.isArray(goals), `bank[${area}] not an array`).toBe(true);
      expect(goals.length, `bank[${area}] empty`).toBeGreaterThan(0);
      for (const g of goals) {
        expect(typeof g.annual).toBe("string");
        expect(typeof g.baseline).toBe("string");
        expect(typeof g.criterion).toBe("string");
      }
    }
  });

  it("ACCOM_BANK is a populated list of {category, description}", () => {
    expect(Array.isArray(ACCOM_BANK)).toBe(true);
    expect(ACCOM_BANK.length).toBeGreaterThanOrEqual(5);
    for (const a of ACCOM_BANK) {
      expect(typeof a.category).toBe("string");
      expect(typeof a.description).toBe("string");
    }
    // Spot-check the documented category coverage (instruction +
    // assessment + environmental + behavioral + technology).
    const cats = new Set(ACCOM_BANK.map(a => a.category));
    for (const c of ["instruction", "assessment", "environmental", "behavioral", "technology"]) {
      expect(cats.has(c)).toBe(true);
    }
  });
});
