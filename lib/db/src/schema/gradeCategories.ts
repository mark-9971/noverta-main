import { pgTable, serial, integer, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { classesTable } from "./classes";

export const gradeCategoriesTable = pgTable("grade_categories", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").references(() => classesTable.id).notNull(),
  name: text("name").notNull(),
  weight: numeric("weight", { precision: 5, scale: 2 }).notNull().default("1.00"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGradeCategorySchema = createInsertSchema(gradeCategoriesTable).omit({ id: true, createdAt: true });
export type InsertGradeCategory = z.infer<typeof insertGradeCategorySchema>;
export type GradeCategory = typeof gradeCategoriesTable.$inferSelect;
