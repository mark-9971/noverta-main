import { Router, type IRouter } from "express";
import {
  db,
  studentsTable,
  schoolsTable,
  districtsTable,
  iepDocumentsTable,
  serviceRequirementsTable,
  serviceTypesTable,
  iepGoalsTable,
  iepAccommodationsTable,
  exportHistoryTable,
  staffTable,
} from "@workspace/db";
import { eq, and, desc, isNull, sql, gte, lte, inArray } from "drizzle-orm";
import { requireRoles, type AuthedRequest } from "../middlewares/auth";
import { getAuth } from "@clerk/express";

const router: IRouter = Router();
const ADMIN_ROLES = ["admin"] as const;

interface ValidationWarning {
  studentId: number;
  studentName: string;
  field: string;
  message: string;
  severity: "error" | "warning";
}

interface ReportTemplate {
  key: string;
  label: string;
  description: string;
  columns: { header: string; field: string }[];
  validate: (rows: any[]) => ValidationWarning[];
  query: (params: { schoolId?: number; dateFrom?: string; dateTo?: string }) => Promise<any[]>;
}

function escCsv(val: any): string {
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

function buildCsv(columns: { header: string; field: string }[], rows: any[]): string {
  const header = columns.map((c) => escCsv(c.header)).join(",");
  const body = rows
    .map((r) => columns.map((c) => escCsv(r[c.field])).join(","))
    .join("\n");
  return header + "\n" + body;
}

function ageOnDate(dob: string, refDate: string): number | null {
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

function mapDisabilityCode(cat: string | null): string {
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

function mapPlacement(pt: string | null): string {
  if (!pt) return "";
  return PLACEMENT_MAP[pt.toLowerCase().trim()] ?? pt;
}

async function fetchStudentsWithIep(params: { schoolId?: number; dateFrom?: string; dateTo?: string }) {
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

  const ieps = await db
    .select()
    .from(iepDocumentsTable)
    .where(
      and(
        inArray(iepDocumentsTable.studentId, studentIds),
        eq(iepDocumentsTable.active, true)
      )
    );

  const iepMap = new Map<number, typeof ieps[0]>();
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

  const serviceMap = new Map<number, typeof serviceReqs>();
  for (const s of serviceReqs) {
    if (!serviceMap.has(s.studentId)) serviceMap.set(s.studentId, []);
    serviceMap.get(s.studentId)!.push(s);
  }

  return students.map((s) => ({
    ...s,
    iep: iepMap.get(s.id) ?? null,
    services: serviceMap.get(s.id) ?? [],
  }));
}

const ideaChildCountTemplate: ReportTemplate = {
  key: "idea_child_count",
  label: "IDEA Part B Child Count",
  description: "Federal IDEA child count report — one row per student with disability code, age, placement, and services.",
  columns: [
    { header: "District", field: "district" },
    { header: "School", field: "school" },
    { header: "Student ID", field: "externalId" },
    { header: "Last Name", field: "lastName" },
    { header: "First Name", field: "firstName" },
    { header: "Date of Birth", field: "dateOfBirth" },
    { header: "Age", field: "age" },
    { header: "Grade", field: "grade" },
    { header: "Disability Code", field: "disabilityCode" },
    { header: "Disability Category", field: "disabilityCategory" },
    { header: "Placement Code", field: "placementCode" },
    { header: "Placement Type", field: "placementType" },
    { header: "IEP Start Date", field: "iepStartDate" },
    { header: "IEP End Date", field: "iepEndDate" },
    { header: "Primary Language", field: "primaryLanguage" },
    { header: "ESY Eligible", field: "esyEligible" },
    { header: "Service Types", field: "serviceList" },
    { header: "Total Weekly Minutes", field: "totalWeeklyMinutes" },
  ],
  validate(rows) {
    const warnings: ValidationWarning[] = [];
    for (const r of rows) {
      const name = `${r.firstName} ${r.lastName}`;
      if (!r.dateOfBirth) warnings.push({ studentId: r.id, studentName: name, field: "Date of Birth", message: "Missing date of birth", severity: "error" });
      if (!r.disabilityCategory) warnings.push({ studentId: r.id, studentName: name, field: "Disability Category", message: "Missing disability category", severity: "error" });
      if (!r.iepStartDate) warnings.push({ studentId: r.id, studentName: name, field: "IEP", message: "No active IEP found", severity: "error" });
      if (!r.grade) warnings.push({ studentId: r.id, studentName: name, field: "Grade", message: "Missing grade level", severity: "warning" });
      if (!r.placementType) warnings.push({ studentId: r.id, studentName: name, field: "Placement", message: "Missing placement type", severity: "warning" });
      if (!r.externalId) warnings.push({ studentId: r.id, studentName: name, field: "Student ID", message: "Missing external student ID", severity: "warning" });
    }
    return warnings;
  },
  async query(params) {
    const data = await fetchStudentsWithIep(params);
    const refDate = new Date().toISOString().slice(0, 10);
    return data.map((s) => {
      const weeklyMinutes = s.services.reduce((total, svc) => {
        if (svc.intervalType === "weekly") return total + svc.requiredMinutes;
        if (svc.intervalType === "daily") return total + svc.requiredMinutes * 5;
        if (svc.intervalType === "monthly") return total + Math.round(svc.requiredMinutes / 4);
        return total + svc.requiredMinutes;
      }, 0);
      return {
        id: s.id,
        district: s.districtName ?? "",
        school: s.schoolName ?? "",
        externalId: s.externalId ?? "",
        lastName: s.lastName,
        firstName: s.firstName,
        dateOfBirth: s.dateOfBirth ?? "",
        age: ageOnDate(s.dateOfBirth ?? "", refDate),
        grade: s.grade ?? "",
        disabilityCode: mapDisabilityCode(s.disabilityCategory),
        disabilityCategory: s.disabilityCategory ?? "",
        placementCode: mapPlacement(s.placementType),
        placementType: s.placementType ?? "",
        iepStartDate: s.iep?.iepStartDate ?? "",
        iepEndDate: s.iep?.iepEndDate ?? "",
        primaryLanguage: s.primaryLanguage ?? "",
        esyEligible: s.iep?.esyEligible ? "Y" : "N",
        serviceList: s.services.map((sv) => sv.serviceName).join("; "),
        totalWeeklyMinutes: weeklyMinutes,
      };
    });
  },
};

const maSimsTemplate: ReportTemplate = {
  key: "ma_sims",
  label: "MA SIMS Student Export",
  description: "Massachusetts Student Information Management System (SIMS) export — student demographics and special education data for state submission.",
  columns: [
    { header: "SASID", field: "externalId" },
    { header: "Last Name", field: "lastName" },
    { header: "First Name", field: "firstName" },
    { header: "DOB", field: "dateOfBirth" },
    { header: "Grade", field: "grade" },
    { header: "School Code", field: "schoolCode" },
    { header: "School Name", field: "schoolName" },
    { header: "District", field: "district" },
    { header: "SPED Status", field: "spedStatus" },
    { header: "Primary Disability", field: "disabilityCategory" },
    { header: "IDEA Disability Code", field: "disabilityCode" },
    { header: "Placement", field: "placementType" },
    { header: "IEP Start", field: "iepStartDate" },
    { header: "IEP End", field: "iepEndDate" },
    { header: "Primary Language", field: "primaryLanguage" },
    { header: "Case Manager", field: "caseManager" },
    { header: "Services", field: "serviceList" },
    { header: "Service Categories", field: "serviceCategories" },
    { header: "Total Monthly Minutes", field: "totalMonthlyMinutes" },
    { header: "ESY", field: "esyEligible" },
  ],
  validate(rows) {
    const warnings: ValidationWarning[] = [];
    for (const r of rows) {
      const name = `${r.firstName} ${r.lastName}`;
      if (!r.externalId) warnings.push({ studentId: r.id, studentName: name, field: "SASID", message: "Missing SASID (external student ID) — required for SIMS", severity: "error" });
      if (!r.dateOfBirth) warnings.push({ studentId: r.id, studentName: name, field: "DOB", message: "Missing date of birth", severity: "error" });
      if (!r.disabilityCategory) warnings.push({ studentId: r.id, studentName: name, field: "Disability", message: "Missing primary disability category", severity: "error" });
      if (!r.iepStartDate) warnings.push({ studentId: r.id, studentName: name, field: "IEP", message: "No active IEP — student may not appear in SPED data", severity: "error" });
      if (!r.grade) warnings.push({ studentId: r.id, studentName: name, field: "Grade", message: "Missing grade level", severity: "warning" });
      if (!r.caseManager || r.caseManager.trim() === "") warnings.push({ studentId: r.id, studentName: name, field: "Case Manager", message: "No case manager assigned", severity: "warning" });
    }
    return warnings;
  },
  async query(params) {
    const data = await fetchStudentsWithIep(params);
    return data.map((s) => {
      const monthlyMinutes = s.services.reduce((total, svc) => {
        if (svc.intervalType === "monthly") return total + svc.requiredMinutes;
        if (svc.intervalType === "weekly") return total + svc.requiredMinutes * 4;
        if (svc.intervalType === "daily") return total + svc.requiredMinutes * 20;
        return total + svc.requiredMinutes;
      }, 0);
      const cats = [...new Set(s.services.map((sv) => sv.serviceCategory))];
      return {
        id: s.id,
        externalId: s.externalId ?? "",
        lastName: s.lastName,
        firstName: s.firstName,
        dateOfBirth: s.dateOfBirth ?? "",
        grade: s.grade ?? "",
        schoolCode: s.schoolId ? String(s.schoolId) : "",
        schoolName: s.schoolName ?? "",
        district: s.districtName ?? "",
        spedStatus: s.iep ? "Active IEP" : "No Active IEP",
        disabilityCategory: s.disabilityCategory ?? "",
        disabilityCode: mapDisabilityCode(s.disabilityCategory),
        placementType: s.placementType ?? "",
        iepStartDate: s.iep?.iepStartDate ?? "",
        iepEndDate: s.iep?.iepEndDate ?? "",
        primaryLanguage: s.primaryLanguage ?? "",
        caseManager: s.caseManagerFirst && s.caseManagerLast
          ? `${s.caseManagerFirst} ${s.caseManagerLast}`
          : "",
        serviceList: s.services.map((sv) => sv.serviceName).join("; "),
        serviceCategories: cats.join("; "),
        totalMonthlyMinutes: monthlyMinutes,
        esyEligible: s.iep?.esyEligible ? "Y" : "N",
      };
    });
  },
};

const TEMPLATES: Record<string, ReportTemplate> = {
  idea_child_count: ideaChildCountTemplate,
  ma_sims: maSimsTemplate,
};

router.get("/state-reports/templates", requireRoles(...ADMIN_ROLES), async (_req, res): Promise<void> => {
  const list = Object.values(TEMPLATES).map((t) => ({
    key: t.key,
    label: t.label,
    description: t.description,
    columnCount: t.columns.length,
  }));
  res.json(list);
});

router.post("/state-reports/validate", requireRoles(...ADMIN_ROLES), async (req, res): Promise<void> => {
  try {
    const { reportType, schoolId } = req.body;
    const template = TEMPLATES[reportType];
    if (!template) {
      res.status(400).json({ error: "Unknown report type" });
      return;
    }
    const rows = await template.query({ schoolId: schoolId ? Number(schoolId) : undefined });
    const warnings = template.validate(rows);
    const errors = warnings.filter((w) => w.severity === "error");
    const warns = warnings.filter((w) => w.severity === "warning");
    res.json({
      recordCount: rows.length,
      errorCount: errors.length,
      warningCount: warns.length,
      errors,
      warnings: warns,
    });
  } catch (err: any) {
    console.error("Validation error:", err);
    res.status(500).json({ error: "Validation failed" });
  }
});

router.post("/state-reports/export", requireRoles(...ADMIN_ROLES), async (req, res): Promise<void> => {
  try {
    const { reportType, schoolId } = req.body;
    const template = TEMPLATES[reportType];
    if (!template) {
      res.status(400).json({ error: "Unknown report type" });
      return;
    }

    const rows = await template.query({
      schoolId: schoolId ? Number(schoolId) : undefined,
    });

    const allIssues = template.validate(rows);
    const errorCount = allIssues.filter((w) => w.severity === "error").length;
    const warnCount = allIssues.filter((w) => w.severity === "warning").length;
    const csv = buildCsv(template.columns, rows);
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const fileName = `${template.key}_${timestamp}.csv`;

    const auth = getAuth(req);
    const userId = auth?.userId ?? "unknown";

    await db.insert(exportHistoryTable).values({
      reportType: template.key,
      reportLabel: template.label,
      exportedBy: userId,
      schoolId: schoolId ? Number(schoolId) : null,
      parameters: { schoolId, errorCount },
      recordCount: rows.length,
      warningCount: warnCount,
      fileName,
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(csv);
  } catch (err: any) {
    console.error("Export error:", err);
    res.status(500).json({ error: "Export failed" });
  }
});

router.get("/state-reports/history", requireRoles(...ADMIN_ROLES), async (req, res): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const rows = await db
      .select()
      .from(exportHistoryTable)
      .orderBy(desc(exportHistoryTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(exportHistoryTable);

    res.json({ rows, total: count });
  } catch (err: any) {
    console.error("Export history error:", err);
    res.status(500).json({ error: "Failed to load export history" });
  }
});

export const stateReportingRouter = router;
