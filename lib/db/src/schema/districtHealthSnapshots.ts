import { pgTable, serial, integer, varchar, date, timestamp, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { districtsTable } from "./districts";

export const districtHealthSnapshotsTable = pgTable("district_health_snapshots", {
  id: serial("id").primaryKey(),
  districtId: integer("district_id").notNull().references(() => districtsTable.id, { onDelete: "cascade" }),
  snapshotDate: date("snapshot_date").notNull(),
  numericScore: integer("numeric_score").notNull(),
  grade: varchar("grade", { length: 1 }).notNull(),
  compliancePoints: integer("compliance_points").notNull().default(0),
  exposurePoints: integer("exposure_points").notNull().default(0),
  loggingPoints: integer("logging_points").notNull().default(0),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("dhs_district_date_idx").on(table.districtId, table.snapshotDate),
  unique("dhs_district_date_unique").on(table.districtId, table.snapshotDate),
]);

export const insertDistrictHealthSnapshotSchema = createInsertSchema(districtHealthSnapshotsTable).omit({ id: true, capturedAt: true });
export type InsertDistrictHealthSnapshot = z.infer<typeof insertDistrictHealthSnapshotSchema>;
export type DistrictHealthSnapshot = typeof districtHealthSnapshotsTable.$inferSelect;
