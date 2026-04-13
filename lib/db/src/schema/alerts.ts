import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { staffTable } from "./staff";
import { serviceRequirementsTable } from "./serviceRequirements";

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // behind_on_minutes | projected_shortfall | missed_sessions | overdue_makeup | uncovered_block | conflict | missing_log | provider_overload
  severity: text("severity").notNull(), // critical | high | medium | low
  studentId: integer("student_id").references(() => studentsTable.id),
  staffId: integer("staff_id").references(() => staffTable.id),
  serviceRequirementId: integer("service_requirement_id").references(() => serviceRequirementsTable.id),
  message: text("message").notNull(),
  suggestedAction: text("suggested_action"),
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedNote: text("resolved_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAlertSchema = createInsertSchema(alertsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;
