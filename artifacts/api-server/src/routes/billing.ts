// tenant-scope: district-join
// Billing routes use resolveDistrictIdForCaller() to derive the caller's district
// from their Clerk session + staff FK link. getEnforcedDistrictId() is not used
// because billing applies to the caller's own subscription, not an arbitrary
// district param. Platform-admin-only admin routes in this file use
// requirePlatformAdmin in addition to the district-scoped routes.
import { Router, type Request, type Response } from "express";
import { db, districtSubscriptionsTable, districtsTable, staffTable, subscriptionPlansTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireMinRole, requirePlatformAdmin } from "../middlewares/auth";
import { resolveDistrictIdForCaller } from "../lib/resolveDistrictForCaller";
import { getUncachableStripeClient, getStripePublishableKey } from "../lib/stripeClient";

const router = Router();
const adminOnly = requireMinRole("admin");

// Billing routes always operate on the caller's own district. We previously
// fell back to "the only district in the table" when neither Clerk metadata
// nor a staff link gave us a districtId — that meant an admin user from an
// unlinked account could read or change another tenant's subscription. The
// shared resolver no longer falls back; routes return 403 when scope is
// missing rather than guessing.
async function resolveCallerDistrictId(req: Request): Promise<number | null> {
  return resolveDistrictIdForCaller(req);
}

async function countDistrictStaff(districtId: number): Promise<number> {
  const result = await db.execute(
    sql`SELECT COUNT(*)::int AS cnt FROM staff WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${districtId})`
  );
  const rows = result.rows;
  if (!rows || rows.length === 0) return 0;
  const row = rows[0] as Record<string, unknown>;
  return Number(row.cnt ?? 0);
}

