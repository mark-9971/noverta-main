/* ─────────────────────────────────────────────────────────────────────────
 * Structured strategy item types — mirrored from lib/db/src/schema
 * These live in the JSONB columns. Null means the BIP was created before
 * structured editing was introduced — it uses the legacy text columns only.
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

export const ANTECEDENT_CATEGORY_LABELS: Record<AntecedentStrategyCategory, string> = {
  environmental_modification: "Environmental Modification",
  schedule_change: "Schedule Change",
  task_modification: "Task Modification",
  prompting: "Prompting",
  choice_offering: "Choice Offering",
  pre_correction: "Pre-correction",
  high_p_sequence: "High-p Sequence",
  sensory_accommodation: "Sensory Accommodation",
  other: "Other",
};

export interface AntecedentStrategyItem {
  id: string;
  category: AntecedentStrategyCategory;
  description: string;
  implementedBy?: string;
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

export const TEACHING_METHOD_LABELS: Record<TeachingStrategyMethod, string> = {
  direct_instruction: "Direct Instruction",
  video_modeling: "Video Modeling",
  social_stories: "Social Stories",
  fct: "Functional Communication Training (FCT)",
  role_play: "Role Play",
  naturalistic_teaching: "Naturalistic Teaching",
  peer_mediated: "Peer-Mediated Instruction",
  visual_supports: "Visual Supports",
  other: "Other",
};

export interface TeachingStrategyItem {
  id: string;
  skill: string;
  method: TeachingStrategyMethod;
  replacementFor?: string;
  promptingStrategy?: string;
  materials?: string;
}

export type ConsequenceTriggerLevel = "minor" | "moderate" | "severe";

export const CONSEQUENCE_LEVEL_LABELS: Record<ConsequenceTriggerLevel, string> = {
  minor: "Minor",
  moderate: "Moderate",
  severe: "Severe",
};

export const CONSEQUENCE_LEVEL_COLORS: Record<ConsequenceTriggerLevel, string> = {
  minor: "text-amber-700 bg-amber-50 border-amber-200",
  moderate: "text-orange-700 bg-orange-50 border-orange-200",
  severe: "text-red-700 bg-red-50 border-red-200",
};

export interface ConsequenceProcedureItem {
  id: string;
  targetBehavior: string;
  triggerLevel: ConsequenceTriggerLevel;
  procedure: string;
  responsibleStaff?: string;
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

export const REINFORCER_TYPE_LABELS: Record<ReinforcerType, string> = {
  social: "Social",
  tangible: "Tangible",
  activity: "Activity",
  sensory: "Sensory",
  token: "Token Economy",
  edible: "Edible",
};

export const REINFORCEMENT_SCHEDULE_LABELS: Record<ReinforcementScheduleType, string> = {
  continuous: "Continuous (CRF)",
  fixed_ratio: "Fixed Ratio (FR)",
  variable_ratio: "Variable Ratio (VR)",
  fixed_interval: "Fixed Interval (FI)",
  variable_interval: "Variable Interval (VI)",
  differential: "Differential",
};

export interface ReinforcementItem {
  id: string;
  reinforcer: string;
  reinforcerType: ReinforcerType;
  schedule: ReinforcementScheduleType;
  scheduleDetail?: string;
  deliveredBy?: string;
  thinningPlan?: string;
}

export type CrisisPhase = "antecedent" | "escalation" | "crisis" | "recovery";

export const CRISIS_PHASE_LABELS: Record<CrisisPhase, string> = {
  antecedent: "Antecedent (Prevention)",
  escalation: "Escalation",
  crisis: "Crisis",
  recovery: "Recovery",
};

export const CRISIS_PHASE_COLORS: Record<CrisisPhase, string> = {
  antecedent: "text-blue-700 bg-blue-50 border-blue-200",
  escalation: "text-amber-700 bg-amber-50 border-amber-200",
  crisis: "text-red-700 bg-red-50 border-red-200",
  recovery: "text-emerald-700 bg-emerald-50 border-emerald-200",
};

export interface CrisisSupportItem {
  id: string;
  phase: CrisisPhase;
  procedure: string;
  staffRole?: string;
  contactNotify?: string;
  deescalationTips?: string;
  physicalProcedureInvolved?: boolean;
}

/* ─────────────────────────────────────────────────────────────────────────
 * BIP record type — both text (legacy) and structured (new) columns
 * ───────────────────────────────────────────────────────────────────────── */

export interface Bip {
  id: number;
  studentId: number;
  behaviorTargetId: number | null;
  fbaId: number | null;
  createdBy: number | null;
  version: number;
  status: string;
  targetBehavior: string;
  operationalDefinition: string;
  hypothesizedFunction: string;
  /* legacy text columns */
  replacementBehaviors: string | null;
  preventionStrategies: string | null;
  teachingStrategies: string | null;
  consequenceStrategies: string | null;
  reinforcementSchedule: string | null;
  crisisPlan: string | null;
  implementationNotes: string | null;
  dataCollectionMethod: string | null;
  progressCriteria: string | null;
  /* structured JSONB columns (null = legacy BIP, use text columns) */
  antecedentStrategiesStructured: AntecedentStrategyItem[] | null;
  teachingStrategiesStructured: TeachingStrategyItem[] | null;
  consequenceProceduresStructured: ConsequenceProcedureItem[] | null;
  reinforcementComponentsStructured: ReinforcementItem[] | null;
  crisisSupportsStructured: CrisisSupportItem[] | null;
  reviewDate: string | null;
  effectiveDate: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  behaviorTargetName: string | null;
}

export interface BipFormState {
  targetBehavior: string;
  operationalDefinition: string;
  hypothesizedFunction: string;
  fbaId: string;
  behaviorTargetId: string;
  /* legacy text fields */
  replacementBehaviors: string;
  preventionStrategies: string;
  teachingStrategies: string;
  consequenceStrategies: string;
  reinforcementSchedule: string;
  crisisPlan: string;
  implementationNotes: string;
  dataCollectionMethod: string;
  progressCriteria: string;
  reviewDate: string;
  effectiveDate: string;
  status: string;
  /* structured fields — null means "not yet structured" */
  antecedentStrategiesStructured: AntecedentStrategyItem[] | null;
  teachingStrategiesStructured: TeachingStrategyItem[] | null;
  consequenceProceduresStructured: ConsequenceProcedureItem[] | null;
  reinforcementComponentsStructured: ReinforcementItem[] | null;
  crisisSupportsStructured: CrisisSupportItem[] | null;
}

export const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  active: "bg-emerald-50 text-emerald-600",
  archived: "bg-gray-100 text-gray-400",
  under_review: "bg-gray-100 text-gray-600",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
  under_review: "Under Review",
};

export const FUNCTION_OPTIONS = ["attention", "escape", "tangible", "sensory", "multiple", "undetermined"];

export function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function esc(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const EMPTY_BIP_FORM: BipFormState = {
  targetBehavior: "",
  operationalDefinition: "",
  hypothesizedFunction: "attention",
  fbaId: "",
  behaviorTargetId: "",
  replacementBehaviors: "",
  preventionStrategies: "",
  teachingStrategies: "",
  consequenceStrategies: "",
  reinforcementSchedule: "",
  crisisPlan: "",
  implementationNotes: "",
  dataCollectionMethod: "",
  progressCriteria: "",
  reviewDate: "",
  effectiveDate: "",
  status: "draft",
  antecedentStrategiesStructured: null,
  teachingStrategiesStructured: null,
  consequenceProceduresStructured: null,
  reinforcementComponentsStructured: null,
  crisisSupportsStructured: null,
};
