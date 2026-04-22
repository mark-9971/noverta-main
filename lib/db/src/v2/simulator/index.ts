/**
 * Seed Overhaul V2 — Simulator boundary (W1 placeholder).
 *
 * The 9-month event-loop simulator (W3 in the V2 plan) lives behind
 * this boundary. W1 only stakes the import path; the day-by-day clock,
 * session resolver, alert engine, comp engine, and IEP lifecycle code
 * are NOT here yet. The seeder still emits sessions/alerts via its
 * pre-V2 cadence + back-derivation path inside seed-sample-data.ts.
 *
 * Adding logic here in W1 would breach the "no later-wave behavior in
 * W1" rule. Real simulator code lands in W3.
 */

/** Marker so the simulator boundary is importable without errors. */
export const SIMULATOR_LAYER_VERSION = "w1-placeholder";
