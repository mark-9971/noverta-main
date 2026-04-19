import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import {
  districtsTable, schoolsTable, studentsTable, staffTable,
  alertsTable, sessionLogsTable, serviceRequirementsTable,
  districtSubscriptionsTable
} from "@workspace/db";
import { eq, and, count, sql, inArray } from "drizzle-orm";
import { getPublicMeta } from "../lib/clerkClaims";
import { resolveDistrictIdForCaller } from "../lib/resolveDistrictForCaller";
import { computeAllActiveMinuteProgress } from "../lib/minuteCalc";
import { requireTierAccess } from "../middlewares/tierGate";
import { requirePlatformAdmin, getEnforcedDistrictId, requireRoles, type AuthedRequest } from "../middlewares/auth";
import { buildWeeklyRiskDigestPreviewForDistrict } from "../lib/costAvoidanceWeeklyDigest";
import { buildPilotScorecardPreviewForDistrict } from "../lib/pilotScorecard";
import { sendAdminEmail } from "../lib/email";

const router: IRouter = Router();

router.get("/districts", async (req, res): Promise<void> => {
  // Tenant-scope: non-platform users only see their own district. Platform admins
  // and unauthenticated dev fallback see all districts.
  const meta = getPublicMeta(req);
  const baseSelect = db
    .select({
      id: districtsTable.id,
      name: districtsTable.name,
      state: districtsTable.state,
      region: districtsTable.region,
      tier: districtsTable.tier,
      tierOverride: districtsTable.tierOverride,
      isDemo: districtsTable.isDemo,
      createdAt: districtsTable.createdAt,
    })
    .from(districtsTable);

  const districts = (!meta.platformAdmin && meta.districtId != null)
    ? await baseSelect.where(eq(districtsTable.id, meta.districtId)).orderBy(districtsTable.name)
    : await baseSelect.orderBy(districtsTable.name);

  const schoolCounts = await db
    .select({
      districtId: schoolsTable.districtId,
      count: count(),
    })
    .from(schoolsTable)
    .where(sql`${schoolsTable.districtId} IS NOT NULL`)
    .groupBy(schoolsTable.districtId);

  const schoolCountMap = new Map<number, number>();
  for (const sc of schoolCounts) {
    if (sc.districtId != null) schoolCountMap.set(sc.districtId, sc.count);
  }

  const districtIds = districts.map(d => d.id);
  const thresholds = districtIds.length > 0
    ? await db.select({ id: districtsTable.id, complianceMinuteThreshold: districtsTable.complianceMinuteThreshold }).from(districtsTable).where(inArray(districtsTable.id, districtIds))
    : [];
  const thresholdMap = new Map(thresholds.map(t => [t.id, t.complianceMinuteThreshold]));

  res.json(districts.map(d => ({
    ...d,
    complianceMinuteThreshold: thresholdMap.get(d.id) ?? 85,
    schoolCount: schoolCountMap.get(d.id) ?? 0,
    createdAt: d.createdAt.toISOString(),
  })));
});

router.post("/districts", requirePlatformAdmin, async (req, res): Promise<void> => {
  const { name, state, region } = req.body;
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [district] = await db.insert(districtsTable).values({
    name,
    state: state ?? "MA",
    region: region ?? null,
  }).returning();

  await db.insert(districtSubscriptionsTable).values({
    districtId: district.id,
    planTier: "trial",
    seatLimit: 10,
    billingCycle: "monthly",
    status: "trialing",
  });

  res.status(201).json({ ...district, createdAt: district.createdAt.toISOString() });
});

