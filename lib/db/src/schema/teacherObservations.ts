import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";
import { staffTable } from "./staff";
import { behaviorTargetsTable } from "./behaviorTargets";
import { iepGoalsTable } from "./iepGoals";

export const teacherObservationsTable = pgTable("teacher_observations", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  staffId: integer("staff_id").notNull().references(() => staffTable.id),
  observationDate: text("observation_date").notNull(),
  description: text("description").notNull(),
  severity: text("severity").notNull().default("low"),
  behaviorTargetId: integer("behavior_target_id").references(() => behaviorTargetsTable.id),
  iepGoalId: integer("iep_goal_id").references(() => iepGoalsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("to_student_idx").on(table.studentId),
  index("to_staff_idx").on(table.staffId),
  index("to_date_idx").on(table.observationDate),
]);
