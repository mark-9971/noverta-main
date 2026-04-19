import { pgTable, text, serial, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { staffTable } from "./staff";
import { serviceRequirementsTable } from "./serviceRequirements";
import { coverageInstancesTable } from "./coverageInstances";

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  studentId: integer("student_id").references(() => studentsTable.id),
  staffId: integer("staff_id").references(() => staffTable.id),
  serviceRequirementId: integer("service_requirement_id").references(() => serviceRequirementsTable.id),
  coverageInstanceId: integer("coverage_instance_id").references(() => coverageInstancesTable.id, { onDelete: "set null" }),
  message: text("message").notNull(),
  suggestedAction: text("suggested_action"),
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedNote: text("resolved_note"),
  snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("alert_resolved_idx").on(table.resolved),
  index("alert_student_resolved_idx").on(table.studentId, table.resolved),
  index("alert_severity_resolved_idx").on(table.severity, table.resolved),
  index("alert_staff_resolved_idx").on(table.staffId, table.resolved),
  index("alert_type_idx").on(table.type),
  index("alert_snoozed_idx").on(table.snoozedUntil),
  index("alert_created_at_idx").on(table.createdAt),
  index("alert_resolved_created_idx").on(table.resolved, table.createdAt),
  index("alert_coverage_instance_idx").on(table.coverageInstanceId, table.resolved),
]);

export const insertAlertSchema = createInsertSchema(alertsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;
