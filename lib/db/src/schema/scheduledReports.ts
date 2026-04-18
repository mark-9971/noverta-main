import { pgTable, text, serial, timestamp, integer, jsonb, boolean, index } from "drizzle-orm/pg-core";

export const scheduledReportsTable = pgTable("scheduled_reports", {
  id: serial("id").primaryKey(),
  districtId: integer("district_id").notNull(),
  reportType: text("report_type").notNull(),
  frequency: text("frequency").notNull(),
  format: text("format").notNull().default("csv").$type<"csv" | "pdf">(),
  filters: jsonb("filters").$type<Record<string, unknown>>(),
  recipientEmails: jsonb("recipient_emails").$type<string[]>().notNull(),
  createdBy: text("created_by").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("sched_report_district_idx").on(table.districtId),
  index("sched_report_next_run_idx").on(table.nextRunAt),
]);

export type ScheduledReport = typeof scheduledReportsTable.$inferSelect;
