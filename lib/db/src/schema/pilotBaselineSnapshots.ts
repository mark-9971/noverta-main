import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { districtsTable } from "./districts";

/**
 * Day-0 pilot baseline snapshot. Captured automatically the first time a
 * district is observed in the "pilot kicked off" state (isPilot=true) and
 * never re-captured or edited thereafter — this is the immutable pre-Trellis
 * state used by the Pilot Readout to compute "you went from X to X'."
 *
 * One row per district (enforced by the unique index on district_id).
 */
export const pilotBaselineSnapshotsTable = pgTable("pilot_baseline_snapshots", {
  id: serial("id").primaryKey(),
  districtId: integer("district_id").notNull().references(() => districtsTable.id, { onDelete: "cascade" }),
  // Compliance % of mandated minutes delivered for actively-tracked students;
  // null when nothing is being measured yet.
  compliancePercent: integer("compliance_percent"),
  // Sum of the projected-exposure dollars from the district risk surface at
  // capture time (USD, integer dollars — matches cost_avoidance_snapshots).
  exposureDollars: integer("exposure_dollars").notNull().default(0),
  // Sum of (minutes_owed - minutes_delivered) across non-completed
  // compensatory_obligations for active students in the district.
  compEdMinutesOutstanding: integer("comp_ed_minutes_outstanding").notNull().default(0),
  // # of evaluations past their due date (overdue), counting both
  // evaluation_referrals and compliance_events of evaluation type.
  overdueEvaluations: integer("overdue_evaluations").notNull().default(0),
  // # of active IEP documents whose iepEndDate is within the next 60 days
  // (inclusive of today, excluding already-expired).
  expiringIepsNext60: integer("expiring_ieps_next_60").notNull().default(0),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("pbs_district_unique").on(table.districtId),
]);

export const insertPilotBaselineSnapshotSchema = createInsertSchema(pilotBaselineSnapshotsTable).omit({ id: true, capturedAt: true });
export type InsertPilotBaselineSnapshot = z.infer<typeof insertPilotBaselineSnapshotSchema>;
export type PilotBaselineSnapshot = typeof pilotBaselineSnapshotsTable.$inferSelect;
