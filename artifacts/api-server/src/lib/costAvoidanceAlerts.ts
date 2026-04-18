import { db } from "@workspace/db";
import {
  studentsTable,
  serviceRequirementsTable,
  serviceTypesTable,
  serviceRateConfigsTable,
  complianceEventsTable,
  evaluationReferralsTable,
  iepDocumentsTable,
  teamMeetingsTable,
  sessionLogsTable,
  alertsTable,
  schoolsTable,
  districtsTable,
  staffTable,
  communicationEventsTable,
} from "@workspace/db/schema";
import { eq, and, sql, gte, lte, isNull, inArray, ne, desc } from "drizzle-orm";
import { sendEmail, buildCostAvoidanceRiskEmail } from "./email";

type UrgencyWindow = "overdue" | "7" | "14" | "30";

interface AlertableRisk {
  studentId: number;
  studentName: string;
  staffId: number | null;
  urgency: "critical" | "high" | "medium";
  category: string;
  dedupeKey: string;
  title: string;
  actionNeeded: string;
  daysRemaining: number;
  // Dollar exposure is only set when a real billing rate is configured.
  // For non-service risks (eval/IEP) this is always null and the alert
  // message uses a non-dollar urgency framing instead.
  estimatedExposure: number | null;
  exposureBasis: string;
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
  let totalEmailsSent = 0;

  for (const district of districts) {
    const { created, skipped, emailsSent } = await generateAlertsForDistrict(district.id);
    totalCreated += created;
    totalSkipped += skipped;
    totalEmailsSent += emailsSent;
  }

  console.log(`[CostAvoidance] Alert generation complete: ${totalCreated} created, ${totalSkipped} skipped, ${totalEmailsSent} critical emails sent`);
}