router.get("/districts/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Tenant scope: non-platform users may only read their own district.
  const enforcedDid = getEnforcedDistrictId(req as unknown as AuthedRequest);
  const meta = getPublicMeta(req);
  if (!meta.platformAdmin && enforcedDid != null && enforcedDid !== id) {
    res.status(403).json({ error: "You don't have access to this district" });
    return;
  }

  const [district] = await db.select().from(districtsTable).where(eq(districtsTable.id, id));
  if (!district) { res.status(404).json({ error: "District not found" }); return; }

  const schools = await db.select().from(schoolsTable).where(eq(schoolsTable.districtId, id)).orderBy(schoolsTable.name);

  res.json({
    ...district,
    createdAt: district.createdAt.toISOString(),
    updatedAt: district.updatedAt.toISOString(),
    schools: schools.map(s => ({ ...s, createdAt: s.createdAt.toISOString() })),
  });
});

router.patch("/districts/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const meta = getPublicMeta(req);
  // Non-platform users may only PATCH their own district. Tier changes are further
  // gated below to platform admins only.
  const enforcedDid = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (!meta.platformAdmin && enforcedDid != null && enforcedDid !== id) {
    res.status(403).json({ error: "You don't have access to this district" });
    return;
  }
  const updateData: Partial<typeof districtsTable.$inferInsert> = {};
  if (req.body.name != null) updateData.name = req.body.name;
  if (req.body.state !== undefined) updateData.state = req.body.state;
  if (req.body.region !== undefined) updateData.region = req.body.region;

  if (req.body.complianceMinuteThreshold !== undefined) {
    const t = Number(req.body.complianceMinuteThreshold);
    if (!Number.isInteger(t) || t < 1 || t > 100) {
      res.status(400).json({ error: "complianceMinuteThreshold must be an integer between 1 and 100" });
      return;
    }
    updateData.complianceMinuteThreshold = t;
  }

  if (req.body.alertDigestMode !== undefined) {
    if (typeof req.body.alertDigestMode !== "boolean") {
      res.status(400).json({ error: "alertDigestMode must be a boolean" });
      return;
    }
    updateData.alertDigestMode = req.body.alertDigestMode;
  }

  if (req.body.spikeAlertEnabled !== undefined) {
    if (typeof req.body.spikeAlertEnabled !== "boolean") {
      res.status(400).json({ error: "spikeAlertEnabled must be a boolean" });
      return;
    }
    updateData.spikeAlertEnabled = req.body.spikeAlertEnabled;
  }

  if (req.body.spikeAlertThreshold !== undefined) {
    const t = Number(req.body.spikeAlertThreshold);
    if (!Number.isInteger(t) || t < 1 || t > 100) {
      res.status(400).json({ error: "spikeAlertThreshold must be an integer between 1 and 100" });
      return;
    }
    updateData.spikeAlertThreshold = t;
  }


  if (req.body.tier !== undefined || req.body.tierOverride !== undefined) {
    if (!meta.platformAdmin) {
      res.status(403).json({ error: "Only platform administrators can change subscription tier" });
      return;
    }
    const VALID_TIERS = ["essentials", "professional", "enterprise"] as const;
    if (req.body.tier !== undefined) {
      if (!VALID_TIERS.includes(req.body.tier)) {
        res.status(400).json({ error: `Invalid tier value. Must be one of: ${VALID_TIERS.join(", ")}` });
        return;
      }
      updateData.tier = req.body.tier;
    }
    if (req.body.tierOverride !== undefined) {
      if (req.body.tierOverride !== null && !VALID_TIERS.includes(req.body.tierOverride)) {
        res.status(400).json({ error: `Invalid tierOverride value. Must be null or one of: ${VALID_TIERS.join(", ")}` });
        return;
      }
      updateData.tierOverride = req.body.tierOverride;
    }
  }

  const [district] = await db.update(districtsTable).set(updateData).where(eq(districtsTable.id, id)).returning();
  if (!district) { res.status(404).json({ error: "District not found" }); return; }
  res.json({ ...district, createdAt: district.createdAt.toISOString(), updatedAt: district.updatedAt.toISOString() });
});

