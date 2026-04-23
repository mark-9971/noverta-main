import { getStripeSync } from './stripeClient';
import {
  db,
  districtSubscriptionsTable,
  districtsTable,
  subscriptionPlansTable,
  processedStripeEventsTable,
} from '@workspace/db';
import { eq, sql } from 'drizzle-orm';
import { sendBillingNotification, buildBillingEmailHtml } from './billingEmail';

/**
 * Statuses we treat as "terminal / never silently downgrade from a stronger
 * state". A late or out-of-order `customer.subscription.updated` carrying
 * `past_due` must not overwrite a `canceled` row, and an `invoice.payment_*`
 * event must not flip a `canceled` row back to `active`. The gate uses
 * `status` as the primary authorization signal so any silent overwrite is a
 * direct authz risk.
 */
const STICKY_TERMINAL_STATUSES = new Set(['canceled', 'incomplete_expired']);

const VALID_DISTRICT_TIERS = new Set(['essentials', 'professional', 'enterprise']);

/**
 * Grace period (days) granted on the FIRST invoice.payment_failed before the
 * subscription gate begins blocking access. Stripe's smart retry schedule
 * spreads attempts across roughly a week, so we mirror that window: enough
 * time for the admin to update the payment method but bounded so unpaid
 * accounts cannot lurk indefinitely.
 */
const PAYMENT_GRACE_PERIOD_DAYS = 7;

interface StripeSubscriptionEventObject {
  id: string;
  status: string;
  customer: string | { id: string };
  current_period_end?: number;
  trial_end?: number;
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
}

interface StripeInvoiceEventObject {
  id: string;
  customer: string | { id: string };
  subscription?: string | null;
  attempt_count?: number;
  next_payment_attempt?: number | null;
  amount_due?: number;
  last_finalization_error?: { message?: string; code?: string } | null;
  // The provider sometimes nests the failure reason under a charge object.
  charge?: string | null;
  hosted_invoice_url?: string | null;
}

interface StripePaymentMethodEventObject {
  id: string;
  customer: string | { id: string } | null;
  type?: string;
  card?: { brand?: string; last4?: string };
}

interface StripeCustomerEventObject {
  id: string;
}

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: unknown;
  };
}

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);

function extractCustomerId(c: string | { id: string } | null | undefined): string {
  if (!c) return '';
  if (typeof c === 'string') return c;
  return c.id ?? '';
}

async function findSubscriptionByCustomerId(customerId: string) {
  if (!customerId) return null;
  const [row] = await db
    .select()
    .from(districtSubscriptionsTable)
    .where(eq(districtSubscriptionsTable.stripeCustomerId, customerId))
    .limit(1);
  return row ?? null;
}

async function projectSubscriptionToTenant(event: StripeEvent): Promise<void> {
  const sub = event.data.object as StripeSubscriptionEventObject;
  const customerId = extractCustomerId(sub.customer);
  if (!customerId) return;

  const existing = await findSubscriptionByCustomerId(customerId);
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
  const trialEndsAt = sub.trial_end ? new Date(sub.trial_end * 1000) : null;

  const incomingStatus = event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status;

  // Sticky terminal protection: never silently downgrade `canceled` /
  // `incomplete_expired` because of a late or out-of-order Stripe event.
  // The gate uses `status` as the primary authorization signal so an
  // overwrite here is a real authz risk.
  const status =
    STICKY_TERMINAL_STATUSES.has(existing.status) && existing.status !== incomingStatus
      ? existing.status
      : incomingStatus;

  if (status !== incomingStatus) {
    console.warn(
      `[Webhook] ${event.type} would have overwritten sticky terminal status ${existing.status} ` +
      `→ ${incomingStatus} for district_subscription ${existing.id}. Keeping ${existing.status}.`,
    );
  }

  // Status transitioning back to `active` from a failure state: clear the
  // grace window so the gate stops counting down. invoice.payment_succeeded
  // also clears these, but the subscription event can arrive first.
  const clearFailureFields = status === 'active' && existing.status !== 'active';

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
      trialEndsAt: trialEndsAt ?? existing.trialEndsAt,
      ...(clearFailureFields
        ? { gracePeriodEndsAt: null, paymentFailureCount: 0 }
        : {}),
    })
    .where(eq(districtSubscriptionsTable.id, existing.id));

  // Notify admins on cancellation so they aren't surprised by losing access.
  if (event.type === 'customer.subscription.deleted' && existing.status !== 'canceled') {
    await sendBillingNotification({
      districtId: existing.districtId,
      notificationType: 'subscription_canceled',
      subject: 'Your Noverta subscription has been canceled',
      html: buildBillingEmailHtml({
        heading: 'Subscription canceled',
        body: '<p>Your Noverta subscription has been canceled. Access to the platform has been suspended.</p><p>If this was unintentional, you can resubscribe from the billing page.</p>',
        ctaLabel: 'Reactivate subscription',
        ctaUrl: 'https://trellis.education/billing',
      }),
      text: 'Your Noverta subscription has been canceled. Visit the billing page to resubscribe.',
    }).catch((err) => console.error('[Webhook] cancellation email failed:', err));
  }

  // Project the active plan tier onto the district itself so feature-gating
  // (tierGate.ts reads districts.tier) reflects the paid plan immediately.
  // Only sync valid enum values; on cancellation we drop back to essentials.
  if (existing.districtId) {
    if (status === 'canceled') {
      await db
        .update(districtsTable)
        .set({ tier: 'essentials' })
        .where(eq(districtsTable.id, existing.districtId));
    } else if (VALID_DISTRICT_TIERS.has(planTier)) {
      await db
        .update(districtsTable)
        .set({ tier: planTier as 'essentials' | 'professional' | 'enterprise' })
        .where(eq(districtsTable.id, existing.districtId));
    }
  }

  console.log(`[Webhook] Updated district_subscription ${existing.id}: status=${status}, tier=${planTier}`);
}

