import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sessionLogsTable } from "./sessionLogs";
import { iepGoalsTable } from "./iepGoals";

export const sessionGoalDataTable = pgTable("session_goal_data", {
  id: serial("id").primaryKey(),
  sessionLogId: integer("session_log_id").notNull().references(() => sessionLogsTable.id, { onDelete: "cascade" }),
  iepGoalId: integer("iep_goal_id").notNull().references(() => iepGoalsTable.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("sgd_session_log_idx").on(table.sessionLogId),
  index("sgd_iep_goal_idx").on(table.iepGoalId),
  index("sgd_session_goal_idx").on(table.sessionLogId, table.iepGoalId),
]);

export const insertSessionGoalDataSchema = createInsertSchema(sessionGoalDataTable).omit({ id: true, createdAt: true });
export type InsertSessionGoalData = z.infer<typeof insertSessionGoalDataSchema>;
export type SessionGoalData = typeof sessionGoalDataTable.$inferSelect;
