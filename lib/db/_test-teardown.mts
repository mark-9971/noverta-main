import { db } from "./src/db.js";
import { sql } from "drizzle-orm";
import { teardownSampleData, seedSampleDataForDistrict } from "./src/seed-sample-data.js";
async function counts(label: string) {
  const r: any = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM students WHERE district_id=6) AS students,
      (SELECT COUNT(*) FROM session_logs sl JOIN students s ON s.id=sl.student_id WHERE s.district_id=6) AS d6_sessions,
      (SELECT COUNT(*) FROM session_logs) AS sl_total,
      (SELECT COUNT(*) FROM session_logs sl LEFT JOIN students s ON s.id=sl.student_id WHERE s.id IS NULL) AS sl_orphan,
      (SELECT COUNT(*) FROM session_goal_data) AS sgd_total,
      (SELECT COUNT(*) FROM session_goal_data sgd LEFT JOIN session_logs sl ON sl.id=sgd.session_log_id WHERE sl.id IS NULL) AS sgd_orphan;
  `);
  console.log(label, JSON.stringify(r.rows[0]));
}
async function main() {
  await counts("PRE:");
  console.log("\n-- teardown1 --");
  console.log(await teardownSampleData(6));
  await counts("POST-TD1:");
  console.log("\n-- reseed --");
  const seed = await seedSampleDataForDistrict(6, { sizeProfile: "random" });
  console.log("seed:", seed.studentsCreated, seed.sessionsLogged);
  await counts("POST-RESEED:");
  console.log("\n-- teardown2 --");
  console.log(await teardownSampleData(6));
  await counts("POST-TD2:");
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
