import { pgTable, text, serial, timestamp, integer, index, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { schoolsTable } from "./schools";
import { staffTable } from "./staff";

export const classesTable = pgTable("classes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  courseCode: text("course_code"),
  gradeLevel: text("grade_level"),
  period: integer("period"),
  room: text("room"),
  semester: text("semester").notNull().default("2025-2026"),
  teacherId: integer("teacher_id").references(() => staffTable.id).notNull(),
  schoolId: integer("school_id").references(() => schoolsTable.id),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("cls_teacher_idx").on(table.teacherId),
  index("cls_school_idx").on(table.schoolId),
  index("cls_subject_idx").on(table.subject),
]);

export const insertClassSchema = createInsertSchema(classesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClass = z.infer<typeof insertClassSchema>;
export type Class = typeof classesTable.$inferSelect;
