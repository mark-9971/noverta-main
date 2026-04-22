/**
 * Seed Overhaul V2 — Platform / Teardown re-export shim.
 *
 * The full teardown body (≈250 LOC of FK-graph BFS + replica-role
 * transaction) lives in `seed-sample-data.ts` and is kept there in W1
 * to avoid behavior risk during platform extraction. This module
 * exists so later waves (and tests) can import the canonical teardown
 * entry point through a stable `v2/platform/` path.
 *
 * Migration plan: in W2 or W6, the body itself moves into this file
 * and `seed-sample-data.ts` imports it instead of defining it. Until
 * then this is a one-line re-export — intentional, and called out so
 * a code reviewer doesn't think the extraction was forgotten.
 */
export { teardownSampleData, type TeardownSampleResult } from "../../seed-sample-data";
