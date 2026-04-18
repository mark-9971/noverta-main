/**
 * Authz regression: only privileged staff (admin/coordinator) may trigger
 * compliance-breach scans, and district-scoped callers may only scan their
 * OWN district. Cross-tenant side effects are forbidden.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, alertsTable, restraintIncidentsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  asUser,
  createDistrict,
  createSchool,
  createStaff,
  createStudent,
  cleanupDistrict,
} from "./helpers";

describe("compliance breach checks — authz", () => {
  let districtAId: number;
  let districtBId: number;
  let studentAId: number;
  let studentBId: number;
  const originalKey = process.env.RESEND_API_KEY;

  beforeAll(async () => {
    delete process.env.RESEND_API_KEY;

    const da = await createDistrict();
    districtAId = da.id;
    const sa = await createSchool(districtAId);
    await createStaff(sa.id, { role: "admin", status: "active", email: `adminA_${Date.now()}@example.com` });
    const studentA = await createStudent(sa.id);
    studentAId = studentA.id;
    const today = new Date().toISOString().slice(0, 10);
    const tenAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await db.insert(restraintIncidentsTable).values([
      { studentId: studentAId, incidentDate: tenAgo, incidentTime: "10:00", incidentType: "physical", restraintType: "physical_hold", behaviorDescription: "x", parentNotified: false },
      { studentId: studentAId, incidentDate: today, incidentTime: "10:00", incidentType: "physical", restraintType: "physical_hold", behaviorDescription: "x", parentNotified: false },
    ]);

    const dbDist = await createDistrict();
    districtBId = dbDist.id;
    const sb = await createSchool(districtBId);
    await createStaff(sb.id, { role: "admin", status: "active", email: `adminB_${Date.now()}@example.com` });
    const studentB = await createStudent(sb.id);
    studentBId = studentB.id;
    await db.insert(restraintIncidentsTable).values([
      { studentId: studentBId, incidentDate: tenAgo, incidentTime: "10:00", incidentType: "physical", restraintType: "physical_hold", behaviorDescription: "x", parentNotified: false },
      { studentId: studentBId, incidentDate: today, incidentTime: "10:00", incidentType: "physical", restraintType: "physical_hold", behaviorDescription: "x", parentNotified: false },
    ]);
  });

  afterAll(async () => {
    if (originalKey) process.env.RESEND_API_KEY = originalKey;
    await db.delete(alertsTable).where(inArray(alertsTable.studentId, [studentAId, studentBId]));
    await db.delete(restraintIncidentsTable).where(inArray(restraintIncidentsTable.studentId, [studentAId, studentBId]));
    await cleanupDistrict(districtAId);
    await cleanupDistrict(districtBId);
  });

  it("rejects non-privileged callers (case_manager) with 403", async () => {
    const cm = asUser({ userId: "u_cm", role: "case_manager", districtId: districtAId });
    const res = await cm.post("/api/alerts/run-compliance-breach-checks").send({});
    expect(res.status).toBe(403);

    // No alert was created for either district by the rejected request.
    const created = await db
      .select()
      .from(alertsTable)
      .where(and(
        inArray(alertsTable.studentId, [studentAId, studentBId]),
        eq(alertsTable.type, "restraint_30day_noncompliant"),
      ));
    expect(created.length).toBe(0);
  });

  it("scopes a district admin's scan to their own district only", async () => {
    const adminA = asUser({ userId: "u_adminA", role: "admin", districtId: districtAId });
    const res = await adminA.post("/api/alerts/run-compliance-breach-checks").send({});
    expect(res.status).toBe(200);
    expect(res.body.districtsScanned).toBe(1);

    const aAlerts = await db
      .select()
      .from(alertsTable)
      .where(and(
        eq(alertsTable.studentId, studentAId),
        eq(alertsTable.type, "restraint_30day_noncompliant"),
      ));
    expect(aAlerts.length).toBeGreaterThanOrEqual(1);

    const bAlerts = await db
      .select()
      .from(alertsTable)
      .where(and(
        eq(alertsTable.studentId, studentBId),
        eq(alertsTable.type, "restraint_30day_noncompliant"),
      ));
    expect(bAlerts.length).toBe(0);
  });
});
