import { seedSampleDataForDistrict, teardownSampleData } from "./src/seed-sample-data";

const N = parseInt(process.env.N || "15", 10);
const DISTRICT = 6;

(async () => {
  const runs: any[] = [];
  for (let i = 1; i <= N; i++) {
    const t0 = Date.now();
    let teardown: any = null;
    try {
      teardown = await teardownSampleData(DISTRICT);
    } catch (e: any) {
      console.error(`Run ${i} TEARDOWN FAILED:`, e?.message ?? e);
      runs.push({ run: i, error: "teardown:" + (e?.message ?? String(e)) });
      continue;
    }
    let seed: any = null;
    try {
      seed = await seedSampleDataForDistrict(DISTRICT, { sizeProfile: "random" as any });
    } catch (e: any) {
      console.error(`Run ${i} SEED FAILED:`, e?.message ?? e);
      runs.push({ run: i, teardown, error: "seed:" + (e?.message ?? String(e)) });
      continue;
    }
    const ms = Date.now() - t0;
    runs.push({ run: i, ms, teardown, seed });
    console.log(`Run ${i}/${N} OK ${ms}ms — students=${seed.studentsCreated} sessions=${seed.sessionsLogged} alerts=${seed.alerts}`);
  }
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(runs, null, 2));
  process.exit(0);
})().catch(e => { console.error("FATAL:", e); process.exit(1); });
