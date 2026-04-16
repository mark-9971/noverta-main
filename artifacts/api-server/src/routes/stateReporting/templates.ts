import {
  ReportTemplate, ValidationWarning, QueryParams,
  fetchStudentsWithIep, ageOnDate, mapDisabilityCode, mapPlacement,
} from "./shared";

export interface IdeaExportRow {
  id: number;
  district: string;
  school: string;
  externalId: string;
  lastName: string;
  firstName: string;
  dateOfBirth: string;
  age: number | null;
  grade: string;
  disabilityCode: string;
  disabilityCategory: string;
  placementCode: string;
  placementType: string;
  iepStartDate: string;
  iepEndDate: string;
  primaryLanguage: string;
  esyEligible: string;
  serviceList: string;
  totalWeeklyMinutes: number;
}

export interface SimsExportRow {
  id: number;
  externalId: string;
  lastName: string;
  firstName: string;
  dateOfBirth: string;
  grade: string;
  schoolCode: string;
  schoolName: string;
  district: string;
  spedStatus: string;
  disabilityCategory: string;
  disabilityCode: string;
  placementType: string;
  iepStartDate: string;
  iepEndDate: string;
  primaryLanguage: string;
  caseManager: string;
  serviceList: string;
  serviceCategories: string;
  totalMonthlyMinutes: number;
  esyEligible: string;
}

export interface SimsServiceRow {
  id: number;
  studentExternalId: string;
  studentLastName: string;
  studentFirstName: string;
  schoolCode: string;
  serviceName: string;
  serviceCategory: string;
  deliveryType: string;
  setting: string;
  requiredMinutes: number;
  intervalType: string;
  monthlyMinutes: number;
}

const ideaChildCountTemplate: ReportTemplate<IdeaExportRow> = {
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
  validate(rows: IdeaExportRow[]): ValidationWarning[] {
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
  async query(params: QueryParams): Promise<IdeaExportRow[]> {
    const data = await fetchStudentsWithIep({ ...params, spedOnly: true });
    const refDate = new Date().toISOString().slice(0, 10);
    return data.map((s) => {
      const weeklyMinutes = s.services.reduce((total: number, svc) => {
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

const maSimsTemplate: ReportTemplate<SimsExportRow> = {
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
  validate(rows: SimsExportRow[]): ValidationWarning[] {
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
  async query(params: QueryParams): Promise<SimsExportRow[]> {
    const data = await fetchStudentsWithIep({ ...params, spedOnly: true });
    return data.map((s) => {
      const monthlyMinutes = s.services.reduce((total: number, svc) => {
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

const maSimsServiceTemplate: ReportTemplate<SimsServiceRow> = {
  key: "ma_sims_services",
  label: "MA SIMS Service Delivery Export",
  description: "Massachusetts SIMS service delivery file — one row per student per service requirement, for state service reporting.",
  columns: [
    { header: "SASID", field: "studentExternalId" },
    { header: "Student Last Name", field: "studentLastName" },
    { header: "Student First Name", field: "studentFirstName" },
    { header: "School Code", field: "schoolCode" },
    { header: "Service Name", field: "serviceName" },
    { header: "Service Category", field: "serviceCategory" },
    { header: "Delivery Type", field: "deliveryType" },
    { header: "Setting", field: "setting" },
    { header: "Required Minutes", field: "requiredMinutes" },
    { header: "Interval", field: "intervalType" },
    { header: "Monthly Minutes", field: "monthlyMinutes" },
  ],
  validate(rows: SimsServiceRow[]): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const studentKey = `${r.studentFirstName} ${r.studentLastName}`;
      if (!r.studentExternalId && !seen.has(studentKey)) {
        seen.add(studentKey);
        warnings.push({ studentId: r.id, studentName: studentKey, field: "SASID", message: "Missing SASID — required for SIMS service file", severity: "error" });
      }
      if (!r.serviceName) {
        warnings.push({ studentId: r.id, studentName: studentKey, field: "Service", message: "Service name is blank", severity: "warning" });
      }
    }
    return warnings;
  },
  async query(params: QueryParams): Promise<SimsServiceRow[]> {
    const data = await fetchStudentsWithIep({ ...params, spedOnly: true });
    const rows: SimsServiceRow[] = [];
    for (const s of data) {
      for (const svc of s.services) {
        let monthlyMinutes = svc.requiredMinutes;
        if (svc.intervalType === "weekly") monthlyMinutes = svc.requiredMinutes * 4;
        else if (svc.intervalType === "daily") monthlyMinutes = svc.requiredMinutes * 20;
        rows.push({
          id: s.id,
          studentExternalId: s.externalId ?? "",
          studentLastName: s.lastName,
          studentFirstName: s.firstName,
          schoolCode: s.schoolId ? String(s.schoolId) : "",
          serviceName: svc.serviceName,
          serviceCategory: svc.serviceCategory,
          deliveryType: svc.deliveryType,
          setting: svc.setting ?? "",
          requiredMinutes: svc.requiredMinutes,
          intervalType: svc.intervalType,
          monthlyMinutes,
        });
      }
    }
    return rows;
  },
};

export type AnyReportTemplate = ReportTemplate<IdeaExportRow> | ReportTemplate<SimsExportRow> | ReportTemplate<SimsServiceRow>;

export const TEMPLATES: Record<string, AnyReportTemplate> = {
  idea_child_count: ideaChildCountTemplate,
  ma_sims: maSimsTemplate,
  ma_sims_services: maSimsServiceTemplate,
};
