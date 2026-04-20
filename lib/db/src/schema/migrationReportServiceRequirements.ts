import { sql } from "drizzle-orm";
import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { serviceRequirementsTable } from "./serviceRequirements";
import { staffTable } from "./staff";

/**
 * Per-row report written by the Service Requirement v1 backfill
 * (lib/db/src/scripts/backfill-sr-v1.ts) for every requirement that
 * could not be resolved cleanly. Surfaced on /data-health so an admin
 * can review and use the existing edit dialog to fix.
 *
 * Reason vocabulary (TEXT to allow future backfills to extend without a
 * migration): see lib/db/src/migrations/041_service_requirements_v1.sql.
 */
export const migrationReportServiceRequirementsTable = pgTable("migration_report_service_requirements", {
  id: serial("id").primaryKey(),
  requirementId: integer("requirement_id").notNull().references(() => serviceRequirementsTable.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  detailsJson: jsonb("details_json"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: integer("resolved_by").references(() => staffTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Partial index — must match the SQL in 041_service_requirements_v1.sql
  // (WHERE resolved_at IS NULL). Drizzle's .where() emits a partial index.
  index("mrsr_unresolved_idx").on(table.reason).where(sql`resolved_at IS NULL`),
  index("mrsr_requirement_idx").on(table.requirementId),
]);

export type MigrationReportServiceRequirement = typeof migrationReportServiceRequirementsTable.$inferSelect;
