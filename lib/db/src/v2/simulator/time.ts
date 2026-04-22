/**
 * Seed Overhaul V2 — Simulator / Calendar utilities (W3).
 *
 * Pure date-math helpers used by the day-by-day loop. No RNG, no I/O.
 *
 * The simulator runs over a contiguous 270-calendar-day window. We
 * deliberately do NOT subtract weekends from `totalDays` — the loop
 * walks every calendar day, and `isSchoolDay()` filters out weekends
 * inside the per-day work. That keeps `day` indices stable across
 * scenarios that need to reason about *calendar* offsets (alert
 * handling SLAs, comp-period windows) without re-deriving them from
 * a school-day cursor.
 *
 * Holidays (MA SPED calendar gaps — winter recess, April vacation, the
 * MA-specific Patriots' Day) are intentionally NOT modeled in W3. The
 * V2 plan defers school-calendar fidelity to the post-cutover window
 * because pinning real holidays would require a per-district calendar
 * source we don't have yet. Tests pin behavior under the simpler
 * weekday-only model so the cutover can swap a calendar in cleanly.
 */

/** W3 simulation length in calendar days. */
export const SIMULATION_DAYS = 270;

/** Number of milliseconds in one calendar day, UTC. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Default deterministic epoch anchor. Pinned to a Monday so the
 * weekday math (`isSchoolDay`, end-of-week alert checkpoints) lines up
 * predictably from day=0.
 *
 * The simulator's determinism contract REQUIRES an epoch that does not
 * depend on wall-clock time. W3 deliberately rejects a "today minus
 * 270" default (architect HIGH finding) — same input, same output, no
 * matter what Date.now() is. The seeder may pass an explicit
 * `epochDate` in W4+ to align the simulation window to "now"; that
 * choice is the caller's, not the simulator's.
 */
export const DEFAULT_EPOCH_DATE = "2024-09-02";

/**
 * Returns the deterministic default epoch. Kept as a function so
 * callers can adapt the policy later (e.g. derive from a seed) without
 * changing the public API.
 */
export function defaultEpochDate(): string {
  return DEFAULT_EPOCH_DATE;
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Return the YYYY-MM-DD for `epochDate + dayOffset`. */
export function dateForDay(epochDate: string, dayOffset: number): string {
  const epoch = new Date(epochDate + "T00:00:00Z");
  const out = new Date(epoch.getTime() + dayOffset * DAY_MS);
  return toIsoDate(out);
}

/** Day-of-week (0=Sun..6=Sat) for a given day offset from epoch. */
export function dowForDay(epochDate: string, dayOffset: number): number {
  const epoch = new Date(epochDate + "T00:00:00Z");
  return new Date(epoch.getTime() + dayOffset * DAY_MS).getUTCDay();
}

/** True for Monday–Friday. Weekends short-circuit the per-day work. */
export function isSchoolDay(epochDate: string, dayOffset: number): boolean {
  const dow = dowForDay(epochDate, dayOffset);
  return dow >= 1 && dow <= 5;
}

/** Zero-based week index a given day belongs to. */
export function weekIdxForDay(dayOffset: number): number {
  return Math.floor(dayOffset / 7);
}
