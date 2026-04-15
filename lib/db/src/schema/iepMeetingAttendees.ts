import { pgTable, text, serial, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamMeetingsTable } from "./teamMeetings";
import { staffTable } from "./staff";

export const iepMeetingAttendeesTable = pgTable("iep_meeting_attendees", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => teamMeetingsTable.id),
  staffId: integer("staff_id").references(() => staffTable.id),
  name: text("name").notNull(),
  role: text("role").notNull(),
  email: text("email"),
  isRequired: boolean("is_required").notNull().default(true),
  rsvpStatus: text("rsvp_status").notNull().default("pending"),
  attended: boolean("attended"),
  submittedWrittenInput: boolean("submitted_written_input").notNull().default(false),
  writtenInputNotes: text("written_input_notes"),
  arrivalTime: text("arrival_time"),
  departureTime: text("departure_time"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("ima_meeting_idx").on(table.meetingId),
  index("ima_staff_idx").on(table.staffId),
]);

export const insertIepMeetingAttendeeSchema = createInsertSchema(iepMeetingAttendeesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIepMeetingAttendee = z.infer<typeof insertIepMeetingAttendeeSchema>;
export type IepMeetingAttendee = typeof iepMeetingAttendeesTable.$inferSelect;
