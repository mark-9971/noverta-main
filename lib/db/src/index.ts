export { db, pool } from "./db";
export { runMigrations, assertCoreSchemaPresent } from "./migrate";
export type { MigrationRunResult } from "./migrate";
export * from "./schema";
export * from "./seed-sample-data";
export * from "./backfill-goal-progress";
export { seedDemoComplianceVariety } from "./seed-demo-compliance-variety";
export type { DemoComplianceVarietyResult } from "./seed-demo-compliance-variety";
export { seedDemoModules } from "./seed-demo-modules";
export { seedDemoDistrict } from "./seed-demo-district";
export {
  DEMO_IDENTITIES,
  isDemoIdentityEmail,
  findDemoIdentity,
  findDemoDistrictId,
  seedDemoIdentities,
  ensureDemoStaffForEmail,
} from "./seed-demo-identities";
export type { DemoIdentity } from "./seed-demo-identities";
