import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { studentsTable, schoolsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../../lib/minuteCalc";
import { parseSchoolDistrictFilters, resolveSchoolYearWindow } from "./shared";

const router: IRouter = Router();

/**
 * GET /api/dashboard/school-compliance
 *
 * Returns per-school compliance breakdown for the current school year.
 * Each row: schoolId, schoolName, totalStudents, onTrack, atRisk, rate.
 * Sorted by compliance rate ascending (worst first) so dashboards surface risk.
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

    // Group by school — one student may have multiple service requirements
    type SchoolBucket = { schoolId: number | null; schoolName: string; studentIds: Set<number>; atRiskIds: Set<number> };
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
        });
      }
      const b = buckets.get(key)!;
      b.studentIds.add(p.studentId);
      if (p.riskStatus === "at_risk" || p.riskStatus === "out_of_compliance") {
        b.atRiskIds.add(p.studentId);
      }
    }

    const rows = [...buckets.values()]
      .map(b => {
        const total = b.studentIds.size;
        const atRisk = b.atRiskIds.size;
        const onTrack = total - atRisk;
        const rate = total > 0 ? Math.round((onTrack / total) * 100) : 100;
        return { schoolId: b.schoolId, schoolName: b.schoolName, totalStudents: total, onTrack, atRisk, rate };
      })
      .sort((a, b) => a.rate - b.rate); // worst first

    res.json(rows);
  } catch (err) {
    console.error("[school-compliance]", err);
    res.status(500).json({ error: "Failed to compute school compliance" });
  }
});

export default router;
