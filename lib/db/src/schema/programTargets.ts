import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProgramTargetSchema = createInsertSchema(programTargetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProgramTarget = z.infer<typeof insertProgramTargetSchema>;
export type ProgramTarget = typeof programTargetsTable.$inferSelect;
