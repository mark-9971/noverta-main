import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";
import { staffTable } from "./staff";

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  uploadedByStaffId: integer("uploaded_by_staff_id").references(() => staffTable.id),
  uploadedByUserId: text("uploaded_by_user_id").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  fileSize: integer("file_size").notNull(),
  objectPath: text("object_path").notNull(),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("doc_student_idx").on(table.studentId),
  index("doc_category_idx").on(table.category),
  index("doc_status_idx").on(table.status),
  index("doc_uploaded_by_idx").on(table.uploadedByUserId),
]);

export type Document = typeof documentsTable.$inferSelect;
export type NewDocument = typeof documentsTable.$inferInsert;
