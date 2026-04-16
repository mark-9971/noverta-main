import { pgTable, serial, text, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";

export const documentVersionsTable = pgTable("document_versions", {
  id: serial("id").primaryKey(),
  documentType: text("document_type").notNull(),
  documentId: integer("document_id").notNull(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  districtId: integer("district_id").notNull(),
  versionNumber: integer("version_number").notNull().default(1),
  title: text("title").notNull(),
  changeDescription: text("change_description"),
  snapshotData: text("snapshot_data"),
  authorUserId: text("author_user_id").notNull(),
  authorName: text("author_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("doc_ver_unique_version_idx").on(table.districtId, table.documentType, table.documentId, table.versionNumber),
  index("doc_ver_doc_type_id_idx").on(table.documentType, table.documentId),
  index("doc_ver_student_idx").on(table.studentId),
  index("doc_ver_district_idx").on(table.districtId),
  index("doc_ver_created_idx").on(table.createdAt),
]);

export type DocumentVersion = typeof documentVersionsTable.$inferSelect;
export type NewDocumentVersion = typeof documentVersionsTable.$inferInsert;
