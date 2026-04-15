import { pgTable, pgEnum, serial, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";

export const MEDICAL_ALERT_TYPES = ["allergy", "medication", "condition", "seizure", "other"] as const;
export type MedicalAlertType = typeof MEDICAL_ALERT_TYPES[number];

export const MEDICAL_ALERT_SEVERITIES = ["mild", "moderate", "severe", "life_threatening"] as const;
export type MedicalAlertSeverity = typeof MEDICAL_ALERT_SEVERITIES[number];

export const medicalAlertTypeEnum = pgEnum("medical_alert_type", MEDICAL_ALERT_TYPES);
export const medicalAlertSeverityEnum = pgEnum("medical_alert_severity", MEDICAL_ALERT_SEVERITIES);

export const medicalAlertsTable = pgTable("medical_alerts", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
  alertType: medicalAlertTypeEnum("alert_type").notNull(),
  description: text("description").notNull(),
  severity: medicalAlertSeverityEnum("severity").notNull(),
  treatmentNotes: text("treatment_notes"),
  epiPenOnFile: boolean("epi_pen_on_file").notNull().default(false),
  notifyAllStaff: boolean("notify_all_staff").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("medical_alerts_student_idx").on(table.studentId),
  index("medical_alerts_notify_idx").on(table.notifyAllStaff),
]);

export const insertMedicalAlertSchema = createInsertSchema(medicalAlertsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMedicalAlert = z.infer<typeof insertMedicalAlertSchema>;
export type MedicalAlert = typeof medicalAlertsTable.$inferSelect;
