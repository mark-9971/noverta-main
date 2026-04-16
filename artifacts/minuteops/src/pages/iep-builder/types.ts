export type Step = 1 | 2 | 3 | 4 | 5;

export interface GoalSummary {
  id: number; goalArea: string; goalNumber: number; annualGoal: string;
  baseline: string | null; targetCriterion: string | null; serviceArea: string | null;
  progressCode: string; progressLabel: string; currentPerformance: string;
  percentCorrect: number | null; trendDirection: string; dataPoints: number;
  narrative: string | null;
  recommendation: { action: string; rationale: string; suggestedGoal: string; suggestedCriterion: string };
}

export interface ServiceInfo {
  id: number; serviceTypeName: string | null; requiredMinutes: number | null;
  intervalType: string | null; deliveryType: string | null; groupSize: string | null;
  setting: string | null; compliancePercent: number | null; deliveredMinutes: number | null;
  missedSessions: number | null;
}

export interface BuilderContext {
  student: {
    id: number; name: string; grade: string | null; dateOfBirth: string | null;
    age: number | null; disabilityCategory: string | null; placementType: string | null;
    primaryLanguage: string | null; schoolName: string | null;
    parentName: string | null; parentEmail: string | null; parentPhone: string | null;
  };
  currentIep: any | null;
  goalSummary: GoalSummary[];
  goalCounts: { total: number; mastered: number; sufficientProgress: number; needsAttention: number; notAddressed: number };
  services: ServiceInfo[];
  accommodations: any[];
  latestReportPeriod: string | null;
  totalDataPoints: number;
  ageAppropriateSkills: string[];
  needsTransition: boolean;
  transitionDomains: { domain: string; prompt: string }[];
  nextSchoolYear: { start: string; end: string; label: string };
  ageBand: string;
}

export interface ParentQuestionnaire {
  strengthsAtHome: string;
  primaryConcerns: string;
  prioritiesForYear: string;
  learningStyle: string;
  dailyLivingSkills: string;
  studentGoals: string;
  newGoalAreas: string;
  transitionConcerns: string;
  healthChanges: string;
  additionalComments: string;
}

export interface TeacherQuestionnaire {
  academicPerformance: string;
  areasOfStrength: string;
  areasOfNeed: string;
  behavioralObservations: string;
  socialEmotional: string;
  communicationSkills: string;
  selfAdvocacy: string;
  studentSelfAdvocacy: string;
  recommendedNewGoals: string;
  recommendedAccommodations: string;
  serviceChanges: Record<string, string>;
  teamDiscussionTopics: string;
  transitionNotes: string;
  responseToServices: string;
}

export interface AccommodationRec {
  description: string;
  category: string;
  action: string;
}

export interface TransitionDomain {
  goal: string;
  services: string;
  assessment?: string;
}

export interface TransitionPlanDraft {
  domains: Record<string, TransitionDomain>;
  agencyLinkages: string;
}

export interface TransitionInput {
  employment: { goal: string; services: string; assessment: string };
  postSecondary: { goal: string; services: string; assessment: string };
  independentLiving: { goal: string; services: string };
  agencyLinkages: string;
}

export interface GeneratedDraft {
  studentName: string; studentId: number; generatedFor: string;
  iepStartDate: string; iepEndDate: string;
  plaafp: Record<string, string>;
  goalRecommendations: Array<{
    id: number; goalArea: string; goalNumber: number; currentGoal: string;
    progressCode: string; currentPerformance: string;
    recommendation: { action: string; rationale: string; suggestedGoal: string; suggestedCriterion: string };
  }>;
  additionalGoalSuggestions: Array<{ goalArea: string; suggestedGoal: string; rationale: string; source: string }>;
  serviceRecommendations: Array<{
    serviceType: string | null; currentMinutes: number | null; currentInterval: string | null;
    deliveryType: string | null; groupSize: string | null; setting: string | null;
    compliancePercent: number; action: string; rationale: string;
    suggestedMinutes: number | null; suggestedInterval: string | null;
  }>;
  accommodationRecommendations: AccommodationRec[];
  transitionPlan: TransitionPlanDraft | null;
  teamDiscussionNotes: string[];
  disclaimer: string;
  generatedAt: string;
}

export const PROGRESS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  M:  { bg: "bg-emerald-50", color: "text-emerald-700", border: "border-emerald-200" },
  SP: { bg: "bg-blue-50", color: "text-blue-700", border: "border-blue-200" },
  IP: { bg: "bg-amber-50", color: "text-amber-700", border: "border-amber-200" },
  NP: { bg: "bg-orange-50", color: "text-orange-700", border: "border-orange-200" },
  R:  { bg: "bg-red-50", color: "text-red-700", border: "border-red-200" },
  NA: { bg: "bg-gray-50", color: "text-gray-500", border: "border-gray-200" },
};

export const ACTION_COLORS: Record<string, { bg: string; label: string; color: string }> = {
  graduate:   { bg: "bg-emerald-100", label: "Graduate → Advance", color: "text-emerald-800" },
  continue:   { bg: "bg-blue-100", label: "Continue / Elevate Criterion", color: "text-blue-800" },
  modify:     { bg: "bg-amber-100", label: "Modify Approach", color: "text-amber-800" },
  reconsider: { bg: "bg-red-100", label: "Reconsider / Reassess", color: "text-red-800" },
  review:     { bg: "bg-gray-100", label: "Review Delivery", color: "text-gray-700" },
};

export const EMPTY_PARENT: ParentQuestionnaire = {
  strengthsAtHome: "", primaryConcerns: "", prioritiesForYear: "", learningStyle: "",
  dailyLivingSkills: "", studentGoals: "", newGoalAreas: "", transitionConcerns: "",
  healthChanges: "", additionalComments: "",
};

export const EMPTY_TEACHER: TeacherQuestionnaire = {
  academicPerformance: "", areasOfStrength: "", areasOfNeed: "",
  behavioralObservations: "", socialEmotional: "", communicationSkills: "",
  selfAdvocacy: "", studentSelfAdvocacy: "", recommendedNewGoals: "",
  recommendedAccommodations: "", serviceChanges: {}, teamDiscussionTopics: "",
  transitionNotes: "", responseToServices: "",
};

export const EMPTY_TRANSITION: TransitionInput = {
  employment: { goal: "", services: "", assessment: "" },
  postSecondary: { goal: "", services: "", assessment: "" },
  independentLiving: { goal: "", services: "" },
  agencyLinkages: "Department of Developmental Services (DDS), Mass Rehab Commission (MRC)",
};

export const API_BASE = "/api";
