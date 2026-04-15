import { pgTable, text, serial, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { staffTable } from "./staff";

export const transitionPlansTable = pgTable("transition_plans", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  planDate: text("plan_date").notNull(),
  ageOfMajorityNotified: boolean("age_of_majority_notified").default(false),
  ageOfMajorityDate: text("age_of_majority_date"),
  graduationPathway: text("graduation_pathway"),
  expectedGraduationDate: text("expected_graduation_date"),
  diplomaType: text("diploma_type"),
  creditsEarned: text("credits_earned"),
  creditsRequired: text("credits_required"),
  assessmentsUsed: text("assessments_used"),
  studentVisionStatement: text("student_vision_statement"),
  coordinatorId: integer("coordinator_id").references(() => staffTable.id),
  status: text("status").notNull().default("draft"),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("tp_student_idx").on(table.studentId),
  index("tp_status_idx").on(table.status),
]);

export const insertTransitionPlanSchema = createInsertSchema(transitionPlansTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransitionPlan = z.infer<typeof insertTransitionPlanSchema>;
export type TransitionPlan = typeof transitionPlansTable.$inferSelect;
