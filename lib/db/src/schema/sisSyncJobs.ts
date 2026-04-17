import { pgTable, text, serial, timestamp, integer, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { sisConnectionsTable } from "./sisConnections";
import { sisSyncLogsTable } from "./sisSyncLogs";

export interface SyncJobProgress {
  phase: string;
  recordsProcessed?: number;
  totalRecords?: number;
  message?: string;
  updatedAt: string;
}

export interface SyncJobError {
  message: string;
  stack?: string;
  attempt: number;
  failedAt: string;
}

export interface SyncJobPayload {
  csvText?: string;
}

export const sisSyncJobsTable = pgTable("sis_sync_jobs", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id").references(() => sisConnectionsTable.id).notNull(),
  syncType: text("sync_type").notNull(),
  status: text("status").notNull().default("queued"),
  priority: integer("priority").notNull().default(0),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  lastError: jsonb("last_error").$type<SyncJobError | null>(),
  progress: jsonb("progress").$type<SyncJobProgress | null>(),
  payload: jsonb("payload").$type<SyncJobPayload | null>(),
  triggeredBy: text("triggered_by"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedBy: text("locked_by"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  syncLogId: integer("sync_log_id").references(() => sisSyncLogsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("sync_jobs_claim_idx").on(table.status, table.scheduledFor),
  index("sync_jobs_conn_status_idx").on(table.connectionId, table.status),
  index("sync_jobs_reaper_idx").on(table.status, table.lockedAt),
  // Atomic dedupe guarantee: only one queued/running *non-CSV* job per
  // connection. Without this, two concurrent enqueue requests can both
  // pass the "is there an existing job?" check and both insert,
  // defeating single-flight. CSV uploads are intentionally excluded —
  // each upload is its own run and may legitimately overlap a scheduled
  // sync. Terminal rows (completed/failed/canceled) accumulate as
  // history and don't block the predicate.
  uniqueIndex("sync_jobs_one_active_per_conn_idx")
    .on(table.connectionId)
    .where(sql`status IN ('queued','running') AND sync_type NOT LIKE 'csv_%'`),
]);

export type SisSyncJob = typeof sisSyncJobsTable.$inferSelect;
export type SisSyncJobInsert = typeof sisSyncJobsTable.$inferInsert;
