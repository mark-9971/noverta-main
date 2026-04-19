import { pgTable, serial, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";
import { districtsTable } from "./districts";

export const generatedDocumentsTable = pgTable("generated_documents", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").references(() => studentsTable.id),
  districtId: integer("district_id").references(() => districtsTable.id),
  type: text("type").notNull(), // 'incident_report' | 'progress_report' | 'iep_draft' | 'executive_summary'
  status: text("status").notNull().default("draft"), // 'draft' | 'finalized' | 'archived'
  title: text("title").notNull(),
  htmlSnapshot: text("html_snapshot"), // rendered HTML stored for re-print without regenerating
  linkedRecordId: integer("linked_record_id"), // incident id / progress report id / iep doc id
  createdByName: text("created_by_name"),
  /** Whether this document has been shared with the guardian portal */
  guardianVisible: boolean("guardian_visible").notNull().default(false),
  /** When the document was shared with guardians */
  sharedAt: timestamp("shared_at", { withTimezone: true }),
  /** Name of the staff who shared the document */
  sharedByName: text("shared_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("gen_doc_student_idx").on(t.studentId),
  index("gen_doc_district_idx").on(t.districtId),
  index("gen_doc_type_idx").on(t.type),
  index("gen_doc_linked_idx").on(t.linkedRecordId),
  index("gen_doc_guardian_visible_idx").on(t.guardianVisible),
]);

export type GeneratedDocument = typeof generatedDocumentsTable.$inferSelect;
export type NewGeneratedDocument = typeof generatedDocumentsTable.$inferInsert;
