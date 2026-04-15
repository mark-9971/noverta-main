import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamMeetingsTable } from "./teamMeetings";
import { studentsTable } from "./students";

export const priorWrittenNoticesTable = pgTable("prior_written_notices", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").references(() => teamMeetingsTable.id),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  noticeType: text("notice_type").notNull(),
  actionProposed: text("action_proposed").notNull(),
  actionDescription: text("action_description"),
  reasonForAction: text("reason_for_action"),
  optionsConsidered: text("options_considered"),
  reasonOptionsRejected: text("reason_options_rejected"),
  evaluationInfo: text("evaluation_info"),
  otherFactors: text("other_factors"),
  issuedDate: text("issued_date"),
  issuedBy: integer("issued_by"),
  parentResponseDueDate: text("parent_response_due_date"),
  parentResponseReceived: text("parent_response_received"),
  parentResponseDate: text("parent_response_date"),
  status: text("status").notNull().default("draft"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("pwn_meeting_idx").on(table.meetingId),
  index("pwn_student_idx").on(table.studentId),
]);

export const insertPriorWrittenNoticeSchema = createInsertSchema(priorWrittenNoticesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPriorWrittenNotice = z.infer<typeof insertPriorWrittenNoticeSchema>;
export type PriorWrittenNotice = typeof priorWrittenNoticesTable.$inferSelect;
