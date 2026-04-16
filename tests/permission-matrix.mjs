/**
 * Permission Matrix Test — Trellis API
 *
 * Verifies that role-based access control is enforced correctly across all
 * critical endpoints. Runs against a local API server in non-production mode,
 * using x-test-* headers to simulate different roles without Clerk sessions.
 *
 * Usage:
 *   node tests/permission-matrix.mjs
 *
 * The API server must be running (pnpm --filter @workspace/api-server run dev)
 * in development or test mode (not NODE_ENV=production).
 *
 * Roles tested:
 *   admin, coordinator, case_manager, bcba, sped_teacher, provider, para, sped_student
 *
 * Endpoints covered:
 *   students, sessions, staff, schedule-blocks, incidents (protective-measures),
 *   reports, report-exports, audit-logs, student-portal, iep-goals
 */

const BASE = process.env.API_BASE ?? "http://localhost:8080";

let passed = 0;
let failed = 0;
const failures = [];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Make an authenticated test request. */
async function req(role, method, path, body) {
  const headers = {
    "Content-Type": "application/json",
    "x-test-user-id": `test-user-${role}`,
    "x-test-role": role,
    "x-test-district-id": "2",
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`${BASE}${path}`, opts);
}

/** Make a request from a FOREIGN district (district 99 — non-existent) to test cross-tenant isolation. */
async function reqForeign(role, method, path, body) {
  const headers = {
    "Content-Type": "application/json",
    "x-test-user-id": `test-user-foreign-${role}`,
    "x-test-role": role,
    "x-test-district-id": "99",
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`${BASE}${path}`, opts);
}

/** Assert that a role can access an endpoint (200–299 expected). */
async function canAccess(role, method, path, body) {
  const r = await req(role, method, path, body);
  const ok = r.status >= 200 && r.status < 300;
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL [${method} ${path}] role=${role}: expected 2xx, got ${r.status}`);
  }
}

/** Assert that a role is denied access (403 expected). */
async function cannotAccess(role, method, path, body) {
  const r = await req(role, method, path, body);
  if (r.status === 403) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL [${method} ${path}] role=${role}: expected 403, got ${r.status}`);
  }
}

/** Assert unauthenticated request returns 401. */
async function requiresAuth(method, path) {
  const r = await fetch(`${BASE}${path}`, { method });
  if (r.status === 401) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL [${method} ${path}] no-auth: expected 401, got ${r.status}`);
  }
}

/**
 * Assert that a route returns an exact HTTP status for a given role.
 * Used for routes that pass the role guard but have mandatory input requirements
 * (e.g., student portal requires a studentId — missing it causes 400, not a role failure).
 */
async function assertStatus(expectedStatus, role, method, path, body) {
  const r = await req(role, method, path, body);
  if (r.status === expectedStatus) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL [${method} ${path}] role=${role}: expected ${expectedStatus}, got ${r.status}`);
  }
}

// ─── Demo district and student IDs (Jefferson Unified School District) ──────
const DISTRICT_ID = 2;
const DEMO_STUDENT_ID = 32; // First student in demo district

// ─── Test Suite ─────────────────────────────────────────────────────────────

console.log(`\nRunning Trellis permission matrix against ${BASE} …\n`);

// ─── 1. Unauthenticated access must always return 401 ─────────────────────
console.log("1. Unauthenticated guard checks …");
await requiresAuth("GET", "/api/students");
await requiresAuth("GET", "/api/sessions");
await requiresAuth("GET", "/api/staff");
await requiresAuth("GET", "/api/staff/workload-summary");
await requiresAuth("GET", "/api/schedule-blocks/uncovered");
await requiresAuth("GET", "/api/audit-logs");

// ─── 2. Students list — PRIVILEGED_STAFF_ROLES can access ────────────────────
console.log("2. Students list …");
for (const role of ["admin", "case_manager", "bcba", "sped_teacher", "coordinator"]) {
  await canAccess(role, "GET", `/api/students?districtId=${DISTRICT_ID}`);
}

// ─── 3. sped_student blocked from student list and staff-only endpoints ──────
console.log("3. sped_student denied staff-only endpoints …");
await cannotAccess("sped_student", "GET", `/api/students?districtId=${DISTRICT_ID}`);
await cannotAccess("sped_student", "GET", "/api/sessions");
await cannotAccess("sped_student", "GET", "/api/staff");
await cannotAccess("sped_student", "GET", "/api/staff/workload-summary");
await cannotAccess("sped_student", "GET", "/api/schedule-blocks/uncovered");
// Schedule blocks and staff-assignments are also staff-only
await cannotAccess("sped_student", "GET", "/api/schedule-blocks");
await cannotAccess("sped_student", "GET", "/api/staff-assignments");

// ─── 4. Sessions — all staff roles (including provider and para) ─────────────
console.log("4. Sessions access for all staff …");
for (const role of ["admin", "case_manager", "bcba", "sped_teacher", "coordinator", "provider", "para"]) {
  await canAccess(role, "GET", `/api/sessions?districtId=${DISTRICT_ID}`);
}

