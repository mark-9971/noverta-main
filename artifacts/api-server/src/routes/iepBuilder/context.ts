import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, iepGoalsTable, progressReportsTable, serviceRequirementsTable,
  serviceTypesTable, programTargetsTable, behaviorTargetsTable,
  dataSessionsTable, iepDocumentsTable, iepAccommodationsTable,
  schoolsTable,
} from "@workspace/db";
import { eq, desc, and, asc, count, gte } from "drizzle-orm";
import {
  getAge, nextSchoolYear, getAgeBand, goalProgressCodeLabel,
  recommendationForGoal, AGE_APPROPRIATE_SKILLS, TRANSITION_DOMAINS,
} from "./shared";

const router: IRouter = Router();

router.get("/students/:studentId/iep-builder/context", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
    if (!student) { res.status(404).json({ error: "Student not found" }); return; }

    const age = getAge(student.dateOfBirth);
    const ageBand = getAgeBand(age);
    const nyear = nextSchoolYear();
    const needsTransition = (age !== null && age >= 14);

    const iepDocs = await db.select().from(iepDocumentsTable)
      .where(and(eq(iepDocumentsTable.studentId, studentId), eq(iepDocumentsTable.active, true)))
      .orderBy(desc(iepDocumentsTable.iepStartDate)).limit(1);
    const currentIep = iepDocs[0] || null;

    const goals = await db.select().from(iepGoalsTable)
      .where(and(eq(iepGoalsTable.studentId, studentId), eq(iepGoalsTable.active, true)))
      .orderBy(asc(iepGoalsTable.goalArea), asc(iepGoalsTable.goalNumber));

    const reports = await db.select().from(progressReportsTable)
      .where(eq(progressReportsTable.studentId, studentId))
      .orderBy(desc(progressReportsTable.createdAt)).limit(3);
    const latestReport = reports[0] || null;

    const goalProgressMap: Record<number, any> = {};
    if (latestReport?.goalProgress) {
      const entries = latestReport.goalProgress as any[];
      entries.forEach(e => { goalProgressMap[e.iepGoalId] = e; });
    }

    const services = await db.select({
      id: serviceRequirementsTable.id,
      serviceTypeName: serviceTypesTable.name,
      requiredMinutes: serviceRequirementsTable.requiredMinutes,
      intervalType: serviceRequirementsTable.intervalType,
      deliveryType: serviceRequirementsTable.deliveryType,
      groupSize: serviceRequirementsTable.groupSize,
      setting: serviceRequirementsTable.setting,
    }).from(serviceRequirementsTable)
      .leftJoin(serviceTypesTable, eq(serviceRequirementsTable.serviceTypeId, serviceTypesTable.id))
      .where(and(eq(serviceRequirementsTable.studentId, studentId), eq(serviceRequirementsTable.active, true)));

    const serviceCompliance = (latestReport?.serviceBreakdown as any[] | null) || [];

    const accommodations = await db.select().from(iepAccommodationsTable)
      .where(and(eq(iepAccommodationsTable.studentId, studentId), eq(iepAccommodationsTable.active, true)));

    const programTargets = await db.select().from(programTargetsTable)
      .where(eq(programTargetsTable.studentId, studentId)).limit(20);

    const behaviorTargets = await db.select().from(behaviorTargetsTable)
      .where(eq(behaviorTargetsTable.studentId, studentId)).limit(10);

    const [school] = student.schoolId
      ? await db.select({ name: schoolsTable.name }).from(schoolsTable).where(eq(schoolsTable.id, student.schoolId))
      : [null];

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const recentSessions = await db.select({ cnt: count() }).from(dataSessionsTable)
      .where(and(eq(dataSessionsTable.studentId, studentId), gte(dataSessionsTable.sessionDate, sixMonthsAgo.toISOString().split("T")[0])));
    const totalDataPoints = Number(recentSessions[0]?.cnt ?? 0);

    const goalSummary = goals.map(g => {
      const progress = goalProgressMap[g.id] || null;
      const code = progress?.progressCode || "NA";
      const rec = recommendationForGoal(
        { annualGoal: g.annualGoal, goalArea: g.goalArea, baseline: g.baseline, targetCriterion: g.targetCriterion },
        code,
        progress?.currentPerformance || "No data",
        progress?.percentCorrect ?? null,
        progress?.behaviorValue ?? null,
        progress?.behaviorGoal ?? null,
        progress?.dataPoints || 0,
        progress?.trendDirection || "stable"
      );
      return {
        id: g.id,
        goalArea: g.goalArea,
        goalNumber: g.goalNumber,
        annualGoal: g.annualGoal,
        baseline: g.baseline,
        targetCriterion: g.targetCriterion,
        serviceArea: g.serviceArea,
        progressCode: code,
        progressLabel: goalProgressCodeLabel(code),
        currentPerformance: progress?.currentPerformance || "No data collected",
        percentCorrect: progress?.percentCorrect ?? null,
        behaviorValue: progress?.behaviorValue ?? null,
        trendDirection: progress?.trendDirection || "stable",
        dataPoints: progress?.dataPoints || 0,
        narrative: progress?.narrative || null,
        recommendation: rec,
      };
    });

    const masteredGoals = goalSummary.filter(g => g.progressCode === "M");
    const progressingGoals = goalSummary.filter(g => g.progressCode === "SP");
    const needsAttentionGoals = goalSummary.filter(g => ["IP", "NP", "R"].includes(g.progressCode));
    const notAddressedGoals = goalSummary.filter(g => g.progressCode === "NA");

    const ageSkills = AGE_APPROPRIATE_SKILLS[ageBand] || [];

    res.json({
      student: {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        grade: student.grade,
        dateOfBirth: student.dateOfBirth,
        age,
        disabilityCategory: student.disabilityCategory,
        placementType: student.placementType,
        primaryLanguage: student.primaryLanguage,
        schoolName: school?.name || null,
        parentName: student.parentGuardianName,
        parentEmail: student.parentEmail,
        parentPhone: student.parentPhone,
      },
      currentIep: currentIep ? {
        iepStartDate: currentIep.iepStartDate,
        iepEndDate: currentIep.iepEndDate,
        meetingDate: currentIep.meetingDate,
        plaafpAcademic: currentIep.plaafpAcademic,
        plaafpBehavioral: currentIep.plaafpBehavioral,
        plaafpCommunication: currentIep.plaafpCommunication,
        studentConcerns: currentIep.studentConcerns,
        parentConcerns: currentIep.parentConcerns,
        teamVision: currentIep.teamVision,
        transitionAssessment: currentIep.transitionAssessment,
        transitionPostsecGoals: currentIep.transitionPostsecGoals,
      } : null,
      goalSummary,
      goalCounts: {
        total: goalSummary.length,
        mastered: masteredGoals.length,
        sufficientProgress: progressingGoals.length,
        needsAttention: needsAttentionGoals.length,
        notAddressed: notAddressedGoals.length,
      },
      services: services.map(s => {
        const compliance = serviceCompliance.find((sc: any) => sc.serviceType === s.serviceTypeName);
        return {
          ...s,
          compliancePercent: compliance?.compliancePercent ?? null,
          deliveredMinutes: compliance?.deliveredMinutes ?? null,
          missedSessions: compliance?.missedSessions ?? null,
        };
      }),
      accommodations: accommodations.map(a => ({
        id: a.id,
        category: a.category,
        description: a.description,
        setting: a.setting,
        frequency: a.frequency,
      })),
      latestReportPeriod: latestReport ? `${latestReport.periodStart} to ${latestReport.periodEnd}` : null,
      totalDataPoints,
      recentReportsCount: reports.length,
      ageAppropriateSkills: ageSkills,
      needsTransition,
      transitionDomains: needsTransition ? TRANSITION_DOMAINS : [],
      nextSchoolYear: nyear,
      ageBand,
    });
  } catch (e: any) {
    console.error("IEP builder context error:", e);
    res.status(500).json({ error: "Failed to load IEP builder context" });
  }
});

export default router;
