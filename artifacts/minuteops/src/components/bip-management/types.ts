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
  replacementBehaviors: string | null;
  preventionStrategies: string | null;
  teachingStrategies: string | null;
  consequenceStrategies: string | null;
  reinforcementSchedule: string | null;
  crisisPlan: string | null;
  implementationNotes: string | null;
  dataCollectionMethod: string | null;
  progressCriteria: string | null;
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
};
