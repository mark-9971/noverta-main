/**
 * Task #951 — Shared Action Center dismiss/snooze.
 *
 * Sibling to `action_item_handling`. Where the handling table tracks the
 * work-in-progress lifecycle of an item (under_review, handed_off,
 * recovery_scheduled, resolved), this table tracks the orthogonal
 * "hide this from the queue, optionally until X" intent.
 *
 * Item identity is the same canonical string produced by `itemIdFor*`
 * helpers in `artifacts/trellis/src/lib/action-recommendations.ts`.
 *
 * - `state = 'dismissed'`: dismissed_until may be null (indefinite) or a
 *   timestamptz in the future (default ~7 days). When dismissed_until is
 *   in the past the row is treated as inactive by the API and is a
 *   candidate for cleanup.
 * - `state = 'snoozed'`: dismissed_until is required (the snooze
 *   expiration). When in the past the item reappears for everyone in
 *   the district.
 *
 * Uniqueness is `(district_id, item_id)` so the same string can appear
 * harmlessly across districts. A secondary index on
 * `(district_id, dismissed_until)` supports the active-filter query.
 *
 * A snapshot of the rendered title/detail is persisted on the row so
 * the hidden-items footer can still render labels for items that have
 * since dropped out of the live queue.
 */
import {
  pgTable, text, serial, timestamp, integer, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { districtsTable } from "./districts";

export const actionItemDismissalsTable = pgTable("action_item_dismissals", {
  id: serial("id").primaryKey(),
  districtId: integer("district_id").notNull().references(() => districtsTable.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull(),
  /** 'dismissed' | 'snoozed' */
  state: text("state").notNull(),
  /** When the hide expires. Null ⇒ indefinite (only meaningful when state='dismissed'). */
  dismissedUntil: timestamp("dismissed_until", { withTimezone: true }),
  /** Snapshot of the rendered title at hide time (so the footer can still label it). */
  snapshotTitle: text("snapshot_title"),
  /** Snapshot of the rendered detail at hide time. */
  snapshotDetail: text("snapshot_detail"),
  /** Free-text label for the snooze duration (e.g. "1 day", "3 days"). */
  durationLabel: text("duration_label"),
  updatedByUserId: text("updated_by_user_id").notNull(),
  updatedByName: text("updated_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("aid_district_item_uniq").on(t.districtId, t.itemId),
  index("aid_district_until_idx").on(t.districtId, t.dismissedUntil),
]);

export const insertActionItemDismissalSchema = createInsertSchema(actionItemDismissalsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertActionItemDismissal = z.infer<typeof insertActionItemDismissalSchema>;
export type ActionItemDismissal = typeof actionItemDismissalsTable.$inferSelect;
