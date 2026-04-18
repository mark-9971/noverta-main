import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { districtsTable } from "./districts";

export const complianceSnapshotsTable = pgTable("compliance_snapshots", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  districtId: integer("district_id").notNull().references(() => districtsTable.id),
  snapshotJson: text("snapshot_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("cs_token_idx").on(table.token),
  index("cs_district_idx").on(table.districtId),
  index("cs_expires_idx").on(table.expiresAt),
]);

export type ComplianceSnapshot = typeof complianceSnapshotsTable.$inferSelect;
