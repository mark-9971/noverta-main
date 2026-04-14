import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { behaviorTargetsTable } from "./behaviorTargets";

export const phaseChangesTable = pgTable("phase_changes", {
  id: serial("id").primaryKey(),
  behaviorTargetId: integer("behavior_target_id").notNull().references(() => behaviorTargetsTable.id, { onDelete: "cascade" }),
  changeDate: text("change_date").notNull(),
  label: text("label").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("pc_target_date_idx").on(table.behaviorTargetId, table.changeDate),
]);

export const insertPhaseChangeSchema = createInsertSchema(phaseChangesTable).omit({ id: true, createdAt: true });
export type InsertPhaseChange = z.infer<typeof insertPhaseChangeSchema>;
export type PhaseChange = typeof phaseChangesTable.$inferSelect;
