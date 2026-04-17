export type Tab = "caseload" | "utilization" | "budget";

export interface RoleData {
  role: string;
  fteCount: number;
  studentsServed: number;
  avgCaseload: number;
  totalRequiredWeeklyMinutes: number;
  capacityWeeklyMinutes: number;
  utilizationPercent: number;
  unfilledWeeklyMinutes: number;
  status: string;
}

export interface SchoolCaseload {
  schoolId: number;
  schoolName: string;
  totalStudents: number;
  totalProviders: number;
  totalStaff: number;
  byRole: RoleData[];
}

export interface ProviderUtil {
  staffId: number;
  name: string;
  role: string;
  schoolName: string;
  hourlyRate: number | null;
  studentsServed: number;
  scheduledWeeklyMinutes: number;
  capacityWeeklyMinutes: number;
  utilizationPercent: number;
  status: string;
  serviceBreakdown: Array<{ serviceType: string; studentCount: number; weeklyMinutes: number }>;
}

export interface BudgetData {
  summary: {
    totalDeliveredMinutes: number;
    totalServiceCost: number;
    totalAnnualSalary: number;
    totalStaff: number;
    totalStudentsServed: number;
    avgCostPerStudent: number;
  };
  costByStudent: Array<{
    studentId: number;
    name: string;
    schoolName: string;
    totalCost: number;
    totalMinutes: number;
    services: Array<{ serviceType: string; minutes: number; cost: number }>;
  }>;
  costByServiceType: Array<{
    serviceType: string;
    totalMinutes: number;
    totalCost: number;
    studentCount: number;
    avgCostPerStudent: number;
  }>;
  costBySchool: Array<{
    schoolId: number;
    schoolName: string;
    totalMinutes: number;
    totalCost: number;
    studentCount: number;
    avgCostPerStudent: number;
  }>;
}

export interface Suggestion {
  role: string;
  fromSchool: string;
  toSchool: string;
  reason: string;
  providerName: string;
  staffId: number;
}

export const ROLE_LABELS: Record<string, string> = {
  bcba: "BCBA",
  slp: "SLP",
  ot: "OT",
  pt: "PT",
  counselor: "Counselor",
  para: "Para/RBT",
  case_manager: "Case Manager",
  teacher: "Teacher",
};
