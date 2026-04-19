/**
 * Regression suite for GET /api/dashboard/makeup-obligations
 *
 * Covers:
 *   1. Empty result set — no obligations → empty array
 *   2. Status filtering — only pending / in_progress rows are returned;
 *      completed / resolved obligations must be excluded
 *   3. Sort order — obligations are returned oldest-first (ascending createdAt)
 *   4. daysOpen calculation — floor((now - createdAt) / ms_per_day)
 *   5. minutesRemaining calculation — max(0, minutesOwed - minutesDelivered)
 *   6. Tenant isolation — district A's admin cannot see district B's obligations
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  asUser,
  createDistrict,
  createSchool,
  createStudent,
  cleanupDistrict,
  seedLegalAcceptances,
  cleanupLegalAcceptances,
} from "./helpers";
import { db, compensatoryObligationsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

const TEST_USERS = ["u_mo_admin_a", "u_mo_admin_b"];

describe("GET /api/dashboard/makeup-obligations", () => {
  let districtA: number;
  let districtB: number;
  let studentA1: number;
  let studentA2: number;
  let studentB: number;

  const createdObligationIds: number[] = [];

  /** Insert a compensatory_obligation row and track its id for cleanup. */
  async function insertObligation(opts: {
    studentId: number;
    minutesOwed: number;
    minutesDelivered?: number;
    status?: string;
    createdAt?: Date;
  }) {
    const row = await db
      .insert(compensatoryObligationsTable)
      .values({
        studentId: opts.studentId,
        periodStart: "2025-09-01",
        periodEnd: "2026-06-15",
        minutesOwed: opts.minutesOwed,
        minutesDelivered: opts.minutesDelivered ?? 0,
        status: opts.status ?? "pending",
        source: "manual",
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      })
      .returning();
    createdObligationIds.push(row[0].id);
    return row[0];
  }

  beforeAll(async () => {
    await seedLegalAcceptances(TEST_USERS);

    const dA = await createDistrict();
    districtA = dA.id;
    const dB = await createDistrict();
    districtB = dB.id;

    const sA = await createSchool(districtA);
    const sB = await createSchool(districtB);

    const stA1 = await createStudent(sA.id);
    const stA2 = await createStudent(sA.id);
    const stB = await createStudent(sB.id);

    studentA1 = stA1.id;
    studentA2 = stA2.id;
    studentB = stB.id;
  });

  afterAll(async () => {
    if (createdObligationIds.length > 0) {
      await db
        .delete(compensatoryObligationsTable)
        .where(inArray(compensatoryObligationsTable.id, createdObligationIds));
    }
    await cleanupLegalAcceptances(TEST_USERS);
    await cleanupDistrict(districtA);
    await cleanupDistrict(districtB);
  });

  it("returns 200 with an empty array when a district has no obligations", async () => {
    const admin = asUser({ userId: "u_mo_admin_a", role: "admin", districtId: districtA });
    const res = await admin.get("/api/dashboard/makeup-obligations");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as unknown[]).length).toBe(0);
  });

  it("excludes completed / resolved obligations — only pending and in_progress are returned", async () => {
    await insertObligation({ studentId: studentA1, minutesOwed: 60, status: "pending" });
    await insertObligation({ studentId: studentA1, minutesOwed: 30, status: "in_progress" });
    await insertObligation({ studentId: studentA1, minutesOwed: 45, status: "completed" });
    await insertObligation({ studentId: studentA1, minutesOwed: 20, status: "resolved" });

    const admin = asUser({ userId: "u_mo_admin_a", role: "admin", districtId: districtA });
    const res = await admin.get("/api/dashboard/makeup-obligations");
    expect(res.status).toBe(200);

    const rows = res.body as Array<{ studentId: number; minutesOwed: number }>;
    const forStudent = rows.filter((r) => r.studentId === studentA1);

    const owedValues = forStudent.map((r) => r.minutesOwed).sort((a, b) => a - b);
    expect(owedValues).toContain(60);
    expect(owedValues).toContain(30);
    expect(owedValues).not.toContain(45);
    expect(owedValues).not.toContain(20);
  });

  it("returns obligations sorted oldest-first (ascending createdAt)", async () => {
    const older = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const newer = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const oblOlder = await insertObligation({
      studentId: studentA2,
      minutesOwed: 100,
      status: "pending",
      createdAt: older,
    });
    const oblNewer = await insertObligation({
      studentId: studentA2,
      minutesOwed: 50,
      status: "pending",
      createdAt: newer,
    });

    const admin = asUser({ userId: "u_mo_admin_a", role: "admin", districtId: districtA });
    const res = await admin.get("/api/dashboard/makeup-obligations");
    expect(res.status).toBe(200);

    const rows = res.body as Array<{ obligationId: number; createdAt: string }>;
    const relevantIds = [oblOlder.id, oblNewer.id];
    const filtered = rows.filter((r) => relevantIds.includes(r.obligationId));

    expect(filtered.length).toBe(2);
    const timestamps = filtered.map((r) => new Date(r.createdAt).getTime());
    expect(timestamps[0]).toBeLessThanOrEqual(timestamps[1]);
  });

  it("calculates daysOpen correctly — floor of days since createdAt", async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const obl = await insertObligation({
      studentId: studentA2,
      minutesOwed: 90,
      status: "pending",
      createdAt: sevenDaysAgo,
    });

    const admin = asUser({ userId: "u_mo_admin_a", role: "admin", districtId: districtA });
    const res = await admin.get("/api/dashboard/makeup-obligations");
    expect(res.status).toBe(200);

    const rows = res.body as Array<{ obligationId: number; daysOpen: number }>;
    const found = rows.find((r) => r.obligationId === obl.id);
    expect(found).toBeDefined();
    expect(found!.daysOpen).toBeGreaterThanOrEqual(6);
    expect(found!.daysOpen).toBeLessThanOrEqual(8);
  });

  it("calculates minutesRemaining as max(0, minutesOwed - minutesDelivered)", async () => {
    const oblPartial = await insertObligation({
      studentId: studentA2,
      minutesOwed: 120,
      minutesDelivered: 45,
      status: "in_progress",
    });
    const oblOverDelivered = await insertObligation({
      studentId: studentA2,
      minutesOwed: 30,
      minutesDelivered: 60,
      status: "in_progress",
    });

    const admin = asUser({ userId: "u_mo_admin_a", role: "admin", districtId: districtA });
    const res = await admin.get("/api/dashboard/makeup-obligations");
    expect(res.status).toBe(200);

    const rows = res.body as Array<{
      obligationId: number;
      minutesOwed: number;
      minutesDelivered: number;
      minutesRemaining: number;
    }>;

    const partial = rows.find((r) => r.obligationId === oblPartial.id);
    expect(partial).toBeDefined();
    expect(partial!.minutesRemaining).toBe(75);

    const over = rows.find((r) => r.obligationId === oblOverDelivered.id);
    expect(over).toBeDefined();
    expect(over!.minutesRemaining).toBe(0);
  });

  it("tenant isolation — district A admin cannot see district B obligations", async () => {
    const oblB = await insertObligation({
      studentId: studentB,
      minutesOwed: 60,
      status: "pending",
    });

    const adminA = asUser({ userId: "u_mo_admin_a", role: "admin", districtId: districtA });
    const res = await adminA.get("/api/dashboard/makeup-obligations");
    expect(res.status).toBe(200);

    const ids = (res.body as Array<{ obligationId: number }>).map((r) => r.obligationId);
    expect(ids).not.toContain(oblB.id);
  });

  it("tenant isolation — district B admin sees only district B obligations", async () => {
    const oblB = await insertObligation({
      studentId: studentB,
      minutesOwed: 45,
      status: "in_progress",
    });

    const adminB = asUser({ userId: "u_mo_admin_b", role: "admin", districtId: districtB });
    const res = await adminB.get("/api/dashboard/makeup-obligations");
    expect(res.status).toBe(200);

    const ids = (res.body as Array<{ obligationId: number }>).map((r) => r.obligationId);
    expect(ids).toContain(oblB.id);

    const rows = res.body as Array<{ obligationId: number; studentId: number }>;
    const districtAStudentIds = [studentA1, studentA2];
    const leakedRows = rows.filter((r) => districtAStudentIds.includes(r.studentId));
    expect(leakedRows.length).toBe(0);
  });
});
