import { pgTable, text, serial, timestamp, integer, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agenciesTable } from "./agencies";
import { serviceTypesTable } from "./serviceTypes";

export const agencyContractsTable = pgTable("agency_contracts", {
  id: serial("id").primaryKey(),
  agencyId: integer("agency_id").notNull().references(() => agenciesTable.id),
  serviceTypeId: integer("service_type_id").notNull().references(() => serviceTypesTable.id),
  contractedHours: numeric("contracted_hours").notNull(),
  hourlyRate: numeric("hourly_rate"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  alertThresholdPct: integer("alert_threshold_pct").notNull().default(80),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("ac_agency_idx").on(table.agencyId),
  index("ac_service_type_idx").on(table.serviceTypeId),
  index("ac_status_idx").on(table.status),
  index("ac_dates_idx").on(table.startDate, table.endDate),
]);

export const insertAgencyContractSchema = createInsertSchema(agencyContractsTable).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertAgencyContract = z.infer<typeof insertAgencyContractSchema>;
export type AgencyContract = typeof agencyContractsTable.$inferSelect;
