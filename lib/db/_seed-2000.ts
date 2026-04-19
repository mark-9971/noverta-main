import { db } from "./src/db.js";
import { sql } from "drizzle-orm";
import { teardownSampleData, seedSampleDataForDistrict } from "./src/seed-sample-data.js";

const DISTRICT_ID = Number(process.env.DISTRICT_ID ?? 6);
const TARGET = Number(process.env.TARGET ?? 2000);

async function counts(label: string) {
  const r: any = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM students WHERE district_id=${DISTRICT_ID}) AS students,
      (SELECT COUNT(*) FROM session_logs sl JOIN students s ON s.id=sl.student_id WHERE s.district_id=${DISTRICT_ID}) AS sessions,
      (SELECT COUNT(*) FROM session_goal_data sgd JOIN session_logs sl ON sl.id=sgd.session_log_id JOIN students s ON s.id=sl.student_id WHERE s.district_id=${DISTRICT_ID}) AS sgd,
      (SELECT COUNT(*) FROM iep_goals g JOIN students s ON s.id=g.student_id WHERE s.district_id=${DISTRICT_ID}) AS goals,
      (SELECT COUNT(*) FROM alerts a JOIN students s ON s.id=a.student_id WHERE s.district_id=${DISTRICT_ID}) AS alerts;
  `);
  console.log(label, JSON.stringify(r.rows[0]));
}

async function main() {
  console.log(`== Seeding district ${DISTRICT_ID} with ${TARGET} students ==`);
  await counts("PRE:");

  console.log("\n-- teardown --");
  const td = await teardownSampleData(DISTRICT_ID);
  console.log(td);
  await counts("POST-TD:");

  console.log("\n-- seeding (this will take a while for large rosters) --");
  const t0 = Date.now();
  const seed = await seedSampleDataForDistrict(DISTRICT_ID, {
    sizeProfile: "large",
    targetStudents: TARGET,
  });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`seeded in ${dt}s:`, seed);

  await counts("POST-SEED:");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
