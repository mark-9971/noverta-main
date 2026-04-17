/**
 * Auto-generated route authentication coverage.
 *
 * Derives the full list of API route prefixes by parsing the route registry
 * (src/routes/index.ts) at test-time, then verifies two properties for every
 * discovered prefix:
 *
 *   (a) Unauthenticated: GET /api/<prefix> → 401 (Clerk session required).
 *   (b) No-district-scope: GET /api/<prefix> → 401 or 403 (district scope required,
 *       never leaks a 200 without a valid district context).
 *
 * Unlike 03-route-isolation-matrix.test.ts (which manually seeds two districts
 * and checks cross-district leakage for specific entities), this file derives
 * its test cases entirely from the route registration file — so any new route
 * added to index.ts is automatically covered.
 *
 * Routes explicitly excluded from (a):
 *   health, documents, demo-requests, shared-progress-public — mounted before
 *   requireAuth, intentionally public.
 *
 * Routes excluded from (b) but covered by (a):
 *   guardian-portal, student-portal — use alternate scope mechanisms, not district.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import request from "supertest";
import { seedLegalAcceptances, cleanupLegalAcceptances } from "./helpers";
import app from "../src/app";

// ---------------------------------------------------------------------------
// Parse route registry
// ---------------------------------------------------------------------------

const REGISTRY_PATH = path.resolve(__dirname, "../src/routes/index.ts");

/**
 * Extract all route prefixes registered with `router.use("/prefix", someRouter)`.
 * Returns an array of path strings like ["/students", "/staff", ...].
 */
function extractRoutePrefixes(): string[] {
  const content = fs.readFileSync(REGISTRY_PATH, "utf8");
  const prefixes = new Set<string>();
  // Match: router.use("/foo", anything) — captures the path segment.
  const re = /router\.use\(\s*["'](\/?[\w-]+(?:\/[\w-]+)*)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    prefixes.add(m[1].startsWith("/") ? m[1] : `/${m[1]}`);
  }
  return Array.from(prefixes);
}

// Paths that are intentionally public (mounted before requireAuth).
const PUBLIC_PREFIXES = new Set([
  "/health",
  "/documents",        // public shared documents
  "/demo-requests",    // unauthenticated demo sign-up
  "/shared-progress",  // parent-facing public progress
]);

// Paths that use alternate scope (not district-scope), excluded from test (b).
const NON_DISTRICT_PREFIXES = new Set([
  "/guardian-portal",
  "/student-portal",
  "/medicaid",         // district-scoped but uses getEnforcedDistrictId; tested in (a)
]);

// ---------------------------------------------------------------------------
// Test-user IDs
// ---------------------------------------------------------------------------

/** Completely anonymous — no headers at all. */
const NO_SCOPE_USER_ID = "u_no_district";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let allPrefixes: string[] = [];
let authRequiredPrefixes: string[] = [];
let districtScopedPrefixes: string[] = [];

beforeAll(async () => {
  await seedLegalAcceptances([NO_SCOPE_USER_ID]);

  allPrefixes = extractRoutePrefixes();
  authRequiredPrefixes = allPrefixes.filter(p => !PUBLIC_PREFIXES.has(p));
  districtScopedPrefixes = authRequiredPrefixes.filter(p => !NON_DISTRICT_PREFIXES.has(p));
});

afterAll(async () => {
  await cleanupLegalAcceptances([NO_SCOPE_USER_ID]);
});

// ---------------------------------------------------------------------------
// (a) Unauthenticated requests must return 401
// ---------------------------------------------------------------------------

describe("(a) Every auth-required API route prefix demands a session", () => {
  it("route registry yielded ≥ 15 authenticated route prefixes", () => {
    expect(authRequiredPrefixes.length, `Only found: [${authRequiredPrefixes.join(", ")}]`).toBeGreaterThanOrEqual(15);
  });

  it("all auth-required prefixes return 401 for an anonymous caller", async () => {
    const failures: string[] = [];

    await Promise.all(authRequiredPrefixes.map(async (prefix) => {
      const res = await (request(app) as any).get(`/api${prefix}`);
      if (res.status !== 401) {
        failures.push(`GET /api${prefix} → ${res.status} (expected 401)`);
      }
    }));

    expect(
      failures,
      `Routes accepting unauthenticated requests:\n${failures.join("\n")}`
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (b) No-district-scope → 401 or 403
// ---------------------------------------------------------------------------

describe("(b) District-scoped route prefixes fail closed without district scope", () => {
  it("found ≥ 10 district-scoped prefixes to test", () => {
    expect(districtScopedPrefixes.length, `Only found: [${districtScopedPrefixes.join(", ")}]`).toBeGreaterThanOrEqual(10);
  });

  it("all district-scoped prefixes return 401 or 403 for no-district-scope user", async () => {
    const failures: string[] = [];

    await Promise.all(districtScopedPrefixes.map(async (prefix) => {
      const res = await (request(app) as any)
        .get(`/api${prefix}`)
        .set("x-test-user-id", NO_SCOPE_USER_ID)
        .set("x-test-role", "admin");

      if (![401, 403].includes(res.status)) {
        failures.push(`GET /api${prefix} → ${res.status} (expected 401 or 403)`);
      }
    }));

    expect(
      failures,
      `Routes not failing closed for no-district-scope user:\n${failures.join("\n")}`
    ).toHaveLength(0);
  });
});
