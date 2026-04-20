/**
 * School Calendar v0 — Slice 1
 *
 * CRUD + invariants for /api/schools/:schoolId/calendar-exceptions.
 *
 * Covers:
 *   - 200 list returns rows scoped to the school
 *   - 201 create + 200 patch + 204 delete happy paths
 *   - 409 on duplicate (school_id, exception_date)
 *   - 400 when type ↔ dismissalTime invariant is violated
 *   - 400 when dismissalTime format is invalid
 *   - 400 when exceptionDate is not ISO
 *   - 403 cross-district access is blocked
 *   - 403 non-admin role cannot create/update/delete (read remains open)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  asUser,
  createDistrict,
  createSchool,
  cleanupDistrict,
  seedLegalAcceptances,
  cleanupLegalAcceptances,
} from "./helpers";
import { db, schoolCalendarExceptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

describe("school calendar exceptions", () => {
  let districtA: number;
  let districtB: number;
  let schoolA: number;
  let schoolB: number;

  // Two users (admin in district A, non-admin in district A) plus a
  // cross-district admin in district B.
  const TEST_USER_IDS = ["u_sce_a_admin", "u_sce_a_teacher", "u_sce_b_admin"];

  beforeAll(async () => {
    const dA = await createDistrict({ name: "SCE District A" });
    const dB = await createDistrict({ name: "SCE District B" });
    districtA = dA.id;
    districtB = dB.id;
    schoolA = (await createSchool(districtA, { name: "SCE School A" })).id;
    schoolB = (await createSchool(districtB, { name: "SCE School B" })).id;
    await seedLegalAcceptances(TEST_USER_IDS);
  });

  afterAll(async () => {
    await db.delete(schoolCalendarExceptionsTable).where(eq(schoolCalendarExceptionsTable.schoolId, schoolA));
    await db.delete(schoolCalendarExceptionsTable).where(eq(schoolCalendarExceptionsTable.schoolId, schoolB));
    await cleanupDistrict(districtA);
    await cleanupDistrict(districtB);
    await cleanupLegalAcceptances(TEST_USER_IDS);
  });

  const adminA = () => asUser({ userId: "u_sce_a_admin", districtId: districtA, role: "admin" });
  // Use a non-admin/non-coordinator role recognized as a real TrellisRole
  // so requireAuth passes and requireRoles is the gate that fires.
  const providerA = () => asUser({ userId: "u_sce_a_teacher", districtId: districtA, role: "provider" });
  const adminB = () => asUser({ userId: "u_sce_b_admin", districtId: districtB, role: "admin" });

  it("creates a closure (201), lists it (200), patches it, deletes it (204)", async () => {
    const create = await adminA().post(`/api/schools/${schoolA}/calendar-exceptions`).send({
      exceptionDate: "2026-01-12",
      type: "closure",
      reason: "Snow Day",
    });
    expect(create.status).toBe(201);
    expect(create.body.type).toBe("closure");
    expect(create.body.dismissalTime).toBeNull();
    const id = create.body.id;

    const list = await adminA().get(`/api/schools/${schoolA}/calendar-exceptions?from=2026-01-01&to=2026-01-31`);
    expect(list.status).toBe(200);
    expect(list.body.find((r: { id: number }) => r.id === id)).toBeTruthy();

    const patch = await adminA().patch(`/api/schools/${schoolA}/calendar-exceptions/${id}`).send({
      reason: "Snow Day (rescheduled)",
    });
    expect(patch.status).toBe(200);
    expect(patch.body.reason).toBe("Snow Day (rescheduled)");

    const del = await adminA().delete(`/api/schools/${schoolA}/calendar-exceptions/${id}`);
    expect(del.status).toBe(204);
  });

  it("creates an early_release with dismissalTime", async () => {
    const r = await adminA().post(`/api/schools/${schoolA}/calendar-exceptions`).send({
      exceptionDate: "2026-02-04",
      type: "early_release",
      dismissalTime: "11:30",
      reason: "PD Half Day",
    });
    expect(r.status).toBe(201);
    expect(r.body.dismissalTime).toBe("11:30");
    await db.delete(schoolCalendarExceptionsTable).where(eq(schoolCalendarExceptionsTable.id, r.body.id));
  });

  it("rejects early_release without dismissalTime (400)", async () => {
    const r = await adminA().post(`/api/schools/${schoolA}/calendar-exceptions`).send({
      exceptionDate: "2026-02-05",
      type: "early_release",
      reason: "PD Half Day",
    });
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toMatch(/dismissalTime/i);
  });

  it("rejects closure with dismissalTime set (400)", async () => {
    const r = await adminA().post(`/api/schools/${schoolA}/calendar-exceptions`).send({
      exceptionDate: "2026-02-06",
      type: "closure",
      dismissalTime: "12:00",
      reason: "Bad",
    });
    expect(r.status).toBe(400);
  });

  it("rejects malformed dismissalTime (400)", async () => {
    const r = await adminA().post(`/api/schools/${schoolA}/calendar-exceptions`).send({
      exceptionDate: "2026-02-07",
      type: "early_release",
      dismissalTime: "11:60",
      reason: "Bad time",
    });
    expect(r.status).toBe(400);
  });

  it("rejects malformed exceptionDate (400)", async () => {
    const r = await adminA().post(`/api/schools/${schoolA}/calendar-exceptions`).send({
      exceptionDate: "01/12/2026",
      type: "closure",
      reason: "Snow",
    });
    expect(r.status).toBe(400);
  });

  it("returns 409 on duplicate (school, date)", async () => {
    const date = "2026-03-15";
    const a = await adminA().post(`/api/schools/${schoolA}/calendar-exceptions`).send({
      exceptionDate: date, type: "closure", reason: "First",
    });
    expect(a.status).toBe(201);
    const b = await adminA().post(`/api/schools/${schoolA}/calendar-exceptions`).send({
      exceptionDate: date, type: "closure", reason: "Second",
    });
    expect(b.status).toBe(409);
    await db.delete(schoolCalendarExceptionsTable).where(eq(schoolCalendarExceptionsTable.id, a.body.id));
  });

  it("blocks cross-district write access (403)", async () => {
    const r = await adminB().post(`/api/schools/${schoolA}/calendar-exceptions`).send({
      exceptionDate: "2026-04-01", type: "closure", reason: "x",
    });
    expect(r.status).toBe(403);
  });

  it("blocks cross-district list access (403)", async () => {
    const r = await adminB().get(`/api/schools/${schoolA}/calendar-exceptions`);
    expect(r.status).toBe(403);
  });

  it("PATCH flips type closure→early_release with merged dismissalTime", async () => {
    const created = await adminA().post(`/api/schools/${schoolA}/calendar-exceptions`).send({
      exceptionDate: "2026-06-10", type: "closure", reason: "Original closure",
    });
    expect(created.status).toBe(201);
    const id = created.body.id;

    // Flipping to early_release requires the caller to also send dismissalTime
    // (existing row's dismissalTime is null). Without it → 400.
    const bad = await adminA().patch(`/api/schools/${schoolA}/calendar-exceptions/${id}`).send({
      type: "early_release",
    });
    expect(bad.status).toBe(400);

    // With dismissalTime supplied → 200 and persisted.
    const good = await adminA().patch(`/api/schools/${schoolA}/calendar-exceptions/${id}`).send({
      type: "early_release", dismissalTime: "12:15",
    });
    expect(good.status).toBe(200);
    expect(good.body.type).toBe("early_release");
    expect(good.body.dismissalTime).toBe("12:15");

    // Flip back to closure: must explicitly null dismissalTime.
    const bad2 = await adminA().patch(`/api/schools/${schoolA}/calendar-exceptions/${id}`).send({
      type: "closure",
    });
    expect(bad2.status).toBe(400);

    const good2 = await adminA().patch(`/api/schools/${schoolA}/calendar-exceptions/${id}`).send({
      type: "closure", dismissalTime: null,
    });
    expect(good2.status).toBe(200);
    expect(good2.body.dismissalTime).toBeNull();

    await db.delete(schoolCalendarExceptionsTable).where(eq(schoolCalendarExceptionsTable.id, id));
  });

  it("PATCH to a date already used by another row returns 409", async () => {
    const a = await adminA().post(`/api/schools/${schoolA}/calendar-exceptions`).send({
      exceptionDate: "2026-07-01", type: "closure", reason: "A",
    });
    const b = await adminA().post(`/api/schools/${schoolA}/calendar-exceptions`).send({
      exceptionDate: "2026-07-02", type: "closure", reason: "B",
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const collide = await adminA().patch(`/api/schools/${schoolA}/calendar-exceptions/${b.body.id}`).send({
      exceptionDate: "2026-07-01",
    });
    expect(collide.status).toBe(409);

    await db.delete(schoolCalendarExceptionsTable).where(eq(schoolCalendarExceptionsTable.id, a.body.id));
    await db.delete(schoolCalendarExceptionsTable).where(eq(schoolCalendarExceptionsTable.id, b.body.id));
  });

  it("blocks non-admin write (403) but allows read (200)", async () => {
    const w = await providerA().post(`/api/schools/${schoolA}/calendar-exceptions`).send({
      exceptionDate: "2026-05-01", type: "closure", reason: "x",
    });
    expect(w.status).toBe(403);
    const r = await providerA().get(`/api/schools/${schoolA}/calendar-exceptions`);
    expect(r.status).toBe(200);
  });
});
