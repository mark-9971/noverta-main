import { pgTable, text, serial, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";

export const preferenceAssessmentsTable = pgTable("preference_assessments", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
  assessmentType: text("assessment_type").notNull(), // 'mswo' | 'paired' | 'free_operant' | 'single_stimulus'
  conductedDate: text("conducted_date").notNull(), // YYYY-MM-DD
  conductedByName: text("conducted_by_name"),
  items: jsonb("items").notNull().default([]), // [{name, rank, score, notes}]
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PreferenceAssessment = typeof preferenceAssessmentsTable.$inferSelect;
export type NewPreferenceAssessment = typeof preferenceAssessmentsTable.$inferInsert;
