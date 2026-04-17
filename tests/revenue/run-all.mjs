import { run as r1 } from "./01-session-logging.mjs";
import { run as r2 } from "./02-minute-aggregation.mjs";
import { run as r3 } from "./03-compliance-gap.mjs";
import { run as r4 } from "./04-compensatory-finance.mjs";
import { run as r5 } from "./05-access-control.mjs";
import { run as r6 } from "./06-middleware-audit.mjs";
import { run as r7 } from "./07-soft-delete-audit.mjs";

const summaries = [];
for (const fn of [r1, r2, r3, r4, r5, r6, r7]) {
  try { summaries.push(await fn()); }
  catch (err) {
    console.error(`Suite ${fn.name} threw:`, err);
    summaries.push({ name: fn.name, passed: 0, failed: 1, total: 1, failures: [{ label: "uncaught error", detail: String(err) }] });
  }
}

const totalPassed = summaries.reduce((a, s) => a + s.passed, 0);
const totalFailed = summaries.reduce((a, s) => a + s.failed, 0);
console.log("============================================");
console.log(`Revenue suite: ${totalPassed} passed, ${totalFailed} failed across ${summaries.length} files`);
for (const s of summaries) {
  console.log(`  - ${s.name}: ${s.passed}/${s.total}${s.failed ? `  (FAILED: ${s.failed})` : ""}`);
}
console.log("============================================");
process.exit(totalFailed ? 1 : 0);
