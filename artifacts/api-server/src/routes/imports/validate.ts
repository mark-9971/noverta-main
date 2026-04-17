import { Router, type IRouter } from "express";
import { db, studentsTable, staffTable, schoolsTable, serviceTypesTable } from "@workspace/db";
import { and, ilike, isNull, eq } from "drizzle-orm";
import { parseCsvRows, findOrGuessStudentId, findServiceTypeId, normalizeDate, requireAdmin } from "./shared";

const router: IRouter = Router();

interface RowValidation {
  row: number;
  status: "valid" | "warning" | "error";
  messages: string[];
  data: Record<string, string>;
}

interface ColumnMapping {
  csvHeader: string;
  mappedTo: string | null;
  required: boolean;
  sampleValues: string[];
}

const EXPECTED_COLUMNS: Record<string, { required: string[]; optional: string[] }> = {
  students: {
    required: ["first_name", "last_name"],
    optional: ["external_id", "grade", "placement_type", "date_of_birth", "disability_category", "school", "case_manager", "parent_email", "parent_phone", "parent_guardian_name", "medicaid_id", "notes"],
  },
  staff: {
    required: ["first_name", "last_name", "role"],
    optional: ["email", "school", "title", "qualifications", "hourly_rate", "npi_number", "credentials"],
  },
  "service-requirements": {
    required: ["service_type", "required_minutes"],
    optional: ["student_external_id", "student_first_name", "student_last_name", "student_name", "interval_type", "delivery_type", "start_date", "end_date", "provider_name", "notes"],
  },
  sessions: {
    required: ["session_date", "duration_minutes"],
    optional: ["student_external_id", "student_first_name", "student_last_name", "student_name", "service_type", "status", "is_makeup", "start_time", "end_time", "notes"],
  },
};

const COLUMN_ALIASES: Record<string, string[]> = {
  first_name: ["first", "firstname", "first_name", "student_first_name"],
  last_name: ["last", "lastname", "last_name", "student_last_name"],
  external_id: ["external_id", "student_id", "student_external_id", "id"],
  grade: ["grade", "grade_level"],
  placement_type: ["placement_type", "placement"],
  date_of_birth: ["date_of_birth", "dob", "birth_date", "birthday"],
  disability_category: ["disability_category", "disability", "primary_disability"],
  school: ["school", "school_name", "building"],
  case_manager: ["case_manager", "liaison", "sped_liaison"],
  parent_email: ["parent_email", "guardian_email", "family_email"],
  parent_phone: ["parent_phone", "guardian_phone", "family_phone"],
  parent_guardian_name: ["parent_guardian_name", "parent_name", "guardian_name"],
  medicaid_id: ["medicaid_id", "medicaid"],
  role: ["role", "position", "job_title", "title"],
  email: ["email", "email_address", "work_email"],
  qualifications: ["qualifications", "credentials", "license", "certifications"],
  hourly_rate: ["hourly_rate", "rate", "pay_rate"],
  npi_number: ["npi_number", "npi"],
  service_type: ["service_type", "service_area", "service", "therapy_type"],
  required_minutes: ["required_minutes", "duration_min", "duration", "minutes"],
  interval_type: ["interval_type", "frequency", "schedule"],
  delivery_type: ["delivery_type", "service_model"],
  start_date: ["start_date", "iep_start", "effective_date"],
  end_date: ["end_date", "iep_end", "expiration_date"],
  session_date: ["session_date", "date", "visit_date"],
  duration_minutes: ["duration_minutes", "duration", "minutes", "session_minutes"],
  status: ["status", "session_status"],
  is_makeup: ["is_makeup", "makeup"],
  start_time: ["start_time", "time_in"],
  end_time: ["end_time", "time_out"],
  notes: ["notes", "comments", "note"],
  provider_name: ["provider_name", "provider", "therapist"],
  title: ["title", "job_title"],
};

