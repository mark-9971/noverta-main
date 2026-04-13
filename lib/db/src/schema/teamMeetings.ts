import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";

export const teamMeetingsTable = pgTable("team_meetings", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  meetingType: text("meeting_type").notNull(),
  scheduledDate: text("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time"),
  location: text("location"),
  status: text("status").notNull().default("scheduled"),
  notes: text("notes"),
  attendees: jsonb("attendees").$type<{ name: string; role: string; present?: boolean }[]>(),
  consentStatus: text("consent_status"),
  noticeSentDate: text("notice_sent_date"),
  outcome: text("outcome"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTeamMeetingSchema = createInsertSchema(teamMeetingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTeamMeeting = z.infer<typeof insertTeamMeetingSchema>;
export type TeamMeeting = typeof teamMeetingsTable.$inferSelect;
