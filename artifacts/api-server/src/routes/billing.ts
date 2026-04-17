import { Router, type Request, type Response } from "express";
import { db, districtSubscriptionsTable, districtsTable, staffTable, subscriptionPlansTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireMinRole, requirePlatformAdmin } from "../middlewares/auth";
import { getPublicMeta } from "../lib/clerkClaims";
import { getUncachableStripeClient, getStripePublishableKey } from "../lib/stripeClient";

const router = Router();
const adminOnly = requireMinRole("admin");

async function resolveCallerDistrictId(req: Request): Promise<number | null> {
  const meta = getPublicMeta(req);

  if (meta.districtId) return meta.districtId;

  if (meta.staffId) {
    const [staff] = await db
      .select({ schoolId: staffTable.schoolId })
      .from(staffTable)
      .where(eq(staffTable.id, meta.staffId))
      .limit(1);
    if (staff?.schoolId) {
      const result = await db.execute(
        sql`SELECT district_id FROM schools WHERE id = ${staff.schoolId} LIMIT 1`
      );
      const rows = result.rows;
      if (rows && rows.length > 0) {
        const row = rows[0] as Record<string, unknown>;
        return Number(row.district_id);
      }
    }
  }

  const allDistricts = await db.select({ id: districtsTable.id }).from(districtsTable).limit(2);
  if (allDistricts.length === 1) return allDistricts[0].id;
  return null;
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
      .select({ status: districtSubscriptionsTable.status, currentPeriodEnd: districtSubscriptionsTable.currentPeriodEnd })
      .from(districtSubscriptionsTable)
      .where(eq(districtSubscriptionsTable.districtId, districtId))
      .limit(1);

    if (!sub) {
      res.json({ active: false, status: "no_subscription", mode: "unconfigured", requiresAttention: true });
      return;
    }

    const activeStatuses = ["active", "trialing"];
    const isActive = activeStatuses.includes(sub.status);

    res.json({
      active: isActive,
      status: sub.status,
      mode: sub.status === "trialing" ? "trial" : (isActive ? "paid" : "unpaid"),
      currentPeriodEnd: sub.currentPeriodEnd,
      requiresAttention: !isActive,
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
      success_url: `${baseUrl}/billing?success=true`,
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

    if (!sub?.stripeSubscriptionId) {
      res.status(400).json({ error: "No Stripe subscription to sync" });
      return;
    }

    const stripe = await getUncachableStripeClient();
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);

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

export default router;
