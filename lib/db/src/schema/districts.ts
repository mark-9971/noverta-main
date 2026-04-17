import { pgTable, text, serial, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const districtTierEnum = pgEnum("district_tier", ["essentials", "professional", "enterprise"]);

export const districtsTable = pgTable("districts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  state: text("state").default("MA"),
  region: text("region"),
  tier: districtTierEnum("tier").notNull().default("essentials"),
  tierOverride: districtTierEnum("tier_override"),
  isDemo: boolean("is_demo").notNull().default(false),
  isPilot: boolean("is_pilot").notNull().default(false),
  hasSampleData: boolean("has_sample_data").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDistrictSchema = createInsertSchema(districtsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDistrict = z.infer<typeof insertDistrictSchema>;
export type District = typeof districtsTable.$inferSelect;
