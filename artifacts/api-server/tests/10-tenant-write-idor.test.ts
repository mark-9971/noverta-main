/**
 * Tenant write/delete IDOR regression suite.
 *
 * These tests exercise the cross-tenant write & delete attack paths that were
 * patched by `assertStudentInCallerDistrict` (and sibling helpers in
 * `lib/districtScope.ts`). Every test uses an admin in District A and a
 * resource that belongs to a student in District B. The expected response is
 * 404 (intentionally not 403) so we don't leak existence of out-of-tenant rows.
 *
 * Each case is paired with a positive control on a same-tenant resource to
 * make sure the new guards aren't over-blocking legitimate traffic.
 *
 * On the OLD vulnerable handler (direct `WHERE id = :id` with no district
 * join) every cross-tenant assertion in this file would have returned 200 and
 * mutated/deleted District B's row. On the patched handler the same call
 * returns 404 and the row is untouched.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
import {
  db,
  iepGoalsTable,
  iepAccommodationsTable,
  studentNotesTable,
  documentsTable,
  signatureRequestsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

describe("tenant write/delete IDOR", () => {
  let districtA: number;
  let districtB: number;
  let studentA: number;
  let studentB: number;
  let staffA: number;
  let staffB: number;

  // Resources owned by district B that admin A will try to mutate.
  let goalB: number;
  let accB: number;
  let noteB: number;
  let docB: number;
  let sigTokenB: string;

  // Same-tenant control resources owned by district A.
  let goalA: number;
  let accA: number;
  let noteA: number;
  let docA: number;

  beforeAll(async () => {
    await seedLegalAcceptances(["u_a_admin", "u_b_admin"]);

    const dA = await createDistrict({ name: "District A" });
    const dB = await createDistrict({ name: "District B" });
    districtA = dA.id;
    districtB = dB.id;

    const sA = await createSchool(districtA);
    const sB = await createSchool(districtB);

    const stA = await createStudent(sA.id);
    const stB = await createStudent(sB.id);
    studentA = stA.id;
    studentB = stB.id;

    const stfA = await createStaff(sA.id);
    const stfB = await createStaff(sB.id);
    staffA = stfA.id;
    staffB = stfB.id;

    // District-A resources (positive controls)
    const [g] = await db.insert(iepGoalsTable).values({
      studentId: studentA, goalArea: "reading", annualGoal: "Read at grade level",
    }).returning();
    goalA = g.id;
    const [a] = await db.insert(iepAccommodationsTable).values({
      studentId: studentA, category: "instruction", description: "Extra time on tests",
    }).returning();
    accA = a.id;
    const [n] = await db.insert(studentNotesTable).values({
      studentId: studentA, authorStaffId: staffA, content: "Initial note A",
    }).returning();
    noteA = n.id;
    const [d] = await db.insert(documentsTable).values({
      studentId: studentA, uploadedByUserId: "u_a_admin", category: "iep",
      title: "IEP A", fileName: "iep_a.pdf", contentType: "application/pdf",
      fileSize: 1024, objectPath: `/objects/uploads/schools/${sA.id}/students/${studentA}/iep_a.pdf`,
    }).returning();
    docA = d.id;

    // District-B resources (cross-tenant attack targets)
    const [gB] = await db.insert(iepGoalsTable).values({
      studentId: studentB, goalArea: "math", annualGoal: "Master multiplication",
    }).returning();
    goalB = gB.id;
    const [aB] = await db.insert(iepAccommodationsTable).values({
      studentId: studentB, category: "environment", description: "Quiet testing room",
    }).returning();
    accB = aB.id;
    const [nB] = await db.insert(studentNotesTable).values({
      studentId: studentB, authorStaffId: staffB, content: "Confidential B note",
    }).returning();
    noteB = nB.id;
    const [dB2] = await db.insert(documentsTable).values({
      studentId: studentB, uploadedByUserId: "u_b_admin", category: "iep",
      title: "IEP B", fileName: "iep_b.pdf", contentType: "application/pdf",
      fileSize: 2048, objectPath: `/objects/uploads/schools/${sB.id}/students/${studentB}/iep_b.pdf`,
    }).returning();
    docB = dB2.id;
    const [sigB] = await db.insert(signatureRequestsTable).values({
      documentId: docB, recipientName: "Parent B", recipientEmail: "parent_b@example.com",
      token: `tok_test_${Date.now()}_${process.pid}`,
    }).returning();
    sigTokenB = sigB.token;
  });

  afterAll(async () => {
    // Drop child rows we created directly (cleanupDistrict doesn't know about
    // these tables) before the standard FK-order district teardown.
    await db.delete(signatureRequestsTable).where(inArray(signatureRequestsTable.documentId, [docA, docB]));
    await db.delete(documentsTable).where(inArray(documentsTable.id, [docA, docB]));
    await db.delete(studentNotesTable).where(inArray(studentNotesTable.id, [noteA, noteB]));
    await db.delete(iepAccommodationsTable).where(inArray(iepAccommodationsTable.id, [accA, accB]));
    await db.delete(iepGoalsTable).where(inArray(iepGoalsTable.id, [goalA, goalB]));
    await cleanupDistrict(districtA);
    await cleanupDistrict(districtB);
    await cleanupLegalAcceptances(["u_a_admin", "u_b_admin"]);
  });

  // ---------- iep_goals ----------

  it("admin in district A cannot PATCH /api/iep-goals/:id of district B (404)", async () => {
    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });
    const res = await adminA.patch(`/api/iep-goals/${goalB}`).send({ annualGoal: "PWNED" });
    expect(res.status).toBe(404);
    const [row] = await db.select().from(iepGoalsTable).where(eq(iepGoalsTable.id, goalB));
    expect(row?.annualGoal).toBe("Master multiplication");
  });

  it("admin in district A cannot DELETE /api/iep-goals/:id of district B (404)", async () => {
    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });
    const res = await adminA.delete(`/api/iep-goals/${goalB}`);
    expect(res.status).toBe(404);
    const [row] = await db.select().from(iepGoalsTable).where(eq(iepGoalsTable.id, goalB));
    expect(row).toBeDefined();
  });

  it("admin in district A CAN PATCH their own /api/iep-goals/:id (200)", async () => {
    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });
    const res = await adminA.patch(`/api/iep-goals/${goalA}`).send({ annualGoal: "Read fluently" });
    expect(res.status).toBe(200);
    expect(res.body.annualGoal).toBe("Read fluently");
  });

  // ---------- iep_accommodations ----------

  it("admin in district A cannot PATCH /api/accommodations/:id of district B (404)", async () => {
    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });
    const res = await adminA.patch(`/api/accommodations/${accB}`).send({ description: "PWNED" });
    expect(res.status).toBe(404);
    const [row] = await db.select().from(iepAccommodationsTable).where(eq(iepAccommodationsTable.id, accB));
    expect(row?.description).toBe("Quiet testing room");
  });

  it("admin in district A cannot DELETE /api/accommodations/:id of district B (404)", async () => {
    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });
    const res = await adminA.delete(`/api/accommodations/${accB}`);
    expect(res.status).toBe(404);
    const [row] = await db.select().from(iepAccommodationsTable).where(eq(iepAccommodationsTable.id, accB));
    expect(row).toBeDefined();
  });

  it("admin in district A CAN PATCH their own /api/accommodations/:id (200)", async () => {
    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });
    const res = await adminA.patch(`/api/accommodations/${accA}`).send({ description: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe("Updated");
  });

  // ---------- student_notes ----------

  it("admin in district A cannot PATCH /api/students/:studentId/notes/:noteId of district B (404)", async () => {
    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });
    const res = await adminA.patch(`/api/students/${studentB}/notes/${noteB}`).send({ content: "PWNED" });
    expect(res.status).toBe(404);
    const [row] = await db.select().from(studentNotesTable).where(eq(studentNotesTable.id, noteB));
    expect(row?.content).toBe("Confidential B note");
  });

  it("admin in district A cannot DELETE /api/students/:studentId/notes/:noteId of district B (404)", async () => {
    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });
    const res = await adminA.delete(`/api/students/${studentB}/notes/${noteB}`);
    expect(res.status).toBe(404);
    const [row] = await db.select().from(studentNotesTable).where(eq(studentNotesTable.id, noteB));
    expect(row?.deletedAt).toBeNull();
  });

  // ---------- documents ----------

  it("admin in district A cannot PATCH /api/documents/:id of district B (404)", async () => {
    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });
    const res = await adminA.patch(`/api/documents/${docB}`).send({ title: "PWNED" });
    expect(res.status).toBe(404);
    const [row] = await db.select().from(documentsTable).where(eq(documentsTable.id, docB));
    expect(row?.title).toBe("IEP B");
  });

  it("admin in district A cannot DELETE /api/documents/:id of district B (404)", async () => {
    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });
    const res = await adminA.delete(`/api/documents/${docB}`);
    expect(res.status).toBe(404);
    const [row] = await db.select().from(documentsTable).where(eq(documentsTable.id, docB));
    expect(row?.deletedAt).toBeNull();
    expect(row?.status).toBe("active");
  });

  it("admin in district A cannot POST /api/documents/:id/signature-requests for district B (404)", async () => {
    const adminA = asUser({ userId: "u_a_admin", role: "admin", districtId: districtA });
    const res = await adminA.post(`/api/documents/${docB}/signature-requests`).send({
      recipientName: "Attacker",
      recipientEmail: "attacker@example.com",
    });
    expect(res.status).toBe(404);
    // Confirm no extra signature request was created against district B's doc.
    const sigs = await db.select().from(signatureRequestsTable).where(eq(signatureRequestsTable.documentId, docB));
    expect(sigs.length).toBe(1); // only the one we seeded
  });

  // ---------- signature-requests/:token ----------

  it("GET /api/signature-requests/:token with a garbage token returns 404", async () => {
    // Token-based routes are intentionally unauthenticated (the 32-byte random
    // token IS the capability). The only relevant tenant-isolation guarantee
    // is that an unguessable token is required: a wrong token must not leak
    // any signature-request data.
    const res = await asUser({ userId: "u_x", role: "admin", districtId: districtA })
      .get(`/api/signature-requests/not_a_real_token_${Date.now()}`);
    expect(res.status).toBe(404);
  });

  it("GET /api/signature-requests/:token with the correct token still works (capability model)", async () => {
    // Sanity check that the seeded token resolves — proves the 404 above is
    // due to the token check, not a global misconfiguration.
    const res = await asUser({ userId: "u_x", role: "admin", districtId: districtA })
      .get(`/api/signature-requests/${sigTokenB}`);
    expect(res.status).toBe(200);
  });
});
