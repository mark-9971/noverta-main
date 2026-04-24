/**
 * Seed Overhaul V2 — T-V2-09 size-control contract.
 *
 * Pure resolver that turns the size-related fields of `SeedSampleOptions`
 * (`sizeProfile`, `targetStudents`) into a deterministic, fully-resolved
 * shape every downstream consumer can branch on:
 *
 *   - the seeder body (drives student / staff counts)
 *   - the post-run summary (reports requested-vs-resolved truth)
 *   - the operator-facing reset routes (passes inputs through verbatim)
 *
 * Precedence rules (codified by `resolveSizeContract`):
 *
 *   1. Exact `targetStudents` (1 – 5000) wins everything. The chosen
 *      `sizeProfile` (or its default) still drives scenario distribution
 *      and staff slot composition; only the student row count is
 *      replaced by the explicit value.
 *   2. Otherwise `sizeProfile` selects a profile whose
 *      `SIZE_PROFILES[profile].students` becomes the target.
 *   3. When both are absent the contract resolves to the operator default
 *      (`medium`, ~350 students). The implicit ~50–100 random override
 *      that previously kicked in here was retired in T-V2-09 — operators
 *      who want a small district must say so explicitly.
 *
 * Determinism: same `(districtId, sizeProfile, targetStudents)` triple
 * always resolves to the same contract, because the only nondeterministic
 * branch (`sizeProfile === "random"`) consults the seeded RNG keyed to
 * the district id (see `resolveSizeProfile` and `platform/rng`).
 */

import {
  type SizeProfile,
  SIZE_PROFILES,
  SIZE_PROFILE_RANGES,
} from "./reference";
import { resolveSizeProfile } from "./roster/students";

/** Hard clamps applied before the contract is resolved. */
export const TARGET_STUDENTS_BOUNDS: readonly [number, number] = [1, 5000];

/** Fully-resolved size contract. */
export interface ResolvedSizeContract {
  /** Verbatim copy of what the caller passed in (or null). */
  requestedTargetStudents: number | null;
  requestedSizeProfile: SizeProfile | null;

  /** The concrete profile after `resolveSizeProfile` (never "random"). */
  resolvedSizeProfile: Exclude<SizeProfile, "random">;

  /** The student count the seeder will actually try to create. */
  resolvedTargetStudents: number;

  /** The documented student-count band for `resolvedSizeProfile`. */
  contractRange: { min: number; max: number };

  /**
   * True iff `resolvedTargetStudents` falls within `contractRange`.
   * False when the operator explicitly requested a count outside the
   * profile's band — which is allowed and not an error, but is
   * surfaced in the post-run summary so an operator/auditor can see
   * "you asked for 50 with profile=medium; that's below the medium 200–500 band."
   */
  withinContract: boolean;
}

/** Inputs accepted by `resolveSizeContract`. Subset of `SeedSampleOptions`. */
export interface SizeContractInputs {
  sizeProfile?: SizeProfile;
  targetStudents?: number;
}

/**
 * Resolve the operator's size-related inputs into the canonical
 * `ResolvedSizeContract`. Pure: same inputs always produce the same
 * output. The caller passes the result into both the seeder body and
 * `buildPostRunSummary`.
 */
export function resolveSizeContract(opts: SizeContractInputs): ResolvedSizeContract {
  const requestedSizeProfile = opts.sizeProfile ?? null;
  const requestedTargetStudents = clampTarget(opts.targetStudents);

  const resolvedSizeProfile = resolveSizeProfile(opts.sizeProfile);

  const resolvedTargetStudents = requestedTargetStudents != null
    ? requestedTargetStudents
    : SIZE_PROFILES[resolvedSizeProfile].students;

  const contractRange = SIZE_PROFILE_RANGES[resolvedSizeProfile];
  const withinContract = resolvedTargetStudents >= contractRange.min
    && resolvedTargetStudents <= contractRange.max;

  return {
    requestedTargetStudents,
    requestedSizeProfile,
    resolvedSizeProfile,
    resolvedTargetStudents,
    contractRange: { min: contractRange.min, max: contractRange.max },
    withinContract,
  };
}

function clampTarget(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const [lo, hi] = TARGET_STUDENTS_BOUNDS;
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

/**
 * Post-run "did the seeder honor the contract?" check. Compares the
 * actual created student count (post-cap, post-rollback) against the
 * resolved target. The seeder's roster-builder caps healthy fill at
 * `target` and never exceeds it, so `actualStudentsCreated <= resolved`
 * is the expected shape; anything below 95% of resolved is a drift
 * worth surfacing in the summary.
 */
export interface SizeContractOutcome extends ResolvedSizeContract {
  actualStudentsCreated: number;
  actualStaffCreated: number;
  /**
   * True iff the actual student count matched the resolved target
   * (to within the 5% tolerance the caps + scenario clamps allow).
   */
  honoredTargetStudents: boolean;
}

export function buildSizeContractOutcome(
  contract: ResolvedSizeContract,
  actual: { studentsCreated: number; staffCreated: number },
): SizeContractOutcome {
  const tolerance = Math.max(1, Math.ceil(contract.resolvedTargetStudents * 0.05));
  const honoredTargetStudents = Math.abs(
    actual.studentsCreated - contract.resolvedTargetStudents,
  ) <= tolerance;
  return {
    ...contract,
    actualStudentsCreated: actual.studentsCreated,
    actualStaffCreated: actual.staffCreated,
    honoredTargetStudents,
  };
}
