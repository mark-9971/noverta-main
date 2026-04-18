import { pgTable, text, serial, timestamp, integer, numeric, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { programTargetsTable } from "./programTargets";
import { studentsTable } from "./students";
import { dataSessionsTable } from "./dataSessions";

export const maintenanceProbesTable = pgTable("maintenance_probes", {
  id: serial("id").primaryKey(),
  programTargetId: integer("program_target_id")
    .notNull()
    .references(() => programTargetsTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id")
    .notNull()
    .references(() => studentsTable.id, { onDelete: "cascade" }),
  dueDate: text("due_date").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  dataSessionId: integer("data_session_id")
    .references(() => dataSessionsTable.id, { onDelete: "set null" }),
  trialsCorrect: integer("trials_correct"),
  trialsTotal: integer("trials_total"),
  percentCorrect: numeric("percent_correct"),
  passed: boolean("passed"),
  notes: text("notes"),
  scheduledByClerkId: text("scheduled_by_clerk_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("mp_target_idx").on(table.programTargetId),
  index("mp_student_due_idx").on(table.studentId, table.dueDate),
  index("mp_due_completed_idx").on(table.dueDate, table.completedAt),
]);

export const insertMaintenanceProbeSchema = createInsertSchema(maintenanceProbesTable)
  .omit({ id: true, createdAt: true });
export type InsertMaintenanceProbe = z.infer<typeof insertMaintenanceProbeSchema>;
export type MaintenanceProbe = typeof maintenanceProbesTable.$inferSelect;
