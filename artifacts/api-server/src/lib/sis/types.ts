export interface SisStudentRecord {
  externalId: string;
  firstName: string;
  lastName: string;
  grade?: string;
  dateOfBirth?: string;
  schoolExternalId?: string;
  enrollmentStatus: "active" | "inactive" | "withdrawn" | "graduated";
  disabilityCategory?: string;
  primaryLanguage?: string;
  parentGuardianName?: string;
  parentEmail?: string;
  parentPhone?: string;
}

export interface SisStaffRecord {
  externalId: string;
  firstName: string;
  lastName: string;
  email?: string;
  role?: string;
  title?: string;
  schoolExternalId?: string;
  status: "active" | "inactive";
}

export interface SisSyncResult {
  students: SisStudentRecord[];
  staff: SisStaffRecord[];
  errors: Array<{ field?: string; message: string }>;
  warnings: Array<{ field?: string; message: string }>;
}

export interface SisConnector {
  readonly provider: string;
  testConnection(credentials: Record<string, unknown>): Promise<{ ok: boolean; message: string }>;
  fetchStudents(credentials: Record<string, unknown>): Promise<{ records: SisStudentRecord[]; errors: Array<{ field?: string; message: string }> }>;
  fetchStaff(credentials: Record<string, unknown>): Promise<{ records: SisStaffRecord[]; errors: Array<{ field?: string; message: string }> }>;
}

export type SisProvider = "powerschool" | "infinite_campus" | "skyward" | "csv";
