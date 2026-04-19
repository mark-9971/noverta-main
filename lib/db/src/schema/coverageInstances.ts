import { pgTable, text, serial, timestamp, integer, boolean, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { staffTable } from "./staff";
import { scheduleBlocksTable } from "./scheduleBlocks";
import { staffAbsencesTable } from "./staffAbsences";

/**
 * One row per (schedule_block × absence_date) occurrence.
 * Substitute assignment writes here, never to the schedule_block template.
 */
export const coverageInstancesTable = pgTable("coverage_instances", {
  id: serial("id").primaryKey(),
  scheduleBlockId: integer("schedule_block_id").notNull().references(() => scheduleBlocksTable.id),
  absenceDate: date("absence_date").notNull(),
  originalStaffId: integer("original_staff_id").notNull().references(() => staffTable.id),
  substituteStaffId: integer("substitute_staff_id").references(() => staffTable.id),
  isCovered: boolean("is_covered").notNull().default(false),
  absenceId: integer("absence_id").references(() => staffAbsencesTable.id),
  notes: text("notes"),
  reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("ci_block_date_idx").on(table.scheduleBlockId, table.absenceDate),
  index("ci_absence_idx").on(table.absenceId),
  index("ci_covered_idx").on(table.isCovered, table.absenceDate),
  index("ci_reminder_idx").on(table.absenceDate, table.reminderSentAt),
]);

export const insertCoverageInstanceSchema = createInsertSchema(coverageInstancesTable).omit({ id: true, createdAt: true });
export type InsertCoverageInstance = z.infer<typeof insertCoverageInstanceSchema>;
export type CoverageInstance = typeof coverageInstancesTable.$inferSelect;
