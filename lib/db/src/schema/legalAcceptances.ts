import { pgTable, serial, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

export const legalAcceptancesTable = pgTable("legal_acceptances", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  userEmail: text("user_email"),
  documentType: text("document_type").notNull(),
  documentVersion: text("document_version").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (table) => [
  index("legal_acc_user_idx").on(table.userId),
  index("legal_acc_type_version_idx").on(table.documentType, table.documentVersion),
  index("legal_acc_user_type_idx").on(table.userId, table.documentType),
  uniqueIndex("legal_acc_user_doc_ver_uniq").on(table.userId, table.documentType, table.documentVersion),
]);

export type LegalAcceptance = typeof legalAcceptancesTable.$inferSelect;
