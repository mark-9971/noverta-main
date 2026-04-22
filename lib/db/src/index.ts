export { db, pool } from "./db";
export { runMigrations, assertCoreSchemaPresent, assertSchemaColumnsPresent } from "./migrate";
export type { MigrationRunResult } from "./migrate";
export * from "./schema";
export * from "./seed-sample-data";
export * from "./backfill-goal-progress";
export { seedDemoComplianceVariety } from "./seed-demo-compliance-variety";
export type { DemoComplianceVarietyResult } from "./seed-demo-compliance-variety";
export { seedDemoModules } from "./seed-demo-modules";
export { seedDemoDistrict } from "./seed-demo-district";
export { seedDemoHandlingState, buildDemoHandlingRows } from "./seed-demo-handling-state";
export type { SeedDemoHandlingStateResult } from "./seed-demo-handling-state";
export {
  DEMO_IDENTITIES,
  isDemoIdentityEmail,
  findDemoIdentity,
  findDemoDistrictId,
  seedDemoIdentities,
  ensureDemoStaffForEmail,
} from "./seed-demo-identities";
export type { DemoIdentity } from "./seed-demo-identities";

// Seed Overhaul V2 (W1) — re-export the post-run summary builder so
// callers can import it from `@workspace/db` without reaching into the
// `v2` subpath. The platform / scenarios / simulator / domain / overlay
// namespaces are available via `@workspace/db/v2` and `@workspace/db/v2/platform`.
export { buildPostRunSummary } from "./v2/postRunSummary";
export type { PostRunSummary, ScenarioCounts, SeedSampleResultLite } from "./v2/postRunSummary";
