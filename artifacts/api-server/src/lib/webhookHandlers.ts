import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { db, districtSubscriptionsTable, subscriptionPlansTable } from '@workspace/db';
import { eq, sql } from 'drizzle-orm';

interface StripeEvent {
  type: string;
  data: {
    object: {
      id: string;
      status: string;
      customer: string;
      current_period_end?: number;
      cancel_at_period_end?: boolean;
      items?: {
        data: Array<{
          price?: {
            id: string;
            recurring?: { interval: string };
          };
        }>;
      };
      metadata?: Record<string, string>;
    };
  };
}

const SUBSCRIPTION_EVENTS = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
];

async function projectSubscriptionToTenant(event: StripeEvent): Promise<void> {
  const sub = event.data.object;
  const customerId = typeof sub.customer === 'string' ? sub.customer : '';
  if (!customerId) return;

  const [existing] = await db
    .select()
    .from(districtSubscriptionsTable)
    .where(eq(districtSubscriptionsTable.stripeCustomerId, customerId))
    .limit(1);

  if (!existing) {
    console.warn(`[Webhook] No district_subscription found for Stripe customer ${customerId}`);
    return;
  }

  const firstItem = sub.items?.data?.[0];
  const priceId = firstItem?.price?.id;
  let planTier = existing.planTier;
  let seatLimit = existing.seatLimit;
  let billingCycle = existing.billingCycle;

  if (priceId) {
    const [plan] = await db
      .select()
      .from(subscriptionPlansTable)
      .where(
        sql`${subscriptionPlansTable.monthlyPriceId} = ${priceId} OR ${subscriptionPlansTable.yearlyPriceId} = ${priceId}`
      )
      .limit(1);

    if (plan) {
      planTier = plan.tier;
      seatLimit = plan.seatLimit;
    }

    const interval = firstItem?.price?.recurring?.interval;
    if (interval === 'year') billingCycle = 'yearly';
    else if (interval === 'month') billingCycle = 'monthly';
  }

  const currentPeriodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000)
    : null;

  const status = event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status;

  await db
    .update(districtSubscriptionsTable)
    .set({
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId ?? null,
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd: String(sub.cancel_at_period_end ?? false),
      planTier,
      seatLimit,
      billingCycle,
    })
    .where(eq(districtSubscriptionsTable.id, existing.id));

  console.log(`[Webhook] Updated district_subscription ${existing.id}: status=${status}, tier=${planTier}`);
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    try {
      const event = JSON.parse(payload.toString('utf8')) as StripeEvent;
      if (SUBSCRIPTION_EVENTS.includes(event.type)) {
        await projectSubscriptionToTenant(event);
      }
    } catch (err) {
      console.error('[Webhook] Error projecting subscription event:', err);
    }
  }
}
