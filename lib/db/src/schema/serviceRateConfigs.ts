import { pgTable, text, serial, timestamp, integer, numeric, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { districtsTable } from "./districts";
import { serviceTypesTable } from "./serviceTypes";
import { schoolsTable } from "./schools";
import { programsTable } from "./programs";

export const serviceRateConfigsTable = pgTable("service_rate_configs", {
  id: serial("id").primaryKey(),
  districtId: integer("district_id").notNull().references(() => districtsTable.id),
  serviceTypeId: integer("service_type_id").notNull().references(() => serviceTypesTable.id),
  // Optional scoping: a rate config can apply to a single school or program within
  // the district. When both are NULL the row is the district-wide rate for that
  // service type. School-scoped rows take precedence over program-scoped rows,
  // which take precedence over district-wide rows.
  schoolId: integer("school_id").references(() => schoolsTable.id),
  programId: integer("program_id").references(() => programsTable.id),
  inHouseRate: numeric("in_house_rate"),
  contractedRate: numeric("contracted_rate"),
  effectiveDate: text("effective_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("src_district_idx").on(table.districtId),
  index("src_service_type_idx").on(table.serviceTypeId),
  index("src_school_idx").on(table.schoolId),
  index("src_program_idx").on(table.programId),
  // Three partial unique indexes — one per scope — so each (district, scope, service, date)
  // combination is unique without conflicting across scopes. Postgres treats NULLs as
  // distinct in plain unique constraints, so we use partial indexes instead.
  uniqueIndex("src_district_svc_date_uniq")
    .on(table.districtId, table.serviceTypeId, table.effectiveDate)
    .where(sql`school_id IS NULL AND program_id IS NULL`),
  uniqueIndex("src_school_svc_date_uniq")
    .on(table.districtId, table.schoolId, table.serviceTypeId, table.effectiveDate)
    .where(sql`school_id IS NOT NULL`),
  uniqueIndex("src_program_svc_date_uniq")
    .on(table.districtId, table.programId, table.serviceTypeId, table.effectiveDate)
    .where(sql`program_id IS NOT NULL AND school_id IS NULL`),
]);

export const insertServiceRateConfigSchema = createInsertSchema(serviceRateConfigsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertServiceRateConfig = z.infer<typeof insertServiceRateConfigSchema>;
export type ServiceRateConfig = typeof serviceRateConfigsTable.$inferSelect;
