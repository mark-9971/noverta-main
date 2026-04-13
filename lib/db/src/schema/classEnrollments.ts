import { pgTable, serial, integer, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { classesTable } from "./classes";
import { studentsTable } from "./students";

export const classEnrollmentsTable = pgTable("class_enrollments", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").references(() => classesTable.id).notNull(),
  studentId: integer("student_id").references(() => studentsTable.id).notNull(),
  status: text("status").notNull().default("active"),
  enrolledDate: text("enrolled_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("enroll_class_idx").on(table.classId),
  index("enroll_student_idx").on(table.studentId),
  unique("ce_class_student_uniq").on(table.classId, table.studentId),
]);

export const insertClassEnrollmentSchema = createInsertSchema(classEnrollmentsTable).omit({ id: true, createdAt: true });
export type InsertClassEnrollment = z.infer<typeof insertClassEnrollmentSchema>;
export type ClassEnrollment = typeof classEnrollmentsTable.$inferSelect;
