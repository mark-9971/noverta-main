// Access control around revenue-critical endpoints.
// The broad role/route matrix lives in tests/permission-matrix.mjs — this file
// targets ONLY the endpoints that affect billed minutes & comp-ed dollars.
import { req, Suite, DISTRICT_ID, FOREIGN_DISTRICT_ID, probeBypass } from "./_harness.mjs";

export async function run() {
  const s = new Suite("access-control-revenue");
  await probeBypass();

  // 1. Unauthenticated → 401 on every revenue endpoint
  for (const path of ["/sessions", "/minute-progress", "/compensatory-finance/overview", "/compensatory-finance/students"]) {
    const r = await req(null, null, "GET", path);
    s.expectStatus(`unauth ${path}`, r, 401);
  }

  // 2. Missing district context: dev uses _devDistrictId fallback so admin without
  //    a district claim may still get 200. The contract we care about is "no 5xx
  //    AND never returns another district's data" — covered by the cross-tenant
  //    isolation tests below. We just assert no server error here.
  for (const path of ["/sessions", "/compensatory-finance/overview"]) {
    const r = await req("admin", null, "GET", path);
    s.expect(`admin w/o district on ${path} → no 5xx`, r.status < 500,
      { status: r.status, body: r.body });
  }

  // 3. sped_student is blocked from staff-facing session list
  const studentRead = await req("sped_student", DISTRICT_ID, "GET", "/sessions");
  s.expectStatus("sped_student GET /sessions blocked", studentRead, 403);

  const studentWrite = await req("sped_student", DISTRICT_ID, "POST", "/sessions", {
    studentId: 1, sessionDate: "2025-01-01", durationMinutes: 30, status: "completed", isMakeup: false,
  });
  s.expectStatus("sped_student POST /sessions blocked", studentWrite, 403);

  // 4. Compensatory finance is admin/coordinator only — provider/case_manager/bcba blocked
  for (const role of ["provider", "case_manager", "bcba", "sped_teacher", "para"]) {
    const r = await req(role, DISTRICT_ID, "GET", "/compensatory-finance/overview");
    s.expectStatus(`${role} blocked from /compensatory-finance/overview`, r, 403);
  }

  // 5. Coordinator IS allowed
  const coord = await req("coordinator", DISTRICT_ID, "GET", "/compensatory-finance/overview");
  s.expectStatus("coordinator allowed on /compensatory-finance/overview", coord, 200);

  // 6. Cross-tenant read isolation on /sessions: foreign district should not see
  //    our district's session list. We can't easily diff IDs without a known fixture,
  //    so we assert that foreign-district scope returns either 200 with no overlap
  //    or a denial — but never 5xx.
  const ours = await req("admin", DISTRICT_ID, "GET", "/sessions?limit=5");
  const theirs = await req("admin", FOREIGN_DISTRICT_ID, "GET", "/sessions?limit=5");
  s.expect("foreign district /sessions no 5xx", theirs.status < 500, { status: theirs.status });
  if (ours.status === 200 && theirs.status === 200) {
    const oursList = ours.body?.sessions || ours.body || [];
    const theirsList = theirs.body?.sessions || theirs.body || [];
    const oursIds = new Set(oursList.map(x => x.id));
    const overlap = theirsList.filter(x => oursIds.has(x.id));
    s.expect("no session id overlap across districts", overlap.length === 0, { overlap });
  }

  // 7. Provider access regression: middleware path-scoping must NOT block providers
  //    from endpoints whose own role policy permits them. These were leak-blocked
  //    historically by neighbouring routers' guards and must stay 200/non-403.
  for (const path of [
    "/compensatory-obligations",
    "/communication-events?limit=1",
    "/protective-measures/incidents",
    "/reports/compliance-summary",
    "/reports/exports/csv?type=sessions",
  ]) {
    const r = await req("provider", DISTRICT_ID, "GET", path);
    s.expect(`provider GET ${path} not blocked by neighbouring router guards`,
      r.status !== 403,
      { status: r.status, body: r.body });
  }

  return s.summary();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(r => process.exit(r.failed ? 1 : 0));
}
