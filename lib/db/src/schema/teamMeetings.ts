import { pgTable, text, serial, timestamp, integer, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";

export const teamMeetingsTable = pgTable("team_meetings", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  meetingType: text("meeting_type").notNull(),
  scheduledDate: text("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time"),
  duration: integer("duration"),
  location: text("location"),
  meetingFormat: text("meeting_format"),
  status: text("status").notNull().default("scheduled"),
  agendaItems: jsonb("agenda_items").$type<string[]>(),
  attendees: jsonb("attendees").$type<{ name: string; role: string; present?: boolean }[]>(),
  notes: text("notes"),
  actionItems: jsonb("action_items").$type<{ id: string; description: string; assignee: string; dueDate: string | null; status: "open" | "completed" }[]>(),
  outcome: text("outcome"),
  followUpDate: text("follow_up_date"),
  minutesFinalized: boolean("minutes_finalized").default(false),
  consentStatus: text("consent_status"),
  noticeSentDate: text("notice_sent_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("tm_student_idx").on(table.studentId),
  index("tm_scheduled_date_idx").on(table.scheduledDate),
]);

export const insertTeamMeetingSchema = createInsertSchema(teamMeetingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTeamMeeting = z.infer<typeof insertTeamMeetingSchema>;
export type TeamMeeting = typeof teamMeetingsTable.$inferSelect;
