/**
 * PRE-4 — Smoke coverage for the Demo Control Center readiness/data-health
 * endpoints after the staff_school_assignments → staff_assignments and
 * service_sessions → session_logs renames.
 *
 * Pre-fix the routes 500'd because the SQL referenced tables that no longer
 * exist in the Drizzle schema. This suite asserts both endpoints return 200
 * for a valid demo district and surface the expected check shape so a
 * future schema drift breaks loudly here rather than silently in the demo UI.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import {
  createDistrict, createSchool, createStudent, cleanupDistrict,
  seedLegalAcceptances, cleanupLegalAcceptances,
} from "./helpers";

const USER_ID = "u_pre4_demo_admin";

describe("PRE-4: Demo Control readiness/data-health endpoints", () => {
  let demoDistrictId: number;

  beforeAll(async () => {
    await seedLegalAcceptances([USER_ID]);
    const d = await createDistrict({ name: "Sample-Pre4-Demo", isDemo: true });
    demoDistrictId = d.id;
    const s = await createSchool(demoDistrictId);
    // One student so the data-health subqueries don't degenerate.
    await createStudent(s.id, { firstName: "Demo", lastName: "Student", grade: "5" });
  });

  afterAll(async () => {
    await cleanupDistrict(demoDistrictId);
    await cleanupLegalAcceptances([USER_ID]);
  });

  it("GET /api/demo-control/readiness returns 200 with checks[]", async () => {
    const res = await request(app)
      .get(`/api/demo-control/readiness?districtId=${demoDistrictId}`)
      .set("x-test-user-id", USER_ID)
      .set("x-test-role", "admin")
      .set("x-test-platform-admin", "true");
    expect(
      res.status,
      `expected 200, got ${res.status} body=${JSON.stringify(res.body)}`,
    ).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.checks)).toBe(true);
    expect(res.body.checks.length).toBeGreaterThan(0);
    // Stale-table-ref bug would have surfaced as "Failed to compute readiness".
    expect(res.body.error).toBeUndefined();
  });

  it("GET /api/demo-control/data-health returns 200 with checks[]", async () => {
    const res = await request(app)
      .get(`/api/demo-control/data-health?districtId=${demoDistrictId}`)
      .set("x-test-user-id", USER_ID)
      .set("x-test-role", "admin")
      .set("x-test-platform-admin", "true");
    expect(
      res.status,
      `expected 200, got ${res.status} body=${JSON.stringify(res.body)}`,
    ).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.checks)).toBe(true);
    expect(res.body.checks.length).toBeGreaterThan(0);
    expect(res.body.error).toBeUndefined();
  });
});
