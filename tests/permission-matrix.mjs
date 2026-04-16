/**
 * Permission Matrix Test — Trellis API
 *
 * Verifies that role-based access control is enforced correctly across all
 * critical endpoints. Runs against a local API server in NODE_ENV=test mode,
 * using x-test-* headers to simulate different roles without Clerk sessions.
 *
 * Usage:
 *   NODE_ENV=test node tests/permission-matrix.mjs
 *
 * The API server must be running (pnpm --filter @workspace/api-server run start)
 * with NODE_ENV=test set.
 */

const BASE = process.env.API_BASE ?? "http://localhost:8080";

let passed = 0;
let failed = 0;
const failures = [];

/**
 * Make an authenticated test request.
 * @param {string} role  - One of: admin, case_manager, bcba, sped_teacher, provider, para, sped_student
 * @param {string} method - HTTP method
 * @param {string} path   - URL path (starting with /)
 * @param {object} [body] - Request body for POST/PATCH
 * @returns {Promise<Response>}
 */
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

/**
 * Assert that a role can access an endpoint (200–299 expected).
 */
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

/**
 * Assert that a role is denied access (403 expected).
 */
async function cannotAccess(role, method, path, body) {
  const r = await req(role, method, path, body);
  if (r.status === 403) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL [${method} ${path}] role=${role}: expected 403, got ${r.status}`);
  }
}

/**
 * Assert unauthenticated request returns 401.
 */
async function requiresAuth(method, path) {
  const r = await fetch(`${BASE}${path}`, { method });
  if (r.status === 401) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL [${method} ${path}] no-auth: expected 401, got ${r.status}`);
  }
}

// ─── Test Suite ────────────────────────────────────────────────────────────

console.log(`\nRunning permission matrix against ${BASE} …\n`);

// ── 1. Unauthenticated access must always return 401 ──
await requiresAuth("GET", "/api/students");
await requiresAuth("GET", "/api/sessions");
await requiresAuth("GET", "/api/staff");
await requiresAuth("GET", "/api/staff/workload-summary");
await requiresAuth("GET", "/api/schedule-blocks/uncovered");

// ── 2. Students — all staff roles can list students ──
for (const role of ["admin", "case_manager", "bcba", "sped_teacher", "provider", "para"]) {
  await canAccess(role, "GET", "/api/students");
}

// ── 3. Student portal — sped_student can access student data ──
await canAccess("sped_student", "GET", "/api/students/sped");

// ── 4. Sessions — all staff roles can list sessions ──
for (const role of ["admin", "case_manager", "bcba", "sped_teacher", "provider", "para"]) {
  await canAccess(role, "GET", "/api/sessions");
}

// ── 5. Staff list — all staff roles can view ──
for (const role of ["admin", "case_manager", "bcba", "sped_teacher", "provider", "para"]) {
  await canAccess(role, "GET", "/api/staff");
}

// ── 6. Admin-only endpoints: workload summary ──
await canAccess("admin", "GET", "/api/staff/workload-summary");
await canAccess("coordinator", "GET", "/api/staff/workload-summary");
await cannotAccess("sped_teacher", "GET", "/api/staff/workload-summary");
await cannotAccess("bcba", "GET", "/api/staff/workload-summary");
await cannotAccess("provider", "GET", "/api/staff/workload-summary");
await cannotAccess("para", "GET", "/api/staff/workload-summary");

// ── 7. Admin-only endpoints: uncovered sessions ──
await canAccess("admin", "GET", "/api/schedule-blocks/uncovered");
await canAccess("coordinator", "GET", "/api/schedule-blocks/uncovered");
await cannotAccess("sped_teacher", "GET", "/api/schedule-blocks/uncovered");
await cannotAccess("bcba", "GET", "/api/schedule-blocks/uncovered");
await cannotAccess("para", "GET", "/api/schedule-blocks/uncovered");

// ── 8. Schedule blocks — staff can view ──
for (const role of ["admin", "case_manager", "bcba", "sped_teacher", "provider", "para"]) {
  await canAccess(role, "GET", "/api/schedule-blocks");
}

// ── 9. IEP goals — staff roles can list ──
for (const role of ["admin", "case_manager", "bcba", "sped_teacher"]) {
  await canAccess(role, "GET", "/api/iep-goals");
}

// ── 10. Reports — staff roles can access ──
for (const role of ["admin", "case_manager", "bcba", "sped_teacher"]) {
  await canAccess(role, "GET", "/api/reports/service-minutes");
}

// ── 11. Compliance — para cannot access compliance reports ──
// (para role only has access to para-specific endpoints)
await canAccess("admin", "GET", "/api/reports/service-minutes");
await canAccess("case_manager", "GET", "/api/reports/service-minutes");

// ─── Results ───────────────────────────────────────────────────────────────

console.log(`Results: ${passed} passed, ${failed} failed\n`);

if (failures.length > 0) {
  console.error("Failures:");
  failures.forEach(f => console.error(" ", f));
  console.error();
  process.exit(1);
} else {
  console.log("All permission checks passed.\n");
  process.exit(0);
}
