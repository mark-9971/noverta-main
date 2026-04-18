import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { staffTable } from "./staff";
import { scheduleBlocksTable } from "./scheduleBlocks";

export const scheduleChangeRequestsTable = pgTable("schedule_change_requests", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffTable.id),
  scheduleBlockId: integer("schedule_block_id").references(() => scheduleBlocksTable.id),
  requestType: text("request_type").notNull(),
  notes: text("notes"),
  requestedDate: text("requested_date"),
  requestedStartTime: text("requested_start_time"),
  requestedEndTime: text("requested_end_time"),
  status: text("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  reviewedByStaffId: integer("reviewed_by_staff_id").references(() => staffTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("scr_staff_idx").on(table.staffId),
  index("scr_status_idx").on(table.status),
]);

export type ScheduleChangeRequest = typeof scheduleChangeRequestsTable.$inferSelect;
