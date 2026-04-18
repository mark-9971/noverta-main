import { pgTable, text, serial, timestamp, integer, index, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { fbasTable } from "./fbas";
import { staffTable } from "./staff";
import { behaviorTargetsTable } from "./behaviorTargets";

/* ─────────────────────────────────────────────────────────────────────────
 * Structured strategy item types
 *
 * These live in the JSONB columns and are additive — existing text columns
 * are never deleted. Both layers can coexist for the same BIP.
 * ───────────────────────────────────────────────────────────────────────── */

export type AntecedentStrategyCategory =
  | "environmental_modification"
  | "schedule_change"
  | "task_modification"
  | "prompting"
  | "choice_offering"
  | "pre_correction"
  | "high_p_sequence"
  | "sensory_accommodation"
  | "other";

export interface AntecedentStrategyItem {
  id: string;
  category: AntecedentStrategyCategory;
  description: string;
  /** Who implements this strategy (e.g. "para", "classroom teacher") */
  implementedBy?: string;
  /** Where this applies (e.g. "all settings", "math class only") */
  setting?: string;
}

export type TeachingStrategyMethod =
  | "direct_instruction"
  | "video_modeling"
  | "social_stories"
  | "fct"
  | "role_play"
  | "naturalistic_teaching"
  | "peer_mediated"
  | "visual_supports"
  | "other";

export interface TeachingStrategyItem {
  id: string;
  /** The skill or behavior being taught */
  skill: string;
  /** Instructional method */
  method: TeachingStrategyMethod;
  /** What this skill replaces or competes with */
  replacementFor?: string;
  /** Prompting hierarchy or level used */
  promptingStrategy?: string;
  /** Instructional materials or tools */
  materials?: string;
}

export type ConsequenceTriggerLevel = "minor" | "moderate" | "severe";

export interface ConsequenceProcedureItem {
  id: string;
  /** The behavior or escalation level this applies to */
  targetBehavior: string;
  triggerLevel: ConsequenceTriggerLevel;
  /** What staff do in response */
  procedure: string;
  /** Who is responsible for carrying this out */
  responsibleStaff?: string;
  /** What staff should NOT do (common mistake to avoid) */
  avoidResponse?: string;
}

export type ReinforcerType = "social" | "tangible" | "activity" | "sensory" | "token" | "edible";
export type ReinforcementScheduleType =
  | "continuous"
  | "fixed_ratio"
  | "variable_ratio"
  | "fixed_interval"
  | "variable_interval"
  | "differential";

export interface ReinforcementItem {
  id: string;
  /** The specific reinforcer (e.g. "verbal praise", "5-min iPad time") */
  reinforcer: string;
  reinforcerType: ReinforcerType;
  schedule: ReinforcementScheduleType;
  /** Human-readable schedule detail (e.g. "every 3 correct responses") */
  scheduleDetail?: string;
  /** Who delivers reinforcement */
  deliveredBy?: string;
  /** Plan for reducing reinforcement density over time */
  thinningPlan?: string;
}

export type CrisisPhase = "antecedent" | "escalation" | "crisis" | "recovery";

export interface CrisisSupportItem {
  id: string;
  phase: CrisisPhase;
  /** What staff should do at this phase */
  procedure: string;
  /** Which staff role carries this out */
  staffRole?: string;
  /** Who to notify and when */
  contactNotify?: string;
  /** Specific de-escalation strategies */
  deescalationTips?: string;
  /** Whether any physical management procedure is involved (for documentation purposes) */
  physicalProcedureInvolved?: boolean;
}

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
  /**
   * Structured strategy columns (JSONB). These columns are additive — existing BIPs
   * that predate structuring have null here and continue to use the text columns above.
   * New and edited BIPs can populate either layer; both are preserved.
   */
  antecedentStrategiesStructured: jsonb("antecedent_strategies_structured").$type<AntecedentStrategyItem[]>(),
  teachingStrategiesStructured: jsonb("teaching_strategies_structured").$type<TeachingStrategyItem[]>(),
  consequenceProceduresStructured: jsonb("consequence_procedures_structured").$type<ConsequenceProcedureItem[]>(),
  reinforcementComponentsStructured: jsonb("reinforcement_components_structured").$type<ReinforcementItem[]>(),
  crisisSupportsStructured: jsonb("crisis_supports_structured").$type<CrisisSupportItem[]>(),
  implementationNotes: text("implementation_notes"),
  dataCollectionMethod: text("data_collection_method"),
  progressCriteria: text("progress_criteria"),
  reviewDate: date("review_date"),
  effectiveDate: date("effective_date"),
  implementationStartDate: date("implementation_start_date"),
  discontinuedDate: date("discontinued_date"),
  /** ID of the first BIP in this version chain. Null for standalone BIPs that have never been versioned. */
  versionGroupId: integer("version_group_id"),
  lastReviewedAt: date("last_reviewed_at"),
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
