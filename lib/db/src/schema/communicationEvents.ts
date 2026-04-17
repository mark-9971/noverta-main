import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Communication events — the audit + delivery-state record for every parent /
 * guardian / staff email Trellis sends.
 *
 * Delivery-state lifecycle (see also `EmailStatus` in api-server/src/lib/email.ts):
 *
 *   queued       — DB row created, not yet handed to provider
 *     ↓
 *   accepted     — provider (Resend) returned 200 + email_id; in-flight
 *     ↓
 *   delivered    — provider webhook (`email.delivered`) confirmed inbox
 *
 *   bounced      — provider webhook (`email.bounced`)         — terminal
 *   complained   — provider webhook (`email.complained`)       — terminal
 *   failed       — provider rejected the request OR webhook    — terminal
 *                  (`email.failed`) OR retries exhausted
 *   not_configured — RESEND_API_KEY not set; never attempted   — terminal
 *
 * Legacy rows may carry status='sent' from before the lifecycle split; the
 * api-server treats `sent` as an alias for `accepted` for read-side display.
 *
 * Timestamps are append-only — once a row reaches `delivered` we never
 * downgrade it back to `accepted` even if a late webhook arrives.
 */
export const communicationEventsTable = pgTable("communication_events", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  guardianId: integer("guardian_id"),
  staffId: integer("staff_id"),
  channel: text("channel").notNull().default("email"),
  status: text("status").notNull().default("queued"),
  type: text("type").notNull(),
  subject: text("subject").notNull(),
  bodyText: text("body_text"),
  toEmail: text("to_email"),
  toName: text("to_name"),
  fromEmail: text("from_email"),
  providerMessageId: text("provider_message_id"),
  // sentAt: kept for backward compatibility — set at the same moment as
  // acceptedAt by the new code path, so existing reports keep working.
  sentAt: timestamp("sent_at", { withTimezone: true }),
  // acceptedAt: provider returned 200 with an email_id (in-flight, not yet
  // confirmed in the recipient inbox).
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  bouncedAt: timestamp("bounced_at", { withTimezone: true }),
  complainedAt: timestamp("complained_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  failedReason: text("failed_reason"),
  // Last provider webhook event for debugging delivery issues without
  // grepping logs. Helpful when delivery is slow or stuck in `accepted`.
  lastWebhookEventType: text("last_webhook_event_type"),
  lastWebhookAt: timestamp("last_webhook_at", { withTimezone: true }),
  linkedIncidentId: integer("linked_incident_id"),
  linkedAlertId: integer("linked_alert_id"),
  linkedContactId: integer("linked_contact_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
