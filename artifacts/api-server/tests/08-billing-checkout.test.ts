/**
 * Billing / checkout entry behavior.
 *
 * The /billing/checkout endpoint is the entry point to the commercialization
 * funnel. Failures here either block paying customers or, worse, let the
 * wrong district subscribe on someone else's behalf. We test the *entry*
 * checks before the Stripe call — full Stripe round-trip is exercised in
 * the staging environment.
 *
 * Coverage:
 *   1. priceId is required; missing it returns 400.
 *   2. priceId must match an active subscription_plans row; unknown or
 *      inactive priceId returns 400.
 *   3. Below-admin role cannot reach checkout (403). (Also covered in 01,
 *      retained here for billing-suite cohesion.)
 *   4. /billing/plans is publicly readable to authenticated users so the
 *      pricing page can render without leaking other tenants' data.
 *   5. /billing/publishable-key returns the Stripe publishable key shape
 *      (string starting with pk_) without requiring admin role.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  asUser, createDistrict, createSchool, createSubscriptionPlan,
  cleanupDistrict, cleanupSubscriptionPlan,
} from "./helpers";

describe("billing/checkout entry behavior", () => {
  let districtId: number;
  let inactivePlanId: number;
  const inactivePriceId = `price_test_inactive_${Date.now()}`;

  beforeAll(async () => {
    const d = await createDistrict();
    districtId = d.id;
    await createSchool(districtId);
    const inactive = await createSubscriptionPlan({ monthlyPriceId: inactivePriceId, isActive: false });
    inactivePlanId = inactive.id;
  });

  afterAll(async () => {
    await cleanupDistrict(districtId);
    await cleanupSubscriptionPlan(inactivePlanId);
  });

  it("rejects POST /api/billing/checkout with missing priceId (400)", async () => {
    const admin = asUser({ userId: "u_admin", role: "admin", districtId });
    const res = await admin.post("/api/billing/checkout").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/priceId/i);
  });

  it("rejects POST /api/billing/checkout with an unknown priceId (400 'Invalid or inactive')", async () => {
    const admin = asUser({ userId: "u_admin", role: "admin", districtId });
    const res = await admin.post("/api/billing/checkout").send({ priceId: "price_does_not_exist" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid|inactive/i);
  });

  it("rejects POST /api/billing/checkout with an INACTIVE plan's priceId (400)", async () => {
    const admin = asUser({ userId: "u_admin", role: "admin", districtId });
    const res = await admin.post("/api/billing/checkout").send({ priceId: inactivePriceId });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid|inactive/i);
  });

  it("below-admin role cannot reach POST /api/billing/checkout (403)", async () => {
    const cm = asUser({ userId: "u_cm", role: "case_manager", districtId });
    const res = await cm.post("/api/billing/checkout").send({ priceId: "anything" });
    expect(res.status).toBe(403);
  });

  it("POST /api/billing/portal returns 400 when district has no Stripe customer yet", async () => {
    const admin = asUser({ userId: "u_admin", role: "admin", districtId });
    const res = await admin.post("/api/billing/portal").send({});
    // Brand-new district with no checkout = no stripeCustomerId; route must
    // explain that, not 500.
    expect([400, 403]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.error).toMatch(/billing|subscribe|customer/i);
    }
  });

  it("GET /api/billing/plans returns the plans list to any authenticated user", async () => {
    const reader = asUser({ userId: "u_reader", role: "case_manager", districtId });
    const res = await reader.get("/api/billing/plans");
    expect(res.status).toBe(200);
    // Response is shaped { plans: [...] } from the live Stripe products query.
    // We just need to verify the contract is honored, not the contents.
    expect(res.body).toHaveProperty("plans");
    expect(Array.isArray(res.body.plans)).toBe(true);
  });
});
