/**
 * V2 platform / capacity — load-aware provider floor.
 *
 * Wave 1 extracted PRE-1's per-specialty load-aware floor math into
 * `lib/db/src/v2/platform/capacity.ts`. This test pins the contract
 * the seeder relies on:
 *
 *   1. Specialty WITHOUT a SPECIALTY_LOAD_SHARE entry → null (no clamp).
 *   2. Zero / negative target students → null.
 *   3. The returned floor keeps every provider strictly under
 *      PROVIDER_MONTHLY_MIN_CAPACITY when each student in the
 *      specialty's share consumes the upper-bound monthly minutes.
 *   4. Headroom (+1) — at least one extra provider above the strict
 *      ceil() so provisioning is never exactly 100% utilization.
 */
import { describe, it, expect } from "vitest";
import {
  loadAwareFloor, SPECIALTY_LOAD_SHARE, PROVIDER_MONTHLY_MIN_CAPACITY,
} from "@workspace/db/v2/platform";

describe("v2/platform/capacity — loadAwareFloor", () => {
  it("returns null for unknown specialty key", () => {
    expect(loadAwareFloor("provider:Unknown", 100, [60, 360])).toBeNull();
    expect(loadAwareFloor("admin", 100, [60, 360])).toBeNull();
  });

  it("returns null when there are no students", () => {
    expect(loadAwareFloor("provider:Speech", 0, [60, 360])).toBeNull();
    expect(loadAwareFloor("provider:Speech", -5, [60, 360])).toBeNull();
  });

  it("clamp keeps each provider under PROVIDER_MONTHLY_MIN_CAPACITY at the worst-case minute draw", () => {
    const targetStudents = 100;
    const reqRange: readonly [number, number] = [60, 360];
    for (const ratioKey of Object.keys(SPECIALTY_LOAD_SHARE)) {
      const floor = loadAwareFloor(ratioKey, targetStudents, reqRange);
      expect(floor).not.toBeNull();
      const share = SPECIALTY_LOAD_SHARE[ratioKey];
      const worstAvgMin = reqRange[1];
      const expectedMinutes = targetStudents * share * worstAvgMin;
      const perProvider = expectedMinutes / floor!;
      expect(perProvider).toBeLessThan(PROVIDER_MONTHLY_MIN_CAPACITY);
    }
  });

  it("includes +1 headroom over the strict ceil() bound", () => {
    const targetStudents = 100;
    const reqRange: readonly [number, number] = [60, 360];
    for (const ratioKey of Object.keys(SPECIALTY_LOAD_SHARE)) {
      const share = SPECIALTY_LOAD_SHARE[ratioKey];
      const worstAvgMin = reqRange[1];
      const tight = Math.ceil((targetStudents * share * worstAvgMin) / PROVIDER_MONTHLY_MIN_CAPACITY);
      const floor = loadAwareFloor(ratioKey, targetStudents, reqRange)!;
      expect(floor).toBe(tight + 1);
    }
  });

  it("scales linearly with roster size", () => {
    const small = loadAwareFloor("provider:Speech", 50, [60, 360])!;
    const big   = loadAwareFloor("provider:Speech", 500, [60, 360])!;
    expect(big).toBeGreaterThan(small);
  });

  it("PROVIDER_MONTHLY_MIN_CAPACITY matches the validator envelope (≈ 8473 min/mo)", () => {
    expect(PROVIDER_MONTHLY_MIN_CAPACITY).toBeGreaterThan(8400);
    expect(PROVIDER_MONTHLY_MIN_CAPACITY).toBeLessThan(8500);
  });
});
