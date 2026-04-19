/**
 * Integration tests for the report export endpoints that share fetchers in
 * routes/reportExports/fetchers.ts.
 *
 * Covers:
 *  - GET /api/reports/exports/compliance-summary.csv  — row count + key fields
 *  - GET /api/reports/exports/compliance-summary.pdf  — content-type + magic bytes
 *  - GET /api/reports/exports/student-roster.csv     — row count + IEP join
 *  - generateReportCSVDirect (used for scheduled email reports) for all four
 *    report types: compliance-summary, student-roster, services-by-provider,
 *    caseload-distribution.
 *
 * Goal: catch silent regressions in the shared fetchers that would otherwise
 * propagate to the CSV, PDF, and direct-generate paths simultaneously.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  db,
  serviceRequirementsTable,
  sessionLogsTable,
  iepDocumentsTable,
  staffAssignmentsTable,
  exportHistoryTable,
} from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import {
  asUser,
  createDistrict,
  createSchool,
  createStudent,
  createStaff,
  createServiceType,
  cleanupDistrict,
  cleanupServiceType,
  seedLegalAcceptances,
  cleanupLegalAcceptances,
} from "./helpers";
import { generateReportCSVDirect } from "../src/routes/reportExports/historyAndScheduled";

let districtId: number;
let schoolId: number;
let staffId: number;
let serviceTypeId: number;
let student1Id: number;
let student2Id: number;

const ADMIN_USER = "admin-report-exports";

const insertedReqIds: number[] = [];
const insertedSessionIds: number[] = [];
const insertedIepIds: number[] = [];
const insertedAssignmentIds: number[] = [];

function todayStr(): string {
  return new Date().toISOString().substring(0, 10);
}

beforeAll(async () => {
  // Defensive: clean up orphan rows from previous failed runs of this suite
  // before the global setup.ts sweep would trip on FK constraints. The global
  // sweep only knows about the core tables; we own these auxiliary ones.
  await db.execute(sql`
    DELETE FROM service_requirements WHERE student_id IN (
      SELECT id FROM students WHERE school_id IN (
        SELECT id FROM schools WHERE district_id IN (
          SELECT id FROM districts WHERE name = 'Test District Report Exports'
        )
      )
    )
  `);
  await db.execute(sql`
    DELETE FROM staff_assignments WHERE student_id IN (
      SELECT id FROM students WHERE school_id IN (
        SELECT id FROM schools WHERE district_id IN (
          SELECT id FROM districts WHERE name = 'Test District Report Exports'
        )
      )
    )
  `);
  await db.execute(sql`
    DELETE FROM iep_documents WHERE student_id IN (
      SELECT id FROM students WHERE school_id IN (
        SELECT id FROM schools WHERE district_id IN (
          SELECT id FROM districts WHERE name = 'Test District Report Exports'
        )
      )
    )
  `);

  const district = await createDistrict({ name: "Test District Report Exports" });
  districtId = district.id;
  const school = await createSchool(districtId, { name: "Test School Report Exports" });
  schoolId = school.id;

  const staff = await createStaff(schoolId, {
    firstName: "Pat",
    lastName: "Provider",
    role: "provider",
  });
  staffId = staff.id;

  const svcType = await createServiceType({ name: `Service ReportExports_${Date.now()}` });
  serviceTypeId = svcType.id;

  const student1 = await createStudent(schoolId, {
    firstName: "Alice",
    lastName: "Anders",
    grade: "3",
    status: "active",
    disabilityCategory: "SLD",
    placementType: "inclusion",
  });
  student1Id = student1.id;

  const student2 = await createStudent(schoolId, {
    firstName: "Bob",
    lastName: "Becker",
    grade: "4",
    status: "active",
  });
  student2Id = student2.id;

  // One active service requirement on student1 so it shows up in compliance.
  const [req] = await db.insert(serviceRequirementsTable).values({
    studentId: student1Id,
    serviceTypeId,
    providerId: staffId,
    requiredMinutes: 60,
    intervalType: "weekly",
    startDate: todayStr(),
    active: true,
  }).returning();
  insertedReqIds.push(req.id);

  // Two completed sessions (30 min each) and one missed session for student1.
  const today = todayStr();
  const sessions = await db.insert(sessionLogsTable).values([
    { studentId: student1Id, staffId, serviceTypeId, serviceRequirementId: req.id, sessionDate: today, durationMinutes: 30, status: "completed", isMakeup: false, isCompensatory: false },
    { studentId: student1Id, staffId, serviceTypeId, serviceRequirementId: req.id, sessionDate: today, durationMinutes: 30, status: "completed", isMakeup: false, isCompensatory: false },
    { studentId: student1Id, staffId, serviceTypeId, serviceRequirementId: req.id, sessionDate: today, durationMinutes: 0, status: "missed", isMakeup: false, isCompensatory: false },
  ]).returning();
  insertedSessionIds.push(...sessions.map(s => s.id));

  // Active IEP for student1 only — student2 should fall through as "No IEP".
  const [iep] = await db.insert(iepDocumentsTable).values({
    studentId: student1Id,
    iepStartDate: "2025-01-01",
    iepEndDate: "2026-01-01",
    status: "active",
    active: true,
  }).returning();
  insertedIepIds.push(iep.id);

  // Caseload assignments: staff has both students on the caseload.
  const assigns = await db.insert(staffAssignmentsTable).values([
    { staffId, studentId: student1Id, assignmentType: "primary" },
    { staffId, studentId: student2Id, assignmentType: "primary" },
  ]).returning();
  insertedAssignmentIds.push(...assigns.map(a => a.id));

  await seedLegalAcceptances([ADMIN_USER]);
});

afterAll(async () => {
  if (insertedAssignmentIds.length > 0) {
    await db.delete(staffAssignmentsTable).where(inArray(staffAssignmentsTable.id, insertedAssignmentIds));
  }
  if (insertedIepIds.length > 0) {
    await db.delete(iepDocumentsTable).where(inArray(iepDocumentsTable.id, insertedIepIds));
  }
  if (insertedSessionIds.length > 0) {
    await db.delete(sessionLogsTable).where(inArray(sessionLogsTable.id, insertedSessionIds));
  }
  if (insertedReqIds.length > 0) {
    await db.delete(serviceRequirementsTable).where(inArray(serviceRequirementsTable.id, insertedReqIds));
  }
  // Export history rows recorded by the route handlers — clean those for this district.
  await db.delete(exportHistoryTable).where(eq(exportHistoryTable.districtId, districtId));
  await cleanupLegalAcceptances([ADMIN_USER]);
  await cleanupDistrict(districtId);
  await cleanupServiceType(serviceTypeId);
});

/** Parse a CSV body into header + rows (no embedded newlines in our seed data). */
function parseCSV(body: string): { headers: string[]; rows: string[][] } {
  const lines = body.split("\n").filter(l => l.length > 0);
  const split = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQ = false; }
        else { cur += ch; }
      } else {
        if (ch === ",") { out.push(cur); cur = ""; }
        else if (ch === '"') { inQ = true; }
        else { cur += ch; }
      }
    }
    out.push(cur);
    return out;
  };
  return { headers: split(lines[0]), rows: lines.slice(1).map(split) };
}

