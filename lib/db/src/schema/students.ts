import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
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
  placementType: text("placement_type"), // gen_ed | sub_separate | mixed | resource
  status: text("status").notNull().default("active"), // active | inactive
  schoolId: integer("school_id").references(() => schoolsTable.id),
  programId: integer("program_id").references(() => programsTable.id),
  caseManagerId: integer("case_manager_id").references(() => staffTable.id),
  notes: text("notes"),
  tags: text("tags"), // comma-separated tags
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStudentSchema = createInsertSchema(studentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type Student = typeof studentsTable.$inferSelect;
