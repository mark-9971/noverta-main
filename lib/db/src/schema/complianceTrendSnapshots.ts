import { pgTable, serial, integer, numeric, date, timestamp, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { districtsTable } from "./districts";

export const complianceTrendSnapshotsTable = pgTable("compliance_trend_snapshots", {
  id: serial("id").primaryKey(),
  districtId: integer("district_id").notNull().references(() => districtsTable.id, { onDelete: "cascade" }),
  snapshotDate: date("snapshot_date").notNull(),
  overallComplianceRate: numeric("overall_compliance_rate", { precision: 5, scale: 1 }).notNull(),
  studentsOutOfCompliance: integer("students_out_of_compliance").notNull().default(0),
  studentsAtRisk: integer("students_at_risk").notNull().default(0),
  studentsOnTrack: integer("students_on_track").notNull().default(0),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("cts_district_date_idx").on(table.districtId, table.snapshotDate),
  unique("cts_district_date_unique").on(table.districtId, table.snapshotDate),
]);

export const insertComplianceTrendSnapshotSchema = createInsertSchema(complianceTrendSnapshotsTable).omit({ id: true, capturedAt: true });
export type InsertComplianceTrendSnapshot = z.infer<typeof insertComplianceTrendSnapshotSchema>;
export type ComplianceTrendSnapshot = typeof complianceTrendSnapshotsTable.$inferSelect;
