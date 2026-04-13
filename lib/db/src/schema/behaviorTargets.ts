import { pgTable, text, serial, timestamp, integer, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";

export const behaviorTargetsTable = pgTable("behavior_targets", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  name: text("name").notNull(),
  description: text("description"),
  measurementType: text("measurement_type").notNull().default("frequency"),
  targetDirection: text("target_direction").notNull().default("decrease"),
  baselineValue: numeric("baseline_value"),
  goalValue: numeric("goal_value"),
  active: boolean("active").notNull().default(true),
  templateId: integer("template_id"),
  trackingMethod: text("tracking_method").default("per_session"),
  intervalLengthSeconds: integer("interval_length_seconds"),
  enableHourlyTracking: boolean("enable_hourly_tracking").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBehaviorTargetSchema = createInsertSchema(behaviorTargetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBehaviorTarget = z.infer<typeof insertBehaviorTargetSchema>;
export type BehaviorTarget = typeof behaviorTargetsTable.$inferSelect;
