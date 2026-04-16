import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";

export const generatedDocumentsTable = pgTable("generated_documents", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  type: text("type").notNull(), // 'incident_report' | 'progress_report' | 'iep_draft'
  status: text("status").notNull().default("draft"), // 'draft' | 'finalized' | 'archived'
  title: text("title").notNull(),
  htmlSnapshot: text("html_snapshot"), // rendered HTML stored for re-print without regenerating
  linkedRecordId: integer("linked_record_id"), // incident id / progress report id / iep doc id
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("gen_doc_student_idx").on(t.studentId),
  index("gen_doc_type_idx").on(t.type),
  index("gen_doc_linked_idx").on(t.linkedRecordId),
]);

export type GeneratedDocument = typeof generatedDocumentsTable.$inferSelect;
export type NewGeneratedDocument = typeof generatedDocumentsTable.$inferInsert;
