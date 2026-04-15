import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  importsTable, studentsTable, sessionLogsTable, serviceRequirementsTable, serviceTypesTable,
  behaviorTargetsTable, programTargetsTable, dataSessionsTable, behaviorDataTable, programDataTable, iepGoalsTable
} from "@workspace/db";
import { desc, eq, and, ilike, isNull } from "drizzle-orm";
import { requireRoles } from "../middlewares/auth";

const router: IRouter = Router();
const requireAdmin = requireRoles("admin");

router.get("/imports", async (req, res): Promise<void> => {
  try {
    const imports = await db.select().from(importsTable).orderBy(desc(importsTable.createdAt));
    res.json(imports.map(i => ({ ...i, createdAt: i.createdAt.toISOString(), updatedAt: i.updatedAt.toISOString() })));
  } catch (e: any) {
    console.error("GET /imports error:", e);
    res.status(500).json({ error: "Failed to fetch import history" });
  }
});

router.get("/imports/templates/:type", async (req, res): Promise<void> => {
  const { type } = req.params;
  const templates: Record<string, { headers: string[]; sampleRow: string[] }> = {
    students: {
      headers: ["first_name", "last_name", "external_id", "grade", "placement_type", "notes"],
      sampleRow: ["Jane", "Doe", "STU-2025-001", "3", "gen_ed", "Transfer from Lincoln ES"],
    },
    service_requirements: {
      headers: ["student_external_id", "student_first_name", "student_last_name", "service_type", "required_minutes", "interval_type", "delivery_type", "start_date", "end_date", "notes"],
      sampleRow: ["STU-2025-001", "Jane", "Doe", "Speech-Language Therapy", "60", "monthly", "direct", "2025-09-01", "2026-06-15", "Per IEP amendment 2/2025"],
    },
    sessions: {
      headers: ["student_external_id", "student_first_name", "student_last_name", "service_type", "session_date", "duration_minutes", "status", "is_makeup", "start_time", "end_time", "notes"],
      sampleRow: ["STU-2025-001", "Jane", "Doe", "Speech-Language Therapy", "2025-10-15", "30", "completed", "false", "09:00", "09:30", "Articulation drill"],
    },
    aspen_students: {
      headers: ["Student ID", "First Name", "Last Name", "Grade Level", "Disability", "Case Manager", "School", "IEP Start Date", "IEP End Date"],
      sampleRow: ["12345", "Jane", "Doe", "03", "SLD", "Smith, John", "Lincoln ES", "09/01/2025", "06/15/2026"],
    },
    esped_services: {
      headers: ["Student ID", "Student Name", "Service Area", "Service Type", "Frequency", "Duration (min)", "Start Date", "End Date", "Provider"],
      sampleRow: ["12345", "Doe, Jane", "Speech", "Direct", "2x weekly", "30", "09/01/2025", "06/15/2026", "Wilson, Sarah"],
    },
    goals_data_tall: {
      headers: ["student_id", "student_first_name", "student_last_name", "goal_name", "goal_type", "measurement_type", "target_direction", "baseline", "date", "value", "notes"],
      sampleRow: ["STU-001", "Jane", "Doe", "Hitting - Physical Aggression", "behavior", "frequency", "decrease", "8", "2024-09-06", "6", "Morning session"],
    },
    goals_data_wide: {
      headers: ["student_id", "student_first_name", "student_last_name", "goal_name", "goal_type", "measurement_type", "target_direction", "baseline", "2024-09-06", "2024-09-13", "2024-09-20", "2024-09-27"],
      sampleRow: ["STU-001", "Jane", "Doe", "Identifying Colors", "skill", "percent", "increase", "20", "40", "55", "70", "80"],
    },
  };

  const tmpl = templates[type];
  if (!tmpl) {
    res.status(404).json({ error: `Unknown template type: ${type}` });
    return;
  }

  const csv = [tmpl.headers.join(","), tmpl.sampleRow.join(",")].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=trellis_${type}_template.csv`);
  res.send(csv);
});

function parseCsvRows(csvData: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csvData.trim().split("\n").map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, ""));
  const rows = lines.slice(1).map(line => {
    const values = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });

  return { headers, rows };
}

async function findOrGuessStudentId(row: Record<string, string>): Promise<number | null> {
  const extId = row.student_external_id || row.student_id || row.external_id || "";
  const firstName = row.student_first_name || row.first_name || "";
  const lastName = row.student_last_name || row.last_name || "";

  let nameParts = (row.student_name || "").split(",").map(s => s.trim());
  const derivedLast = nameParts[0] || lastName;
  const derivedFirst = nameParts[1] || firstName;

  if (extId) {
    const found = await db.select().from(studentsTable).where(eq(studentsTable.externalId, extId)).limit(1);
    if (found.length > 0) return found[0].id;
  }

  if (derivedFirst && derivedLast) {
    const found = await db.select().from(studentsTable)
      .where(and(ilike(studentsTable.firstName, derivedFirst), ilike(studentsTable.lastName, derivedLast)))
      .limit(1);
    if (found.length > 0) return found[0].id;
  }

  return null;
}

async function findServiceTypeId(name: string): Promise<number | null> {
  if (!name) return null;
  const normalized = name.toLowerCase().trim();
  const types = await db.select().from(serviceTypesTable);
  const exact = types.find(t => t.name.toLowerCase() === normalized);
  if (exact) return exact.id;
  const partial = types.find(t => normalized.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(normalized));
  if (partial) return partial.id;
  const catMap: Record<string, string> = {
    speech: "speech", slp: "speech", "language therapy": "speech",
    ot: "ot", occupational: "ot",
    pt: "pt", physical: "pt",
    aba: "aba", behavior: "aba", bcba: "aba",
    counsel: "counseling",
    para: "para_support",
  };
  for (const [key, cat] of Object.entries(catMap)) {
    if (normalized.includes(key)) {
      const found = types.find(t => t.category === cat);
      if (found) return found.id;
    }
  }
  return null;
}


router.post("/imports/students", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { csvData, fileName } = req.body;
    if (!csvData || typeof csvData !== "string") {
      res.status(400).json({ error: "csvData is required" });
      return;
    }

    const { headers, rows } = parseCsvRows(csvData);
    if (rows.length === 0) {
      res.status(400).json({ error: "No data rows found in CSV" });
      return;
    }

    let imported = 0;
    let errored = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const firstName = row.first_name || row.first || row.firstname || "";
        const lastName = row.last_name || row.last || row.lastname || "";

        if (!firstName || !lastName) {
          errors.push(`Row ${i + 2}: Missing first_name or last_name`);
          errored++;
          continue;
        }

        const existing = await db.select().from(studentsTable)
          .where(and(ilike(studentsTable.firstName, firstName), ilike(studentsTable.lastName, lastName)))
          .limit(1);
        if (existing.length > 0) {
          errors.push(`Row ${i + 2}: Student "${firstName} ${lastName}" already exists (id=${existing[0].id})`);
          errored++;
          continue;
        }

        await db.insert(studentsTable).values({
          firstName,
          lastName,
          externalId: row.external_id || row.student_id || null,
          grade: row.grade || row.grade_level || null,
          placementType: row.placement_type || null,
          notes: row.notes || null,
          status: "active",
        });
        imported++;
      } catch (e: any) {
        console.error(`Student import row ${i + 2} error:`, e);
        errors.push(`Row ${i + 2}: Failed to import row`);
        errored++;
      }
    }

    const [importRecord] = await db.insert(importsTable).values({
      importType: "students",
      fileName: fileName ?? null,
      status: errored === rows.length ? "failed" : "completed",
      rowsProcessed: rows.length,
      rowsImported: imported,
      rowsErrored: errored,
      errorSummary: errors.length > 0 ? errors.slice(0, 20).join("\n") : null,
    }).returning();

    res.status(201).json({
      ...importRecord,
      createdAt: importRecord.createdAt.toISOString(),
      updatedAt: importRecord.updatedAt.toISOString(),
      errors: errors.slice(0, 20),
    });
  } catch (e: any) {
    console.error("POST /imports/students error:", e);
    res.status(500).json({ error: "Failed to process student import" });
  }
});

router.post("/imports/service-requirements", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { csvData, fileName } = req.body;
    if (!csvData || typeof csvData !== "string") {
      res.status(400).json({ error: "csvData is required" });
      return;
    }

    const { headers, rows } = parseCsvRows(csvData);
    if (rows.length === 0) {
      res.status(400).json({ error: "No data rows found" });
      return;
    }

    let imported = 0;
    let errored = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const studentId = await findOrGuessStudentId(row);
        if (!studentId) {
          errors.push(`Row ${i + 2}: Could not find student`);
          errored++;
          continue;
        }

        const serviceTypeName = row.service_type || row.service_area || row.service || "";
        const serviceTypeId = await findServiceTypeId(serviceTypeName);
        if (!serviceTypeId) {
          errors.push(`Row ${i + 2}: Unknown service type "${serviceTypeName}"`);
          errored++;
          continue;
        }

        const minutes = parseInt(row.required_minutes || row.duration_min || row.duration || "0");
        if (!minutes || minutes <= 0) {
          errors.push(`Row ${i + 2}: Invalid required_minutes`);
          errored++;
          continue;
        }

        const interval = (row.interval_type || row.frequency || "monthly").toLowerCase();
        let intervalType = "monthly";
        if (interval.includes("week")) intervalType = "weekly";
        else if (interval.includes("day") || interval.includes("daily")) intervalType = "daily";
        else if (interval.includes("quarter")) intervalType = "quarterly";

        const startDate = row.start_date || new Date().toISOString().split("T")[0];
        const endDate = row.end_date || null;

        await db.insert(serviceRequirementsTable).values({
          studentId,
          serviceTypeId,
          deliveryType: (row.delivery_type || row.service_type_col || "direct").toLowerCase().includes("consult") ? "consult" : "direct",
          requiredMinutes: minutes,
          intervalType,
          startDate,
          endDate,
          notes: row.notes || null,
          active: true,
        });
        imported++;
      } catch (e: any) {
        console.error(`Service req import row ${i + 2} error:`, e);
        errors.push(`Row ${i + 2}: Failed to import row`);
        errored++;
      }
    }

    const [importRecord] = await db.insert(importsTable).values({
      importType: "service_requirements",
      fileName: fileName ?? null,
      status: errored === rows.length ? "failed" : "completed",
      rowsProcessed: rows.length,
      rowsImported: imported,
      rowsErrored: errored,
      errorSummary: errors.length > 0 ? errors.slice(0, 20).join("\n") : null,
    }).returning();

    res.status(201).json({
      ...importRecord,
      createdAt: importRecord.createdAt.toISOString(),
      updatedAt: importRecord.updatedAt.toISOString(),
      errors: errors.slice(0, 20),
    });
  } catch (e: any) {
    console.error("POST /imports/service-requirements error:", e);
    res.status(500).json({ error: "Failed to process service requirements import" });
  }
});

router.post("/imports/sessions", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { csvData, fileName } = req.body;
    if (!csvData || typeof csvData !== "string") {
      res.status(400).json({ error: "csvData is required" });
      return;
    }

    const { headers, rows } = parseCsvRows(csvData);
    if (rows.length === 0) {
      res.status(400).json({ error: "No data rows found" });
      return;
    }

    let imported = 0;
    let errored = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const studentId = await findOrGuessStudentId(row);
        if (!studentId) {
          errors.push(`Row ${i + 2}: Could not find student`);
          errored++;
          continue;
        }

        const serviceTypeName = row.service_type || row.service || "";
        const serviceTypeId = serviceTypeName ? await findServiceTypeId(serviceTypeName) : null;

        const sessionDate = row.session_date || row.date || "";
        if (!sessionDate) {
          errors.push(`Row ${i + 2}: Missing session_date`);
          errored++;
          continue;
        }

        const dateNormalized = sessionDate.includes("/")
          ? (() => {
              const parts = sessionDate.split("/");
              return parts.length === 3 ? `${parts[2].padStart(4, "20")}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}` : sessionDate;
            })()
          : sessionDate;

        const duration = parseInt(row.duration_minutes || row.duration || row.minutes || "0");
        if (!duration || duration <= 0) {
          errors.push(`Row ${i + 2}: Invalid duration_minutes`);
          errored++;
          continue;
        }

        const statusRaw = (row.status || "completed").toLowerCase();
        const status = statusRaw.includes("miss") ? "missed" : statusRaw.includes("partial") ? "partial" : "completed";
        const isMakeup = (row.is_makeup || "").toLowerCase() === "true" || (row.is_makeup || "") === "1";

        await db.insert(sessionLogsTable).values({
          studentId,
          serviceTypeId,
          sessionDate: dateNormalized,
          startTime: row.start_time || null,
          endTime: row.end_time || null,
          durationMinutes: duration,
          status,
          isMakeup,
          notes: row.notes || null,
        });
        imported++;
      } catch (e: any) {
        console.error(`Session import row ${i + 2} error:`, e);
        errors.push(`Row ${i + 2}: Failed to import row`);
        errored++;
      }
    }

    const [importRecord] = await db.insert(importsTable).values({
      importType: "sessions",
      fileName: fileName ?? null,
      status: errored === rows.length ? "failed" : "completed",
      rowsProcessed: rows.length,
      rowsImported: imported,
      rowsErrored: errored,
      errorSummary: errors.length > 0 ? errors.slice(0, 20).join("\n") : null,
    }).returning();

    res.status(201).json({
      ...importRecord,
      createdAt: importRecord.createdAt.toISOString(),
      updatedAt: importRecord.updatedAt.toISOString(),
      errors: errors.slice(0, 20),
    });
  } catch (e: any) {
    console.error("POST /imports/sessions error:", e);
    res.status(500).json({ error: "Failed to process session import" });
  }
});

function normalizeDate(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [m, d, y] = s.split("/");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(s)) {
    const [m, d, y] = s.split("/");
    return `20${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
    const [m, d, y] = s.split("-");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function isDateLikeHeader(h: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(h) ||
    /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(h) ||
    /^\d{1,2}-\d{1,2}-\d{2,4}$/.test(h) ||
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[\s\-_]\d{1,2}/i.test(h) ||
    /^\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(h);
}

const META_HEADERS = new Set([
  "student_id", "student_external_id", "external_id",
  "student_first_name", "first_name", "first",
  "student_last_name", "last_name", "last",
  "student_name",
  "goal_name", "goal", "target_name", "behavior_name", "program_name",
  "goal_type", "type",
  "measurement_type", "measurement",
  "target_direction", "direction",
  "baseline",
  "goal_area", "domain", "service_area",
  "start_date", "end_date",
  "annual_goal", "goal_description", "notes",
]);

async function findOrCreateBehaviorTarget(
  studentId: number,
  name: string,
  measurementType: string,
  targetDirection: string,
  baseline: string | null
): Promise<number> {
  const existing = await db.select().from(behaviorTargetsTable)
    .where(and(eq(behaviorTargetsTable.studentId, studentId), ilike(behaviorTargetsTable.name, name)))
    .limit(1);
  if (existing.length > 0) return existing[0].id;

  const [created] = await db.insert(behaviorTargetsTable).values({
    studentId,
    name,
    measurementType: measurementType || "frequency",
    targetDirection: targetDirection || "decrease",
    baselineValue: baseline ? baseline : null,
    active: true,
  }).returning();
  return created.id;
}

async function findOrCreateProgramTarget(
  studentId: number,
  name: string,
  domain: string | null
): Promise<number> {
  const existing = await db.select().from(programTargetsTable)
    .where(and(eq(programTargetsTable.studentId, studentId), ilike(programTargetsTable.name, name)))
    .limit(1);
  if (existing.length > 0) return existing[0].id;

  const [created] = await db.insert(programTargetsTable).values({
    studentId,
    name,
    programType: "discrete_trial",
    domain: domain || null,
    active: true,
  }).returning();
  return created.id;
}

async function findOrCreateIepGoal(
  studentId: number,
  goalName: string,
  goalType: "behavior" | "skill",
  targetId: number,
  goalArea: string,
  annualGoal: string,
  baseline: string | null,
  serviceArea: string | null
): Promise<number> {
  const existing = await db.select().from(iepGoalsTable)
    .where(and(eq(iepGoalsTable.studentId, studentId), ilike(iepGoalsTable.annualGoal, goalName)))
    .limit(1);
  if (existing.length > 0) return existing[0].id;

  const [created] = await db.insert(iepGoalsTable).values({
    studentId,
    goalArea,
    goalNumber: 1,
    annualGoal,
    baseline,
    targetCriterion: null,
    measurementMethod: goalType === "behavior" ? "direct observation" : "trial data",
    programTargetId: goalType === "skill" ? targetId : null,
    behaviorTargetId: goalType === "behavior" ? targetId : null,
    serviceArea,
    status: "active",
    active: true,
  }).returning();
  return created.id;
}

async function getOrCreateVagueSession(studentId: number, dateStr: string): Promise<number> {
  const existing = await db.select().from(dataSessionsTable)
    .where(and(
      eq(dataSessionsTable.studentId, studentId),
      eq(dataSessionsTable.sessionDate, dateStr),
      isNull(dataSessionsTable.staffId)
    ))
    .limit(1);
  if (existing.length > 0) return existing[0].id;

  const existingLog = await db.select().from(sessionLogsTable)
    .where(and(
      eq(sessionLogsTable.studentId, studentId),
      eq(sessionLogsTable.sessionDate, dateStr),
      isNull(sessionLogsTable.staffId)
    ))
    .limit(1);

  let sessionLogId: number;
  if (existingLog.length > 0) {
    sessionLogId = existingLog[0].id;
  } else {
    const [log] = await db.insert(sessionLogsTable).values({
      studentId,
      sessionDate: dateStr,
      durationMinutes: 30,
      status: "completed",
      notes: "Imported historical data — no session detail available",
    }).returning();
    sessionLogId = log.id;
  }

  const [ds] = await db.insert(dataSessionsTable).values({
    studentId,
    sessionDate: dateStr,
    sessionLogId,
    notes: "imported",
  }).returning();
  return ds.id;
}

function detectGoalType(rawType: string, goalName: string): "behavior" | "skill" {
  const t = (rawType || "").toLowerCase();
  if (t.includes("behav") || t.includes("reduce") || t.includes("decrease")) return "behavior";
  if (t.includes("skill") || t.includes("program") || t.includes("acqui") || t.includes("academic")) return "skill";
  const name = goalName.toLowerCase();
  const behaviorKeywords = ["aggress", "hitting", "biting", "tantrum", "elopement", "self-injur", "disrupt", "non-complian", "vocal", "stereo", "pica", "property"];
  for (const kw of behaviorKeywords) {
    if (name.includes(kw)) return "behavior";
  }
  return "skill";
}

function parseTsvRows(tsvData: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = tsvData.trim().split("\n").map(l => l.replace(/\r$/, "")).filter(l => l.length > 0);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split("\t").map(h => h.trim().toLowerCase().replace(/[^a-z0-9_\-\/]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, ""));
  const rows = lines.slice(1).map(line => {
    const cols = line.split("\t");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (cols[i] ?? "").trim(); });
    return row;
  });
  return { headers, rows };
}

