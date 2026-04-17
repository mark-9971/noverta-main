import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";

export const errorLogsTable = pgTable("error_log", {
  id: serial("id").primaryKey(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  httpStatus: integer("http_status").notNull(),
  path: text("path").notNull(),
  message: text("message").notNull(),
}, (table) => [
  index("error_log_occurred_at_idx").on(table.occurredAt),
  index("error_log_http_status_idx").on(table.httpStatus),
]);

export type ErrorLog = typeof errorLogsTable.$inferSelect;
export type NewErrorLog = typeof errorLogsTable.$inferInsert;
