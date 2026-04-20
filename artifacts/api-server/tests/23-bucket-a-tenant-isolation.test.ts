/**
 * Bucket-A tenant-isolation regression suite.
 *
 * Pins the 5 files / 14 handlers fixed in the 2026-04-20 sweep
 * (see artifacts/trellis/buyer-pack/SECURITY-AUDIT.md, "Bucket A").
 *
 * The original FERPA-class bug: any signed-in district user could enumerate
 * compensatory obligations across all 6 districts (502 rows) by hitting
 * GET /api/compensatory-obligations. This suite locks down that handler plus
 * the four sibling files surfaced by the same-day audit.
 *
 * Pattern enforced per handler:
 *   1. LIST endpoints: a district-A user must see ZERO district-B rows.
 *      (Asserted by id-set intersection, not just count, so a regression
 *       that returns the wrong districts but the right count still fails.)
 *   2. GET-by-id endpoints: a district-A user requesting a district-B row id
 *      must get 404 (not 403, not 200).
 *   3. Body-IDOR endpoints (POST/restore): a district-A user passing a
 *      district-B id in the body must get 404 with no DB mutation.
 *   4. Platform admin (no x-test-district-id): must see both districts.
 *
 * tenant-scope: regression-pin
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@workspace/db";
import {
  compensatoryObligationsTable,
  studentsTable,
  staffTable,
  schoolsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  asUser,
  createDistrict,
  createSchool,
  createStudent,
  createStaff,
  cleanupDistrict,
  seedLegalAcceptances,
  cleanupLegalAcceptances,
} from "./helpers";

type Ctx = {
  districtA: { id: number };
  districtB: { id: number };
  schoolA: { id: number };
  schoolB: { id: number };
  studentA: { id: number; firstName: string; lastName: string };
  studentB: { id: number; firstName: string; lastName: string };
  staffA: { id: number };
  staffB: { id: number };
  obligationA: { id: number };
  obligationB: { id: number };
  userIds: string[];
};

let ctx: Ctx;

const adminA = "test-bucketA-admin-A";
const adminB = "test-bucketA-admin-B";
const platformAdmin = "test-bucketA-platform";

async function seedObligation(opts: {
  studentId: number;
  minutesOwed: number;
}) {
  const [row] = await db
    .insert(compensatoryObligationsTable)
    .values({
      studentId: opts.studentId,
      serviceRequirementId: null,
      // periodStart/periodEnd are date columns; pass ISO date strings.
      periodStart: "2026-01-01",
      periodEnd: "2026-06-30",
      minutesOwed: opts.minutesOwed,
      minutesDelivered: 0,
      status: "pending",
      source: "manual",
    })
    .returning();
  return row;
}

beforeAll(async () => {
  const districtA = await createDistrict({ name: "Test District BucketA-A" });
  const districtB = await createDistrict({ name: "Test District BucketA-B" });
  const schoolA = await createSchool(districtA.id);
  const schoolB = await createSchool(districtB.id);
  const studentA = await createStudent(schoolA.id, { firstName: "Alice", lastName: "Apple" });
  const studentB = await createStudent(schoolB.id, { firstName: "Bob", lastName: "Berry" });
  const staffA = await createStaff(schoolA.id);
  const staffB = await createStaff(schoolB.id);
  const obligationA = await seedObligation({ studentId: studentA.id, minutesOwed: 120 });
  const obligationB = await seedObligation({ studentId: studentB.id, minutesOwed: 240 });

  await seedLegalAcceptances([adminA, adminB, platformAdmin]);

  ctx = {
    districtA, districtB, schoolA, schoolB,
    studentA, studentB, staffA, staffB,
    obligationA, obligationB,
    userIds: [adminA, adminB, platformAdmin],
  };
});

afterAll(async () => {
  if (!ctx) return;
  // Compensatory rows are FK-children of students; cleanupDistrict() deletes
  // them in the right order. Just walk the two test districts.
  await cleanupDistrict(ctx.districtA.id);
  await cleanupDistrict(ctx.districtB.id);
  await cleanupLegalAcceptances(ctx.userIds);
});

// ---------------------------------------------------------------------------
// compensatory.ts
// ---------------------------------------------------------------------------

describe("Bucket A: compensatory.ts (the originally-reported FERPA bug)", () => {
  // True subset check: every returned obligation's studentId must belong to a
  // student whose school is in the caller's district. This catches a
  // regression that leaks rows from a *third* district we didn't seed.
  async function studentIdsInDistrict(districtId: number): Promise<Set<number>> {
    const rows = await db
      .select({ id: studentsTable.id })
      .from(studentsTable)
      .innerJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
      .where(eq(schoolsTable.districtId, districtId));
    return new Set(rows.map(r => r.id));
  }

  it("LIST: district-A admin sees only district-A obligations (no district-B leakage AND no third-district leakage)", async () => {
    const a = asUser({ userId: adminA, role: "admin", districtId: ctx.districtA.id });
    const r = await a.get("/api/compensatory-obligations");
    expect(r.status).toBe(200);
    const rows = r.body as Array<{ id: number; studentId: number }>;
    const ids = rows.map(o => o.id);
    expect(ids).toContain(ctx.obligationA.id);
    expect(ids).not.toContain(ctx.obligationB.id);
    // Subset assertion: every returned studentId must be in district-A.
    const districtAStudents = await studentIdsInDistrict(ctx.districtA.id);
    const foreignStudentIds = rows.map(o => o.studentId).filter(sid => !districtAStudents.has(sid));
    expect(foreignStudentIds).toEqual([]);
  });

  it("LIST: district-B admin sees only district-B obligations (mirror case, with subset assertion)", async () => {
    const b = asUser({ userId: adminB, role: "admin", districtId: ctx.districtB.id });
    const r = await b.get("/api/compensatory-obligations");
    expect(r.status).toBe(200);
    const rows = r.body as Array<{ id: number; studentId: number }>;
    const ids = rows.map(o => o.id);
    expect(ids).toContain(ctx.obligationB.id);
    expect(ids).not.toContain(ctx.obligationA.id);
    const districtBStudents = await studentIdsInDistrict(ctx.districtB.id);
    const foreignStudentIds = rows.map(o => o.studentId).filter(sid => !districtBStudents.has(sid));
    expect(foreignStudentIds).toEqual([]);
  });

  it("LIST: platform admin (no district header) sees both districts", async () => {
    const p = asUser({ userId: platformAdmin, role: "admin", districtId: null });
    const r = await p.get("/api/compensatory-obligations");
    expect(r.status).toBe(200);
    const ids = (r.body as Array<{ id: number }>).map(o => o.id);
    expect(ids).toEqual(expect.arrayContaining([ctx.obligationA.id, ctx.obligationB.id]));
  });

  it("GET-by-id: district-A admin requesting district-B obligation returns 404 (not 403)", async () => {
    const a = asUser({ userId: adminA, role: "admin", districtId: ctx.districtA.id });
    const r = await a.get(`/api/compensatory-obligations/${ctx.obligationB.id}`);
    expect(r.status).toBe(404);
    // Body must not leak the existence/shape of the cross-district row.
    expect(r.body).not.toHaveProperty("studentId");
    expect(r.body).not.toHaveProperty("minutesOwed");
  });

  it("POST: district-A admin passing district-B studentId in body returns 404, no row created", async () => {
    const a = asUser({ userId: adminA, role: "admin", districtId: ctx.districtA.id });
    const before = await db
      .select({ id: compensatoryObligationsTable.id })
      .from(compensatoryObligationsTable)
      .where(eq(compensatoryObligationsTable.studentId, ctx.studentB.id));

    const r = await a.post("/api/compensatory-obligations").send({
      studentId: ctx.studentB.id, // <-- foreign district
      periodStart: "2026-02-01",
      periodEnd: "2026-05-31",
      minutesOwed: 60,
    });
    expect(r.status).toBe(404);

    const after = await db
      .select({ id: compensatoryObligationsTable.id })
      .from(compensatoryObligationsTable)
      .where(eq(compensatoryObligationsTable.studentId, ctx.studentB.id));
    expect(after.length).toBe(before.length);
  });
});

// ---------------------------------------------------------------------------
// recentlyDeleted.ts
// ---------------------------------------------------------------------------

describe("Bucket A: recentlyDeleted.ts", () => {
  it("LIST: district-A admin sees only district-A's soft-deleted students/staff", async () => {
    // Soft-delete one student and one staff in each district.
    const now = new Date();
    await db.update(studentsTable).set({ deletedAt: now }).where(eq(studentsTable.id, ctx.studentA.id));
    await db.update(studentsTable).set({ deletedAt: now }).where(eq(studentsTable.id, ctx.studentB.id));
    await db.update(staffTable).set({ deletedAt: now }).where(eq(staffTable.id, ctx.staffA.id));
    await db.update(staffTable).set({ deletedAt: now }).where(eq(staffTable.id, ctx.staffB.id));

    try {
      const a = asUser({ userId: adminA, role: "admin", districtId: ctx.districtA.id });
      const r = await a.get("/api/recently-deleted");
      expect(r.status).toBe(200);
      const studentIds = (r.body.students as Array<{ id: number }>).map(s => s.id);
      const staffIds = (r.body.staff as Array<{ id: number }>).map(s => s.id);
      expect(studentIds).toContain(ctx.studentA.id);
      expect(studentIds).not.toContain(ctx.studentB.id);
      expect(staffIds).toContain(ctx.staffA.id);
      expect(staffIds).not.toContain(ctx.staffB.id);
    } finally {
      // Restore so downstream tests / cleanup see live rows.
      await db.update(studentsTable).set({ deletedAt: null })
        .where(inArray(studentsTable.id, [ctx.studentA.id, ctx.studentB.id]));
      await db.update(staffTable).set({ deletedAt: null })
        .where(inArray(staffTable.id, [ctx.staffA.id, ctx.staffB.id]));
    }
  });

  it("RESTORE: district-A admin attempting to restore district-B student returns 404, no DB change", async () => {
    // Soft-delete district-B's student.
    await db.update(studentsTable).set({ deletedAt: new Date() }).where(eq(studentsTable.id, ctx.studentB.id));
    try {
      const a = asUser({ userId: adminA, role: "admin", districtId: ctx.districtA.id });
      const r = await a.post("/api/recently-deleted/restore")
        .send({ table: "students", id: ctx.studentB.id });
      expect(r.status).toBe(404);

      // The student must still be soft-deleted — the restore must not have run.
      const [after] = await db
        .select({ deletedAt: studentsTable.deletedAt })
        .from(studentsTable)
        .where(eq(studentsTable.id, ctx.studentB.id));
      expect(after.deletedAt).not.toBeNull();
    } finally {
      await db.update(studentsTable).set({ deletedAt: null }).where(eq(studentsTable.id, ctx.studentB.id));
    }
  });
});

// ---------------------------------------------------------------------------
// additionalFeatures.ts — search surface
// ---------------------------------------------------------------------------

describe("Bucket A: additionalFeatures.ts (cross-district search)", () => {
  it("/search/iep students: district-A admin searching for 'B' surname only returns district-A students", async () => {
    const a = asUser({ userId: adminA, role: "admin", districtId: ctx.districtA.id });
    // Search for "Berry" (district-B's student lastName). District-A admin
    // must get an empty student list, not Bob Berry.
    const r = await a.get("/api/search/iep?q=Berry&type=students");
    expect(r.status).toBe(200);
    const studentIds = (r.body.students as Array<{ id: number }>).map(s => s.id);
    expect(studentIds).not.toContain(ctx.studentB.id);
  });

  it("/staff/:staffId/caseload-summary: district-A admin requesting district-B staff returns 404", async () => {
    const a = asUser({ userId: adminA, role: "admin", districtId: ctx.districtA.id });
    const r = await a.get(`/api/staff/${ctx.staffB.id}/caseload-summary`);
    // Either 404 (assert*InCallerDistrict) or 403, but NEVER 200 with
    // foreign-district data. We pin the convention: 404.
    expect(r.status).toBe(404);
  });

  it("/students/:studentId/iep-summary: district-A admin requesting district-B student returns 404", async () => {
    const a = asUser({ userId: adminA, role: "admin", districtId: ctx.districtA.id });
    const r = await a.get(`/api/students/${ctx.studentB.id}/iep-summary`);
    expect(r.status).toBe(404);
  });

  it("/search (general): district-A admin searching for district-B student name returns no district-B rows", async () => {
    const a = asUser({ userId: adminA, role: "admin", districtId: ctx.districtA.id });
    const r = await a.get("/api/search?q=Berry");
    expect(r.status).toBe(200);
    // The general search returns a payload with student/staff buckets; we assert
    // no district-B id appears anywhere in the returned ids, regardless of
    // payload shape (defensive: the cross-district leak we're pinning would
    // surface district-B's student/staff rows).
    const blob = JSON.stringify(r.body);
    expect(blob).not.toContain(`"id":${ctx.studentB.id}`);
    expect(blob).not.toContain(`"id":${ctx.staffB.id}`);
  });
});

// ---------------------------------------------------------------------------
// compensatory.ts — additional fixed handlers (summary/by-student, calculate-shortfalls)
// ---------------------------------------------------------------------------

describe("Bucket A: compensatory.ts (remaining fixed handlers)", () => {
  it("GET summary/by-student/:studentId: district-A admin requesting district-B student returns 404", async () => {
    const a = asUser({ userId: adminA, role: "admin", districtId: ctx.districtA.id });
    const r = await a.get(`/api/compensatory-obligations/summary/by-student/${ctx.studentB.id}`);
    expect(r.status).toBe(404);
  });

  it("POST calculate-shortfalls: district-A admin passing district-B schoolId in body returns 404 (assertSchoolInCallerDistrict)", async () => {
    const a = asUser({ userId: adminA, role: "admin", districtId: ctx.districtA.id });
    const r = await a.post("/api/compensatory-obligations/calculate-shortfalls").send({
      schoolId: ctx.schoolB.id, // <-- foreign district
      periodStart: "2026-01-01",
      periodEnd: "2026-06-30",
    });
    expect(r.status).toBe(404);
  });

  it("POST calculate-shortfalls: district-A admin omitting schoolId — response must contain no district-B service requirements", async () => {
    const a = asUser({ userId: adminA, role: "admin", districtId: ctx.districtA.id });
    const r = await a.post("/api/compensatory-obligations/calculate-shortfalls").send({
      periodStart: "2026-01-01",
      periodEnd: "2026-06-30",
    });
    expect(r.status).toBe(200);
    // No row in the response should reference district-B's seeded student.
    const blob = JSON.stringify(r.body);
    expect(blob).not.toContain(`"studentId":${ctx.studentB.id}`);
  });
});

// ---------------------------------------------------------------------------
// supportIntensity.ts
// ---------------------------------------------------------------------------

describe("Bucket A: supportIntensity.ts", () => {
  it("GET /students/:studentId/support-intensity: district-A admin requesting district-B student returns 404", async () => {
    const a = asUser({ userId: adminA, role: "admin", districtId: ctx.districtA.id });
    const r = await a.get(`/api/students/${ctx.studentB.id}/support-intensity`);
    expect(r.status).toBe(404);
    // Body must not leak the cross-district student's restraint/BIP/FBA shape.
    expect(r.body).not.toHaveProperty("restraintHistory");
    expect(r.body).not.toHaveProperty("bipCount");
  });
});

// ---------------------------------------------------------------------------
// schedules/scheduler.ts — TODO: pin /scheduler/generate and /scheduler/accept
// ---------------------------------------------------------------------------
// These two handlers are part of Bucket A but require valid GenerateScheduleBody
// / AcceptGeneratedScheduleBody payloads (school/service-requirement/staff
// graphs). Adding them here without a fully-wired schedule fixture would
// produce 400-on-shape-validation tests that pass for the wrong reason.
// Tracked as follow-up: extend the fixture in beforeAll() with a service
// requirement + scheduler block, then add:
//   it("POST /scheduler/generate: district-A admin must not see district-B staff/services in the projected schedule")
//   it("POST /scheduler/accept: district-A admin posting district-B staffId/serviceRequirementId in the body returns 404")
// See artifacts/trellis/buyer-pack/SECURITY-AUDIT.md → Bucket A → schedules/scheduler.ts.
//
// Same applies to additionalFeatures.ts → POST /sessions/quick — needs a valid
// session payload (studentId, serviceRequirementId, duration, date, staffId,
// status) wired through a service-requirement fixture.
