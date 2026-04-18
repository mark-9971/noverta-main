export interface RateConfigSummary {
  allConfigured: boolean;
  configuredServiceTypeIds: number[];
  unconfiguredServiceTypes: { id: number; name: string }[];
  helpUrl: string;
  helpText: string;
  unpricedMinutesOwed: number;
  unpricedMinutesDelivered: number;
}

export interface OverviewData {
  totalMinutesOwed: number;
  totalMinutesDelivered: number;
  totalDollarsOwed: number;
  totalDollarsDelivered: number;
  studentsAffected: number;
  obligationCount: number;
  pendingCount: number;
  inProgressCount: number;
  completedCount: number;
  byServiceType: Array<{ serviceTypeId: number; name: string; minutesOwed: number; minutesDelivered: number; dollarsOwed: number | null; dollarsDelivered: number | null; rateConfigured: boolean; count: number }>;
  bySchool: Array<{ schoolId: number; name: string; minutesOwed: number; dollarsOwed: number; unpricedMinutes?: number; count: number }>;
  byProvider: Array<{ providerId: number; name: string; minutesOwed: number; dollarsOwed: number; unpricedMinutes?: number; count: number }>;
  rateConfig?: RateConfigSummary;
}

export interface StudentBalance {
  studentId: number;
  studentName: string;
  schoolName: string;
  totalMinutesOwed: number;
  totalMinutesDelivered: number;
  totalDollarsOwed: number;
  totalDollarsDelivered: number;
  remainingDollars: number;
  pctDelivered: number;
  obligationCount: number;
  pendingCount: number;
  services: Array<{ serviceTypeId: number; name: string; minutesOwed: number; minutesDelivered: number; dollarsOwed: number }>;
}

export interface BurndownPoint {
  month: string;
  accruedMinutes: number;
  deliveredMinutes: number;
  accruedDollars: number;
  deliveredDollars: number;
  cumulativeOwed: number;
  cumulativeOwedDollars: number;
}

export interface RateConfig {
  id: number;
  serviceTypeId: number;
  serviceTypeName: string;
  inHouseRate: string | null;
  contractedRate: string | null;
  effectiveDate: string;
  notes: string | null;
  defaultRate: string | null;
}

export interface RatesResponse {
  configs: RateConfig[];
  serviceTypes: Array<{ id: number; name: string; defaultBillingRate: string | null }>;
}

export const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

export function formatDollars(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

export function formatMinutesAsHours(minutes: number): string {
  const hours = Math.round(minutes / 60 * 10) / 10;
  return `${hours}h`;
}
