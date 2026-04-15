import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamMeetingsTable } from "./teamMeetings";
import { studentsTable } from "./students";

export const meetingConsentRecordsTable = pgTable("meeting_consent_records", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => teamMeetingsTable.id),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  consentType: text("consent_type").notNull(),
  decision: text("decision").notNull(),
  decisionDate: text("decision_date"),
  respondentName: text("respondent_name"),
  respondentRelationship: text("respondent_relationship"),
  notes: text("notes"),
  followUpRequired: text("follow_up_required"),
  followUpDate: text("follow_up_date"),
  followUpCompleted: text("follow_up_completed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("mcr_meeting_idx").on(table.meetingId),
  index("mcr_student_idx").on(table.studentId),
]);

export const insertMeetingConsentRecordSchema = createInsertSchema(meetingConsentRecordsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMeetingConsentRecord = z.infer<typeof insertMeetingConsentRecordSchema>;
export type MeetingConsentRecord = typeof meetingConsentRecordsTable.$inferSelect;
