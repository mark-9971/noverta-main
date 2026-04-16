import { Router, type IRouter, type Request } from "express";
import { db } from "@workspace/db";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";
import {
  studentsTable, staffTable, serviceRequirementsTable, schoolsTable,
  progressReportsTable,
} from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/reports/parent-summary/:studentId", async (req: Request, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }

    const parentSummaryDistrictId = getEnforcedDistrictId(req as AuthedRequest);
    if (parentSummaryDistrictId !== null) {
      const rows = await db.execute(
        sql`SELECT sc.district_id FROM students st LEFT JOIN schools sc ON sc.id = st.school_id WHERE st.id = ${studentId} LIMIT 1`
      );
      const sDistrictId = (rows.rows[0] as { district_id: number | null } | undefined)?.district_id ?? null;
      if (sDistrictId === null || Number(sDistrictId) !== parentSummaryDistrictId) {
        res.status(403).json({ error: "Access denied: student is outside your district" });
        return;
      }
    }

    const parentSafe = req.query.parentSafe === "true" || req.query.parentSafe === "1";

    const [student] = await db.select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      grade: studentsTable.grade,
      dob: studentsTable.dob,
      schoolId: studentsTable.schoolId,
      schoolName: schoolsTable.name,
    }).from(studentsTable)
      .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
      .where(eq(studentsTable.id, studentId));

    if (!student) { res.status(404).json({ error: "Student not found" }); return; }

    const reports = await db.select().from(progressReportsTable)
      .where(eq(progressReportsTable.studentId, studentId))
      .orderBy(desc(progressReportsTable.createdAt))
      .limit(5);

    const latestReport = reports[0] || null;

    const providerQuery = await db.select({
      id: staffTable.id,
      firstName: staffTable.firstName,
      lastName: staffTable.lastName,
      role: staffTable.role,
      email: staffTable.email,
    }).from(serviceRequirementsTable)
      .innerJoin(staffTable, eq(staffTable.id, serviceRequirementsTable.providerId))
      .where(eq(serviceRequirementsTable.studentId, studentId))
      .groupBy(staffTable.id, staffTable.firstName, staffTable.lastName, staffTable.role, staffTable.email);

    const providers = parentSafe
      ? providerQuery.map(p => ({ role: p.role }))
      : providerQuery.map(p => ({ name: `${p.firstName} ${p.lastName}`, role: p.role, email: p.email }));

    const RATING_LABELS: Record<string, { label: string; color: string }> = {
      mastered: { label: "Mastered", color: "emerald" },
      sufficient_progress: { label: "On Track", color: "emerald" },
      some_progress: { label: "Making Progress", color: "blue" },
      insufficient_progress: { label: "Needs Support", color: "amber" },
      regression: { label: "Needs Attention", color: "red" },
      not_addressed: { label: "Not Yet Measured", color: "gray" },
    };

    const goalSummaries = (latestReport?.goalProgress ?? []).map((g: any) => ({
      area: g.goalArea || g.serviceArea || "Goal",
      goalNumber: g.goalNumber,
      progressRating: parentSafe ? undefined : g.progressRating,
      statusLabel: RATING_LABELS[g.progressRating]?.label ?? "In Progress",
      statusColor: parentSafe ? undefined : (RATING_LABELS[g.progressRating]?.color ?? "gray"),
      trendDirection: parentSafe ? undefined : g.trendDirection,
      parentFriendlyNarrative: g.narrative,
      dataPoints: parentSafe ? undefined : g.dataPoints,
      currentPerformance: parentSafe ? undefined : g.currentPerformance,
      targetCriterion: parentSafe ? undefined : g.targetCriterion,
    }));

    const servicesSummary = (latestReport?.serviceBreakdown ?? []).map((s: any) => {
      const pct = s.compliancePercent ?? 0;
      return {
        serviceType: s.serviceType,
        requiredMinutes: parentSafe ? undefined : s.requiredMinutes,
        deliveredMinutes: parentSafe ? undefined : s.deliveredMinutes,
        compliancePercent: parentSafe ? undefined : pct,
        sessionsSummary: `${s.completedSessions ?? "—"} of ${(s.completedSessions ?? 0) + (s.missedSessions ?? 0)} sessions attended`,
        parentFriendly: pct >= 95 ? "All services provided on schedule."
          : pct >= 80 ? "Most services provided as planned."
          : pct >= 60 ? "Some services were missed this period."
          : "Significant services were not provided — see staff for details.",
      };
    });

    res.json({
      parentSafe,
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        grade: student.grade,
        schoolName: student.schoolName,
      },
      providers,
      reportingPeriod: latestReport ? {
        label: latestReport.reportingPeriod,
        start: latestReport.periodStart,
        end: latestReport.periodEnd,
        status: parentSafe ? undefined : latestReport.status,
      } : null,
      overallSummary: latestReport?.overallSummary ?? null,
      parentNotes: latestReport?.parentNotes ?? null,
      recommendations: parentSafe ? undefined : latestReport?.recommendations ?? null,
      goalSummaries,
      servicesSummary: parentSafe
        ? servicesSummary.map(({ parentFriendly, serviceType }) => ({ serviceType, parentFriendly }))
        : servicesSummary,
      availableReports: parentSafe ? undefined : reports.map(r => ({
        id: r.id,
        reportingPeriod: r.reportingPeriod,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("GET /reports/parent-summary error:", e);
    res.status(500).json({ error: "Failed to generate parent summary" });
  }
});

export default router;
