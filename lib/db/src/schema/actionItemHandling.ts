/**
 * Phase 1E — Shared operational handling state for action items.
 *
 * Replaces the per-browser localStorage in `useHandlingState` with a
 * district-scoped, server-of-truth row-per-item table that lets every
 * authorized user in a district see the same in-progress state and
 * ownership for an at-risk action item.
 *
 * Item identity is a stable string produced by `itemIdFor*` helpers in
 * `artifacts/trellis/src/lib/action-recommendations.ts`:
 *   - alert:<id>
 *   - risk:<studentId>:<requirementId>
 *   - deadline:<studentId>:<eventType>
 *   - service-gap:<studentId>:<requirementId>
 *   - student:<studentId>:<kind>
 *
 * Uniqueness is `(district_id, item_id)` so the same string can appear
 * harmlessly across districts (multi-tenant) without collision.
 *
 * This is intentionally a thin "shared sticky note" — not a routing or
 * notification engine. See Phase 1E spec §I for the explicit non-goals.
 */
import {
  pgTable, text, serial, timestamp, integer, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { districtsTable } from "./districts";

export const actionItemHandlingTable = pgTable("action_item_handling", {
  id: serial("id").primaryKey(),
  districtId: integer("district_id").notNull().references(() => districtsTable.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull(),
  /** Current state — see HandlingState union in action-recommendations.ts. */
  state: text("state").notNull(),
  /** Optional free-text note (e.g. "asked Maria to confirm by Friday"). */
  note: text("note"),
  /** Recommended owner role from the recommendation engine at write time
   *  — frozen onto the row so a later read can render "handed off to
   *  scheduler" without re-running the engine. */
  recommendedOwnerRole: text("recommended_owner_role"),
  /** When the row represents an explicit handoff, the role it went to.
   *  May equal recommendedOwnerRole; may differ if the operator chose
   *  someone else. */
  assignedToRole: text("assigned_to_role"),
  /** Clerk user id of the person it was handed off to, when known. */
  assignedToUserId: text("assigned_to_user_id"),
  /** Identity of the user who last changed the state. */
  updatedByUserId: text("updated_by_user_id").notNull(),
  updatedByName: text("updated_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("aih_district_item_uniq").on(t.districtId, t.itemId),
  index("aih_district_state_idx").on(t.districtId, t.state),
]);

export const actionItemHandlingEventsTable = pgTable("action_item_handling_events", {
  id: serial("id").primaryKey(),
  districtId: integer("district_id").notNull().references(() => districtsTable.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull(),
  /** State the row was in immediately before the change. NULL if this
   *  was the very first write for the item. */
  fromState: text("from_state"),
  toState: text("to_state").notNull(),
  note: text("note"),
  changedByUserId: text("changed_by_user_id").notNull(),
  changedByName: text("changed_by_name"),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("aih_events_district_item_idx").on(t.districtId, t.itemId),
  index("aih_events_changed_at_idx").on(t.changedAt),
]);

export const insertActionItemHandlingSchema = createInsertSchema(actionItemHandlingTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertActionItemHandling = z.infer<typeof insertActionItemHandlingSchema>;
export type ActionItemHandling = typeof actionItemHandlingTable.$inferSelect;

export type ActionItemHandlingEvent = typeof actionItemHandlingEventsTable.$inferSelect;
