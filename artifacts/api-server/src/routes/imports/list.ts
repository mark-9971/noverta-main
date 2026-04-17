import { Router, type IRouter } from "express";
import { db, importsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { requireAdmin } from "./shared";

const router: IRouter = Router();

router.get("/imports", requireAdmin, async (req, res): Promise<void> => {
  try {
    const imports = await db.select().from(importsTable).orderBy(desc(importsTable.createdAt));
    res.json(imports.map(i => ({ ...i, createdAt: i.createdAt.toISOString(), updatedAt: i.updatedAt.toISOString() })));
  } catch (e: any) {
    console.error("GET /imports error:", e);
    res.status(500).json({ error: "Failed to fetch import history" });
  }
});

interface TemplateConfig {
  headers: string[];
  rows: string[][];
  instructions?: string[];
}

const templates: Record<string, TemplateConfig> = {
  students: {
    headers: ["first_name", "last_name", "external_id", "grade", "date_of_birth", "disability_category", "placement_type", "school", "case_manager", "parent_guardian_name", "parent_email", "parent_phone", "medicaid_id", "notes"],
    rows: [
      ["Jane", "Doe", "STU-2025-001", "3", "2016-05-14", "SLD", "inclusion", "Lincoln Elementary", "Smith, John", "Maria Doe", "maria.doe@email.com", "617-555-0101", "MED-001", "Transfer from district 3"],
      ["Carlos", "Rivera", "STU-2025-002", "5", "2014-09-22", "ASD", "substantially_separate", "Lincoln Elementary", "Smith, John", "Ana Rivera", "ana.r@email.com", "617-555-0202", "MED-002", ""],
      ["Aisha", "Johnson", "STU-2025-003", "1", "2018-03-10", "DD", "inclusion", "Washington Elementary", "Lee, Sarah", "David Johnson", "d.johnson@email.com", "617-555-0303", "", "New evaluation scheduled"],
      ["Michael", "Chen", "STU-2025-004", "4", "2015-11-28", "OHI", "partial_inclusion", "Lincoln Elementary", "", "Wei Chen", "", "617-555-0404", "MED-004", ""],
    ],
    instructions: [
      "# REQUIRED: first_name, last_name",
      "# OPTIONAL: all other columns — include only what you have",
      "# external_id: your SIS student ID — used for matching in future imports",
      "# grade: numeric grade level (K, 1, 2, ... 12)",
      "# date_of_birth: YYYY-MM-DD or MM/DD/YYYY format",
      "# disability_category: SLD, ASD, DD, OHI, ED, ID, etc.",
      "# placement_type: inclusion, partial_inclusion, substantially_separate, out_of_district",
      "# school: must match an existing school name in Trellis",
      "# case_manager: Last, First format — must match an existing staff member",
      "# DUPLICATES: students matching by first+last name will be skipped (or updated if you choose 'Update existing')",
    ],
  },
  staff: {
    headers: ["first_name", "last_name", "email", "role", "school", "title", "qualifications", "hourly_rate", "npi_number"],
    rows: [
      ["Sarah", "Wilson", "s.wilson@district.edu", "slp", "Lincoln Elementary", "Speech-Language Pathologist", "CCC-SLP, MA Licensed", "85", "1234567890"],
      ["James", "Park", "j.park@district.edu", "ot", "Lincoln Elementary", "Occupational Therapist", "OTR/L", "80", "1234567891"],
      ["Maria", "Santos", "m.santos@district.edu", "bcba", "Washington Elementary", "Board Certified Behavior Analyst", "BCBA, LBA", "90", ""],
      ["David", "Thompson", "d.thompson@district.edu", "para", "Lincoln Elementary", "1:1 Paraprofessional", "", "22", ""],
      ["Emily", "Brown", "e.brown@district.edu", "case_manager", "Washington Elementary", "SPED Liaison", "M.Ed Special Education", "", ""],
    ],
    instructions: [
      "# REQUIRED: first_name, last_name, role",
      "# role must be one of: slp, ot, pt, bcba, para, counselor, case_manager, teacher, coordinator, admin, provider",
      "# Common role aliases accepted: 'Speech-Language Pathologist' → slp, 'Occupational Therapist' → ot, 'Paraprofessional' → para",
      "# email: used for login and duplicate detection — strongly recommended",
      "# school: must match an existing school name in Trellis",
      "# qualifications: licenses, certifications (CCC-SLP, OTR/L, BCBA, etc.)",
      "# hourly_rate: numeric, used for compensatory cost calculations",
      "# npi_number: National Provider Identifier — needed for Medicaid billing",
    ],
  },
  service_requirements: {
    headers: ["student_external_id", "student_first_name", "student_last_name", "service_type", "required_minutes", "interval_type", "delivery_type", "start_date", "end_date", "notes"],
    rows: [
      ["STU-2025-001", "Jane", "Doe", "Speech-Language Therapy", "120", "monthly", "direct", "2025-09-01", "2026-06-15", "Per IEP amendment 2/2025"],
      ["STU-2025-001", "Jane", "Doe", "Occupational Therapy", "60", "monthly", "direct", "2025-09-01", "2026-06-15", "Fine motor goals"],
      ["STU-2025-002", "Carlos", "Rivera", "Applied Behavior Analysis", "600", "monthly", "direct", "2025-09-01", "2026-06-15", "1:1 ABA support"],
      ["STU-2025-002", "Carlos", "Rivera", "Speech-Language Therapy", "60", "monthly", "consult", "2025-09-01", "2026-06-15", "Consultation model"],
      ["STU-2025-003", "Aisha", "Johnson", "Counseling", "30", "weekly", "direct", "2025-09-01", "2026-06-15", ""],
    ],
    instructions: [
      "# Student matching: use student_external_id OR student_first_name + student_last_name (or student_name as 'Last, First')",
      "# REQUIRED: service_type, required_minutes — student must already exist in Trellis",
      "# service_type: Speech-Language Therapy, Occupational Therapy, Physical Therapy, Applied Behavior Analysis, Counseling, Para Support",
      "# required_minutes: total minutes per interval (e.g., 120 minutes per month)",
      "# interval_type: monthly (default), weekly, daily, quarterly",
      "# delivery_type: direct (default) or consult",
      "# start_date / end_date: YYYY-MM-DD or MM/DD/YYYY — defaults to today if blank",
    ],
  },
  sessions: {
    headers: ["student_external_id", "student_first_name", "student_last_name", "service_type", "session_date", "duration_minutes", "status", "is_makeup", "start_time", "end_time", "notes"],
    rows: [
      ["STU-2025-001", "Jane", "Doe", "Speech-Language Therapy", "2025-10-15", "30", "completed", "false", "09:00", "09:30", "Articulation drill — /r/ sounds"],
      ["STU-2025-001", "Jane", "Doe", "Speech-Language Therapy", "2025-10-22", "30", "completed", "false", "09:00", "09:30", ""],
      ["STU-2025-002", "Carlos", "Rivera", "Applied Behavior Analysis", "2025-10-15", "120", "completed", "false", "08:00", "10:00", "Morning ABA block"],
      ["STU-2025-002", "Carlos", "Rivera", "Applied Behavior Analysis", "2025-10-16", "120", "missed", "false", "", "", "Student absent — illness"],
      ["STU-2025-003", "Aisha", "Johnson", "Counseling", "2025-10-14", "30", "completed", "true", "13:00", "13:30", "Makeup from 10/7"],
    ],
    instructions: [
      "# Student matching: use student_external_id OR student_first_name + student_last_name",
      "# REQUIRED: session_date, duration_minutes — student must already exist in Trellis",
      "# session_date: YYYY-MM-DD or MM/DD/YYYY format",
      "# duration_minutes: actual session duration in minutes",
      "# status: completed (default), missed, partial — 'missed' sessions count against compliance",
      "# is_makeup: true/false — marks compensatory/makeup sessions",
      "# start_time / end_time: HH:MM format (optional)",
      "# service_type: must match a service type in Trellis (or leave blank)",
    ],
  },
  aspen_students: {
    headers: ["Student ID", "First Name", "Last Name", "Grade Level", "Disability", "Case Manager", "School", "IEP Start Date", "IEP End Date"],
    rows: [
      ["12345", "Jane", "Doe", "03", "SLD", "Smith, John", "Lincoln ES", "09/01/2025", "06/15/2026"],
      ["12346", "Carlos", "Rivera", "05", "ASD", "Smith, John", "Lincoln ES", "09/01/2025", "08/31/2026"],
      ["12347", "Aisha", "Johnson", "01", "DD", "Lee, Sarah", "Washington ES", "10/15/2025", "10/14/2026"],
    ],
    instructions: [
      "# Aspen X2 student roster export format",
      "# Export from Aspen: Student tab → SPED view → Export → CSV",
      "# Trellis maps: Student ID → external_id, Disability → disability_category",
    ],
  },
  esped_services: {
    headers: ["Student ID", "Student Name", "Service Area", "Service Type", "Frequency", "Duration (min)", "Start Date", "End Date", "Provider"],
    rows: [
      ["12345", "Doe, Jane", "Speech", "Direct", "4x monthly", "30", "09/01/2025", "06/15/2026", "Wilson, Sarah"],
      ["12346", "Rivera, Carlos", "ABA", "Direct", "5x weekly", "120", "09/01/2025", "08/31/2026", "Santos, Maria"],
      ["12347", "Johnson, Aisha", "Counseling", "Direct", "1x weekly", "30", "10/15/2025", "10/14/2026", "Brown, Emily"],
    ],
    instructions: [
      "# eSPED service grid export format",
      "# Export from eSPED: IEP → Service Grid → Export",
      "# Note: Frequency is converted to total monthly minutes automatically",
    ],
  },
  goals_data_tall: {
    headers: ["student_id", "student_first_name", "student_last_name", "goal_name", "goal_type", "measurement_type", "target_direction", "baseline", "date", "value", "notes"],
    rows: [
      ["STU-001", "Jane", "Doe", "Hitting - Physical Aggression", "behavior", "frequency", "decrease", "8", "2024-09-06", "6", "Morning session"],
      ["STU-001", "Jane", "Doe", "Hitting - Physical Aggression", "behavior", "frequency", "decrease", "8", "2024-09-13", "5", ""],
      ["STU-001", "Jane", "Doe", "Identifying Colors", "skill", "percent", "increase", "20", "2024-09-06", "40", ""],
      ["STU-001", "Jane", "Doe", "Identifying Colors", "skill", "percent", "increase", "20", "2024-09-13", "55", "Mastered red and blue"],
    ],
  },
  goals_data_wide: {
    headers: ["student_id", "student_first_name", "student_last_name", "goal_name", "goal_type", "measurement_type", "target_direction", "baseline", "2024-09-06", "2024-09-13", "2024-09-20", "2024-09-27"],
    rows: [
      ["STU-001", "Jane", "Doe", "Identifying Colors", "skill", "percent", "increase", "20", "40", "55", "70", "80"],
      ["STU-001", "Jane", "Doe", "Hitting - Physical Aggression", "behavior", "frequency", "decrease", "8", "6", "5", "4", "3"],
    ],
  },
};

router.get("/imports/templates/:type", requireAdmin, async (req, res): Promise<void> => {
  const { type } = req.params;

  const tmpl = templates[type];
  if (!tmpl) {
    res.status(404).json({ error: `Unknown template type: ${type}` });
    return;
  }

  const lines: string[] = [];
  if (tmpl.instructions) {
    lines.push(...tmpl.instructions);
  }
  lines.push(tmpl.headers.join(","));
  for (const row of tmpl.rows) {
    lines.push(row.map(cell => {
      if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(","));
  }

  const csv = lines.join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=trellis_${type}_template.csv`);
  res.send(csv);
});

export default router;
