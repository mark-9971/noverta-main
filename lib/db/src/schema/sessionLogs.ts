import { pgTable, text, serial, timestamp, integer, boolean, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { serviceRequirementsTable } from "./serviceRequirements";
import { serviceTypesTable } from "./serviceTypes";
import { staffTable } from "./staff";
import { missedReasonsTable } from "./missedReasons";
import { compensatoryObligationsTable } from "./compensatoryObligations";
import { schoolYearsTable } from "./schoolYears";

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
  makeupForId: integer("makeup_for_id").references((): AnyPgColumn => sessionLogsTable.id),
  isCompensatory: boolean("is_compensatory").notNull().default(false),
  compensatoryObligationId: integer("compensatory_obligation_id").references(() => compensatoryObligationsTable.id),
  notes: text("notes"),
  schoolYearId: integer("school_year_id").references(() => schoolYearsTable.id),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  // Auditability: who/when last edited this row. The full edit history lives
  // in `audit_logs`; these columns are a cheap at-a-glance signal so list/edit
  // UIs don't have to fetch the audit trail just to show "last edited by".
  lastEditedByUserId: text("last_edited_by_user_id"),
  lastEditedAt: timestamp("last_edited_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("sl_student_date_idx").on(table.studentId, table.sessionDate),
  index("sl_svc_req_date_idx").on(table.serviceRequirementId, table.sessionDate),
  index("sl_staff_date_idx").on(table.staffId, table.sessionDate),
  index("sl_status_idx").on(table.status),
  index("sl_date_idx").on(table.sessionDate),
  index("sl_makeup_for_idx").on(table.makeupForId),
]);

export const insertSessionLogSchema = createInsertSchema(sessionLogsTable).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertSessionLog = z.infer<typeof insertSessionLogSchema>;
export type SessionLog = typeof sessionLogsTable.$inferSelect;
