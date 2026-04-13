import { pgTable, text, serial, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { staffTable } from "./staff";

export const restraintIncidentsTable = pgTable("restraint_incidents", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").references(() => studentsTable.id).notNull(),
  incidentDate: text("incident_date").notNull(),
  incidentTime: text("incident_time").notNull(),
  endTime: text("end_time"),
  durationMinutes: integer("duration_minutes"),
  incidentType: text("incident_type").notNull(),
  location: text("location"),
  triggerDescription: text("trigger_description"),
  behaviorDescription: text("behavior_description").notNull(),
  deescalationAttempts: text("deescalation_attempts"),
  restraintType: text("restraint_type"),
  restraintDescription: text("restraint_description"),
  primaryStaffId: integer("primary_staff_id").references(() => staffTable.id),
  additionalStaffIds: jsonb("additional_staff_ids").$type<number[]>(),
  studentInjury: boolean("student_injury").notNull().default(false),
  studentInjuryDescription: text("student_injury_description"),
  staffInjury: boolean("staff_injury").notNull().default(false),
  staffInjuryDescription: text("staff_injury_description"),
  medicalAttentionRequired: boolean("medical_attention_required").notNull().default(false),
  medicalDetails: text("medical_details"),
  parentNotified: boolean("parent_notified").notNull().default(false),
  parentNotifiedAt: text("parent_notified_at"),
  parentNotifiedBy: integer("parent_notified_by").references(() => staffTable.id),
  parentNotificationMethod: text("parent_notification_method"),
  writtenReportSent: boolean("written_report_sent").notNull().default(false),
  writtenReportSentAt: text("written_report_sent_at"),
  adminReviewedBy: integer("admin_reviewed_by").references(() => staffTable.id),
  adminReviewedAt: text("admin_reviewed_at"),
  adminReviewNotes: text("admin_review_notes"),
  status: text("status").notNull().default("pending_review"),
  followUpPlan: text("follow_up_plan"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRestraintIncidentSchema = createInsertSchema(restraintIncidentsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertRestraintIncident = z.infer<typeof insertRestraintIncidentSchema>;
export type RestraintIncident = typeof restraintIncidentsTable.$inferSelect;