router.delete("/districts/:id", requirePlatformAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const linkedSchools = await db.select({ id: schoolsTable.id }).from(schoolsTable).where(eq(schoolsTable.districtId, id));
  if (linkedSchools.length > 0) {
    res.status(409).json({ error: `Cannot delete district: ${linkedSchools.length} school(s) are still linked. Reassign them first.` });
    return;
  }

  const [deleted] = await db.delete(districtsTable).where(eq(districtsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "District not found" }); return; }
  res.json({ success: true });
});

router.get("/district-default-rate", async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }
  const [district] = await db.select({ defaultHourlyRate: districtsTable.defaultHourlyRate })
    .from(districtsTable)
    .where(eq(districtsTable.id, districtId));
  if (!district) { res.status(404).json({ error: "District not found" }); return; }
  res.json({ defaultHourlyRate: district.defaultHourlyRate ?? null });
});

router.patch("/district-default-rate", requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }
  const { defaultHourlyRate } = req.body;
  if (defaultHourlyRate === null || defaultHourlyRate === undefined) {
    await db.update(districtsTable)
      .set({ defaultHourlyRate: null })
      .where(eq(districtsTable.id, districtId));
    res.json({ defaultHourlyRate: null });
    return;
  }
  const r = Number(defaultHourlyRate);
  if (!Number.isFinite(r) || r <= 0) {
    res.status(400).json({ error: "defaultHourlyRate must be a positive number" });
    return;
  }
  const [updated] = await db.update(districtsTable)
    .set({ defaultHourlyRate: String(r) })
    .where(eq(districtsTable.id, districtId))
    .returning({ defaultHourlyRate: districtsTable.defaultHourlyRate });
  res.json({ defaultHourlyRate: updated?.defaultHourlyRate ?? null });
});

router.get("/district-tier", async (req, res): Promise<void> => {
  const meta = getPublicMeta(req);

  let districtId: number | null = null;

  if (meta.platformAdmin) {
    const rawDistrictId = req.query.districtId;
    if (rawDistrictId != null && rawDistrictId !== "") {
      districtId = Number(rawDistrictId);
      if (isNaN(districtId)) { res.status(400).json({ error: "Invalid districtId" }); return; }
    }
  } else {
    // Non-platform-admin: use the shared resolver (Clerk meta → staff join,
    // no implicit "only district" fallback). An unscoped caller now gets the
    // explicit "unconfigured" tier shape rather than borrowing the lone
    // tenant's tier.
    districtId = await resolveDistrictIdForCaller(req);
  }

  if (!districtId) {
    res.json({ tier: "essentials", tierOverride: null, effectiveTier: "essentials", mode: "unconfigured", addOns: [] });
    return;
  }

  const [district] = await db
    .select({
      tier: districtsTable.tier,
      tierOverride: districtsTable.tierOverride,
      isDemo: districtsTable.isDemo,
      isPilot: districtsTable.isPilot,
    })
    .from(districtsTable)
    .where(eq(districtsTable.id, districtId))
    .limit(1);

  if (!district) {
    res.json({ tier: "essentials", tierOverride: null, effectiveTier: "essentials", mode: "unconfigured", addOns: [] });
    return;
  }

  const [sub] = await db
    .select({ addOns: districtSubscriptionsTable.addOns })
    .from(districtSubscriptionsTable)
    .where(eq(districtSubscriptionsTable.districtId, districtId))
    .limit(1);

  // Demo and pilot districts get full feature access regardless of base tier.
  const isFreeTrack = district.isDemo || district.isPilot;
  const baseEffective = district.tierOverride || district.tier || "essentials";
  const effectiveTier = isFreeTrack ? "enterprise" : baseEffective;
  const mode = district.isDemo ? "demo" : district.isPilot ? "pilot" : "paid";

  res.json({
    tier: district.tier,
    tierOverride: district.tierOverride,
    effectiveTier,
    mode,
    addOns: sub?.addOns ?? [],
  });
});

