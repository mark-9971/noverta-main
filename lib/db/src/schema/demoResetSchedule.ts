import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

/**
 * Singleton configuration row for automatic demo resets.
 * Only one row should ever exist (id = 1).
 * Cadence options:
 *   - "off"         : no automatic resets
 *   - "hourly"      : reset once per hour, on the hour, during business hours
 *   - "before-demo" : reset 5 minutes before each booked demo slot from demo_requests
 */
export const demoResetScheduleTable = pgTable("demo_reset_schedule", {
  id: serial("id").primaryKey(),
  cadence: text("cadence").notNull().default("off").$type<"off" | "hourly" | "before-demo">(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  updatedBy: text("updated_by"),
});

export type DemoResetSchedule = typeof demoResetScheduleTable.$inferSelect;

/**
 * Audit trail for automatic (and eventually manual) demo resets triggered
 * by the scheduler. One row per reset run.
 */
export const demoResetAuditTable = pgTable("demo_reset_audit", {
  id: serial("id").primaryKey(),
  triggeredBy: text("triggered_by").notNull().$type<"scheduler" | "manual">(),
  cadenceSnapshot: text("cadence_snapshot").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  success: boolean("success"),
  errorMessage: text("error_message"),
  elapsedMs: integer("elapsed_ms"),
  districtId: integer("district_id"),
  compliancePct: integer("compliance_pct"),
});

export type DemoResetAudit = typeof demoResetAuditTable.$inferSelect;
