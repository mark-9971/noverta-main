import { db } from "./index";
import { studentsTable } from "./schema/students";
import { iepDocumentsTable } from "./schema/iepDocuments";
import { iepGoalsTable } from "./schema/iepGoals";
import { behaviorTargetsTable } from "./schema/behaviorTargets";
import { programTargetsTable } from "./schema/programTargets";
import { dataSessionsTable } from "./schema/dataSessions";
import { behaviorDataTable } from "./schema/behaviorData";
import { programDataTable } from "./schema/programData";
import { sessionLogsTable } from "./schema/sessionLogs";
import { sessionGoalDataTable } from "./schema/sessionGoalData";
import { serviceRequirementsTable } from "./schema/serviceRequirements";
import { staffTable } from "./schema/staff";
import { eq, and, isNull, sql } from "drizzle-orm";

const ACADEMIC_GOALS = [
  {
    goalArea: "Reading",
    goals: [
      {
        annualGoal: "Given grade-level text, student will read with fluency and accuracy at 95% or above, improving from a baseline of 78%, as measured by curriculum-based assessments over 3 consecutive probes.",
        baseline: "78% accuracy on grade-level passages",
        targetCriterion: "95% accuracy over 3 consecutive probes",
        measurementMethod: "Curriculum-based measurement (CBM) reading probes",
        programName: "Reading Fluency & Accuracy",
        domain: "academic",
        masteryCriterion: 95,
      },
      {
        annualGoal: "Student will answer comprehension questions about grade-level texts with 80% accuracy across fiction and non-fiction genres, as measured by teacher-created assessments.",
        baseline: "55% accuracy on comprehension questions",
        targetCriterion: "80% accuracy across 3 consecutive assessments",
        measurementMethod: "Teacher-created comprehension assessments",
        programName: "Reading Comprehension",
        domain: "academic",
        masteryCriterion: 80,
      },
    ],
  },
  {
    goalArea: "Math",
    goals: [
      {
        annualGoal: "Student will solve multi-step word problems involving addition, subtraction, multiplication, and division with 85% accuracy, improving from a baseline of 50%, as measured by weekly math probes.",
        baseline: "50% accuracy on multi-step word problems",
        targetCriterion: "85% accuracy over 3 consecutive probes",
        measurementMethod: "Weekly math computation and word problem probes",
        programName: "Math Problem Solving",
        domain: "academic",
        masteryCriterion: 85,
      },
      {
        annualGoal: "Student will demonstrate mastery of grade-level math computation (including fractions and decimals) with 90% accuracy as measured by curriculum-based math assessments.",
        baseline: "62% accuracy on grade-level computation",
        targetCriterion: "90% accuracy over 3 consecutive assessments",
        measurementMethod: "Curriculum-based math assessments",
        programName: "Math Computation",
        domain: "academic",
        masteryCriterion: 90,
      },
    ],
  },
  {
    goalArea: "Writing",
    goals: [
      {
        annualGoal: "Student will write a 5-paragraph essay with clear thesis, supporting details, and conclusion, scoring at least 4/5 on a rubric, improving from a baseline of 2/5, as measured by monthly writing samples.",
        baseline: "2/5 on writing rubric",
        targetCriterion: "4/5 on rubric over 3 consecutive samples",
        measurementMethod: "Monthly writing samples scored on rubric",
        programName: "Written Expression",
        domain: "academic",
        masteryCriterion: 80,
      },
    ],
  },
];

