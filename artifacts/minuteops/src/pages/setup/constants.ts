import { Database, Building2, Settings2, UserPlus } from "lucide-react";

export type SISProvider = "powerschool" | "infinite_campus" | "skyward" | "csv";

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

export const SIS_PROVIDERS = [
  { id: "powerschool" as SISProvider, name: "PowerSchool", description: "REST API with OAuth2 client credentials" },
  { id: "infinite_campus" as SISProvider, name: "Infinite Campus", description: "REST API integration" },
  { id: "skyward" as SISProvider, name: "Skyward", description: "REST/SOAP connector" },
  { id: "csv" as SISProvider, name: "CSV Upload", description: "Upload a roster file manually" },
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
  { id: "sis", label: "Connect SIS", icon: Database, description: "Connect your student information system" },
  { id: "district", label: "District & Schools", icon: Building2, description: "Confirm district and school details" },
  { id: "services", label: "Service Types", icon: Settings2, description: "Configure SPED service types" },
  { id: "staff", label: "Invite Staff", icon: UserPlus, description: "Invite your team members" },
];

export type ServiceTypeRow = (typeof DEFAULT_SERVICE_TYPES)[number];