export async function generateAlertsForDistrict(districtId: number): Promise<{ created: number; skipped: number; emailsSent: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const activeStudents = await db.select({
    id: studentsTable.id,
    firstName: studentsTable.firstName,
    lastName: studentsTable.lastName,
    caseManagerId: studentsTable.caseManagerId,
  })
    .from(studentsTable)
    .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .where(and(
      eq(studentsTable.status, "active"),
      eq(schoolsTable.districtId, districtId),
    ));

  if (activeStudents.length === 0) return { created: 0, skipped: 0, emailsSent: 0 };

  const studentIds = activeStudents.map(s => s.id);
  const studentCaseManagers = new Map(activeStudents.map(s => [s.id, s.caseManagerId]));
  const studentNames = new Map(activeStudents.map(s => [s.id, `${s.firstName} ${s.lastName}`]));

  const risks: AlertableRisk[] = [];

  await collectEvaluationRisks(risks, studentIds, studentCaseManagers, studentNames, today);
  await collectServiceShortfallRisks(risks, studentIds, studentCaseManagers, studentNames, today, districtId);
  await collectIepAnnualReviewRisks(risks, studentIds, studentCaseManagers, studentNames, today, horizon);

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

  // Rate-limit: fetch communication events for cost avoidance risk emails sent
  // in the last 7 days so we can avoid flooding the same staff member.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  // Only count successfully accepted/delivered emails toward the rate limit.
  // Failed or not_configured events should not suppress retry emails.
  const recentEmailEvents = await db.select({
    metadata: communicationEventsTable.metadata,
  })
    .from(communicationEventsTable)
    .where(and(
      eq(communicationEventsTable.type, "cost_avoidance_risk_alert"),
      gte(communicationEventsTable.createdAt, sevenDaysAgo),
      inArray(communicationEventsTable.status, ["accepted", "delivered", "sent"]),
    ));

  const recentlyEmailedBaseKeys = new Set<string>();
  for (const ev of recentEmailEvents) {
    const meta = ev.metadata as Record<string, unknown> | null;
    if (meta?.riskBaseKey && typeof meta.riskBaseKey === "string") {
      recentlyEmailedBaseKeys.add(meta.riskBaseKey);
    }
  }

  // Collect staff info for email lookup
  const staffEmailCache = new Map<number, { name: string; email: string | null; receiveRiskAlerts: boolean }>();

  const appBaseUrl = process.env.APP_BASE_URL ?? null;

  let created = 0;
  let skipped = 0;
  let emailsSent = 0;

  for (const risk of risks) {
    if (existingKeys.has(risk.dedupeKey)) {
      skipped++;
      continue;
    }

    const exposureText = risk.estimatedExposure != null
      ? `Est. exposure: $${risk.estimatedExposure.toLocaleString()}`
      : risk.exposureBasis;
    const message = `[Cost Avoidance] ${risk.title} — ${exposureText} [dedupe:${risk.dedupeKey}]`;

    const [inserted] = await db.insert(alertsTable).values({
      type: "cost_avoidance_risk",
      severity: risk.urgency,
      studentId: risk.studentId,
      staffId: risk.staffId,
      message,
      suggestedAction: risk.actionNeeded,
      resolved: false,
    }).returning({ id: alertsTable.id });

    created++;
    existingKeys.add(risk.dedupeKey);

    // Send email only for critical risks to responsible staff member
    if (risk.urgency !== "critical" || !risk.staffId) continue;

    // Derive the base key (strip urgency window suffix) for 7-day rate limiting
    const riskBaseKey = risk.dedupeKey.replace(/:[^:]+$/, "");
    if (recentlyEmailedBaseKeys.has(riskBaseKey)) continue;

    // Look up staff email (cache to avoid repeat queries)
    if (!staffEmailCache.has(risk.staffId)) {
      const [staffRow] = await db.select({
        firstName: staffTable.firstName,
        lastName: staffTable.lastName,
        email: staffTable.email,
        receiveRiskAlerts: staffTable.receiveRiskAlerts,
      }).from(staffTable).where(eq(staffTable.id, risk.staffId));
      if (staffRow) {
        staffEmailCache.set(risk.staffId, {
          name: `${staffRow.firstName} ${staffRow.lastName}`,
          email: staffRow.email,
          receiveRiskAlerts: staffRow.receiveRiskAlerts,
        });
      }
    }

    const staffInfo = staffEmailCache.get(risk.staffId);
    if (!staffInfo?.email) continue;
    // Respect the staff member's opt-out preference
    if (staffInfo.receiveRiskAlerts === false) continue;

    const { subject, html, text } = buildCostAvoidanceRiskEmail({
      staffName: staffInfo.name,
      studentName: risk.studentName,
      studentId: risk.studentId,
      riskTitle: risk.title,
      riskDescription: risk.exposureBasis,
      daysRemaining: risk.daysRemaining,
      estimatedExposure: risk.estimatedExposure,
      exposureBasis: risk.exposureBasis,
      actionNeeded: risk.actionNeeded,
      category: risk.category,
      appBaseUrl: appBaseUrl ?? undefined,
    });

    const emailResult = await sendEmail({
      studentId: risk.studentId,
      type: "cost_avoidance_risk_alert",
      subject,
      bodyHtml: html,
      bodyText: text,
      toEmail: staffInfo.email,
      toName: staffInfo.name,
      staffId: risk.staffId,
      linkedAlertId: inserted?.id,
      metadata: { riskBaseKey, dedupeKey: risk.dedupeKey, category: risk.category },
    });

    // Only suppress future emails for this risk if the provider accepted the send.
    // A failed or not_configured result leaves the base key unclaimed so the
    // next alert generation run can retry delivery.
    if (emailResult.success) {
      recentlyEmailedBaseKeys.add(riskBaseKey);
      emailsSent++;
    }
  }

  return { created, skipped, emailsSent };
}