function autoMapColumns(csvHeaders: string[], importType: string): Record<string, string> {
  const expected = EXPECTED_COLUMNS[importType];
  if (!expected) return {};

  const allExpected = [...expected.required, ...expected.optional];
  const mapping: Record<string, string> = {};

  for (const csvHeader of csvHeaders) {
    const normalized = csvHeader.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    for (const field of allExpected) {
      const aliases = COLUMN_ALIASES[field] || [field];
      if (aliases.includes(normalized) && !Object.values(mapping).includes(field)) {
        mapping[csvHeader] = field;
        break;
      }
    }
  }

  return mapping;
}

const VALID_ROLES = new Set(["admin", "bcba", "provider", "para", "coordinator", "case_manager", "teacher", "slp", "ot", "pt", "counselor"]);

const ROLE_ALIASES: Record<string, string> = {
  "speech_language_pathologist": "slp",
  "speech_pathologist": "slp",
  "speech_therapist": "slp",
  "speech": "slp",
  "occupational_therapist": "ot",
  "physical_therapist": "pt",
  "paraprofessional": "para",
  "paraeducator": "para",
  "aide": "para",
  "board_certified_behavior_analyst": "bcba",
  "behavior_analyst": "bcba",
  "administrator": "admin",
  "special_education_coordinator": "coordinator",
  "sped_coordinator": "coordinator",
  "teacher_of_record": "teacher",
  "school_counselor": "counselor",
  "school_psychologist": "counselor",
  "social_worker": "counselor",
};

function normalizeRoleForValidation(raw: string): string | null {
  const r = raw.toLowerCase().trim().replace(/[\s\-]+/g, "_").replace(/[^a-z_]/g, "").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (VALID_ROLES.has(r)) return r;
  if (ROLE_ALIASES[r]) return ROLE_ALIASES[r];
  for (const [key, val] of Object.entries(ROLE_ALIASES)) {
    if (r.includes(key) || key.includes(r)) return val;
  }
  return null;
}

