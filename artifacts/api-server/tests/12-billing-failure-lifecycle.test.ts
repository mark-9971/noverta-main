/**
 * Billing failure-state lifecycle.
 *
 * These tests verify the webhook handlers and the subscription gate's
 * response to Stripe failure events end-to-end against the real DB. We
 * invoke the dispatcher entry points directly (not through the signed
 * webhook endpoint) because Stripe signature mocking is brittle and the
 * dispatch logic is what we actually care about here.
 *
 * Coverage:
 *   1. invoice.payment_failed sets gracePeriodEndsAt + counter, leaves first
 *      streak anchored.
 *   2. invoice.payment_failed twice in a streak does NOT extend the grace
 *      window (anchor stays on the first failure).
 *   3. invoice.payment_succeeded clears all failure fields.
 *   4. customer.subscription.trial_will_end records trialEndsAt.
 *   5. customer.deleted marks the subscription canceled and downgrades the
 *      district tier.
 *   6. subscriptionGate allows past_due during the grace window.
 *   7. subscriptionGate blocks past_due AFTER the grace window.
 *   8. subscriptionGate hard-blocks incomplete_expired regardless of timing.
 *   9. /billing/status surfaces gracePeriodEndsAt + inGracePeriod + failure
 *      reason so the UI can render the right message.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db, districtSubscriptionsTable, districtsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  asUser,
  createDistrict,
  createSchool,
  cleanupDistrict,
} from "./helpers";
import {
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded,
  handleTrialWillEnd,
  handleCustomerDeleted,
} from "../src/lib/webhookHandlers";

interface StripeEventLite {
  type: string;
  data: { object: Record<string, unknown> };
}

function invoiceFailedEvent(customerId: string, reason = "Your card was declined."): StripeEventLite {
  return {
    type: "invoice.payment_failed",
    data: {
      object: {
        id: `in_${Date.now()}`,
        customer: customerId,
        attempt_count: 1,
        last_finalization_error: { message: reason, code: "card_declined" },
      },
    },
  };
}

function invoiceSucceededEvent(customerId: string): StripeEventLite {
  return {
    type: "invoice.payment_succeeded",
    data: { object: { id: `in_${Date.now()}`, customer: customerId } },
  };
}

function trialWillEndEvent(customerId: string, trialEndUnix: number): StripeEventLite {
  return {
    type: "customer.subscription.trial_will_end",
    data: {
      object: {
        id: `sub_${Date.now()}`,
        status: "trialing",
        customer: customerId,
        trial_end: trialEndUnix,
      },
    },
  };
}

function customerDeletedEvent(customerId: string): StripeEventLite {
  return {
    type: "customer.deleted",
    data: { object: { id: customerId } },
  };
}

async function setSubscription(
  districtId: number,
  fields: Partial<typeof districtSubscriptionsTable.$inferInsert>,
) {
  // Upsert the subscription row by district. Tests share the same district
  // across multiple it() blocks via beforeAll, so we update if it exists.
  const [existing] = await db
    .select()
    .from(districtSubscriptionsTable)
    .where(eq(districtSubscriptionsTable.districtId, districtId))
    .limit(1);
  if (existing) {
    await db
      .update(districtSubscriptionsTable)
      .set(fields)
      .where(eq(districtSubscriptionsTable.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(districtSubscriptionsTable)
    .values({
      districtId,
      planTier: "essentials",
      seatLimit: 10,
      billingCycle: "monthly",
      status: "active",
      ...fields,
    })
    .returning();
  return created.id;
}

async function readSubscription(districtId: number) {
  const [row] = await db
    .select()
    .from(districtSubscriptionsTable)
    .where(eq(districtSubscriptionsTable.districtId, districtId))
    .limit(1);
  return row;
}

describe("billing failure-state lifecycle", () => {
  let districtId: number;
  const customerId = `cus_test_${Date.now()}`;

  beforeAll(async () => {
    const d = await createDistrict();
    districtId = d.id;
    await createSchool(districtId);
    await setSubscription(districtId, {
      stripeCustomerId: customerId,
      stripeSubscriptionId: `sub_test_${Date.now()}`,
      status: "active",
      paymentFailureCount: 0,
    });
  });

  afterAll(async () => {
    await cleanupDistrict(districtId);
  });

  it("invoice.payment_failed sets grace window + counter on first failure", async () => {
    await setSubscription(districtId, {
      status: "past_due",
      paymentFailureCount: 0,
      gracePeriodEndsAt: null,
      lastPaymentFailureAt: null,
      lastPaymentFailureReason: null,
    });

    await handleInvoicePaymentFailed(invoiceFailedEvent(customerId, "Card declined."));

    const row = await readSubscription(districtId);
    expect(row.paymentFailureCount).toBe(1);
    expect(row.lastPaymentFailureReason).toBe("Card declined.");
    expect(row.lastPaymentFailureAt).not.toBeNull();
    expect(row.gracePeriodEndsAt).not.toBeNull();
    // Grace window should be ~7 days out (allow a small drift for test time).
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const ms = new Date(row.gracePeriodEndsAt!).getTime() - Date.now();
    expect(ms).toBeGreaterThan(sevenDaysMs - 60_000);
    expect(ms).toBeLessThan(sevenDaysMs + 60_000);
  });

  it("invoice.payment_failed second time in a streak does NOT extend the grace window", async () => {
    const before = await readSubscription(districtId);
    const anchor = before.gracePeriodEndsAt;
    expect(anchor).not.toBeNull();

    await new Promise((r) => setTimeout(r, 10)); // ensure different `now`
    await handleInvoicePaymentFailed(invoiceFailedEvent(customerId, "Insufficient funds."));

    const after = await readSubscription(districtId);
    expect(after.paymentFailureCount).toBe(2);
    // The anchor must not move on subsequent failures.
    expect(new Date(after.gracePeriodEndsAt!).getTime()).toBe(new Date(anchor!).getTime());
    expect(after.lastPaymentFailureReason).toBe("Insufficient funds.");
  });

  it("invoice.payment_succeeded clears all failure fields", async () => {
    await handleInvoicePaymentSucceeded(invoiceSucceededEvent(customerId));

    const row = await readSubscription(districtId);
    expect(row.paymentFailureCount).toBe(0);
    expect(row.gracePeriodEndsAt).toBeNull();
    expect(row.lastPaymentFailureAt).toBeNull();
    expect(row.lastPaymentFailureReason).toBeNull();
    expect(row.lastSuccessfulPaymentAt).not.toBeNull();
  });

  it("customer.subscription.trial_will_end records trialEndsAt", async () => {
    const trialEndUnix = Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60;
    await handleTrialWillEnd(trialWillEndEvent(customerId, trialEndUnix));

    const row = await readSubscription(districtId);
    expect(row.trialEndsAt).not.toBeNull();
    expect(Math.abs(new Date(row.trialEndsAt!).getTime() / 1000 - trialEndUnix)).toBeLessThan(2);
  });

  it("customer.deleted marks subscription canceled and downgrades district to essentials", async () => {
    await db
      .update(districtsTable)
      .set({ tier: "professional" })
      .where(eq(districtsTable.id, districtId));

    await handleCustomerDeleted(customerDeletedEvent(customerId));

    const row = await readSubscription(districtId);
    expect(row.status).toBe("canceled");
    const [district] = await db
      .select({ tier: districtsTable.tier })
      .from(districtsTable)
      .where(eq(districtsTable.id, districtId))
      .limit(1);
    expect(district.tier).toBe("essentials");
  });
});

/**
 * Direct unit tests of the gate middleware. We exercise the production code
 * path by temporarily switching NODE_ENV per call, then call the middleware
 * function directly with a mock req/res. This avoids the supertest+auth
 * coupling (the auth middleware's x-test-* header bypass is itself gated on
 * NODE_ENV==="test", so a global flip would break auth before the gate ever
 * runs).
 */
