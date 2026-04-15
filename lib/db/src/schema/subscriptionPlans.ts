import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const subscriptionPlansTable = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  tier: text("tier").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  seatLimit: integer("seat_limit").notNull(),
  monthlyPriceId: text("monthly_price_id"),
  yearlyPriceId: text("yearly_price_id"),
  monthlyPriceCents: integer("monthly_price_cents").notNull(),
  yearlyPriceCents: integer("yearly_price_cents").notNull(),
  stripeProductId: text("stripe_product_id"),
  features: text("features"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlansTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;
