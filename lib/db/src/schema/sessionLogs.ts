import { pgTable, text, serial, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
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
  sessionDate: text("session_date").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  durationMinutes: integer("duration_minutes").notNull(),
  location: text("location"),
  deliveryMode: text("delivery_mode"),
  status: text("status").notNull().default("completed"),
  missedReasonId: integer("missed_reason_id").references(() => missedReasonsTable.id),
  isMakeup: boolean("is_makeup").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("sl_student_date_idx").on(table.studentId, table.sessionDate),
  index("sl_svc_req_date_idx").on(table.serviceRequirementId, table.sessionDate),
  index("sl_staff_date_idx").on(table.staffId, table.sessionDate),
  index("sl_status_idx").on(table.status),
  index("sl_date_idx").on(table.sessionDate),
]);

export const insertSessionLogSchema = createInsertSchema(sessionLogsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSessionLog = z.infer<typeof insertSessionLogSchema>;
export type SessionLog = typeof sessionLogsTable.$inferSelect;
