import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
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
  deliveryType: text("delivery_type").notNull().default("direct"), // direct | consult | support
  requiredMinutes: integer("required_minutes").notNull(),
  intervalType: text("interval_type").notNull().default("monthly"), // daily | weekly | monthly | quarterly
  startDate: text("start_date").notNull(), // ISO date string
  endDate: text("end_date"), // ISO date string
  gridType: text("grid_type").default("B"),
  setting: text("setting"),
  groupSize: text("group_size"),
  priority: text("priority").default("medium"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertServiceRequirementSchema = createInsertSchema(serviceRequirementsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertServiceRequirement = z.infer<typeof insertServiceRequirementSchema>;
export type ServiceRequirement = typeof serviceRequirementsTable.$inferSelect;
