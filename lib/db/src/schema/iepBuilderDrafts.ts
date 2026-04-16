import { pgTable, text, serial, timestamp, integer, jsonb, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { staffTable } from "./staff";

export const iepBuilderDraftsTable = pgTable("iep_builder_drafts", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  staffId: integer("staff_id").notNull().references(() => staffTable.id),
  wizardStep: integer("wizard_step").notNull().default(1),
  formData: jsonb("form_data").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("iep_draft_student_idx").on(table.studentId),
  index("iep_draft_staff_idx").on(table.staffId),
  unique("iep_draft_student_staff_uniq").on(table.studentId, table.staffId),
]);

export const insertIepBuilderDraftSchema = createInsertSchema(iepBuilderDraftsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIepBuilderDraft = z.infer<typeof insertIepBuilderDraftSchema>;
export type IepBuilderDraft = typeof iepBuilderDraftsTable.$inferSelect;
