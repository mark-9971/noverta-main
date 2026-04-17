import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Processed Stripe webhook events — used as an idempotency table so that
 * duplicate or replayed `event.id` values from Stripe never cause
 * double-processing of side effects (e.g. incrementing
 * `paymentFailureCount`, re-sending decline emails, re-anchoring the grace
 * window).
 *
 * Insert flow: at the top of every billing dispatch we attempt
 *
 *   INSERT INTO processed_stripe_events (event_id, event_type) VALUES (...)
 *
 * If the insert fails on the unique key (duplicate event), we log and skip
 * the rest of the dispatch — Stripe still gets a 2xx ack so it stops
 * retrying that event.
 *
 * Row TTL: rows are kept indefinitely for now. Volume is small (a few
 * billing events per district per month) and operational debugging benefits
 * from being able to grep for an event id forever. Add a TTL if the table
 * grows past ~1M rows.
 */
export const processedStripeEventsTable = pgTable("processed_stripe_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
});
