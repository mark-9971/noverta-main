import { pgTable, text, serial, timestamp, integer, boolean, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { staffTable } from "./staff";
import { schoolsTable } from "./schools";

export const evaluationReferralsTable = pgTable("evaluation_referrals", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  referralDate: text("referral_date").notNull(),
  referralSource: text("referral_source").notNull(),
  referralSourceName: text("referral_source_name"),
  reason: text("reason").notNull(),
  areasOfConcern: jsonb("areas_of_concern").$type<string[]>().default([]),
  parentNotifiedDate: text("parent_notified_date"),
  consentRequestedDate: text("consent_requested_date"),
  consentReceivedDate: text("consent_received_date"),
  consentStatus: text("consent_status").notNull().default("pending"),
  evaluationDeadline: text("evaluation_deadline"),
  assignedEvaluatorId: integer("assigned_evaluator_id").references(() => staffTable.id),
  schoolId: integer("school_id").references(() => schoolsTable.id),
  status: text("status").notNull().default("open"),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("eval_ref_student_idx").on(table.studentId),
  index("eval_ref_status_idx").on(table.status),
  index("eval_ref_deadline_idx").on(table.evaluationDeadline),
]);

export const insertEvaluationReferralSchema = createInsertSchema(evaluationReferralsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEvaluationReferral = z.infer<typeof insertEvaluationReferralSchema>;
export type EvaluationReferral = typeof evaluationReferralsTable.$inferSelect;