async function getOrCreateSubscription(districtId: number) {
  const [existing] = await db
    .select()
    .from(districtSubscriptionsTable)
    .where(eq(districtSubscriptionsTable.districtId, districtId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(districtSubscriptionsTable)
    .values({ districtId, planTier: "trial", seatLimit: 10, billingCycle: "monthly", status: "trialing" })
    .returning();
  return created;
}

router.get("/billing/subscription", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = await resolveCallerDistrictId(req);
    if (!districtId) { res.status(403).json({ error: "Unable to determine district" }); return; }

    const subscription = await getOrCreateSubscription(districtId);

    const [district] = await db.select({ name: districtsTable.name }).from(districtsTable).where(eq(districtsTable.id, districtId)).limit(1);

    const seatsUsed = await countDistrictStaff(districtId);

    let stripeSubscription: Record<string, unknown> | null = null;
    if (subscription.stripeSubscriptionId) {
      try {
        const result = await db.execute(
          sql`SELECT * FROM stripe.subscriptions WHERE id = ${subscription.stripeSubscriptionId} LIMIT 1`
        );
        stripeSubscription = (result.rows[0] as Record<string, unknown>) || null;
      } catch {
        // stripe schema may not exist yet
      }
    }

    res.json({
      subscription: {
        ...subscription,
        districtName: district?.name,
        seatsUsed,
        stripeDetails: stripeSubscription,
      },
    });
  } catch (err) {
    console.error("Error fetching subscription:", err);
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

router.get("/billing/status", async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = await resolveCallerDistrictId(req);
    if (!districtId) {
      res.json({ active: false, status: "unresolvable", mode: "unconfigured", requiresAttention: true });
      return;
    }

    // Demo and pilot districts are first-class non-paying tracks. They're always
    // "active" for gating purposes and never trigger paywall UI.
    const [district] = await db
      .select({ isDemo: districtsTable.isDemo, isPilot: districtsTable.isPilot })
      .from(districtsTable)
      .where(eq(districtsTable.id, districtId))
      .limit(1);
    if (district?.isDemo) {
      res.json({ active: true, status: "demo", mode: "demo", currentPeriodEnd: null, requiresAttention: false });
      return;
    }
    if (district?.isPilot) {
      res.json({ active: true, status: "pilot", mode: "pilot", currentPeriodEnd: null, requiresAttention: false });
      return;
    }

    const [sub] = await db
      .select({
        status: districtSubscriptionsTable.status,
        currentPeriodEnd: districtSubscriptionsTable.currentPeriodEnd,
        trialEndsAt: districtSubscriptionsTable.trialEndsAt,
        gracePeriodEndsAt: districtSubscriptionsTable.gracePeriodEndsAt,
        lastPaymentFailureAt: districtSubscriptionsTable.lastPaymentFailureAt,
        lastPaymentFailureReason: districtSubscriptionsTable.lastPaymentFailureReason,
        paymentFailureCount: districtSubscriptionsTable.paymentFailureCount,
        lastSuccessfulPaymentAt: districtSubscriptionsTable.lastSuccessfulPaymentAt,
      })
      .from(districtSubscriptionsTable)
      .where(eq(districtSubscriptionsTable.districtId, districtId))
      .limit(1);

    if (!sub) {
      res.json({ active: false, status: "no_subscription", mode: "unconfigured", requiresAttention: true });
      return;
    }

    const now = Date.now();
    const activeStatuses = ["active", "trialing"];
    const inGrace = sub.status === "past_due"
      && sub.gracePeriodEndsAt
      && new Date(sub.gracePeriodEndsAt).getTime() > now;
    const isActive = activeStatuses.includes(sub.status) || Boolean(inGrace);

    // Trial-ending soon: surface a soft warning even when fully active so the
    // banner can warn the admin BEFORE the first charge runs.
    const trialEndingSoon =
      sub.status === "trialing"
      && sub.trialEndsAt
      && new Date(sub.trialEndsAt).getTime() - now < 3 * 24 * 60 * 60 * 1000;

    res.json({
      active: isActive,
      status: sub.status,
      mode: sub.status === "trialing" ? "trial" : (isActive ? "paid" : "unpaid"),
      currentPeriodEnd: sub.currentPeriodEnd,
      trialEndsAt: sub.trialEndsAt,
      gracePeriodEndsAt: sub.gracePeriodEndsAt,
      inGracePeriod: Boolean(inGrace),
      trialEndingSoon: Boolean(trialEndingSoon),
      lastPaymentFailureAt: sub.lastPaymentFailureAt,
      lastPaymentFailureReason: sub.lastPaymentFailureReason,
      paymentFailureCount: sub.paymentFailureCount,
      lastSuccessfulPaymentAt: sub.lastSuccessfulPaymentAt,
      // requiresAttention surfaces ANY actionable state — not just hard
      // blocks. Trial ending soon and grace period both deserve banner UI.
      requiresAttention: !isActive || Boolean(inGrace) || Boolean(trialEndingSoon),
    });
  } catch (err) {
    console.error("Error checking billing status:", err);
    res.json({ active: false, status: "error", mode: "error", requiresAttention: true });
  }
});

router.post("/billing/checkout", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = await resolveCallerDistrictId(req);
    if (!districtId) { res.status(403).json({ error: "Unable to determine district" }); return; }

    const { priceId } = req.body as { priceId?: string };
    if (!priceId) { res.status(400).json({ error: "priceId is required" }); return; }

    const [validPlan] = await db
      .select({ id: subscriptionPlansTable.id })
      .from(subscriptionPlansTable)
      .where(
        sql`(${subscriptionPlansTable.monthlyPriceId} = ${priceId} OR ${subscriptionPlansTable.yearlyPriceId} = ${priceId}) AND ${subscriptionPlansTable.isActive} = true`
      )
      .limit(1);
    if (!validPlan) {
      res.status(400).json({ error: "Invalid or inactive price ID" });
      return;
    }

    const subscription = await getOrCreateSubscription(districtId);
    const stripe = await getUncachableStripeClient();

    let customerId = subscription.stripeCustomerId;
    if (!customerId) {
      const [district] = await db.select({ name: districtsTable.name }).from(districtsTable).where(eq(districtsTable.id, districtId)).limit(1);
      const customer = await stripe.customers.create({
        name: district?.name || `District ${districtId}`,
        metadata: { districtId: String(districtId) },
      });
      customerId = customer.id;
      await db
        .update(districtSubscriptionsTable)
        .set({ stripeCustomerId: customerId })
        .where(eq(districtSubscriptionsTable.id, subscription.id));
    }

    const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    // Self-serve checkout always grants a 14-day free trial. The trial runs in
    // Stripe (status=trialing) and is mirrored into district_subscriptions by the
    // webhook, where deriveDistrictMode → "trial". The customer's card is collected
    // up-front but no charge occurs until the trial ends.
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${baseUrl}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/billing?canceled=true`,
      subscription_data: {
        trial_period_days: 14,
        metadata: { districtId: String(districtId) },
      },
      metadata: { districtId: String(districtId) },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Error creating checkout session:", err);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.post("/billing/portal", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = await resolveCallerDistrictId(req);
    if (!districtId) { res.status(403).json({ error: "Unable to determine district" }); return; }

    const subscription = await getOrCreateSubscription(districtId);
    if (!subscription.stripeCustomerId) {
      res.status(400).json({ error: "No billing account found. Please subscribe to a plan first." });
      return;
    }

    const stripe = await getUncachableStripeClient();
    const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${baseUrl}/billing`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Error creating portal session:", err);
    res.status(500).json({ error: "Failed to create billing portal session" });
  }
});

