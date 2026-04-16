import { pgTable, text, serial, timestamp, integer, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { staffTable } from "./staff";
import { schoolsTable } from "./schools";
import { serviceTypesTable } from "./serviceTypes";

export const staffSchedulesTable = pgTable("staff_schedules", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffTable.id),
  schoolId: integer("school_id").notNull().references(() => schoolsTable.id),
  serviceTypeId: integer("service_type_id").references(() => serviceTypesTable.id),
  dayOfWeek: text("day_of_week").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  label: text("label"),
  notes: text("notes"),
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("ss_staff_day_idx").on(table.staffId, table.dayOfWeek),
  index("ss_school_idx").on(table.schoolId),
  index("ss_staff_school_idx").on(table.staffId, table.schoolId),
]);

export const insertStaffScheduleSchema = createInsertSchema(staffSchedulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStaffSchedule = z.infer<typeof insertStaffScheduleSchema>;
export type StaffSchedule = typeof staffSchedulesTable.$inferSelect;
