import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { documentsTable } from "./documents";

export const signatureRequestsTable = pgTable("signature_requests", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id),
  recipientName: text("recipient_name").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  token: text("token").notNull().unique(),
  status: text("status").notNull().default("pending"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  signatureData: text("signature_data"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("sig_document_idx").on(table.documentId),
  index("sig_token_idx").on(table.token),
  index("sig_status_idx").on(table.status),
  index("sig_recipient_email_idx").on(table.recipientEmail),
]);

export type SignatureRequest = typeof signatureRequestsTable.$inferSelect;
export type NewSignatureRequest = typeof signatureRequestsTable.$inferInsert;
