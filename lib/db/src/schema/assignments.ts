import { pgTable, serial, integer, text, timestamp, numeric, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { classesTable } from "./classes";
import { gradeCategoriesTable } from "./gradeCategories";

export const assignmentsTable = pgTable("assignments", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").references(() => classesTable.id).notNull(),
  categoryId: integer("category_id").references(() => gradeCategoriesTable.id),
  title: text("title").notNull(),
  description: text("description"),
  instructions: text("instructions"),
  assignmentType: text("assignment_type").notNull().default("homework"),
  dueDate: text("due_date"),
  assignedDate: text("assigned_date"),
  pointsPossible: numeric("points_possible", { precision: 7, scale: 2 }).notNull().default("100"),
  published: boolean("published").notNull().default(true),
  allowLateSubmission: boolean("allow_late_submission").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("asgn_class_idx").on(table.classId),
  index("asgn_due_idx").on(table.dueDate),
  index("asgn_category_idx").on(table.categoryId),
]);

export const insertAssignmentSchema = createInsertSchema(assignmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAssignment = z.infer<typeof insertAssignmentSchema>;
export type Assignment = typeof assignmentsTable.$inferSelect;
