import { db, studentsTable, sessionLogsTable, serviceTypesTable, behaviorTargetsTable, programTargetsTable, dataSessionsTable, iepGoalsTable } from "@workspace/db";
import { eq, and, ilike, isNull } from "drizzle-orm";
import { requireRoles } from "../../middlewares/auth";

export const requireAdmin = requireRoles("admin");

export function parseCsvRows(csvData: string): { headers: string[]; rows: Record<string, string>[] } {
  const isTsv = csvData.includes("\t") && !csvData.split("\n")[0].includes(",");
  if (isTsv) return parseTsvRows(csvData);

  const lines = csvData.trim().split("\n").map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith("#"));
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

export async function findOrGuessStudentId(row: Record<string, string>): Promise<number | null> {
  const extId = row.student_external_id || row.student_id || row.external_id || "";
  const firstName = row.student_first_name || row.first_name || "";
  const lastName = row.student_last_name || row.last_name || "";

  const nameParts = (row.student_name || "").split(",").map(s => s.trim());
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

export async function findServiceTypeId(name: string): Promise<number | null> {
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

export function normalizeDate(raw: string): string | null {
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

export function isDateLikeHeader(h: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(h) ||
    /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(h) ||
    /^\d{1,2}-\d{1,2}-\d{2,4}$/.test(h) ||
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[\s\-_]\d{1,2}/i.test(h) ||
    /^\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(h);
}

export const META_HEADERS = new Set([
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

export async function findOrCreateBehaviorTarget(
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

export async function findOrCreateProgramTarget(
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

export async function findOrCreateIepGoal(
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

export async function getOrCreateVagueSession(studentId: number, dateStr: string): Promise<number> {
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
      isNull(sessionLogsTable.staffId),
      isNull(sessionLogsTable.deletedAt)
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

export function detectGoalType(rawType: string, goalName: string): "behavior" | "skill" {
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

export function parseTsvRows(tsvData: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = tsvData.trim().split("\n").map(l => l.replace(/\r$/, "")).filter(l => l.length > 0 && !l.startsWith("#"));
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
