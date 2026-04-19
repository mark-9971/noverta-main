import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { studentsTable, schoolsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../../lib/minuteCalc";
import { parseSchoolDistrictFilters, resolveSchoolYearWindow } from "./shared";
import { getRateMap, minutesToDollars, type RateInfo } from "../compensatoryFinance/shared";

const router: IRouter = Router();

/**
 * GET /api/dashboard/school-compliance
 *
 * Returns per-school compliance breakdown for the current school year.
 * Each row:
 *   schoolId, schoolName, totalStudents, onTrack, atRisk, rate
 *   – plus health-score inputs –
 *   complianceRate         (% of mandated minutes delivered, 0–100)
 *   exposurePerStudent     ($ of compensatory exposure per enrolled student)
 *   providerLoggingRate    (fraction 0–1 of sessions that were logged)
 *
 * Sorted by `rate` (% on-track) ascending so dashboards surface risk first.
 */
router.get("/dashboard/school-compliance", async (req, res): Promise<void> => {
  try {
    const sdFilters = parseSchoolDistrictFilters(req, req.query);
    const yearWindow = await resolveSchoolYearWindow(req, req.query as Record<string, unknown>, sdFilters.districtId ?? null);

    const progress = await computeAllActiveMinuteProgress({
      ...sdFilters,
      ...(yearWindow.startDate ? { startDate: yearWindow.startDate } : {}),
      ...(yearWindow.endDate ? { endDate: yearWindow.endDate } : {}),
    });

    if (progress.length === 0) {
      res.json([]);
      return;
    }

    // Fetch school info for every student in the progress set
    const uniqueStudentIds = [...new Set(progress.map(p => p.studentId))];
    const studentSchools = await db
      .select({
        studentId: studentsTable.id,
        schoolId: schoolsTable.id,
        schoolName: schoolsTable.name,
      })
      .from(studentsTable)
      .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
      .where(sql`${studentsTable.id} IN (${sql.join(uniqueStudentIds.map(id => sql`${id}`), sql`, `)})`);

    const schoolInfoMap = new Map(studentSchools.map(s => [s.studentId, {
      schoolId: s.schoolId,
      schoolName: s.schoolName ?? "Unknown School",
    }]));

    // Rate map for per-row exposure pricing. Only loaded when we have a
    // district context — without one we can't price compensatory minutes,
    // and exposurePerStudent will fall back to 0.
    const rateMap = sdFilters.districtId ? await getRateMap(sdFilters.districtId) : null;

    // Group by school — one student may have multiple service requirements
    type SchoolBucket = {
      schoolId: number | null;
      schoolName: string;
      studentIds: Set<number>;
      atRiskIds: Set<number>;
      totalRequired: number;
      totalDelivered: number;
      totalExposure: number;
    };
    const buckets = new Map<string, SchoolBucket>();

    for (const p of progress) {
      const info = schoolInfoMap.get(p.studentId);
      const key = String(info?.schoolId ?? "unknown");
      if (!buckets.has(key)) {
        buckets.set(key, {
          schoolId: info?.schoolId ?? null,
          schoolName: info?.schoolName ?? "Unknown School",
          studentIds: new Set(),
          atRiskIds: new Set(),
          totalRequired: 0,
          totalDelivered: 0,
          totalExposure: 0,
        });
      }
      const b = buckets.get(key)!;
      b.studentIds.add(p.studentId);
      if (p.riskStatus === "at_risk" || p.riskStatus === "out_of_compliance") {
        b.atRiskIds.add(p.studentId);
      }
      b.totalRequired += p.requiredMinutes;
      b.totalDelivered += p.deliveredMinutes;

      const shortfall = Math.max(0, p.requiredMinutes - p.deliveredMinutes);
      if (shortfall > 0 && rateMap) {
        const rateInfo: RateInfo = rateMap.get(p.serviceTypeId)?.inHouse ?? { rate: null, source: "unconfigured" };
        const dollars = minutesToDollars(shortfall, rateInfo);
        if (dollars != null) b.totalExposure += dollars;
      }
    }

    const rows = [...buckets.values()]
      .map(b => {
        const total = b.studentIds.size;
        const atRisk = b.atRiskIds.size;
        const onTrack = total - atRisk;
        const rate = total > 0 ? Math.round((onTrack / total) * 100) : 100;
        const complianceRate = b.totalRequired > 0
          ? Math.round((b.totalDelivered / b.totalRequired) * 1000) / 10
          : 100;
        const exposurePerStudent = total > 0
          ? Math.round((b.totalExposure / total) * 100) / 100
          : 0;
        // Provider logging rate is not tracked per-school yet — mirror the
        // district-level placeholder of 1.0 so the health score formula is
        // consistent with the badge headline number.
        const providerLoggingRate = 1.0;
        return {
          schoolId: b.schoolId,
          schoolName: b.schoolName,
          totalStudents: total,
          onTrack,
          atRisk,
          rate,
          complianceRate,
          exposurePerStudent,
          providerLoggingRate,
        };
      })
      .sort((a, b) => a.rate - b.rate); // worst first

    res.json(rows);
  } catch (err) {
    console.error("[school-compliance]", err);
    res.status(500).json({ error: "Failed to compute school compliance" });
  }
});

export default router;
