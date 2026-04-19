import { teardownSampleData } from "./src/seed-sample-data";
import { db } from "./src/db";
import { districtsTable } from "./src/schema";
import { eq } from "drizzle-orm";

async function main() {
  const argDistricts = process.argv.slice(2).map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n));
  let ids: number[];
  if (argDistricts.length > 0) {
    ids = argDistricts;
  } else {
    const rows = await db.select({ id: districtsTable.id }).from(districtsTable).where(eq(districtsTable.hasSampleData, true));
    ids = rows.map((r) => r.id);
  }
  if (ids.length === 0) {
    console.log("No districts flagged as having sample data; nothing to do.");
    return;
  }
  for (const id of ids) {
    console.log(`Tearing down sample data for district ${id} ...`);
    const result = await teardownSampleData(id);
    console.log(`  -> students removed: ${result.studentsRemoved}, staff removed: ${result.staffRemoved}, staff graduated: ${result.staffGraduated}`);
  }
  console.log("Teardown complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Teardown failed:", err);
    process.exit(1);
  });
