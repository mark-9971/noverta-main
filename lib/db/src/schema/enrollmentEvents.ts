import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { staffTable } from "./staff";
import { schoolsTable } from "./schools";
import { programsTable } from "./programs";

export const ENROLLMENT_EVENT_TYPES = [
  "enrolled",
  "reactivated",
  "withdrawn",
  "transferred",
  "graduated",
  "suspended",
  "leave_of_absence",
  "note",
] as const;

export type EnrollmentEventType = typeof ENROLLMENT_EVENT_TYPES[number];

export const enrollmentEventsTable = pgTable("enrollment_events", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  eventType: text("event_type").notNull(),
  eventDate: text("event_date").notNull(),
  reasonCode: text("reason_code"),
  reason: text("reason"),
  notes: text("notes"),
  fromSchoolId: integer("from_school_id").references(() => schoolsTable.id),
  toSchoolId: integer("to_school_id").references(() => schoolsTable.id),
  fromProgramId: integer("from_program_id").references(() => programsTable.id),
  toProgramId: integer("to_program_id").references(() => programsTable.id),
  performedById: integer("performed_by_id").references(() => staffTable.id),
  recordedById: integer("recorded_by_id").references(() => staffTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("ee_student_idx").on(table.studentId),
  index("ee_event_date_idx").on(table.studentId, table.eventDate),
  index("ee_event_type_idx").on(table.eventType),
]);

export const insertEnrollmentEventSchema = createInsertSchema(enrollmentEventsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEnrollmentEvent = z.infer<typeof insertEnrollmentEventSchema>;
export type EnrollmentEvent = typeof enrollmentEventsTable.$inferSelect;
