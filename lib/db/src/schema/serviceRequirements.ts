import { pgTable, text, serial, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { serviceTypesTable } from "./serviceTypes";
import { staffTable } from "./staff";

export const serviceRequirementsTable = pgTable("service_requirements", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  serviceTypeId: integer("service_type_id").notNull().references(() => serviceTypesTable.id),
  providerId: integer("provider_id").references(() => staffTable.id),
  deliveryType: text("delivery_type").notNull().default("direct"),
  requiredMinutes: integer("required_minutes").notNull(),
  intervalType: text("interval_type").notNull().default("monthly"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  gridType: text("grid_type").default("B"),
  setting: text("setting"),
  groupSize: text("group_size"),
  priority: text("priority").default("medium"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  /** Origin marker: null = manual/SIS, "pilot_csv" = pilot kickoff wizard. */
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("sr_student_active_idx").on(table.studentId, table.active),
  index("sr_provider_idx").on(table.providerId),
  index("sr_active_idx").on(table.active),
]);

export const insertServiceRequirementSchema = createInsertSchema(serviceRequirementsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertServiceRequirement = z.infer<typeof insertServiceRequirementSchema>;
export type ServiceRequirement = typeof serviceRequirementsTable.$inferSelect;
