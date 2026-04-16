import { db } from "@workspace/db";
import {
  parentContactsTable,
  studentsTable,
  schoolsTable,
  iepGoalsTable,
  behaviorTargetsTable,
  behaviorDataTable,
  programTargetsTable,
  programDataTable,
  dataSessionsTable,
  guardiansTable,
} from "@workspace/db";
import { eq, and, gte, sql, asc } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../../lib/minuteCalc";

export async function resolveGuardianRecipients(studentId: number) {
  const guardians = await db
    .select({
      id: guardiansTable.id,
      name: guardiansTable.name,
      relationship: guardiansTable.relationship,
      email: guardiansTable.email,
      phone: guardiansTable.phone,
      preferredContactMethod: guardiansTable.preferredContactMethod,
      contactPriority: guardiansTable.contactPriority,
      interpreterNeeded: guardiansTable.interpreterNeeded,
      language: guardiansTable.language,
    })
    .from(guardiansTable)
    .where(eq(guardiansTable.studentId, studentId))
    .orderBy(asc(guardiansTable.contactPriority), asc(guardiansTable.id));

  return guardians.map((g) => ({
    guardianId: g.id,
    name: g.name,
    relationship: g.relationship,
    email: g.email ?? null,
    phone: g.phone ?? null,
    preferredContactMethod: g.preferredContactMethod ?? "email",
    contactPriority: g.contactPriority,
    interpreterNeeded: g.interpreterNeeded,
    language: g.language ?? null,
  }));
}

export function formatContactResponse(c: any) {
  return {
    id: c.id,
    studentId: c.studentId,
    contactType: c.contactType,
    contactDate: c.contactDate,
    contactMethod: c.contactMethod,
    subject: c.subject,
    notes: c.notes ?? null,
    outcome: c.outcome ?? null,
    followUpNeeded: c.followUpNeeded ?? null,
    followUpDate: c.followUpDate ?? null,
    contactedBy: c.contactedBy ?? null,
    parentName: c.parentName ?? null,
    notificationRequired: c.notificationRequired ?? false,
    relatedAlertId: c.relatedAlertId ?? null,
    studentName: c.studentFirst ? `${c.studentFirst} ${c.studentLast}` : null,
    studentGrade: c.studentGrade ?? null,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
  };
}

export function getTrend(values: number[]): string {
  if (values.length < 4) return "insufficient_data";
  const mid = Math.floor(values.length / 2);
  const earlier = values.slice(0, mid);
  const recent = values.slice(mid);
  const earlierAvg = earlier.reduce((s, v) => s + v, 0) / earlier.length;
  const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
  const diff = recentAvg - earlierAvg;
  if (Math.abs(diff) < 0.5) return "stable";
  return diff > 0 ? "increasing" : "decreasing";
}

