import { pgTable, text, serial, timestamp, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { evaluationsTable } from "./evaluations";

export interface EligibilityTeamMember {
  name: string;
  role: string;
  agreed: boolean | null;
  dissent?: string;
}

export const eligibilityDeterminationsTable = pgTable("eligibility_determinations", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  evaluationId: integer("evaluation_id").references(() => evaluationsTable.id),
  meetingDate: text("meeting_date").notNull(),
  teamMembers: jsonb("team_members").$type<EligibilityTeamMember[]>().default([]),
  primaryDisability: text("primary_disability"),
  secondaryDisability: text("secondary_disability"),
  eligible: boolean("eligible"),
  determinationBasis: text("determination_basis"),
  determinationNotes: text("determination_notes"),
  iepRequired: boolean("iep_required").default(false),
  nextReEvalDate: text("next_re_eval_date"),
  reEvalCycleMonths: integer("re_eval_cycle_months").default(36),
  status: text("status").notNull().default("draft"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("elig_student_idx").on(table.studentId),
  index("elig_eval_idx").on(table.evaluationId),
  index("elig_reeval_idx").on(table.nextReEvalDate),
]);

export const insertEligibilityDeterminationSchema = createInsertSchema(eligibilityDeterminationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEligibilityDetermination = z.infer<typeof insertEligibilityDeterminationSchema>;
export type EligibilityDetermination = typeof eligibilityDeterminationsTable.$inferSelect;
