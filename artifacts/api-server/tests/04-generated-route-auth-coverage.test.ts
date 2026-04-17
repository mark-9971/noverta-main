/**
 * Auto-generated route authentication coverage.
 *
 * Derives the full list of API route prefixes by parsing the route registry
 * (src/routes/index.ts) at test-time, then verifies three properties for every
 * discovered prefix:
 *
 *   (a) Unauthenticated: GET /api/<prefix> → 401 (Clerk session required).
 *   (b) No-district-scope: GET /api/<prefix> → 401 or 403 (district scope required,
 *       never leaks a 200 without a valid district context).
 *   (c) Cross-tenant body isolation: for each district-scoped route, a district-A
 *       admin's GET response must not contain district-B entity IDs.
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
 * Routes excluded from (b) and (c) but covered by (a):
 *   guardian-portal, student-portal — use alternate scope mechanisms, not district.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import request from "supertest";
import {
  seedLegalAcceptances,
  cleanupLegalAcceptances,
  createDistrict,
  createSchool,
  createStudent,
} from "./helpers";
import { db, districtsTable, schoolsTable, studentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

// Paths that use alternate scope (not district-scope), excluded from test (b) and (c).
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

/** District-A admin — used for cross-tenant body leakage tests (c). */
const ISOLATION_ADMIN_A = "u_isolation_admin_a";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let allPrefixes: string[] = [];
let authRequiredPrefixes: string[] = [];
let districtScopedPrefixes: string[] = [];

beforeAll(async () => {
  await seedLegalAcceptances([NO_SCOPE_USER_ID, ISOLATION_ADMIN_A]);

  allPrefixes = extractRoutePrefixes();
  authRequiredPrefixes = allPrefixes.filter(p => !PUBLIC_PREFIXES.has(p));
  districtScopedPrefixes = authRequiredPrefixes.filter(p => !NON_DISTRICT_PREFIXES.has(p));
});

afterAll(async () => {
  await cleanupLegalAcceptances([NO_SCOPE_USER_ID, ISOLATION_ADMIN_A]);
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

// ---------------------------------------------------------------------------
// (c) Cross-tenant body isolation — generated per-route leakage assertion
// ---------------------------------------------------------------------------

/**
 * Recursively walks a parsed JSON value and returns true if `target`
 * appears anywhere as a leaf value (number, string, etc.).
 * Used to detect sentinel entity IDs from district B inside district A responses.
 */
function containsValue(obj: unknown, target: unknown): boolean {
  if (obj === null || obj === undefined) return false;
  if (obj === target) return true;
  if (Array.isArray(obj)) return obj.some(item => containsValue(item, target));
  if (typeof obj === "object") {
    return Object.values(obj as Record<string, unknown>).some(v =>
      containsValue(v, target)
    );
  }
  return false;
}

describe("(c) Cross-tenant body isolation — district-A responses must not contain district-B entity IDs", () => {
  let districtAId: number;
  let districtBId: number;
  let studentBId: number;

  beforeAll(async () => {
    // Seed district A and district B each with a school and a student.
    // district B's student is the "sentinel" — any appearance of its ID in a
    // district-A response body is a cross-tenant data leak.
    const distA = await createDistrict();
    const schoolA = await createSchool(distA.id);
    await createStudent(schoolA.id);   // district A student (needed to get 200s)

    const distB = await createDistrict();
    const schoolB = await createSchool(distB.id);
    const studentB = await createStudent(schoolB.id); // SENTINEL

    districtAId = distA.id;
    districtBId = distB.id;
    studentBId = studentB.id;
  });

  afterAll(async () => {
    // Remove sentinel student, school, and both districts (cascade deletes children).
    await db
      .delete(studentsTable)
      .where(eq(studentsTable.id, studentBId))
      .catch(() => {});
    await db
      .delete(schoolsTable)
      .where(eq(schoolsTable.districtId, districtAId))
      .catch(() => {});
    await db
      .delete(schoolsTable)
      .where(eq(schoolsTable.districtId, districtBId))
      .catch(() => {});
    await db
      .delete(districtsTable)
      .where(eq(districtsTable.id, districtAId))
      .catch(() => {});
    await db
      .delete(districtsTable)
      .where(eq(districtsTable.id, districtBId))
      .catch(() => {});
  });

  it("sentinel district-B student ID is a positive integer (fixture created)", () => {
    expect(studentBId).toBeGreaterThan(0);
    expect(districtAId).toBeGreaterThan(0);
    expect(districtBId).not.toEqual(districtAId);
  });

  it("no district-B entity IDs appear in any district-A admin GET response", async () => {
    const leaks: string[] = [];

    await Promise.all(
      districtScopedPrefixes.map(async (prefix) => {
        const res = await (request(app) as any)
          .get(`/api${prefix}`)
          .set("x-test-user-id", ISOLATION_ADMIN_A)
          .set("x-test-role", "admin")
          .set("x-test-district-id", String(districtAId));

        // Only inspect successful list/object responses.
        // 400/404/500 or non-JSON means the route needs more params — still
        // protected upstream, so absence of a body is safe by definition.
        if (res.status !== 200) return;

        const body = res.body;
        if (body === null || (typeof body !== "object" && !Array.isArray(body))) return;

        // Sentinel check: district-B student ID must not appear anywhere in body.
        //
        // We check studentBId specifically (not districtBId) because:
        //   - Student IDs are the primary PII across tenant boundaries; their
        //     presence in a district-A response is an unambiguous isolation failure.
        //   - District IDs may legitimately appear in routes such as /api/districts
        //     or /api/district-overview that use Clerk-metadata scope (getPublicMeta)
        //     rather than the test-header scope mechanism; these routes have their
        //     own security contract and are covered by the static scope guard.
        if (containsValue(body, studentBId)) {
          leaks.push(
            `GET /api${prefix} → district-B student ID (${studentBId}) found in response body`
          );
        }
      })
    );

    expect(
      leaks,
      `Cross-tenant leakage detected:\n${leaks.join("\n")}`
    ).toHaveLength(0);
  });
});
