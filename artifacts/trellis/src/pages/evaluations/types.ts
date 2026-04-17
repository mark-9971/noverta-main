export interface StudentOption {
  id: number;
  firstName: string;
  lastName: string;
}

export interface StaffOption {
  id: number;
  firstName: string;
  lastName: string;
}

export interface ReferralRecord {
  id: number;
  studentId: number;
  referralDate: string;
  referralSource: string;
  referralSourceName: string | null;
  reason: string;
  areasOfConcern: string[];
  consentRequestedDate: string | null;
  consentReceivedDate: string | null;
  consentStatus: string;
  evaluationDeadline: string | null;
  assignedEvaluatorId: number | null;
  status: string;
  notes: string | null;
  studentName: string | null;
  studentGrade: string | null;
  evaluatorName: string | null;
  schoolName: string | null;
  daysUntilDeadline: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationArea {
  area: string;
  status: string;
}

export interface EvaluationRecord {
  id: number;
  studentId: number;
  referralId: number | null;
  evaluationType: string;
  evaluationAreas: EvaluationArea[];
  teamMembers: string[];
  leadEvaluatorId: number | null;
  startDate: string | null;
  dueDate: string | null;
  completionDate: string | null;
  meetingDate: string | null;
  status: string;
  notes: string | null;
  studentName: string | null;
  studentGrade: string | null;
  leadEvaluatorName: string | null;
  daysUntilDue: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface EligibilityRecord {
  id: number;
  studentId: number;
  evaluationId: number | null;
  meetingDate: string;
  teamMembers: string[];
  primaryDisability: string | null;
  secondaryDisability: string | null;
  eligible: boolean | null;
  determinationBasis: string | null;
  determinationNotes: string | null;
  iepRequired: boolean;
  nextReEvalDate: string | null;
  reEvalCycleMonths: number;
  status: string;
  studentName: string | null;
  studentGrade: string | null;
  daysUntilReEval: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardData {
  openReferrals: number;
  pendingConsent: number;
  overdueEvaluations: number;
  activeEvaluations: number;
  upcomingReEvaluations: number;
  overdueReEvaluations: number;
  timelineRule: { key: string; label: string; schoolDays: number };
  overdueReferralDeadlines: Array<{
    id: number;
    studentName: string;
    deadline: string;
    daysOverdue: number;
    status: string;
  }>;
  upcomingReEvalList: Array<{
    id: number;
    studentName: string;
    nextReEvalDate: string | null;
    daysUntilReEval: number | null;
    primaryDisability: string | null;
  }>;
}

export interface PipelineCard {
  id: string;
  studentId: number;
  studentName: string;
  studentGrade: string | null;
  type: "referral" | "evaluation" | "eligibility";
  sourceId: number;
  status: string;
  date: string;
  detail: string;
  deadline?: string | null;
  daysUntil?: number | null;
}

export type StatusColor = "emerald" | "amber" | "red" | "blue" | "gray";
