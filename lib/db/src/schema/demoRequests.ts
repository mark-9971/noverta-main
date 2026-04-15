import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertDemoRequestSchema = createInsertSchema(demoRequestsTable).omit({
  id: true,
  reviewed: true,
  createdAt: true,
});
