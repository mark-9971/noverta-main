import { pgTable, text, serial, timestamp, integer, index, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { fbasTable } from "./fbas";
import { staffTable } from "./staff";
import { behaviorTargetsTable } from "./behaviorTargets";

export const behaviorInterventionPlansTable = pgTable("behavior_intervention_plans", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  behaviorTargetId: integer("behavior_target_id").references(() => behaviorTargetsTable.id),
  fbaId: integer("fba_id").references(() => fbasTable.id),
  createdBy: integer("created_by").references(() => staffTable.id),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"),
  targetBehavior: text("target_behavior").notNull(),
  operationalDefinition: text("operational_definition").notNull(),
  hypothesizedFunction: text("hypothesized_function").notNull(),
  replacementBehaviors: text("replacement_behaviors"),
  preventionStrategies: text("prevention_strategies"),
  teachingStrategies: text("teaching_strategies"),
  consequenceStrategies: text("consequence_strategies"),
  reinforcementSchedule: text("reinforcement_schedule"),
  crisisPlan: text("crisis_plan"),
  implementationNotes: text("implementation_notes"),
  dataCollectionMethod: text("data_collection_method"),
  progressCriteria: text("progress_criteria"),
  reviewDate: date("review_date"),
  effectiveDate: date("effective_date"),
  implementationStartDate: date("implementation_start_date"),
  discontinuedDate: date("discontinued_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("bip_student_idx").on(table.studentId),
  index("bip_fba_idx").on(table.fbaId),
  index("bip_status_idx").on(table.status),
  index("bip_behavior_target_idx").on(table.behaviorTargetId),
  index("bip_student_version_idx").on(table.studentId, table.version),
]);

export const insertBipSchema = createInsertSchema(behaviorInterventionPlansTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBip = z.infer<typeof insertBipSchema>;
export type Bip = typeof behaviorInterventionPlansTable.$inferSelect;
