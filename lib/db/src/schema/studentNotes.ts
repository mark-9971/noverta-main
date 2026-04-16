import { pgTable, text, serial, timestamp, integer, boolean, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { staffTable } from "./staff";

export const studentNotesTable = pgTable("student_notes", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  authorStaffId: integer("author_staff_id").notNull().references(() => staffTable.id),
  content: text("content").notNull(),
  pinned: boolean("pinned").notNull().default(false),
  mentions: jsonb("mentions").$type<number[]>().default([]),
  parentNoteId: integer("parent_note_id"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("sn_student_idx").on(table.studentId),
  index("sn_author_idx").on(table.authorStaffId),
  index("sn_student_pinned_idx").on(table.studentId, table.pinned),
  index("sn_parent_note_idx").on(table.parentNoteId),
]);

export const insertStudentNoteSchema = createInsertSchema(studentNotesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export type InsertStudentNote = z.infer<typeof insertStudentNoteSchema>;
export type StudentNote = typeof studentNotesTable.$inferSelect;

export const studentNoteMentionsTable = pgTable("student_note_mentions", {
  id: serial("id").primaryKey(),
  noteId: integer("note_id").notNull().references(() => studentNotesTable.id, { onDelete: "cascade" }),
  mentionedStaffId: integer("mentioned_staff_id").notNull().references(() => staffTable.id),
  notified: boolean("notified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("snm_note_idx").on(table.noteId),
  index("snm_staff_idx").on(table.mentionedStaffId),
]);

export type StudentNoteMention = typeof studentNoteMentionsTable.$inferSelect;
