/**
 * Pilot decision routes — exercises the day-60 status endpoint and the
 * outcome submission flow including:
 *   - non-pilot district sees the page closed
 *   - pilot < day 60 has decisionWindowOpen=false / showBanner=false
 *   - pilot >= day 60 has the window open and the banner on
 *   - submission writes a row, audit log entry, and is idempotent (409)
 *   - request_changes / decline require a reason note
 *   - a different district's admin cannot read or submit for this district
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  db,
  pilotBaselineSnapshotsTable,
  districtsTable,
  pilotDecisionsTable,
  subscriptionPlansTable,
  auditLogsTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { app, asUser, createDistrict, createSchool, createStaff, cleanupDistrict } from "./helpers";

async function ensureProfessionalPlan() {
  const [existing] = await db
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.tier, "professional"))
    .limit(1);
  if (existing) return existing;
  const [plan] = await db
    .insert(subscriptionPlansTable)
    .values({
      tier: "professional",
      name: "Professional",
      description: "Mid-tier",
      seatLimit: 50,
      monthlyPriceCents: 1500_00,
      yearlyPriceCents: 15000_00,
      isActive: true,
      sortOrder: 2,
    })
    .returning();
  return plan;
}

async function backdateBaseline(districtId: number, daysAgo: number) {
  const ts = sql.raw(`now() - interval '${daysAgo} days'`);
  await db.execute(
    sql`UPDATE pilot_baseline_snapshots SET captured_at = ${ts} WHERE district_id = ${districtId}`,
  );
}

async function clearDecisionFor(districtId: number) {
  await db.delete(pilotDecisionsTable).where(eq(pilotDecisionsTable.districtId, districtId));
}

describe("pilot decision routes", () => {
  let districtId: number;
  let otherDistrictId: number;
  let createdPlanId: number | null = null;

  beforeAll(async () => {
    const planBefore = await db
      .select({ id: subscriptionPlansTable.id })
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.tier, "professional"))
      .limit(1);
    const plan = await ensureProfessionalPlan();
    if (planBefore.length === 0) createdPlanId = plan.id;

    const d = await createDistrict({ isPilot: true, name: `Test District pilot-${Date.now()}` });
    districtId = d.id;
    const s = await createSchool(districtId);
    await createStaff(s.id, { role: "admin", email: `admin-${Date.now()}@example.test`, status: "active" });

    const other = await createDistrict({ isPilot: true, name: `Test District other-${Date.now()}` });
    otherDistrictId = other.id;
    const os = await createSchool(otherDistrictId);
    await createStaff(os.id, { role: "admin", email: `other-${Date.now()}@example.test`, status: "active" });
  });

  afterAll(async () => {
    await db.delete(pilotDecisionsTable).where(inArray(pilotDecisionsTable.districtId, [districtId, otherDistrictId]));
    await db
      .delete(pilotBaselineSnapshotsTable)
      .where(inArray(pilotBaselineSnapshotsTable.districtId, [districtId, otherDistrictId]));
    await db
      .delete(auditLogsTable)
      .where(eq(auditLogsTable.targetTable, "pilot_decisions"))
      .catch(() => {});
    await cleanupDistrict(districtId);
    await cleanupDistrict(otherDistrictId);
    if (createdPlanId != null) {
      await db.delete(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, createdPlanId));
    }
  });

  it("hides the banner before day 60 and shows it on/after day 60", async () => {
    const admin = asUser({ userId: "u_admin", role: "admin", districtId });

    // First call captures the baseline lazily.
    const r1 = await admin.get("/api/pilot/decision/status").expect(200);
    expect(r1.body.isPilot).toBe(true);
    expect(r1.body.showBanner).toBe(false); // day 0
    expect(r1.body.decisionWindowOpen).toBe(false);

    // Backdate the baseline to 30 days — still before the window.
    await backdateBaseline(districtId, 30);
    const r2 = await admin.get("/api/pilot/decision/status").expect(200);
    expect(r2.body.dayInPilot).toBeGreaterThanOrEqual(30);
    expect(r2.body.decisionWindowOpen).toBe(false);
    expect(r2.body.showBanner).toBe(false);

    // Backdate to 65 days — window open.
    await backdateBaseline(districtId, 65);
    const r3 = await admin.get("/api/pilot/decision/status").expect(200);
    expect(r3.body.dayInPilot).toBeGreaterThanOrEqual(65);
    expect(r3.body.decisionWindowOpen).toBe(true);
    expect(r3.body.showBanner).toBe(true);
    expect(r3.body.contractPreview).not.toBeNull();
    expect(r3.body.contractPreview.tier).toBe("professional");
    expect(r3.body.contractPreview.monthlyPriceCents).toBeGreaterThan(0);
    expect(r3.body.roi).toBeDefined();
    expect(r3.body.roi.baseline).not.toBeNull();
  });

  it("rejects submission before day 60 even via direct API call", async () => {
    await clearDecisionFor(districtId);
    const admin = asUser({ userId: "u_admin", role: "admin", districtId });
    await backdateBaseline(districtId, 10);
    const res = await admin
      .post("/api/pilot/decision")
      .send({ outcome: "renew", surveyResponses: { value: "5" } })
      .expect(409);
    expect(res.body.error).toMatch(/decision window/i);
    // No row was created.
    const rows = await db
      .select()
      .from(pilotDecisionsTable)
      .where(eq(pilotDecisionsTable.districtId, districtId));
    expect(rows.length).toBe(0);
  });

  it("rejects submission without a reason for non-renew outcomes", async () => {
    await clearDecisionFor(districtId);
    const admin = asUser({ userId: "u_admin", role: "admin", districtId });
    await backdateBaseline(districtId, 65);
    const res = await admin
      .post("/api/pilot/decision")
      .send({ outcome: "decline", surveyResponses: { value: "2" } })
      .expect(400);
    expect(res.body.error).toMatch(/reason note/i);
  });

  it("records a renew decision, returns it on subsequent reads, and is idempotent", async () => {
    await clearDecisionFor(districtId);
    const admin = asUser({ userId: "u_admin", role: "admin", districtId });
    await backdateBaseline(districtId, 65);

    const create = await admin
      .post("/api/pilot/decision")
      .send({
        outcome: "renew",
        surveyResponses: { value: "5", friction: "smooth" },
      })
      .expect(201);
    expect(create.body.decision.outcome).toBe("renew");

    // Banner should now be hidden because a decision exists.
    const status = await admin.get("/api/pilot/decision/status").expect(200);
    expect(status.body.showBanner).toBe(false);
    expect(status.body.decision).not.toBeNull();
    expect(status.body.decision.outcome).toBe("renew");

    // Second submission returns 409 with the existing record.
    const dup = await admin
      .post("/api/pilot/decision")
      .send({ outcome: "decline", reasonNote: "changed my mind" })
      .expect(409);
    expect(dup.body.decision.outcome).toBe("renew");

    // Audit log was written.
    const auditRows = await db
      .select()
      .from(auditLogsTable)
      .where(and(eq(auditLogsTable.targetTable, "pilot_decisions"), eq(auditLogsTable.action, "create")));
    // Audit insert is fire-and-forget; allow up to a brief delay
    if (auditRows.length === 0) {
      await new Promise((r) => setTimeout(r, 100));
      const retry = await db
        .select()
        .from(auditLogsTable)
        .where(and(eq(auditLogsTable.targetTable, "pilot_decisions"), eq(auditLogsTable.action, "create")));
      expect(retry.length).toBeGreaterThan(0);
    } else {
      expect(auditRows.length).toBeGreaterThan(0);
    }
  });

  it("blocks submission if the district is not in pilot mode", async () => {
    await clearDecisionFor(districtId);
    await db.update(districtsTable).set({ isPilot: false }).where(eq(districtsTable.id, districtId));
    const admin = asUser({ userId: "u_admin", role: "admin", districtId });
    const res = await admin
      .post("/api/pilot/decision")
      .send({ outcome: "renew" })
      .expect(409);
    expect(res.body.error).toMatch(/not in an active pilot/i);
    // restore for other tests
    await db.update(districtsTable).set({ isPilot: true }).where(eq(districtsTable.id, districtId));
  });

  it("requires admin role for submission", async () => {
    await clearDecisionFor(districtId);
    const provider = asUser({ userId: "u_prov", role: "provider", districtId });
    await provider.post("/api/pilot/decision").send({ outcome: "renew" }).expect(403);
  });

  it("scopes status to caller's district (no cross-tenant read)", async () => {
    await clearDecisionFor(districtId);
    await clearDecisionFor(otherDistrictId);
    const callerForDistrict = asUser({ userId: "u_admin", role: "admin", districtId });
    // Insert decision into otherDistrictId directly:
    await db.insert(pilotDecisionsTable).values({
      districtId: otherDistrictId,
      outcome: "decline",
      reasonNote: "test",
      decidedByUserId: "u_other",
      decidedByName: "Other Admin",
      surveyResponses: {},
    });
    const res = await callerForDistrict.get("/api/pilot/decision/status").expect(200);
    // Caller's district has no decision, so .decision must be null.
    expect(res.body.decision).toBeNull();
  });
});
