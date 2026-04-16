import { pgTable, serial, text, integer, boolean, timestamp, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { staffTable } from "./staff";
import { guardiansTable } from "./guardians";

export const MESSAGE_CATEGORIES = ["general", "prior_written_notice", "iep_meeting_invitation", "progress_update", "conference_request"] as const;
export type MessageCategory = typeof MESSAGE_CATEGORIES[number];

export const CONFERENCE_STATUSES = ["proposed", "accepted", "declined", "cancelled"] as const;
export type ConferenceStatus = typeof CONFERENCE_STATUSES[number];

export const messageTemplatesTable = pgTable("message_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default("general"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  placeholders: jsonb("placeholders").default([]),
  isSystem: boolean("is_system").notNull().default(false),
  districtId: integer("district_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("msg_template_category_idx").on(table.category),
]);

export const parentMessagesTable = pgTable("parent_messages", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
  senderType: text("sender_type").notNull().default("staff"),
  senderStaffId: integer("sender_staff_id").references(() => staffTable.id),
  senderGuardianId: integer("sender_guardian_id").references(() => guardiansTable.id),
  recipientGuardianId: integer("recipient_guardian_id").references(() => guardiansTable.id),
  recipientStaffId: integer("recipient_staff_id").references(() => staffTable.id),
  threadId: integer("thread_id"),
  templateId: integer("template_id").references(() => messageTemplatesTable.id),
  category: text("category").notNull().default("general"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  isArchived: boolean("is_archived").notNull().default(false),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("parent_msg_student_idx").on(table.studentId),
  index("parent_msg_thread_idx").on(table.threadId),
  index("parent_msg_sender_staff_idx").on(table.senderStaffId),
  index("parent_msg_recipient_guardian_idx").on(table.recipientGuardianId),
  index("parent_msg_recipient_staff_idx").on(table.recipientStaffId),
  index("parent_msg_category_idx").on(table.category),
]);

export const conferenceRequestsTable = pgTable("conference_requests", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staffTable.id),
  guardianId: integer("guardian_id").notNull().references(() => guardiansTable.id),
  messageId: integer("message_id").references(() => parentMessagesTable.id),
  title: text("title").notNull(),
  description: text("description"),
  proposedTimes: jsonb("proposed_times").notNull().default([]),
  selectedTime: timestamp("selected_time", { withTimezone: true }),
  status: text("status").notNull().default("proposed"),
  location: text("location"),
  guardianNotes: text("guardian_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("conf_req_student_idx").on(table.studentId),
  index("conf_req_staff_idx").on(table.staffId),
  index("conf_req_guardian_idx").on(table.guardianId),
  index("conf_req_status_idx").on(table.status),
]);

export const insertMessageTemplateSchema = createInsertSchema(messageTemplatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMessageTemplate = z.infer<typeof insertMessageTemplateSchema>;
export type MessageTemplate = typeof messageTemplatesTable.$inferSelect;

export const insertParentMessageSchema = createInsertSchema(parentMessagesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertParentMessage = z.infer<typeof insertParentMessageSchema>;
export type ParentMessage = typeof parentMessagesTable.$inferSelect;

export const insertConferenceRequestSchema = createInsertSchema(conferenceRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertConferenceRequest = z.infer<typeof insertConferenceRequestSchema>;
export type ConferenceRequest = typeof conferenceRequestsTable.$inferSelect;
