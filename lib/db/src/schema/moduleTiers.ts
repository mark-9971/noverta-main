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

export const ROUTE_FEATURE_MAP: Record<string, FeatureKey> = {
  "/compliance": "compliance.service_minutes",
  "/compensatory-services": "compliance.compensatory",
  "/state-reporting": "compliance.state_reporting",
  "/compliance/checklist": "compliance.checklist",
  "/attendance": "compliance.attendance",
  "/evaluations": "compliance.evaluations",
  "/iep-calendar": "compliance.iep_calendar",
  "/search": "compliance.iep_search",
  "/transitions": "compliance.transitions",
  "/program-data": "clinical.program_data",
  "/behavior-assessment": "clinical.fba_bip",
  "/iep-suggestions": "clinical.iep_suggestions",
  "/protective-measures": "clinical.protective_measures",
  "/supervision": "clinical.supervision",
  "/aba-graphing": "clinical.aba_graphing",
  "/district": "district.overview",
  "/executive": "district.executive",
  "/resource-management": "district.resource_management",
  "/contract-utilization": "district.contract_utilization",
  "/caseload-balancing": "district.caseload_balancing",
  "/budget": "district.budget",
  "/parent-communication": "engagement.parent_communication",
  "/parent-portal": "engagement.parent_portal",
  "/documents": "engagement.documents",
  "/translation": "engagement.translation",
};

export const API_ROUTE_FEATURE_MAP: Record<string, FeatureKey> = {
  "/program-data": "clinical.program_data",
  "/program-templates": "clinical.program_data",
  "/program-targets": "clinical.program_data",
  "/behavior-targets": "clinical.program_data",
  "/behavior-assessment": "clinical.fba_bip",
  "/fba": "clinical.fba_bip",
  "/bip": "clinical.fba_bip",
  "/iep-suggestions": "clinical.iep_suggestions",
  "/protective-measures": "clinical.protective_measures",
  "/supervision": "clinical.supervision",
  "/compensatory": "compliance.compensatory",
  "/state-reporting": "compliance.state_reporting",
  "/compliance-checklist": "compliance.checklist",
  "/evaluations": "compliance.evaluations",
  "/transitions": "compliance.transitions",
  "/district-overview": "district.overview",
  "/executive": "district.executive",
  "/resource-management": "district.resource_management",
  "/contract-utilization": "district.contract_utilization",
  "/parent-communication": "engagement.parent_communication",
};
