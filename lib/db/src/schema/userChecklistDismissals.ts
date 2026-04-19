import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Per-user dismissal of the district onboarding checklist widget.
 *
 * Previously the dismissal flag was stored on `onboarding_progress` keyed by
 * districtId — meaning one admin's "hide it" hid the checklist for everyone
 * else in the district too. Dismissal is a personal preference, so it lives
 * here keyed by the Clerk userId.
 */
export const userChecklistDismissalsTable = pgTable("user_checklist_dismissals", {
  userId: text("user_id").primaryKey(),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }).notNull().defaultNow(),
});
