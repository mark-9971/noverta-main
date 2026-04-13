import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { staffTable } from "./staff";
import { studentsTable } from "./students";

export const staffAssignmentsTable = pgTable("staff_assignments", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffTable.id),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  assignmentType: text("assignment_type").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("sa_staff_idx").on(table.staffId),
  index("sa_student_idx").on(table.studentId),
]);

export const insertStaffAssignmentSchema = createInsertSchema(staffAssignmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStaffAssignment = z.infer<typeof insertStaffAssignmentSchema>;
export type StaffAssignment = typeof staffAssignmentsTable.$inferSelect;