import { requireActiveSubscription } from "../src/middlewares/subscriptionGate";
import type { Request, Response, NextFunction } from "express";

interface GateResult {
  nextCalled: boolean;
  status?: number;
  body?: Record<string, unknown>;
}

async function runGate(districtId: number): Promise<GateResult> {
  const result: GateResult = { nextCalled: false };
  // The gate uses getAuth(req) from @clerk/express which reads req.auth.
  // We satisfy it with a shaped object; resolveDistrictIdForCaller falls
  // through to looking at the auth claims, but it also accepts a forced
  // district id via the same x-test header path used elsewhere in the
  // suite — we set it on the mock request so the resolver returns our id.
  const req = {
    path: "/students",
    // Clerk v2's getAuth(req) calls req.auth() — it's a function, not a property.
    // We embed the districtId in publicMetadata so the resolver returns it via
    // the normal `clerk_meta` branch (independent of NODE_ENV bypasses).
    // Clerk v2's getAuth() filters the auth object by tokenType — without
    // `tokenType: "session_token"` it returns a signed-out object regardless
    // of userId, which silently makes the gate fall through via the
    // `!auth.userId` early next().
    auth: () => ({
      tokenType: "session_token",
      userId: "u_gate_test",
      sessionClaims: { publicMetadata: { districtId, role: "admin" } },
    }),
    headers: {
      "x-test-user-id": "u_gate_test",
      "x-test-role": "admin",
      "x-test-district-id": String(districtId),
    },
    get(name: string) {
      return (this.headers as Record<string, string>)[name.toLowerCase()];
    },
  } as unknown as Request;
  const res = {
    status(code: number) {
      result.status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      result.body = body;
      return this;
    },
  } as unknown as Response;
  const next: NextFunction = () => {
    result.nextCalled = true;
  };

  // The gate short-circuits when NODE_ENV !== "production" (a dev/test
  // bypass). vi.stubEnv flips it just for this call so we exercise the
  // production code path; vi.unstubAllEnvs restores the original value.
  vi.stubEnv("NODE_ENV", "production");
  try {
    requireActiveSubscription(req, res, next);
    // The gate is async (DB lookups for district + subscription). Wait for
    // the promise chain to settle before reading the result.
    await new Promise((r) => setTimeout(r, 200));
  } finally {
    vi.unstubAllEnvs();
  }
  return result;
}

