export interface NeedsAttentionData {
  total: number;
  openIncidents: number;
  unresolvedAlerts: number;
  overdueActionItems: number;
  pendingNotifications: number;
}

export interface ProviderCaseloadSummary {
  staffId: number;
  staffName: string;
  role: string;
  assignedStudents: number;
  totalRequiredMinutes: number;
  totalDeliveredMinutes: number;
  studentsAtRisk: number;
  openAlerts: number;
  utilizationPercent: number;
}

export const CASELOAD_ROLES = new Set(["case_manager", "provider", "bcba", "sped_teacher"]);

export function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