/**
 * invoice.payment_failed — a card declined on a renewal (or the first
 * post-trial charge). We:
 *   - record the failure (timestamp, reason, count)
 *   - set `gracePeriodEndsAt = now + PAYMENT_GRACE_PERIOD_DAYS` on the FIRST
 *     failure of a streak (do not extend on subsequent retries — the window
 *     is anchored to the first decline so customers cannot stay in limbo by
 *     letting Stripe keep retrying)
 *   - email district admins so they can update the card before the gate
 *     starts blocking access.
 */
export async function handleInvoicePaymentFailed(event: StripeEvent): Promise<void> {
  const inv = event.data.object as StripeInvoiceEventObject;
  const customerId = extractCustomerId(inv.customer);
  const existing = await findSubscriptionByCustomerId(customerId);
  if (!existing) return;

  const now = new Date();
  // Anchor the grace window to the first failure in a streak. A streak ends
  // when invoice.payment_succeeded fires (which clears these fields).
  const isFirstFailureInStreak = existing.paymentFailureCount === 0 || !existing.gracePeriodEndsAt;
  const gracePeriodEndsAt = isFirstFailureInStreak
    ? new Date(now.getTime() + PAYMENT_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
    : existing.gracePeriodEndsAt;

  const reason =
    inv.last_finalization_error?.message ??
    inv.last_finalization_error?.code ??
    'Payment failed';

  // Drive the gate's primary `status` signal directly from the invoice
  // event — Stripe also fires `customer.subscription.updated` with the same
  // status transition, but it can arrive seconds-to-minutes later (or get
  // dropped). Sticky terminal protection still applies.
  const statusUpdate = STICKY_TERMINAL_STATUSES.has(existing.status)
    ? {}
    : { status: 'past_due' as const };

  await db
    .update(districtSubscriptionsTable)
    .set({
      ...statusUpdate,
      lastPaymentFailureAt: now,
      lastPaymentFailureReason: reason,
      paymentFailureCount: (existing.paymentFailureCount ?? 0) + 1,
      gracePeriodEndsAt,
    })
    .where(eq(districtSubscriptionsTable.id, existing.id));

  if (isFirstFailureInStreak) {
    const graceText = gracePeriodEndsAt
      ? gracePeriodEndsAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'shortly';
    await sendBillingNotification({
      districtId: existing.districtId,
      notificationType: 'payment_failed',
      subject: 'Action required: payment failed for your Noverta subscription',
      html: buildBillingEmailHtml({
        heading: 'Your card was declined',
        body: `<p>We were unable to charge the payment method on file for your Noverta subscription.</p>
<p><strong>Reason:</strong> ${reason}</p>
<p>You have until <strong>${graceText}</strong> to update your payment method before access to Noverta is restricted. We'll keep retrying the charge on Stripe's standard schedule until then.</p>`,
        ctaLabel: 'Update payment method',
        ctaUrl: 'https://trellis.education/billing',
      }),
      text: `Your Noverta subscription payment failed (${reason}). Please update your payment method by ${graceText}.`,
    }).catch((err) => console.error('[Webhook] payment_failed email failed:', err));
  }

  console.log(
    `[Webhook] invoice.payment_failed: district_subscription ${existing.id} streak=${existing.paymentFailureCount + 1} graceUntil=${gracePeriodEndsAt?.toISOString()}`,
  );
}

/**
 * invoice.payment_succeeded — clear the failure streak. We always set
 * `lastSuccessfulPaymentAt` so audit/UI can show "last paid X days ago".
 */
export async function handleInvoicePaymentSucceeded(event: StripeEvent): Promise<void> {
  const inv = event.data.object as StripeInvoiceEventObject;
  const customerId = extractCustomerId(inv.customer);
  const existing = await findSubscriptionByCustomerId(customerId);
  if (!existing) return;

  const now = new Date();
  // Drive the gate's primary `status` signal back to `active` on success
  // unless the row is sticky-terminal (a late `payment_succeeded` after
  // cancellation must not silently re-activate access).
  const statusUpdate = STICKY_TERMINAL_STATUSES.has(existing.status)
    ? {}
    : { status: 'active' as const };

  await db
    .update(districtSubscriptionsTable)
    .set({
      ...statusUpdate,
      lastSuccessfulPaymentAt: now,
      gracePeriodEndsAt: null,
      paymentFailureCount: 0,
      lastPaymentFailureAt: null,
      lastPaymentFailureReason: null,
    })
    .where(eq(districtSubscriptionsTable.id, existing.id));

  console.log(
    `[Webhook] invoice.payment_succeeded: district_subscription ${existing.id} cleared failure streak`,
  );
}

/**
 * customer.subscription.trial_will_end — Stripe fires this 3 days before the
 * trial converts. We email the admin so they have time to confirm the card
 * on file is valid before the first real charge runs.
 */
export async function handleTrialWillEnd(event: StripeEvent): Promise<void> {
  const sub = event.data.object as StripeSubscriptionEventObject;
  const customerId = extractCustomerId(sub.customer);
  const existing = await findSubscriptionByCustomerId(customerId);
  if (!existing) return;

  const trialEndsAt = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
  if (trialEndsAt) {
    await db
      .update(districtSubscriptionsTable)
      .set({ trialEndsAt })
      .where(eq(districtSubscriptionsTable.id, existing.id));
  }

  const dateText = trialEndsAt
    ? trialEndsAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'in 3 days';
  await sendBillingNotification({
    districtId: existing.districtId,
    notificationType: 'trial_ending',
    subject: 'Your Noverta trial ends soon',
    html: buildBillingEmailHtml({
      heading: 'Your trial ends soon',
      body: `<p>Your Noverta trial ends on <strong>${dateText}</strong>. Your card will be charged automatically on that date for the plan you selected at signup.</p>
<p>If you'd like to switch plans, update billing details, or cancel before the charge, visit your billing page.</p>`,
      ctaLabel: 'Manage subscription',
      ctaUrl: 'https://trellis.education/billing',
    }),
    text: `Your Noverta trial ends on ${dateText}. Your card will be charged automatically.`,
  }).catch((err) => console.error('[Webhook] trial_will_end email failed:', err));
}

/**
 * payment_method.detached — the customer removed their card. We don't know
 * yet whether they have another payment method on file, but we warn the
 * admin so the next renewal doesn't fail silently.
 */
export async function handlePaymentMethodDetached(event: StripeEvent): Promise<void> {
  const pm = event.data.object as StripePaymentMethodEventObject;
  const customerId = extractCustomerId(pm.customer);
  const existing = await findSubscriptionByCustomerId(customerId);
  if (!existing) return;

  // Only warn for active/trialing subs — a detach on a canceled customer is
  // expected cleanup.
  const ACTIONABLE_STATUSES = new Set(['active', 'trialing', 'past_due']);
  if (!ACTIONABLE_STATUSES.has(existing.status)) return;

  const cardDesc = pm.card?.brand && pm.card?.last4
    ? `${pm.card.brand} card ending in ${pm.card.last4}`
    : 'a payment method';
  await sendBillingNotification({
    districtId: existing.districtId,
    notificationType: 'payment_method_removed',
    subject: 'A payment method was removed from your Noverta account',
    html: buildBillingEmailHtml({
      heading: 'Payment method removed',
      body: `<p>The ${cardDesc} on your Noverta account was just removed. If you don't have another card on file, your next renewal charge will fail.</p>`,
      ctaLabel: 'Add a payment method',
      ctaUrl: 'https://trellis.education/billing',
    }),
    text: `The ${cardDesc} on your Noverta account was removed. Add a new payment method before your next renewal.`,
  }).catch((err) => console.error('[Webhook] payment_method.detached email failed:', err));
}

/**
 * customer.deleted — the Stripe customer record was deleted (rare; usually
 * an admin cleanup action). Treat as cancellation so we don't keep billing
 * a non-existent customer.
 */
export async function handleCustomerDeleted(event: StripeEvent): Promise<void> {
  const cust = event.data.object as StripeCustomerEventObject;
  const existing = await findSubscriptionByCustomerId(cust.id);
  if (!existing) return;

  await db
    .update(districtSubscriptionsTable)
    .set({ status: 'canceled' })
    .where(eq(districtSubscriptionsTable.id, existing.id));

  if (existing.districtId) {
    await db
      .update(districtsTable)
      .set({ tier: 'essentials' })
      .where(eq(districtsTable.id, existing.districtId));
  }
}

/**
 * Idempotency gate. Stripe will retry any webhook the receiver doesn't ack
 * with 2xx, and during incidents the same event id can arrive several times
 * concurrently. Without this gate a duplicate `invoice.payment_failed`
 * would re-increment `paymentFailureCount`, re-anchor `gracePeriodEndsAt`,
 * and re-send the admin email.
 *
 * Returns true if this is the first time we've seen the event id (caller
 * should proceed). Returns false if the event id has already been recorded
 * (caller should skip side effects but still ack 2xx).
 */
async function recordEventIfNew(event: StripeEvent): Promise<boolean> {
  if (!event.id) {
    // Defensive: legitimate Stripe events always have an id. If we're being
    // called with a synthesized event in a test, fall through and process it.
    return true;
  }
  try {
    await db.insert(processedStripeEventsTable).values({
      eventId: event.id,
      eventType: event.type,
    });
    return true;
  } catch (err) {
    // Unique-constraint violation = duplicate event. Any other error we let
    // bubble so the dispatcher returns non-2xx and Stripe retries.
    const code = (err as { code?: string }).code;
    if (code === '23505') {
      console.log(`[Webhook] Skipping duplicate event ${event.id} (${event.type})`);
      return false;
    }
    throw err;
  }
}

/**
 * Top-level dispatcher. Uses a switch on event.type so adding a new event
 * is one branch and the dispatch table is grep-able from one place.
 */
async function dispatchEvent(event: StripeEvent): Promise<void> {
  if (SUBSCRIPTION_EVENTS.has(event.type)) {
    await projectSubscriptionToTenant(event);
    return;
  }
  switch (event.type) {
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event);
      return;
    case 'invoice.payment_succeeded':
      await handleInvoicePaymentSucceeded(event);
      return;
    case 'customer.subscription.trial_will_end':
      await handleTrialWillEnd(event);
      return;
    case 'payment_method.detached':
      await handlePaymentMethodDetached(event);
      return;
    case 'customer.deleted':
      await handleCustomerDeleted(event);
      return;
    default:
      // Unhandled event types are a silent no-op — Stripe sends a lot of
      // events we don't care about. The Stripe sync component handles its
      // own internal projection separately.
      return;
  }
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

    // We intentionally do NOT swallow dispatch errors here. If our custom
    // projection (failure-state, grace anchor, admin email) fails, returning
    // non-2xx is the right behavior — Stripe will retry, and the
    // idempotency table prevents double processing once we recover. The
    // previous "log and continue" pattern silently dropped billing-state
    // updates and was a real risk.
    const event = JSON.parse(payload.toString('utf8')) as StripeEvent;
    // Claim-then-dispatch with rollback on failure. The dedupe row is the
    // serialization point that prevents concurrent retries from
    // double-processing (e.g. two `invoice.payment_failed` retries both
    // incrementing `paymentFailureCount` and re-anchoring grace). However
    // if dispatch then throws (transient DB outage, downstream timeout),
    // we MUST release the claim so the next Stripe retry can re-attempt —
    // otherwise the dedupe row would silently mask permanent loss of the
    // status/grace projection.
    const isFresh = await recordEventIfNew(event);
    if (!isFresh) return;
    try {
      await dispatchEvent(event);
    } catch (err) {
      try {
        await db
          .delete(processedStripeEventsTable)
          .where(eq(processedStripeEventsTable.eventId, event.id));
      } catch (cleanupErr) {
        // Cleanup failures are logged but the original error wins — Stripe
        // still sees non-2xx and retries. Worst case the duplicate retry is
        // suppressed by the orphaned dedupe row, which is the same failure
        // mode as the bug we just fixed but bounded to cleanup-failure
        // windows only (rare). Surface the cleanup error in logs so ops
        // can investigate.
        console.error(
          `[Webhook] Failed to release dedupe claim for event ${event.id} after dispatch error:`,
          cleanupErr,
        );
      }
      throw err;
    }
  }
}