async function collectEvaluationRisks(
  risks: AlertableRisk[],
  studentIds: number[],
  caseManagers: Map<number, number | null>,
  studentNames: Map<number, string>,
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

    risks.push({
      studentId: ref.studentId,
      studentName: studentNames.get(ref.studentId) ?? "Unknown Student",
      staffId: ref.assignedEvaluatorId || caseManagers.get(ref.studentId) || null,
      urgency,
      category: "evaluation_deadline",
      dedupeKey: `eval:${ref.studentId}:${ref.id}:${window}`,
      title: overdue ? `Evaluation ${absDays} days overdue` : `Evaluation deadline in ${days} days`,
      actionNeeded: overdue ? "Complete evaluation immediately" : "Ensure evaluation is on track",
      daysRemaining: days,
      estimatedExposure: null,
      exposureBasis: overdue
        ? `${absDays} days past statutory evaluation deadline`
        : `Evaluation due in ${days} days`,
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
      studentName: studentNames.get(ce.studentId) ?? "Unknown Student",
      staffId: caseManagers.get(ce.studentId) || null,
      urgency,
      category: "evaluation_deadline",
      dedupeKey: `ce-eval:${ce.studentId}:${ce.id}:${window}`,
      title: overdue ? `${ce.title || ce.eventType} ${absDays} days overdue` : `${ce.title || ce.eventType} due in ${days} days`,
      actionNeeded: overdue ? "Schedule and complete evaluation immediately" : "Ensure evaluation is progressing on schedule",
      daysRemaining: days,
      estimatedExposure: null,
      exposureBasis: overdue
        ? `${absDays} days past statutory ${ce.eventType.replace(/_/g, " ")} deadline`
        : `${ce.eventType.replace(/_/g, " ")} due in ${days} days`,
    });
  }
}

const SYSTEM_DEFAULT_HOURLY_RATE = 75;

