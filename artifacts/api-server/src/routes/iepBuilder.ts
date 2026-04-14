import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, iepGoalsTable, progressReportsTable, serviceRequirementsTable,
  serviceTypesTable, programTargetsTable, behaviorTargetsTable, programDataTable,
  behaviorDataTable, dataSessionsTable, iepDocumentsTable, iepAccommodationsTable,
  sessionLogsTable, schoolsTable
} from "@workspace/db";
import { eq, desc, and, asc, count, gte } from "drizzle-orm";

const router: IRouter = Router();

function getAge(dob: string | null): number | null {
  if (!dob) return null;
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function nextSchoolYear(): { start: string; end: string; label: string } {
  const today = new Date();
  const year = today.getMonth() >= 7 ? today.getFullYear() + 1 : today.getFullYear();
  return {
    start: `${year}-09-01`,
    end: `${year + 1}-06-30`,
    label: `${year}–${year + 1}`,
  };
}

function advanceGoalCriterion(criterion: string | null): string {
  if (!criterion) return "85% accuracy across 3 consecutive sessions";
  const pctMatch = criterion.match(/(\d+)%/);
  if (pctMatch) {
    const current = parseInt(pctMatch[1]);
    const next = Math.min(100, current + 10);
    return criterion.replace(`${current}%`, `${next}%`);
  }
  return criterion;
}

function goalProgressCodeLabel(code: string): string {
  const labels: Record<string, string> = {
    M: "Mastered", SP: "Sufficient Progress", IP: "Insufficient Progress",
    NP: "No Progress", R: "Regression", NA: "Not Addressed",
  };
  return labels[code] || code;
}

function recommendationForGoal(
  goal: { annualGoal: string; goalArea: string; baseline: string | null; targetCriterion: string | null },
  progressCode: string,
  currentPerformance: string,
  percentCorrect: number | null,
  behaviorValue: number | null,
  behaviorGoal: number | null,
  dataPoints: number,
  trendDirection: string
): { action: "graduate" | "continue" | "modify" | "reconsider" | "review"; rationale: string; suggestedGoal: string; suggestedCriterion: string } {
  const base = goal.annualGoal;
  const area = goal.goalArea;

  switch (progressCode) {
    case "M": {
      const advancedCriterion = advanceGoalCriterion(goal.targetCriterion);
      return {
        action: "graduate",
        rationale: `Student has mastered this goal with ${currentPerformance}. Ready to advance to a more complex skill.`,
        suggestedGoal: `Given mastery of prior skill, student will demonstrate advanced ${area.toLowerCase()} skills: ${base.replace(/\.$/, "")} at a more complex level, as measured by data collection.`,
        suggestedCriterion: advancedCriterion,
      };
    }
    case "SP": {
      const advancedCriterion = advanceGoalCriterion(goal.targetCriterion);
      return {
        action: "continue",
        rationale: `Student is making sufficient progress (${currentPerformance}) and is on track to meet this goal. Recommend continuing with a slightly elevated criterion for the coming year.`,
        suggestedGoal: base,
        suggestedCriterion: advancedCriterion,
      };
    }
    case "IP":
    case "NP": {
      const modifier = trendDirection === "improving" ? "with modified instructional strategies" : "with increased supports and modified approach";
      return {
        action: progressCode === "NP" ? "reconsider" : "modify",
        rationale: `Student is making insufficient progress (${currentPerformance}, ${dataPoints} data points). A modified approach or additional supports are recommended.`,
        suggestedGoal: `${base} ${modifier}.`,
        suggestedCriterion: goal.targetCriterion || "80% accuracy across 3 consecutive sessions",
      };
    }
    case "R": {
      return {
        action: "reconsider",
        rationale: `Student has shown regression in this area (${currentPerformance}). The IEP Team should assess the current approach and consider reduced demand, additional environmental supports, or a revised instructional methodology.`,
        suggestedGoal: base,
        suggestedCriterion: goal.targetCriterion || "80% accuracy across 3 consecutive sessions",
      };
    }
    case "NA":
    default: {
      return {
        action: "review",
        rationale: `This goal was not addressed during the reporting period. The IEP Team should determine whether the goal remains appropriate and prioritize it for delivery.`,
        suggestedGoal: base,
        suggestedCriterion: goal.targetCriterion || "80% accuracy across 3 consecutive sessions",
      };
    }
  }
}

const AGE_APPROPRIATE_SKILLS: Record<string, string[]> = {
  "3-5": ["Following 2-step directions", "Identifying body parts", "Basic expressive labeling", "Parallel play", "Self-care: handwashing"],
  "6-8": ["Phonics and early reading", "Basic math facts", "Peer greetings", "Following classroom rules", "Requesting help appropriately"],
  "9-11": ["Reading comprehension", "Multi-step math problems", "Peer conversation skills", "Self-monitoring behavior", "Organization and study skills"],
  "12-14": ["Functional academics (money, time)", "Social problem solving", "Self-advocacy basics", "Vocational awareness", "Community safety skills"],
  "15-17": ["Pre-vocational skills", "Job applications and interviewing", "Independent living (cooking, laundry)", "Budgeting basics", "Post-secondary planning"],
  "18+": ["Vocational training / employment", "Independent living", "Community integration", "Benefits awareness", "Self-determination"],
};

function getAgeBand(age: number | null): string {
  if (!age) return "9-11";
  if (age <= 5) return "3-5";
  if (age <= 8) return "6-8";
  if (age <= 11) return "9-11";
  if (age <= 14) return "12-14";
  if (age <= 17) return "15-17";
  return "18+";
}

const TRANSITION_DOMAINS = [
  { domain: "Employment / Vocational", prompt: "What are the student's career interests and work experience?" },
  { domain: "Post-Secondary Education / Training", prompt: "What post-secondary education or training is the student interested in?" },
  { domain: "Independent Living", prompt: "What independent living skills does the student need to develop?" },
  { domain: "Community Participation", prompt: "How does the student engage in community activities?" },
  { domain: "Recreation / Leisure", prompt: "What hobbies or leisure activities does the student enjoy?" },
];

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

router.post("/students/:studentId/iep-builder/generate", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const {
      parentQuestionnaire,
      teacherQuestionnaire,
      transitionInput,
      includeTransition,
    } = req.body;

    const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
    if (!student) { res.status(404).json({ error: "Student not found" }); return; }

    const age = getAge(student.dateOfBirth);
    const nyear = nextSchoolYear();

    const iepDocs = await db.select().from(iepDocumentsTable)
      .where(and(eq(iepDocumentsTable.studentId, studentId), eq(iepDocumentsTable.active, true)))
      .orderBy(desc(iepDocumentsTable.iepStartDate)).limit(1);
    const currentIep = iepDocs[0] || null;

    const goals = await db.select().from(iepGoalsTable)
      .where(and(eq(iepGoalsTable.studentId, studentId), eq(iepGoalsTable.active, true)))
      .orderBy(asc(iepGoalsTable.goalArea), asc(iepGoalsTable.goalNumber));

    const reports = await db.select().from(progressReportsTable)
      .where(eq(progressReportsTable.studentId, studentId))
      .orderBy(desc(progressReportsTable.createdAt)).limit(1);
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

    const goalRecs = goals.map(g => {
      const progress = goalProgressMap[g.id] || null;
      const code = progress?.progressCode || "NA";
      return {
        id: g.id,
        goalArea: g.goalArea,
        goalNumber: g.goalNumber,
        currentGoal: g.annualGoal,
        baseline: g.baseline,
        targetCriterion: g.targetCriterion,
        progressCode: code,
        currentPerformance: progress?.currentPerformance || "No data",
        percentCorrect: progress?.percentCorrect ?? null,
        recommendation: recommendationForGoal(
          { annualGoal: g.annualGoal, goalArea: g.goalArea, baseline: g.baseline, targetCriterion: g.targetCriterion },
          code,
          progress?.currentPerformance || "No data",
          progress?.percentCorrect ?? null,
          progress?.behaviorValue ?? null,
          progress?.behaviorGoal ?? null,
          progress?.dataPoints || 0,
          progress?.trendDirection || "stable"
        ),
      };
    });

    const serviceRecs = services.map(s => {
      const compliance = serviceCompliance.find((sc: any) => sc.serviceType === s.serviceTypeName);
      const pct = compliance?.compliancePercent ?? 100;
      const missed = compliance?.missedSessions ?? 0;
      let action: "continue" | "increase" | "review" | "decrease" = "continue";
      let rationale = `Service delivery was ${pct}% compliant. Recommend continuing at current frequency.`;

      if (pct < 70) {
        action = "review";
        rationale = `Service compliance was ${pct}% (${missed} missed sessions). The IEP Team should review scheduling barriers and consider adjusting delivery model or time.`;
      } else if (pct < 85 && missed > 3) {
        action = "review";
        rationale = `Service compliance was ${pct}% with ${missed} missed sessions. The team should address barriers to consistent delivery.`;
      }

      const teacherRec = teacherQuestionnaire?.serviceChanges?.[s.serviceTypeName || ""] || null;
      if (teacherRec) {
        rationale += ` Teacher note: ${teacherRec}`;
      }

      return {
        serviceType: s.serviceTypeName,
        currentMinutes: s.requiredMinutes,
        currentInterval: s.intervalType,
        deliveryType: s.deliveryType,
        groupSize: s.groupSize,
        setting: s.setting,
        compliancePercent: pct,
        action,
        rationale,
        suggestedMinutes: s.requiredMinutes,
        suggestedInterval: s.intervalType,
      };
    });

    const plaafpSections: Record<string, string> = {};

    const masteredCount = goalRecs.filter(g => g.progressCode === "M").length;
    const spCount = goalRecs.filter(g => g.progressCode === "SP").length;
    const ipCount = goalRecs.filter(g => ["IP", "NP", "R"].includes(g.progressCode)).length;
    const naCount = goalRecs.filter(g => g.progressCode === "NA").length;

    const performanceSummary = `During the ${nyear.label} school year, ${student.firstName} ${student.lastName} will continue to receive special education services. ` +
      `Based on the most recent progress report, ${student.firstName} has mastered ${masteredCount} goal(s), is making sufficient progress on ${spCount} goal(s), ` +
      `requires additional support on ${ipCount} goal(s), and ${naCount} goal(s) were not addressed.`;

    const parentConcernsText = parentQuestionnaire?.primaryConcerns
      ? `Parent/Guardian report: ${parentQuestionnaire.primaryConcerns}`
      : currentIep?.parentConcerns
      ? `Previously documented parent concerns: ${currentIep.parentConcerns}`
      : "";

    const parentStrengthsText = parentQuestionnaire?.strengthsAtHome
      ? `At home, ${student.firstName} demonstrates strengths in: ${parentQuestionnaire.strengthsAtHome}.`
      : "";

    const parentPrioritiesText = parentQuestionnaire?.prioritiesForYear
      ? `Parent priorities for the upcoming year: ${parentQuestionnaire.prioritiesForYear}.`
      : "";

    const teacherObservationsText = teacherQuestionnaire?.academicPerformance
      ? `Teacher observations: ${teacherQuestionnaire.academicPerformance}.`
      : "";

    const teacherStrengthsText = teacherQuestionnaire?.areasOfStrength
      ? `${student.firstName} demonstrates strengths in: ${teacherQuestionnaire.areasOfStrength}.`
      : "";

    const teacherNeedsText = teacherQuestionnaire?.areasOfNeed
      ? `Areas requiring continued support: ${teacherQuestionnaire.areasOfNeed}.`
      : "";

    plaafpSections.academic = [
      performanceSummary,
      teacherObservationsText,
      teacherStrengthsText,
      teacherNeedsText,
      currentIep?.plaafpAcademic ? `Previous PLAAFP (Academic): ${currentIep.plaafpAcademic}` : "",
    ].filter(Boolean).join(" ");

    plaafpSections.behavioral = [
      teacherQuestionnaire?.behavioralObservations
        ? `Behavioral observations: ${teacherQuestionnaire.behavioralObservations}`
        : "",
      teacherQuestionnaire?.socialEmotional
        ? `Social-emotional functioning: ${teacherQuestionnaire.socialEmotional}`
        : "",
      currentIep?.plaafpBehavioral ? `Previous PLAAFP (Behavioral): ${currentIep.plaafpBehavioral}` : "",
    ].filter(Boolean).join(" ") || `${student.firstName}'s behavioral functioning will be reviewed by the IEP Team.`;

    plaafpSections.communication = [
      teacherQuestionnaire?.communicationSkills
        ? `Communication skills: ${teacherQuestionnaire.communicationSkills}`
        : "",
      currentIep?.plaafpCommunication ? `Previous PLAAFP (Communication): ${currentIep.plaafpCommunication}` : "",
    ].filter(Boolean).join(" ") || `${student.firstName}'s communication needs will be reviewed by the IEP Team.`;

    plaafpSections.parentInput = [parentStrengthsText, parentConcernsText, parentPrioritiesText].filter(Boolean).join(" ");

    plaafpSections.studentVoice = parentQuestionnaire?.studentGoals
      ? `Student expressed: ${parentQuestionnaire.studentGoals}`
      : teacherQuestionnaire?.studentSelfAdvocacy
      ? `Self-advocacy: ${teacherQuestionnaire.studentSelfAdvocacy}`
      : "";

    const additionalGoalSuggestions: Array<{ goalArea: string; suggestedGoal: string; rationale: string; source: string }> = [];

    if (parentQuestionnaire?.newGoalAreas) {
      const areas = parentQuestionnaire.newGoalAreas.split(",").map((s: string) => s.trim()).filter(Boolean);
      areas.forEach((area: string) => {
        additionalGoalSuggestions.push({
          goalArea: area,
          suggestedGoal: `Student will demonstrate improved skills in ${area}, as measured by data collection and progress monitoring.`,
          rationale: `Requested by parent/guardian for the ${nyear.label} school year.`,
          source: "parent",
        });
      });
    }

    if (teacherQuestionnaire?.recommendedNewGoals) {
      const goals2 = teacherQuestionnaire.recommendedNewGoals.split("\n").filter((s: string) => s.trim());
      goals2.forEach((g: string) => {
        additionalGoalSuggestions.push({
          goalArea: "Teacher Recommended",
          suggestedGoal: g.trim(),
          rationale: "Recommended by the IEP service provider based on ongoing observations.",
          source: "teacher",
        });
      });
    }

    let transitionPlan = null;
    if (includeTransition || (age !== null && age >= 14)) {
      const domains: Record<string, { goal: string; services: string; assessment: string }> = {};

      if (transitionInput?.employment) {
        domains["Employment / Vocational"] = {
          goal: transitionInput.employment.goal || `${student.firstName} will explore vocational interests and develop pre-employment skills.`,
          services: transitionInput.employment.services || "Vocational assessment, career exploration activities",
          assessment: transitionInput.employment.assessment || "Student interest inventory, situational assessment",
        };
      } else {
        domains["Employment / Vocational"] = {
          goal: `${student.firstName} will identify vocational interests and demonstrate work-readiness skills.`,
          services: "Career counseling, vocational assessment",
          assessment: "Transition interest inventory",
        };
      }

      if (transitionInput?.postSecondary) {
        domains["Post-Secondary Education / Training"] = {
          goal: transitionInput.postSecondary.goal || `${student.firstName} will research and identify post-secondary education or training options aligned with career goals.`,
          services: transitionInput.postSecondary.services || "Guidance counseling, college visits",
          assessment: "Aptitude testing, academic assessment",
        };
      } else {
        domains["Post-Secondary Education / Training"] = {
          goal: `${student.firstName} will identify and explore post-secondary education or training programs aligned with interests and abilities.`,
          services: "School counselor meetings, agency linkages",
          assessment: "Academic achievement testing",
        };
      }

      if (age !== null && age >= 16) {
        domains["Independent Living"] = {
          goal: transitionInput?.independentLiving?.goal
            || `${student.firstName} will demonstrate functional independent living skills in the areas of self-care, household management, and community safety.`,
          services: transitionInput?.independentLiving?.services || "Life skills instruction, community-based training",
          assessment: "Adaptive behavior assessment, functional skills evaluation",
        };
      }

      transitionPlan = {
        studentAge: age,
        plannedGraduationYear: age ? new Date().getFullYear() + Math.max(0, 22 - age) : null,
        domains,
        agencyLinkages: transitionInput?.agencyLinkages || "Department of Developmental Services (DDS), Mass Rehab Commission (MRC)",
        parentTransitionConcerns: parentQuestionnaire?.transitionConcerns || null,
        teacherTransitionNotes: teacherQuestionnaire?.transitionNotes || null,
      };
    }

    const accommodationRecs = accommodations.map(a => ({
      category: a.category,
      description: a.description,
      setting: a.setting,
      action: "continue" as const,
      rationale: "Accommodation has been in place and supports student access to the curriculum.",
    }));

    if (teacherQuestionnaire?.recommendedAccommodations) {
      const newAccomms = teacherQuestionnaire.recommendedAccommodations.split("\n").filter((s: string) => s.trim());
      newAccomms.forEach((a: string) => {
        accommodationRecs.push({
          category: "Teacher Recommended",
          description: a.trim(),
          setting: "All settings",
          action: "continue" as const,
          rationale: "New accommodation recommended by teacher based on current observations.",
        });
      });
    }

    const teamNotes: string[] = [];
    if (masteredCount > 0) teamNotes.push(`${masteredCount} goal(s) have been mastered — the team should develop new advanced goals for these areas.`);
    if (ipCount > 0) teamNotes.push(`${ipCount} goal(s) show insufficient progress — the team should review instructional methodology and consider program modifications.`);
    if (serviceRecs.some(s => s.action === "review")) teamNotes.push("One or more services had compliance concerns — the team should discuss scheduling and delivery barriers.");
    if (parentQuestionnaire?.primaryConcerns) teamNotes.push(`Parent/guardian raised the following concern for team discussion: ${parentQuestionnaire.primaryConcerns}`);
    if (teacherQuestionnaire?.teamDiscussionTopics) teamNotes.push(`Teacher requests the following team discussion: ${teacherQuestionnaire.teamDiscussionTopics}`);

    res.json({
      studentName: `${student.firstName} ${student.lastName}`,
      studentId,
      generatedFor: nyear.label,
      iepStartDate: nyear.start,
      iepEndDate: nyear.end,
      plaafp: plaafpSections,
      goalRecommendations: goalRecs,
      additionalGoalSuggestions,
      serviceRecommendations: serviceRecs,
      accommodationRecommendations: accommodationRecs,
      transitionPlan,
      teamDiscussionNotes: teamNotes,
      generatedAt: new Date().toISOString(),
      disclaimer: "This is an AI-assisted draft. All recommendations must be reviewed and approved by the IEP Team. The IEP Team has final authority over all decisions. This document does not constitute a finalized IEP.",
    });
  } catch (e: any) {
    console.error("IEP builder generate error:", e);
    res.status(500).json({ error: "Failed to generate IEP draft" });
  }
});

export default router;
