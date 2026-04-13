import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";

export const parentContactsTable = pgTable("parent_contacts", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  contactType: text("contact_type").notNull(),
  contactDate: text("contact_date").notNull(),
  contactMethod: text("contact_method").notNull(),
  subject: text("subject").notNull(),
  notes: text("notes"),
  outcome: text("outcome"),
  followUpNeeded: text("follow_up_needed"),
  followUpDate: text("follow_up_date"),
  contactedBy: text("contacted_by"),
  parentName: text("parent_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertParentContactSchema = createInsertSchema(parentContactsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertParentContact = z.infer<typeof insertParentContactSchema>;
export type ParentContact = typeof parentContactsTable.$inferSelect;
