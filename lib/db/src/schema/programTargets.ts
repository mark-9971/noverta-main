import { pgTable, text, serial, timestamp, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";

export const programTargetsTable = pgTable("program_targets", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  name: text("name").notNull(),
  description: text("description"),
  programType: text("program_type").notNull().default("discrete_trial"),
  targetCriterion: text("target_criterion"),
  domain: text("domain"),
  active: boolean("active").notNull().default(true),
  templateId: integer("template_id"),
  promptHierarchy: jsonb("prompt_hierarchy").$type<string[]>().default(["full_physical", "partial_physical", "model", "gestural", "verbal", "independent"]),
  currentPromptLevel: text("current_prompt_level").default("verbal"),
  currentStep: integer("current_step").default(1),
  autoProgressEnabled: boolean("auto_progress_enabled").default(true),
  masteryCriterionPercent: integer("mastery_criterion_percent").default(80),
  masteryCriterionSessions: integer("mastery_criterion_sessions").default(3),
  regressionThreshold: integer("regression_threshold").default(50),
  regressionSessions: integer("regression_sessions").default(2),
  reinforcementSchedule: text("reinforcement_schedule").default("continuous"),
  reinforcementType: text("reinforcement_type"),
  tutorInstructions: text("tutor_instructions"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("pt_student_active_idx").on(table.studentId, table.active),
]);

export const insertProgramTargetSchema = createInsertSchema(programTargetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProgramTarget = z.infer<typeof insertProgramTargetSchema>;
export type ProgramTarget = typeof programTargetsTable.$inferSelect;