// ─── 5. Staff list — PRIVILEGED_STAFF_ROLES ──────────────────────────────────
console.log("5. Staff list …");
for (const role of ["admin", "case_manager", "bcba", "sped_teacher", "coordinator"]) {
  await canAccess(role, "GET", `/api/staff?districtId=${DISTRICT_ID}`);
}

// ─── 6. Admin-only: workload summary ─────────────────────────────────────────
console.log("6. Workload summary (admin/coordinator only) …");
await canAccess("admin", "GET", `/api/staff/workload-summary?districtId=${DISTRICT_ID}`);
await canAccess("coordinator", "GET", `/api/staff/workload-summary?districtId=${DISTRICT_ID}`);
await cannotAccess("case_manager", "GET", `/api/staff/workload-summary?districtId=${DISTRICT_ID}`);
await cannotAccess("sped_teacher", "GET", `/api/staff/workload-summary?districtId=${DISTRICT_ID}`);
await cannotAccess("bcba", "GET", `/api/staff/workload-summary?districtId=${DISTRICT_ID}`);
await cannotAccess("provider", "GET", `/api/staff/workload-summary?districtId=${DISTRICT_ID}`);
await cannotAccess("para", "GET", `/api/staff/workload-summary?districtId=${DISTRICT_ID}`);

// ─── 7. Admin-only: uncovered sessions ───────────────────────────────────────
console.log("7. Uncovered sessions (admin/coordinator only) …");
await canAccess("admin", "GET", `/api/schedule-blocks/uncovered?districtId=${DISTRICT_ID}`);
await canAccess("coordinator", "GET", `/api/schedule-blocks/uncovered?districtId=${DISTRICT_ID}`);
await cannotAccess("sped_teacher", "GET", `/api/schedule-blocks/uncovered?districtId=${DISTRICT_ID}`);
await cannotAccess("bcba", "GET", `/api/schedule-blocks/uncovered?districtId=${DISTRICT_ID}`);
await cannotAccess("provider", "GET", `/api/schedule-blocks/uncovered?districtId=${DISTRICT_ID}`);
await cannotAccess("para", "GET", `/api/schedule-blocks/uncovered?districtId=${DISTRICT_ID}`);

// ─── 8. Schedule blocks — all staff ──────────────────────────────────────────
console.log("8. Schedule blocks (all staff) …");
for (const role of ["admin", "case_manager", "bcba", "sped_teacher", "coordinator", "provider", "para"]) {
  await canAccess(role, "GET", `/api/schedule-blocks?districtId=${DISTRICT_ID}`);
}

// ─── 9. Incidents (Protective Measures) — PRIVILEGED_STAFF_ROLES ─────────────
// admin, coordinator, case_manager, bcba, sped_teacher: can access
// provider, para, sped_student: denied (path-scoped guard blocks them)
console.log("9. Incidents / protective measures …");
for (const role of ["admin", "case_manager", "bcba", "sped_teacher", "coordinator"]) {
  await canAccess(role, "GET", `/api/protective-measures/incidents?districtId=${DISTRICT_ID}`);
}
await cannotAccess("para", "GET", `/api/protective-measures/incidents?districtId=${DISTRICT_ID}`);
await cannotAccess("provider", "GET", `/api/protective-measures/incidents?districtId=${DISTRICT_ID}`);
await cannotAccess("sped_student", "GET", `/api/protective-measures/incidents?districtId=${DISTRICT_ID}`);

// ─── 10. IEP Goals — PRIVILEGED_STAFF_ROLES ──────────────────────────────────
console.log("10. IEP goals …");
for (const role of ["admin", "case_manager", "bcba", "sped_teacher", "coordinator"]) {
  await canAccess(role, "GET", `/api/students/${DEMO_STUDENT_ID}/iep-goals?districtId=${DISTRICT_ID}`);
}

// ─── 11. Reports — PRIVILEGED_STAFF_ROLES ────────────────────────────────────
console.log("11. Reports (service-minute summary) …");
for (const role of ["admin", "case_manager", "bcba", "sped_teacher", "coordinator"]) {
  await canAccess(role, "GET", `/api/reports/student-minute-summary?districtId=${DISTRICT_ID}`);
}
await cannotAccess("sped_student", "GET", `/api/reports/student-minute-summary?districtId=${DISTRICT_ID}`);

// ─── 12. Report Exports — admin, case_manager, coordinator only ───────────────
// The /reports/exports path has a stricter guard than /reports.
// sped_teacher and bcba pass the /reports guard but are blocked by /reports/exports.
// admin, coordinator, case_manager reach the handler and get a real CSV response (200).
console.log("12. Report exports (role guard) …");
await cannotAccess("para", "GET", "/api/reports/exports/active-ieps.csv");
await cannotAccess("provider", "GET", "/api/reports/exports/active-ieps.csv");
await cannotAccess("sped_student", "GET", "/api/reports/exports/active-ieps.csv");
await cannotAccess("sped_teacher", "GET", "/api/reports/exports/active-ieps.csv");
await cannotAccess("bcba", "GET", "/api/reports/exports/active-ieps.csv");
// Allowed roles must succeed — district 2 is scoped via x-test-district-id header
await canAccess("admin", "GET", "/api/reports/exports/active-ieps.csv");
await canAccess("coordinator", "GET", "/api/reports/exports/active-ieps.csv");
await canAccess("case_manager", "GET", "/api/reports/exports/active-ieps.csv");