router.get("/billing/plans", async (_req: Request, res: Response): Promise<void> => {
  try {
    const plans = await db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.isActive, true))
      .orderBy(subscriptionPlansTable.sortOrder);

    const formatted = plans.map((plan) => ({
      id: plan.stripeProductId ?? `plan_${plan.id}`,
      name: plan.name,
      description: plan.description,
      metadata: {
        tier: plan.tier,
        seatLimit: String(plan.seatLimit),
      },
      prices: [
        {
          id: plan.monthlyPriceId ?? "",
          unitAmount: plan.monthlyPriceCents,
          currency: "usd",
          recurring: { interval: "month", interval_count: 1 },
        },
        {
          id: plan.yearlyPriceId ?? "",
          unitAmount: plan.yearlyPriceCents,
          currency: "usd",
          recurring: { interval: "year", interval_count: 1 },
        },
      ].filter((p) => p.id),
    }));

    res.json({ plans: formatted });
  } catch (err) {
    console.error("Error fetching plans:", err);
    res.json({ plans: [] });
  }
});

router.get("/billing/publishable-key", async (_req: Request, res: Response): Promise<void> => {
  try {
    const key = await getStripePublishableKey();
    res.json({ publishableKey: key });
  } catch (err) {
    console.error("Error fetching publishable key:", err);
    res.status(500).json({ error: "Failed to fetch publishable key" });
  }
});

router.get("/billing/tenants", requirePlatformAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const tenants = await db
      .select({
        districtId: districtsTable.id,
        districtName: districtsTable.name,
        state: districtsTable.state,
        planTier: districtSubscriptionsTable.planTier,
        seatLimit: districtSubscriptionsTable.seatLimit,
        billingCycle: districtSubscriptionsTable.billingCycle,
        status: districtSubscriptionsTable.status,
        currentPeriodEnd: districtSubscriptionsTable.currentPeriodEnd,
        stripeCustomerId: districtSubscriptionsTable.stripeCustomerId,
        createdAt: districtSubscriptionsTable.createdAt,
      })
      .from(districtsTable)
      .leftJoin(districtSubscriptionsTable, eq(districtSubscriptionsTable.districtId, districtsTable.id))
      .orderBy(districtsTable.name);

    const tenantsWithSeats = await Promise.all(
      tenants.map(async (t) => {
        const seatsUsed = await countDistrictStaff(t.districtId);
        return { ...t, seatsUsed };
      })
    );

    res.json({ tenants: tenantsWithSeats });
  } catch (err) {
    console.error("Error fetching tenants:", err);
    res.status(500).json({ error: "Failed to fetch tenants" });
  }
});

