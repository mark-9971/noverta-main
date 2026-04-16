import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { behaviorInterventionPlansTable } from "./behaviorInterventionPlans";
import { staffTable } from "./staff";

export const bipStatusHistoryTable = pgTable("bip_status_history", {
  id: serial("id").primaryKey(),
  bipId: integer("bip_id").notNull().references(() => behaviorInterventionPlansTable.id, { onDelete: "cascade" }),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  changedById: integer("changed_by_id").references(() => staffTable.id),
  notes: text("notes"),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("bip_status_history_bip_idx").on(table.bipId),
  index("bip_status_history_changed_at_idx").on(table.changedAt),
]);

export type BipStatusHistory = typeof bipStatusHistoryTable.$inferSelect;
