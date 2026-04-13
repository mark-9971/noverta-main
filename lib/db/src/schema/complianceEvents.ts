import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";

export const complianceEventsTable = pgTable("compliance_events", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  dueDate: text("due_date").notNull(),
  completedDate: text("completed_date"),
  status: text("status").notNull().default("upcoming"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertComplianceEventSchema = createInsertSchema(complianceEventsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertComplianceEvent = z.infer<typeof insertComplianceEventSchema>;
export type ComplianceEvent = typeof complianceEventsTable.$inferSelect;
