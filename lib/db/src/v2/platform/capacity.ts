/**
 * Seed Overhaul V2 — Platform / Provider capacity clamp.
 *
 * Extracted from `seed-sample-data.ts` (PRE-1 + W1).
 *
 * The seeder must guarantee that for every provider specialty, the
 * total monthly minutes the seeded service-requirement set will demand
 * stays under each provider's monthly capacity envelope. Without this
 * clamp the seeder's own default options can deterministically trip
 * the SR-insert validator (PROVIDER_MONTHLY_MIN_CAPACITY ≈ 8473 min/mo)
 * and 500 the route — which is exactly the failure mode PRE-1 fixed.
 *
 * Two pieces are exported:
 *   - SPECIALTY_LOAD_SHARE / PROVIDER_MONTHLY_MIN_CAPACITY constants
 *   - loadAwareFloor(): pure arithmetic over those constants. The
 *     existing buildStaffSeeds() function in seed-sample-data.ts now
 *     calls into this helper instead of inlining the math.
 */

/**
 * Conservative per-specialty share of the roster — i.e. what fraction
 * of the total student count is expected to receive a given specialty's
 * services based on the default `studentSpecs` distribution.
 *
 * Intentionally over-estimates so providers are never seeded at >100%
 * utilization. PRE-1 precondition fix, not the final V2 staffing model
 * (W2 will re-derive these from the simulated 9-month service plan).
 */
export const SPECIALTY_LOAD_SHARE: Record<string, number> = {
  "bcba":                      0.40,
  "provider:Speech":           0.60,
  "provider:Occupational":     0.45,
  "provider:Physical":         0.35,
  "provider:Counselor":        0.55,
};

/**
 * Per-provider monthly minute capacity envelope:
 *   5 days/wk × 6.5 hrs/day × 60 min/hr × 4.345 wks/mo  ≈ 8473 min/mo
 * Matches the envelope enforced at the SR-insert validator step.
 */
export const PROVIDER_MONTHLY_MIN_CAPACITY = 5 * 6.5 * 60 * 4.345;

/**
 * Load-aware provider-count floor for one specialty slot.
 *
 * Returns the minimum number of providers needed so that, assuming
 * worst-case (upper-bound) per-student monthly minutes, no provider in
 * the specialty exceeds PROVIDER_MONTHLY_MIN_CAPACITY. Adds +1
 * headroom so providers are never seeded at >100% utilization.
 *
 * Returns null when the specialty has no declared SPECIALTY_LOAD_SHARE
 * (in which case no clamp applies).
 */
export function loadAwareFloor(
  ratioKey: string,
  targetStudents: number,
  reqMinutesMonthlyRange: readonly [number, number],
): number | null {
  if (!targetStudents || targetStudents <= 0) return null;
  const share = SPECIALTY_LOAD_SHARE[ratioKey];
  if (share == null) return null;
  // Use upper bound for safety; SR rows draw uniformly from the range,
  // so the worst-case specialty load is bounded above by max-min × N.
  const worstAvgMin = reqMinutesMonthlyRange[1];
  const expectedMinutes = targetStudents * share * worstAvgMin;
  return Math.ceil(expectedMinutes / PROVIDER_MONTHLY_MIN_CAPACITY) + 1;
}
