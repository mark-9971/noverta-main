export interface TransitionPlan {
  id: number;
  studentId: number;
  planDate: string;
  ageOfMajorityNotified: boolean;
  ageOfMajorityDate: string | null;
  graduationPathway: string | null;
  expectedGraduationDate: string | null;
  diplomaType: string | null;
  creditsEarned: string | null;
  creditsRequired: string | null;
  assessmentsUsed: string | null;
  studentVisionStatement: string | null;
  coordinatorId: number | null;
  status: string;
  notes: string | null;
  studentName?: string;
  studentAge?: number | null;
  studentGrade?: string | null;
  coordinatorName?: string | null;
  goalsCount?: number;
  referralsCount?: number;
  goals?: TransitionGoal[];
  agencyReferrals?: AgencyReferral[];
  createdAt: string;
  updatedAt: string;
}

export interface TransitionGoal {
  id: number;
  transitionPlanId: number;
  domain: string;
  goalStatement: string;
  measurableCriteria: string | null;
  activities: string | null;
  responsibleParty: string | null;
  targetDate: string | null;
  status: string;
  progressNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgencyReferral {
  id: number;
  transitionPlanId: number;
  agencyName: string;
  agencyType: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  referralDate: string;
  status: string;
  followUpDate: string | null;
  outcome: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardData {
  totalTransitionAge: number;
  approachingTransitionAge: number;
  withPlan: number;
  missingPlan: number;
  incompletePlans: number;
  missingPlanStudents: { id: number; name: string; age: number | null; grade: string | null }[];
  incompletePlanStudents: { id: number; name: string; age: number | null; grade: string | null; missingDomains: string[]; missingGraduationPathway: boolean }[];
  approachingStudents: { id: number; name: string; age: number | null; grade: string | null }[];
  pendingAgencyReferrals: number;
  overdueFollowups: number;
}

export interface StudentOption {
  id: number;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  grade?: string;
}

export type Tab = "dashboard" | "plans" | "plan-detail";

export interface PlanFormState {
  studentId: string;
  planDate: string;
  graduationPathway: string;
  expectedGraduationDate: string;
  diplomaType: string;
  creditsEarned: string;
  creditsRequired: string;
  assessmentsUsed: string;
  studentVisionStatement: string;
  status: string;
  notes: string;
  ageOfMajorityNotified: boolean;
  ageOfMajorityDate: string;
}

export interface GoalFormState {
  domain: string;
  goalStatement: string;
  measurableCriteria: string;
  activities: string;
  responsibleParty: string;
  targetDate: string;
  status: string;
  progressNotes: string;
}

export interface ReferralFormState {
  agencyName: string;
  agencyType: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  referralDate: string;
  status: string;
  followUpDate: string;
  outcome: string;
  notes: string;
}