router.post("/billing/sync-subscription", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = await resolveCallerDistrictId(req);
    if (!districtId) { res.status(403).json({ error: "Unable to determine district" }); return; }

    const [sub] = await db
      .select()
      .from(districtSubscriptionsTable)
      .where(eq(districtSubscriptionsTable.districtId, districtId))
      .limit(1);

    if (!sub) {
      res.status(400).json({ error: "No subscription record" });
      return;
    }

    const stripe = await getUncachableStripeClient();
    let stripeSubscriptionId = sub.stripeSubscriptionId;

    // If the subscription ID isn't yet projected onto our row (the most common
    // race: the user lands on /billing?success=true&session_id=... before the
    // Stripe webhook has fired), resolve it from either the checkout session
    // hint in the body or by listing the customer's subscriptions.
    if (!stripeSubscriptionId) {
      const sessionId = (req.body as { sessionId?: string } | undefined)?.sessionId;
      if (sessionId) {
        try {
          const session = await stripe.checkout.sessions.retrieve(sessionId);
          // Only trust the session if its customer matches the district's
          // customer on file. This prevents a caller from passing a
          // session_id that belongs to a different district to hijack its
          // subscription record.
          const sessionCustomer = typeof session.customer === "string" ? session.customer : session.customer?.id;
          if (sub.stripeCustomerId && sessionCustomer && sessionCustomer === sub.stripeCustomerId) {
            if (typeof session.subscription === "string") stripeSubscriptionId = session.subscription;
            else if (session.subscription && "id" in session.subscription) stripeSubscriptionId = session.subscription.id;
          } else {
            console.warn("sync-subscription: session customer does not match district customer; ignoring sessionId");
          }
        } catch (e) { console.warn("session lookup failed:", e); }
      }
      if (!stripeSubscriptionId && sub.stripeCustomerId) {
        const list = await stripe.subscriptions.list({ customer: sub.stripeCustomerId, limit: 1, status: "all" });
        stripeSubscriptionId = list.data[0]?.id ?? null;
      }
      if (!stripeSubscriptionId) {
        res.status(400).json({ error: "No Stripe subscription to sync" });
        return;
      }
      await db
        .update(districtSubscriptionsTable)
        .set({ stripeSubscriptionId })
        .where(eq(districtSubscriptionsTable.id, sub.id));
    }

    const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);

    const firstItem = stripeSub.items?.data?.[0];
    const priceId = firstItem?.price?.id;
    let planTier = sub.planTier;
    let seatLimit = sub.seatLimit;
    let billingCycle = sub.billingCycle;

    if (priceId) {
      try {
        const priceResult = await db.execute(
          sql`SELECT p.metadata FROM stripe.products p JOIN stripe.prices pr ON pr.product = p.id WHERE pr.id = ${priceId} LIMIT 1`
        );
        interface MetadataRow { metadata: Record<string, string> | string | null }
        const metaRow = priceResult.rows[0] as MetadataRow | undefined;
        if (metaRow?.metadata) {
          const parsed = typeof metaRow.metadata === 'string' ? JSON.parse(metaRow.metadata) as Record<string, string> : metaRow.metadata;
          if (parsed.tier) planTier = parsed.tier;
          if (parsed.seatLimit) seatLimit = Number(parsed.seatLimit);
        }
      } catch { /* ignore stripe schema query errors */ }

      const interval = firstItem?.price?.recurring?.interval;
      if (interval === "year") billingCycle = "yearly";
      else if (interval === "month") billingCycle = "monthly";
    }

    const currentPeriodEnd = stripeSub.current_period_end
      ? new Date(stripeSub.current_period_end * 1000)
      : null;

    await db
      .update(districtSubscriptionsTable)
      .set({
        status: stripeSub.status,
        currentPeriodEnd,
        cancelAtPeriodEnd: String(stripeSub.cancel_at_period_end ?? false),
        planTier,
        seatLimit,
        billingCycle,
        stripePriceId: priceId ?? null,
      })
      .where(eq(districtSubscriptionsTable.id, sub.id));

    // Mirror plan tier onto the district itself so feature-gating reflects the
    // active subscription immediately. This makes manual sync match the webhook.
    const VALID_TIERS = new Set(["essentials", "professional", "enterprise"]);
    if (stripeSub.status === "canceled") {
      await db.update(districtsTable).set({ tier: "essentials" }).where(eq(districtsTable.id, districtId));
    } else if (VALID_TIERS.has(planTier)) {
      await db
        .update(districtsTable)
        .set({ tier: planTier as "essentials" | "professional" | "enterprise" })
        .where(eq(districtsTable.id, districtId));
    }

    res.json({ synced: true });
  } catch (err) {
    console.error("Error syncing subscription:", err);
    res.status(500).json({ error: "Failed to sync subscription" });
  }
});

// One-click "upgrade now" from the in-app trial banner. Ends the Stripe trial
// immediately so the customer is billed today using the card they put on file
// at checkout. The webhook will then transition status from `trialing` to
// `active` (or `past_due` if the card fails), which the UI surfaces.
router.post("/billing/end-trial", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = await resolveCallerDistrictId(req);
    if (!districtId) { res.status(403).json({ error: "Unable to determine district" }); return; }

    const [sub] = await db
      .select()
      .from(districtSubscriptionsTable)
      .where(eq(districtSubscriptionsTable.districtId, districtId))
      .limit(1);

    if (!sub?.stripeSubscriptionId) {
      res.status(400).json({ error: "No active Stripe subscription found" });
      return;
    }
    if (sub.status !== "trialing") {
      res.status(400).json({ error: "Subscription is not in a trial" });
      return;
    }

    const stripe = await getUncachableStripeClient();
    const updated = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      trial_end: "now",
      proration_behavior: "none",
    });

    await db
      .update(districtSubscriptionsTable)
      .set({
        status: updated.status,
        currentPeriodEnd: updated.current_period_end ? new Date(updated.current_period_end * 1000) : null,
      })
      .where(eq(districtSubscriptionsTable.id, sub.id));

    res.json({ ok: true, status: updated.status });
  } catch (err) {
    console.error("Error ending trial:", err);
    res.status(500).json({ error: "Failed to end trial" });
  }
});

export default router;
