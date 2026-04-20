/**
 * Service Requirement v1 — supersede flow regression suite.
 *
 * Pins the contract from task 889:
 *   - PATCH on uncredited rows still mutates in place.
 *   - PATCH that touches a material field on a credited row returns 409
 *     with `code: "REQUIRES_SUPERSEDE"`.
 *   - PATCH that touches only `notes` (non-material) on a credited row
 *     still succeeds.
 *   - POST .../supersede happy path: end-dates the old row, inserts a new
 *     row pointing back via supersedesId.
 *   - supersedeDate may be in the future.
 *   - Supersede chains preserve a traceable root (R1 → R2 → R3) via
 *     audit metadata.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  asUser,
  createDistrict,
  createSchool,
  createStaff,
  createStudent,
  createServiceType,
  cleanupDistrict,
  cleanupServiceType,
  seedLegalAcceptances,
  cleanupLegalAcceptances,
} from "./helpers";
import {
  db,
  serviceRequirementsTable,
  sessionLogsTable,
  auditLogsTable,
  staffAssignmentsTable,
} from "@workspace/db";
import { eq, inArray, and, sql } from "drizzle-orm";

const USER_ADMIN = "u_sr_supersede_admin";
let districtId: number;
let schoolId: number;
let staffId: number;
let serviceTypeId: number;

const insertedReqIds: number[] = [];
const insertedSessionIds: number[] = [];

beforeAll(async () => {
  await seedLegalAcceptances([USER_ADMIN]);
  const d = await createDistrict({ name: "Test District SR Supersede" });
  districtId = d.id;
  const sch = await createSchool(districtId);
  schoolId = sch.id;
  const sf = await createStaff(schoolId, { role: "provider" });
  staffId = sf.id;
  const svc = await createServiceType();
  serviceTypeId = svc.id;
});

afterAll(async () => {
  if (insertedSessionIds.length > 0) {
    await db.delete(sessionLogsTable).where(inArray(sessionLogsTable.id, insertedSessionIds));
  }
  // The supersede route plus the existing PATCH path call ensureStaffAssignment
  // when provider changes; clear those before the global student delete in
  // setup.ts runs (it doesn't sweep staff_assignments).
  await db.delete(staffAssignmentsTable).where(eq(staffAssignmentsTable.staffId, staffId));
  if (insertedReqIds.length > 0) {
    // Delete in two phases to satisfy the self-FK from supersedesId. Drop
    // the FK by nulling first, then bulk delete.
    await db.update(serviceRequirementsTable)
      .set({ supersedesId: null })
      .where(inArray(serviceRequirementsTable.id, insertedReqIds));
    await db.delete(serviceRequirementsTable).where(inArray(serviceRequirementsTable.id, insertedReqIds));
  }
  await db.delete(auditLogsTable).where(eq(auditLogsTable.actorUserId, USER_ADMIN));
  await cleanupDistrict(districtId);
  await cleanupServiceType(serviceTypeId);
  await cleanupLegalAcceptances([USER_ADMIN]);
});

async function makeReq(opts: {
  studentId: number;
  requiredMinutes?: number;
  startDate?: string;
  notes?: string | null;
  active?: boolean;
}): Promise<typeof serviceRequirementsTable.$inferSelect> {
  const [r] = await db.insert(serviceRequirementsTable).values({
    studentId: opts.studentId,
    serviceTypeId,
    providerId: staffId,
    requiredMinutes: opts.requiredMinutes ?? 60,
    intervalType: "monthly",
    startDate: opts.startDate ?? "2025-09-01",
    notes: opts.notes ?? null,
    active: opts.active ?? true,
  }).returning();
  insertedReqIds.push(r.id);
  return r;
}

async function creditSession(studentId: number, reqId: number, status: "delivered" | "partial" | "completed" = "delivered"): Promise<void> {
  const [log] = await db.insert(sessionLogsTable).values({
    studentId,
    staffId,
    serviceTypeId,
    serviceRequirementId: reqId,
    sessionDate: "2025-09-15",
    durationMinutes: 30,
    status,
  }).returning();
  insertedSessionIds.push(log.id);
}

describe("PATCH /api/service-requirements/:id — supersede guard", () => {
  it("uncredited row: material PATCH still mutates in place", async () => {
    const student = await createStudent(schoolId);
    const req = await makeReq({ studentId: student.id, requiredMinutes: 30 });

    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const res = await adm.patch(`/api/service-requirements/${req.id}`).send({ requiredMinutes: 90 });
    expect(res.status).toBe(200);
    expect(res.body.requiredMinutes).toBe(90);
    const [row] = await db.select().from(serviceRequirementsTable).where(eq(serviceRequirementsTable.id, req.id));
    expect(row.requiredMinutes).toBe(90);
    expect(row.replacedAt).toBeNull();
  });

  it("credited row: PATCH on material field returns 409 REQUIRES_SUPERSEDE", async () => {
    const student = await createStudent(schoolId);
    const req = await makeReq({ studentId: student.id, requiredMinutes: 60 });
    await creditSession(student.id, req.id, "delivered");

    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const res = await adm.patch(`/api/service-requirements/${req.id}`).send({ requiredMinutes: 120 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("REQUIRES_SUPERSEDE");
    expect(res.body.requires_supersede).toBe(true);
    expect(res.body.credited_session_count).toBeGreaterThanOrEqual(1);

    // The row must NOT have changed.
    const [row] = await db.select().from(serviceRequirementsTable).where(eq(serviceRequirementsTable.id, req.id));
    expect(row.requiredMinutes).toBe(60);
  });

  it("credited row: PATCH on `notes` (non-material) succeeds", async () => {
    const student = await createStudent(schoolId);
    const req = await makeReq({ studentId: student.id, notes: "before" });
    await creditSession(student.id, req.id, "partial");

    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const res = await adm.patch(`/api/service-requirements/${req.id}`).send({ notes: "after" });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBe("after");
  });

  it("credited row: PATCH that only end-dates via active=false succeeds", async () => {
    const student = await createStudent(schoolId);
    const req = await makeReq({ studentId: student.id });
    await creditSession(student.id, req.id);

    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const res = await adm.patch(`/api/service-requirements/${req.id}`).send({ active: false });
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
  });

  it("credited row: PATCH that touches chain metadata (replacedAt) returns 409 too — allowlist guard", async () => {
    const student = await createStudent(schoolId);
    const req = await makeReq({ studentId: student.id });
    await creditSession(student.id, req.id);

    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const res = await adm.patch(`/api/service-requirements/${req.id}`).send({ replacedAt: new Date().toISOString() });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("REQUIRES_SUPERSEDE");
    const [row] = await db.select().from(serviceRequirementsTable).where(eq(serviceRequirementsTable.id, req.id));
    expect(row.replacedAt).toBeNull();
  });

  it("credited row: PATCH that flips active back to true returns 409 — only end-dating allowed in place", async () => {
    const student = await createStudent(schoolId);
    const req = await makeReq({ studentId: student.id, active: false });
    await creditSession(student.id, req.id);

    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const res = await adm.patch(`/api/service-requirements/${req.id}`).send({ active: true });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("REQUIRES_SUPERSEDE");
  });

  it.each([
    ["serviceTypeId", { serviceTypeId: -1 }],
    ["setting", { setting: "private_room" }],
    ["groupSize", { groupSize: "2" }],
    ["intervalType", { intervalType: "weekly" }],
    ["deliveryType", { deliveryType: "consult" }],
    ["deliveryModel", { deliveryModel: "group" }],
    ["startDate", { startDate: "2025-08-01" }],
    ["endDate", { endDate: "2025-12-01" }],
    ["providerId", { providerId: -1 }],
    ["schoolId", { schoolId: -1 }],
    ["supersedesId", { supersedesId: 999_999_999 }],
  ] as const)("credited row: PATCH that touches material field %s returns 409", async (fieldName, payload) => {
    const student = await createStudent(schoolId);
    const req = await makeReq({ studentId: student.id });
    await creditSession(student.id, req.id);

    // For fields that need a real foreign id, swap in a real one that
    // DIFFERS from the existing row so the value-equality short-circuit
    // doesn't mask the guard. The guard must trip BEFORE any FK
    // validation in either case.
    const body: Record<string, unknown> = { ...payload };
    if (fieldName === "providerId") {
      const otherStaff = await createStaff(schoolId, { role: "provider", firstName: "Other" });
      body.providerId = otherStaff.id;
    }
    if (fieldName === "serviceTypeId") {
      const otherType = await createServiceType();
      body.serviceTypeId = otherType.id;
    }
    if (fieldName === "schoolId") {
      const otherSchool = await createSchool(districtId);
      body.schoolId = otherSchool.id;
    }
    if (fieldName === "supersedesId") body.supersedesId = req.id; // any non-original value

    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const res = await adm.patch(`/api/service-requirements/${req.id}`).send(body);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("REQUIRES_SUPERSEDE");
  });

  it("credited row: PATCH that nulls a material field (serviceTypeId=null) returns 409 — null-drop short-circuit can't bypass guard", async () => {
    const student = await createStudent(schoolId);
    const req = await makeReq({ studentId: student.id });
    await creditSession(student.id, req.id);

    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const res = await adm.patch(`/api/service-requirements/${req.id}`).send({ serviceTypeId: null });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("REQUIRES_SUPERSEDE");
  });

  it("non-credited statuses (e.g. completed) do NOT trigger 409", async () => {
    const student = await createStudent(schoolId);
    const req = await makeReq({ studentId: student.id });
    // 'completed' is not in the credited set; supersede guard should NOT fire.
    await creditSession(student.id, req.id, "completed");

    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const res = await adm.patch(`/api/service-requirements/${req.id}`).send({ requiredMinutes: 45 });
    expect(res.status).toBe(200);
    expect(res.body.requiredMinutes).toBe(45);
  });
});

describe("POST /api/service-requirements/:id/supersede", () => {
  it("happy path: end-dates the old row and inserts a new row chained via supersedesId", async () => {
    const student = await createStudent(schoolId);
    const req = await makeReq({ studentId: student.id, requiredMinutes: 60, startDate: "2025-09-01" });
    await creditSession(student.id, req.id);

    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const res = await adm.post(`/api/service-requirements/${req.id}/supersede`).send({
      supersedeDate: "2025-10-01",
      requiredMinutes: 90,
    });
    expect(res.status).toBe(201);
    expect(res.body.old.id).toBe(req.id);
    expect(res.body.old.endDate).toBe("2025-09-30");
    expect(res.body.old.active).toBe(false);
    expect(res.body.old.replacedAt).not.toBeNull();
    expect(res.body.new.id).not.toBe(req.id);
    expect(res.body.new.supersedesId).toBe(req.id);
    expect(res.body.new.requiredMinutes).toBe(90);
    expect(res.body.new.startDate).toBe("2025-10-01");
    expect(res.body.new.active).toBe(true);
    insertedReqIds.push(res.body.new.id);

    const [oldRow] = await db.select().from(serviceRequirementsTable).where(eq(serviceRequirementsTable.id, req.id));
    expect(oldRow.active).toBe(false);
    expect(oldRow.endDate).toBe("2025-09-30");
    expect(oldRow.replacedAt).not.toBeNull();
  });

  it("supersedeDate is optional — server defaults it to today (UTC)", async () => {
    const student = await createStudent(schoolId);
    const req = await makeReq({ studentId: student.id });
    await creditSession(student.id, req.id);

    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const today = new Date().toISOString().slice(0, 10);
    const res = await adm.post(`/api/service-requirements/${req.id}/supersede`).send({
      requiredMinutes: 50,
    });
    expect(res.status).toBe(201);
    expect(res.body.new.startDate).toBe(today);
    insertedReqIds.push(res.body.new.id);
  });

  it("future supersedeDate is accepted", async () => {
    const student = await createStudent(schoolId);
    const req = await makeReq({ studentId: student.id });
    await creditSession(student.id, req.id);

    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const res = await adm.post(`/api/service-requirements/${req.id}/supersede`).send({
      supersedeDate: "2099-01-15",
      requiredMinutes: 75,
    });
    expect(res.status).toBe(201);
    expect(res.body.new.startDate).toBe("2099-01-15");
    expect(res.body.old.endDate).toBe("2099-01-14");
    insertedReqIds.push(res.body.new.id);
  });

  it("multi-supersede chain (R1 → R2 → R3) is traceable in audit metadata", async () => {
    const student = await createStudent(schoolId);
    const r1 = await makeReq({ studentId: student.id, requiredMinutes: 30 });
    await creditSession(student.id, r1.id);

    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const res2 = await adm.post(`/api/service-requirements/${r1.id}/supersede`).send({
      supersedeDate: "2025-10-01",
      requiredMinutes: 60,
    });
    expect(res2.status).toBe(201);
    const r2Id: number = res2.body.new.id;
    insertedReqIds.push(r2Id);
    await creditSession(student.id, r2Id, "partial");

    const res3 = await adm.post(`/api/service-requirements/${r2Id}/supersede`).send({
      supersedeDate: "2025-11-01",
      requiredMinutes: 90,
    });
    expect(res3.status).toBe(201);
    const r3Id: number = res3.body.new.id;
    insertedReqIds.push(r3Id);

    expect(res3.body.new.supersedesId).toBe(r2Id);

    // Give the fire-and-forget audit insert a tick to land.
    await new Promise((r) => setTimeout(r, 100));

    // The audit row created for R3 must carry the chain root = R1.
    const auditRows = await db.select().from(auditLogsTable).where(
      and(
        eq(auditLogsTable.actorUserId, USER_ADMIN),
        eq(auditLogsTable.targetTable, "service_requirements"),
        eq(auditLogsTable.targetId, String(r3Id)),
      ),
    );
    expect(auditRows.length).toBeGreaterThan(0);
    const meta = (auditRows[0].metadata ?? {}) as Record<string, unknown>;
    expect(meta.supersede_chain_root_id).toBe(r1.id);
    expect(typeof meta.correlation_id).toBe("string");
  });

  it("identity fields (studentId, schoolId) in body are ignored — supersede stays on original student/school (cross-district IDOR guard)", async () => {
    // Build a victim student in a *different* district. If the supersede
    // body could re-target studentId/schoolId, an attacker would be able
    // to silently graft a new active requirement onto a foreign student.
    const otherDistrict = await createDistrict({ name: "Other District SR Supersede" });
    const otherSchool = await createSchool(otherDistrict.id);
    const victim = await createStudent(otherSchool.id);

    const home = await createStudent(schoolId);
    const r1 = await makeReq({ studentId: home.id });
    await creditSession(home.id, r1.id);

    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const res = await adm.post(`/api/service-requirements/${r1.id}/supersede`).send({
      supersedeDate: "2025-10-01",
      requiredMinutes: 90,
      // Hostile overrides — server MUST drop these.
      studentId: victim.id,
      schoolId: otherSchool.id,
    } as Record<string, unknown>);
    expect(res.status).toBe(201);
    expect(res.body.new.studentId).toBe(home.id);
    expect(res.body.new.studentId).not.toBe(victim.id);
    insertedReqIds.push(res.body.new.id);

    // Confirm in the DB too — defense in depth against a future response
    // shaping change masking a real bug.
    const [persisted] = await db.select().from(serviceRequirementsTable)
      .where(eq(serviceRequirementsTable.id, res.body.new.id));
    expect(persisted.studentId).toBe(home.id);

    await cleanupDistrict(otherDistrict.id);
  });

  it("returns 404 for an id that doesn't exist or isn't in the caller's district", async () => {
    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const res = await adm.post(`/api/service-requirements/999999999/supersede`).send({
      supersedeDate: "2025-10-01",
    });
    expect(res.status).toBe(404);
  });

});

describe("GET /api/service-requirements/:id/chain", () => {
  it("returns the full chain (root → newest) with changedFields, actor, and correlationId per entry", async () => {
    const student = await createStudent(schoolId);
    const r1 = await makeReq({ studentId: student.id, requiredMinutes: 30, startDate: "2025-09-01" });
    await creditSession(student.id, r1.id);

    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const res2 = await adm.post(`/api/service-requirements/${r1.id}/supersede`).send({
      supersedeDate: "2025-10-01",
      requiredMinutes: 60,
    });
    expect(res2.status).toBe(201);
    const r2Id: number = res2.body.new.id;
    insertedReqIds.push(r2Id);
    await creditSession(student.id, r2Id, "partial");

    const res3 = await adm.post(`/api/service-requirements/${r2Id}/supersede`).send({
      supersedeDate: "2025-11-01",
      requiredMinutes: 90,
      notes: "second rewrite",
    });
    expect(res3.status).toBe(201);
    const r3Id: number = res3.body.new.id;
    insertedReqIds.push(r3Id);

    // Allow fire-and-forget audit insert to land before reading chain.
    await new Promise((r) => setTimeout(r, 100));

    // Caller may pass any chain member — response is normalized to root.
    for (const seed of [r1.id, r2Id, r3Id]) {
      const chainRes = await adm.get(`/api/service-requirements/${seed}/chain`);
      expect(chainRes.status).toBe(200);
      const chain = chainRes.body.chain as Array<Record<string, unknown>>;
      expect(chain.length).toBe(3);
      expect((chain[0].requirement as any).id).toBe(r1.id);
      expect((chain[1].requirement as any).id).toBe(r2Id);
      expect((chain[2].requirement as any).id).toBe(r3Id);
      expect(chain[0].changedFields).toEqual([]);
      expect(chain[1].changedFields).toContain("requiredMinutes");
      expect(chain[2].changedFields).toContain("requiredMinutes");
      expect(chain[2].changedFields).toContain("notes");
      expect(typeof chain[1].supersedeCorrelationId).toBe("string");
      expect(chain[1].supersededByActorUserId).toBe(USER_ADMIN);
      expect(chain[2].supersededAt).toBeTruthy();
    }
  });

  it("returns 404 for an id that doesn't exist or isn't in the caller's district", async () => {
    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const res = await adm.get(`/api/service-requirements/999999999/chain`);
    expect(res.status).toBe(404);
  });
});

describe("audit chain coverage", () => {
  it("supersede emits two audit rows sharing one correlation id", async () => {
    const student = await createStudent(schoolId);
    const r1 = await makeReq({ studentId: student.id });
    await creditSession(student.id, r1.id);

    const adm = asUser({ userId: USER_ADMIN, role: "admin", districtId });
    const res = await adm.post(`/api/service-requirements/${r1.id}/supersede`).send({
      supersedeDate: "2025-10-01",
      notes: "post-supersede",
    });
    expect(res.status).toBe(201);
    const r2Id: number = res.body.new.id;
    insertedReqIds.push(r2Id);

    await new Promise((r) => setTimeout(r, 100));

    const rows = await db.select().from(auditLogsTable).where(
      and(
        eq(auditLogsTable.actorUserId, USER_ADMIN),
        eq(auditLogsTable.targetTable, "service_requirements"),
        inArray(auditLogsTable.targetId, [String(r1.id), String(r2Id)]),
        sql`${auditLogsTable.metadata}->>'correlation_id' IS NOT NULL`,
      ),
    );
    // The supersede call should produce exactly two audit rows — one
    // for the old row update, one for the new row insert — and both
    // should share a single correlation_id. We assert exact shape so a
    // future refactor that fans out an extra audit row, drops one of
    // them, or assigns separate ids per row trips this test.
    expect(rows.length).toBe(2);
    const targetIds = new Set(rows.map((r) => r.targetId));
    expect(targetIds.has(String(r1.id))).toBe(true);
    expect(targetIds.has(String(r2Id))).toBe(true);
    const correlationIds = new Set(
      rows.map((r) => (r.metadata as Record<string, unknown>).correlation_id),
    );
    expect(correlationIds.size).toBe(1);
    const onlyId = [...correlationIds][0];
    expect(typeof onlyId).toBe("string");
    expect((onlyId as string).length).toBeGreaterThan(0);
  });
});