router.post("/imports/goals-data", requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  try {
    const { csvData, fileName } = req.body;
    if (!csvData || typeof csvData !== "string") {
      res.status(400).json({ error: "csvData is required" });
      return;
    }

    const isTsv = csvData.includes("\t");
    const { headers, rows } = isTsv ? parseTsvRows(csvData) : parseCsvRows(csvData);

    if (rows.length === 0) {
      res.status(400).json({ error: "No data rows found" });
      return;
    }

    const dateColumns = headers.filter(h => !META_HEADERS.has(h) && isDateLikeHeader(h));
    const isTallFormat = headers.includes("date") && headers.includes("value");
    const isWideFormat = dateColumns.length >= 1 && !isTallFormat;

    let imported = 0;
    let errored = 0;
    const errors: string[] = [];

    const processDataPoint = async (
      studentId: number,
      goalType: "behavior" | "skill",
      targetId: number,
      dateStr: string,
      rawValue: string,
      notes: string | null
    ) => {
      const date = normalizeDate(dateStr);
      if (!date) throw new Error(`Invalid date: ${dateStr}`);
      const numValue = parseFloat(rawValue);
      if (isNaN(numValue)) throw new Error(`Invalid value: ${rawValue}`);

      const dataSessionId = await getOrCreateVagueSession(studentId, date);

      if (goalType === "behavior") {
        const existing = await db.select().from(behaviorDataTable)
          .where(and(eq(behaviorDataTable.dataSessionId, dataSessionId), eq(behaviorDataTable.behaviorTargetId, targetId)))
          .limit(1);
        if (existing.length === 0) {
          await db.insert(behaviorDataTable).values({
            dataSessionId,
            behaviorTargetId: targetId,
            value: rawValue,
            notes: notes || null,
          });
        }
      } else {
        const existing = await db.select().from(programDataTable)
          .where(and(eq(programDataTable.dataSessionId, dataSessionId), eq(programDataTable.programTargetId, targetId)))
          .limit(1);
        if (existing.length === 0) {
          const pct = numValue <= 1 ? numValue * 100 : numValue;
          const total = 10;
          const correct = Math.round((pct / 100) * total);
          await db.insert(programDataTable).values({
            dataSessionId,
            programTargetId: targetId,
            trialsTotal: total,
            trialsCorrect: correct,
            percentCorrect: String(pct),
            notes: notes || null,
          });
        }
      }
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const studentId = await findOrGuessStudentId(row);
        if (!studentId) {
          errors.push(`Row ${i + 2}: Could not find student`);
          errored++;
          continue;
        }

        const rawGoalName = row.goal_name || row.goal || row.target_name || row.behavior_name || row.program_name || "";
        if (!rawGoalName) {
          errors.push(`Row ${i + 2}: Missing goal_name`);
          errored++;
          continue;
        }

        const rawType = row.goal_type || row.type || "";
        const goalType = detectGoalType(rawType, rawGoalName);
        const measurementType = row.measurement_type || row.measurement || (goalType === "behavior" ? "frequency" : "percent");
        const targetDirection = row.target_direction || row.direction || (goalType === "behavior" ? "decrease" : "increase");
        const baseline = row.baseline || null;
        const domain = row.goal_area || row.domain || row.service_area || null;

        let targetId: number;
        if (goalType === "behavior") {
          targetId = await findOrCreateBehaviorTarget(studentId, rawGoalName, measurementType, targetDirection, baseline);
        } else {
          targetId = await findOrCreateProgramTarget(studentId, rawGoalName, domain);
        }

        const annualGoal = row.annual_goal || row.goal_description || rawGoalName;
        await findOrCreateIepGoal(studentId, rawGoalName, goalType, targetId, domain || goalType, annualGoal, baseline, domain);

        if (isTallFormat) {
          const dateStr = row.date || row.session_date || "";
          const rawValue = row.value || row.score || "";
          const notes = row.notes || null;
          if (!dateStr || !rawValue) {
            errors.push(`Row ${i + 2}: Missing date or value`);
            errored++;
            continue;
          }
          await processDataPoint(studentId, goalType, targetId, dateStr, rawValue, notes);
          imported++;
        } else if (isWideFormat) {
          let atLeastOne = false;
          for (const col of dateColumns) {
            const rawValue = row[col];
            if (!rawValue || rawValue.trim() === "" || rawValue.trim() === "-" || rawValue.trim().toLowerCase() === "n/a") continue;
            const originalHeader = headers[headers.indexOf(col)];
            try {
              await processDataPoint(studentId, goalType, targetId, originalHeader, rawValue, null);
              atLeastOne = true;
            } catch {
              errors.push(`Row ${i + 2}, date "${originalHeader}": Invalid data`);
            }
          }
          if (atLeastOne) imported++;
          else {
            errors.push(`Row ${i + 2}: No valid data points found`);
            errored++;
          }
        } else {
          errors.push(`Row ${i + 2}: Could not detect data format (needs date+value columns or wide date columns)`);
          errored++;
        }
      } catch (e: any) {
        console.error(`goals-data import row ${i + 2}:`, e?.message);
        errors.push(`Row ${i + 2}: ${e?.message || "Failed"}`);
        errored++;
      }
    }

    const [importRecord] = await db.insert(importsTable).values({
      importType: "goals_data",
      fileName: fileName ?? null,
      status: errored === rows.length ? "failed" : "completed",
      rowsProcessed: rows.length,
      rowsImported: imported,
      rowsErrored: errored,
      errorSummary: errors.length > 0 ? errors.slice(0, 20).join("\n") : null,
    }).returning();

    res.status(201).json({
      ...importRecord,
      createdAt: importRecord.createdAt.toISOString(),
      updatedAt: importRecord.updatedAt.toISOString(),
      errors: errors.slice(0, 20),
    });
  } catch (e: any) {
    console.error("POST /imports/goals-data error:", e);
    res.status(500).json({ error: "Failed to process goals data import" });
  }
});

export default router;
