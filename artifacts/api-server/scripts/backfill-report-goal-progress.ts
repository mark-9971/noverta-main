/**
 * One-time backfill script: populate goalProgress for existing progress reports.
 *
 * Run: npx tsx scripts/backfill-report-goal-progress.ts
 */

import { db } from "@workspace/db";
import { progressReportsTable, studentsTable, schoolsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { computeGoalProgressEntries } from "../src/lib/goalProgressCompute";

async function main() {
  console.log("Fetching all progress reports...");

  const allReports = await db
    .select({
      id: progressReportsTable.id,
      studentId: progressReportsTable.studentId,
      periodStart: progressReportsTable.periodStart,
      periodEnd: progressReportsTable.periodEnd,
      goalProgress: progressReportsTable.goalProgress,
      studentFirstName: studentsTable.firstName,
    })
    .from(progressReportsTable)
    .innerJoin(studentsTable, eq(progressReportsTable.studentId, studentsTable.id));

  const toBackfill = allReports.filter(
    (r) => !r.goalProgress || (Array.isArray(r.goalProgress) && r.goalProgress.length === 0),
  );

  console.log(`Total reports: ${allReports.length}`);
  console.log(`Reports needing backfill: ${toBackfill.length}`);
  console.log(`Already populated: ${allReports.length - toBackfill.length}`);

  let updated = 0;
  let errors = 0;

  for (const report of toBackfill) {
    try {
      const entries = await computeGoalProgressEntries(
        report.studentId,
        report.studentFirstName,
        report.periodStart,
        report.periodEnd,
      );
      await db
        .update(progressReportsTable)
        .set({ goalProgress: entries, updatedAt: new Date() })
        .where(eq(progressReportsTable.id, report.id));
      updated++;
      if (updated % 10 === 0) {
        console.log(`  Updated ${updated}/${toBackfill.length}...`);
      }
    } catch (err) {
      errors++;
      console.error(`  ERROR on report #${report.id}:`, err);
    }
  }

  console.log(`\nDone. Updated: ${updated}, Errors: ${errors}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
