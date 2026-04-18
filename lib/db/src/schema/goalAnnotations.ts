import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { iepGoalsTable } from "./iepGoals";
import { staffTable } from "./staff";

export const goalAnnotationsTable = pgTable("goal_annotations", {
  id: serial("id").primaryKey(),
  goalId: integer("goal_id").notNull().references(() => iepGoalsTable.id, { onDelete: "cascade" }),
  annotationDate: text("annotation_date").notNull(),
  label: text("label").notNull(),
  createdBy: integer("created_by").references(() => staffTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("ga_goal_date_idx").on(table.goalId, table.annotationDate),
]);

export const insertGoalAnnotationSchema = createInsertSchema(goalAnnotationsTable).omit({ id: true, createdAt: true });
export type InsertGoalAnnotation = z.infer<typeof insertGoalAnnotationSchema>;
export type GoalAnnotation = typeof goalAnnotationsTable.$inferSelect;
