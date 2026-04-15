import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  districtsTable, schoolsTable, studentsTable, staffTable,
  alertsTable, sessionLogsTable, serviceRequirementsTable,
  districtSubscriptionsTable
} from "@workspace/db";
import { eq, and, count, sql, inArray } from "drizzle-orm";
import { getPublicMeta } from "../lib/clerkClaims";
import { computeAllActiveMinuteProgress } from "../lib/minuteCalc";
import { requireTierAccess } from "../middlewares/tierGate";

const router: IRouter = Router();

router.get("/districts", async (_req, res): Promise<void> => {
  const districts = await db
    .select({
      id: districtsTable.id,
      name: districtsTable.name,
      state: districtsTable.state,
      region: districtsTable.region,
      tier: districtsTable.tier,
      tierOverride: districtsTable.tierOverride,
      createdAt: districtsTable.createdAt,
    })
    .from(districtsTable)
    .orderBy(districtsTable.name);

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

  res.json(districts.map(d => ({
    ...d,
    schoolCount: schoolCountMap.get(d.id) ?? 0,
    createdAt: d.createdAt.toISOString(),
  })));
});

router.post("/districts", async (req, res): Promise<void> => {
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
  const updateData: Partial<typeof districtsTable.$inferInsert> = {};
  if (req.body.name != null) updateData.name = req.body.name;
  if (req.body.state !== undefined) updateData.state = req.body.state;
  if (req.body.region !== undefined) updateData.region = req.body.region;

  if (req.body.tier !== undefined || req.body.tierOverride !== undefined) {
    if (!meta.platformAdmin) {
      res.status(403).json({ error: "Only platform administrators can change subscription tier" });
      return;
    }
    if (req.body.tier !== undefined) updateData.tier = req.body.tier;
    if (req.body.tierOverride !== undefined) updateData.tierOverride = req.body.tierOverride;
  }

  const [district] = await db.update(districtsTable).set(updateData).where(eq(districtsTable.id, id)).returning();
  if (!district) { res.status(404).json({ error: "District not found" }); return; }
  res.json({ ...district, createdAt: district.createdAt.toISOString(), updatedAt: district.updatedAt.toISOString() });
});

router.delete("/districts/:id", async (req, res): Promise<void> => {
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
    districtId = meta.districtId ?? null;

    if (!districtId && meta.staffId) {
      const staffResult = await db.execute(
        sql`SELECT d.id FROM districts d
            JOIN schools s ON s.district_id = d.id
            JOIN staff st ON st.school_id = s.id
            WHERE st.id = ${meta.staffId} LIMIT 1`
      );
      if (staffResult.rows.length > 0) {
        districtId = Number((staffResult.rows[0] as Record<string, unknown>).id);
      }
    }
  }

  if (!districtId) {
    const allDistricts = await db.select({ id: districtsTable.id }).from(districtsTable).limit(2);
    if (allDistricts.length === 1) districtId = allDistricts[0].id;
  }

  if (!districtId) {
    res.json({ tier: "essentials", tierOverride: null, effectiveTier: "essentials" });
    return;
  }

  const [district] = await db
    .select({ tier: districtsTable.tier, tierOverride: districtsTable.tierOverride })
    .from(districtsTable)
    .where(eq(districtsTable.id, districtId))
    .limit(1);

  if (!district) {
    res.json({ tier: "essentials", tierOverride: null, effectiveTier: "essentials" });
    return;
  }

  res.json({
    tier: district.tier,
    tierOverride: district.tierOverride,
    effectiveTier: district.tierOverride || district.tier || "essentials",
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

export default router;
