import type {
  AntecedentStrategyItem,
  TeachingStrategyItem,
  ConsequenceProcedureItem,
  ReinforcementItem,
  CrisisSupportItem,
} from "@/components/bip-management/types";

export interface Student { id: number; firstName: string; lastName: string; }

export interface FbaRecord {
  id: number; studentId: number; conductedBy: number | null;
  targetBehavior: string; operationalDefinition: string; status: string;
  referralDate: string | null; startDate: string | null; completionDate: string | null;
  hypothesizedFunction: string | null; conductedByName: string | null;
  referralReason?: string; settingDescription?: string;
  indirectMethods?: string; indirectFindings?: string;
  directMethods?: string; directFindings?: string;
  hypothesisNarrative?: string; recommendations?: string;
  createdAt: string; updatedAt: string;
}

export interface Observation {
  id: number; fbaId: number; observerId: number | null;
  observationDate: string; observationTime: string | null;
  durationMinutes: number | null; setting: string | null; activity: string | null;
  antecedent: string; antecedentCategory: string | null;
  behavior: string; behaviorIntensity: string | null;
  behaviorDurationSeconds: number | null;
  consequence: string; consequenceCategory: string | null;
  perceivedFunction: string | null; notes: string | null;
}

export interface FaSession {
  id: number; fbaId: number; sessionNumber: number; condition: string;
  sessionDate: string; durationMinutes: number; responseCount: number;
  responseRate: string | null; notes: string | null;
}

export interface ObsSummary {
  totalObservations: number;
  functionCounts: Record<string, number>;
  antecedentCounts: Record<string, number>;
  consequenceCounts: Record<string, number>;
  scatterData: Record<string, number>;
  suggestedFunction: string | null;
}

export interface BipRecord {
  id: number; studentId: number; fbaId: number | null; status: string;
  targetBehavior: string; operationalDefinition: string; hypothesizedFunction: string;
  replacementBehaviors: string | null; preventionStrategies: string | null;
  teachingStrategies: string | null; consequenceStrategies: string | null;
  reinforcementSchedule: string | null; crisisPlan: string | null;
  dataCollectionMethod: string | null; progressCriteria: string | null;
  reviewDate: string | null; effectiveDate: string | null;
  implementationStartDate: string | null; discontinuedDate: string | null;
  lastReviewedAt?: string | null;
  version: number; versionGroupId: number | null;
  createdByName?: string | null;
  createdAt: string; updatedAt: string;
  /* structured JSONB columns — null for BIPs created before structuring was introduced */
  antecedentStrategiesStructured?: AntecedentStrategyItem[] | null;
  teachingStrategiesStructured?: TeachingStrategyItem[] | null;
  consequenceProceduresStructured?: ConsequenceProcedureItem[] | null;
  reinforcementComponentsStructured?: ReinforcementItem[] | null;
  crisisSupportsStructured?: CrisisSupportItem[] | null;
}

export interface StaffEntry {
  id: number; firstName: string; lastName: string; role: string;
}

export interface BipStatusEntry {
  id: number; fromStatus: string; toStatus: string;
  changedById: number | null; changedByName: string | null;
  notes: string | null; changedAt: string;
}

export interface BipImplementerEntry {
  id: number; staffId: number; staffName: string | null; staffRole: string | null;
  assignedByName: string | null; notes: string | null; assignedAt: string;
}

export interface BipFidelityEntry {
  id: number; staffId: number | null; staffName: string | null;
  logDate: string; fidelityRating: number | null;
  studentResponse: string | null; implementationNotes: string | null;
  createdAt: string;
}