router.post("/imports/validate", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { csvData, importType, columnMapping: userMapping } = req.body;
    if (!csvData || typeof csvData !== "string") {
      res.status(400).json({ error: "csvData is required" });
      return;
    }
    if (!importType || !EXPECTED_COLUMNS[importType]) {
      res.status(400).json({ error: `Invalid importType. Supported: ${Object.keys(EXPECTED_COLUMNS).join(", ")}` });
      return;
    }

    const { headers: rawHeaders, rows: rawRows } = parseCsvRows(csvData);
    if (rawRows.length === 0) {
      res.status(400).json({ error: "No data rows found in CSV" });
      return;
    }

    const autoMapping = autoMapColumns(rawHeaders, importType);
    const effectiveMapping: Record<string, string> = { ...autoMapping, ...(userMapping || {}) };

    const remappedRows = rawRows.map(row => {
      const mapped: Record<string, string> = {};
      for (const [csvH, value] of Object.entries(row)) {
        const origHeader = rawHeaders.find(h => h.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") === csvH);
        const targetField = effectiveMapping[origHeader || csvH] || effectiveMapping[csvH] || csvH;
        mapped[targetField] = value;
      }
      return mapped;
    });

    const expected = EXPECTED_COLUMNS[importType];
    const validations: RowValidation[] = [];

    const columnMappings: ColumnMapping[] = rawHeaders.map(h => ({
      csvHeader: h,
      mappedTo: effectiveMapping[h] || null,
      required: expected.required.includes(effectiveMapping[h] || ""),
      sampleValues: rawRows.slice(0, 3).map(r => {
        const normH = h.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
        return r[normH] || "";
      }),
    }));

    const unmappedRequired = expected.required.filter(
      r => !Object.values(effectiveMapping).includes(r)
    );

    const maxValidate = Math.min(remappedRows.length, 200);

    for (let i = 0; i < maxValidate; i++) {
      const row = remappedRows[i];
      const messages: string[] = [];
      let status: "valid" | "warning" | "error" = "valid";

      if (importType === "students") {
        const fn = row.first_name || row.first || row.firstname || "";
        const ln = row.last_name || row.last || row.lastname || "";
        if (!fn || !ln) { messages.push("Missing first_name or last_name"); status = "error"; }
        else {
          const existing = await db.select({ id: studentsTable.id }).from(studentsTable)
            .where(and(ilike(studentsTable.firstName, fn), ilike(studentsTable.lastName, ln))).limit(1);
          if (existing.length > 0) { messages.push(`Student "${fn} ${ln}" already exists (id=${existing[0].id})`); status = "warning"; }
        }
        const dob = row.date_of_birth || row.dob || "";
        if (dob && !normalizeDate(dob)) { messages.push(`Invalid date_of_birth: "${dob}"`); status = status === "error" ? "error" : "warning"; }
      }

      if (importType === "staff") {
        const fn = row.first_name || row.first || row.firstname || "";
        const ln = row.last_name || row.last || row.lastname || "";
        const roleRaw = row.role || row.position || row.title || "";
        if (!fn || !ln) { messages.push("Missing first_name or last_name"); status = "error"; }
        if (!roleRaw) { messages.push("Missing role"); status = "error"; }
        else {
          const normalizedRole = normalizeRoleForValidation(roleRaw);
          if (!normalizedRole) { messages.push(`Unknown role "${roleRaw}" — expected: slp, ot, pt, bcba, para, counselor, case_manager, teacher, coordinator, admin, provider (or common titles like "Speech-Language Pathologist")`); status = "error"; }
        }
        if (fn && ln) {
          const email = row.email || row.email_address || "";
          const existByEmail = email ? await db.select({ id: staffTable.id }).from(staffTable).where(and(ilike(staffTable.email, email), isNull(staffTable.deletedAt))).limit(1) : [];
          const existByName = existByEmail.length === 0 ? await db.select({ id: staffTable.id }).from(staffTable).where(and(ilike(staffTable.firstName, fn), ilike(staffTable.lastName, ln), isNull(staffTable.deletedAt))).limit(1) : [];
          if (existByEmail.length > 0 || existByName.length > 0) { messages.push(`Staff "${fn} ${ln}" already exists`); if (status === "valid") status = "warning"; }
        }
      }

      if (importType === "service-requirements") {
        const studentId = await findOrGuessStudentId(row);
        if (!studentId) { messages.push("Student not found — check name or external_id"); status = "error"; }
        const svc = row.service_type || row.service_area || row.service || "";
        if (!svc) { messages.push("Missing service_type"); status = "error"; }
        else {
          const sid = await findServiceTypeId(svc);
          if (!sid) { messages.push(`Unknown service type "${svc}"`); status = "error"; }
        }
        const mins = parseInt(row.required_minutes || row.duration_min || row.duration || "0");
        if (!mins || mins <= 0) { messages.push("Invalid or missing required_minutes"); status = "error"; }
      }

      if (importType === "sessions") {
        const studentId = await findOrGuessStudentId(row);
        if (!studentId) { messages.push("Student not found"); status = "error"; }
        const date = row.session_date || row.date || "";
        if (!date) { messages.push("Missing session_date"); status = "error"; }
        else if (!normalizeDate(date)) { messages.push(`Invalid session_date: "${date}"`); status = status === "error" ? "error" : "warning"; }
        const dur = parseInt(row.duration_minutes || row.duration || row.minutes || "0");
        if (!dur || dur <= 0) { messages.push("Invalid or missing duration_minutes"); status = "error"; }
      }

      if (messages.length === 0) messages.push("Ready to import");
      validations.push({ row: i + 2, status, messages, data: row });
    }

    const summary = {
      totalRows: rawRows.length,
      validatedRows: maxValidate,
      valid: validations.filter(v => v.status === "valid").length,
      warnings: validations.filter(v => v.status === "warning").length,
      errors: validations.filter(v => v.status === "error").length,
    };

    res.json({
      summary,
      columnMappings,
      unmappedRequired,
      validations,
    });
  } catch (e: any) {
    console.error("POST /imports/validate error:", e);
    res.status(500).json({ error: "Validation failed: " + e.message });
  }
});

export default router;
