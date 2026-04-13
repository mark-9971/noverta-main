import { pgTable, text, serial, timestamp, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
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

  precedingActivity: text("preceding_activity"),
  triggerDescription: text("trigger_description"),
  behaviorDescription: text("behavior_description").notNull(),
  deescalationAttempts: text("deescalation_attempts"),
  alternativesAttempted: text("alternatives_attempted"),
  justification: text("justification"),

  restraintType: text("restraint_type"),
  restraintDescription: text("restraint_description"),
  primaryStaffId: integer("primary_staff_id").references(() => staffTable.id),
  additionalStaffIds: jsonb("additional_staff_ids").$type<number[]>(),
  observerStaffIds: jsonb("observer_staff_ids").$type<number[]>(),

  principalNotifiedName: text("principal_notified_name"),
  principalNotifiedAt: text("principal_notified_at"),
  continuedOver20Min: boolean("continued_over_20_min").notNull().default(false),
  over20MinApproverName: text("over_20_min_approver_name"),

  calmingStrategiesUsed: text("calming_strategies_used"),
  studentStateAfter: text("student_state_after"),

  studentInjury: boolean("student_injury").notNull().default(false),
  studentInjuryDescription: text("student_injury_description"),
  staffInjury: boolean("staff_injury").notNull().default(false),
  staffInjuryDescription: text("staff_injury_description"),
  medicalAttentionRequired: boolean("medical_attention_required").notNull().default(false),
  medicalDetails: text("medical_details"),

  parentVerbalNotification: boolean("parent_verbal_notification").notNull().default(false),
  parentVerbalNotificationAt: text("parent_verbal_notification_at"),
  parentNotified: boolean("parent_notified").notNull().default(false),
  parentNotifiedAt: text("parent_notified_at"),
  parentNotifiedBy: integer("parent_notified_by").references(() => staffTable.id),
  parentNotificationMethod: text("parent_notification_method"),
  writtenReportSent: boolean("written_report_sent").notNull().default(false),
  writtenReportSentAt: text("written_report_sent_at"),
  writtenReportSentMethod: text("written_report_sent_method"),
  parentCommentOpportunityGiven: boolean("parent_comment_opportunity_given").notNull().default(false),
  parentComment: text("parent_comment"),
  studentComment: text("student_comment"),

  deseReportRequired: boolean("dese_report_required").notNull().default(false),
  deseReportSentAt: text("dese_report_sent_at"),
  thirtyDayLogSentToDese: boolean("thirty_day_log_sent_to_dese").notNull().default(false),

  studentMoved: boolean("student_moved").notNull().default(false),
  studentMovedTo: text("student_moved_to"),
  roomCleared: boolean("room_cleared").notNull().default(false),
  bodyPosition: text("body_position"),
  proceduresUsed: jsonb("procedures_used").$type<string[]>(),
  deescalationStrategies: jsonb("deescalation_strategies").$type<string[]>(),
  antecedentCategory: text("antecedent_category"),
  emergencyServicesCalled: boolean("emergency_services_called").notNull().default(false),
  emergencyServicesCalledAt: text("emergency_services_called_at"),
  debriefConducted: boolean("debrief_conducted").notNull().default(false),
  debriefDate: text("debrief_date"),
  debriefNotes: text("debrief_notes"),
  debriefParticipants: jsonb("debrief_participants").$type<number[]>(),
  bipInPlace: boolean("bip_in_place").notNull().default(false),
  physicalEscortOnly: boolean("physical_escort_only").notNull().default(false),
  studentReturnedToActivity: text("student_returned_to_activity"),
  timeToCalm: integer("time_to_calm"),
  terminologyFramework: text("terminology_framework").notNull().default("standard"),

  reportingStaffSignature: text("reporting_staff_signature"),
  reportingStaffSignedAt: text("reporting_staff_signed_at"),
  adminSignature: text("admin_signature"),
  adminSignedAt: text("admin_signed_at"),

  adminReviewedBy: integer("admin_reviewed_by").references(() => staffTable.id),
  adminReviewedAt: text("admin_reviewed_at"),
  adminReviewNotes: text("admin_review_notes"),
  status: text("status").notNull().default("pending_review"),
  followUpPlan: text("follow_up_plan"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("ri_student_idx").on(table.studentId),
  index("ri_date_idx").on(table.incidentDate),
  index("ri_status_idx").on(table.status),
  index("ri_type_idx").on(table.incidentType),
]);

export const incidentSignaturesTable = pgTable("incident_signatures", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").references(() => restraintIncidentsTable.id, { onDelete: "cascade" }).notNull(),
  staffId: integer("staff_id").references(() => staffTable.id).notNull(),
  role: text("role").notNull(),
  signatureName: text("signature_name"),
  signedAt: text("signed_at"),
  requestedAt: text("requested_at").notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("is_incident_idx").on(table.incidentId),
  index("is_staff_idx").on(table.staffId),
  index("is_status_idx").on(table.status),
]);

export const insertRestraintIncidentSchema = createInsertSchema(restraintIncidentsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertRestraintIncident = z.infer<typeof insertRestraintIncidentSchema>;
export type RestraintIncident = typeof restraintIncidentsTable.$inferSelect;
