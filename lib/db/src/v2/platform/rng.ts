/**
 * Seed Overhaul V2 — Platform / RNG.
 *
 * Extracted from `seed-sample-data.ts` (W1 platform extraction).
 * Behavior is byte-identical to the original inline implementation; this
 * module exists so later waves (W3 simulator, W4 role profiles) can fork
 * named per-stream RNG handles off a shared district seed without each
 * caller redefining its own copy of mulberry32.
 *
 * Determinism contract:
 *   setSeed(districtId)  // installs the district's stream
 *   srand()/rand()/...   // every call advances the same shared state
 *
 * `forkStream(name)` returns a NEW independent generator seeded from a
 * mix of the current state and the stream name. It does NOT advance the
 * shared state, so existing call sites remain byte-identical even after
 * later waves start asking for forked streams.
 */

let _seedState = 0x9e3779b9 >>> 0;

export function setSeed(seedSrc: number): void {
  let x = (seedSrc | 0) || 0x9e3779b9;
  x = (x ^ 0xdeadbeef) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  _seedState = x || 0x9e3779b9;
}

export function srand(): number {
  _seedState = (_seedState + 0x6d2b79f5) >>> 0;
  let t = _seedState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rand(min: number, max: number): number {
  return Math.floor(srand() * (max - min + 1)) + min;
}

export function randf(min: number, max: number): number {
  return min + srand() * (max - min);
}

export function pick<T>(arr: ReadonlyArray<T>): T {
  return arr[Math.floor(srand() * arr.length)];
}

export function sshuffle<T>(arr: ReadonlyArray<T>): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(srand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Snapshot the current shared seed state. Useful for tests asserting
 * that an extracted helper does not advance the shared stream when it
 * is supposed to be side-effect-free.
 */
export function _peekSeedState(): number {
  return _seedState;
}

/**
 * Build an independent RNG handle seeded by mixing the shared state with
 * a stream name. Forking does NOT advance the shared state — this is the
 * property that lets later waves (W3 simulator daily ticks, W4 operator
 * role profiles) draw from per-stream noise without breaking byte-identity
 * of pre-existing call sites that still use srand() / rand() / pick().
 *
 * Not yet used; provided as a stable API surface for W3+.
 */
export interface RngHandle {
  srand(): number;
  rand(min: number, max: number): number;
  randf(min: number, max: number): number;
  pick<T>(arr: ReadonlyArray<T>): T;
}

export function forkStream(name: string): RngHandle {
  let s = _seedState >>> 0;
  for (let i = 0; i < name.length; i++) {
    s = Math.imul(s ^ name.charCodeAt(i), 0x85ebca6b) >>> 0;
    s = (s ^ (s >>> 13)) >>> 0;
  }
  s = (s ^ 0x9e3779b9) >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return {
    srand() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    rand(min, max) { return Math.floor(this.srand() * (max - min + 1)) + min; },
    randf(min, max) { return min + this.srand() * (max - min); },
    pick(arr) { return arr[Math.floor(this.srand() * arr.length)]; },
  };
}
