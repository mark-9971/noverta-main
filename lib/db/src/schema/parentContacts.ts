import { pgTable, text, serial, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { alertsTable } from "./alerts";

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
  notificationRequired: boolean("notification_required").notNull().default(false),
  relatedAlertId: integer("related_alert_id").references(() => alertsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("pc_student_idx").on(table.studentId),
  index("pc_follow_up_idx").on(table.followUpNeeded, table.followUpDate),
  index("pc_notification_idx").on(table.notificationRequired),
  index("pc_alert_idx").on(table.relatedAlertId),
]);

export const insertParentContactSchema = createInsertSchema(parentContactsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertParentContact = z.infer<typeof insertParentContactSchema>;
export type ParentContact = typeof parentContactsTable.$inferSelect;
