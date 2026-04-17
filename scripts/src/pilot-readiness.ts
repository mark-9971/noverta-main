/**
 * Pilot-Readiness Audit
 * ---------------------
 * Internal pre-demo / pre-pilot check. Run from the workspace root:
 *
 *   pnpm --filter @workspace/scripts run pilot-audit
 *
 * Optional env:
 *   API_BASE         default http://localhost:8080
 *   PILOT_DISTRICT_ID  default 4 (MetroWest demo district in dev)
 *   STRICT=1         exit 1 even on warnings (default: only on FAIL)
 *
 * The script exits with the number of FAIL checks (0 if pilot-ready).
 * Warnings do not affect exit code unless STRICT=1.
 */

import { Pool } from "pg";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

type Status = "PASS" | "WARN" | "FAIL" | "SKIP";

interface CheckResult {
  group: string;
  name: string;
  status: Status;
  detail: string;
}

const results: CheckResult[] = [];

function record(group: string, name: string, status: Status, detail: string) {
  results.push({ group, name, status, detail });
}

const API_BASE = process.env.API_BASE ?? "http://localhost:8080";
const PILOT_DISTRICT_ID = Number(process.env.PILOT_DISTRICT_ID ?? "4");
const STRICT = process.env.STRICT === "1";

const REPO_ROOT = process.cwd().endsWith("/scripts")
  ? join(process.cwd(), "..")
  : process.cwd();

async function safeFetch(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; bodyText: string; json?: unknown }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, init);
    const bodyText = await res.text();
    let json: unknown;
    try { json = JSON.parse(bodyText); } catch { /* not json */ }
    return { ok: res.ok, status: res.status, bodyText, json };
  } catch (err) {
    return { ok: false, status: 0, bodyText: (err as Error).message };
  }
}

// ---------- 1. Required env vars ----------
function checkEnvVars() {
  const required = [
    ["DATABASE_URL", "Postgres connection. Without it nothing runs."],
    ["SESSION_SECRET", "Required for cookie signing and SIS credential encryption."],
    ["DEFAULT_OBJECT_STORAGE_BUCKET_ID", "File uploads (IEPs, exports) require object storage."],
    ["PRIVATE_OBJECT_DIR", "Private object path prefix."],
    ["PUBLIC_OBJECT_SEARCH_PATHS", "Public object path prefixes."],
  ];
  const recommended = [
    ["CLERK_SECRET_KEY", "Required in production for real auth."],
    ["CLERK_PUBLISHABLE_KEY", "Required in production for real auth."],
    ["RESEND_API_KEY", "Without this, parent/guardian emails are recorded but never sent."],
    ["SENTRY_DSN", "Without this, production errors are not aggregated."],
    ["REPLIT_DOMAINS", "Used to compute webhook callback URLs."],
  ];

  for (const [name, why] of required) {
    if (process.env[name]) {
      record("env", name, "PASS", "set");
    } else {
      record("env", name, "FAIL", `missing — ${why}`);
    }
  }
  for (const [name, why] of recommended) {
    if (process.env[name]) {
      record("env", name, "PASS", "set");
    } else {
      record("env", name, "WARN", `missing — ${why}`);
    }
  }
}

