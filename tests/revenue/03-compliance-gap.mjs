// Verifies invariants of the compliance gap calculation as it appears in
// /minute-progress responses — we don't reimplement the engine, we check that
// the data the API returns is internally consistent (the gap math drives
// compensatory dollar exposure downstream).
import { req, Suite, DISTRICT_ID, probeBypass } from "./_harness.mjs";

const VALID_RISK = new Set([
  "on_track", "slightly_behind", "at_risk", "out_of_compliance",
  "no_data", "unknown", "completed", "ahead",
]);

export async function run() {
  const s = new Suite("compliance-gap");
  await probeBypass();

  const r = await req("admin", DISTRICT_ID, "GET", "/minute-progress");
  s.expectStatus("GET /minute-progress (district-wide)", r, 200);
  if (r.status !== 200) return s.summary();

  const rows = r.body?.progress || r.body?.items || r.body || [];
  s.expect("response is array-shaped", Array.isArray(rows), { type: typeof r.body });
  if (!Array.isArray(rows) || rows.length === 0) {
    s.fail("no progress rows returned — cannot verify gap math (district may be empty)");
    return s.summary();
  }

  let checked = 0, riskChecked = 0;
  for (const row of rows.slice(0, 50)) {
    const required = row.requiredMinutes ?? row.minutesRequired;
    const delivered = row.deliveredMinutes ?? row.minutesDelivered;
    if (typeof required !== "number" || typeof delivered !== "number") continue;
    checked++;

    // Invariant 1: delivered ≥ 0, required ≥ 0
    s.expect(`row ${row.serviceRequirementId ?? row.id}: delivered≥0 & required≥0`,
      delivered >= 0 && required >= 0, { delivered, required });

    // Invariant 2: percentComplete (if present) is in 0..(reasonably bounded). The
    // engine may project to a full-interval target rather than required-to-date, so
    // we only assert it's a finite non-negative number bounded ≤ 1000% (catches
    // unit-confusion bugs without coupling to projection internals).
    if (typeof row.percentComplete === "number" && required > 0) {
      const ok = Number.isFinite(row.percentComplete) && row.percentComplete >= 0 && row.percentComplete <= 1000;
      s.expect(`row ${row.serviceRequirementId ?? row.id}: percentComplete in 0..1000`,
        ok, { reported: row.percentComplete });
    }

    // Invariant 3: remainingMinutes = max(0, required - delivered)
    if (typeof row.remainingMinutes === "number") {
      const expected = Math.max(0, required - delivered);
      s.expect(`row ${row.serviceRequirementId ?? row.id}: remainingMinutes correct`,
        row.remainingMinutes === expected, { reported: row.remainingMinutes, expected });
    }

    // Invariant 4: riskStatus is a known value
    const risk = row.riskStatus ?? row.complianceStatus ?? row.status;
    if (typeof risk === "string") {
      riskChecked++;
      s.expect(`row ${row.serviceRequirementId ?? row.id}: riskStatus is known (${risk})`,
        VALID_RISK.has(risk), { risk });
    }
  }

  s.expect(`checked ${checked} progress rows`, checked > 0);
  s.expect(`checked riskStatus on ${riskChecked} rows`, riskChecked > 0);

  return s.summary();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(r => process.exit(r.failed ? 1 : 0));
}
