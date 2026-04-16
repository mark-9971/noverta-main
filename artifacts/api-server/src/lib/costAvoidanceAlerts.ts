import { db } from "@workspace/db";
import {
  studentsTable,
  serviceRequirementsTable,
  serviceTypesTable,
  complianceEventsTable,
  evaluationReferralsTable,
  iepDocumentsTable,
  teamMeetingsTable,
  sessionLogsTable,
  alertsTable,
  schoolsTable,
  districtsTable,
} from "@workspace/db/schema";
import { eq, and, sql, gte, lte, isNull, inArray, ne } from "drizzle-orm";

const DEFAULT_HOURLY_RATE = 75;

interface CostAvoidanceRisk {
  studentId: number;
  staffId: number | null;
  urgency: "critical" | "high" | "medium";
  title: string;
  actionNeeded: string;
  estimatedExposure: number;
  daysRemaining: number;
}

function daysBetween(dateStr: string, today: string): number {
  const d = new Date(dateStr);
  const t = new Date(today);
  return Math.ceil((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
}

export async function runCostAvoidanceAlertGeneration(): Promise<void> {
  const districts = await db.select({ id: districtsTable.id }).from(districtsTable);

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const district of districts) {
    const { created, skipped } = await generateAlertsForDistrict(district.id);
    totalCreated += created;
    totalSkipped += skipped;
  }

  console.log(`[CostAvoidance] Alert generation complete: ${totalCreated} created, ${totalSkipped} skipped`);
}

async function generateAlertsForDistrict(districtId: number): Promise<{ created: number; skipped: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const activeStudents = await db.select({ id: studentsTable.id, caseManagerId: studentsTable.caseManagerId })
    .from(studentsTable)
    .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .where(and(
      eq(studentsTable.status, "active"),
      eq(schoolsTable.districtId, districtId),
    ));

  if (activeStudents.length === 0) return { created: 0, skipped: 0 };

  const studentIds = activeStudents.map(s => s.id);
  const studentCaseManagers = new Map(activeStudents.map(s => [s.id, s.caseManagerId]));

  const risks: CostAvoidanceRisk[] = [];

  const referrals = await db.select({
    id: evaluationReferralsTable.id,
    studentId: evaluationReferralsTable.studentId,
    evaluationDeadline: evaluationReferralsTable.evaluationDeadline,
    assignedEvaluatorId: evaluationReferralsTable.assignedEvaluatorId,
  }).from(evaluationReferralsTable).where(and(
    inArray(evaluationReferralsTable.studentId, studentIds),
    inArray(evaluationReferralsTable.status, ["open", "in_progress", "pending"]),
    isNull(evaluationReferralsTable.deletedAt),
  ));

  for (const ref of referrals) {
    if (!ref.evaluationDeadline) continue;
    const days = daysBetween(ref.evaluationDeadline, today);
    if (days > 30) continue;

    const urgency = days < 0 ? "critical" : days <= 7 ? "critical" : days <= 14 ? "high" : "medium";
    const overdue = days < 0;
    const absDays = Math.abs(days);
    const exposure = Math.round((overdue ? Math.max(10, absDays * 0.5) : Math.max(5, (30 - days) * 0.3)) * DEFAULT_HOURLY_RATE);

    risks.push({
      studentId: ref.studentId,
      staffId: ref.assignedEvaluatorId || studentCaseManagers.get(ref.studentId) || null,
      urgency,
      title: overdue ? `Evaluation ${absDays} days overdue` : `Evaluation deadline in ${days} days`,
      actionNeeded: overdue ? "Complete evaluation immediately" : "Ensure evaluation is on track",
      estimatedExposure: exposure,
      daysRemaining: days,
    });
  }

  const complianceEvals = await db.select({
    id: complianceEventsTable.id,
    studentId: complianceEventsTable.studentId,
    eventType: complianceEventsTable.eventType,
    dueDate: complianceEventsTable.dueDate,
    title: complianceEventsTable.title,
  }).from(complianceEventsTable).where(and(
    inArray(complianceEventsTable.studentId, studentIds),
    inArray(complianceEventsTable.eventType, ["initial_evaluation", "reevaluation", "triennial"]),
    inArray(complianceEventsTable.status, ["upcoming", "overdue"]),
    lte(complianceEventsTable.dueDate, horizon),
  ));

  const seenEvalStudents = new Set(referrals.map(r => r.studentId));
  for (const ce of complianceEvals) {
    if (seenEvalStudents.has(ce.studentId)) continue;
    const days = daysBetween(ce.dueDate, today);
    if (days > 30) continue;

    const urgency = days < 0 ? "critical" : days <= 7 ? "critical" : days <= 14 ? "high" : "medium";
    const overdue = days < 0;
    const absDays = Math.abs(days);

    risks.push({
      studentId: ce.studentId,
      staffId: studentCaseManagers.get(ce.studentId) || null,
      urgency,
      title: overdue ? `${ce.title || ce.eventType} ${absDays} days overdue` : `${ce.title || ce.eventType} due in ${days} days`,
      actionNeeded: overdue ? "Schedule and complete evaluation immediately" : "Ensure evaluation is progressing on schedule",
      estimatedExposure: Math.round((overdue ? Math.max(10, absDays * 0.5) : Math.max(5, (30 - days) * 0.3)) * DEFAULT_HOURLY_RATE),
      daysRemaining: days,
    });
  }

  const activeIeps = await db.select({
    id: iepDocumentsTable.id,
    studentId: iepDocumentsTable.studentId,
    iepEndDate: iepDocumentsTable.iepEndDate,
    preparedBy: iepDocumentsTable.preparedBy,
  }).from(iepDocumentsTable).where(and(
    inArray(iepDocumentsTable.studentId, studentIds),
    eq(iepDocumentsTable.active, true),
    lte(iepDocumentsTable.iepEndDate, horizon),
  ));

  if (activeIeps.length > 0) {
    const iepStudentIds = [...new Set(activeIeps.map(i => i.studentId))];

    const futureMeetings = await db.select({ studentId: teamMeetingsTable.studentId })
      .from(teamMeetingsTable).where(and(
        inArray(teamMeetingsTable.studentId, iepStudentIds),
        gte(teamMeetingsTable.scheduledDate, today),
        inArray(teamMeetingsTable.meetingType, ["Annual", "Annual Review", "annual", "annual_review"]),
        ne(teamMeetingsTable.status, "cancelled"),
      ));
    const scheduledStudents = new Set(futureMeetings.map(m => m.studentId));

    const completedReviews = await db.select({ studentId: complianceEventsTable.studentId })
      .from(complianceEventsTable).where(and(
        inArray(complianceEventsTable.studentId, iepStudentIds),
        eq(complianceEventsTable.eventType, "annual_review"),
        eq(complianceEventsTable.status, "completed"),
      ));
    const completedStudents = new Set(completedReviews.map(e => e.studentId));

    for (const iep of activeIeps) {
      if (scheduledStudents.has(iep.studentId) || completedStudents.has(iep.studentId)) continue;
      const days = daysBetween(iep.iepEndDate, today);
      if (days > 30) continue;

      const urgency = days < 0 ? "critical" : days <= 7 ? "critical" : days <= 14 ? "high" : "medium";
      const overdue = days < 0;
      const absDays = Math.abs(days);

      risks.push({
        studentId: iep.studentId,
        staffId: iep.preparedBy || studentCaseManagers.get(iep.studentId) || null,
        urgency,
        title: overdue ? `IEP annual review ${absDays} days overdue` : `IEP annual review due in ${days} days`,
        actionNeeded: overdue ? "Schedule emergency IEP team meeting immediately" : "Schedule annual review team meeting",
        estimatedExposure: overdue ? Math.round(Math.max(2000, absDays * 100)) : Math.round(Math.max(500, (30 - days) * 50)),
        daysRemaining: days,
      });
    }
  }

  const existingAlerts = await db.select({ message: alertsTable.message })
    .from(alertsTable)
    .where(and(
      eq(alertsTable.resolved, false),
      eq(alertsTable.type, "cost_avoidance_risk"),
    ));
  const existingMessages = new Set(existingAlerts.map(a => a.message));

  let created = 0;
  let skipped = 0;

  for (const risk of risks) {
    const message = `[Cost Avoidance] ${risk.title} — Est. exposure: $${risk.estimatedExposure.toLocaleString()}`;
    if (existingMessages.has(message)) {
      skipped++;
      continue;
    }

    await db.insert(alertsTable).values({
      type: "cost_avoidance_risk",
      severity: risk.urgency,
      studentId: risk.studentId,
      staffId: risk.staffId,
      message,
      suggestedAction: risk.actionNeeded,
      resolved: false,
    });
    created++;
    existingMessages.add(message);
  }

  return { created, skipped };
}
