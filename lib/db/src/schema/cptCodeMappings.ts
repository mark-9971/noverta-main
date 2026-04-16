import { pgTable, text, serial, timestamp, integer, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { serviceTypesTable } from "./serviceTypes";

export const cptCodeMappingsTable = pgTable("cpt_code_mappings", {
  id: serial("id").primaryKey(),
  serviceTypeId: integer("service_type_id").notNull().references(() => serviceTypesTable.id),
  cptCode: text("cpt_code").notNull(),
  modifier: text("modifier"),
  description: text("description"),
  minDurationMinutes: integer("min_duration_minutes"),
  maxDurationMinutes: integer("max_duration_minutes"),
  unitDurationMinutes: integer("unit_duration_minutes").notNull().default(15),
  ratePerUnit: numeric("rate_per_unit").notNull(),
  placeOfService: text("place_of_service").notNull().default("03"),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("cpt_mapping_service_idx").on(table.serviceTypeId),
]);

export const insertCptCodeMappingSchema = createInsertSchema(cptCodeMappingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCptCodeMapping = z.infer<typeof insertCptCodeMappingSchema>;
export type CptCodeMapping = typeof cptCodeMappingsTable.$inferSelect;
