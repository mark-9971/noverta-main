import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { programTargetsTable } from "./programTargets";

export const programTargetPhaseHistoryTable = pgTable("program_target_phase_history", {
  id: serial("id").primaryKey(),
  programTargetId: integer("program_target_id")
    .notNull()
    .references(() => programTargetsTable.id, { onDelete: "cascade" }),
  phase: text("phase").notNull(),
  previousPhase: text("previous_phase"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  reason: text("reason"),
  changedByClerkId: text("changed_by_clerk_id"),
  changedByStaffId: integer("changed_by_staff_id"),
}, (table) => [
  index("ptph_target_idx").on(table.programTargetId),
  index("ptph_target_started_idx").on(table.programTargetId, table.startedAt),
]);

export const insertProgramTargetPhaseHistorySchema = createInsertSchema(programTargetPhaseHistoryTable)
  .omit({ id: true, startedAt: true });
export type InsertProgramTargetPhaseHistory = z.infer<typeof insertProgramTargetPhaseHistorySchema>;
export type ProgramTargetPhaseHistory = typeof programTargetPhaseHistoryTable.$inferSelect;
