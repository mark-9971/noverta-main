import type { SisConnector, SisStudentRecord, SisStaffRecord } from "./types";

function parseCsvRows(csvText: string): Record<string, string>[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^"(.*)"$/, "$1"));
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function findField(row: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== "") return row[c];
  }
  return "";
}

export class CsvConnector implements SisConnector {
  readonly provider = "csv";

  async testConnection(_credentials: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: "CSV import is always available" };
  }

  async fetchStudents(_credentials: Record<string, unknown>): Promise<{
    records: SisStudentRecord[];
    errors: Array<{ field?: string; message: string }>;
  }> {
    return { records: [], errors: [{ message: "Use the CSV upload endpoint to import students" }] };
  }

  async fetchStaff(_credentials: Record<string, unknown>): Promise<{
    records: SisStaffRecord[];
    errors: Array<{ field?: string; message: string }>;
  }> {
    return { records: [], errors: [{ message: "Use the CSV upload endpoint to import staff" }] };
  }

  parseStudentCsv(csvText: string): {
    records: SisStudentRecord[];
    errors: Array<{ field?: string; message: string }>;
    warnings: Array<{ field?: string; message: string }>;
  } {
    const errors: Array<{ field?: string; message: string }> = [];
    const warnings: Array<{ field?: string; message: string }> = [];
    const rows = parseCsvRows(csvText);

    if (rows.length === 0) {
      errors.push({ message: "CSV file is empty or contains only headers" });
      return { records: [], errors, warnings };
    }

    const records: SisStudentRecord[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNum = i + 2;

      const externalId = findField(row, "student_id", "external_id", "sasid", "id", "student_number");
      const firstName = findField(row, "first_name", "firstname", "first");
      const lastName = findField(row, "last_name", "lastname", "last");

      if (!firstName && !lastName) {
        warnings.push({ field: `Row ${lineNum}`, message: "Missing both first and last name, skipping row" });
        continue;
      }

      records.push({
        externalId: externalId || `csv_row_${lineNum}`,
        firstName,
        lastName,
        grade: findField(row, "grade", "grade_level"),
        dateOfBirth: findField(row, "date_of_birth", "dob", "birth_date", "birthdate"),
        schoolExternalId: findField(row, "school_id", "school_code", "school"),
        enrollmentStatus: findField(row, "status", "enrollment_status").toLowerCase() === "inactive" ? "inactive" : "active",
        disabilityCategory: findField(row, "disability", "disability_category"),
        primaryLanguage: findField(row, "primary_language", "language"),
        parentGuardianName: findField(row, "parent_name", "guardian_name", "parent_guardian_name"),
        parentEmail: findField(row, "parent_email", "guardian_email"),
        parentPhone: findField(row, "parent_phone", "guardian_phone"),
      });
    }

    return { records, errors, warnings };
  }

  parseStaffCsv(csvText: string): {
    records: SisStaffRecord[];
    errors: Array<{ field?: string; message: string }>;
    warnings: Array<{ field?: string; message: string }>;
  } {
    const errors: Array<{ field?: string; message: string }> = [];
    const warnings: Array<{ field?: string; message: string }> = [];
    const rows = parseCsvRows(csvText);

    if (rows.length === 0) {
      errors.push({ message: "CSV file is empty or contains only headers" });
      return { records: [], errors, warnings };
    }

    const records: SisStaffRecord[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNum = i + 2;

      const firstName = findField(row, "first_name", "firstname", "first");
      const lastName = findField(row, "last_name", "lastname", "last");

      if (!firstName && !lastName) {
        warnings.push({ field: `Row ${lineNum}`, message: "Missing both first and last name, skipping row" });
        continue;
      }

      records.push({
        externalId: findField(row, "staff_id", "employee_id", "external_id", "id") || `csv_staff_${lineNum}`,
        firstName,
        lastName,
        email: findField(row, "email", "work_email"),
        role: findField(row, "role", "position", "job_role"),
        title: findField(row, "title", "job_title"),
        schoolExternalId: findField(row, "school_id", "school_code", "school"),
        status: findField(row, "status").toLowerCase() === "inactive" ? "inactive" : "active",
      });
    }

    return { records, errors, warnings };
  }
}
