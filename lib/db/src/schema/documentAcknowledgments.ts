import { pgTable, serial, integer, timestamp, text, index, unique } from "drizzle-orm/pg-core";
import { generatedDocumentsTable } from "./generatedDocuments";
import { guardiansTable } from "./guardians";

export const documentAcknowledgmentsTable = pgTable("document_acknowledgments", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => generatedDocumentsTable.id, { onDelete: "cascade" }),
  guardianId: integer("guardian_id").notNull().references(() => guardiansTable.id, { onDelete: "cascade" }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
}, (t) => [
  index("doc_ack_document_idx").on(t.documentId),
  index("doc_ack_guardian_idx").on(t.guardianId),
  unique("doc_ack_unique").on(t.documentId, t.guardianId),
]);

export type DocumentAcknowledgment = typeof documentAcknowledgmentsTable.$inferSelect;
