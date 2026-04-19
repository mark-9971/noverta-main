// One-shot script to populate calculated alerts on a freshly seeded
// district. Calls the compliance engine (creates behind_on_minutes,
// projected_shortfall, missed_sessions, conflict alerts) and then the
// weekly compliance_risk alert generator (which the dashboard widget
// reads). The risk alert generator is normally Monday-only — we pass
// the most recent Monday so it runs deterministically.
import { runComplianceChecks } from "./src/lib/complianceEngine";
import { runComplianceRiskAlertsForDate } from "./src/lib/reminders";

function mostRecentMonday(): Date {
  const d = new Date();
  const dow = d.getDay(); // 0=Sun..6=Sat
  const offset = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - offset);
  d.setHours(12, 0, 0, 0);
  return d;
}

async function main() {
  const t0 = Date.now();
  console.log("Running runComplianceChecks()...");
  const ce = await runComplianceChecks();
  console.log(`  -> newAlerts=${ce.newAlerts}, resolvedAlerts=${ce.resolvedAlerts}`);

  const monday = mostRecentMonday();
  console.log(`Running runComplianceRiskAlertsForDate(${monday.toISOString().slice(0, 10)})...`);
  await runComplianceRiskAlertsForDate(monday);

  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
