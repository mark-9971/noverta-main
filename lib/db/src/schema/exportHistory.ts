import { pgTable, text, serial, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";

export const exportHistoryTable = pgTable("export_history", {
  id: serial("id").primaryKey(),
  reportType: text("report_type").notNull(),
  reportLabel: text("report_label").notNull(),
  exportedBy: text("exported_by").notNull(),
  schoolId: integer("school_id"),
  parameters: jsonb("parameters"),
  recordCount: integer("record_count").notNull().default(0),
  warningCount: integer("warning_count").notNull().default(0),
  fileName: text("file_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("export_hist_type_idx").on(table.reportType),
  index("export_hist_user_idx").on(table.exportedBy),
  index("export_hist_created_idx").on(table.createdAt),
]);

export type ExportHistory = typeof exportHistoryTable.$inferSelect;
