import { Clock, Edit3, CheckCircle, Eye, Send } from "lucide-react";

export interface GoalProgressEntry {
  iepGoalId: number;
  goalArea: string;
  goalNumber: number;
  annualGoal: string;
  baseline: string | null;
  targetCriterion: string | null;
  currentPerformance: string;
  progressRating: string;
  progressCode: string;
  dataPoints: number;
  trendDirection: string;
  promptLevel?: string | null;
  percentCorrect?: number | null;
  behaviorValue?: number | null;
  behaviorGoal?: number | null;
  narrative: string;
  benchmarks?: string | null;
  measurementMethod?: string | null;
  serviceArea?: string | null;
}

export interface ServiceBreakdown {
  serviceType: string;
  requiredMinutes: number;
  deliveredMinutes: number;
  missedSessions: number;
  completedSessions: number;
  compliancePercent: number;
}

export interface ProgressReport {
  id: number;
  studentId: number;
  reportingPeriod: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  preparedBy: number | null;
  preparedByName: string | null;
  overallSummary: string | null;
  serviceDeliverySummary: string | null;
  recommendations: string | null;
  parentNotes: string | null;
  goalProgress: GoalProgressEntry[];
  studentDob: string | null;
  studentGrade: string | null;
  schoolName: string | null;
  districtName: string | null;
  iepStartDate: string | null;
  iepEndDate: string | null;
  serviceBreakdown: ServiceBreakdown[];
  parentNotificationDate: string | null;
  nextReportDate: string | null;
  createdAt: string;
  updatedAt: string;
  studentName?: string;
  studentFirstName?: string;
  studentLastName?: string;
}

export interface StudentOption {
  id: number;
  firstName: string;
  lastName: string;
  grade: string | null;
}

export interface EditFields {
  overallSummary: string;
  recommendations: string;
  parentNotes: string;
  goalProgress: GoalProgressEntry[];
  status: string;
}

export const RATING_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  mastered: { label: "Mastered", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  sufficient_progress: { label: "Sufficient Progress", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  some_progress: { label: "Some Progress", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  insufficient_progress: { label: "Insufficient Progress", color: "text-red-700", bg: "bg-red-50 border-red-200" },
  not_addressed: { label: "Not Addressed", color: "text-gray-500", bg: "bg-gray-50 border-gray-200" },
};

export const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string; bg: string }> = {
  draft: { label: "Draft", icon: Edit3, color: "text-amber-700", bg: "bg-amber-50" },
  review: { label: "In Review", icon: Eye, color: "text-blue-700", bg: "bg-blue-50" },
  final: { label: "Final", icon: CheckCircle, color: "text-emerald-700", bg: "bg-emerald-50" },
  sent: { label: "Sent to Parent", icon: Send, color: "text-purple-700", bg: "bg-purple-50" },
};

export const QUARTER_PRESETS = [
  { label: "Q1 (Sep–Nov)", periodStart: "-09-01", periodEnd: "-11-30", reportingPeriod: "Q1" },
  { label: "Q2 (Dec–Feb)", periodStart: "-12-01", periodEnd: "-02-28", reportingPeriod: "Q2" },
  { label: "Q3 (Mar–May)", periodStart: "-03-01", periodEnd: "-05-31", reportingPeriod: "Q3" },
  { label: "Q4 (Jun–Aug)", periodStart: "-06-01", periodEnd: "-08-31", reportingPeriod: "Q4" },
];

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return d; }
}
