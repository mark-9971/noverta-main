import { seedDemoComplianceVariety } from "@workspace/db";
seedDemoComplianceVariety()
  .then((r) => { console.log("DONE", JSON.stringify(r)); process.exit(0); })
  .catch((e) => { console.error("ERR", e instanceof Error ? e.stack : e); process.exit(1); });
