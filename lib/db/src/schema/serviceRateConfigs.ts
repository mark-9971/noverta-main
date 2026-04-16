import { pgTable, text, serial, timestamp, integer, numeric, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { districtsTable } from "./districts";
import { serviceTypesTable } from "./serviceTypes";

export const serviceRateConfigsTable = pgTable("service_rate_configs", {
  id: serial("id").primaryKey(),
  districtId: integer("district_id").notNull().references(() => districtsTable.id),
  serviceTypeId: integer("service_type_id").notNull().references(() => serviceTypesTable.id),
  inHouseRate: numeric("in_house_rate"),
  contractedRate: numeric("contracted_rate"),
  effectiveDate: text("effective_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("src_district_idx").on(table.districtId),
  index("src_service_type_idx").on(table.serviceTypeId),
  unique("src_district_svc_date_uniq").on(table.districtId, table.serviceTypeId, table.effectiveDate),
]);

export const insertServiceRateConfigSchema = createInsertSchema(serviceRateConfigsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertServiceRateConfig = z.infer<typeof insertServiceRateConfigSchema>;
export type ServiceRateConfig = typeof serviceRateConfigsTable.$inferSelect;