const BEHAVIOR_GOAL_TEMPLATES = [
  {
    goalArea: "Behavior",
    annualGoal: "Student will reduce instances of off-task behavior (leaving seat, talking to peers during instruction) from an average of 12 per class period to no more than 3, as measured by daily behavior tracking.",
    baseline: "12 instances per class period",
    targetCriterion: "3 or fewer instances per class period over 5 consecutive days",
    measurementMethod: "Daily frequency count by staff",
    behaviorName: "Off-Task Behavior",
    measurementType: "frequency" as const,
    targetDirection: "decrease" as const,
    baselineValue: "12",
    goalValue: "3",
  },
  {
    goalArea: "Behavior",
    annualGoal: "Student will increase on-task engagement during independent work from 40% of intervals to 85% of intervals, as measured by 10-minute interval recording across 3 consecutive observation sessions.",
    baseline: "40% of intervals on-task",
    targetCriterion: "85% of intervals on-task over 3 sessions",
    measurementMethod: "10-minute interval recording",
    behaviorName: "On-Task Engagement",
    measurementType: "percentage" as const,
    targetDirection: "increase" as const,
    baselineValue: "40",
    goalValue: "85",
  },
  {
    goalArea: "Behavior",
    annualGoal: "Student will use appropriate coping strategies (deep breathing, requesting a break, using a fidget) when frustrated, reducing verbal outbursts from 8 per day to 2 or fewer, as measured by daily behavior logs.",
    baseline: "8 verbal outbursts per day",
    targetCriterion: "2 or fewer verbal outbursts per day over 10 consecutive school days",
    measurementMethod: "Daily behavior log",
    behaviorName: "Verbal Outbursts",
    measurementType: "frequency" as const,
    targetDirection: "decrease" as const,
    baselineValue: "8",
    goalValue: "2",
  },
];

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function getSchoolDays(startDate: Date, endDate: Date): string[] {
  const days: string[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) {
      days.push(current.toISOString().slice(0, 10));
    }
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

async function seed() {
  console.log("Starting academic & behavior goal seed...");

  const students = await db
    .select({ id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName })
    .from(studentsTable)
    .where(and(eq(studentsTable.status, "active"), isNull(studentsTable.deletedAt)));

  const staffList = await db
    .select({ id: staffTable.id })
    .from(staffTable)
    .where(isNull(staffTable.deletedAt));
  const staffIds = staffList.map((s) => s.id);

  const schoolDays = getSchoolDays(new Date("2025-09-08"), new Date("2026-04-15"));

  console.log(`Found ${students.length} active students, ${schoolDays.length} school days`);

  for (const student of students) {
    console.log(`Processing ${student.firstName} ${student.lastName} (ID: ${student.id})...`);

    const existingIep = await db
      .select()
      .from(iepDocumentsTable)
      .where(and(eq(iepDocumentsTable.studentId, student.id), eq(iepDocumentsTable.active, true), eq(iepDocumentsTable.status, "active")))
      .limit(1);

    let iepDocId: number;
    if (existingIep.length > 0) {
      iepDocId = existingIep[0].id;
    } else {
      const [newIep] = await db
        .insert(iepDocumentsTable)
        .values({
          studentId: student.id,
          iepStartDate: "2025-09-01",
          iepEndDate: "2026-08-31",
          status: "active",
          iepType: "annual",
          active: true,
          schoolYearId: 3,
        })
        .returning();
      iepDocId = newIep.id;
    }

    const existingGoalAreas = await db
      .select({ goalArea: iepGoalsTable.goalArea })
      .from(iepGoalsTable)
      .where(and(eq(iepGoalsTable.studentId, student.id), eq(iepGoalsTable.active, true)));
    const existingAreas = new Set(existingGoalAreas.map((g) => g.goalArea));

    const existingGoalCount = existingGoalAreas.length;
    let goalNumber = existingGoalCount + 1;

    const newProgramTargetIds: number[] = [];
    const newBehaviorTargetIds: number[] = [];
    const newGoalIds: number[] = [];

    for (const areaTemplate of ACADEMIC_GOALS) {
      if (existingAreas.has(areaTemplate.goalArea)) continue;

      for (const goalTmpl of areaTemplate.goals) {
        const [pt] = await db
          .insert(programTargetsTable)
          .values({
            studentId: student.id,
            name: goalTmpl.programName,
            programType: "discrete_trial",
            domain: goalTmpl.domain,
            masteryCriterionPercent: goalTmpl.masteryCriterion,
            masteryCriterionSessions: 3,
            active: true,
          })
          .returning();
        newProgramTargetIds.push(pt.id);

        const [goal] = await db
          .insert(iepGoalsTable)
          .values({
            studentId: student.id,
            goalArea: areaTemplate.goalArea,
            goalNumber: goalNumber++,
            annualGoal: goalTmpl.annualGoal,
            baseline: goalTmpl.baseline,
            targetCriterion: goalTmpl.targetCriterion,
            measurementMethod: goalTmpl.measurementMethod,
            serviceArea: "academic",
            programTargetId: pt.id,
            iepDocumentId: iepDocId,
            status: "active",
            active: true,
          })
          .returning();
        newGoalIds.push(goal.id);
      }
    }

    const hasBehaviorGoal = existingAreas.has("Behavior") || existingAreas.has("Behavior/ABA");
    if (!hasBehaviorGoal) {
      const numBehaviorGoals = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < numBehaviorGoals && i < BEHAVIOR_GOAL_TEMPLATES.length; i++) {
        const tmpl = BEHAVIOR_GOAL_TEMPLATES[i];

        const [bt] = await db
          .insert(behaviorTargetsTable)
          .values({
            studentId: student.id,
            name: tmpl.behaviorName,
            measurementType: tmpl.measurementType,
            targetDirection: tmpl.targetDirection,
            baselineValue: tmpl.baselineValue,
            goalValue: tmpl.goalValue,
            active: true,
          })
          .returning();
        newBehaviorTargetIds.push(bt.id);

        const [goal] = await db
          .insert(iepGoalsTable)
          .values({
            studentId: student.id,
            goalArea: "Behavior",
            goalNumber: goalNumber++,
            annualGoal: tmpl.annualGoal,
            baseline: tmpl.baseline,
            targetCriterion: tmpl.targetCriterion,
            measurementMethod: tmpl.measurementMethod,
            serviceArea: "aba",
            behaviorTargetId: bt.id,
            iepDocumentId: iepDocId,
            status: "active",
            active: true,
          })
          .returning();
        newGoalIds.push(goal.id);
      }
    }

    const allBehaviorTargets = await db
      .select()
      .from(behaviorTargetsTable)
      .where(and(eq(behaviorTargetsTable.studentId, student.id), eq(behaviorTargetsTable.active, true)));
    const allProgramTargets = await db
      .select()
      .from(programTargetsTable)
      .where(and(eq(programTargetsTable.studentId, student.id), eq(programTargetsTable.active, true)));

    const existingDataSessions = await db
      .select({ id: dataSessionsTable.id })
      .from(dataSessionsTable)
      .where(eq(dataSessionsTable.studentId, student.id));
    const existingSessionLogs = await db
      .select({ id: sessionLogsTable.id })
      .from(sessionLogsTable)
      .where(and(
        eq(sessionLogsTable.studentId, student.id),
        sql`${sessionLogsTable.sessionDate} >= '2025-09-01'`
      ));

    const targetDataSessions = Math.max(120 - existingDataSessions.length, 0);
    const targetSessionLogs = Math.max(120 - existingSessionLogs.length, 0);

    if (targetDataSessions > 0 && allBehaviorTargets.length > 0 && allProgramTargets.length > 0) {
      const availDays = [...schoolDays].sort(() => Math.random() - 0.5).slice(0, targetDataSessions);
      availDays.sort();

      const batchSize = 50;
      for (let batch = 0; batch < availDays.length; batch += batchSize) {
        const daySlice = availDays.slice(batch, batch + batchSize);
        const dsValues = daySlice.map((day) => ({
          studentId: student.id,
          staffId: staffIds[Math.floor(Math.random() * staffIds.length)],
          sessionDate: day,
          startTime: "09:00",
          endTime: "09:30",
          sessionType: "acquisition" as const,
        }));

        const insertedDs = await db.insert(dataSessionsTable).values(dsValues).returning({ id: dataSessionsTable.id });

        const behaviorRows: any[] = [];
        const programRows: any[] = [];

        for (let idx = 0; idx < insertedDs.length; idx++) {
          const ds = insertedDs[idx];
          const dayIndex = batch + idx;
          const progress = dayIndex / availDays.length;

          for (const bt of allBehaviorTargets) {
            const baseVal = parseFloat(bt.baselineValue?.toString() || "10");
            const goalVal = parseFloat(bt.goalValue?.toString() || "2");
            const direction = bt.targetDirection;

            let value: number;
            if (direction === "decrease") {
              const decay = baseVal - (baseVal - goalVal) * sigmoid((progress - 0.3) * 8);
              value = Math.max(0, Math.round(decay + randomBetween(-2, 2)));
            } else {
              const growth = goalVal * sigmoid((progress - 0.3) * 8);
              value = Math.min(100, Math.max(0, Math.round(growth + randomBetween(-3, 3))));
            }

            if (Math.random() < 0.08) {
              value = direction === "decrease"
                ? Math.round(baseVal * randomBetween(0.8, 1.2))
                : Math.round(goalVal * randomBetween(0.2, 0.4));
            }

            behaviorRows.push({
              dataSessionId: ds.id,
              behaviorTargetId: bt.id,
              value: String(Math.max(0, value)),
            });
          }

          for (const pt of allProgramTargets) {
            const masteryCrit = pt.masteryCriterionPercent || 80;
            const baselinePercent = randomBetween(20, 50);
            const currentTarget = baselinePercent + (masteryCrit - baselinePercent) * sigmoid((progress - 0.25) * 7);
            let percentCorrect = Math.min(100, Math.max(0, Math.round(currentTarget + randomBetween(-8, 8))));

            if (Math.random() < 0.05) {
              percentCorrect = Math.max(0, Math.round(percentCorrect * randomBetween(0.3, 0.6)));
            }

            const trialsTotal = [10, 12, 15, 20][Math.floor(Math.random() * 4)];
            const trialsCorrect = Math.round(trialsTotal * percentCorrect / 100);

            programRows.push({
              dataSessionId: ds.id,
              programTargetId: pt.id,
              trialsCorrect,
              trialsTotal,
              percentCorrect: String(percentCorrect),
              promptLevelUsed: percentCorrect > 70 ? "independent" : percentCorrect > 50 ? "verbal" : "physical",
            });
          }
        }

        if (behaviorRows.length > 0) {
          for (let i = 0; i < behaviorRows.length; i += 200) {
            await db.insert(behaviorDataTable).values(behaviorRows.slice(i, i + 200));
          }
        }
        if (programRows.length > 0) {
          for (let i = 0; i < programRows.length; i += 200) {
            await db.insert(programDataTable).values(programRows.slice(i, i + 200));
          }
        }
      }
    }

    if (targetSessionLogs > 0) {
      const svcReqs = await db
        .select()
        .from(serviceRequirementsTable)
        .where(and(eq(serviceRequirementsTable.studentId, student.id), eq(serviceRequirementsTable.active, true)));

      if (svcReqs.length > 0) {
        const availDays = [...schoolDays].sort(() => Math.random() - 0.5).slice(0, targetSessionLogs);
        availDays.sort();

        const allGoals = await db
          .select({ id: iepGoalsTable.id })
          .from(iepGoalsTable)
          .where(and(eq(iepGoalsTable.studentId, student.id), eq(iepGoalsTable.active, true)));

        const sessionBatch: any[] = [];
        for (const day of availDays) {
          const svc = svcReqs[Math.floor(Math.random() * svcReqs.length)];
          const duration = [20, 25, 30, 45, 60][Math.floor(Math.random() * 5)];
          const isMissed = Math.random() < 0.05;
          sessionBatch.push({
            studentId: student.id,
            serviceTypeId: svc.serviceTypeId,
            serviceRequirementId: svc.id,
            staffId: staffIds[Math.floor(Math.random() * staffIds.length)],
            sessionDate: day,
            durationMinutes: isMissed ? 0 : duration,
            status: isMissed ? "missed" : "completed",
            notes: isMissed ? "Student absent" : null,
            deliveryMode: "in_person",
          });
        }

        for (let i = 0; i < sessionBatch.length; i += 100) {
          const inserted = await db.insert(sessionLogsTable).values(sessionBatch.slice(i, i + 100)).returning({ id: sessionLogsTable.id });

          const goalDataRows: any[] = [];
          for (const sl of inserted) {
            if (allGoals.length > 0) {
              const numGoals = Math.min(1 + Math.floor(Math.random() * 2), allGoals.length);
              const shuffled = [...allGoals].sort(() => Math.random() - 0.5).slice(0, numGoals);
              for (const g of shuffled) {
                goalDataRows.push({
                  sessionLogId: sl.id,
                  iepGoalId: g.id,
                  notes: null,
                });
              }
            }
          }
          if (goalDataRows.length > 0) {
            for (let j = 0; j < goalDataRows.length; j += 200) {
              await db.insert(sessionGoalDataTable).values(goalDataRows.slice(j, j + 200));
            }
          }
        }
      }
    }

    console.log(
      `  ${student.firstName}: +${newProgramTargetIds.length} program targets, +${newBehaviorTargetIds.length} behavior targets, ` +
      `+${newGoalIds.length} goals, +${targetDataSessions} data sessions, +${targetSessionLogs} session logs`
    );
  }

  console.log("\nSeed complete!");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
