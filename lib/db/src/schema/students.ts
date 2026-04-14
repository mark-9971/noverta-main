import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { schoolsTable } from "./schools";
import { programsTable } from "./programs";
import { staffTable } from "./staff";

export const studentsTable = pgTable("students", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  externalId: text("external_id"),
  grade: text("grade"),
  placementType: text("placement_type"),
  status: text("status").notNull().default("active"),
  schoolId: integer("school_id").references(() => schoolsTable.id),
  programId: integer("program_id").references(() => programsTable.id),
  caseManagerId: integer("case_manager_id").references(() => staffTable.id),
  dateOfBirth: text("date_of_birth"),
  disabilityCategory: text("disability_category"),
  primaryLanguage: text("primary_language"),
  parentGuardianName: text("parent_guardian_name"),
  parentEmail: text("parent_email"),
  parentPhone: text("parent_phone"),
  notes: text("notes"),
  tags: text("tags"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("stu_school_status_idx").on(table.schoolId, table.status),
  index("stu_case_manager_idx").on(table.caseManagerId),
  index("stu_status_idx").on(table.status),
  index("stu_name_idx").on(table.lastName, table.firstName),
]);

export const insertStudentSchema = createInsertSchema(studentsTable).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type Student = typeof studentsTable.$inferSelect;
