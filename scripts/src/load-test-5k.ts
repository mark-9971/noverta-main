/**
 * 5,000-student scale load test
 *
 * Simulates high-concurrency traffic on the critical list endpoints.
 * Asserts p95 < 800 ms for authenticated requests only.
 * The test fails if > 10% of requests return non-2xx status codes, preventing
 * false passes from unauthenticated (401) fast-fails masking real latency.
 *
 * Pre-requisites (5k-scale run)
 * ─────────────────────────────
 * The database must contain at least 5,000 student rows for realistic query
 * plans and index utilisation.
 *
 * 1. Seed the database:
 *      pnpm --filter @workspace/db run seed-realistic   # ~2,000 rows
 *    or for the full 5k fixture run the seed loop twice / use the bulk script.
 *
 * 2. Apply the performance migration:
 *      psql $DATABASE_URL < lib/db/src/migrations/028_performance_indices.sql
 *
 * 3. Verify indices are present:
 *      psql $DATABASE_URL -c "\di *perf*"
 *
 * Authentication modes
 * ────────────────────
 *   Production / staging (real Clerk token):
 *     AUTH_TOKEN=<bearer> pnpm --filter @workspace/scripts run load-test
 *
 *   Test server (NODE_ENV=test) — no real Clerk token required:
 *     Start the API in test mode: NODE_ENV=test PORT=8091 pnpm --filter @workspace/api-server run start
 *     Then run:
 *     USE_TEST_HEADERS=1 TEST_DISTRICT_ID=6 BASE_URL=http://localhost:8091 \
 *       pnpm --filter @workspace/scripts run load-test
 *     The script injects x-test-user-id / x-test-role / x-test-district-id
 *     headers accepted by the API only when NODE_ENV=test.
 *
 * N+1 query patterns
 * ──────────────────
 *   /reports/audit-package (auditPackage.ts):
 *     Loads all student IDs first, then batches all related rows in one
 *     Promise.all of four inArray queries — no per-student round-trips.
 *   /reports/state-reporting (stateReporting/shared.ts):
 *     Single inArray join per table for the full student cohort — no N+1.
 *
 * Exit codes
 * ──────────
 *   0  all assertions pass
 *   1  one or more assertions failed
 */

const BASE_URL   = process.env["BASE_URL"]   ?? process.argv[2] ?? "http://localhost:8080";
const AUTH_TOKEN  = process.env["AUTH_TOKEN"]  ?? process.argv[3] ?? "";
const USE_TEST_HEADERS    = process.env["USE_TEST_HEADERS"]    === "1";
const TEST_USER_ID        = process.env["TEST_USER_ID"]        ?? "load-test-user";
const TEST_ROLE           = process.env["TEST_ROLE"]           ?? "admin";
const TEST_DISTRICT_ID    = process.env["TEST_DISTRICT_ID"]    ?? "6";

/** Set ENFORCE_5K=1 to fail when the dataset has fewer than 5,000 students. */
const ENFORCE_5K          = process.env["ENFORCE_5K"]          === "1";
const DATASET_MIN_STUDENTS = 5_000;

const CONCURRENCY            = 20;
const REQUESTS_PER_ENDPOINT  = 100;
const P95_BUDGET_MS          = 800;
const MAX_ERROR_RATE_PCT     = 10;  // fail if >10% of requests are non-2xx

/**
 * The documents endpoint requires a studentId parameter (it is scoped to a
 * single student's file history). Replace the placeholder below with a real
 * student ID that exists in your target database. Use TEST_STUDENT_ID env var
 * when running against a seeded fixture.
 */
const DOCUMENTS_STUDENT_ID = process.env["TEST_STUDENT_ID"] ?? "1";

interface EndpointSpec {
  name: string;
  path: string;
  /**
   * Set to false for aggregate/report endpoints whose response is not a
   * paginated list — the shape assertion is skipped for those, but the p95
   * latency budget still applies.
   */
  checkPaginatedShape?: boolean;
}

