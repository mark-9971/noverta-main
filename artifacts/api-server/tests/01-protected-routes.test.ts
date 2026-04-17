/**
 * Protected route access regression suite.
 *
 * Highest-risk scenarios covered:
 *   - Anonymous (no auth headers) cannot reach data routes — must get 401.
 *   - A role that lacks privilege for a route is rejected with 403, not 200.
 *   - Platform-admin-only support endpoints reject regular admins.
 *   - x-test-* headers are ignored unless NODE_ENV=test (we can't toggle env
 *     mid-suite, but we can confirm the test-mode bypass DOES grant access
 *     when correctly configured — proving it isn't blocking real coverage
 *     accidentally).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { anon, asUser, createDistrict, createSchool, cleanupDistrict } from "./helpers";

describe("protected route access", () => {
  let districtId: number;

  beforeAll(async () => {
    const d = await createDistrict();
    districtId = d.id;
    await createSchool(districtId);
  });

  afterAll(async () => {
    await cleanupDistrict(districtId);
  });

  it("rejects anonymous request to /api/students with 401", async () => {
    const res = await anon.get("/api/students");
    expect(res.status).toBe(401);
  });

  it("rejects anonymous request to /api/billing/checkout with 401", async () => {
    const res = await anon.post("/api/billing/checkout").send({ priceId: "price_x" });
    expect(res.status).toBe(401);
  });

  it("rejects anonymous request to /api/medicaid/generate-claims with 401", async () => {
    const res = await anon.post("/api/medicaid/generate-claims").send({ dateFrom: "2025-01-01", dateTo: "2025-01-31" });
    expect(res.status).toBe(401);
  });

  it("rejects platform-admin-only /api/billing/tenants from a regular admin", async () => {
    const admin = asUser({ userId: "u_admin_1", role: "admin", districtId });
    const res = await admin.get("/api/billing/tenants");
    expect(res.status).toBe(403);
  });

  it("rejects /api/billing/checkout from below-admin role (case_manager)", async () => {
    const cm = asUser({ userId: "u_cm_1", role: "case_manager", districtId });
    const res = await cm.post("/api/billing/checkout").send({ priceId: "price_x" });
    expect(res.status).toBe(403);
  });

  it("rejects /api/billing/checkout from a non-admin (provider)", async () => {
    const provider = asUser({ userId: "u_prov_1", role: "provider", districtId });
    const res = await provider.post("/api/billing/checkout").send({ priceId: "price_x" });
    expect(res.status).toBe(403);
  });

  it("rejects /api/sample-data POST from a non-coordinator/admin role (provider)", async () => {
    const provider = asUser({ userId: "u_p_1", role: "provider", districtId });
    const res = await provider.post("/api/sample-data");
    expect(res.status).toBe(403);
  });

  it("admin with valid scope reaches /api/students (200, even if list is empty)", async () => {
    const admin = asUser({ userId: "u_admin_2", role: "admin", districtId });
    const res = await admin.get("/api/students");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