describe("report export endpoints — shared fetcher coverage", () => {
  it("GET /reports/exports/compliance-summary.csv returns one row per requirement with correct delivered minutes", async () => {
    const admin = asUser({ userId: ADMIN_USER, role: "admin", districtId });
    const res = await admin.get(`/api/reports/exports/compliance-summary.csv?startDate=${todayStr()}&endDate=${todayStr()}&serviceTypeId=${serviceTypeId}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);

    const { headers, rows } = parseCSV(res.text);
    expect(headers).toEqual([
      "Student", "School", "Grade", "Service", "Required Min/Wk",
      "Delivered Min", "Compliance %", "Status",
    ]);
    // Only student1 has an active requirement → exactly one row.
    expect(rows.length).toBe(1);
    const [row] = rows;
    expect(row[0]).toBe("Anders, Alice");
    expect(row[2]).toBe("3");
    expect(row[4]).toBe("60/weekly");
    // 2 completed × 30 min = 60 delivered. 2 completed of 3 attempted → 67% (Out of Compliance).
    expect(row[5]).toBe("60");
    expect(row[6]).toBe("67%");
    expect(row[7]).toBe("Out of Compliance");
  });

  it("GET /reports/exports/compliance-summary.pdf returns a PDF whose rendered text contains the seeded student row", async () => {
    const admin = asUser({ userId: ADMIN_USER, role: "admin", districtId });
    const res = await admin
      .get(`/api/reports/exports/compliance-summary.pdf?startDate=${todayStr()}&endDate=${todayStr()}&serviceTypeId=${serviceTypeId}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (c: Buffer) => chunks.push(c));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    const body = res.body as Buffer;
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.subarray(0, 5).toString("utf8")).toBe("%PDF-");

    // Parse the PDF to verify rendered content matches the seeded fixtures —
    // catches regressions in the PDF formatting layer that a magic-byte check would miss.
    // Import via the library entry directly: pdf-parse's index has a debug
    // fallback that tries to read a fixture file off disk in some loaders.
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (b: Buffer) => Promise<{ text: string }>;
    const parsed = await pdfParse(body);
    expect(parsed.text).toContain("Compliance Summary Report");
    expect(parsed.text).toContain("Anders, Alice");
    expect(parsed.text).toContain("Out of Compliance");
    // Delivered minutes (60) and compliance percent (67%) should both render.
    expect(parsed.text).toContain("67%");
  });

  it("GET /reports/exports/student-roster.csv returns one row per active student with IEP fields joined", async () => {
    const admin = asUser({ userId: ADMIN_USER, role: "admin", districtId });
    const res = await admin.get(`/api/reports/exports/student-roster.csv?schoolId=${schoolId}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);

    const { headers, rows } = parseCSV(res.text);
    expect(headers).toEqual([
      "Last Name", "First Name", "Grade", "School", "Status",
      "Disability Category", "Placement", "Date of Birth", "Enrolled",
      "IEP Start", "IEP End", "IEP Status",
    ]);
    expect(rows.length).toBe(2);
    // Sorted by last name asc → Anders first.
    const [r1, r2] = rows;
    expect(r1[0]).toBe("Anders");
    expect(r1[1]).toBe("Alice");
    expect(r1[5]).toBe("SLD");
    expect(r1[11]).toBe("active"); // IEP status
    expect(r2[0]).toBe("Becker");
    expect(r2[1]).toBe("Bob");
    expect(r2[11]).toBe("No IEP");
  });
});

describe("generateReportCSVDirect — scheduled email report path", () => {
  const today = todayStr();

  it("returns null for an unknown report type", async () => {
    const result = await generateReportCSVDirect("not-a-real-report", districtId, {});
    expect(result).toBeNull();
  });

  it("refuses to generate when districtId is invalid (<= 0)", async () => {
    const result = await generateReportCSVDirect("compliance-summary", 0, {});
    expect(result).toBeNull();
  });

  it("compliance-summary: returns expected row count and key fields", async () => {
    const result = await generateReportCSVDirect("compliance-summary", districtId, {
      startDate: today,
      endDate: today,
      serviceTypeId,
    });
    expect(result).not.toBeNull();
    expect(result!.rowCount).toBe(1);
    expect(result!.headers).toEqual([
      "Student", "School", "Grade", "Service", "Required",
      "Delivered", "Compliance %", "Status",
    ]);
    const [row] = result!.rows;
    expect(row[0]).toBe("Anders, Alice");
    expect(row[5]).toBe(60);     // delivered minutes
    expect(row[6]).toBe("67%");
    expect(row[7]).toBe("Out of Compliance");
    // CSV string should also contain the headers and the row.
    expect(result!.csv).toContain("Student,School,Grade,Service");
    expect(result!.csv).toContain("Anders, Alice");
  });

  it("student-roster: returns one row per active student in the district", async () => {
    const result = await generateReportCSVDirect("student-roster", districtId, {});
    expect(result).not.toBeNull();
    expect(result!.rowCount).toBe(2);
    const lastNames = result!.rows.map(r => r[0]);
    expect(lastNames).toContain("Anders");
    expect(lastNames).toContain("Becker");
  });

  it("services-by-provider: aggregates sessions per provider/service", async () => {
    const result = await generateReportCSVDirect("services-by-provider", districtId, {
      startDate: today,
      endDate: today,
      providerId: staffId,
    });
    expect(result).not.toBeNull();
    expect(result!.rowCount).toBe(1);
    const [row] = result!.rows;
    expect(row[0]).toBe("Provider, Pat"); // "lastName, firstName"
    expect(row[1]).toBe("Provider");      // ROLE_LABELS["provider"]
    expect(row[4]).toBe(2);               // sessions completed
    expect(row[5]).toBe(1);               // missed
    expect(row[6]).toBe(60);              // total minutes
    expect(row[7]).toBe(1);               // unique students
  });

  it("caseload-distribution: counts unique students per staff member", async () => {
    const result = await generateReportCSVDirect("caseload-distribution", districtId, {});
    expect(result).not.toBeNull();
    expect(result!.rowCount).toBe(1);
    const [row] = result!.rows;
    expect(row[0]).toBe("Provider, Pat");
    expect(row[3]).toBe(2); // both students assigned
  });
});
