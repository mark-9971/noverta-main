import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { programTargetsTable } from "./programTargets";
import { staffTable } from "./staff";

export const programTargetAnnotationsTable = pgTable("program_target_annotations", {
  id: serial("id").primaryKey(),
  programTargetId: integer("program_target_id").notNull().references(() => programTargetsTable.id, { onDelete: "cascade" }),
  annotationDate: text("annotation_date").notNull(),
  label: text("label").notNull(),
  createdBy: integer("created_by").references(() => staffTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("pta_target_date_idx").on(table.programTargetId, table.annotationDate),
]);

export const insertProgramTargetAnnotationSchema = createInsertSchema(programTargetAnnotationsTable).omit({ id: true, createdAt: true });
export type InsertProgramTargetAnnotation = z.infer<typeof insertProgramTargetAnnotationSchema>;
export type ProgramTargetAnnotation = typeof programTargetAnnotationsTable.$inferSelect;
