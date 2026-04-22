/**
 * V2 platform / RNG — extracted determinism contract.
 *
 * The seeder relies on byte-identical output for two runs against the
 * same district id. Wave 1 moved setSeed/srand/rand/randf/pick/sshuffle
 * out of `seed-sample-data.ts` into `lib/db/src/v2/platform/rng.ts`.
 * This test guards the contract:
 *
 *   1. setSeed(N) followed by the same call sequence yields the same
 *      stream of values across two independent runs.
 *   2. forkStream(name) does NOT advance the shared seed state — a
 *      property later waves rely on so existing call sites stay
 *      byte-identical even after per-stream noise is added.
 */
import { describe, it, expect } from "vitest";
import {
  setSeed, srand, rand, randf, pick, sshuffle,
  forkStream, _peekSeedState,
} from "@workspace/db/v2/platform";

function takeStream(seed: number, n: number): number[] {
  setSeed(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(srand());
  return out;
}

describe("v2/platform/rng — determinism", () => {
  it("setSeed → srand stream is byte-identical across runs", () => {
    const a = takeStream(42, 64);
    const b = takeStream(42, 64);
    expect(a).toEqual(b);
  });

  it("different seeds produce different streams", () => {
    const a = takeStream(7, 16);
    const b = takeStream(8, 16);
    expect(a).not.toEqual(b);
  });

  it("rand() returns integer in [min,max] inclusive", () => {
    setSeed(1);
    for (let i = 0; i < 200; i++) {
      const v = rand(3, 9);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
  });

  it("randf() returns float in [min,max)", () => {
    setSeed(1);
    for (let i = 0; i < 200; i++) {
      const v = randf(0, 1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("pick() returns an element of the source array", () => {
    setSeed(1);
    const arr = ["a", "b", "c", "d"] as const;
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(pick(arr));
    }
  });

  it("sshuffle() returns same multiset as input", () => {
    setSeed(1);
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = sshuffle(src);
    expect(out.slice().sort()).toEqual(src.slice().sort());
  });

  it("forkStream(name) does NOT advance the shared seed state", () => {
    setSeed(123);
    const before = _peekSeedState();
    const fork = forkStream("simulator-day-tick");
    // Draw a bunch from the fork.
    for (let i = 0; i < 64; i++) fork.srand();
    expect(_peekSeedState()).toBe(before);
    // Shared srand still picks up where it left off.
    const next = srand();
    setSeed(123);
    expect(srand()).toBe(next);
  });

  it("forkStream(name) is itself deterministic for same name + state", () => {
    setSeed(99);
    const a = forkStream("alpha");
    const av = [a.srand(), a.srand(), a.srand()];
    setSeed(99);
    const b = forkStream("alpha");
    const bv = [b.srand(), b.srand(), b.srand()];
    expect(av).toEqual(bv);
  });

  it("forkStream(name) varies by name", () => {
    setSeed(99);
    const a = forkStream("alpha");
    setSeed(99);
    const b = forkStream("beta");
    expect(a.srand()).not.toBe(b.srand());
  });
});
