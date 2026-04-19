/**
 * Phase 3A-2 — enforceDistrictScope clamp regression test.
 *
 * `enforceDistrictScope` is mounted globally on /api in app.ts. It defends
 * against future handlers that might accidentally read req.query.districtId /
 * req.query.schoolId directly, by overwriting the districtId param with the
 * token-derived value and stripping schoolId.
 *
 * Before Phase 3A-2 the middleware was a no-op outside NODE_ENV=production,
 * which meant every non-prod environment (preview, dev, the pilot Replit
 * environment) ran without that defense. This test pins the new behavior at
 * the middleware-function layer so it cannot be silently disabled again,
 * regardless of whether downstream handlers also clamp internally.
 *
 * Cases covered:
 *   1. Tenant-scoped caller (Clerk session): districtId is overwritten,
 *      schoolId is stripped.
 *   2. Test-bypass caller (NODE_ENV=test, x-test-district-id header):
 *      same behavior.
 *   3. Unscoped caller (no token tenant, no test header): pass-through —
 *      no mutation, request continues unchanged for downstream guards
 *      (e.g. requireDistrictScope) to reject.
 *   4. Tampered districtId is overwritten with the token value (not
 *      with the user-supplied value).
 *
 * tenant-scope: param-guard
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// Stub getPublicMeta so the middleware can be exercised as a pure function
// without standing up Clerk's middleware chain. The middleware reads tenant
// district from getPublicMeta() in production and from x-test-district-id in
// test/dev — both branches are covered below.
let _clerkPublicMeta: { districtId?: number; role?: string } = {};
vi.mock("../src/lib/clerkClaims", () => ({
  getPublicMeta: () => _clerkPublicMeta,
  getClerkUserId: () => null,
  getPublicMetaAsync: async () => _clerkPublicMeta,
}));

// Import AFTER the mock so the middleware closes over the stubbed module.
const { enforceDistrictScope } = await import("../src/middlewares/auth");

/** Build a fake express Request just for the middleware. */
function fakeReq(opts: {
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  clerkPublicMeta?: { districtId?: number; role?: string };
}): Request {
  _clerkPublicMeta = opts.clerkPublicMeta ?? {};
  const req: any = {
    query: { ...(opts.query ?? {}) },
    headers: { ...(opts.headers ?? {}) },
  };
  return req as Request;
}

beforeEach(() => { _clerkPublicMeta = {}; });

function runMiddleware(req: Request): { calledNext: boolean } {
  let calledNext = false;
  const res = {} as Response;
  const next: NextFunction = () => { calledNext = true; };
  enforceDistrictScope(req, res, next);
  return { calledNext };
}

describe("enforceDistrictScope: tenant-scope clamp runs in every environment", () => {
  it("Clerk session with districtId: overwrites tampered ?districtId and strips ?schoolId", () => {
    const req = fakeReq({
      query: { districtId: "999", schoolId: "888", search: "alice" },
      clerkPublicMeta: { districtId: 42, role: "admin" },
    });

    const { calledNext } = runMiddleware(req);

    expect(calledNext).toBe(true);
    expect(req.query.districtId).toBe("42");
    // schoolId must not survive — neither as its original value nor as a string.
    expect(req.query.schoolId).toBeUndefined();
    // Unrelated query params must pass through untouched.
    expect(req.query.search).toBe("alice");
  });

  it("NODE_ENV=test with x-test-district-id header: clamp behaves identically (no Clerk session needed)", () => {
    // The vitest runner sets NODE_ENV=test, so the test-bypass branch is live.
    expect(process.env.NODE_ENV).toBe("test");

    const req = fakeReq({
      query: { districtId: "999", schoolId: "888" },
      headers: { "x-test-district-id": "7" },
    });

    runMiddleware(req);

    expect(req.query.districtId).toBe("7");
    expect(req.query.schoolId).toBeUndefined();
  });

  it("unscoped caller (no Clerk districtId, no test header): pass-through — no mutation", () => {
    const req = fakeReq({
      query: { districtId: "999", schoolId: "888" },
      // No clerkPublicMeta, no x-test-district-id.
    });

    runMiddleware(req);

    // Middleware must NOT silently honor a tampered districtId on behalf of
    // an unscoped session. It also must NOT strip schoolId — the request
    // continues unchanged so downstream requireDistrictScope can reject it.
    expect(req.query.districtId).toBe("999");
    expect(req.query.schoolId).toBe("888");
  });

  it("Clerk session present but districtId missing: pass-through (platform-admin shape)", () => {
    const req = fakeReq({
      query: { districtId: "999", schoolId: "888" },
      clerkPublicMeta: { role: "admin" }, // no districtId
    });

    runMiddleware(req);

    // Platform-admin / partially-provisioned admin: middleware does not
    // synthesize a clamp out of thin air.
    expect(req.query.districtId).toBe("999");
    expect(req.query.schoolId).toBe("888");
  });

  it("clamp is unconditional with respect to NODE_ENV (regression guard for the prod-only gate)", () => {
    // Pre-3A-2 bug: middleware early-returned when NODE_ENV !== "production",
    // turning the global tenant-scope defense into a no-op in dev/staging/
    // preview/pilot environments. We're in NODE_ENV=test right now and the
    // first test in this file already proved the clamp ran. This case pins
    // the same behavior with the explicit env assertion so any future
    // re-introduction of the env gate trips this test.
    expect(process.env.NODE_ENV).toBe("test");
    const req = fakeReq({
      query: { districtId: "1" },
      clerkPublicMeta: { districtId: 99 },
    });
    runMiddleware(req);
    expect(req.query.districtId).toBe("99");
  });
});
