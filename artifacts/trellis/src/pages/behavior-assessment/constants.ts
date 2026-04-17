import type { BipRecord } from "./types";

export const ANTECEDENT_CATEGORIES = [
  "Task demand", "Transition", "Denied access", "Peer interaction",
  "Adult attention removed", "Unstructured time", "Sensory environment", "Other"
];

export const CONSEQUENCE_CATEGORIES = [
  "Attention given", "Task removed/delayed", "Item/activity provided",
  "Peer reaction", "Sensory input", "Redirected", "Ignored", "Other"
];

export const FUNCTION_OPTIONS = ["attention", "escape", "tangible", "sensory"];
export const INTENSITY_OPTIONS = ["low", "moderate", "high", "severe"];
export const FA_CONDITIONS = ["attention", "escape", "tangible", "control", "alone", "play"];

export const CONDITION_COLORS: Record<string, string> = {
  attention: "#059669", escape: "#d97706", tangible: "#6b7280",
  control: "#374151", alone: "#92400e", play: "#10b981"
};

export const BIP_DIFF_FIELDS: Array<{ key: keyof BipRecord; label: string }> = [
  { key: "targetBehavior", label: "Target Behavior" },
  { key: "operationalDefinition", label: "Operational Definition" },
  { key: "hypothesizedFunction", label: "Hypothesized Function" },
  { key: "replacementBehaviors", label: "Replacement Behaviors" },
  { key: "preventionStrategies", label: "Prevention Strategies" },
  { key: "teachingStrategies", label: "Teaching Strategies" },
  { key: "consequenceStrategies", label: "Consequence Strategies" },
  { key: "reinforcementSchedule", label: "Reinforcement Schedule" },
  { key: "crisisPlan", label: "Crisis Plan" },
  { key: "dataCollectionMethod", label: "Data Collection Method" },
  { key: "progressCriteria", label: "Progress Criteria" },
  { key: "reviewDate", label: "Review Date" },
  { key: "effectiveDate", label: "Effective Date" },
];

export function computeBipDiff(older: BipRecord, newer: BipRecord): string[] {
  return BIP_DIFF_FIELDS
    .filter(({ key }) => (older[key] ?? "") !== (newer[key] ?? ""))
    .map(({ label }) => label);
}

export const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-gray-100 text-gray-700" },
  "in-progress": { label: "In Progress", cls: "bg-amber-50 text-amber-700" },
  completed: { label: "Completed", cls: "bg-emerald-50 text-emerald-700" },
  under_review: { label: "Under Review", cls: "bg-blue-50 text-blue-700" },
  approved: { label: "Approved", cls: "bg-violet-50 text-violet-700" },
  active: { label: "Active", cls: "bg-emerald-100 text-emerald-800 font-semibold" },
  discontinued: { label: "Discontinued", cls: "bg-red-50 text-red-600" },
  archived: { label: "Archived", cls: "bg-gray-100 text-gray-500" },
};
