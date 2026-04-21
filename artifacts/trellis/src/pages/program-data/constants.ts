import { Hand, Eye, Mic, Sparkles, FlaskConical, BookOpen, ShieldCheck, Trophy, RefreshCw } from "lucide-react";

export type IntervalMode = "partial_interval" | "whole_interval" | "momentary_time_sampling";

export const INTERVAL_MODE_CONFIG: Record<IntervalMode, {
  label: string;
  short: string;
  abbrev: string;
  color: string;
  prompt: string;
  tendency: string;
  description: string;
}> = {
  partial_interval: {
    label: "Partial Interval",
    short: "PI",
    abbrev: "PI",
    color: "bg-orange-50 text-orange-700 border-orange-200",
    prompt: "Did the behavior occur at any point during this interval?",
    tendency: "Tends to overestimate — use to measure behaviors to reduce",
    description: "Score the interval + if the behavior occurred at any point, even briefly.",
  },
  whole_interval: {
    label: "Whole Interval",
    short: "WI",
    abbrev: "WI",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    prompt: "Was the behavior present for the entire interval?",
    tendency: "Tends to underestimate — use to measure behaviors to increase (e.g., on-task)",
    description: "Score the interval + only if the behavior was present for the full duration.",
  },
  momentary_time_sampling: {
    label: "Momentary Time Sampling",
    short: "MTS",
    abbrev: "MTS",
    color: "bg-violet-50 text-violet-700 border-violet-200",
    prompt: "Is the behavior occurring right now?",
    tendency: "Less reactive to behavior — good for high-frequency or continuous behaviors",
    description: "Score + only if the behavior is occurring at the exact moment the interval ends.",
  },
};

import type {
  BehaviorTargetItem, ProgramTargetItem, ProgramStepItem,
  DataSessionItem, ProgramTemplateItem, TrendPoint as ApiTrendPoint,
} from "@workspace/api-client-react";

export type BehaviorTarget = BehaviorTargetItem;
export type ProgramPhase = "baseline" | "training" | "maintenance" | "mastered" | "reopened";
export const PROGRAM_PHASES: ProgramPhase[] = ["baseline", "training", "maintenance", "mastered", "reopened"];

export const PHASE_CONFIG: Record<ProgramPhase, {
  label: string;
  short: string;
  color: string;
  icon: any;
  description: string;
}> = {
  baseline: {
    label: "Baseline",
    short: "BL",
    color: "bg-gray-100 text-gray-600",
    icon: FlaskConical,
    description: "Collecting baseline data before instruction begins",
  },
  training: {
    label: "Training",
    short: "TR",
    color: "bg-blue-50 text-blue-700",
    icon: BookOpen,
    description: "Active skill acquisition — instruction in progress",
  },
  maintenance: {
    label: "Maintenance",
    short: "MN",
    color: "bg-purple-50 text-purple-700",
    icon: ShieldCheck,
    description: "Skill learned — probing for retention and generalization",
  },
  mastered: {
    label: "Mastered",
    short: "MA",
    color: "bg-emerald-50 text-emerald-700",
    icon: Trophy,
    description: "Mastery criterion met and confirmed",
  },
  reopened: {
    label: "Reopened",
    short: "RO",
    color: "bg-amber-50 text-amber-700",
    icon: RefreshCw,
    description: "Previously mastered — skill regression detected, re-entered training",
  },
};

export type ProgramTarget = ProgramTargetItem;
export type ProgramStep = ProgramStepItem;
export type DataSession = DataSessionItem;
export type ProgramTemplate = ProgramTemplateItem;
export interface Student { id: number; firstName: string; lastName: string; }
export type TrendPoint = ApiTrendPoint;

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

export function measureLabel(t: string, intervalMode?: string | null) {
  if (t === "frequency") return "Count";
  if (t === "interval") {
    const cfg = intervalMode ? INTERVAL_MODE_CONFIG[intervalMode as IntervalMode] : undefined;
    if (cfg) return `% intervals (${cfg.abbrev})`;
    return "% of intervals";
  }
  if (t === "duration") return "Duration (sec)";
  if (t === "latency") return "Latency (sec)";
  return "Percentage";
}
