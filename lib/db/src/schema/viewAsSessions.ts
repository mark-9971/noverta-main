import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Audited "view-as" / impersonation sessions for Noverta platform admins.
 *
 * A platform admin starts a session via /api/support/view-as/start, which
 * returns a one-time opaque token (only the sha256 of the token is stored).
 * Subsequent requests carrying X-View-As-Token are rewritten by requireAuth
 * to act AS the target user (role, district, staff/student/guardian scope),
 * with the original admin id preserved on the request for audit tagging.
 *
 * Sessions are hard-capped at 30 minutes (enforced by ends_at). Manual end,
 * automatic expiration, and "superseded by a new session for the same admin"
 * all set ended_at + end_reason so audit trail is complete.
 */
export const viewAsSessionsTable = pgTable("view_as_sessions", {
  id: serial("id").primaryKey(),

  // Clerk userId of the platform admin who started the session.
  adminUserId: text("admin_user_id").notNull(),
  // Required free-text justification (min length enforced at the route).
  reason: text("reason").notNull(),

  // Snapshot of the target user. We snapshot at session-start so middleware
  // does not need to re-resolve via Clerk on every authenticated request.
  targetUserId: text("target_user_id").notNull(),
  targetRole: text("target_role").notNull(),
  targetDisplayName: text("target_display_name").notNull(),
  targetDistrictId: integer("target_district_id"),
  targetStaffId: integer("target_staff_id"),
  targetStudentId: integer("target_student_id"),
  targetGuardianId: integer("target_guardian_id"),

  // sha256(token) — the bare token is returned exactly once at /start.
  tokenHash: text("token_hash").notNull().unique(),

  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  endReason: text("end_reason"), // "manual" | "expired" | "superseded"
}, (t) => [
  index("view_as_admin_user_idx").on(t.adminUserId),
  index("view_as_token_idx").on(t.tokenHash),
  index("view_as_active_idx").on(t.adminUserId, t.endedAt),
]);
