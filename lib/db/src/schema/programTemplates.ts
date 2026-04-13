import { pgTable, text, serial, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const programTemplatesTable = pgTable("program_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("academic"),
  programType: text("program_type").notNull().default("discrete_trial"),
  domain: text("domain"),
  isGlobal: boolean("is_global").notNull().default(true),
  schoolId: integer("school_id"),
  tier: text("tier").notNull().default("free"),
  tags: jsonb("tags").$type<string[]>().default([]),
  createdBy: integer("created_by"),
  usageCount: integer("usage_count").notNull().default(0),
  promptHierarchy: jsonb("prompt_hierarchy").$type<string[]>().default(["full_physical", "partial_physical", "model", "gestural", "verbal", "independent"]),
  defaultMasteryPercent: integer("default_mastery_percent").default(80),
  defaultMasterySessions: integer("default_mastery_sessions").default(3),
  defaultRegressionThreshold: integer("default_regression_threshold").default(50),
  defaultReinforcementSchedule: text("default_reinforcement_schedule").default("continuous"),
  defaultReinforcementType: text("default_reinforcement_type"),
  tutorInstructions: text("tutor_instructions"),
  steps: jsonb("steps").$type<Array<{ name: string; sdInstruction?: string; targetResponse?: string; materials?: string; promptStrategy?: string; errorCorrection?: string }>>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProgramTemplateSchema = createInsertSchema(programTemplatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProgramTemplate = z.infer<typeof insertProgramTemplateSchema>;
export type ProgramTemplate = typeof programTemplatesTable.$inferSelect;
