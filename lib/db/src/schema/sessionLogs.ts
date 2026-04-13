import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { serviceRequirementsTable } from "./serviceRequirements";
import { serviceTypesTable } from "./serviceTypes";
import { staffTable } from "./staff";
import { missedReasonsTable } from "./missedReasons";

export const sessionLogsTable = pgTable("session_logs", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  serviceRequirementId: integer("service_requirement_id").references(() => serviceRequirementsTable.id),
  serviceTypeId: integer("service_type_id").references(() => serviceTypesTable.id),
  staffId: integer("staff_id").references(() => staffTable.id),
  sessionDate: text("session_date").notNull(), // ISO date string YYYY-MM-DD
  startTime: text("start_time"), // HH:MM
  endTime: text("end_time"), // HH:MM
  durationMinutes: integer("duration_minutes").notNull(),
  location: text("location"),
  deliveryMode: text("delivery_mode"), // in_person | telehealth | push_in | pull_out
  status: text("status").notNull().default("completed"), // completed | missed | partial | makeup
  missedReasonId: integer("missed_reason_id").references(() => missedReasonsTable.id),
  isMakeup: boolean("is_makeup").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSessionLogSchema = createInsertSchema(sessionLogsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSessionLog = z.infer<typeof insertSessionLogSchema>;
export type SessionLog = typeof sessionLogsTable.$inferSelect;