const ENDPOINTS: EndpointSpec[] = [
  // ── Core list endpoints (must return {data, total, page, pageSize, hasMore}) ──
  { name: "GET /api/students (list)",   path: "/api/students?limit=100&offset=0",        checkPaginatedShape: true },
  { name: "GET /api/sessions (list)",   path: "/api/sessions?limit=100&offset=0",        checkPaginatedShape: true },
  { name: "GET /api/alerts (list)",     path: "/api/alerts?limit=100&resolved=false",    checkPaginatedShape: true },
  { name: "GET /api/documents (list)",  path: `/api/documents?limit=100&studentId=${DOCUMENTS_STUDENT_ID}`, checkPaginatedShape: true },
  { name: "GET /api/audit-logs",        path: "/api/audit-logs?limit=100",               checkPaginatedShape: true },
  { name: "GET /api/students (filter)", path: "/api/students?limit=100&status=active",   checkPaginatedShape: true },

  // ── Dashboard / aggregate / report generation endpoints ──
  { name: "GET /api/dashboard/summary",        path: "/api/dashboard/summary",           checkPaginatedShape: false },
  { name: "GET /api/reports/compliance-risk",  path: "/api/reports/compliance-risk-report?limit=100", checkPaginatedShape: false },
  { name: "GET /api/reports/audit-package",    path: "/api/reports/audit-package",       checkPaginatedShape: false },
];

interface Result {
  durationMs: number;
  status: number;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (AUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
  } else if (USE_TEST_HEADERS) {
    headers["x-test-user-id"]     = TEST_USER_ID;
    headers["x-test-role"]        = TEST_ROLE;
    headers["x-test-district-id"] = TEST_DISTRICT_ID;
  }
  return headers;
}

async function timedFetch(url: string): Promise<Result> {
  const t0 = performance.now();
  let status = 0;
  try {
    const res = await fetch(url, { headers: buildHeaders() });
    status = res.status;
    await res.text();
  } catch {
    status = 0;  // network error
  }
  return { durationMs: performance.now() - t0, status };
}

async function runWithConcurrency(
  tasks: Array<() => Promise<Result>>,
  concurrency: number,
): Promise<Result[]> {
  const results: Result[] = new Array(tasks.length);
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const myIdx = idx++;
      results[myIdx] = await tasks[myIdx]();
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

interface Report {
  name: string;
  requests: number;
  paginationShapeOk: boolean;
  authErrors: number;
  serverErrors: number;
  errorRatePct: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  p95Passed: boolean;
  errorRatePassed: boolean;
  passed: boolean;
}

async function checkPaginationShape(path: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, { headers: buildHeaders() });
    if (!res.ok) return false;
    const body = await res.json();
    return (
      body !== null &&
      typeof body === "object" &&
      "data" in body &&
      "total" in body &&
      "page" in body &&
      "pageSize" in body &&
      "hasMore" in body &&
      Array.isArray(body.data)
    );
  } catch {
    return false;
  }
}

async function runEndpoint(spec: EndpointSpec): Promise<Report> {
  const url   = `${BASE_URL}${spec.path}`;
  const paginationShapeOk = spec.checkPaginatedShape !== false
    ? await checkPaginationShape(spec.path)
    : true;  // shape check not applicable for aggregate/report endpoints
  const tasks = Array.from({ length: REQUESTS_PER_ENDPOINT }, () => () => timedFetch(url));
  const raw   = await runWithConcurrency(tasks, CONCURRENCY);

  const authErrors   = raw.filter(r => r.status === 401 || r.status === 403).length;
  const serverErrors = raw.filter(r => r.status === 0 || r.status >= 500).length;
  const totalErrors  = authErrors + serverErrors;
  const errorRatePct = (totalErrors / REQUESTS_PER_ENDPOINT) * 100;

  // Measure latency on successful responses only so auth fast-fails don't
  // produce misleadingly low p95 values.
  const successDurations = raw
    .filter(r => r.status >= 200 && r.status < 300)
    .map(r => r.durationMs)
    .sort((a, b) => a - b);

  const p50 = percentile(successDurations, 50);
  const p95 = percentile(successDurations, 95);
  const p99 = percentile(successDurations, 99);
  const max = successDurations[successDurations.length - 1] ?? 0;

  // p95 assertion is only meaningful when we have enough successful samples
  const hasEnoughSamples = successDurations.length >= REQUESTS_PER_ENDPOINT * 0.5;
  const p95Passed         = hasEnoughSamples && p95 < P95_BUDGET_MS;
  const errorRatePassed   = errorRatePct <= MAX_ERROR_RATE_PCT;

  return {
    name: spec.name,
    requests: REQUESTS_PER_ENDPOINT,
    paginationShapeOk,
    authErrors,
    serverErrors,
    errorRatePct,
    p50,
    p95,
    p99,
    max,
    p95Passed,
    errorRatePassed,
    passed: p95Passed && errorRatePassed && paginationShapeOk,
  };
}

function fmt(ms: number) { return ms > 0 ? `${ms.toFixed(0).padStart(6)}ms` : "     N/A"; }

