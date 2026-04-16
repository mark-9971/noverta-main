import { pgTable, text, serial, timestamp, integer, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { staffTable } from "./staff";
import { sessionLogsTable } from "./sessionLogs";
import { serviceTypesTable } from "./serviceTypes";
import { cptCodeMappingsTable } from "./cptCodeMappings";

export const medicaidClaimsTable = pgTable("medicaid_claims", {
  id: serial("id").primaryKey(),
  sessionLogId: integer("session_log_id").notNull().references(() => sessionLogsTable.id),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  staffId: integer("staff_id").notNull().references(() => staffTable.id),
  serviceTypeId: integer("service_type_id").notNull().references(() => serviceTypesTable.id),
  cptCodeMappingId: integer("cpt_code_mapping_id").references(() => cptCodeMappingsTable.id),
  cptCode: text("cpt_code").notNull(),
  modifier: text("modifier"),
  placeOfService: text("place_of_service").notNull().default("03"),
  serviceDate: text("service_date").notNull(),
  units: integer("units").notNull(),
  unitDurationMinutes: integer("unit_duration_minutes").notNull().default(15),
  durationMinutes: integer("duration_minutes").notNull(),
  billedAmount: numeric("billed_amount").notNull(),
  studentMedicaidId: text("student_medicaid_id"),
  providerNpi: text("provider_npi"),
  providerMedicaidId: text("provider_medicaid_id"),
  diagnosisCode: text("diagnosis_code"),
  status: text("status").notNull().default("pending"),
  reviewedBy: integer("reviewed_by").references(() => staffTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  exportBatchId: text("export_batch_id"),
  exportedAt: timestamp("exported_at", { withTimezone: true }),
  districtId: integer("district_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("mc_session_idx").on(table.sessionLogId),
  index("mc_student_idx").on(table.studentId),
  index("mc_status_idx").on(table.status),
  index("mc_district_idx").on(table.districtId),
  index("mc_export_batch_idx").on(table.exportBatchId),
  index("mc_service_date_idx").on(table.serviceDate),
]);

export const insertMedicaidClaimSchema = createInsertSchema(medicaidClaimsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMedicaidClaim = z.infer<typeof insertMedicaidClaimSchema>;
export type MedicaidClaim = typeof medicaidClaimsTable.$inferSelect;
