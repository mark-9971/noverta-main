/**
 * Seed Overhaul V2 — Domain foundation barrel (W2).
 *
 * Aggregates the stable domain-building modules that sit above the
 * platform substrate (`./platform`) and below the future event-loop
 * simulator (`./simulator`, W3). Wave 2 promotes this layer from the
 * W1 placeholder marker into a real surface:
 *
 *   - `./reference`  — bounds, size profiles, name pools, school +
 *                      service-type catalogs, disability/grade lookups,
 *                      pure date helpers.
 *   - `./roster/staff`    — SAMPLE_STAFF_POOL, STAFF_BY_PROFILE,
 *                           STAFF_RATIOS, buildStaffSeeds().
 *   - `./roster/students` — StudentDef builder, resolveSizeProfile(),
 *                           StudentSpec.
 *   - `./clinical`   — GOAL_BANK, ACCOM_BANK.
 *   - `./shape`      — SeedSampleOptions, SeedShape, resolveSeedShape(),
 *                      DemoEmphasis, INTENSITY_TO_* range tables.
 *
 * Things intentionally NOT in W2 (deferred to W3+):
 *   - the actual DB inserts for districts / schools / staff / students /
 *     IEPs / goals / SRs (still inside `seedSampleDataForDistrict()`)
 *   - the 9-month event-loop session simulator
 *   - the demo-overlay layer
 */

export * from "./reference";
export * from "./roster/staff";
export * from "./roster/students";
export * from "./clinical";
export * from "./shape";

export const DOMAIN_LAYER_VERSION = "w2";
