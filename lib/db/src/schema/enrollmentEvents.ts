import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { staffTable } from "./staff";

export const enrollmentEventsTable = pgTable("enrollment_events", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  eventType: text("event_type").notNull(),
  eventDate: text("event_date").notNull(),
  reason: text("reason"),
  notes: text("notes"),
  performedById: integer("performed_by_id").references(() => staffTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("ee_student_idx").on(table.studentId),
  index("ee_event_date_idx").on(table.studentId, table.eventDate),
]);

export const insertEnrollmentEventSchema = createInsertSchema(enrollmentEventsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEnrollmentEvent = z.infer<typeof insertEnrollmentEventSchema>;
export type EnrollmentEvent = typeof enrollmentEventsTable.$inferSelect;
