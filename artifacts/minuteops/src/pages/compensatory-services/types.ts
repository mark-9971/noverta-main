import { Clock, CheckCircle, ArrowRight, X } from "lucide-react";

export type Obligation = {
  id: number;
  studentId: number;
  studentName: string | null;
  serviceRequirementId: number | null;
  serviceTypeName: string | null;
  periodStart: string;
  periodEnd: string;
  minutesOwed: number;
  minutesDelivered: number;
  minutesRemaining: number;
  status: string;
  notes: string | null;
  agreedDate: string | null;
  agreedWith: string | null;
  source: string;
  createdAt: string;
};

export type Shortfall = {
  serviceRequirementId: number;
  studentId: number;
  studentName: string | null;
  serviceTypeName: string | null;
  requiredMinutes: number;
  deliveredMinutes: number;
  deficitMinutes: number;
  periodStart: string;
  periodEnd: string;
};

export const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; icon: any }> = {
  pending: { label: "Pending", bg: "bg-gray-100", color: "text-gray-700", icon: Clock },
  in_progress: { label: "In Progress", bg: "bg-emerald-50", color: "text-emerald-700", icon: ArrowRight },
  completed: { label: "Completed", bg: "bg-emerald-100", color: "text-emerald-800", icon: CheckCircle },
  waived: { label: "Waived", bg: "bg-gray-50", color: "text-gray-500", icon: X },
};

export function formatDate(d: string) {
  if (!d) return "\u2014";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
