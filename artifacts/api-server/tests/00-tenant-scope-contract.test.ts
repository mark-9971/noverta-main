/**
 * Route tenant-scope contract test.
 *
 * Enforces that EVERY route file that touches @workspace/db carries one of the
 * recognised scoping patterns. This is the programmatic equivalent of
 * scripts/check-tenant-scope.sh and runs in the Vitest suite so scope
 * violations block the test run just like any other failing test.
 *
 * Scoping vocabulary:
 *   getEnforcedDistrictId   — explicit district-scope (preferred)
 *   requirePlatformAdmin    — platform-admin-only (support/* endpoints)
 *   requireGuardianScope    — guardian portal routes
 *   requireStudentScope     — student portal routes
 *   tenant-scope: public            — intentionally unauthenticated route
 *   tenant-scope: district-join     — scoped via FK joins (student→school→district)
 *   tenant-scope: platform-admin    — platform-admin annotation
 *   tenant-scope: guardian          — scoped via guardianId from auth token
 *   tenant-scope: student           — scoped via studentId from auth token
 *   tenant-scope: param-guard       — scoped via a route param guard
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROUTES_DIR = path.resolve(__dirname, "../src/routes");

/** Files that are pure orchestration / re-export — no DB queries themselves. */
const SKIP_FILENAMES = new Set(["index.ts", "shared.ts"]);

/** Every file that imports @workspace/db must contain at least one of these. */
const SCOPE_PATTERNS = [
  "getEnforcedDistrictId",
  "requirePlatformAdmin",
  "requireGuardianScope",
  "requireStudentScope",
  "tenant-scope: platform-admin",
  "tenant-scope: public",
  "tenant-scope: district-join",
  "tenant-scope: guardian",
  "tenant-scope: student",
  "tenant-scope: param-guard",
] as const;

function* walkDir(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkDir(full);
    else if (entry.name.endsWith(".ts")) yield full;
  }
}

function collectRouteFiles(): string[] {
  return [...walkDir(ROUTES_DIR)].filter(
    (f) => !SKIP_FILENAMES.has(path.basename(f))
  );
}

function isScopedFile(content: string): boolean {
  return SCOPE_PATTERNS.some((p) => content.includes(p));
}

describe("tenant scope contract", () => {
  const routeFiles = collectRouteFiles();

  it("every route file that queries the DB carries a recognised tenant-scope pattern", () => {
    const violations: string[] = [];

    for (const file of routeFiles) {
      const content = fs.readFileSync(file, "utf8");

      // Skip files that don't import the DB — they have no tenant scope concern.
      if (!content.includes("@workspace/db")) continue;

      if (!isScopedFile(content)) {
        violations.push(path.relative(ROUTES_DIR, file));
      }
    }

    if (violations.length > 0) {
      const msg =
        `${violations.length} route file(s) missing tenant-scope annotation or enforcement:\n` +
        violations.map((v) => `  - ${v}`).join("\n") +
        "\n\nAdd one of: getEnforcedDistrictId(), requirePlatformAdmin, requireGuardianScope,\n" +
        "or a // tenant-scope: <public|district-join|guardian|student|param-guard|platform-admin> comment.";
      expect.fail(msg);
    }

    expect(violations).toHaveLength(0);
  });

  it("at least 100 route files are covered by this contract check", () => {
    // Regression guard: if the routes directory shrinks dramatically, this test
    // fails fast rather than silently passing with an empty set.
    const dbFiles = routeFiles.filter((f) =>
      fs.readFileSync(f, "utf8").includes("@workspace/db")
    );
    expect(dbFiles.length).toBeGreaterThanOrEqual(100);
  });
});
