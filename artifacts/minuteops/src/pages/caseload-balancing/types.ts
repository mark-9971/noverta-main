export interface ProviderCaseload {
  id: number;
  firstName: string;
  lastName: string;
  role: string;
  title: string | null;
  schoolId: number | null;
  schoolName: string;
  studentCount: number;
  totalServiceMinutes: number;
  serviceCount: number;
  threshold: number;
  utilization: number;
  status: "balanced" | "approaching" | "overloaded";
}

export interface RoleSummary {
  count: number;
  totalStudents: number;
  avgStudents: number;
  overloaded: number;
  approaching: number;
  threshold: number;
}

export interface Suggestion {
  fromProviderId: number;
  fromProviderName: string;
  fromStudentCount: number;
  toProviderId: number;
  toProviderName: string;
  toStudentCount: number;
  role: string;
  sameSchool: boolean;
  studentsToMove: number;
}

export interface ProviderStudent {
  id: number;
  firstName: string;
  lastName: string;
  grade: string | null;
  schoolId: number | null;
  schoolName: string | null;
  assignmentType: string;
}

export interface TrendPoint { month: string; studentCount: number; providerCount: number; avgPerProvider: number; }

export const STATUS_COLORS = {
  balanced: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", bar: "#10b981" },
  approaching: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", bar: "#f59e0b" },
  overloaded: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", bar: "#ef4444" },
};

export const ROLE_LABELS: Record<string, string> = {
  bcba: "BCBA",
  provider: "Provider",
  sped_teacher: "SPED Teacher",
  para: "Paraprofessional",
  case_manager: "Case Manager",
  coordinator: "Coordinator",
  teacher: "Teacher",
  admin: "Admin",
};
