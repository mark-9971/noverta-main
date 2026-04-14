import { pgTable, text, serial, timestamp, integer, index, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { staffTable } from "./staff";

export const fbasTable = pgTable("fbas", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  conductedBy: integer("conducted_by").references(() => staffTable.id),
  targetBehavior: text("target_behavior").notNull(),
  operationalDefinition: text("operational_definition").notNull(),
  status: text("status").notNull().default("draft"),
  referralReason: text("referral_reason"),
  referralDate: date("referral_date"),
  startDate: date("start_date"),
  completionDate: date("completion_date"),
  settingDescription: text("setting_description"),
  indirectMethods: text("indirect_methods"),
  indirectFindings: text("indirect_findings"),
  directMethods: text("direct_methods"),
  directFindings: text("direct_findings"),
  hypothesizedFunction: text("hypothesized_function"),
  hypothesisNarrative: text("hypothesis_narrative"),
  recommendations: text("recommendations"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("fba_student_idx").on(table.studentId),
  index("fba_status_idx").on(table.status),
]);

export const insertFbaSchema = createInsertSchema(fbasTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFba = z.infer<typeof insertFbaSchema>;
export type Fba = typeof fbasTable.$inferSelect;
