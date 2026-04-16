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

type UrgencyWindow = "overdue" | "7" | "14" | "30";

interface AlertableRisk {
  studentId: number;
  staffId: number | null;
  urgency: "critical" | "high" | "medium";
  category: string;
  dedupeKey: string;
  title: string;
  actionNeeded: string;
  estimatedExposure: number;
}

function daysBetween(dateStr: string, today: string): number {
  const d = new Date(dateStr);
  const t = new Date(today);
  return Math.ceil((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
}

function getUrgencyWindow(days: number): UrgencyWindow | null {
  if (days < 0) return "overdue";
  if (days <= 7) return "7";
  if (days <= 14) return "14";
  if (days <= 30) return "30";
  return null;
}

function getWeekStart(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
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

  const activeStudents = await db.select({
    id: studentsTable.id,
    caseManagerId: studentsTable.caseManagerId,
  })
    .from(studentsTable)
    .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .where(and(
      eq(studentsTable.status, "active"),
      eq(schoolsTable.districtId, districtId),
    ));

  if (activeStudents.length === 0) return { created: 0, skipped: 0 };

  const studentIds = activeStudents.map(s => s.id);
  const studentCaseManagers = new Map(activeStudents.map(s => [s.id, s.caseManagerId]));

  const risks: AlertableRisk[] = [];

  await collectEvaluationRisks(risks, studentIds, studentCaseManagers, today);
  await collectServiceShortfallRisks(risks, studentIds, studentCaseManagers, today);
  await collectIepAnnualReviewRisks(risks, studentIds, studentCaseManagers, today, horizon);

  const existingAlerts = await db.select({
    studentId: alertsTable.studentId,
    message: alertsTable.message,
  })
    .from(alertsTable)
    .innerJoin(studentsTable, eq(alertsTable.studentId, studentsTable.id))
    .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .where(and(
      eq(alertsTable.resolved, false),
      eq(alertsTable.type, "cost_avoidance_risk"),
      eq(schoolsTable.districtId, districtId),
    ));

  const existingKeys = new Set<string>();
  for (const a of existingAlerts) {
    const match = a.message?.match(/\[dedupe:([^\]]+)\]/);
    if (match) existingKeys.add(match[1]);
  }

  let created = 0;
  let skipped = 0;

  for (const risk of risks) {
    if (existingKeys.has(risk.dedupeKey)) {
      skipped++;
      continue;
    }

    const message = `[Cost Avoidance] ${risk.title} — Est. exposure: $${risk.estimatedExposure.toLocaleString()} [dedupe:${risk.dedupeKey}]`;

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
    existingKeys.add(risk.dedupeKey);
  }

  return { created, skipped };
}

async function collectEvaluationRisks(
  risks: AlertableRisk[],
  studentIds: number[],
  caseManagers: Map<number, number | null>,
  today: string,
): Promise<void> {
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

  const seenEvalStudents = new Set<number>();

  for (const ref of referrals) {
    if (!ref.evaluationDeadline) continue;
    const days = daysBetween(ref.evaluationDeadline, today);
    const window = getUrgencyWindow(days);
    if (!window) continue;

    seenEvalStudents.add(ref.studentId);
    const urgency = window === "overdue" || window === "7" ? "critical" : window === "14" ? "high" : "medium";
    const overdue = days < 0;
    const absDays = Math.abs(days);
    const exposure = Math.round((overdue ? Math.max(10, absDays * 0.5) : Math.max(5, (30 - days) * 0.3)) * DEFAULT_HOURLY_RATE);

    risks.push({
      studentId: ref.studentId,
      staffId: ref.assignedEvaluatorId || caseManagers.get(ref.studentId) || null,
      urgency,
      category: "evaluation_deadline",
      dedupeKey: `eval:${ref.studentId}:${ref.id}:${window}`,
      title: overdue ? `Evaluation ${absDays} days overdue` : `Evaluation deadline in ${days} days`,
      actionNeeded: overdue ? "Complete evaluation immediately" : "Ensure evaluation is on track",
      estimatedExposure: exposure,
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
  ));

  for (const ce of complianceEvals) {
    if (seenEvalStudents.has(ce.studentId)) continue;
    const days = daysBetween(ce.dueDate, today);
    const window = getUrgencyWindow(days);
    if (!window) continue;

    const urgency = window === "overdue" || window === "7" ? "critical" : window === "14" ? "high" : "medium";
    const overdue = days < 0;
    const absDays = Math.abs(days);

    risks.push({
      studentId: ce.studentId,
      staffId: caseManagers.get(ce.studentId) || null,
      urgency,
      category: "evaluation_deadline",
      dedupeKey: `ce-eval:${ce.studentId}:${ce.id}:${window}`,
      title: overdue ? `${ce.title || ce.eventType} ${absDays} days overdue` : `${ce.title || ce.eventType} due in ${days} days`,
      actionNeeded: overdue ? "Schedule and complete evaluation immediately" : "Ensure evaluation is progressing on schedule",
      estimatedExposure: Math.round((overdue ? Math.max(10, absDays * 0.5) : Math.max(5, (30 - days) * 0.3)) * DEFAULT_HOURLY_RATE),
    });
  }
}

async function collectServiceShortfallRisks(
  risks: AlertableRisk[],
  studentIds: number[],
  caseManagers: Map<number, number | null>,
  today: string,
): Promise<void> {
  const requirements = await db.select({
    id: serviceRequirementsTable.id,
    studentId: serviceRequirementsTable.studentId,
    serviceTypeId: serviceRequirementsTable.serviceTypeId,
    providerId: serviceRequirementsTable.providerId,
    requiredMinutes: serviceRequirementsTable.requiredMinutes,
    intervalType: serviceRequirementsTable.intervalType,
  }).from(serviceRequirementsTable).where(and(
    inArray(serviceRequirementsTable.studentId, studentIds),
    eq(serviceRequirementsTable.active, true),
  ));

  if (requirements.length === 0) return;

  const serviceTypes = await db.select({
    id: serviceTypesTable.id,
    name: serviceTypesTable.name,
    defaultBillingRate: serviceTypesTable.defaultBillingRate,
  }).from(serviceTypesTable);
  const svcMap = new Map(serviceTypes.map(t => [t.id, {
    name: t.name,
    hourlyRate: t.defaultBillingRate ? parseFloat(t.defaultBillingRate) : DEFAULT_HOURLY_RATE,
  }]));

  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const monthStart = `${currentMonth}-01`;
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthProgress = dayOfMonth / daysInMonth;

  const reqStudentIds = [...new Set(requirements.map(r => r.studentId))];

  const sessionTotals = await db.select({
    studentId: sessionLogsTable.studentId,
    serviceTypeId: sessionLogsTable.serviceTypeId,
    totalMinutes: sql<number>`coalesce(sum(${sessionLogsTable.durationMinutes}), 0)::int`,
  }).from(sessionLogsTable).where(and(
    inArray(sessionLogsTable.studentId, reqStudentIds),
    inArray(sessionLogsTable.status, ["completed", "makeup"]),
    gte(sessionLogsTable.sessionDate, monthStart),
    lte(sessionLogsTable.sessionDate, today),
  )).groupBy(sessionLogsTable.studentId, sessionLogsTable.serviceTypeId);

  const sessionMap = new Map<string, number>();
  for (const s of sessionTotals) {
    sessionMap.set(`${s.studentId}-${s.serviceTypeId}`, s.totalMinutes);
  }

  const currentWeekStart = getWeekStart(now);

  for (const req of requirements) {
    const svcType = svcMap.get(req.serviceTypeId);
    const svcName = svcType?.name || "Unknown Service";
    const hourlyRate = svcType?.hourlyRate || DEFAULT_HOURLY_RATE;

    if (req.intervalType === "weekly") {
      const weekSessionTotals = await db.select({
        totalMinutes: sql<number>`coalesce(sum(${sessionLogsTable.durationMinutes}), 0)::int`,
      }).from(sessionLogsTable).where(and(
        eq(sessionLogsTable.studentId, req.studentId),
        eq(sessionLogsTable.serviceTypeId, req.serviceTypeId),
        inArray(sessionLogsTable.status, ["completed", "makeup"]),
        gte(sessionLogsTable.sessionDate, currentWeekStart.toISOString().slice(0, 10)),
        lte(sessionLogsTable.sessionDate, today),
      ));
      const deliveredMinutes = weekSessionTotals[0]?.totalMinutes || 0;

      const dayOfWeek = now.getDay();
      const daysLeftInWeek = Math.max(0, 5 - dayOfWeek);
      if (daysLeftInWeek <= 1 && deliveredMinutes < req.requiredMinutes * 0.5) {
        const shortfall = req.requiredMinutes - deliveredMinutes;
        const estimatedExposure = Math.round((shortfall / 60) * hourlyRate);
        if (estimatedExposure < 10) continue;

        const weekKey = currentWeekStart.toISOString().slice(0, 10);
        risks.push({
          studentId: req.studentId,
          staffId: req.providerId || caseManagers.get(req.studentId) || null,
          urgency: deliveredMinutes === 0 ? "critical" : "high",
          category: "service_shortfall",
          dedupeKey: `svc-wk:${req.studentId}:${req.id}:${weekKey}`,
          title: `${svcName}: ${shortfall} min shortfall this week`,
          actionNeeded: `Schedule ${shortfall} minutes of ${svcName} immediately`,
          estimatedExposure,
        });
      }
    } else {
      const deliveredMinutes = sessionMap.get(`${req.studentId}-${req.serviceTypeId}`) || 0;
      const expectedByNow = Math.round(req.requiredMinutes * monthProgress);
      const projectedDelivery = monthProgress > 0 ? Math.round(deliveredMinutes / monthProgress) : 0;
      const projectedShortfall = req.requiredMinutes - projectedDelivery;

      if (projectedShortfall > 0 && deliveredMinutes < expectedByNow * 0.85) {
        const daysLeft = daysInMonth - dayOfMonth;
        const estimatedExposure = Math.round((projectedShortfall / 60) * hourlyRate);
        if (estimatedExposure < 10) continue;

        const pctDelivered = req.requiredMinutes > 0 ? Math.round((deliveredMinutes / req.requiredMinutes) * 100) : 0;
        const urgency = pctDelivered < 30 && monthProgress > 0.5 ? "critical" as const :
                         pctDelivered < 50 && monthProgress > 0.5 ? "high" as const :
                         daysLeft <= 7 ? "high" as const : "medium" as const;

        risks.push({
          studentId: req.studentId,
          staffId: req.providerId || caseManagers.get(req.studentId) || null,
          urgency,
          category: "service_shortfall",
          dedupeKey: `svc-mo:${req.studentId}:${req.id}:${currentMonth}`,
          title: `${svcName}: trending ${projectedShortfall} min short`,
          actionNeeded: `Schedule additional ${svcName} sessions to close ${projectedShortfall} minute gap`,
          estimatedExposure,
        });
      }
    }
  }
}

async function collectIepAnnualReviewRisks(
  risks: AlertableRisk[],
  studentIds: number[],
  caseManagers: Map<number, number | null>,
  today: string,
  horizon: string,
): Promise<void> {
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

  if (activeIeps.length === 0) return;

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
    const window = getUrgencyWindow(days);
    if (!window) continue;

    const urgency = window === "overdue" || window === "7" ? "critical" : window === "14" ? "high" : "medium";
    const overdue = days < 0;
    const absDays = Math.abs(days);

    risks.push({
      studentId: iep.studentId,
      staffId: iep.preparedBy || caseManagers.get(iep.studentId) || null,
      urgency,
      category: "iep_annual_review",
      dedupeKey: `iep:${iep.studentId}:${iep.id}:${window}`,
      title: overdue ? `IEP annual review ${absDays} days overdue` : `IEP annual review due in ${days} days`,
      actionNeeded: overdue ? "Schedule emergency IEP team meeting immediately" : "Schedule annual review team meeting",
      estimatedExposure: overdue ? Math.round(Math.max(2000, absDays * 100)) : Math.round(Math.max(500, (30 - days) * 50)),
    });
  }
}
