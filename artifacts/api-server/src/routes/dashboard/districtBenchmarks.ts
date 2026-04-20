// tenant-scope: super-admin (requirePlatformAdmin gates the only handler; cross-district benchmarks by-design)
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { districtsTable, studentsTable, schoolsTable, sessionLogsTable } from "@workspace/db";
import { eq, and, gte, lte, isNull } from "drizzle-orm";
import { requirePlatformAdmin } from "../../middlewares/auth";
import { computeAllActiveMinuteProgress } from "../../lib/minuteCalc";

const router: IRouter = Router();

/**
 * GET /dashboard/district-benchmarks
 *
 * Platform-admin only. Returns a ranked list of all districts with their
 * compliance rate, high-risk student count, and session completion rate for
 * the current week. Sorted by compliance rate ascending (worst first).
 * Returns an empty array when fewer than 2 districts exist.
 */
router.get("/dashboard/district-benchmarks", requirePlatformAdmin, async (req, res): Promise<void> => {
  const districts = await db
    .select({ id: districtsTable.id, name: districtsTable.name })
    .from(districtsTable)
    .orderBy(districtsTable.name);

  if (districts.length < 2) {
    res.json([]);
    return;
  }

  const districtIdSet = new Set(districts.map(d => d.id));

  const [studentDistrictRows, allProgress] = await Promise.all([
    db
      .select({ studentId: studentsTable.id, districtId: schoolsTable.districtId })
      .from(studentsTable)
      .innerJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
      .where(eq(studentsTable.status, "active")),
    computeAllActiveMinuteProgress(),
  ]);

  const studentDistrictMap = new Map<number, number>();
  for (const row of studentDistrictRows) {
    if (row.districtId != null && districtIdSet.has(row.districtId)) {
      studentDistrictMap.set(row.studentId, row.districtId);
    }
  }

  const riskPriority: Record<string, number> = {
    out_of_compliance: 4, at_risk: 3, slightly_behind: 2, on_track: 1, completed: 0, no_data: -1,
  };

  const studentRisk = new Map<number, string>();
  for (const p of allProgress) {
    const current = studentRisk.get(p.studentId);
    if (!current || (riskPriority[p.riskStatus] ?? 0) > (riskPriority[current] ?? 0)) {
      studentRisk.set(p.studentId, p.riskStatus);
    }
  }

  type DistrictStats = { onTrack: number; highRisk: number; tracked: number };
  const complianceByDistrict = new Map<number, DistrictStats>();
  for (const d of districts) {
    complianceByDistrict.set(d.id, { onTrack: 0, highRisk: 0, tracked: 0 });
  }

  for (const [studentId, riskStatus] of studentRisk.entries()) {
    if (riskStatus === "no_data") continue;
    const districtId = studentDistrictMap.get(studentId);
    if (districtId == null) continue;
    const stats = complianceByDistrict.get(districtId);
    if (!stats) continue;
    stats.tracked++;
    if (riskStatus === "on_track" || riskStatus === "completed") stats.onTrack++;
    if (riskStatus === "at_risk" || riskStatus === "out_of_compliance") stats.highRisk++;
  }

  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartStr = weekStart.toISOString().substring(0, 10);
  const todayStr = today.toISOString().substring(0, 10);

  const sessionRows = await db
    .select({
      districtId: schoolsTable.districtId,
      status: sessionLogsTable.status,
    })
    .from(sessionLogsTable)
    .innerJoin(studentsTable, eq(studentsTable.id, sessionLogsTable.studentId))
    .innerJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
    .where(and(
      gte(sessionLogsTable.sessionDate, weekStartStr),
      lte(sessionLogsTable.sessionDate, todayStr),
      isNull(sessionLogsTable.deletedAt),
    ));

  type SessionStats = { completed: number; total: number };
  const sessionByDistrict = new Map<number, SessionStats>();
  for (const row of sessionRows) {
    if (row.districtId == null || !districtIdSet.has(row.districtId)) continue;
    if (row.status !== "completed" && row.status !== "missed") continue;
    if (!sessionByDistrict.has(row.districtId)) {
      sessionByDistrict.set(row.districtId, { completed: 0, total: 0 });
    }
    const ss = sessionByDistrict.get(row.districtId)!;
    ss.total++;
    if (row.status === "completed") ss.completed++;
  }

  const result = districts.map(d => {
    const cs = complianceByDistrict.get(d.id) ?? { onTrack: 0, highRisk: 0, tracked: 0 };
    const ss = sessionByDistrict.get(d.id) ?? { completed: 0, total: 0 };
    return {
      districtId: d.id,
      districtName: d.name,
      complianceRate: cs.tracked > 0 ? Math.round((cs.onTrack / cs.tracked) * 100) : null,
      highRiskCount: cs.highRisk,
      studentCount: cs.tracked,
      sessionCompletionRate: ss.total > 0 ? Math.round((ss.completed / ss.total) * 100) : null,
    };
  });

  result.sort((a, b) => {
    if (a.complianceRate === null && b.complianceRate === null) return 0;
    if (a.complianceRate === null) return 1;
    if (b.complianceRate === null) return -1;
    return a.complianceRate - b.complianceRate;
  });

  res.json(result);
});

export default router;
