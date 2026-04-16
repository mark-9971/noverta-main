import { pgTable, text, serial, timestamp, integer, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamMeetingsTable } from "./teamMeetings";
import { staffTable } from "./staff";

export const PREP_ITEM_TYPES = [
  "gather_progress_data",
  "draft_review_goals",
  "contact_parent",
  "confirm_attendance",
  "prepare_pwn",
  "set_location",
  "review_accommodations",
  "prepare_agenda",
] as const;

export const meetingPrepItemsTable = pgTable("meeting_prep_items", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => teamMeetingsTable.id, { onDelete: "cascade" }),
  itemType: text("item_type").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  required: boolean("required").notNull().default(true),
  autoDetected: boolean("auto_detected").notNull().default(false),
  manuallyUnchecked: boolean("manually_unchecked").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedByStaffId: integer("completed_by_staff_id").references(() => staffTable.id),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("mpi_meeting_idx").on(table.meetingId),
  uniqueIndex("mpi_meeting_item_type_unique").on(table.meetingId, table.itemType),
]);

export const insertMeetingPrepItemSchema = createInsertSchema(meetingPrepItemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMeetingPrepItem = z.infer<typeof insertMeetingPrepItemSchema>;
export type MeetingPrepItem = typeof meetingPrepItemsTable.$inferSelect;
