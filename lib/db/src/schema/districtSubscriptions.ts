import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { districtsTable } from "./districts";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * District subscription state. The `status` column mirrors Stripe's
 * subscription status and drives `subscriptionGate.ts`.
 *
 * Failure-state lifecycle (see also docs/billing/failure-state-lifecycle.md):
 *
 *   active   ── invoice.payment_failed ──▶  past_due  (grace period 7d)
 *                                              │
 *                                              ├── invoice.payment_succeeded ──▶ active
 *                                              │     (failure fields cleared)
 *                                              │
 *                                              └── grace expires + retries fail
 *                                                  ──▶ unpaid → canceled
 *
 *   trialing ── trial_will_end (3d before)  ──▶ admins notified
 *            ── trial expires w/ no card    ──▶ incomplete_expired (gated)
 *            ── trial expires w/ valid card ──▶ active
 */
export const districtSubscriptionsTable = pgTable("district_subscriptions", {
  id: serial("id").primaryKey(),
  districtId: integer("district_id").notNull().references(() => districtsTable.id).unique(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePriceId: text("stripe_price_id"),
  planTier: text("plan_tier").notNull().default("trial"),
  seatLimit: integer("seat_limit").notNull().default(10),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  status: text("status").notNull().default("trialing"),
  addOns: text("add_ons").array().notNull().default(sql`ARRAY[]::text[]`),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: text("cancel_at_period_end").default("false"),
  // Failure-state fields. `gracePeriodEndsAt` is set on invoice.payment_failed
  // and consulted by the subscriptionGate so a single missed retry does NOT
  // immediately lock the customer out — Stripe's smart retries can take
  // several days, so we give 7 days from the first failure for the admin to
  // update the payment method.
  gracePeriodEndsAt: timestamp("grace_period_ends_at", { withTimezone: true }),
  lastPaymentFailureAt: timestamp("last_payment_failure_at", { withTimezone: true }),
  lastPaymentFailureReason: text("last_payment_failure_reason"),
  paymentFailureCount: integer("payment_failure_count").notNull().default(0),
  lastSuccessfulPaymentAt: timestamp("last_successful_payment_at", { withTimezone: true }),
  // Trial expiry mirrored separately from currentPeriodEnd so the UI can show
  // a trial countdown without parsing status semantics.
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDistrictSubscriptionSchema = createInsertSchema(districtSubscriptionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDistrictSubscription = z.infer<typeof insertDistrictSubscriptionSchema>;
export type DistrictSubscription = typeof districtSubscriptionsTable.$inferSelect;
