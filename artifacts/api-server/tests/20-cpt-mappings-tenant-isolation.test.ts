/**
 * Tenant isolation regression suite for /api/medicaid/cpt-mappings.
 *
 * District scoping was added to cpt_code_mappings (task #205). These tests
 * lock that behavior in so a future refactor cannot silently re-introduce
 * the cross-district read/write/delete bug:
 *
 *   - GET    /api/medicaid/cpt-mappings              -> filters by caller's district
 *   - PUT    /api/medicaid/cpt-mappings/:id          -> 404 across districts
 *   - DELETE /api/medicaid/cpt-mappings/:id          -> 404 across districts
 *   - POST   /api/medicaid/cpt-mappings              -> always stamps caller's
 *                                                      districtId, ignoring any
 *                                                      districtId from the body
 *
 * Each cross-tenant attack is paired with a positive same-tenant control so
 * we don't drift into over-blocking legitimate billing-coordinator traffic.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  asUser,
  createDistrict,
  createSchool,
  createServiceType,
  createCptMapping,
  cleanupDistrict,
  cleanupServiceType,
  seedLegalAcceptances,
  cleanupLegalAcceptances,
} from "./helpers";
import { db, cptCodeMappingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

describe("medicaid cpt-mappings tenant isolation", () => {
  let districtA: number;
  let districtB: number;
  let serviceTypeId: number;

  let mappingA: number;
  let mappingB: number;
  const cptCodeB = "B0001";
  const rateB = "42.50";

  beforeAll(async () => {
    await seedLegalAcceptances(["u_a_billing", "u_b_billing"]);

    // Use the helper's default unique "Test District ..." name so leftover
    // rows from an aborted run are picked up by the global pre-suite sweep
    // in tests/setup.ts (which LIKE-matches "Test District %").
    const dA = await createDistrict();
    const dB = await createDistrict();
    districtA = dA.id;
    districtB = dB.id;

    // Schools are required so cleanupDistrict's FK walk has something to
    // anchor to even though we don't otherwise use them here.
    await createSchool(districtA);
    await createSchool(districtB);

    const st = await createServiceType({ name: `CPT Test Service ${Date.now()}` });
    serviceTypeId = st.id;

    const mA = await createCptMapping(districtA, serviceTypeId, {
      cptCode: "A0001",
      ratePerUnit: "10.00",
      description: "District A mapping",
    });
    mappingA = mA.id;

    const mB = await createCptMapping(districtB, serviceTypeId, {
      cptCode: cptCodeB,
      ratePerUnit: rateB,
      description: "District B mapping",
    });
    mappingB = mB.id;
  });

  afterAll(async () => {
    await cleanupDistrict(districtA);
    await cleanupDistrict(districtB);
    await cleanupServiceType(serviceTypeId);
    await cleanupLegalAcceptances(["u_a_billing", "u_b_billing"]);
  });

  // ---------- GET ----------

  it("GET /api/medicaid/cpt-mappings only returns the caller's district mappings", async () => {
    const adminA = asUser({ userId: "u_a_billing", role: "coordinator", districtId: districtA });
    const res = await adminA.get("/api/medicaid/cpt-mappings");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map((m: { id: number }) => m.id);
    expect(ids).toContain(mappingA);
    expect(ids).not.toContain(mappingB);
    for (const m of res.body as Array<{ districtId: number }>) {
      expect(m.districtId).toBe(districtA);
    }
  });

  it("GET /api/medicaid/cpt-mappings as district B sees B's mapping but not A's", async () => {
    const adminB = asUser({ userId: "u_b_billing", role: "coordinator", districtId: districtB });
    const res = await adminB.get("/api/medicaid/cpt-mappings");
    expect(res.status).toBe(200);
    const ids = res.body.map((m: { id: number }) => m.id);
    expect(ids).toContain(mappingB);
    expect(ids).not.toContain(mappingA);
  });

  // ---------- PUT ----------

  it("PUT /api/medicaid/cpt-mappings/:id returns 404 across districts and does not mutate the row", async () => {
    const adminA = asUser({ userId: "u_a_billing", role: "coordinator", districtId: districtA });
    const res = await adminA
      .put(`/api/medicaid/cpt-mappings/${mappingB}`)
      .send({ cptCode: "PWNED", ratePerUnit: "999.00" });
    expect(res.status).toBe(404);

    const [row] = await db
      .select()
      .from(cptCodeMappingsTable)
      .where(eq(cptCodeMappingsTable.id, mappingB));
    expect(row?.cptCode).toBe(cptCodeB);
    expect(row?.ratePerUnit).toBe(rateB);
    expect(row?.districtId).toBe(districtB);
  });

  it("PUT /api/medicaid/cpt-mappings/:id succeeds for the caller's own mapping (200)", async () => {
    const adminA = asUser({ userId: "u_a_billing", role: "coordinator", districtId: districtA });
    const res = await adminA
      .put(`/api/medicaid/cpt-mappings/${mappingA}`)
      .send({ description: "Updated by A" });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe("Updated by A");
    expect(res.body.districtId).toBe(districtA);
  });

  // ---------- DELETE ----------

  it("DELETE /api/medicaid/cpt-mappings/:id returns 404 across districts and does not delete the row", async () => {
    const adminA = asUser({ userId: "u_a_billing", role: "coordinator", districtId: districtA });
    const res = await adminA.delete(`/api/medicaid/cpt-mappings/${mappingB}`);
    expect(res.status).toBe(404);

    const [row] = await db
      .select()
      .from(cptCodeMappingsTable)
      .where(eq(cptCodeMappingsTable.id, mappingB));
    expect(row).toBeDefined();
    expect(row?.districtId).toBe(districtB);
  });

  // ---------- POST ----------

  it("POST /api/medicaid/cpt-mappings always stamps the caller's districtId, ignoring the request body", async () => {
    const adminA = asUser({ userId: "u_a_billing", role: "coordinator", districtId: districtA });
    const res = await adminA
      .post("/api/medicaid/cpt-mappings")
      .send({
        // Attempt to spoof the target district by stuffing districtId into the
        // body. The handler must ignore this and use the caller's enforced
        // district context instead.
        districtId: districtB,
        serviceTypeId,
        cptCode: `POST_${Date.now()}`,
        ratePerUnit: "15.00",
        description: "Should land in District A",
      });
    expect(res.status).toBe(201);
    expect(res.body.districtId).toBe(districtA);
    expect(res.body.districtId).not.toBe(districtB);

    // Verify the persisted row matches what the API returned.
    const [row] = await db
      .select()
      .from(cptCodeMappingsTable)
      .where(eq(cptCodeMappingsTable.id, res.body.id));
    expect(row?.districtId).toBe(districtA);

    // Cleanup the row we just created so afterAll's cleanupDistrict doesn't
    // need to know about it (cleanupDistrict already deletes by districtId,
    // so this is belt-and-suspenders for clarity).
    await db.delete(cptCodeMappingsTable).where(eq(cptCodeMappingsTable.id, res.body.id));
  });
});