// ---------- 2. Auth posture ----------
async function checkAuthPosture() {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  if (nodeEnv === "production") {
    record("auth", "NODE_ENV", "PASS", "production");
  } else {
    record("auth", "NODE_ENV", "WARN", `${nodeEnv} — pilot/demo should run with NODE_ENV=production`);
  }

  // Unauthed request to a privileged endpoint should not return 200.
  const r1 = await safeFetch("/api/students");
  if (r1.status === 401 || r1.status === 403) {
    record("auth", "unauth /api/students rejected", "PASS", `HTTP ${r1.status}`);
  } else if (r1.status === 0) {
    record("auth", "unauth /api/students rejected", "FAIL", `API unreachable at ${API_BASE}`);
  } else {
    record("auth", "unauth /api/students rejected", "FAIL", `expected 401/403, got HTTP ${r1.status}`);
  }

  // x-test-* bypass MUST be off when not in test mode.
  const r2 = await safeFetch("/api/students", {
    headers: {
      "x-test-user-id": "1",
      "x-test-role": "admin",
      "x-test-district-id": String(PILOT_DISTRICT_ID),
    },
  });
  if (nodeEnv === "test") {
    record("auth", "x-test bypass active in test mode", r2.ok ? "PASS" : "WARN",
      `HTTP ${r2.status} (NODE_ENV=test, bypass expected)`);
  } else {
    // Outside test, ANY non-2xx response means the bypass was rejected (401/403/400 etc).
    // Only a 2xx is dangerous.
    if (r2.ok) {
      record("auth", "x-test bypass disabled outside test mode", "FAIL",
        `bypass headers were honored with NODE_ENV=${nodeEnv} — anyone can impersonate any role`);
    } else {
      record("auth", "x-test bypass disabled outside test mode", "PASS",
        `bypass blocked (HTTP ${r2.status})`);
    }
  }
}

// Helper: only emit x-test bypass headers when NODE_ENV === "test".
function testBypassHeaders(): Record<string, string> | undefined {
  if ((process.env.NODE_ENV ?? "development") !== "test") return undefined;
  return {
    "x-test-user-id": "1",
    "x-test-role": "admin",
    "x-test-district-id": String(PILOT_DISTRICT_ID),
  };
}

// ---------- 3. Health endpoint ----------
async function checkHealth() {
  const r = await safeFetch("/api/health");
  if (!r.json || typeof r.json !== "object") {
    record("health", "/api/health responds with JSON", "FAIL", `HTTP ${r.status} body=${r.bodyText.slice(0, 80)}`);
    return;
  }
  const j = r.json as Record<string, unknown>;
  if (j.status === "ok" && j.db === "connected") {
    record("health", "/api/health", "PASS", `db=${j.db} uptime=${j.uptime}s sentry=${j.sentry}`);
  } else {
    record("health", "/api/health", "FAIL", `status=${j.status} db=${j.db}`);
  }
}

// ---------- 4. Compliance queries functioning ----------
async function checkCompliance(pool: Pool) {
  const studentCount = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM students s
     JOIN schools sc ON sc.id = s.school_id
     WHERE sc.district_id = $1 AND s.deleted_at IS NULL`,
    [PILOT_DISTRICT_ID],
  ).catch((err: Error) => { record("compliance", "students table reachable", "FAIL", err.message); return null; });
  if (!studentCount) return;
  if (studentCount.rows[0].n === 0) {
    record("compliance", "pilot district has students", "FAIL",
      `district ${PILOT_DISTRICT_ID} has 0 students — load roster before pilot`);
    return;
  }
  record("compliance", "pilot district has students", "PASS", `${studentCount.rows[0].n} students`);

  const reqCount = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM service_requirements sr
     JOIN students s ON s.id = sr.student_id
     JOIN schools sc ON sc.id = s.school_id
     WHERE sc.district_id = $1`,
    [PILOT_DISTRICT_ID],
  );
  if (reqCount.rows[0].n === 0) {
    record("compliance", "pilot district has service requirements", "FAIL",
      `0 service_requirements — minute-progress will be empty`);
  } else {
    record("compliance", "pilot district has service requirements", "PASS", `${reqCount.rows[0].n} requirements`);
  }

  // Live compliance read via API. The x-test bypass middleware is only active when
  // NODE_ENV === "test". In dev or prod we cannot make an authenticated call from
  // here, so we skip the live read and rely on the DB-level checks above.
  const headers = testBypassHeaders();
  if (!headers) {
    record("compliance", "/api/minute-progress live read", "SKIP",
      `NODE_ENV=${process.env.NODE_ENV ?? "development"} — live API read needs NODE_ENV=test`);
  } else {
    const r = await safeFetch("/api/minute-progress", { headers });
    if (!r.ok) {
      record("compliance", "/api/minute-progress live read", "FAIL", `HTTP ${r.status}`);
    } else {
      const arr = Array.isArray(r.json) ? r.json : (r.json as { data?: unknown[] })?.data;
      const len = Array.isArray(arr) ? arr.length : 0;
      record("compliance", "/api/minute-progress live read", len > 0 ? "PASS" : "WARN",
        `returned ${len} rows`);
    }
  }
}

