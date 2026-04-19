import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { behaviorTargetsTable } from "./behaviorTargets";
import { staffTable } from "./staff";

export const behaviorTargetAnnotationsTable = pgTable("behavior_target_annotations", {
  id: serial("id").primaryKey(),
  behaviorTargetId: integer("behavior_target_id").notNull().references(() => behaviorTargetsTable.id, { onDelete: "cascade" }),
  annotationDate: text("annotation_date").notNull(),
  label: text("label").notNull(),
  createdBy: integer("created_by").references(() => staffTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("bta_target_date_idx").on(table.behaviorTargetId, table.annotationDate),
]);

export const insertBehaviorTargetAnnotationSchema = createInsertSchema(behaviorTargetAnnotationsTable).omit({ id: true, createdAt: true });
export type InsertBehaviorTargetAnnotation = z.infer<typeof insertBehaviorTargetAnnotationSchema>;
export type BehaviorTargetAnnotation = typeof behaviorTargetAnnotationsTable.$inferSelect;