describe("subscriptionGate grace-period & incomplete handling", () => {
  const ownedDistricts: number[] = [];

  afterAll(async () => {
    for (const id of ownedDistricts) await cleanupDistrict(id);
  });

  async function makeDistrictWith(fields: Partial<typeof districtSubscriptionsTable.$inferInsert>) {
    const d = await createDistrict();
    await createSchool(d.id);
    await setSubscription(d.id, {
      stripeCustomerId: `cus_${d.id}_${Date.now()}`,
      planTier: "essentials",
      seatLimit: 10,
      billingCycle: "monthly",
      ...fields,
    });
    ownedDistricts.push(d.id);
    return d.id;
  }

  it("allows past_due during the grace window", async () => {
    const dId = await makeDistrictWith({
      status: "past_due",
      gracePeriodEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const r = await runGate(dId);
    expect(r.nextCalled).toBe(true);
    expect(r.status).toBeUndefined();
  });

  it("blocks past_due AFTER the grace window expires", async () => {
    const dId = await makeDistrictWith({
      status: "past_due",
      gracePeriodEndsAt: new Date(Date.now() - 60_000),
    });
    const r = await runGate(dId);
    expect(r.nextCalled).toBe(false);
    expect(r.status).toBe(403);
    expect(r.body?.code).toBe("SUBSCRIPTION_PAST_DUE");
  });

  it("hard-blocks incomplete_expired regardless of timing", async () => {
    const dId = await makeDistrictWith({ status: "incomplete_expired" });
    const r = await runGate(dId);
    expect(r.nextCalled).toBe(false);
    expect(r.status).toBe(403);
    expect(r.body?.code).toBe("SUBSCRIPTION_INACTIVE");
    expect(String(r.body?.message)).toMatch(/never activated|initial charge/i);
  });

  it("blocks past_due with no grace timestamp at all (defensive)", async () => {
    const dId = await makeDistrictWith({
      status: "past_due",
      gracePeriodEndsAt: null,
    });
    const r = await runGate(dId);
    expect(r.nextCalled).toBe(false);
    expect(r.status).toBe(403);
    expect(r.body?.code).toBe("SUBSCRIPTION_PAST_DUE");
  });

  it("invoice.payment_failed transitions status → past_due directly", async () => {
    // The gate primarily authorizes on `status`. The handler must drive that
    // transition itself rather than relying on a follow-up
    // customer.subscription.updated arriving in time.
    const dId = await makeDistrictWith({
      status: "active",
      stripeCustomerId: `cus_status_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      paymentFailureCount: 0,
    });
    const sub = await readSubscription(dId);
    await handleInvoicePaymentFailed(invoiceFailedEvent(sub.stripeCustomerId!));
    const after = await readSubscription(dId);
    expect(after.status).toBe("past_due");
    expect(after.gracePeriodEndsAt).not.toBeNull();
  });

  it("invoice.payment_succeeded transitions status → active and clears failure fields", async () => {
    const dId = await makeDistrictWith({
      status: "past_due",
      stripeCustomerId: `cus_status_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      gracePeriodEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      paymentFailureCount: 2,
      lastPaymentFailureAt: new Date(),
      lastPaymentFailureReason: "Card declined.",
    });
    const sub = await readSubscription(dId);
    await handleInvoicePaymentSucceeded(invoiceSucceededEvent(sub.stripeCustomerId!));
    const after = await readSubscription(dId);
    expect(after.status).toBe("active");
    expect(after.gracePeriodEndsAt).toBeNull();
    expect(after.paymentFailureCount).toBe(0);
    expect(after.lastPaymentFailureReason).toBeNull();
  });

  it("sticky terminal status: payment_succeeded does NOT silently re-activate a canceled subscription", async () => {
    // A late `invoice.payment_succeeded` arriving after cancellation must
    // not silently restore access — that would let a canceled customer keep
    // using the platform until a human noticed.
    const dId = await makeDistrictWith({
      status: "canceled",
      stripeCustomerId: `cus_sticky_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    });
    const sub = await readSubscription(dId);
    await handleInvoicePaymentSucceeded(invoiceSucceededEvent(sub.stripeCustomerId!));
    const after = await readSubscription(dId);
    expect(after.status).toBe("canceled");
  });

  it("/billing/status surfaces grace info while past_due (HTTP, gate-exempt)", async () => {
    // /billing/status is in EXEMPT_PATHS so we can hit it via supertest
    // under NODE_ENV=test without tripping the gate. This still exercises
    // the response shape that the SubscriptionBanner relies on.
    const dId = await makeDistrictWith({
      status: "past_due",
      gracePeriodEndsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      lastPaymentFailureReason: "Your card was declined.",
      paymentFailureCount: 1,
    });
    const admin = asUser({ userId: "u_admin", role: "admin", districtId: dId });
    const res = await admin.get("/api/billing/status");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("past_due");
    expect(res.body.inGracePeriod).toBe(true);
    expect(res.body.lastPaymentFailureReason).toBe("Your card was declined.");
    expect(res.body.paymentFailureCount).toBe(1);
    expect(res.body.requiresAttention).toBe(true);
  });
});
