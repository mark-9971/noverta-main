import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dataSessionsTable } from "./dataSessions";
import { programTargetsTable } from "./programTargets";

export const programDataTable = pgTable("program_data", {
  id: serial("id").primaryKey(),
  dataSessionId: integer("data_session_id").notNull().references(() => dataSessionsTable.id, { onDelete: "cascade" }),
  programTargetId: integer("program_target_id").notNull().references(() => programTargetsTable.id),
  trialsCorrect: integer("trials_correct").notNull().default(0),
  trialsTotal: integer("trials_total").notNull().default(0),
  prompted: integer("prompted").default(0),
  stepNumber: integer("step_number"),
  independenceLevel: text("independence_level"),
  percentCorrect: numeric("percent_correct"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProgramDataSchema = createInsertSchema(programDataTable).omit({ id: true, createdAt: true });
export type InsertProgramData = z.infer<typeof insertProgramDataSchema>;
export type ProgramData = typeof programDataTable.$inferSelect;
