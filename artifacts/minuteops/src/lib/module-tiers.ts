export type DistrictTier = "essentials" | "professional" | "enterprise";

export const DISTRICT_TIERS: DistrictTier[] = ["essentials", "professional", "enterprise"];

export const TIER_LABELS: Record<DistrictTier, string> = {
  essentials: "Essentials",
  professional: "Professional",
  enterprise: "Enterprise",
};

export type ProductModule =
  | "compliance_core"
  | "clinical_instruction"
  | "district_operations"
  | "engagement_access";

export const MODULE_LABELS: Record<ProductModule, string> = {
  compliance_core: "Compliance Core",
  clinical_instruction: "Clinical & Instruction",
  district_operations: "District Operations",
  engagement_access: "Engagement & Access",
};

export const MODULE_DESCRIPTIONS: Record<ProductModule, string> = {
  compliance_core: "IEP compliance tracking, service minutes, state reporting, and compensatory services.",
  clinical_instruction: "FBA/BIP management, ABA graphing, program data, and IEP suggestions.",
  district_operations: "Executive dashboards, caseload balancing, resource management, and budget tracking.",
  engagement_access: "Parent communication portal, document sharing, and translation services.",
};

export type FeatureKey =
  | "compliance.service_minutes"
  | "compliance.compensatory"
  | "compliance.state_reporting"
  | "compliance.checklist"
  | "compliance.attendance"
  | "compliance.evaluations"
  | "compliance.iep_calendar"
  | "compliance.iep_search"
  | "compliance.transitions"
  | "clinical.program_data"
  | "clinical.fba_bip"
  | "clinical.iep_suggestions"
  | "clinical.protective_measures"
  | "clinical.supervision"
  | "clinical.aba_graphing"
  | "clinical.premium_templates"
  | "district.overview"
  | "district.executive"
  | "district.resource_management"
  | "district.contract_utilization"
  | "district.caseload_balancing"
  | "district.budget"
  | "engagement.parent_communication"
  | "engagement.parent_portal"
  | "engagement.documents"
  | "engagement.translation";

export const MODULE_FEATURES: Record<ProductModule, FeatureKey[]> = {
  compliance_core: [
    "compliance.service_minutes",
    "compliance.compensatory",
    "compliance.state_reporting",
    "compliance.checklist",
    "compliance.attendance",
    "compliance.evaluations",
    "compliance.iep_calendar",
    "compliance.iep_search",
    "compliance.transitions",
  ],
  clinical_instruction: [
    "clinical.program_data",
    "clinical.fba_bip",
    "clinical.iep_suggestions",
    "clinical.protective_measures",
    "clinical.supervision",
    "clinical.aba_graphing",
    "clinical.premium_templates",
  ],
  district_operations: [
    "district.overview",
    "district.executive",
    "district.resource_management",
    "district.contract_utilization",
    "district.caseload_balancing",
    "district.budget",
  ],
  engagement_access: [
    "engagement.parent_communication",
    "engagement.parent_portal",
    "engagement.documents",
    "engagement.translation",
  ],
};

export const TIER_MODULES: Record<DistrictTier, ProductModule[]> = {
  essentials: ["compliance_core"],
  professional: ["compliance_core", "clinical_instruction", "engagement_access"],
  enterprise: ["compliance_core", "clinical_instruction", "district_operations", "engagement_access"],
};

export function getModuleForFeature(featureKey: FeatureKey): ProductModule | null {
  for (const [mod, features] of Object.entries(MODULE_FEATURES)) {
    if (features.includes(featureKey)) return mod as ProductModule;
  }
  return null;
}

export function isTierFeatureAccessible(tier: DistrictTier, featureKey: FeatureKey): boolean {
  const module = getModuleForFeature(featureKey);
  if (!module) return true;
  return TIER_MODULES[tier].includes(module);
}

export function getRequiredTierForFeature(featureKey: FeatureKey): DistrictTier {
  const module = getModuleForFeature(featureKey);
  if (!module) return "essentials";
  for (const tier of DISTRICT_TIERS) {
    if (TIER_MODULES[tier].includes(module)) return tier;
  }
  return "enterprise";
}
