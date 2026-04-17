import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { documentsTable } from "./documents";

/**
 * Signature requests are public-by-token: the recipient receives a URL
 * containing a random token and uses it to view+sign a document. The token
 * is stored as a SHA-256 hash so a DB read does not yield working URLs.
 *
 * `token` is kept as a nullable column for backward compatibility with rows
 * issued before the hashing migration; new rows write `tokenHash` and leave
 * `token` NULL. Lookups go through `tokenHash` first; a fallback by `token`
 * remains for the legacy rows until they expire and are pruned.
 */
export const signatureRequestsTable = pgTable("signature_requests", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id),
  recipientName: text("recipient_name").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  // Legacy plaintext token — nullable for new hash-only rows.
  token: text("token"),
  // SHA-256 hex digest of the random URL token. Set on new rows.
  tokenHash: text("token_hash"),
  status: text("status").notNull().default("pending"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  signatureData: text("signature_data"),
  ipAddress: text("ip_address"),
  // Configurable expiration (was previously a hardcoded 30-day window in
  // application code). Nullable for legacy rows.
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  // Per-link view counter for monitoring and quota enforcement.
  viewCount: integer("view_count").notNull().default(0),
  lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
  lastViewedIp: text("last_viewed_ip"),
  // Soft revocation — set when a privileged user invalidates the link.
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedByUserId: text("revoked_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("sig_document_idx").on(table.documentId),
  index("sig_token_idx").on(table.token),
  index("sig_token_hash_idx").on(table.tokenHash),
  index("sig_status_idx").on(table.status),
  index("sig_recipient_email_idx").on(table.recipientEmail),
]);

export type SignatureRequest = typeof signatureRequestsTable.$inferSelect;
export type NewSignatureRequest = typeof signatureRequestsTable.$inferInsert;
