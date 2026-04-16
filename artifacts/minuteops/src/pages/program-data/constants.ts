import { Hand, Eye, Mic, Sparkles } from "lucide-react";

export interface BehaviorTarget {
  id: number; studentId: number; name: string; description: string;
  measurementType: string; targetDirection: string;
  baselineValue: string | null; goalValue: string | null; active: boolean;
  trackingMethod?: string; intervalLengthSeconds?: number; enableHourlyTracking?: boolean;
}
export interface ProgramTarget {
  id: number; studentId: number; name: string; description: string;
  programType: string; targetCriterion: string; domain: string; active: boolean;
  promptHierarchy?: string[]; currentPromptLevel?: string; currentStep?: number;
  autoProgressEnabled?: boolean; masteryCriterionPercent?: number;
  masteryCriterionSessions?: number; regressionThreshold?: number;
  regressionSessions?: number; reinforcementSchedule?: string;
  reinforcementType?: string; tutorInstructions?: string; templateId?: number;
}
export interface ProgramStep {
  id: number; programTargetId: number; stepNumber: number; name: string;
  sdInstruction?: string; targetResponse?: string; materials?: string;
  promptStrategy?: string; errorCorrection?: string; reinforcementNotes?: string;
  active: boolean; mastered: boolean;
}
export interface DataSession {
  id: number; studentId: number; sessionDate: string; staffName: string | null;
  startTime: string; endTime: string;
}
export interface ProgramTemplate {
  id: number; name: string; description: string; category: string;
  programType: string; domain: string; isGlobal: boolean;
  promptHierarchy: string[]; defaultMasteryPercent: number;
  defaultMasterySessions: number; tutorInstructions: string;
  steps: Array<{ name: string; sdInstruction?: string; targetResponse?: string; materials?: string }>;
}
export interface Student { id: number; firstName: string; lastName: string; }
export interface TrendPoint {
  sessionDate: string; value?: string; targetName?: string; measurementType?: string;
  behaviorTargetId?: number; programTargetId?: number;
  trialsCorrect?: number; trialsTotal?: number; percentCorrect?: string;
  promptLevelUsed?: string; hourBlock?: string; prompted?: number;
}

export const COLORS = ["#059669", "#f59e0b", "#ef4444", "#10b981", "#6b7280", "#9ca3af", "#374151", "#d1d5db"];

export const PROMPT_LABELS: Record<string, { label: string; short: string; icon: any; color: string }> = {
  full_physical: { label: "Full Physical", short: "FP", icon: Hand, color: "bg-red-100 text-red-700" },
  partial_physical: { label: "Partial Physical", short: "PP", icon: Hand, color: "bg-amber-50 text-amber-700" },
  model: { label: "Model", short: "M", icon: Eye, color: "bg-amber-50 text-amber-600" },
  gestural: { label: "Gestural", short: "G", icon: Hand, color: "bg-gray-100 text-gray-700" },
  verbal: { label: "Verbal", short: "V", icon: Mic, color: "bg-gray-50 text-gray-600" },
  independent: { label: "Independent", short: "I", icon: Sparkles, color: "bg-emerald-100 text-emerald-700" },
};

export const REINFORCEMENT_SCHEDULES = [
  { value: "continuous", label: "Continuous (CRF)" },
  { value: "fixed_ratio", label: "Fixed Ratio (FR)" },
  { value: "variable_ratio", label: "Variable Ratio (VR)" },
  { value: "fixed_interval", label: "Fixed Interval (FI)" },
  { value: "variable_interval", label: "Variable Interval (VI)" },
];

export function measureLabel(t: string) {
  if (t === "frequency") return "Count";
  if (t === "interval") return "% of intervals";
  if (t === "duration") return "Duration (sec)";
  if (t === "latency") return "Latency (sec)";
  return "Percentage";
}
