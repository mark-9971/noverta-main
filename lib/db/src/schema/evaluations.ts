import { pgTable, text, serial, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { staffTable } from "./staff";
import { evaluationReferralsTable } from "./evaluationReferrals";

export interface EvaluationTeamMember {
  staffId?: number;
  name: string;
  role: string;
  evaluationArea?: string;
}

export interface EvaluationArea {
  area: string;
  assignedTo?: string;
  status: string;
  completedDate?: string;
  summary?: string;
}

export const evaluationsTable = pgTable("evaluations", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  referralId: integer("referral_id").references(() => evaluationReferralsTable.id),
  evaluationType: text("evaluation_type").notNull().default("initial"),
  evaluationAreas: jsonb("evaluation_areas").$type<EvaluationArea[]>().default([]),
  teamMembers: jsonb("team_members").$type<EvaluationTeamMember[]>().default([]),
  leadEvaluatorId: integer("lead_evaluator_id").references(() => staffTable.id),
  startDate: text("start_date"),
  dueDate: text("due_date"),
  completionDate: text("completion_date"),
  meetingDate: text("meeting_date"),
  reportSummary: text("report_summary"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("eval_student_idx").on(table.studentId),
  index("eval_status_idx").on(table.status),
  index("eval_due_date_idx").on(table.dueDate),
  index("eval_type_idx").on(table.evaluationType),
]);

export const insertEvaluationSchema = createInsertSchema(evaluationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEvaluation = z.infer<typeof insertEvaluationSchema>;
export type Evaluation = typeof evaluationsTable.$inferSelect;
