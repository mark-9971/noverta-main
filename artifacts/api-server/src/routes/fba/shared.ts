export function isoDate(d: Date) { return d.toISOString(); }

export const BIP_APPROVER_ROLES = ["admin", "bcba"];
export const BIP_REVIEWER_ROLES = ["admin", "bcba", "case_manager", "coordinator"];
export const CLINICAL_ROLES = ["admin", "bcba", "case_manager", "coordinator", "sped_teacher", "provider", "para"];

export const BIP_PLAN_FIELDS = [
  "targetBehavior", "operationalDefinition", "hypothesizedFunction",
  "behaviorTargetId", "replacementBehaviors", "preventionStrategies", "teachingStrategies",
  "consequenceStrategies", "reinforcementSchedule", "crisisPlan", "implementationNotes",
  "dataCollectionMethod", "progressCriteria", "reviewDate", "effectiveDate",
  /* structured JSONB strategy fields (additive — null for legacy BIPs) */
  "antecedentStrategiesStructured",
  "teachingStrategiesStructured",
  "consequenceProceduresStructured",
  "reinforcementComponentsStructured",
  "crisisSupportsStructured",
];
export const BIP_LOCKED_STATUSES = ["approved", "active", "discontinued", "archived"];

export const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["under_review"],
  under_review: ["approved", "draft"],
  approved: ["active", "under_review"],
  active: ["discontinued"],
  discontinued: [],
};
