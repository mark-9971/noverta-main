/**
 * Seed Overhaul V2 — Platform layer public surface.
 *
 * Stable substrate that later waves (W2 domain, W3 simulator, W4 role
 * profiles, W5 overlay) can depend on without reaching into
 * seed-sample-data.ts. Behavior here is byte-identical to the
 * pre-extraction inline implementations.
 */
export * from "./rng";
export * from "./tx";
export * from "./capacity";
export * from "./errors";
export * from "./runMetadata";
export * from "./teardown";
