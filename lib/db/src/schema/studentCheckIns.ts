import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { iepGoalsTable } from "./iepGoals";

export const studentCheckInsTable = pgTable("student_check_ins", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  goalId: integer("goal_id").references(() => iepGoalsTable.id),
  checkInType: text("check_in_type").notNull().default("mood"),
  value: integer("value").notNull(),
  label: text("label"),
  note: text("note"),
  checkInDate: text("check_in_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("sci_student_date_idx").on(table.studentId, table.checkInDate),
  index("sci_student_goal_idx").on(table.studentId, table.goalId),
]);

export const insertStudentCheckInSchema = createInsertSchema(studentCheckInsTable).omit({ id: true, createdAt: true });
export type InsertStudentCheckIn = z.infer<typeof insertStudentCheckInSchema>;
export type StudentCheckIn = typeof studentCheckInsTable.$inferSelect;
