import { pgTable, serial, integer, text, timestamp, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { assignmentsTable } from "./assignments";
import { studentsTable } from "./students";

export const submissionsTable = pgTable("submissions", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").references(() => assignmentsTable.id).notNull(),
  studentId: integer("student_id").references(() => studentsTable.id).notNull(),
  content: text("content"),
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  status: text("status").notNull().default("not_submitted"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  pointsEarned: numeric("points_earned", { precision: 7, scale: 2 }),
  letterGrade: text("letter_grade"),
  feedback: text("feedback"),
  gradedAt: timestamp("graded_at", { withTimezone: true }),
  gradedBy: integer("graded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("sub_assignment_idx").on(table.assignmentId),
  index("sub_student_idx").on(table.studentId),
  index("sub_status_idx").on(table.status),
]);

export const insertSubmissionSchema = createInsertSchema(submissionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type Submission = typeof submissionsTable.$inferSelect;
