import { seedHistoricalBackfill } from "./src/seed-historical-backfill";

seedHistoricalBackfill()
  .then(() => {
    console.log("Historical backfill complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
