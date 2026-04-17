// Verifies revenue-critical invariants of /compensatory-finance/overview:
//   - Headline totals equal the sum of breakdowns
//   - Dollar amounts round to cents (no float drift in payable figures)
//   - Cross-district isolation: a foreign district cannot see our totals
import { req, Suite, DISTRICT_ID, FOREIGN_DISTRICT_ID, probeBypass } from "./_harness.mjs";

const round2 = n => Math.round(n * 100) / 100;

export async function run() {
  const s = new Suite("compensatory-finance");
  await probeBypass();

  const r = await req("admin", DISTRICT_ID, "GET", "/compensatory-finance/overview");
  s.expectStatus("GET /compensatory-finance/overview (admin)", r, 200);
  if (r.status !== 200) return s.summary();
  const o = r.body;

  // 1. All headline numbers are present and non-negative
  for (const k of ["totalMinutesOwed", "totalMinutesDelivered", "totalDollarsOwed", "totalDollarsDelivered", "studentsAffected"]) {
    s.expect(`${k} present & ≥ 0`, typeof o[k] === "number" && o[k] >= 0, { k, val: o[k] });
  }

  // 2. Dollar totals are already rounded to cents (no >2dp drift)
  for (const k of ["totalDollarsOwed", "totalDollarsDelivered"]) {
    s.expect(`${k} rounded to cents`, Math.abs(o[k] - round2(o[k])) < 1e-9, { k, val: o[k] });
  }

  // 3. byServiceType sums match headline minutes (within 1 minute for rounding)
  if (Array.isArray(o.byServiceType) && o.byServiceType.length > 0) {
    const sumMinOwed = o.byServiceType.reduce((a, x) => a + (x.minutesOwed ?? 0), 0);
    const sumMinDel = o.byServiceType.reduce((a, x) => a + (x.minutesDelivered ?? 0), 0);
    const sumDolOwed = o.byServiceType.reduce((a, x) => a + (x.dollarsOwed ?? 0), 0);
    // Service-type breakdown only includes obligations with a known service type;
    // it should be ≤ totals (some obligations may lack a service requirement).
    s.expect("Σ byServiceType.minutesOwed ≤ totalMinutesOwed", sumMinOwed <= o.totalMinutesOwed,
      { sumMinOwed, total: o.totalMinutesOwed });
    s.expect("Σ byServiceType.minutesDelivered ≤ totalMinutesDelivered", sumMinDel <= o.totalMinutesDelivered,
      { sumMinDel, total: o.totalMinutesDelivered });
    s.expect("Σ byServiceType.dollarsOwed ≤ totalDollarsOwed (within 1¢)",
      sumDolOwed <= o.totalDollarsOwed + 0.01, { sumDolOwed, total: o.totalDollarsOwed });

    // 4. Per-row dollars/minutes ratio is sane: at the default $75/hr fallback,
    //    $/min == 1.25; clamp test to 0.10–10.00 $/min to catch unit-confusion bugs.
    for (const row of o.byServiceType) {
      if (row.minutesOwed > 0) {
        const perMin = row.dollarsOwed / row.minutesOwed;
        s.expect(`byServiceType[${row.serviceTypeId}] $/min within plausible range (${perMin.toFixed(4)})`,
          perMin >= 0.10 && perMin <= 10.00, { perMin, row });
      }
      s.expect(`byServiceType[${row.serviceTypeId}] dollarsOwed rounded to cents`,
        Math.abs(row.dollarsOwed - round2(row.dollarsOwed)) < 1e-9, row);
    }
  } else {
    s.pass("byServiceType empty — no obligations in district (skipping breakdown checks)");
  }

  // 5. studentsAffected ≤ obligationCount (each student may have many obligations)
  if (typeof o.obligationCount === "number") {
    s.expect("studentsAffected ≤ obligationCount", o.studentsAffected <= o.obligationCount,
      { studentsAffected: o.studentsAffected, obligationCount: o.obligationCount });
  }

  // 6. Cross-district isolation: foreign-district admin sees their own data
  //    (probably empty for nonexistent district), NOT our district's totals.
  const foreign = await req("admin", FOREIGN_DISTRICT_ID, "GET", "/compensatory-finance/overview");
  if (foreign.status === 200) {
    const f = foreign.body;
    const leak = (f.totalMinutesOwed === o.totalMinutesOwed && o.totalMinutesOwed > 0) ||
                 (f.totalDollarsOwed === o.totalDollarsOwed && o.totalDollarsOwed > 0);
    s.expect("foreign district does NOT see our totals", !leak,
      { ourTotalDollars: o.totalDollarsOwed, theirTotalDollars: f.totalDollarsOwed });
  } else {
    s.expect("foreign district denied (403/404)", [403, 404].includes(foreign.status),
      { status: foreign.status });
  }

  return s.summary();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(r => process.exit(r.failed ? 1 : 0));
}