async function collectServiceShortfallRisks(
  risks: AlertableRisk[],
  studentIds: number[],
  caseManagers: Map<number, number | null>,
  studentNames: Map<number, string>,
  today: string,
  districtId: number,
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

  // Load global service type catalog and district-specific rate overrides in parallel.
  const [serviceTypes, districtRateRows] = await Promise.all([
    db.select({
      id: serviceTypesTable.id,
      name: serviceTypesTable.name,
      defaultBillingRate: serviceTypesTable.defaultBillingRate,
    }).from(serviceTypesTable),

    db.select({
      serviceTypeId: serviceRateConfigsTable.serviceTypeId,
      inHouseRate: serviceRateConfigsTable.inHouseRate,
      contractedRate: serviceRateConfigsTable.contractedRate,
    }).from(serviceRateConfigsTable)
      .where(eq(serviceRateConfigsTable.districtId, districtId))
      .orderBy(desc(serviceRateConfigsTable.effectiveDate)),
  ]);

  // Most-recent district rate per service type.
  const districtRateMap = new Map<number, { inHouseRate: string | null; contractedRate: string | null }>();
  for (const r of districtRateRows) {
    if (!districtRateMap.has(r.serviceTypeId)) {
      districtRateMap.set(r.serviceTypeId, { inHouseRate: r.inHouseRate, contractedRate: r.contractedRate });
    }
  }

  const svcMap = new Map(serviceTypes.map(t => {
    const dr = districtRateMap.get(t.id);
    const inHouse = dr?.inHouseRate ? parseFloat(dr.inHouseRate) : NaN;
    const contracted = dr?.contractedRate ? parseFloat(dr.contractedRate) : NaN;
    const global = t.defaultBillingRate ? parseFloat(t.defaultBillingRate) : NaN;

    let hourlyRate: number;
    let isDefaultRate: boolean;

    let rateSource: 'district' | 'catalog' | 'system';
    if (Number.isFinite(inHouse) && inHouse > 0) {
      hourlyRate = inHouse; rateSource = 'district';
    } else if (Number.isFinite(contracted) && contracted > 0) {
      hourlyRate = contracted; rateSource = 'district';
    } else if (Number.isFinite(global) && global > 0) {
      hourlyRate = global; rateSource = 'catalog';
    } else {
      hourlyRate = SYSTEM_DEFAULT_HOURLY_RATE; rateSource = 'system';
    }
    isDefaultRate = rateSource === 'system';
    return [t.id, { name: t.name, hourlyRate, isDefaultRate, rateSource }] as const;
  }));

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
    isNull(sessionLogsTable.deletedAt),
  )).groupBy(sessionLogsTable.studentId, sessionLogsTable.serviceTypeId);

  const sessionMap = new Map<string, number>();
  for (const s of sessionTotals) {
    sessionMap.set(`${s.studentId}-${s.serviceTypeId}`, s.totalMinutes);
  }

  const currentWeekStart = getWeekStart(now);

  for (const req of requirements) {
    const svcType = svcMap.get(req.serviceTypeId);
    const svcName = svcType?.name || "Unknown Service";
    const hourlyRate: number = svcType?.hourlyRate ?? SYSTEM_DEFAULT_HOURLY_RATE;
    const rateSource = svcType?.rateSource ?? 'system';

    if (req.intervalType === "weekly") {
      const weekSessionTotals = await db.select({
        totalMinutes: sql<number>`coalesce(sum(${sessionLogsTable.durationMinutes}), 0)::int`,
      }).from(sessionLogsTable).where(and(
        eq(sessionLogsTable.studentId, req.studentId),
        eq(sessionLogsTable.serviceTypeId, req.serviceTypeId),
        inArray(sessionLogsTable.status, ["completed", "makeup"]),
        gte(sessionLogsTable.sessionDate, currentWeekStart.toISOString().slice(0, 10)),
        lte(sessionLogsTable.sessionDate, today),
        isNull(sessionLogsTable.deletedAt),
      ));
      const deliveredMinutes = weekSessionTotals[0]?.totalMinutes || 0;

      const dayOfWeek = now.getDay();
      const daysLeftInWeek = Math.max(0, 5 - dayOfWeek);
      if (daysLeftInWeek <= 1 && deliveredMinutes < req.requiredMinutes * 0.5) {
        const shortfall = req.requiredMinutes - deliveredMinutes;
        if (shortfall < 15) continue;
        const estimatedExposure = Math.round((shortfall / 60) * hourlyRate);

        const weekKey = currentWeekStart.toISOString().slice(0, 10);
        risks.push({
          studentId: req.studentId,
          studentName: studentNames.get(req.studentId) ?? "Unknown Student",
          staffId: req.providerId || caseManagers.get(req.studentId) || null,
          urgency: deliveredMinutes === 0 ? "critical" : "high",
          category: "service_shortfall",
          dedupeKey: `svc-wk:${req.studentId}:${req.id}:${weekKey}`,
          title: `${svcName}: ${shortfall} min shortfall this week`,
          actionNeeded: `Schedule ${shortfall} minutes of ${svcName} immediately`,
          daysRemaining: daysLeftInWeek,
          estimatedExposure,
          exposureBasis: rateSource === 'system'
            ? `${shortfall} min shortfall × $${hourlyRate}/hr (system default rate)`
            : rateSource === 'catalog'
            ? `${shortfall} min shortfall × $${hourlyRate}/hr (catalog default rate)`
            : `${shortfall} min shortfall × $${hourlyRate}/hr (district-configured rate)`,
        });
      }
    } else {
      const deliveredMinutes = sessionMap.get(`${req.studentId}-${req.serviceTypeId}`) || 0;
      const expectedByNow = Math.round(req.requiredMinutes * monthProgress);
      const projectedDelivery = monthProgress > 0 ? Math.round(deliveredMinutes / monthProgress) : 0;
      const projectedShortfall = req.requiredMinutes - projectedDelivery;

      if (projectedShortfall > 0 && deliveredMinutes < expectedByNow * 0.85) {
        const daysLeft = daysInMonth - dayOfMonth;
        if (projectedShortfall < 15) continue;
        const estimatedExposure = Math.round((projectedShortfall / 60) * hourlyRate);

        const pctDelivered = req.requiredMinutes > 0 ? Math.round((deliveredMinutes / req.requiredMinutes) * 100) : 0;
        const urgency = pctDelivered < 30 && monthProgress > 0.5 ? "critical" as const :
                         pctDelivered < 50 && monthProgress > 0.5 ? "high" as const :
                         daysLeft <= 7 ? "high" as const : "medium" as const;

        risks.push({
          studentId: req.studentId,
          studentName: studentNames.get(req.studentId) ?? "Unknown Student",
          staffId: req.providerId || caseManagers.get(req.studentId) || null,
          urgency,
          category: "service_shortfall",
          dedupeKey: `svc-mo:${req.studentId}:${req.id}:${currentMonth}`,
          title: `${svcName}: trending ${projectedShortfall} min short`,
          actionNeeded: `Schedule additional ${svcName} sessions to close ${projectedShortfall} minute gap`,
          daysRemaining: daysLeft,
          estimatedExposure,
          exposureBasis: rateSource === 'system'
            ? `${projectedShortfall} min projected shortfall × $${hourlyRate}/hr (system default rate)`
            : rateSource === 'catalog'
            ? `${projectedShortfall} min projected shortfall × $${hourlyRate}/hr (catalog default rate)`
            : `${projectedShortfall} min projected shortfall × $${hourlyRate}/hr (district-configured rate)`,
        });
      }
    }
  }
}

