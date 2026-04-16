export interface ProgramTemplate {
  id: number;
  name: string;
  description: string;
  category: string;
  programType: string;
  domain: string;
  isGlobal: boolean;
  schoolId: number | null;
  tier: string;
  tags: string[];
  usageCount: number;
  createdBy: number | null;
  promptHierarchy: string[];
  defaultMasteryPercent: number;
  defaultMasterySessions: number;
  defaultRegressionThreshold: number;
  defaultReinforcementSchedule: string;
  defaultReinforcementType: string;
  tutorInstructions: string;
  steps: Array<{
    name: string;
    sdInstruction?: string;
    targetResponse?: string;
    materials?: string;
    promptStrategy?: string;
    errorCorrection?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export const PROMPT_LABELS: Record<string, { label: string; color: string }> = {
  full_physical: { label: "Full Physical", color: "bg-red-100 text-red-700" },
  partial_physical: { label: "Partial Physical", color: "bg-amber-100 text-amber-700" },
  model: { label: "Model", color: "bg-amber-100 text-amber-700" },
  gestural: { label: "Gestural", color: "bg-gray-50 text-gray-600" },
  verbal: { label: "Verbal", color: "bg-gray-100 text-gray-700" },
  independent: { label: "Independent", color: "bg-emerald-100 text-emerald-700" },
};

export const PROGRAM_TYPE_LABELS: Record<string, string> = {
  discrete_trial: "DTT",
  task_analysis: "Task Analysis",
  natural_environment: "NET",
  fluency: "Fluency",
};

export const DOMAINS = [
  "Language", "Social Skills", "Academic", "Daily Living", "Motor Skills",
  "Play Skills", "Self-Help", "Communication", "Behavior", "Cognitive", "Vocational",
];

export const REINFORCEMENT_SCHEDULES = [
  { value: "continuous", label: "CRF" },
  { value: "fixed_ratio", label: "FR" },
  { value: "variable_ratio", label: "VR" },
  { value: "fixed_interval", label: "FI" },
  { value: "variable_interval", label: "VI" },
];

export const ERROR_CORRECTIONS = [
  { value: "4_step", label: "4-Step" },
  { value: "model_prompt_transfer", label: "Model-Prompt-Transfer" },
  { value: "backstep", label: "Backstep" },
  { value: "re_present", label: "Re-present" },
  { value: "show_correct", label: "Show Correct" },
  { value: "none", label: "None" },
];
