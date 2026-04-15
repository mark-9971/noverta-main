import { Router, type Request, type Response } from "express";
import { db, districtSubscriptionsTable, districtsTable, staffTable } from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";
import { requireMinRole, type AuthedRequest } from "../middlewares/auth";
import { getPublicMeta } from "../lib/clerkClaims";
import { getUncachableStripeClient, getStripePublishableKey } from "../lib/stripeClient";

const router = Router();
const adminOnly = requireMinRole("coordinator");

async function resolveCallerDistrictId(req: Request): Promise<number | null> {
  const meta = getPublicMeta(req);
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
      if (result.rows.length > 0) return Number(result.rows[0].district_id);
    }
  }
  const allDistricts = await db.select({ id: districtsTable.id }).from(districtsTable).limit(2);
  if (allDistricts.length === 1) return allDistricts[0].id;
  return null;
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
    .values({ districtId, planTier: "trial", seatLimit: 10, status: "trialing" })
    .returning();
  return created;
}

router.get("/billing/subscription", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = await resolveCallerDistrictId(req);
    if (!districtId) { res.status(403).json({ error: "Unable to determine district" }); return; }

    const subscription = await getOrCreateSubscription(districtId);

    const [district] = await db.select({ name: districtsTable.name }).from(districtsTable).where(eq(districtsTable.id, districtId)).limit(1);

    const seatResult = await db
      .select({ count: count() })
      .from(staffTable)
      .where(eq(staffTable.schoolId, sql`(SELECT id FROM schools WHERE district_id = ${districtId} LIMIT 1)`));
    const seatsUsed = seatResult[0]?.count ?? 0;

    let stripeSubscription: any = null;
    if (subscription.stripeSubscriptionId) {
      try {
        const result = await db.execute(
          sql`SELECT * FROM stripe.subscriptions WHERE id = ${subscription.stripeSubscriptionId} LIMIT 1`
        );
        stripeSubscription = result.rows[0] || null;
      } catch {
        // stripe schema may not exist yet
      }
    }

    res.json({
      subscription: {
        ...subscription,
        districtName: district?.name,
        seatsUsed: Number(seatsUsed),
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
    if (!districtId) { res.json({ active: true }); return; }

    const [sub] = await db
      .select({ status: districtSubscriptionsTable.status, currentPeriodEnd: districtSubscriptionsTable.currentPeriodEnd })
      .from(districtSubscriptionsTable)
      .where(eq(districtSubscriptionsTable.districtId, districtId))
      .limit(1);

    if (!sub) { res.json({ active: true, status: "no_subscription" }); return; }

    const activeStatuses = ["active", "trialing"];
    const isActive = activeStatuses.includes(sub.status);
    const isPastDue = sub.status === "past_due";

    res.json({
      active: isActive || isPastDue,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd,
      requiresAttention: isPastDue || sub.status === "canceled" || sub.status === "unpaid",
    });
  } catch (err) {
    console.error("Error checking billing status:", err);
    res.json({ active: true });
  }
});

router.post("/billing/checkout", adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = await resolveCallerDistrictId(req);
    if (!districtId) { res.status(403).json({ error: "Unable to determine district" }); return; }

    const { priceId } = req.body;
    if (!priceId) { res.status(400).json({ error: "priceId is required" }); return; }

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
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${baseUrl}/billing?success=true`,
      cancel_url: `${baseUrl}/billing?canceled=true`,
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
    const result = await db.execute(sql`
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.description as product_description,
        p.metadata as product_metadata,
        pr.id as price_id,
        pr.unit_amount,
        pr.currency,
        pr.recurring
      FROM stripe.products p
      JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = true
      ORDER BY pr.unit_amount ASC
    `);

    const productsMap = new Map<string, any>();
    for (const row of result.rows as any[]) {
      if (!productsMap.has(row.product_id)) {
        productsMap.set(row.product_id, {
          id: row.product_id,
          name: row.product_name,
          description: row.product_description,
          metadata: row.product_metadata,
          prices: [],
        });
      }
      productsMap.get(row.product_id).prices.push({
        id: row.price_id,
        unitAmount: row.unit_amount,
        currency: row.currency,
        recurring: row.recurring,
      });
    }

    res.json({ plans: Array.from(productsMap.values()) });
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

router.get("/billing/tenants", requireMinRole("admin"), async (req: Request, res: Response): Promise<void> => {
  try {
    const tenants = await db
      .select({
        districtId: districtsTable.id,
        districtName: districtsTable.name,
        state: districtsTable.state,
        planTier: districtSubscriptionsTable.planTier,
        seatLimit: districtSubscriptionsTable.seatLimit,
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
        const seatResult = await db.execute(
          sql`SELECT COUNT(*) as cnt FROM staff WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${t.districtId})`
        );
        return {
          ...t,
          seatsUsed: Number((seatResult.rows[0] as any)?.cnt ?? 0),
        };
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

    const priceId = (stripeSub as any).items?.data?.[0]?.price?.id;
    let planTier = sub.planTier;
    let seatLimit = sub.seatLimit;

    if (priceId) {
      try {
        const priceResult = await db.execute(
          sql`SELECT p.metadata FROM stripe.products p JOIN stripe.prices pr ON pr.product = p.id WHERE pr.id = ${priceId} LIMIT 1`
        );
        const metadata = (priceResult.rows[0] as any)?.metadata;
        if (metadata) {
          const parsed = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
          if (parsed.tier) planTier = parsed.tier;
          if (parsed.seatLimit) seatLimit = Number(parsed.seatLimit);
        }
      } catch { /* ignore stripe schema query errors */ }
    }

    await db
      .update(districtSubscriptionsTable)
      .set({
        status: stripeSub.status,
        currentPeriodEnd: new Date((stripeSub as any).current_period_end * 1000),
        cancelAtPeriodEnd: String((stripeSub as any).cancel_at_period_end),
        planTier,
        seatLimit,
      })
      .where(eq(districtSubscriptionsTable.id, sub.id));

    res.json({ synced: true });
  } catch (err) {
    console.error("Error syncing subscription:", err);
    res.status(500).json({ error: "Failed to sync subscription" });
  }
});

export default router;
