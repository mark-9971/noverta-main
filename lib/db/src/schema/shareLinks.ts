import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";
import { staffTable } from "./staff";
import { districtsTable } from "./districts";

/**
 * Parent-facing progress share links.
 *
 * Tokens are issued by district staff and consumed by parents/guardians via
 * an unauthenticated GET. The capability lives entirely in the unguessable
 * token (we store only sha256(token)). Rows are now retained past expiry so
 * that audit/forensics still have a record of who created the link and when
 * it was used; the consumption route enforces expiry/revocation/quota.
 */
export const shareLinksTable = pgTable("share_links", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  /** Snapshot of the student's district at issuance time — used for fast
   *  per-district admin views and to scope revocation/rotation calls. */
  districtId: integer("district_id").references(() => districtsTable.id),
  createdByUserId: text("created_by_user_id"),
  createdByStaffId: integer("created_by_staff_id").references(() => staffTable.id),
  summary: text("summary").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  /** Total number of successful retrievals so far. */
  viewCount: integer("view_count").notNull().default(0),
  /** When set, the link is rejected once viewCount reaches this value.
   *  Null means "unlimited within TTL". A value of 1 implements one-time view. */
  maxViews: integer("max_views"),
  lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
  lastViewedIp: text("last_viewed_ip"),
  /** Set by an explicit revoke or by token rotation; takes precedence over TTL. */
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedByUserId: text("revoked_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("sl_token_hash_idx").on(table.tokenHash),
  index("sl_student_idx").on(table.studentId),
  index("sl_district_idx").on(table.districtId),
  index("sl_expires_idx").on(table.expiresAt),
]);

export type ShareLink = typeof shareLinksTable.$inferSelect;

/**
 * Per-access audit log for share links. We log every consumption attempt
 * (including denials) so an operator can answer "who looked at this link
 * and when, and what was the outcome".
 */
export const shareLinkAccessLogTable = pgTable("share_link_access_log", {
  id: serial("id").primaryKey(),
  /** Nullable so we can also log attempts against tokens that don't exist
   *  (useful for spotting enumeration). */
  shareLinkId: integer("share_link_id").references(() => shareLinksTable.id, { onDelete: "set null" }),
  /** First 8 chars of sha256(token). Lets an operator correlate logs to a
   *  specific token without storing the token or its full hash twice. */
  tokenHashPrefix: text("token_hash_prefix").notNull(),
  accessedAt: timestamp("accessed_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  /** One of: "granted", "expired", "revoked", "exhausted", "rate_limited", "not_found". */
  outcome: text("outcome").notNull(),
  httpStatus: integer("http_status").notNull(),
}, (table) => [
  index("slal_link_idx").on(table.shareLinkId),
  index("slal_outcome_idx").on(table.outcome, table.accessedAt),
  index("slal_prefix_idx").on(table.tokenHashPrefix),
]);

export type ShareLinkAccessLog = typeof shareLinkAccessLogTable.$inferSelect;