// ─── 13. Audit Log — admin only ───────────────────────────────────────────────
console.log("13. Audit log (admin only) …");
await canAccess("admin", "GET", `/api/audit-logs?districtId=${DISTRICT_ID}`);
await cannotAccess("coordinator", "GET", `/api/audit-logs?districtId=${DISTRICT_ID}`);
await cannotAccess("case_manager", "GET", `/api/audit-logs?districtId=${DISTRICT_ID}`);
await cannotAccess("sped_teacher", "GET", `/api/audit-logs?districtId=${DISTRICT_ID}`);
await cannotAccess("bcba", "GET", `/api/audit-logs?districtId=${DISTRICT_ID}`);
await cannotAccess("provider", "GET", `/api/audit-logs?districtId=${DISTRICT_ID}`);
await cannotAccess("para", "GET", `/api/audit-logs?districtId=${DISTRICT_ID}`);
await cannotAccess("sped_student", "GET", `/api/audit-logs?districtId=${DISTRICT_ID}`);

// ─── 14. Student Portal — role guard passes for all; input validates separately ─
// sped_student: role check passes, returns 400 (no student ID bound to test token)
// Staff roles: role check passes, returns 400 (no studentId query param provided)
// Both are NOT 403 (role denial) — the route is reachable but requires input.
console.log("14. Student portal (role guard passes, inputs missing → 400) …");
for (const role of ["admin", "case_manager", "bcba", "sped_teacher", "coordinator"]) {
  await assertStatus(400, role, "GET", "/api/student-portal/goals");
}
// sped_student must reach the route (not get role-blocked): expect 400, not 403
await assertStatus(400, "sped_student", "GET", "/api/student-portal/goals");

// ─── 15. Cross-tenant isolation — district 99 (non-existent) cannot see district 2 data ─
// Proves that switching the district header to a foreign district returns empty data or 403,
// not records belonging to a different district.
console.log("15. Cross-tenant isolation …");

/**
 * Assert that a request from foreign district 99 returns a JSON array with 0 elements.
 * Used to verify that list endpoints return empty data (not cross-tenanted rows).
 */
async function assertEmptyFromForeign(role, method, path) {
  const r = await reqForeign(role, method, path);
  if (r.status < 200 || r.status >= 300) {
    failed++;
    failures.push(`FAIL cross-tenant [${method} ${path}] role=${role}: expected 2xx, got ${r.status}`);
    return;
  }
  let body;
  try { body = await r.json(); } catch { body = null; }
  const isEmpty = Array.isArray(body) && body.length === 0;
  if (isEmpty) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL cross-tenant [${method} ${path}] role=${role}: expected empty array, got ${JSON.stringify(body).slice(0, 100)}`);
  }
}

/**
 * Assert that a request from foreign district 99 is denied with 403.
 * Used to verify that ID-based resource endpoints reject cross-district access.
 */
async function assertForeignForbidden(role, method, path) {
  const r = await reqForeign(role, method, path);
  if (r.status === 403) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL cross-tenant [${method} ${path}] role=${role}: expected 403, got ${r.status}`);
  }
}

// List endpoints: district 99 user should get empty arrays for district 2 data
await assertEmptyFromForeign("admin", "GET", `/api/protective-measures/incidents`);
await assertEmptyFromForeign("admin", "GET", `/api/reports/student-minute-summary`);
await assertEmptyFromForeign("admin", "GET", `/api/reports/missed-sessions`);
await assertEmptyFromForeign("admin", "GET", `/api/reports/compliance-risk`);
// Scheduling routes: foreign-district users get empty schedule data, not district 2 blocks
await assertEmptyFromForeign("admin", "GET", `/api/schedule-blocks`);
await assertEmptyFromForeign("admin", "GET", `/api/staff-assignments`);
// Student/staff list cross-tenant isolation
await assertEmptyFromForeign("admin", "GET", `/api/students`);
await assertEmptyFromForeign("admin", "GET", `/api/staff`);

// ID-based endpoints: district 99 user trying to fetch a district 2 incident should get 403
// Incident ID 13 and student ID 51 both belong to district 2 (Jefferson Unified).
await assertForeignForbidden("admin", "GET", `/api/protective-measures/incidents/13`);
await assertForeignForbidden("admin", "GET", `/api/reports/parent-summary/51`);

// ─── Results ─────────────────────────────────────────────────────────────────

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

if (failures.length > 0) {
  console.error("Failures:");
  failures.forEach(f => console.error(" ", f));
  console.error();
  process.exit(1);
} else {
  console.log("All permission checks passed.\n");
  process.exit(0);
}
