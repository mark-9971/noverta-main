import { pgTable, text, serial, timestamp, integer, index, boolean } from "drizzle-orm/pg-core";
import { behaviorInterventionPlansTable } from "./behaviorInterventionPlans";
import { staffTable } from "./staff";

export const bipImplementersTable = pgTable("bip_implementers", {
  id: serial("id").primaryKey(),
  bipId: integer("bip_id").notNull().references(() => behaviorInterventionPlansTable.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staffTable.id),
  assignedById: integer("assigned_by_id").references(() => staffTable.id),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("bip_implementers_bip_idx").on(table.bipId),
  index("bip_implementers_staff_idx").on(table.staffId),
]);

export type BipImplementer = typeof bipImplementersTable.$inferSelect;
