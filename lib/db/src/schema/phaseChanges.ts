import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { behaviorTargetsTable } from "./behaviorTargets";
import { studentsTable } from "./students";

export const phaseChangesTable = pgTable("phase_changes", {
  id: serial("id").primaryKey(),
  behaviorTargetId: integer("behavior_target_id").notNull().references(() => behaviorTargetsTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").references(() => studentsTable.id, { onDelete: "cascade" }),
  targetId: integer("target_id"),
  changeDate: text("change_date").notNull(),
  label: text("label").notNull(),
  fromPhase: text("from_phase"),
  toPhase: text("to_phase"),
  reason: text("reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("phchg_target_date_idx").on(table.behaviorTargetId, table.changeDate),
  index("phchg_student_idx").on(table.studentId),
]);

export const insertPhaseChangeSchema = createInsertSchema(phaseChangesTable).omit({ id: true, createdAt: true });
export type InsertPhaseChange = z.infer<typeof insertPhaseChangeSchema>;
export type PhaseChange = typeof phaseChangesTable.$inferSelect;
