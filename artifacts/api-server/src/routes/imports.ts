import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { importsTable, studentsTable, sessionLogsTable, serviceRequirementsTable, serviceTypesTable } from "@workspace/db";
import { desc, eq, and, ilike } from "drizzle-orm";

const router: IRouter = Router();

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
  };

  const tmpl = templates[type];
  if (!tmpl) {
    res.status(404).json({ error: `Unknown template type: ${type}` });
    return;
  }

  const csv = [tmpl.headers.join(","), tmpl.sampleRow.join(",")].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=minuteops_${type}_template.csv`);
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

router.post("/imports/students", async (req, res): Promise<void> => {
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

router.post("/imports/service-requirements", async (req, res): Promise<void> => {
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

router.post("/imports/sessions", async (req, res): Promise<void> => {
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

export default router;
