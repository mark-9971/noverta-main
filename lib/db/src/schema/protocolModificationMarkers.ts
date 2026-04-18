import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { behaviorTargetsTable } from "./behaviorTargets";
import { programTargetsTable } from "./programTargets";

export const MODIFICATION_MARKER_TYPES = [
  "prompt_hierarchy",
  "operational_definition",
  "reinforcement_schedule",
  "treatment_protocol",
  "custom",
] as const;

export type ModificationMarkerType = typeof MODIFICATION_MARKER_TYPES[number];

export const protocolModificationMarkersTable = pgTable("protocol_modification_markers", {
  id: serial("id").primaryKey(),
  behaviorTargetId: integer("behavior_target_id").references(() => behaviorTargetsTable.id, { onDelete: "cascade" }),
  programTargetId: integer("program_target_id").references(() => programTargetsTable.id, { onDelete: "cascade" }),
  markerDate: text("marker_date").notNull(),
  markerType: text("marker_type").notNull().default("custom"),
  label: text("label").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("pmm_bt_date_idx").on(table.behaviorTargetId, table.markerDate),
  index("pmm_pt_date_idx").on(table.programTargetId, table.markerDate),
]);

export type ProtocolModificationMarker = typeof protocolModificationMarkersTable.$inferSelect;
export type InsertProtocolModificationMarker = typeof protocolModificationMarkersTable.$inferInsert;
