import {
  db,
  studentsTable,
  schoolsTable,
  districtsTable,
  iepDocumentsTable,
  serviceRequirementsTable,
  serviceTypesTable,
  staffTable,
} from "@workspace/db";
import { eq, and, isNull, gte, lte, inArray } from "drizzle-orm";

export const ADMIN_ROLES = ["admin"] as const;

export interface ValidationWarning {
  studentId: number;
  studentName: string;
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface QueryParams {
  schoolId?: number;
  dateFrom?: string;
  dateTo?: string;
  spedOnly?: boolean;
}

export interface StudentRow {
  id: number;
  firstName: string;
  lastName: string;
  externalId: string | null;
  dateOfBirth: string | null;
  grade: string | null;
  disabilityCategory: string | null;
  primaryLanguage: string | null;
  placementType: string | null;
  schoolId: number | null;
  schoolName: string | null;
  districtName: string | null;
  caseManagerFirst: string | null;
  caseManagerLast: string | null;
}

export interface ServiceReqRow {
  studentId: number;
  serviceName: string;
  serviceCategory: string;
  requiredMinutes: number;
  intervalType: string;
  deliveryType: string;
  setting: string | null;
}

export type IepRow = typeof iepDocumentsTable.$inferSelect;

export interface EnrichedStudent extends StudentRow {
  iep: IepRow | null;
  services: ServiceReqRow[];
}

export interface ColumnDef {
  header: string;
  field: string;
}

export interface ReportTemplate<T extends { id: number }> {
  key: string;
  label: string;
  description: string;
  columns: ColumnDef[];
  validate: (rows: T[]) => ValidationWarning[];
  query: (params: QueryParams) => Promise<T[]>;
}

export function escCsv(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return "";
  let s = String(val);
  const dangerPrefixes = ["=", "+", "-", "@", "\t", "\r"];
  if (dangerPrefixes.some((p) => s.startsWith(p))) {
    s = "'" + s;
  }
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsv(columns: ColumnDef[], rows: Record<string, string | number | boolean | null | undefined>[]): string {
  const header = columns.map((c) => escCsv(c.header)).join(",");
  const body = rows
    .map((r) => columns.map((c) => escCsv(r[c.field])).join(","))
    .join("\n");
  return header + "\n" + body;
}

export function ageOnDate(dob: string, refDate: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  const r = new Date(refDate);
  let age = r.getFullYear() - d.getFullYear();
  const m = r.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && r.getDate() < d.getDate())) age--;
  return age;
}

const DISABILITY_IDEA_CODE: Record<string, string> = {
  autism: "01",
  "deaf-blindness": "02",
  deafness: "03",
  "emotional disturbance": "04",
  "hearing impairment": "05",
  "intellectual disability": "06",
  "multiple disabilities": "07",
  "orthopedic impairment": "08",
  "other health impairment": "09",
  "specific learning disability": "10",
  "speech or language impairment": "11",
  "traumatic brain injury": "12",
  "visual impairment": "13",
  "developmental delay": "14",
};

export function mapDisabilityCode(cat: string | null): string {
  if (!cat) return "";
  const lower = cat.toLowerCase().trim();
  return DISABILITY_IDEA_CODE[lower] ?? cat;
}

const PLACEMENT_MAP: Record<string, string> = {
  "regular class": "A",
  inclusion: "A",
  "resource room": "B",
  "separate class": "C",
  "separate school": "D",
  "residential facility": "E",
  homebound: "F",
  hospital: "G",
};

export function mapPlacement(pt: string | null): string {
  if (!pt) return "";
  return PLACEMENT_MAP[pt.toLowerCase().trim()] ?? pt;
}

export async function fetchStudentsWithIep(params: QueryParams): Promise<EnrichedStudent[]> {
  const conditions: ReturnType<typeof eq>[] = [
    eq(studentsTable.status, "active"),
    isNull(studentsTable.deletedAt),
  ];
  if (params.schoolId) {
    conditions.push(eq(studentsTable.schoolId, params.schoolId));
  }

  const students = await db
    .select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      externalId: studentsTable.externalId,
      dateOfBirth: studentsTable.dateOfBirth,
      grade: studentsTable.grade,
      disabilityCategory: studentsTable.disabilityCategory,
      primaryLanguage: studentsTable.primaryLanguage,
      placementType: studentsTable.placementType,
      schoolId: studentsTable.schoolId,
      schoolName: schoolsTable.name,
      districtName: districtsTable.name,
      caseManagerFirst: staffTable.firstName,
      caseManagerLast: staffTable.lastName,
    })
    .from(studentsTable)
    .leftJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .leftJoin(districtsTable, eq(schoolsTable.districtId, districtsTable.id))
    .leftJoin(staffTable, eq(studentsTable.caseManagerId, staffTable.id))
    .where(and(...conditions))
    .orderBy(studentsTable.lastName, studentsTable.firstName);

  const studentIds = students.map((s) => s.id);
  if (studentIds.length === 0) return [];

  const iepConditions: ReturnType<typeof eq>[] = [
    inArray(iepDocumentsTable.studentId, studentIds),
    eq(iepDocumentsTable.active, true),
  ];
  if (params.dateFrom) {
    iepConditions.push(gte(iepDocumentsTable.iepEndDate, params.dateFrom));
  }
  if (params.dateTo) {
    iepConditions.push(lte(iepDocumentsTable.iepStartDate, params.dateTo));
  }

  const ieps = await db
    .select()
    .from(iepDocumentsTable)
    .where(and(...iepConditions));

  const iepMap = new Map<number, IepRow>();
  for (const iep of ieps) {
    const existing = iepMap.get(iep.studentId);
    if (!existing || iep.iepStartDate > existing.iepStartDate) {
      iepMap.set(iep.studentId, iep);
    }
  }

  const serviceReqs = await db
    .select({
      studentId: serviceRequirementsTable.studentId,
      serviceName: serviceTypesTable.name,
      serviceCategory: serviceTypesTable.category,
      requiredMinutes: serviceRequirementsTable.requiredMinutes,
      intervalType: serviceRequirementsTable.intervalType,
      deliveryType: serviceRequirementsTable.deliveryType,
      setting: serviceRequirementsTable.setting,
    })
    .from(serviceRequirementsTable)
    .innerJoin(serviceTypesTable, eq(serviceRequirementsTable.serviceTypeId, serviceTypesTable.id))
    .where(
      and(
        inArray(serviceRequirementsTable.studentId, studentIds),
        eq(serviceRequirementsTable.active, true)
      )
    );

  const serviceMap = new Map<number, ServiceReqRow[]>();
  for (const s of serviceReqs) {
    if (!serviceMap.has(s.studentId)) serviceMap.set(s.studentId, []);
    serviceMap.get(s.studentId)!.push(s);
  }

  const enriched = students.map((s) => ({
    ...s,
    iep: iepMap.get(s.id) ?? null,
    services: serviceMap.get(s.id) ?? [],
  }));

  if (params.spedOnly) {
    return enriched.filter((s) => s.iep !== null);
  }
  return enriched;
}
