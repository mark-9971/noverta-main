import { pgTable, text, serial, timestamp, integer, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { staffTable } from "./staff";
import { schoolsTable } from "./schools";

export const staffAbsencesTable = pgTable("staff_absences", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffTable.id),
  schoolId: integer("school_id").references(() => schoolsTable.id),
  absenceDate: date("absence_date").notNull(),
  absenceType: text("absence_type").notNull().default("other"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  notes: text("notes"),
  reportedBy: integer("reported_by").references(() => staffTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("sa_absences_staff_date_idx").on(table.staffId, table.absenceDate),
  index("sa_absences_date_idx").on(table.absenceDate),
]);

export const insertStaffAbsenceSchema = createInsertSchema(staffAbsencesTable).omit({ id: true, createdAt: true });
export type InsertStaffAbsence = z.infer<typeof insertStaffAbsenceSchema>;
export type StaffAbsence = typeof staffAbsencesTable.$inferSelect;