router.get("/district-overview", requireTierAccess("district.overview"), async (req, res): Promise<void> => {
  const rawDistrictId = req.query.districtId;
  let districtId: number | null = null;
  if (rawDistrictId != null && rawDistrictId !== "") {
    districtId = Number(rawDistrictId);
    if (isNaN(districtId)) { res.status(400).json({ error: "Invalid districtId" }); return; }
  }

  const schoolConditions = districtId ? eq(schoolsTable.districtId, districtId) : undefined;
  const schools = await db.select().from(schoolsTable).where(schoolConditions).orderBy(schoolsTable.name);
  const schoolIds = schools.map(s => s.id);

  if (schoolIds.length === 0) {
    res.json({ schools: [], totalStudents: 0, totalStaff: 0, complianceSummary: { onTrack: 0, atRisk: 0, outOfCompliance: 0, total: 0 }, alertsSummary: { total: 0, critical: 0 } });
    return;
  }

  const [studentCounts, staffCounts, alertsBySchool] = await Promise.all([
    db.select({ schoolId: studentsTable.schoolId, count: count() })
      .from(studentsTable)
      .where(and(eq(studentsTable.status, "active"), inArray(studentsTable.schoolId, schoolIds)))
      .groupBy(studentsTable.schoolId),
    db.select({ schoolId: staffTable.schoolId, count: count() })
      .from(staffTable)
      .where(and(eq(staffTable.status, "active"), inArray(staffTable.schoolId, schoolIds)))
      .groupBy(staffTable.schoolId),
    db.select({
      schoolId: studentsTable.schoolId,
      total: count(),
      critical: sql<number>`count(*) filter (where ${alertsTable.severity} = 'critical')`,
    }).from(alertsTable)
      .innerJoin(studentsTable, eq(studentsTable.id, alertsTable.studentId))
      .where(and(eq(alertsTable.resolved, false), inArray(studentsTable.schoolId, schoolIds)))
      .groupBy(studentsTable.schoolId),
  ]);

  const studentCountMap = new Map<number, number>();
  for (const sc of studentCounts) { if (sc.schoolId != null) studentCountMap.set(sc.schoolId, sc.count); }
  const staffCountMap = new Map<number, number>();
  for (const sc of staffCounts) { if (sc.schoolId != null) staffCountMap.set(sc.schoolId, sc.count); }
  const alertCountMap = new Map<number, { total: number; critical: number }>();
  for (const ac of alertsBySchool) { if (ac.schoolId != null) alertCountMap.set(ac.schoolId, { total: ac.total, critical: Number(ac.critical) }); }
  const totalAlerts = alertsBySchool.reduce((sum, a) => sum + a.total, 0);
  const totalCritical = alertsBySchool.reduce((sum, a) => sum + Number(a.critical), 0);

  const allProgress = await computeAllActiveMinuteProgress();
  const studentSchoolMap = new Map<number, number>();
  const allStudents = await db.select({ id: studentsTable.id, schoolId: studentsTable.schoolId })
    .from(studentsTable)
    .where(inArray(studentsTable.schoolId, schoolIds));
  for (const s of allStudents) { if (s.schoolId != null) studentSchoolMap.set(s.id, s.schoolId); }

  const schoolCompliance = new Map<number, { onTrack: number; atRisk: number; outOfCompliance: number; total: number }>();
  for (const sid of schoolIds) {
    schoolCompliance.set(sid, { onTrack: 0, atRisk: 0, outOfCompliance: 0, total: 0 });
  }

  const studentRisk = new Map<number, string>();
  for (const p of allProgress) {
    const current = studentRisk.get(p.studentId);
    const priority: Record<string, number> = { out_of_compliance: 4, at_risk: 3, slightly_behind: 2, on_track: 1, completed: 0 };
    if (!current || (priority[p.riskStatus] ?? 0) > (priority[current] ?? 0)) {
      studentRisk.set(p.studentId, p.riskStatus);
    }
  }

  let totalOnTrack = 0, totalAtRisk = 0, totalOoc = 0, totalCompliance = 0;
  for (const [studentId, risk] of studentRisk.entries()) {
    const sid = studentSchoolMap.get(studentId);
    if (sid == null || !schoolCompliance.has(sid)) continue;
    const sc = schoolCompliance.get(sid)!;
    sc.total++;
    totalCompliance++;
    if (risk === "on_track" || risk === "completed") { sc.onTrack++; totalOnTrack++; }
    else if (risk === "at_risk" || risk === "slightly_behind") { sc.atRisk++; totalAtRisk++; }
    else if (risk === "out_of_compliance") { sc.outOfCompliance++; totalOoc++; }
  }

  const schoolData = schools.map(s => ({
    id: s.id,
    name: s.name,
    district: s.district,
    districtId: s.districtId,
    studentCount: studentCountMap.get(s.id) ?? 0,
    staffCount: staffCountMap.get(s.id) ?? 0,
    compliance: schoolCompliance.get(s.id) ?? { onTrack: 0, atRisk: 0, outOfCompliance: 0, total: 0 },
    alerts: alertCountMap.get(s.id) ?? { total: 0, critical: 0 },
  }));

  const totalStudents = [...studentCountMap.values()].reduce((a, b) => a + b, 0);
  const totalStaff = [...staffCountMap.values()].reduce((a, b) => a + b, 0);

  res.json({
    schools: schoolData,
    totalStudents,
    totalStaff,
    complianceSummary: { onTrack: totalOnTrack, atRisk: totalAtRisk, outOfCompliance: totalOoc, total: totalCompliance },
    alertsSummary: { total: totalAlerts, critical: totalCritical },
  });
});

