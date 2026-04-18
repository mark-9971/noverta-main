import { pgTable, serial, integer, text, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { districtsTable } from "./districts";

export const archiveJobStatusEnum = pgEnum("archive_job_status", ["pending", "running", "complete", "failed"]);

export interface ArchiveManifestTable {
  name: string;
  rows: number;
}

export interface ArchiveManifest {
  districtName: string;
  generatedAt: string;
  tables: ArchiveManifestTable[];
  totalRows: number;
  storageBytesEstimate: number;
}

export const districtArchiveJobsTable = pgTable("district_archive_jobs", {
  id: serial("id").primaryKey(),
  districtId: integer("district_id").notNull().references(() => districtsTable.id),
  requestedBy: text("requested_by").notNull(),
  requestedByEmail: text("requested_by_email"),
  requestedByName: text("requested_by_name"),
  status: archiveJobStatusEnum("status").notNull().default("pending"),
  manifest: jsonb("manifest").$type<ArchiveManifest>(),
  errorMessage: text("error_message"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DistrictArchiveJob = typeof districtArchiveJobsTable.$inferSelect;
