import { seedDemoDistrict } from "./src/seed-demo-district";

seedDemoDistrict()
  .then(() => {
    console.log("Demo district seed complete!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
