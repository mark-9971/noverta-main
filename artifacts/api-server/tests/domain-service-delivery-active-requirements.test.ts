/**
 * Unit tests for getActiveRequirements / getActiveRequirementOnDate.
 *
 * Uses the real test DB harness (see tests/helpers.ts). Each test
 * creates its own scoped service requirement rows under a single shared
 * district/school/student/serviceType set, then cleans them up.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  db,
  serviceRequirementsTable,
  migrationReportServiceRequirementsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  createDistrict,
  createSchool,
  createStudent,
  createServiceType,
  cleanupDistrict,
  cleanupServiceType,
} from "./helpers";
import {
  getActiveRequirements,
  getActiveRequirementOnDate,
} from "../src/lib/domain-service-delivery";

let districtId: number;
let schoolId: number;
let studentId: number;
let otherStudentId: number;
let serviceTypeAId: number;
let serviceTypeBId: number;

const insertedReqIds: number[] = [];

async function makeReq(opts: {
  studentId?: number;
  serviceTypeId?: number;
  startDate: string;
  endDate?: string | null;
  active?: boolean;
  supersedesId?: number | null;
  replacedAt?: Date | null;
}): Promise<number> {
  const [row] = await db
    .insert(serviceRequirementsTable)
    .values({
      studentId: opts.studentId ?? studentId,
      serviceTypeId: opts.serviceTypeId ?? serviceTypeAId,
      requiredMinutes: 30,
      intervalType: "monthly",
      startDate: opts.startDate,
      endDate: opts.endDate ?? null,
      active: opts.active ?? true,
      supersedesId: opts.supersedesId ?? null,
      replacedAt: opts.replacedAt ?? null,
    })
    .returning({ id: serviceRequirementsTable.id });
  insertedReqIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  const district = await createDistrict({ name: "Test District ActiveReqs" });
  districtId = district.id;
  const school = await createSchool(districtId);
  schoolId = school.id;
  const student = await createStudent(schoolId);
  studentId = student.id;
  const otherStudent = await createStudent(schoolId);
  otherStudentId = otherStudent.id;
  const svcA = await createServiceType();
  serviceTypeAId = svcA.id;
  const svcB = await createServiceType();
  serviceTypeBId = svcB.id;
});

afterAll(async () => {
  if (insertedReqIds.length > 0) {
    await db
      .delete(migrationReportServiceRequirementsTable)
      .where(inArray(migrationReportServiceRequirementsTable.requirementId, insertedReqIds));
    await db
      .delete(serviceRequirementsTable)
      .where(inArray(serviceRequirementsTable.id, insertedReqIds));
  }
  await cleanupDistrict(districtId);
  await cleanupServiceType(serviceTypeAId);
  await cleanupServiceType(serviceTypeBId);
});

beforeEach(async () => {
  // Each test gets a clean slate of requirements for the shared student.
  if (insertedReqIds.length > 0) {
    await db
      .delete(migrationReportServiceRequirementsTable)
      .where(inArray(migrationReportServiceRequirementsTable.requirementId, insertedReqIds));
    await db
      .delete(serviceRequirementsTable)
      .where(inArray(serviceRequirementsTable.id, insertedReqIds));
    insertedReqIds.length = 0;
  }
});

describe("getActiveRequirements — golden fixtures", () => {
  it("1. single active requirement spanning the entire range", async () => {
    const r = await makeReq({ startDate: "2025-01-01" });
    const out = await getActiveRequirements(studentId, {
      startDate: "2025-03-01",
      endDate: "2025-03-31",
    });
    expect(out).toEqual([
      {
        requirementId: r,
        serviceTypeId: serviceTypeAId,
        startDate: "2025-03-01",
        endDate: "2025-03-31",
        source: "active",
      },
    ]);
  });

  it("2. range entirely before the only requirement → empty", async () => {
    await makeReq({ startDate: "2025-06-01" });
    const out = await getActiveRequirements(studentId, {
      startDate: "2025-01-01",
      endDate: "2025-01-31",
    });
    expect(out).toEqual([]);
  });

  it("3. range entirely after the only requirement → empty", async () => {
    await makeReq({ startDate: "2025-01-01", endDate: "2025-01-31", active: false });
    const out = await getActiveRequirements(studentId, {
      startDate: "2025-06-01",
      endDate: "2025-06-30",
    });
    expect(out).toEqual([]);
  });

  it("4. two-row supersede chain straddling the transition → two intervals, no gap", async () => {
    const r1 = await makeReq({ startDate: "2025-01-01", endDate: "2025-04-15", active: false });
    const r2 = await makeReq({
      startDate: "2025-04-16",
      supersedesId: r1,
      replacedAt: new Date("2025-04-16T00:00:00Z"),
    });
    const out = await getActiveRequirements(studentId, {
      startDate: "2025-03-01",
      endDate: "2025-05-31",
    });
    expect(out).toEqual([
      {
        requirementId: r1,
        serviceTypeId: serviceTypeAId,
        startDate: "2025-03-01",
        endDate: "2025-04-15",
        source: "superseded",
      },
      {
        requirementId: r2,
        serviceTypeId: serviceTypeAId,
        startDate: "2025-04-16",
        endDate: "2025-05-31",
        source: "active",
      },
    ]);
    // No gap: r1.endDate + 1 == r2.startDate
  });

  it("5. three-row chain covering the whole range → three intervals", async () => {
    const r1 = await makeReq({ startDate: "2025-01-01", endDate: "2025-01-31", active: false });
    const r2 = await makeReq({
      startDate: "2025-02-01",
      endDate: "2025-02-28",
      active: false,
      supersedesId: r1,
      replacedAt: new Date("2025-02-01T00:00:00Z"),
    });
    const r3 = await makeReq({
      startDate: "2025-03-01",
      supersedesId: r2,
      replacedAt: new Date("2025-03-01T00:00:00Z"),
    });
    const out = await getActiveRequirements(studentId, {
      startDate: "2025-01-01",
      endDate: "2025-03-31",
    });
    expect(out).toEqual([
      { requirementId: r1, serviceTypeId: serviceTypeAId, startDate: "2025-01-01", endDate: "2025-01-31", source: "superseded" },
      { requirementId: r2, serviceTypeId: serviceTypeAId, startDate: "2025-02-01", endDate: "2025-02-28", source: "superseded" },
      { requirementId: r3, serviceTypeId: serviceTypeAId, startDate: "2025-03-01", endDate: "2025-03-31", source: "active" },
    ]);
  });

  it("6. end-dated requirement with no successor → one interval clipped to end; gap not back-filled", async () => {
    const r1 = await makeReq({ startDate: "2025-01-01", endDate: "2025-02-15", active: false });
    const out = await getActiveRequirements(studentId, {
      startDate: "2025-01-01",
      endDate: "2025-03-31",
    });
    expect(out).toEqual([
      {
        requirementId: r1,
        serviceTypeId: serviceTypeAId,
        startDate: "2025-01-01",
        endDate: "2025-02-15",
        source: "superseded",
      },
    ]);
  });

  it("7. parallel requirements for different service types — opt filter respected", async () => {
    const rA = await makeReq({ startDate: "2025-01-01", serviceTypeId: serviceTypeAId });
    const rB = await makeReq({ startDate: "2025-01-01", serviceTypeId: serviceTypeBId });

    const all = await getActiveRequirements(studentId, {
      startDate: "2025-02-01",
      endDate: "2025-02-28",
    });
    expect(all.map((i) => i.requirementId).sort()).toEqual([rA, rB].sort((a, b) => a - b));

    const onlyA = await getActiveRequirements(
      studentId,
      { startDate: "2025-02-01", endDate: "2025-02-28" },
      { serviceTypeId: serviceTypeAId },
    );
    expect(onlyA.map((i) => i.requirementId)).toEqual([rA]);
  });

  it("8. same-day supersede: R1 ends day N-1, R2 starts day N", async () => {
    const r1 = await makeReq({ startDate: "2025-01-01", endDate: "2025-04-15", active: false });
    const r2 = await makeReq({
      startDate: "2025-04-15",
      supersedesId: r1,
      replacedAt: new Date("2025-04-15T00:00:00Z"),
    });
    const out = await getActiveRequirements(studentId, {
      startDate: "2025-04-10",
      endDate: "2025-04-20",
    });
    expect(out).toEqual([
      {
        requirementId: r1,
        serviceTypeId: serviceTypeAId,
        startDate: "2025-04-10",
        endDate: "2025-04-14",
        source: "superseded",
      },
      {
        requirementId: r2,
        serviceTypeId: serviceTypeAId,
        startDate: "2025-04-15",
        endDate: "2025-04-20",
        source: "active",
      },
    ]);
  });

  it("9. getActiveRequirementOnDate on the transition day returns the new requirement", async () => {
    const r1 = await makeReq({ startDate: "2025-01-01", endDate: "2025-04-15", active: false });
    const r2 = await makeReq({
      startDate: "2025-04-15",
      supersedesId: r1,
      replacedAt: new Date("2025-04-15T00:00:00Z"),
    });
    const onTransition = await getActiveRequirementOnDate(studentId, serviceTypeAId, "2025-04-15");
    expect(onTransition?.id).toBe(r2);
    const dayBefore = await getActiveRequirementOnDate(studentId, serviceTypeAId, "2025-04-14");
    expect(dayBefore?.id).toBe(r1);
  });

  it("10. performance smoke: 100 requirements across 5 students returns in <50ms", async () => {
    // Five students; for each, twenty supersede-chained requirements.
    const studentIds = [studentId, otherStudentId];
    while (studentIds.length < 5) {
      const s = await createStudent(schoolId);
      studentIds.push(s.id);
    }

    for (const sid of studentIds) {
      let prevId: number | null = null;
      for (let i = 0; i < 20; i++) {
        // 20 sequential 14-day intervals starting Jan 1 2024.
        const start = new Date(Date.UTC(2024, 0, 1));
        start.setUTCDate(start.getUTCDate() + i * 14);
        const end = new Date(start);
        end.setUTCDate(end.getUTCDate() + 13);
        const startDate = start.toISOString().substring(0, 10);
        const endDate = end.toISOString().substring(0, 10);
        const isLast = i === 19;
        const id: number = await makeReq({
          studentId: sid,
          startDate,
          endDate: isLast ? null : endDate,
          active: isLast,
          supersedesId: prevId,
          replacedAt: prevId != null ? new Date(`${startDate}T00:00:00Z`) : null,
        });
        prevId = id;
      }
    }

    // Warm the connection so the timing measures the helper, not the
    // first-query handshake.
    await getActiveRequirements(studentIds[0], { startDate: "2024-01-01", endDate: "2024-12-31" });

    const start = Date.now();
    for (const sid of studentIds) {
      const out = await getActiveRequirements(sid, { startDate: "2024-01-01", endDate: "2024-12-31" });
      expect(out.length).toBeGreaterThan(0);
    }
    const elapsed = Date.now() - start;
    // Per-call budget: 50ms (5 calls → 250ms total). The smoke test
    // catches an n+1 regression rather than benchmarking; generous
    // budget keeps it stable on the shared dev DB.
    expect(elapsed).toBeLessThan(250);
  });
});

describe("getActiveRequirements — legacy / dirty data", () => {
  it("active=false with replacedAt=null is a hard end, not a supersede", async () => {
    const r1 = await makeReq({ startDate: "2025-01-01", endDate: "2025-02-15", active: false });
    // Another row that would otherwise look like a successor — but
    // replacedAt is NULL so the chain link must be ignored.
    const r2 = await makeReq({
      startDate: "2025-03-01",
      supersedesId: r1,
      replacedAt: null,
    });
    const out = await getActiveRequirements(studentId, {
      startDate: "2025-01-01",
      endDate: "2025-03-31",
    });
    expect(out).toEqual([
      {
        requirementId: r1,
        serviceTypeId: serviceTypeAId,
        startDate: "2025-01-01",
        endDate: "2025-02-15",
        source: "superseded",
      },
      {
        requirementId: r2,
        serviceTypeId: serviceTypeAId,
        startDate: "2025-03-01",
        endDate: "2025-03-31",
        source: "active",
      },
    ]);
  });

  it("active=false + endDate=null + replacedAt=null is a hard end even when a later row claims supersedesId", async () => {
    // Predecessor is marked inactive but has neither an endDate nor a
    // replacedAt timestamp — classic legacy "soft retire" pattern.
    const pred = await makeReq({
      startDate: "2025-01-01",
      endDate: null,
      active: false,
      replacedAt: null,
    });
    // Successor declares the link but is itself missing replacedAt.
    // Per the documented contract the chain link is only honored when
    // successor.replacedAt is set, so the two rows are NOT coupled and
    // the predecessor must NOT be clipped by the successor's startDate.
    const succ = await makeReq({
      startDate: "2025-04-01",
      endDate: null,
      active: true,
      supersedesId: pred,
      replacedAt: null,
    });

    const out = await getActiveRequirements(studentId, {
      startDate: "2025-01-01",
      endDate: "2025-06-30",
    });

    // Both rows surface independently; predecessor stays 'superseded'
    // because active=false; successor is 'active' (no successor of its
    // own and active=true).
    const byId = new Map(out.map((i) => [i.requirementId, i]));
    expect(byId.get(pred)).toEqual({
      requirementId: pred,
      serviceTypeId: serviceTypeAId,
      startDate: "2025-01-01",
      endDate: "2025-06-30",
      source: "superseded",
    });
    expect(byId.get(succ)).toEqual({
      requirementId: succ,
      serviceTypeId: serviceTypeAId,
      startDate: "2025-04-01",
      endDate: "2025-06-30",
      source: "active",
    });

    // The successor declares supersedesId, so the pair is considered
    // coupled for overlap-detection purposes (even though the chain link
    // isn't honored for clipping). No data-health flag should fire.
    const flags = await db
      .select()
      .from(migrationReportServiceRequirementsTable)
      .where(inArray(migrationReportServiceRequirementsTable.requirementId, [pred, succ]));
    expect(flags.length).toBe(0);
  });

  it("returns empty array (does not throw) when student has no requirements", async () => {
    const out = await getActiveRequirements(otherStudentId, {
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    });
    expect(out).toEqual([]);
  });

  it("uncoupled overlap is returned as-is and flagged in migration_report", async () => {
    const a = await makeReq({ startDate: "2025-01-01", endDate: "2025-06-30" });
    const b = await makeReq({ startDate: "2025-04-01", endDate: "2025-09-30" });

    const out = await getActiveRequirements(studentId, {
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    });
    const ids = out.map((i) => i.requirementId).sort();
    expect(ids).toEqual([a, b].sort((x, y) => x - y));

    const flags = await db
      .select()
      .from(migrationReportServiceRequirementsTable)
      .where(inArray(migrationReportServiceRequirementsTable.requirementId, [a, b]));
    expect(flags.length).toBe(2);
    expect(flags.every((f) => f.reason === "overlapping_chain_uncoupled")).toBe(true);

    // Idempotency: a second call must not duplicate the flags.
    await getActiveRequirements(studentId, {
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    });
    const flagsAgain = await db
      .select()
      .from(migrationReportServiceRequirementsTable)
      .where(inArray(migrationReportServiceRequirementsTable.requirementId, [a, b]));
    expect(flagsAgain.length).toBe(2);
  });
});