// ---------- 5. Import flow ----------
async function checkImports() {
  const headers = testBypassHeaders();
  const inTest = headers !== undefined;

  // Template endpoint — verifies the import flow's static catalog is wired.
  const r1 = await safeFetch("/api/imports/templates/students", { headers });
  if (inTest && !r1.ok) {
    record("imports", "GET /api/imports/templates/students", "FAIL", `HTTP ${r1.status}`);
  } else if (!inTest && (r1.status === 401 || r1.status === 403)) {
    record("imports", "GET /api/imports/templates/students", "PASS", `auth-gated (HTTP ${r1.status})`);
  } else if (r1.ok) {
    record("imports", "GET /api/imports/templates/students", "PASS",
      `template served (${r1.bodyText.length} bytes)`);
  } else if (r1.status === 404) {
    record("imports", "GET /api/imports/templates/students", "FAIL", "route not registered (404)");
  } else {
    record("imports", "GET /api/imports/templates/students", "WARN", `HTTP ${r1.status}`);
  }

  // Import history list endpoint — verifies the import worker tables exist and route is mounted.
  const r2 = await safeFetch("/api/imports", { headers });
  if (inTest && !r2.ok) {
    record("imports", "GET /api/imports", "FAIL", `HTTP ${r2.status}`);
  } else if (!inTest && (r2.status === 401 || r2.status === 403)) {
    record("imports", "GET /api/imports", "PASS", `auth-gated (HTTP ${r2.status})`);
  } else if (r2.ok) {
    record("imports", "GET /api/imports", "PASS", "history list reachable");
  } else if (r2.status === 404) {
    record("imports", "GET /api/imports", "FAIL", "route not registered (404)");
  } else {
    record("imports", "GET /api/imports", "WARN", `HTTP ${r2.status}`);
  }
}

// ---------- 6. Notification wiring ----------
async function checkNotifications(pool: Pool) {
  if (!process.env.RESEND_API_KEY) {
    record("notifications", "email provider", "WARN",
      "RESEND_API_KEY missing — guardian emails will be logged but not delivered");
  } else {
    record("notifications", "email provider", "PASS", "RESEND_API_KEY set");
  }

  // Verify the communication_events table exists (target for queued notifications).
  const tbl = await pool.query<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'communication_events'",
  ).catch(() => null);
  if (tbl && tbl.rows[0].n > 0) {
    record("notifications", "communication_events table", "PASS", "exists");
  } else {
    record("notifications", "communication_events table", "FAIL", "missing — notification queue cannot record events");
  }
}

// ---------- 7. Export generation status ----------
async function checkExports() {
  // Probe an unauthed request to a known export route — we expect 401/403, NOT 404.
  // 404 would mean the route is not mounted at all. Actual mount is at
  // /api/reports/exports/* (see routes/index.ts: router.use("/reports/exports", ...)).
  const probes = [
    "/api/reports/exports/history",
    "/api/reports/exports/scheduled",
  ];
  for (const path of probes) {
    const r = await safeFetch(path);
    if (r.status === 401 || r.status === 403) {
      record("exports", `route ${path} mounted`, "PASS", `auth-gated (HTTP ${r.status})`);
    } else if (r.status === 404) {
      record("exports", `route ${path} mounted`, "FAIL", "route returns 404 — not registered");
    } else if (r.ok) {
      record("exports", `route ${path} mounted`, "WARN", `unauthed request returned 200 — check auth`);
    } else {
      record("exports", `route ${path} mounted`, "WARN", `HTTP ${r.status}`);
    }
  }
}

