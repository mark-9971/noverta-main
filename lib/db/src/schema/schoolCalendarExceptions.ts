import { pgTable, serial, integer, text, timestamp, date, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { schoolsTable } from "./schools";
import { staffTable } from "./staff";

/**
 * Per-school day-level exception to the default instructional calendar.
 *
 * Slice 1 (read-only model): nothing consumes these rows yet. Later slices
 * will join them into expected-slot computations, the Today view, and the
 * minute-progress denominator.
 *
 * Type is constrained at the DB layer to {'closure','early_release'} via a
 * CHECK constraint in 042_school_calendar_exceptions.sql. dismissal_time is
 * required for 'early_release' and forbidden for 'closure'.
 */
export const schoolCalendarExceptionsTable = pgTable("school_calendar_exceptions", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id").notNull().references(() => schoolsTable.id, { onDelete: "cascade" }),
  exceptionDate: date("exception_date").notNull(),
  type: text("type").notNull(),                // 'closure' | 'early_release'
  dismissalTime: text("dismissal_time"),       // 'HH:MM' (24h), only when type='early_release'
  reason: text("reason").notNull(),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => staffTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("sce_school_date_unique").on(table.schoolId, table.exceptionDate),
  index("sce_school_idx").on(table.schoolId),
  index("sce_date_idx").on(table.exceptionDate),
]);

export const SCHOOL_CALENDAR_EXCEPTION_TYPES = ["closure", "early_release"] as const;
export type SchoolCalendarExceptionType = typeof SCHOOL_CALENDAR_EXCEPTION_TYPES[number];

export const insertSchoolCalendarExceptionSchema = createInsertSchema(schoolCalendarExceptionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSchoolCalendarException = z.infer<typeof insertSchoolCalendarExceptionSchema>;
export type SchoolCalendarException = typeof schoolCalendarExceptionsTable.$inferSelect;
