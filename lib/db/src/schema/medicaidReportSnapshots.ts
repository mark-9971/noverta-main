import { pgTable, text, serial, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";

export const medicaidReportSnapshotsTable = pgTable("medicaid_report_snapshots", {
  id: serial("id").primaryKey(),
  districtId: integer("district_id").notNull(),
  reportType: text("report_type").notNull(),
  label: text("label"),
  dateFrom: text("date_from"),
  dateTo: text("date_to"),
  savedByClerkId: text("saved_by_clerk_id").notNull(),
  savedByName: text("saved_by_name").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("mrs_district_idx").on(table.districtId),
  index("mrs_report_type_idx").on(table.reportType),
]);

export type MedicaidReportSnapshot = typeof medicaidReportSnapshotsTable.$inferSelect;
