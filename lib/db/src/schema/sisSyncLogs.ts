import { pgTable, text, serial, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { sisConnectionsTable } from "./sisConnections";

export const sisSyncLogsTable = pgTable("sis_sync_logs", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id").references(() => sisConnectionsTable.id).notNull(),
  syncType: text("sync_type").notNull(),
  status: text("status").notNull().default("running"),
  studentsAdded: integer("students_added").notNull().default(0),
  studentsUpdated: integer("students_updated").notNull().default(0),
  studentsArchived: integer("students_archived").notNull().default(0),
  staffAdded: integer("staff_added").notNull().default(0),
  staffUpdated: integer("staff_updated").notNull().default(0),
  totalRecords: integer("total_records").notNull().default(0),
  errors: jsonb("errors").$type<Array<{ field?: string; message: string }>>().notNull().default([]),
  warnings: jsonb("warnings").$type<Array<{ field?: string; message: string }>>().notNull().default([]),
  triggeredBy: text("triggered_by"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  index("sync_log_conn_idx").on(table.connectionId),
  index("sync_log_started_idx").on(table.startedAt),
]);

export type SisSyncLog = typeof sisSyncLogsTable.$inferSelect;
