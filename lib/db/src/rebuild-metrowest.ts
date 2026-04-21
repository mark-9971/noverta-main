/**
 * One-shot rebuild of the MetroWest Collaborative demo district to a
 * realistic-ratio profile.
 *
 * Replaces the current state (2,000 students / 247 staff with 115 RBTs each
 * carrying ~1,000-student caseloads) with:
 *
 *   • 600 students
 *   • 6 schools (3 elementary, 2 middle, 1 high)
 *   • 32 case managers       → ≤20-student caseloads (600 / 32 ≈ 18.75)
 *   • 20 providers           → SLP/OT/PT/Counselor mix (~30 students each)
 *   • 18 paraprofessionals
 *   • 8 BCBAs                → ~75 students each
 *   • Required minutes within MA-typical bands (≤4,800/mo per student)
 *   • Realistic tier mix     → mostly minimal, fewer intensive
 *
 * Tears down all `is_sample = true` rows in district 6 first (scoped, will
 * not touch other districts), then re-seeds via the canonical
 * seedSampleDataForDistrict() with the explicit knobs above. Finally renames
 * the 6 schools to the elementary/middle/HS pattern with MetroWest-themed
 * names so the navigation matches the spec.
 *
 * Run from repo root:
 *   pnpm --filter @workspace/db exec tsx src/rebuild-metrowest.ts
 *
 * Idempotent: safe to re-run. Each invocation regenerates the same roster
 * (mulberry32 seeded by districtId).
 */

import { db, districtsTable, schoolsTable, seedSampleDataForDistrict, teardownSampleData } from "./index";
import { eq, and } from "drizzle-orm";

const METROWEST_DISTRICT_ID = 6;

const SCHOOL_RENAMES = [
  "Harmony Elementary",
  "Brookfield Elementary",
  "Pine Ridge Elementary",
  "Riverside Middle School",
  "Brookfield Middle School",
  "MetroWest Regional High School",
];

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  REBUILDING METROWEST COLLABORATIVE → realistic profile     ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const [district] = await db.select().from(districtsTable).where(eq(districtsTable.id, METROWEST_DISTRICT_ID));
  if (!district) throw new Error(`District ${METROWEST_DISTRICT_ID} not found`);
  if (!district.isDemo) {
    throw new Error(
      `District ${METROWEST_DISTRICT_ID} ("${district.name}") is not flagged as a demo district. ` +
      `Refusing to rebuild — set is_demo=true first if this is intentional.`,
    );
  }
  console.log(`District: ${district.name} (id=${district.id}, isDemo=${district.isDemo})\n`);

  console.log("Step 1: Teardown existing sample data (scoped to this district)…");
  const t0 = Date.now();
  const teardown = await teardownSampleData(METROWEST_DISTRICT_ID);
  console.log(`  Removed: ${teardown.studentsRemoved} students, ${teardown.staffRemoved} staff, ${teardown.staffGraduated} graduated to non-sample`);
  console.log(`  Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  console.log("Step 2: Re-seed with realistic-ratio spec…");
  const t1 = Date.now();
  const seed = await seedSampleDataForDistrict(METROWEST_DISTRICT_ID, {
    sizeProfile: "large",
    targetStudents: 600,
    schoolCount: 6,
    caseManagerCount: 32,
    bcbaCount: 8,
    providerCount: 20,
    paraCount: 18,
    avgGoalsPerStudent: 18,
    avgRequiredMinutesPerWeek: 90,
    backfillMonths: 8,
    complianceHealth: "medium",
    staffingStrain: "medium",
    documentationQuality: "medium",
    compensatoryExposure: "medium",
    behaviorIntensity: "medium",
  });
  console.log(`  Seeded in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  console.log(`  Result: ${JSON.stringify(seed, null, 2)}\n`);

  console.log("Step 3: Rename schools to MetroWest 3 elem / 2 middle / 1 HS pattern…");
  const schools = await db.select()
    .from(schoolsTable)
    .where(eq(schoolsTable.districtId, METROWEST_DISTRICT_ID))
    .orderBy(schoolsTable.id);
  const renameCount = Math.min(schools.length, SCHOOL_RENAMES.length);
  for (let i = 0; i < renameCount; i++) {
    await db.update(schoolsTable)
      .set({ name: SCHOOL_RENAMES[i] })
      .where(and(eq(schoolsTable.id, schools[i].id), eq(schoolsTable.districtId, METROWEST_DISTRICT_ID)));
    console.log(`  ${schools[i].name}  →  ${SCHOOL_RENAMES[i]}`);
  }
  if (schools.length > SCHOOL_RENAMES.length) {
    console.log(`  (${schools.length - SCHOOL_RENAMES.length} extra school(s) left untouched)`);
  } else if (schools.length < SCHOOL_RENAMES.length) {
    console.log(`  WARNING: only ${schools.length} schools exist, expected ${SCHOOL_RENAMES.length}`);
  }

  console.log("\n✓ MetroWest rebuild complete.");
}

main().then(() => process.exit(0)).catch(err => {
  console.error("REBUILD FAILED:", err);
  process.exit(1);
});
