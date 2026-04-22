/**
 * Seed Overhaul V2 — Platform / Typed seed-error registry.
 *
 * The api-server's POST /api/sample-data route classifies thrown seeder
 * errors into operator-facing codes (SEED_CAPACITY_VIOLATION, …) by
 * regex-matching Error.message strings. That coupling is fragile but
 * intentional in W1: changing the route classifier is W6 cutover work.
 *
 * For now V2 ships:
 *   - the canonical code list as a typed union
 *   - SeedError class that carries a code field directly
 *   - throwIfNegative / format helpers used by capacity.ts callers
 *
 * The route classifier still owns the regex match — it now has a typed
 * `SeedErrorCode` to compare against rather than ad-hoc strings, and
 * (later) can switch to direct `err instanceof SeedError` checks once
 * every throw path uses SeedError.
 */

export type SeedErrorCode =
  | "SEED_CAPACITY_VIOLATION"
  | "SEED_DISTRICT_PROVISION_FAILED"
  | "SEED_DUPLICATE_ROW"
  | "SEED_FK_VIOLATION"
  | "SEED_UNKNOWN_ERROR";

export const SEED_ERROR_CODES: ReadonlyArray<SeedErrorCode> = [
  "SEED_CAPACITY_VIOLATION",
  "SEED_DISTRICT_PROVISION_FAILED",
  "SEED_DUPLICATE_ROW",
  "SEED_FK_VIOLATION",
  "SEED_UNKNOWN_ERROR",
];

export class SeedError extends Error {
  readonly code: SeedErrorCode;
  readonly detail: string;
  constructor(code: SeedErrorCode, detail: string) {
    super(detail);
    this.name = "SeedError";
    this.code = code;
    this.detail = detail;
  }
}
