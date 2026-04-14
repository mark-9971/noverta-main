import { pgTable, text, serial, timestamp, integer, numeric, index, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { fbasTable } from "./fbas";
import { staffTable } from "./staff";

export const functionalAnalysesTable = pgTable("functional_analyses", {
  id: serial("id").primaryKey(),
  fbaId: integer("fba_id").notNull().references(() => fbasTable.id),
  sessionNumber: integer("session_number").notNull(),
  condition: text("condition").notNull(),
  sessionDate: date("session_date").notNull(),
  conductedBy: integer("conducted_by").references(() => staffTable.id),
  durationMinutes: integer("duration_minutes").notNull().default(10),
  responseCount: integer("response_count").notNull().default(0),
  responseRate: numeric("response_rate"),
  latencySeconds: integer("latency_seconds"),
  durationOfBehaviorSeconds: integer("duration_of_behavior_seconds"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("fa_fba_idx").on(table.fbaId),
  index("fa_condition_idx").on(table.condition),
]);

export const insertFunctionalAnalysisSchema = createInsertSchema(functionalAnalysesTable).omit({ id: true, createdAt: true });
export type InsertFunctionalAnalysis = z.infer<typeof insertFunctionalAnalysisSchema>;
export type FunctionalAnalysis = typeof functionalAnalysesTable.$inferSelect;
