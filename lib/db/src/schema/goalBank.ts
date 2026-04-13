import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const goalBankTable = pgTable("goal_bank", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull(),
  goalArea: text("goal_area").notNull(),
  goalText: text("goal_text").notNull(),
  benchmarkText: text("benchmark_text"),
  gradeRange: text("grade_range"),
  source: text("source").notNull().default("system"),
  tags: text("tags"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGoalBankSchema = createInsertSchema(goalBankTable).omit({ id: true, createdAt: true });
export type InsertGoalBank = z.infer<typeof insertGoalBankSchema>;
export type GoalBank = typeof goalBankTable.$inferSelect;
