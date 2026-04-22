/**
 * V2 domain / shape — resolveSeedShape.
 *
 * `resolveSeedShape` is the single funnel that converts the operator-
 * supplied `SeedSampleOptions` into the deterministic `SeedShape` the
 * roster + scenario builders read. W2 extracted it from
 * `seed-sample-data.ts`. This test pins three contracts:
 *
 *   1. Determinism: same seed + opts → same shape.
 *   2. Range respect: each Intensity tier produces multipliers inside
 *      the documented INTENSITY_TO_* range tables.
 *   3. Backfill bounds: backfillDays clamped to [180, 365] regardless
 *      of months input.
 */
import { describe, it, expect } from "vitest";
import {
  resolveSeedShape,
  INTENSITY_TO_COMPLETION_RANGE,
  INTENSITY_TO_ONTIME_RANGE,
  INTENSITY_TO_STAFFRATIO_RANGE,
  INTENSITY_TO_SCALE_RANGE,
  DOMAIN_LAYER_VERSION,
} from "@workspace/db/v2/domain";
import { setSeed } from "@workspace/db/v2/platform";

describe("v2/domain — barrel marker", () => {
  it("exports DOMAIN_LAYER_VERSION = 'w2'", () => {
    expect(DOMAIN_LAYER_VERSION).toBe("w2");
  });
});

describe("v2/domain/shape — resolveSeedShape determinism", () => {
  it("emits identical shapes for two runs against the same seed", () => {
    setSeed(1234);
    const a = resolveSeedShape({ sizeProfile: "medium" });
    setSeed(1234);
    const b = resolveSeedShape({ sizeProfile: "medium" });
    expect(a).toEqual(b);
  });
});

describe("v2/domain/shape — Intensity tier ranges respected", () => {
  it("medium-tier multipliers all land inside INTENSITY_TO_* medium bounds", () => {
    setSeed(7);
    const s = resolveSeedShape({
      sizeProfile: "medium",
      complianceHealth: "medium",
      documentationQuality: "medium",
      staffingStrain: "medium",
      compensatoryExposure: "medium",
      behaviorIntensity: "medium",
    });
    const [cLo, cHi] = INTENSITY_TO_COMPLETION_RANGE.medium;
    const [oLo, oHi] = INTENSITY_TO_ONTIME_RANGE.medium;
    const [rLo, rHi] = INTENSITY_TO_STAFFRATIO_RANGE.medium;
    const [scLo, scHi] = INTENSITY_TO_SCALE_RANGE.medium;
    expect(s.completionMultiplier).toBeGreaterThanOrEqual(cLo);
    expect(s.completionMultiplier).toBeLessThanOrEqual(cHi);
    expect(s.onTimeLogProb).toBeGreaterThanOrEqual(oLo);
    expect(s.onTimeLogProb).toBeLessThanOrEqual(oHi);
    expect(s.staffRatioMultiplier).toBeGreaterThanOrEqual(rLo);
    expect(s.staffRatioMultiplier).toBeLessThanOrEqual(rHi);
    // scenarioWeights.crisis is sourced from the comp/scale RNG draw.
    const crisis = s.scenarioWeights.crisis ?? -1;
    expect(crisis).toBeGreaterThanOrEqual(scLo);
    expect(crisis).toBeLessThanOrEqual(scHi);
  });

  it("high tier produces strictly higher multipliers than low tier (in expectation)", () => {
    // Sample several seeds and confirm the means are monotone.
    function mean(get: () => number) {
      let sum = 0;
      for (let seed = 1; seed <= 20; seed++) {
        setSeed(seed);
        sum += get();
      }
      return sum / 20;
    }
    const lowMean  = mean(() => resolveSeedShape({ sizeProfile: "medium", staffingStrain: "low" }).staffRatioMultiplier);
    const highMean = mean(() => resolveSeedShape({ sizeProfile: "medium", staffingStrain: "high" }).staffRatioMultiplier);
    expect(highMean).toBeGreaterThan(lowMean);
  });
});

describe("v2/domain/shape — backfill bounds", () => {
  it("clamps backfillDays into [180, 365] even when months is extreme", () => {
    setSeed(1);
    const tiny  = resolveSeedShape({ sizeProfile: "small", backfillMonths: 1 });
    setSeed(1);
    const huge  = resolveSeedShape({ sizeProfile: "small", backfillMonths: 36 });
    expect(tiny.backfillDays).toBeGreaterThanOrEqual(180);
    expect(tiny.backfillDays).toBeLessThanOrEqual(365);
    expect(huge.backfillDays).toBeGreaterThanOrEqual(180);
    expect(huge.backfillDays).toBeLessThanOrEqual(365);
  });
});
