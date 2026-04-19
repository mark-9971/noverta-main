import { seedSampleDataForDistrict } from "./src/seed-sample-data";

const districtIdArg = process.argv[2];
const profileArg = (process.argv[3] || "large") as "small" | "medium" | "large" | "random";
const districtId = districtIdArg ? parseInt(districtIdArg, 10) : 6;

if (!Number.isFinite(districtId)) {
  console.error("Usage: tsx run-seed-metrowest.ts <districtId> [small|medium|large|random]");
  process.exit(1);
}

console.log(`Seeding district ${districtId} with profile=${profileArg}...`);
const t0 = Date.now();
seedSampleDataForDistrict(districtId, { sizeProfile: profileArg })
  .then((r) => {
    const ms = Date.now() - t0;
    console.log(`Seed OK in ${(ms / 1000).toFixed(1)}s:`, JSON.stringify(r, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed FAILED:", err);
    process.exit(1);
  });