export async function generateProgressSummary(studentId: number, days: number) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoff = cutoffDate.toISOString().substring(0, 10);

  const [student] = await db
    .select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      grade: studentsTable.grade,
      schoolId: studentsTable.schoolId,
      schoolName: schoolsTable.name,
    })
    .from(studentsTable)
    .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
    .where(eq(studentsTable.id, studentId));

  if (!student) return null;

  const goals = await db
    .select()
    .from(iepGoalsTable)
    .where(and(eq(iepGoalsTable.studentId, studentId), eq(iepGoalsTable.active, true)))
    .orderBy(asc(iepGoalsTable.goalArea), asc(iepGoalsTable.goalNumber));

  const minuteProgress = await computeAllActiveMinuteProgress({ studentId });

  const behaviorTargets = await db.select().from(behaviorTargetsTable)
    .where(and(eq(behaviorTargetsTable.studentId, studentId), eq(behaviorTargetsTable.active, true)));

  const programTargets = await db.select().from(programTargetsTable)
    .where(and(eq(programTargetsTable.studentId, studentId), eq(programTargetsTable.active, true)));

  const btIds = behaviorTargets.map(b => b.id);
  const behaviorTrends = btIds.length > 0
    ? await db
        .select({
          behaviorTargetId: behaviorDataTable.behaviorTargetId,
          value: behaviorDataTable.value,
          sessionDate: dataSessionsTable.sessionDate,
        })
        .from(behaviorDataTable)
        .innerJoin(dataSessionsTable, eq(dataSessionsTable.id, behaviorDataTable.dataSessionId))
        .where(
          and(
            sql`${behaviorDataTable.behaviorTargetId} IN (${sql.join(btIds.map(id => sql`${id}`), sql`, `)})`,
            gte(dataSessionsTable.sessionDate, cutoff)
          )
        )
        .orderBy(asc(dataSessionsTable.sessionDate))
    : [];

  const ptIds = programTargets.map(p => p.id);
  const programTrends = ptIds.length > 0
    ? await db
        .select({
          programTargetId: programDataTable.programTargetId,
          percentCorrect: programDataTable.percentCorrect,
          sessionDate: dataSessionsTable.sessionDate,
        })
        .from(programDataTable)
        .innerJoin(dataSessionsTable, eq(dataSessionsTable.id, programDataTable.dataSessionId))
        .where(
          and(
            sql`${programDataTable.programTargetId} IN (${sql.join(ptIds.map(id => sql`${id}`), sql`, `)})`,
            gte(dataSessionsTable.sessionDate, cutoff)
          )
        )
        .orderBy(asc(dataSessionsTable.sessionDate))
    : [];

  const behaviorSummaries = behaviorTargets.map(bt => {
    const data = behaviorTrends.filter(d => d.behaviorTargetId === bt.id);
    const values = data.map(d => parseFloat(d.value || "0"));
    const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
    const recent = values.slice(-5);
    const recentAvg = recent.length > 0 ? recent.reduce((s, v) => s + v, 0) / recent.length : null;
    return {
      targetName: bt.name,
      measurementType: bt.measurementType,
      targetDirection: bt.targetDirection,
      baselineValue: bt.baselineValue,
      goalValue: bt.goalValue,
      dataPoints: values.length,
      average: avg !== null ? Math.round(avg * 100) / 100 : null,
      recentAverage: recentAvg !== null ? Math.round(recentAvg * 100) / 100 : null,
      trend: getTrend(values),
    };
  });

  const programSummaries = programTargets.map(pt => {
    const data = programTrends.filter(d => d.programTargetId === pt.id);
    const values = data.map(d => parseFloat(d.percentCorrect || "0"));
    const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
    const recent = values.slice(-5);
    const recentAvg = recent.length > 0 ? recent.reduce((s, v) => s + v, 0) / recent.length : null;
    return {
      targetName: pt.name,
      currentPromptLevel: pt.currentPromptLevel,
      masteryCriterion: pt.masteryCriterionPercent,
      dataPoints: values.length,
      averagePercent: avg !== null ? Math.round(avg * 100) / 100 : null,
      recentAveragePercent: recentAvg !== null ? Math.round(recentAvg * 100) / 100 : null,
      trend: getTrend(values),
    };
  });

  const goalSummaries = goals.map(g => ({
    id: g.id,
    goalArea: g.goalArea,
    goalNumber: g.goalNumber,
    annualGoal: g.annualGoal,
    baseline: g.baseline,
    targetCriterion: g.targetCriterion,
    measurementMethod: g.measurementMethod,
    status: g.status,
  }));

  const serviceDelivery = minuteProgress.map((p: any) => ({
    serviceType: p.serviceTypeName,
    requiredMinutes: p.requiredMinutes,
    deliveredMinutes: p.deliveredMinutes,
    remainingMinutes: p.remainingMinutes,
    percentComplete: p.percentComplete,
    riskStatus: p.riskStatus,
    intervalType: p.intervalType,
  }));

  return {
    student: {
      id: student.id,
      name: `${student.firstName} ${student.lastName}`,
      grade: student.grade,
      school: student.schoolName,
    },
    reportPeriod: { days, startDate: cutoff, endDate: new Date().toISOString().substring(0, 10) },
    generatedAt: new Date().toISOString(),
    goals: goalSummaries,
    serviceDelivery,
    behaviorData: behaviorSummaries,
    programData: programSummaries,
  };
}