async function collectIepAnnualReviewRisks(
  risks: AlertableRisk[],
  studentIds: number[],
  caseManagers: Map<number, number | null>,
  studentNames: Map<number, string>,
  today: string,
  horizon: string,
): Promise<void> {
  const activeIeps = await db.select({
    id: iepDocumentsTable.id,
    studentId: iepDocumentsTable.studentId,
    iepEndDate: iepDocumentsTable.iepEndDate,
    iepStartDate: iepDocumentsTable.iepStartDate,
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

  const completedReviews = await db.select({
    studentId: complianceEventsTable.studentId,
    completedDate: complianceEventsTable.completedDate,
  }).from(complianceEventsTable).where(and(
      inArray(complianceEventsTable.studentId, iepStudentIds),
      eq(complianceEventsTable.eventType, "annual_review"),
      eq(complianceEventsTable.status, "completed"),
    ));
  const completionsByStudent = new Map<number, string[]>();
  for (const e of completedReviews) {
    const list = completionsByStudent.get(e.studentId) || [];
    if (e.completedDate) list.push(typeof e.completedDate === "string" ? e.completedDate : new Date(e.completedDate).toISOString().slice(0, 10));
    completionsByStudent.set(e.studentId, list);
  }

  for (const iep of activeIeps) {
    if (scheduledStudents.has(iep.studentId)) continue;
    const completions = completionsByStudent.get(iep.studentId) || [];
    const hasCurrentCycleCompletion = completions.some(d => d >= (iep.iepStartDate || ""));
    if (hasCurrentCycleCompletion) continue;
    const days = daysBetween(iep.iepEndDate, today);
    const window = getUrgencyWindow(days);
    if (!window) continue;

    const urgency = window === "overdue" || window === "7" ? "critical" : window === "14" ? "high" : "medium";
    const overdue = days < 0;
    const absDays = Math.abs(days);

    risks.push({
      studentId: iep.studentId,
      studentName: studentNames.get(iep.studentId) ?? "Unknown Student",
      staffId: iep.preparedBy || caseManagers.get(iep.studentId) || null,
      urgency,
      category: "iep_annual_review",
      dedupeKey: `iep:${iep.studentId}:${iep.id}:${window}`,
      title: overdue ? `IEP annual review ${absDays} days overdue` : `IEP annual review due in ${days} days`,
      actionNeeded: overdue ? "Schedule emergency IEP team meeting immediately" : "Schedule annual review team meeting",
      daysRemaining: days,
      estimatedExposure: null,
      exposureBasis: overdue
        ? `IEP expired ${absDays} days ago — out-of-compliance for entire active service plan`
        : `Annual review window closes in ${days} days`,
    });
  }
}
