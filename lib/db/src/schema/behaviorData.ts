import { pgTable, text, serial, timestamp, integer, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dataSessionsTable } from "./dataSessions";
import { behaviorTargetsTable } from "./behaviorTargets";

export const behaviorDataTable = pgTable("behavior_data", {
  id: serial("id").primaryKey(),
  dataSessionId: integer("data_session_id").notNull().references(() => dataSessionsTable.id, { onDelete: "cascade" }),
  behaviorTargetId: integer("behavior_target_id").notNull().references(() => behaviorTargetsTable.id),
  value: numeric("value").notNull(),
  intervalCount: integer("interval_count"),
  intervalsWith: integer("intervals_with"),
  hourBlock: text("hour_block"),
  notes: text("notes"),
  ioaSessionId: integer("ioa_session_id"),
  observerNumber: integer("observer_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("bd_session_idx").on(table.dataSessionId),
  index("bd_target_idx").on(table.behaviorTargetId),
  index("bd_ioa_session_idx").on(table.ioaSessionId),
]);

export const insertBehaviorDataSchema = createInsertSchema(behaviorDataTable).omit({ id: true, createdAt: true });
export type InsertBehaviorData = z.infer<typeof insertBehaviorDataSchema>;
export type BehaviorData = typeof behaviorDataTable.$inferSelect;