// ---------- 8. Critical setup / config ----------
async function checkSetup(pool: Pool) {
  // At least one staff record with admin role for the pilot district.
  // staff has no district_id column — district is derived through schools.school_id.
  const admin = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM staff st
     JOIN schools sc ON sc.id = st.school_id
     WHERE sc.district_id = $1 AND st.role = 'admin' AND st.deleted_at IS NULL`,
    [PILOT_DISTRICT_ID],
  ).catch((err: Error) => err);
  if (admin instanceof Error) {
    record("setup", "pilot district has admin staff", "WARN", `query error: ${admin.message}`);
  } else if (admin.rows[0].n === 0) {
    record("setup", "pilot district has admin staff", "FAIL",
      `district ${PILOT_DISTRICT_ID} has no admin staff — nobody can run the platform`);
  } else {
    record("setup", "pilot district has admin staff", "PASS", `${admin.rows[0].n} admin(s)`);
  }

  // Service rate configs — without these compensatory finance falls back to a generic rate.
  const tbl = await pool.query<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'service_rate_configs'",
  ).catch(() => null);
  if (tbl && tbl.rows[0].n > 0) {
    const rates = await pool.query<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM service_rate_configs WHERE district_id = $1",
      [PILOT_DISTRICT_ID],
    ).catch(() => null);
    if (!rates || rates.rows[0].n === 0) {
      record("setup", "pilot district has service rate configs", "WARN",
        `no district-specific rates — compensatory finance will use system defaults`);
    } else {
      record("setup", "pilot district has service rate configs", "PASS",
        `${rates.rows[0].n} rate config(s)`);
    }
  } else {
    record("setup", "service_rate_configs table", "WARN", "table missing — comp-finance uses defaults only");
  }

  // District record exists with a name.
  const dist = await pool.query<{ name: string | null }>(
    "SELECT name FROM districts WHERE id = $1",
    [PILOT_DISTRICT_ID],
  ).catch(() => null);
  if (!dist || dist.rows.length === 0) {
    record("setup", `district ${PILOT_DISTRICT_ID} exists`, "FAIL", "no row in districts table");
  } else if (!dist.rows[0].name) {
    record("setup", `district ${PILOT_DISTRICT_ID} exists`, "WARN", "district has no name");
  } else {
    record("setup", `district ${PILOT_DISTRICT_ID} exists`, "PASS", `name="${dist.rows[0].name}"`);
  }

  // At least one active service requirement (so there's something to log against).
  // service_requirements.end_date is text (ISO yyyy-mm-dd), so cast for the comparison.
  const openReqs = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM service_requirements sr
     JOIN students s ON s.id = sr.student_id
     JOIN schools sc ON sc.id = s.school_id
     WHERE sc.district_id = $1
       AND sr.active = true
       AND (sr.end_date IS NULL OR sr.end_date::date >= CURRENT_DATE)`,
    [PILOT_DISTRICT_ID],
  ).catch((err: Error) => { record("setup", "active service requirements", "WARN", `query error: ${err.message}`); return null; });
  if (!openReqs) {
    record("setup", "active service requirements", "WARN", "query failed");
  } else if (openReqs.rows[0].n === 0) {
    record("setup", "active service requirements", "FAIL",
      "no currently-active service_requirements — minute-progress will show nothing");
  } else {
    record("setup", "active service requirements", "PASS", `${openReqs.rows[0].n} active`);
  }
}

