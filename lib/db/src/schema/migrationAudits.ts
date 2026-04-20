import { pgTable, serial, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

/**
 * Generic audit ledger for one-shot data backfills. Each backfill writes
 * one row at the end with pre/post counts and a checksum so that
 * production-clone rollback verification (or a re-run) can confirm an
 * idempotent result.
 */
export const migrationAuditsTable = pgTable("migration_audits", {
  id: serial("id").primaryKey(),
  migrationKey: text("migration_key").notNull(),
  preCounts: jsonb("pre_counts").notNull(),
  postCounts: jsonb("post_counts").notNull(),
  checksum: text("checksum").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("migration_audits_key_idx").on(table.migrationKey, table.createdAt),
]);

export type MigrationAudit = typeof migrationAuditsTable.$inferSelect;
