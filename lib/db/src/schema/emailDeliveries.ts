import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { signatureRequestsTable } from "./signatureRequests";
import { shareLinksTable } from "./shareLinks";
import { teamMeetingsTable } from "./teamMeetings";

export const EMAIL_DELIVERY_MESSAGE_TYPES = [
  "signature_request",
  "share_link",
  "iep_meeting_invitation",
] as const;

export type EmailDeliveryMessageType = (typeof EMAIL_DELIVERY_MESSAGE_TYPES)[number];

export const EMAIL_DELIVERY_STATUSES = [
  "queued",
  "accepted",
  "delivered",
  "bounced",
  "complained",
  "failed",
  "not_configured",
] as const;

export type EmailDeliveryStatus = (typeof EMAIL_DELIVERY_STATUSES)[number];

/**
 * Tracks outbound emails sent for parent-facing actions:
 * signature requests, progress share links, and IEP meeting invitations.
 *
 * These are distinct from `communication_events` which handles incident
 * notifications and missed-service alerts; this table is dedicated to the
 * three document-workflow email types so UI rows can show a delivery badge
 * without coupling to the broader comms infrastructure.
 *
 * Status lifecycle:
 *   queued → accepted (Resend API ack)
 *          → delivered (email.delivered webhook)
 *          → bounced   (email.bounced webhook)
 *          → complained (email.complained webhook)
 *          → failed    (API error or email.failed webhook)
 *   not_configured — RESEND_API_KEY absent; email intentionally skipped
 */
export const emailDeliveriesTable = pgTable("email_deliveries", {
  id: serial("id").primaryKey(),
  messageType: text("message_type").notNull().$type<EmailDeliveryMessageType>(),
  recipientEmail: text("recipient_email").notNull(),
  recipientName: text("recipient_name"),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("queued").$type<EmailDeliveryStatus>(),
  providerMessageId: text("provider_message_id"),
  signatureRequestId: integer("signature_request_id").references(() => signatureRequestsTable.id, { onDelete: "set null" }),
  shareLinkId: integer("share_link_id").references(() => shareLinksTable.id, { onDelete: "set null" }),
  iepMeetingId: integer("iep_meeting_id").references(() => teamMeetingsTable.id, { onDelete: "set null" }),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  failedReason: text("failed_reason"),
  lastWebhookEventType: text("last_webhook_event_type"),
  lastWebhookAt: timestamp("last_webhook_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("ed_provider_msg_idx").on(table.providerMessageId),
  index("ed_sig_req_idx").on(table.signatureRequestId),
  index("ed_share_link_idx").on(table.shareLinkId),
  index("ed_iep_meeting_idx").on(table.iepMeetingId),
  index("ed_status_idx").on(table.status),
  index("ed_attempted_idx").on(table.attemptedAt),
]);

export type EmailDelivery = typeof emailDeliveriesTable.$inferSelect;
export type NewEmailDelivery = typeof emailDeliveriesTable.$inferInsert;
