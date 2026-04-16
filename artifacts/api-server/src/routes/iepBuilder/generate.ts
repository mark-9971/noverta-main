import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, iepGoalsTable, progressReportsTable, serviceRequirementsTable,
  serviceTypesTable, iepDocumentsTable, iepAccommodationsTable, iepBuilderDraftsTable,
} from "@workspace/db";
import { eq, desc, and, asc } from "drizzle-orm";
import {
  getAge, nextSchoolYear, recommendationForGoal, getStaffIdFromReq,
} from "./shared";

const router: IRouter = Router();

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

    const staffId = getStaffIdFromReq(req);
    if (staffId) {
      db.delete(iepBuilderDraftsTable)
        .where(and(eq(iepBuilderDraftsTable.studentId, studentId), eq(iepBuilderDraftsTable.staffId, staffId)))
        .catch(() => {});
    }
  } catch (e: any) {
    console.error("IEP builder generate error:", e);
    res.status(500).json({ error: "Failed to generate IEP draft" });
  }
});

export default router;
