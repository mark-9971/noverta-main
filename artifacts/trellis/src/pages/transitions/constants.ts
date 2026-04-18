import { GraduationCap, Briefcase, Home } from "lucide-react";
import type { TransitionPlan } from "./types";

export const DOMAIN_META: Record<string, { label: string; icon: typeof GraduationCap; color: string }> = {
  education: { label: "Post-Secondary Education", icon: GraduationCap, color: "emerald" },
  employment: { label: "Employment", icon: Briefcase, color: "blue" },
  independent_living: { label: "Independent Living", icon: Home, color: "purple" },
};

export const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-emerald-50 text-emerald-700",
  completed: "bg-blue-50 text-blue-700",
  archived: "bg-gray-50 text-gray-500",
  pending: "bg-amber-50 text-amber-700",
  contacted: "bg-blue-50 text-blue-700",
  accepted: "bg-emerald-50 text-emerald-700",
  declined: "bg-red-50 text-red-700",
  in_progress: "bg-blue-50 text-blue-700",
};

export const PLAN_CRITERIA: { label: string; check: (plan: TransitionPlan) => boolean }[] = [
  { label: "Graduation pathway", check: (p) => !!p.graduationPathway },
  { label: "Vision statement", check: (p) => !!p.studentVisionStatement },
  { label: "Assessments", check: (p) => !!p.assessmentsUsed },
  { label: "Transition goals", check: (p) => (p.goalsCount ?? p.goals?.length ?? 0) > 0 },
  { label: "Agency referrals", check: (p) => (p.referralsCount ?? p.agencyReferrals?.length ?? 0) > 0 },
];

export function computePlanProgress(plan: TransitionPlan): { percent: number; filled: number; total: number } {
  const filled = PLAN_CRITERIA.filter((c) => c.check(plan)).length;
  const total = PLAN_CRITERIA.length;
  return { percent: Math.round((filled / total) * 100), filled, total };
}
