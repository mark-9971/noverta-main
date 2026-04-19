import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { staffTable } from "./staff";

export const iepBuilderDraftCommentsTable = pgTable("iep_builder_draft_comments", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  wizardStep: integer("wizard_step").notNull(),
  staffId: integer("staff_id").references(() => staffTable.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedByStaffId: integer("resolved_by_staff_id").references(() => staffTable.id),
}, (table) => [
  index("iep_draft_comment_student_idx").on(table.studentId),
  index("iep_draft_comment_student_step_idx").on(table.studentId, table.wizardStep),
]);

export const insertIepBuilderDraftCommentSchema = createInsertSchema(iepBuilderDraftCommentsTable).omit({ id: true, createdAt: true });
export type InsertIepBuilderDraftComment = z.infer<typeof insertIepBuilderDraftCommentSchema>;
export type IepBuilderDraftComment = typeof iepBuilderDraftCommentsTable.$inferSelect;
