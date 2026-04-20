import { pgTable, text, serial, timestamp, integer, boolean, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { serviceTypesTable } from "./serviceTypes";
import { staffTable } from "./staff";
import { schoolsTable } from "./schools";

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
  // DEPRECATED(batch-1): use `deliveryModel` going forward. Kept as the
  // legacy display field — see docs/architecture/deprecations.md (trigger:
  // delivery_model shown everywhere groupSize is shown today).
  groupSize: text("group_size"),
  priority: text("priority").default("medium"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  /** Origin marker: null = manual/SIS, "pilot_csv" = pilot kickoff wizard. */
  source: text("source"),
  // ── Batch 1 (Service Requirement v1) additions ─────────────────────
  // Self-FK chain marking that this row was replaced by another.
  // Populated by the future supersede flow (separate task). Always null
  // at the end of this task's backfill.
  supersedesId: integer("supersedes_id").references((): AnyPgColumn => serviceRequirementsTable.id),
  replacedAt: timestamp("replaced_at", { withTimezone: true }),
  // Denormalized operational school. NOT the canonical school for a
  // requirement — canonical school remains students.school_id at read
  // time. Maintained manually for now (no transfer trigger yet); a
  // future onStudentSchoolChange domain function will refresh it.
  schoolId: integer("school_id").references(() => schoolsTable.id),
  // "individual" | "group" — derived from the legacy `groupSize` text.
  // Nullable to accommodate ambiguous legacy values flagged in the
  // migration_report_service_requirements table.
  deliveryModel: text("delivery_model"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("sr_student_active_idx").on(table.studentId, table.active),
  index("sr_provider_idx").on(table.providerId),
  index("sr_active_idx").on(table.active),
  index("sr_school_active_idx").on(table.schoolId, table.active),
]);

export const insertServiceRequirementSchema = createInsertSchema(serviceRequirementsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertServiceRequirement = z.infer<typeof insertServiceRequirementSchema>;
export type ServiceRequirement = typeof serviceRequirementsTable.$inferSelect;