// ---------- 9. No fake/mock data left in user-facing pages ----------
function checkNoFakeAnalytics() {
  // Curated list of pages that reach end-users and should not contain Math.random or
  // hardcoded "mock" objects in production. These are the surfaces a district admin
  // sees during a demo.
  const surfaces = [
    "artifacts/trellis/src/pages/index.tsx",
    "artifacts/trellis/src/pages/dashboard.tsx",
    "artifacts/trellis/src/pages/reports.tsx",
    "artifacts/trellis/src/pages/analytics.tsx",
    "artifacts/trellis/src/pages/admin-dashboard.tsx",
    "artifacts/trellis/src/pages/director-dashboard.tsx",
    "artifacts/trellis/src/pages/compliance-overview.tsx",
    "artifacts/trellis/src/pages/compensatory-finance.tsx",
  ];
  const suspicious = /\b(Math\.random|mockData|fakeData|stubData|TODO:.*demo|FIXME)\b/;
  let scanned = 0;
  let flagged = 0;
  for (const rel of surfaces) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) continue;
    scanned++;
    const src = readFileSync(abs, "utf8");
    const m = src.match(suspicious);
    if (m) {
      flagged++;
      record("no-fake-data", rel, "WARN",
        `contains "${m[0]}" — verify this is not user-visible mock content`);
    }
  }
  if (scanned === 0) {
    record("no-fake-data", "user-facing pages scanned", "WARN", "no curated pages found at expected paths");
  } else if (flagged === 0) {
    record("no-fake-data", "user-facing pages scanned", "PASS",
      `${scanned} page(s) clean (no Math.random / mockData / TODO markers)`);
  }
}

// ---------- Reporting ----------
function color(s: Status): string {
  const tty = process.stdout.isTTY;
  if (!tty) return s;
  switch (s) {
    case "PASS": return `\x1b[32m${s}\x1b[0m`;
    case "WARN": return `\x1b[33m${s}\x1b[0m`;
    case "FAIL": return `\x1b[31m${s}\x1b[0m`;
    case "SKIP": return `\x1b[90m${s}\x1b[0m`;
  }
}

function printResults() {
  const groups = [...new Set(results.map(r => r.group))];
  console.log("");
  console.log("================================================================");
  console.log(`Pilot-Readiness Audit  —  district ${PILOT_DISTRICT_ID}  —  ${API_BASE}`);
  console.log(`NODE_ENV=${process.env.NODE_ENV ?? "development"}`);
  console.log("================================================================");
  for (const g of groups) {
    console.log(`\n[${g}]`);
    for (const r of results.filter(x => x.group === g)) {
      const pad = r.name.padEnd(48, " ");
      console.log(`  ${color(r.status).padEnd(15, " ")} ${pad}  ${r.detail}`);
    }
  }
  const counts = {
    PASS: results.filter(r => r.status === "PASS").length,
    WARN: results.filter(r => r.status === "WARN").length,
    FAIL: results.filter(r => r.status === "FAIL").length,
    SKIP: results.filter(r => r.status === "SKIP").length,
  };
  console.log("\n----------------------------------------------------------------");
  console.log(`SUMMARY: ${counts.PASS} pass, ${counts.WARN} warn, ${counts.FAIL} fail, ${counts.SKIP} skip`);
  if (counts.FAIL === 0 && counts.WARN === 0) {
    console.log("Verdict: READY for pilot demo.");
  } else if (counts.FAIL === 0) {
    console.log("Verdict: PILOT-OK with caveats — review WARN items before a paid pilot.");
  } else {
    console.log("Verdict: NOT READY — address FAIL items before demoing.");
  }
  console.log("================================================================\n");
}

// ---------- main ----------
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — cannot run audit.");
    process.exit(2);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  checkEnvVars();
  await checkAuthPosture();
  await checkHealth();
  await checkCompliance(pool);
  await checkImports();
  await checkNotifications(pool);
  await checkExports();
  await checkSetup(pool);
  checkNoFakeAnalytics();

  await pool.end();
  printResults();

  const fails = results.filter(r => r.status === "FAIL").length;
  const warns = results.filter(r => r.status === "WARN").length;
  const exitCode = fails > 0 ? fails : (STRICT && warns > 0 ? 1 : 0);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("Audit crashed:", err);
  process.exit(99);
});