/**
 * GET /districts/:id/notification-preferences
 * Returns the notification preferences for a district (admin only).
 */
router.get("/districts/:id/notification-preferences", requireRoles("admin"), async (req, res): Promise<void> => {
  const districtId = parseInt(req.params.id as string, 10);
  if (isNaN(districtId)) { res.status(400).json({ error: "Invalid district id" }); return; }

  const enforcedId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (enforcedId !== null && enforcedId !== districtId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  try {
    const result = await db.execute(
      sql`SELECT weekly_risk_email_enabled, pilot_scorecard_email_enabled, is_pilot
            FROM districts WHERE id = ${districtId} LIMIT 1`,
    );
    const row = result.rows[0] as {
      weekly_risk_email_enabled: boolean;
      pilot_scorecard_email_enabled: boolean | null;
      is_pilot: boolean | null;
    } | undefined;
    if (!row) { res.status(404).json({ error: "District not found" }); return; }
    res.json({
      weeklyRiskEmailEnabled: row.weekly_risk_email_enabled ?? true,
      pilotScorecardEmailEnabled: row.pilot_scorecard_email_enabled ?? true,
      isPilot: row.is_pilot ?? false,
    });
  } catch (err) {
    console.error("[districts] GET notification-preferences error:", err);
    res.status(500).json({ error: "Failed to fetch notification preferences" });
  }
});

/**
 * PATCH /districts/:id/notification-preferences
 * Toggle the weekly risk email digest for a district.
 * Body: { weeklyRiskEmailEnabled: boolean }
 */
router.patch("/districts/:id/notification-preferences", requireRoles("admin"), async (req, res): Promise<void> => {
  const districtId = parseInt(req.params.id as string, 10);
  if (isNaN(districtId)) { res.status(400).json({ error: "Invalid district id" }); return; }

  const enforcedId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (enforcedId !== null && enforcedId !== districtId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const body = (req.body ?? {}) as {
    weeklyRiskEmailEnabled?: unknown;
    pilotScorecardEmailEnabled?: unknown;
  };

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (body.weeklyRiskEmailEnabled !== undefined) {
    if (typeof body.weeklyRiskEmailEnabled !== "boolean") {
      res.status(400).json({ error: "weeklyRiskEmailEnabled must be a boolean" }); return;
    }
    sets.push(`weekly_risk_email_enabled = $${i++}`);
    values.push(body.weeklyRiskEmailEnabled);
  }
  if (body.pilotScorecardEmailEnabled !== undefined) {
    if (typeof body.pilotScorecardEmailEnabled !== "boolean") {
      res.status(400).json({ error: "pilotScorecardEmailEnabled must be a boolean" }); return;
    }
    sets.push(`pilot_scorecard_email_enabled = $${i++}`);
    values.push(body.pilotScorecardEmailEnabled);
  }

  if (sets.length === 0) {
    res.status(400).json({ error: "No supported preference provided" }); return;
  }

  values.push(districtId);

  try {
    const updated = await pool.query<{ id: number }>(
      `UPDATE districts SET ${sets.join(", ")} WHERE id = $${i} RETURNING id`,
      values,
    );
    if (updated.rowCount === 0) { res.status(404).json({ error: "District not found" }); return; }
    res.json({ success: true, ...body });
  } catch (err) {
    console.error("[districts] PATCH notification-preferences error:", err);
    res.status(500).json({ error: "Failed to update notification preferences" });
  }
});

/**
 * GET /districts/:id/weekly-risk-digest-preview
 * Returns the rendered weekly risk digest email so admins can see what staff will receive.
 * Default response is HTML (suitable for iframe). Pass ?format=json for {subject, html, text}.
 */
router.get("/districts/:id/weekly-risk-digest-preview", requireRoles("admin"), async (req, res): Promise<void> => {
  const districtId = parseInt(req.params.id as string, 10);
  if (isNaN(districtId)) { res.status(400).json({ error: "Invalid district id" }); return; }

  const enforcedId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (enforcedId !== null && enforcedId !== districtId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  try {
    const result = await buildWeeklyRiskDigestPreviewForDistrict(districtId);
    if (!result.ok) {
      res.status(404).json({ error: result.error });
      return;
    }
    const format = (req.query.format as string | undefined)?.toLowerCase();
    if (format === "json") {
      res.json({
        subject: result.subject,
        html: result.html,
        text: result.text,
        sample: result.sample,
      });
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.send(result.html);
  } catch (err) {
    console.error("[districts] GET weekly-risk-digest-preview error:", err);
    res.status(500).json({ error: "Failed to build digest preview" });
  }
});

/**
 * POST /districts/:id/weekly-risk-digest-preview/send-test
 * Sends a one-off copy of the current weekly risk digest to the calling admin's email.
 * Does not affect the regular weekly send schedule or idempotency tracking.
 */
router.post("/districts/:id/weekly-risk-digest-preview/send-test", requireRoles("admin"), async (req, res): Promise<void> => {
  const districtId = parseInt(req.params.id as string, 10);
  if (isNaN(districtId)) { res.status(400).json({ error: "Invalid district id" }); return; }

  const enforcedId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (enforcedId !== null && enforcedId !== districtId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const meta = getPublicMeta(req);
  if (!meta.staffId) {
    res.status(400).json({ error: "Caller has no linked staff record; cannot determine email." });
    return;
  }

  try {
    const [staffRow] = await db
      .select({ email: staffTable.email })
      .from(staffTable)
      .where(eq(staffTable.id, meta.staffId))
      .limit(1);

    const recipient = staffRow?.email;
    if (!recipient) {
      res.status(400).json({ error: "No email address on file for the calling admin." });
      return;
    }

    const preview = await buildWeeklyRiskDigestPreviewForDistrict(districtId);
    if (!preview.ok) {
      res.status(404).json({ error: preview.error });
      return;
    }

    const testSubject = `[TEST] ${preview.subject}`;
    const result = await sendAdminEmail({
      to: [recipient],
      subject: testSubject,
      html: preview.html,
      text: preview.text,
      notificationType: "WeeklyRiskDigestTest",
    });

    if (result.notConfigured) {
      res.status(200).json({
        sent: false,
        notConfigured: true,
        recipient,
        message: "Email provider not configured — would have sent test email.",
      });
      return;
    }
    if (!result.success) {
      res.status(502).json({ sent: false, recipient, error: result.error ?? "send failed" });
      return;
    }
    res.json({ sent: true, recipient, sample: preview.sample });
  } catch (err) {
    console.error("[districts] POST weekly-risk-digest-preview/send-test error:", err);
    res.status(500).json({ error: "Failed to send test digest email" });
  }
});

/**
 * GET /districts/:id/pilot-scorecard-preview
 * Returns the rendered weekly Pilot Success Scorecard email so admins can see
 * what will be sent on Monday. Default response is HTML; pass ?format=json
 * for {subject, html, text, data}.
 */
router.get("/districts/:id/pilot-scorecard-preview", requireRoles("admin"), async (req, res): Promise<void> => {
  const districtId = parseInt(req.params.id as string, 10);
  if (isNaN(districtId)) { res.status(400).json({ error: "Invalid district id" }); return; }

  const enforcedId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (enforcedId !== null && enforcedId !== districtId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  try {
    const result = await buildPilotScorecardPreviewForDistrict(districtId);
    if (!result.ok) { res.status(404).json({ error: result.error }); return; }
    const format = (req.query.format as string | undefined)?.toLowerCase();
    if (format === "json") {
      res.json({ subject: result.subject, html: result.html, text: result.text, data: result.data });
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.send(result.html);
  } catch (err) {
    console.error("[districts] GET pilot-scorecard-preview error:", err);
    res.status(500).json({ error: "Failed to build pilot scorecard preview" });
  }
});

/**
 * POST /districts/:id/pilot-scorecard-preview/send-test
 * Sends a one-off copy of the current pilot scorecard to the calling admin's
 * email. Does not affect the regular weekly send schedule or idempotency.
 */
router.post("/districts/:id/pilot-scorecard-preview/send-test", requireRoles("admin"), async (req, res): Promise<void> => {
  const districtId = parseInt(req.params.id as string, 10);
  if (isNaN(districtId)) { res.status(400).json({ error: "Invalid district id" }); return; }

  const enforcedId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (enforcedId !== null && enforcedId !== districtId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const meta = getPublicMeta(req);
  if (!meta.staffId) {
    res.status(400).json({ error: "Caller has no linked staff record; cannot determine email." });
    return;
  }

  try {
    const [staffRow] = await db
      .select({ email: staffTable.email })
      .from(staffTable)
      .where(eq(staffTable.id, meta.staffId))
      .limit(1);

    const recipient = staffRow?.email;
    if (!recipient) {
      res.status(400).json({ error: "No email address on file for the calling admin." });
      return;
    }

    const preview = await buildPilotScorecardPreviewForDistrict(districtId);
    if (!preview.ok) { res.status(404).json({ error: preview.error }); return; }

    const testSubject = `[TEST] ${preview.subject}`;
    const result = await sendAdminEmail({
      to: [recipient],
      subject: testSubject,
      html: preview.html,
      text: preview.text,
      notificationType: "PilotScorecardTest",
    });

    if (result.notConfigured) {
      res.status(200).json({
        sent: false,
        notConfigured: true,
        recipient,
        message: "Email provider not configured — would have sent test email.",
      });
      return;
    }
    if (!result.success) {
      res.status(502).json({ sent: false, recipient, error: result.error ?? "send failed" });
      return;
    }
    res.json({ sent: true, recipient });
  } catch (err) {
    console.error("[districts] POST pilot-scorecard-preview/send-test error:", err);
    res.status(500).json({ error: "Failed to send test scorecard email" });
  }
});

export default router;