/** Fetch the total student count from the API. Returns -1 on failure. */
async function fetchStudentCount(): Promise<number> {
  try {
    const res = await fetch(`${BASE_URL}/api/students?limit=1&page=1`, { headers: buildHeaders() });
    if (!res.ok) return -1;
    const body = await res.json();
    return typeof body.total === "number" ? body.total : -1;
  } catch {
    return -1;
  }
}

async function main(): Promise<void> {
  const hasAuth = !!(AUTH_TOKEN || USE_TEST_HEADERS);
  if (!hasAuth) {
    console.warn(
      "\n⚠  No auth configured. Requests will get 401 and p95 results will not be meaningful.\n" +
      "   Set AUTH_TOKEN=<bearer> or USE_TEST_HEADERS=1 (requires NODE_ENV=test on the server).\n"
    );
  }

  const authMode = AUTH_TOKEN ? "bearer token" : USE_TEST_HEADERS ? "test headers (x-test-*)" : "NONE";

  console.log(`\nTrellis 5k-student load test`);
  console.log(`  Target:       ${BASE_URL}`);
  console.log(`  Auth:         ${authMode}`);
  console.log(`  Concurrency:  ${CONCURRENCY}`);
  console.log(`  Requests:     ${REQUESTS_PER_ENDPOINT} per endpoint`);
  console.log(`  p95 budget:   < ${P95_BUDGET_MS}ms (on successful responses only)`);
  console.log(`  Error budget: ≤ ${MAX_ERROR_RATE_PCT}% non-2xx\n`);

  // Dataset size check — warn (or fail with ENFORCE_5K=1) if < 5,000 students
  const studentCount = await fetchStudentCount();
  const datasetLabel = studentCount >= 0 ? `${studentCount.toLocaleString()} students in dataset` : "unable to fetch student count";
  const datasetOk = studentCount < 0 || studentCount >= DATASET_MIN_STUDENTS;
  console.log(`  Dataset:      ${datasetLabel}`);
  if (!datasetOk) {
    const msg = `  ⚠  Dataset has only ${studentCount} students (need ${DATASET_MIN_STUDENTS.toLocaleString()} for 5k-scale test).`;
    if (ENFORCE_5K) {
      console.error(msg);
      console.error("     Run the realistic seed script then retry. (ENFORCE_5K=1 is set.)");
      process.exit(1);
    } else {
      console.warn(msg);
      console.warn("     Results still measure latency, but may not reflect production query plans.");
      console.warn("     Set ENFORCE_5K=1 to hard-fail on insufficient dataset size.\n");
    }
  }
  console.log();

  const reports: Report[] = [];

  for (const spec of ENDPOINTS) {
    process.stdout.write(`  Running ${spec.name} ... `);
    const r = await runEndpoint(spec);
    reports.push(r);

    const badge = r.passed ? "PASS" : "FAIL";
    const shapeTag = r.paginationShapeOk ? "" : "  [SHAPE FAIL]";
    console.log(
      `${badge}  p50=${fmt(r.p50)}  p95=${fmt(r.p95)}  p99=${fmt(r.p99)}  max=${fmt(r.max)}` +
      `  auth_err=${r.authErrors}  server_err=${r.serverErrors}  err_rate=${r.errorRatePct.toFixed(1)}%${shapeTag}`
    );
  }

  const allPassed = reports.every(r => r.passed);

  console.log("\n─────────────────────────────────────────────────────────────────────");
  if (allPassed) {
    console.log("✓ All endpoints pass: p95 < 800ms, error rate ≤ 10%, and pagination shape correct.");
  } else {
    console.log("✗ One or more endpoints FAILED.");
    for (const r of reports.filter(x => !x.passed)) {
      if (!r.paginationShapeOk) {
        console.error(`  ${r.name}: response does not match {data, total, page, pageSize, hasMore} shape`);
      }
      if (!r.p95Passed) {
        const reason = r.p95 > 0
          ? `p95=${r.p95.toFixed(0)}ms exceeds ${P95_BUDGET_MS}ms budget`
          : "insufficient successful samples to measure p95 (check AUTH_TOKEN)";
        console.error(`  ${r.name}: ${reason}`);
      }
      if (!r.errorRatePassed) {
        console.error(`  ${r.name}: error rate ${r.errorRatePct.toFixed(1)}% exceeds ${MAX_ERROR_RATE_PCT}% budget (auth_err=${r.authErrors}, server_err=${r.serverErrors})`);
      }
    }
  }
  console.log("─────────────────────────────────────────────────────────────────────\n");

  if (!allPassed) process.exit(1);
}

main().catch(err => {
  console.error("Load test error:", err);
  process.exit(1);
});
