import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { staffTable } from "./staff";
import { schoolYearsTable } from "./schoolYears";

export const complianceEventsTable = pgTable("compliance_events", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  schoolYearId: integer("school_year_id").references(() => schoolYearsTable.id),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  dueDate: text("due_date").notNull(),
  completedDate: text("completed_date"),
  status: text("status").notNull().default("upcoming"),
  notes: text("notes"),
  resolvedAt: text("resolved_at"),
  resolvedBy: integer("resolved_by").references(() => staffTable.id),
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("ce_student_idx").on(table.studentId),
  index("ce_due_date_idx").on(table.dueDate),
  index("ce_status_idx").on(table.status),
  index("ce_school_year_idx").on(table.schoolYearId),
]);

export const insertComplianceEventSchema = createInsertSchema(complianceEventsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertComplianceEvent = z.infer<typeof insertComplianceEventSchema>;
export type ComplianceEvent = typeof complianceEventsTable.$inferSelect;
