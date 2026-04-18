import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { staffTable } from "./staff";

export const progressReportsTable = pgTable("progress_reports", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  reportingPeriod: text("reporting_period").notNull(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  preparedBy: integer("prepared_by").references(() => staffTable.id),
  status: text("status").notNull().default("draft"),
  overallSummary: text("overall_summary"),
  serviceDeliverySummary: text("service_delivery_summary"),
  recommendations: text("recommendations"),
  parentNotes: text("parent_notes"),
  goalProgress: jsonb("goal_progress").$type<GoalProgressEntry[]>().default([]),
  studentDob: text("student_dob"),
  studentGrade: text("student_grade"),
  schoolName: text("school_name"),
  districtName: text("district_name"),
  iepStartDate: text("iep_start_date"),
  iepEndDate: text("iep_end_date"),
  serviceBreakdown: jsonb("service_breakdown").$type<ServiceDeliveryBreakdown[]>().default([]),
  parentNotificationDate: text("parent_notification_date"),
  parentNotificationMethod: text("parent_notification_method"),
  nextReportDate: text("next_report_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export interface GoalProgressEntry {
  iepGoalId: number;
  goalArea: string;
  goalNumber: number;
  annualGoal: string;
  baseline: string | null;
  targetCriterion: string | null;
  currentPerformance: string;
  progressRating: string;
  progressCode: string;
  dataPoints: number;
  trendDirection: string;
  promptLevel?: string | null;
  percentCorrect?: number | null;
  behaviorValue?: number | null;
  behaviorGoal?: number | null;
  narrative: string;
  benchmarks?: string | null;
  measurementMethod?: string | null;
  serviceArea?: string | null;
  /** Name of the linked behavior target — populated for behavior-linked goals */
  behaviorTargetName?: string | null;
  /** Measurement type of the behavior target (frequency / duration / latency / interval) */
  behaviorMeasurementType?: string | null;
  /** Direction the behavior is being tracked (increase / decrease) */
  behaviorTargetDirection?: string | null;
  /** Approximate standard deviation of observations in the period — null if < 4 data points */
  behaviorVariability?: number | null;
  /** Number of distinct sessions with behavior data in the period */
  behaviorSessionCount?: number | null;
}

export interface ServiceDeliveryBreakdown {
  serviceType: string;
  requiredMinutes: number;
  deliveredMinutes: number;
  missedSessions: number;
  completedSessions: number;
  compliancePercent: number;
}

export const insertProgressReportSchema = createInsertSchema(progressReportsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProgressReport = z.infer<typeof insertProgressReportSchema>;
export type ProgressReport = typeof progressReportsTable.$inferSelect;
