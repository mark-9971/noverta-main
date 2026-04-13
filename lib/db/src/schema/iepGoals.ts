import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";

export const iepGoalsTable = pgTable("iep_goals", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  goalArea: text("goal_area").notNull(),
  goalNumber: integer("goal_number").notNull().default(1),
  annualGoal: text("annual_goal").notNull(),
  baseline: text("baseline"),
  targetCriterion: text("target_criterion"),
  measurementMethod: text("measurement_method"),
  scheduleOfReporting: text("schedule_of_reporting").default("quarterly"),
  programTargetId: integer("program_target_id"),
  behaviorTargetId: integer("behavior_target_id"),
  serviceArea: text("service_area"),
  status: text("status").notNull().default("active"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  benchmarks: text("benchmarks"),
  iepDocumentId: integer("iep_document_id"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertIepGoalSchema = createInsertSchema(iepGoalsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIepGoal = z.infer<typeof insertIepGoalSchema>;
export type IepGoal = typeof iepGoalsTable.$inferSelect;
