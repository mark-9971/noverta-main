import { Router, type IRouter, type Request } from "express";
import { db } from "@workspace/db";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";
import {
  studentsTable, sessionLogsTable, serviceRequirementsTable, schoolsTable,
} from "@workspace/db";
import { GetComplianceTrendReportQueryParams } from "@workspace/api-zod";
import { eq, and, gte, lte, sql, isNull } from "drizzle-orm";

const router: IRouter = Router();

router.get("/reports/compliance-trend", async (req: Request, res): Promise<void> => {
  try {
    const parsed = GetComplianceTrendReportQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query parameters", details: parsed.error.flatten() });
      return;
    }
    const { startDate, endDate, granularity, schoolId, schoolYearId: trendYearId } = req.query;
    const trendEnforcedDistrictId = getEnforcedDistrictId(req as unknown as AuthedRequest);
    const districtId = trendEnforcedDistrictId !== null ? String(trendEnforcedDistrictId) : null;
    const gran = (granularity as string) || "weekly";
    const now = new Date();
    const defaultEnd = now.toISOString().split("T")[0];
    const defaultStart = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split("T")[0];
    const start = (startDate as string) || defaultStart;
    const end = (endDate as string) || defaultEnd;

    const studentConditions: any[] = [eq(studentsTable.status, "active")];
    if (schoolId) studentConditions.push(eq(studentsTable.schoolId, Number(schoolId)));
    if (districtId) studentConditions.push(sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${Number(districtId)})`);

    const activeStudents = await db.select({
      id: studentsTable.id,
      schoolId: studentsTable.schoolId,
      schoolName: schoolsTable.name,
    })
      .from(studentsTable)
      .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
      .where(and(...studentConditions));

    const studentIds = activeStudents.map(s => s.id);
    if (studentIds.length === 0) {
      res.json({ trend: [], schools: [], semesterMarkers: [], generatedAt: new Date().toISOString(), preparedBy: (req.query.preparedBy as string) || null });
      return;
    }

    const sessions = await db.select({
      studentId: sessionLogsTable.studentId,
      sessionDate: sessionLogsTable.sessionDate,
      durationMinutes: sessionLogsTable.durationMinutes,
      status: sessionLogsTable.status,
    })
      .from(sessionLogsTable)
      .where(and(
        gte(sessionLogsTable.sessionDate, start),
        lte(sessionLogsTable.sessionDate, end),
        sql`${sessionLogsTable.studentId} IN (${sql.join(studentIds.map(id => sql`${id}`), sql`, `)})`,
        isNull(sessionLogsTable.deletedAt),
        ...(trendYearId ? [eq(sessionLogsTable.schoolYearId, Number(trendYearId))] : [])
      ));

    const requirements = await db.select({
      studentId: serviceRequirementsTable.studentId,
      requiredMinutes: serviceRequirementsTable.requiredMinutes,
      intervalType: serviceRequirementsTable.intervalType,
    })
      .from(serviceRequirementsTable)
      .where(and(
        eq(serviceRequirementsTable.active, true),
        sql`${serviceRequirementsTable.studentId} IN (${sql.join(studentIds.map(id => sql`${id}`), sql`, `)})`
      ));

    function normalizeToPeriod(requiredMinutes: number, intervalType: string): number {
      if (gran === "monthly") {
        if (intervalType === "weekly") return requiredMinutes * 4;
        if (intervalType === "monthly") return requiredMinutes;
        if (intervalType === "quarterly") return Math.round(requiredMinutes / 3);
        return requiredMinutes * 4;
      }
      if (intervalType === "monthly") return Math.round(requiredMinutes / 4);
      if (intervalType === "quarterly") return Math.round(requiredMinutes / 13);
      return requiredMinutes;
    }

    const reqByStudent = new Map<number, number>();
    for (const r of requirements) {
      const periodMin = normalizeToPeriod(r.requiredMinutes, r.intervalType);
      reqByStudent.set(r.studentId, (reqByStudent.get(r.studentId) ?? 0) + periodMin);
    }

    const studentsWithReqs = new Set<number>();
    for (const [sid, req] of reqByStudent) {
      if (req > 0) studentsWithReqs.add(sid);
    }

    const schoolMap = new Map<number, string>();
    const studentSchool = new Map<number, number>();
    for (const s of activeStudents) {
      if (s.schoolId) {
        studentSchool.set(s.id, s.schoolId);
        if (s.schoolName) schoolMap.set(s.schoolId, s.schoolName);
      }
    }

    function periodKey(dateStr: string): string {
      const d = new Date(dateStr + "T12:00:00");
      if (gran === "monthly") {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
      const day = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      return monday.toISOString().split("T")[0];
    }

    type PeriodData = { delivered: Map<number, number>; total: number };
    const byPeriod = new Map<string, PeriodData>();
    const bySchoolPeriod = new Map<string, Map<string, PeriodData>>();

    for (const s of sessions) {
      if (s.status !== "completed" && s.status !== "makeup") continue;
      const pk = periodKey(s.sessionDate);
      if (!byPeriod.has(pk)) byPeriod.set(pk, { delivered: new Map(), total: 0 });
      const pd = byPeriod.get(pk)!;
      pd.delivered.set(s.studentId, (pd.delivered.get(s.studentId) ?? 0) + s.durationMinutes);
      pd.total += s.durationMinutes;

      const sid = studentSchool.get(s.studentId);
      if (sid !== undefined) {
        const schoolKey = String(sid);
        if (!bySchoolPeriod.has(schoolKey)) bySchoolPeriod.set(schoolKey, new Map());
        const schoolMap2 = bySchoolPeriod.get(schoolKey)!;
        if (!schoolMap2.has(pk)) schoolMap2.set(pk, { delivered: new Map(), total: 0 });
        const spd = schoolMap2.get(pk)!;
        spd.delivered.set(s.studentId, (spd.delivered.get(s.studentId) ?? 0) + s.durationMinutes);
        spd.total += s.durationMinutes;
      }
    }

    function calcCompliance(pd: PeriodData, studentPool: Set<number>): number {
      let onTrack = 0;
      let total = 0;
      for (const studentId of studentPool) {
        const req = reqByStudent.get(studentId) ?? 0;
        if (req <= 0) continue;
        total++;
        const delivered = pd.delivered.get(studentId) ?? 0;
        if (delivered >= req * 0.85) onTrack++;
      }
      return total > 0 ? Math.round((onTrack / total) * 100) : 100;
    }

    const schoolStudents = new Map<number, Set<number>>();
    for (const sid of studentsWithReqs) {
      const schoolId = studentSchool.get(sid);
      if (schoolId !== undefined) {
        if (!schoolStudents.has(schoolId)) schoolStudents.set(schoolId, new Set());
        schoolStudents.get(schoolId)!.add(sid);
      }
    }

    function getSemesterMarkers(startStr: string, endStr: string) {
      const markers: { date: string; label: string }[] = [];
      const startYear = new Date(startStr + "T12:00:00").getFullYear();
      const endYear = new Date(endStr + "T12:00:00").getFullYear();
      for (let y = startYear - 1; y <= endYear + 1; y++) {
        const sem1Start = `${y}-09-01`;
        const sem2Start = `${y + 1}-01-15`;
        const yearEnd = `${y + 1}-06-30`;
        if (sem1Start >= startStr && sem1Start <= endStr) {
          markers.push({ date: sem1Start, label: `Fall ${y}` });
        }
        if (sem2Start >= startStr && sem2Start <= endStr) {
          markers.push({ date: sem2Start, label: `Spring ${y + 1}` });
        }
        if (yearEnd >= startStr && yearEnd <= endStr) {
          markers.push({ date: yearEnd, label: `Year End ${y + 1}` });
        }
      }
      return markers;
    }

    function enumeratePeriods(startStr: string, endStr: string): string[] {
      const result: string[] = [];
      const endD = new Date(endStr + "T12:00:00");
      if (gran === "monthly") {
        const d = new Date(startStr + "T12:00:00");
        d.setDate(1);
        while (d <= endD) {
          result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
          d.setMonth(d.getMonth() + 1);
        }
      } else {
        const d = new Date(startStr + "T12:00:00");
        const day = d.getDay();
        d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
        while (d <= endD) {
          result.push(d.toISOString().split("T")[0]);
          d.setDate(d.getDate() + 7);
        }
      }
      return result;
    }

    const emptyPeriod: PeriodData = { delivered: new Map(), total: 0 };
    const periods = enumeratePeriods(start, end);
    const trend = periods.map(pk => ({
      period: pk,
      compliancePercent: calcCompliance(byPeriod.get(pk) ?? emptyPeriod, studentsWithReqs),
      totalDelivered: byPeriod.get(pk)?.total ?? 0,
      studentsTracked: studentsWithReqs.size,
    }));

    const schools: { schoolId: number; schoolName: string; trend: typeof trend }[] = [];
    for (const [sid, sName] of schoolMap) {
      const periodMap = bySchoolPeriod.get(String(sid));
      const pool = schoolStudents.get(sid) ?? new Set();
      const schoolTrend = periods.map(pk => ({
        period: pk,
        compliancePercent: calcCompliance(periodMap?.get(pk) ?? emptyPeriod, pool),
        totalDelivered: periodMap?.get(pk)?.total ?? 0,
        studentsTracked: pool.size,
      }));
      schools.push({ schoolId: sid, schoolName: sName, trend: schoolTrend });
    }

    const semesterMarkers = getSemesterMarkers(start, end);

    res.json({ trend, schools, semesterMarkers, generatedAt: new Date().toISOString(), preparedBy: (req.query.preparedBy as string) || null });
  } catch (e: any) {
    console.error("GET /reports/compliance-trend error:", e);
    res.status(500).json({ error: "Failed to generate compliance trend" });
  }
});

export default router;
