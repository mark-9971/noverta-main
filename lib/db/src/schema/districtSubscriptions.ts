import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { districtsTable } from "./districts";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

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
