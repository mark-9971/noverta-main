import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";

export const iepAccommodationsTable = pgTable("iep_accommodations", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  iepDocumentId: integer("iep_document_id"),
  category: text("category").notNull().default("instruction"),
  description: text("description").notNull(),
  setting: text("setting"),
  frequency: text("frequency"),
  provider: text("provider"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertIepAccommodationSchema = createInsertSchema(iepAccommodationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIepAccommodation = z.infer<typeof insertIepAccommodationSchema>;
export type IepAccommodation = typeof iepAccommodationsTable.$inferSelect;
