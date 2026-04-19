import { pgTable, serial, integer, timestamp, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { districtsTable } from "./districts";

export const costAvoidanceSnapshotsTable = pgTable("cost_avoidance_snapshots", {
  id: serial("id").primaryKey(),
  districtId: integer("district_id").notNull().references(() => districtsTable.id, { onDelete: "cascade" }),
  weekStart: timestamp("week_start", { withTimezone: true, mode: "date" }).notNull(),
  totalRisks: integer("total_risks").notNull().default(0),
  criticalCount: integer("critical_count").notNull().default(0),
  highCount: integer("high_count").notNull().default(0),
  mediumCount: integer("medium_count").notNull().default(0),
  watchCount: integer("watch_count").notNull().default(0),
  totalExposure: integer("total_exposure").notNull().default(0),
  studentsAtRisk: integer("students_at_risk").notNull().default(0),
  unpricedRiskCount: integer("unpriced_risk_count").notNull().default(0),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  // Tracks the most recent successful weekly digest dispatch for idempotency.
  // Created at runtime by costAvoidanceWeeklyDigest.ts; declared here so
  // drizzle-kit push does not propose dropping/renaming it.
  weeklyDigestSentAt: timestamp("weekly_digest_sent_at", { withTimezone: true }),
}, (table) => [
  index("cas_district_week_idx").on(table.districtId, table.weekStart),
  unique("cas_district_week_unique").on(table.districtId, table.weekStart),
]);

export const insertCostAvoidanceSnapshotSchema = createInsertSchema(costAvoidanceSnapshotsTable).omit({ id: true, capturedAt: true });
export type InsertCostAvoidanceSnapshot = z.infer<typeof insertCostAvoidanceSnapshotSchema>;
export type CostAvoidanceSnapshot = typeof costAvoidanceSnapshotsTable.$inferSelect;
