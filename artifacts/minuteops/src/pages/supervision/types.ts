export interface SupervisionSession {
  id: number;
  supervisorId: number;
  superviseeId: number;
  sessionDate: string;
  durationMinutes: number;
  supervisionType: string;
  topics: string | null;
  feedbackNotes: string | null;
  status: string;
  supervisorName: string | null;
  superviseeName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceSummary {
  superviseeId: number;
  superviseeName: string;
  role: string;
  schoolId: number | null;
  periodDays: number;
  directServiceMinutes: number;
  requiredSupervisionMinutes: number;
  deliveredSupervisionMinutes: number;
  sessionCount: number;
  compliancePercent: number;
  complianceStatus: string;
}

export interface StaffOption {
  id: number;
  firstName: string;
  lastName: string;
  role: string;
}

export interface FormData {
  supervisorId: string;
  superviseeId: string;
  sessionDate: string;
  durationMinutes: string;
  supervisionType: string;
  topics: string;
  feedbackNotes: string;
  status: string;
}

export const TYPE_LABELS: Record<string, string> = {
  individual: "Individual",
  group: "Group",
  direct_observation: "Direct Observation",
};

export const STATUS_COLORS: Record<string, string> = {
  compliant: "bg-emerald-100 text-emerald-700",
  at_risk: "bg-amber-100 text-amber-700",
  non_compliant: "bg-red-100 text-red-700",
};

export const STATUS_LABELS: Record<string, string> = {
  compliant: "Compliant",
  at_risk: "At Risk",
  non_compliant: "Non-Compliant",
};
