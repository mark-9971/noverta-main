import { pgTable, text, serial, timestamp, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { programTargetsTable } from "./programTargets";

export const programStepsTable = pgTable("program_steps", {
  id: serial("id").primaryKey(),
  programTargetId: integer("program_target_id").notNull().references(() => programTargetsTable.id, { onDelete: "cascade" }),
  stepNumber: integer("step_number").notNull().default(1),
  name: text("name").notNull(),
  sdInstruction: text("sd_instruction"),
  targetResponse: text("target_response"),
  materials: text("materials"),
  promptStrategy: text("prompt_strategy"),
  errorCorrection: text("error_correction"),
  reinforcementNotes: text("reinforcement_notes"),
  active: boolean("active").notNull().default(true),
  mastered: boolean("mastered").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("program_steps_target_step_idx").on(table.programTargetId, table.stepNumber),
]);

export const insertProgramStepSchema = createInsertSchema(programStepsTable).omit({ id: true, createdAt: true });
export type InsertProgramStep = z.infer<typeof insertProgramStepSchema>;
export type ProgramStep = typeof programStepsTable.$inferSelect;
