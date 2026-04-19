/**
 * One-time backfill script: reconstruct 12 weeks of caseload_snapshots
 * for every district from existing staff_assignments.created_at data.
 *
 * Existing snapshot rows are preserved (ON CONFLICT DO NOTHING). New
 * districts will see populated trend charts immediately instead of waiting
 * up to 12 weeks for the Monday scheduler to fill them.
 *
 * Run: npx tsx scripts/backfill-caseload-snapshots.ts [weeks]
 *   weeks defaults to 12, max 52.
 */

import { db, districtsTable } from "@workspace/db";
import { backfillCaseloadHistory } from "../src/routes/caseloadBalancing";

async function main() {
  const weeksArg = Number(process.argv[2]);
  const weeks = Number.isFinite(weeksArg) && weeksArg > 0 ? Math.min(weeksArg, 52) : 12;

  const districts = await db.select({ id: districtsTable.id, name: districtsTable.name }).from(districtsTable);
  console.log(`Backfilling ${weeks} weeks of caseload snapshots for ${districts.length} district(s)...`);

  let totalInserted = 0;
  let totalSkipped = 0;
  let errors = 0;

  for (const d of districts) {
    try {
      const result = await backfillCaseloadHistory(d.id, weeks);
      console.log(`  District #${d.id} (${d.name}): inserted ${result.rowsInserted}, skipped ${result.rowsSkipped} across ${result.weeksProcessed} weeks`);
      totalInserted += result.rowsInserted;
      totalSkipped += result.rowsSkipped;
    } catch (err) {
      errors++;
      console.error(`  District #${d.id} (${d.name}) FAILED:`, err);
    }
  }

  console.log(`\nDone. Inserted: ${totalInserted}, Skipped (already present): ${totalSkipped}, Errors: ${errors}`);
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
