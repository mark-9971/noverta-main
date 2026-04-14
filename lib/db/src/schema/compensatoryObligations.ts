import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { serviceRequirementsTable } from "./serviceRequirements";

export const compensatoryObligationsTable = pgTable("compensatory_obligations", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  serviceRequirementId: integer("service_requirement_id").references(() => serviceRequirementsTable.id),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  minutesOwed: integer("minutes_owed").notNull(),
  minutesDelivered: integer("minutes_delivered").notNull().default(0),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  agreedDate: text("agreed_date"),
  agreedWith: text("agreed_with"),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("co_student_idx").on(table.studentId),
  index("co_status_idx").on(table.status),
  index("co_svc_req_idx").on(table.serviceRequirementId),
]);

export const insertCompensatoryObligationSchema = createInsertSchema(compensatoryObligationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompensatoryObligation = z.infer<typeof insertCompensatoryObligationSchema>;
export type CompensatoryObligation = typeof compensatoryObligationsTable.$inferSelect;
