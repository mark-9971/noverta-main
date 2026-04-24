import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Audited Noverta-support read-only sessions.
 *
 * A user with the `trellis_support` role can open a session pinned to one
 * district at a time. While the session is open (and not expired) every
 * authenticated request is scoped to that district AND every audit log row
 * carries the session id so a district admin can later see exactly which
 * Noverta employee viewed which surface and why.
 *
 * Sessions are time-boxed at 60 minutes. Manual end, automatic expiry, and
 * "superseded by a new session for the same support user" all set ended_at +
 * end_reason so the audit trail is complete.
 *
 * Unlike the platform-admin view-as flow, there is no token: the caller's
 * Clerk userId itself is the lookup key. There is at most one open session
 * per support user at any time (enforced by openSupportSession()).
 */
export const supportSessionsTable = pgTable("support_sessions", {
  id: serial("id").primaryKey(),
  // Clerk userId of the trellis_support user who opened the session.
  supportUserId: text("support_user_id").notNull(),
  // Snapshot of the support user's display name for the district-admin view.
  supportDisplayName: text("support_display_name").notNull(),
  // The single district whose data is read-accessible during this session.
  districtId: integer("district_id").notNull(),
  // Required free-text justification (min length enforced at the route).
  reason: text("reason").notNull(),

  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  endReason: text("end_reason"), // "manual" | "expired" | "superseded"
}, (t) => [
  index("support_sessions_user_idx").on(t.supportUserId),
  index("support_sessions_district_idx").on(t.districtId),
  index("support_sessions_active_idx").on(t.supportUserId, t.endedAt),
]);
