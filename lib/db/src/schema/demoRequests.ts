import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const demoRequestsTable = pgTable("demo_requests", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  district: text("district").notNull(),
  role: text("role").notNull(),
  message: text("message"),
  tier: text("tier"),
  reviewed: boolean("reviewed").default(false).notNull(),
  status: text("status").notNull().default("pending"),
  provisionedAt: timestamp("provisioned_at", { withTimezone: true }),
  districtId: integer("district_id"),
  clerkUserId: text("clerk_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
});

export const insertDemoRequestSchema = createInsertSchema(demoRequestsTable).omit({
  id: true,
  reviewed: true,
  status: true,
  provisionedAt: true,
  districtId: true,
  clerkUserId: true,
  createdAt: true,
});
