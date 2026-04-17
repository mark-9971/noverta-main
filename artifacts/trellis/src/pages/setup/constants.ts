import { Database, Building2, Settings2, UserPlus } from "lucide-react";

export type SISProvider = "csv" | "powerschool" | "infinite_campus" | "skyward" | "sftp";

export interface OnboardingStatus {
  sisConnected: boolean;
  districtConfirmed: boolean;
  schoolsConfigured: boolean;
  serviceTypesConfigured: boolean;
  staffInvited: boolean;
  isComplete: boolean;
  completedCount: number;
  totalSteps: number;
  counts: {
    districts: number;
    schools: number;
    serviceTypes: number;
    staff: number;
  };
}

export interface StaffInvite {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

// CSV is the supported path today (`tier: "ga"`). Direct API connectors exist
// in code but have not been validated against a real vendor tenant, so they are
// flagged `early_pilot` and the wizard renders a banner explaining what that
// actually means for the user. Mirrors `SUPPORTED_PROVIDERS` in
// `api-server/src/lib/sis/index.ts` and `STATUS.md`.
export const SIS_PROVIDERS: Array<{
  id: SISProvider;
  name: string;
  description: string;
  tier: "ga" | "early_pilot";
}> = [
  { id: "csv", name: "CSV Upload", description: "Upload a roster file. Fully supported today.", tier: "ga" },
  { id: "powerschool", name: "PowerSchool", description: "REST API (OAuth2). Early pilot — not yet validated against a live PowerSchool tenant.", tier: "early_pilot" },
  { id: "infinite_campus", name: "Infinite Campus", description: "REST API. Early pilot — not yet validated against a live Infinite Campus tenant.", tier: "early_pilot" },
  { id: "skyward", name: "Skyward", description: "REST API. Early pilot — not yet validated against a live Skyward tenant.", tier: "early_pilot" },
  { id: "sftp", name: "SFTP File Drop", description: "Auto-pull CSVs from an SFTP path. Early pilot — works, but treat as CSV under the hood.", tier: "early_pilot" },
];

export const DEFAULT_SERVICE_TYPES = [
  { name: "Speech-Language Therapy", category: "speech", cptCode: "92507", billingRate: "85.00", checked: true },
  { name: "Occupational Therapy", category: "ot", cptCode: "97530", billingRate: "80.00", checked: true },
  { name: "Physical Therapy", category: "pt", cptCode: "97110", billingRate: "80.00", checked: true },
  { name: "Applied Behavior Analysis", category: "aba", cptCode: "97153", billingRate: "125.00", checked: true },
  { name: "Counseling", category: "counseling", cptCode: "90837", billingRate: "90.00", checked: true },
  { name: "Social Skills Group", category: "counseling", cptCode: "90853", billingRate: "45.00", checked: false },
  { name: "Reading Specialist", category: "other", cptCode: "", billingRate: "65.00", checked: false },
  { name: "Paraprofessional Support", category: "para_support", cptCode: "T1019", billingRate: "35.00", checked: true },
  { name: "Adaptive PE", category: "other", cptCode: "97530", billingRate: "70.00", checked: false },
  { name: "Vision Services", category: "other", cptCode: "92083", billingRate: "95.00", checked: false },
  { name: "Hearing/Audiology", category: "other", cptCode: "92557", billingRate: "90.00", checked: false },
  { name: "Assistive Technology", category: "other", cptCode: "97542", billingRate: "75.00", checked: false },
];

export const STAFF_ROLES = [
  { value: "sped_teacher", label: "SPED Teacher" },
  { value: "bcba", label: "BCBA" },
  { value: "provider", label: "Provider / Therapist" },
  { value: "para", label: "Paraprofessional" },
  { value: "case_manager", label: "Case Manager" },
  { value: "coordinator", label: "Coordinator" },
];

export const STEPS = [
  { id: "sis", label: "Roster source", icon: Database, description: "Upload a CSV roster (recommended) or save details for an early-pilot SIS connector" },
  { id: "district", label: "District & Schools", icon: Building2, description: "Confirm district and school details" },
  { id: "services", label: "Service Types", icon: Settings2, description: "Configure SPED service types" },
  { id: "staff", label: "Invite Staff", icon: UserPlus, description: "Invite your team members" },
];

export type ServiceTypeRow = (typeof DEFAULT_SERVICE_TYPES)[number];
