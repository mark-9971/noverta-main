import { pgTable, text, serial, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { schoolsTable } from "./schools";

export const staffTable = pgTable("staff", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  externalId: text("external_id"),
  email: text("email"),
  role: text("role").notNull(), // admin | bcba | provider | para | coordinator | case_manager | teacher
  title: text("title"),
  schoolId: integer("school_id").references(() => schoolsTable.id),
  status: text("status").notNull().default("active"), // active | inactive
  qualifications: text("qualifications"),
  hourlyRate: numeric("hourly_rate"),
  annualSalary: numeric("annual_salary"),
  npiNumber: text("npi_number"),
  medicaidProviderId: text("medicaid_provider_id"),
  sisConnectionId: integer("sis_connection_id"),
  sisManaged: text("sis_managed"),
  /** Origin marker: null = manual/SIS, "pilot_csv" = pilot kickoff wizard. */
  source: text("source"),
  isSample: boolean("is_sample").notNull().default(false),
  // Per-user "Training Mode" toggle (task 423). When true, the request-scoped
  // training-mode middleware re-routes this user's reads/writes to the
  // sandbox dataset (sample students/staff + their own sandbox-tagged
  // session writes). Toggled via /api/training-mode/{enable,disable}.
  trainingModeEnabled: boolean("training_mode_enabled").notNull().default(false),
  receiveRiskAlerts: boolean("receive_risk_alerts").notNull().default(true),
  alertDigestMode: boolean("alert_digest_mode"),
  // Optional supervisor relationship — used by provider activation nudges to
  // route the 5+ day escalation email. Self-referencing FK; nullable.
  supervisorStaffId: integer("supervisor_staff_id"),
  // Pause activation nudges (provider-controlled snooze) until this timestamp.
  nudgeSnoozedUntil: timestamp("nudge_snoozed_until", { withTimezone: true }),
  // Random capability token used in the email footer "snooze for one week" link.
  // Generated lazily on first nudge send.
  nudgeSnoozeToken: text("nudge_snooze_token"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStaffSchema = createInsertSchema(staffTable).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type Staff = typeof staffTable.$inferSelect;
