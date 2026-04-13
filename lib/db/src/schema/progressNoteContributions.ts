import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { progressReportsTable } from "./progressReports";
import { staffTable } from "./staff";
import { iepGoalsTable } from "./iepGoals";

export const progressNoteContributionsTable = pgTable("progress_note_contributions", {
  id: serial("id").primaryKey(),
  progressReportId: integer("progress_report_id").notNull().references(() => progressReportsTable.id),
  staffId: integer("staff_id").notNull().references(() => staffTable.id),
  iepGoalId: integer("iep_goal_id").notNull().references(() => iepGoalsTable.id),
  narrative: text("narrative").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("pnc_report_idx").on(table.progressReportId),
  index("pnc_staff_idx").on(table.staffId),
  index("pnc_goal_idx").on(table.iepGoalId),
]);
