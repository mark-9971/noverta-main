/**
 * Seed Overhaul V2 — Public entry point.
 *
 * Stable import path for all V2 layers. Wave-by-wave roadmap lives in
 * `.local/plans/seed-overhaul-v2.md`. W1 surfaces the platform layer +
 * scenarios registry + post-run summary; the simulator/domain/overlay
 * boundaries exist but are placeholders until W2/W3/W5.
 */
export * as platform from "./platform";
export * as scenarios from "./scenarios";
export * as simulator from "./simulator";
export * as domain from "./domain";
export * as overlay from "./overlay";
export * from "./postRunSummary";
