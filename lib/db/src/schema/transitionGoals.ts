import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { transitionPlansTable } from "./transitionPlans";

export const transitionGoalsTable = pgTable("transition_goals", {
  id: serial("id").primaryKey(),
  transitionPlanId: integer("transition_plan_id").notNull().references(() => transitionPlansTable.id),
  domain: text("domain").notNull(),
  goalStatement: text("goal_statement").notNull(),
  measurableCriteria: text("measurable_criteria"),
  activities: text("activities"),
  responsibleParty: text("responsible_party"),
  targetDate: text("target_date"),
  status: text("status").notNull().default("active"),
  progressNotes: text("progress_notes"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("tg_plan_idx").on(table.transitionPlanId),
  index("tg_domain_idx").on(table.domain),
]);

export const insertTransitionGoalSchema = createInsertSchema(transitionGoalsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransitionGoal = z.infer<typeof insertTransitionGoalSchema>;
export type TransitionGoal = typeof transitionGoalsTable.$inferSelect;
