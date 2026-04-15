import { pgTable, text, serial, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { staffTable } from "./staff";
import { schoolYearsTable } from "./schoolYears";

export const iepDocumentsTable = pgTable("iep_documents", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  iepStartDate: text("iep_start_date").notNull(),
  iepEndDate: text("iep_end_date").notNull(),
  meetingDate: text("meeting_date"),
  status: text("status").notNull().default("draft"),

  studentConcerns: text("student_concerns"),
  parentConcerns: text("parent_concerns"),
  teamVision: text("team_vision"),

  plaafpAcademic: text("plaafp_academic"),
  plaafpBehavioral: text("plaafp_behavioral"),
  plaafpCommunication: text("plaafp_communication"),
  plaafpAdditional: text("plaafp_additional"),

  transitionAssessment: text("transition_assessment"),
  transitionPostsecGoals: text("transition_postsec_goals"),
  transitionServices: text("transition_services"),
  transitionAgencies: text("transition_agencies"),

  esyEligible: boolean("esy_eligible"),
  esyServices: text("esy_services"),
  esyJustification: text("esy_justification"),

  assessmentParticipation: text("assessment_participation"),
  assessmentAccommodations: text("assessment_accommodations"),
  alternateAssessmentJustification: text("alternate_assessment_justification"),

  scheduleModifications: text("schedule_modifications"),
  transportationServices: text("transportation_services"),

  iepType: text("iep_type").notNull().default("initial"),
  version: integer("version").notNull().default(1),
  amendmentOf: integer("amendment_of"),
  amendmentReason: text("amendment_reason"),

  preparedBy: integer("prepared_by").references(() => staffTable.id),
  schoolYearId: integer("school_year_id").references(() => schoolYearsTable.id),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("iep_docs_student_idx").on(table.studentId),
  index("iep_docs_student_active_idx").on(table.studentId, table.active),
  index("iep_docs_prepared_by_idx").on(table.preparedBy),
]);

export const insertIepDocumentSchema = createInsertSchema(iepDocumentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIepDocument = z.infer<typeof insertIepDocumentSchema>;
export type IepDocument = typeof iepDocumentsTable.$inferSelect;
