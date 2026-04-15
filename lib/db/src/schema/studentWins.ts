import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { staffTable } from "./staff";

export const studentWinsTable = pgTable("student_wins", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  staffId: integer("staff_id").references(() => staffTable.id),
  type: text("type").notNull().default("encouragement"),
  title: text("title").notNull(),
  message: text("message"),
  goalArea: text("goal_area"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("sw_student_created_idx").on(table.studentId, table.createdAt),
]);

export const insertStudentWinSchema = createInsertSchema(studentWinsTable).omit({ id: true, createdAt: true });
export type InsertStudentWin = z.infer<typeof insertStudentWinSchema>;
export type StudentWin = typeof studentWinsTable.$inferSelect;
