import type { DashboardSummary, RiskOverview, AlertsSummary, ComplianceByService } from "@workspace/api-client-react";

/** Dashboard summary extended with fields not yet in the generated schema */
export interface DashboardSummaryExtended extends DashboardSummary {
  trackedStudents?: number;
  noDataStudents?: number;
  studentsNeedingSetup?: number;
  totalShortfallMinutes?: number;
  errorsLast24h?: number;
  contractRenewals?: { id: number; agencyName: string; endDate: string }[];
}

export type { DashboardSummary, RiskOverview, AlertsSummary, ComplianceByService };

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

export function formatLastUpdated(ts: number): string {
  if (!ts) return "";
  const ageMins = Math.floor((Date.now() - ts) / 60_000);
  if (ageMins < 1) return "just now";
  if (ageMins < 60) return `${ageMins} min ago`;
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
