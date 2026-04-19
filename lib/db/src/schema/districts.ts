import { pgTable, text, serial, timestamp, pgEnum, boolean, integer, numeric, jsonb, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const districtTierEnum = pgEnum("district_tier", ["essentials", "professional", "enterprise"]);

export const districtsTable = pgTable("districts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  state: text("state").default("MA"),
  region: text("region"),
  tier: districtTierEnum("tier").notNull().default("essentials"),
  tierOverride: districtTierEnum("tier_override"),
  isDemo: boolean("is_demo").notNull().default(false),
  isPilot: boolean("is_pilot").notNull().default(false),
  isSandbox: boolean("is_sandbox").notNull().default(false),
  hasSampleData: boolean("has_sample_data").notNull().default(false),
  complianceMinuteThreshold: integer("compliance_minute_threshold").notNull().default(85),
  alertDigestMode: boolean("alert_digest_mode").notNull().default(false),
  // When true, newly-critical risks (not previously critical) bypass the
  // digest and trigger an immediate individual email even if digest mode is on.
  spikeAlertEnabled: boolean("spike_alert_enabled").notNull().default(true),
  // Per-staff cap: if more than N risks spike at once for a single staff
  // member in a single run, treat them as a normal batch (digest) instead
  // of flooding the inbox with individual spike emails.
  spikeAlertThreshold: integer("spike_alert_threshold").notNull().default(3),
  // Days of inactivity on an in-progress approval workflow stage before
  // reviewers receive a follow-up reminder email. Null = use server default
  // (APPROVAL_REMINDER_DAYS env var, falling back to 3).
  approvalReminderDays: integer("approval_reminder_days"),
  defaultHourlyRate: numeric("default_hourly_rate", { precision: 10, scale: 2 }),
  caseloadThresholds: jsonb("caseload_thresholds").$type<Record<string, number>>(),
  // Email of the Trellis account manager assigned to this district's pilot.
  // New pilot feedback submissions are emailed here so the AM can triage immediately.
  pilotAccountManagerEmail: text("pilot_account_manager_email"),
  // IANA timezone used to interpret "school day" boundaries and the 7am local
  // delivery window for provider activation nudges. Defaults to America/New_York.
  timeZone: text("time_zone").notNull().default("America/New_York"),
  demoExpiresAt: timestamp("demo_expires_at", { withTimezone: true }),
  // Pilot configuration. These are nullable because most districts are not on
  // a pilot; isPilot remains the gate for whether the Pilot Status page renders.
  pilotStartDate: date("pilot_start_date"),
  pilotEndDate: date("pilot_end_date"),
  // kickoff | mid_pilot | readout — kept as text so future stages can be added
  // without a migration. Validated by the API layer.
  pilotStage: text("pilot_stage"),
  pilotAccountManagerName: text("pilot_account_manager_name"),
  deleteInitiatedAt: timestamp("delete_initiated_at", { withTimezone: true }),
  deleteScheduledAt: timestamp("delete_scheduled_at", { withTimezone: true }),
  deleteInitiatedBy: text("delete_initiated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDistrictSchema = createInsertSchema(districtsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDistrict = z.infer<typeof insertDistrictSchema>;
export type District = typeof districtsTable.$inferSelect;
