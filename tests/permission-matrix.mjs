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
 * Assert that a role is not blocked by the role guard (200–299 OR a business-logic 4xx).
 * Used for routes that have role guards but also require additional query params.
 * Passes if the response is NOT a 401 (not-authenticated) or a role-level 403
 * (we check the body for the role-rejection message to distinguish from
 * data-access 403s like "district not assigned").
 */
async function roleAllowed(role, method, path, body) {
  const r = await req(role, method, path, body);
  // A 401 means the role guard failed at auth level — wrong
  if (r.status === 401) {
    failed++;
    failures.push(`FAIL [${method} ${path}] role=${role}: role guard returned 401 (expected 2xx or business 4xx)`);
    return;
  }
  // Read body to detect a role-level 403 vs business-logic 403
  const text = await r.text();
  const isRoleDenied = r.status === 403 && text.includes("don't have permission");
  if (isRoleDenied) {
    failed++;
    failures.push(`FAIL [${method} ${path}] role=${role}: role guard returned 403 (expected 2xx or business 4xx), body: ${text.slice(0, 120)}`);
  } else {
    passed++;
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

// ─── 2. Students list — PRIVILEGED_STAFF_ROLES only ─────────────────────────
// admin, coordinator, case_manager, bcba, sped_teacher can access
// provider, para, sped_student currently get through (no requireRoles guard;
//   tracked in Task #99 — path-param ownership audit)
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
// provider, para, sped_student: denied (requireTierAccess + role guards)
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
// Role guard blocks para, provider, sped_student with 403.
// Allowed roles pass the role guard; they may get a business-logic 4xx without
// a real district JWT (handled by a separate assertion).
console.log("12. Report exports (role guard) …");
await cannotAccess("para", "GET", "/api/reports/exports/active-ieps.csv");
await cannotAccess("provider", "GET", "/api/reports/exports/active-ieps.csv");
await cannotAccess("sped_student", "GET", "/api/reports/exports/active-ieps.csv");
await cannotAccess("sped_teacher", "GET", "/api/reports/exports/active-ieps.csv");
await cannotAccess("bcba", "GET", "/api/reports/exports/active-ieps.csv");
// Admin, coordinator, case_manager pass the role guard (may get 403 from district check
// in test mode — not a role-guard failure)
await roleAllowed("admin", "GET", "/api/reports/exports/active-ieps.csv");
await roleAllowed("coordinator", "GET", "/api/reports/exports/active-ieps.csv");
await roleAllowed("case_manager", "GET", "/api/reports/exports/active-ieps.csv");

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

// ─── 14. Student Portal — sped_student and staff (no role denial) ─────────────
// sped_student: role check passes, returns 400 (no student ID in test headers)
// staff roles: role check passes, returns 400 (no studentId query param in test)
// NOTE: sped_student with a real token (tenantStudentId set) would get 200
console.log("14. Student portal …");
// Staff should not be blocked by role guard (400 = missing studentId, not role denial)
for (const role of ["admin", "case_manager", "bcba", "sped_teacher", "coordinator"]) {
  await roleAllowed(role, "GET", "/api/student-portal/goals");
}
// sped_student: should pass role check, get 400 for missing student ID
await roleAllowed("sped_student", "GET", "/api/student-portal/goals");

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
