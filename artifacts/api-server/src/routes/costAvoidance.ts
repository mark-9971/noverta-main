import { Router } from "express";
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
  staffTable,
  alertsTable,
  costAvoidanceSnapshotsTable,
} from "@workspace/db/schema";
import { eq, and, sql, gte, lte, isNull, or, inArray, ne, desc } from "drizzle-orm";
import type { AuthedRequest } from "../middlewares/auth";
import { getEnforcedDistrictId, requireRoles } from "../middlewares/auth";
import { generateAlertsForDistrict } from "../lib/costAvoidanceAlerts";
import { captureSnapshotForDistrict } from "../lib/costAvoidanceSnapshots";

const router = Router();

function getDistrictId(req: AuthedRequest): number | null {
  return getEnforcedDistrictId(req);
}

type UrgencyLevel = "critical" | "high" | "medium" | "watch";

interface RiskItem {
  id: string;
  category: "evaluation_deadline" | "service_shortfall" | "iep_annual_review";
  urgency: UrgencyLevel;
  studentId: number;
  studentName: string;
  staffId: number | null;
  staffName: string | null;
  title: string;
  description: string;
  daysRemaining: number;
  // Dollar exposure is set for service-shortfall risks.
  // For evaluation deadline and IEP annual review risks we do NOT assign
  // a dollar number — exposureBasis carries the non-dollar signal instead.
  estimatedExposure: number | null;
  // Source of the hourly rate used in the exposure estimate:
  //   'district' = district-specific config in service_rate_configs
  //   'catalog'  = global defaultBillingRate on service_types
  //   'system'   = hardcoded $75/hr fallback
  rateSource?: 'district' | 'catalog' | 'system';
  exposureBasis: string;
  actionNeeded: string;
  serviceTypeName?: string;
  eventType?: string;
}

function getUrgency(daysRemaining: number): UrgencyLevel {
  if (daysRemaining <= 7) return "critical";
  if (daysRemaining <= 14) return "high";
  if (daysRemaining <= 30) return "medium";
  return "watch";
}

function daysBetween(dateStr: string, today: string): number {
  const d = new Date(dateStr);
  const t = new Date(today);
  return Math.ceil((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
}

router.get("/cost-avoidance/risks", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const horizon90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const risks: RiskItem[] = [];

  const activeStudentIds = await db.select({ id: studentsTable.id })
    .from(studentsTable)
    .where(and(
      eq(studentsTable.status, "active"),
      sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${districtId})`,
    ));
  const studentIdSet = new Set(activeStudentIds.map(s => s.id));
  if (studentIdSet.size === 0) {
    res.json({ risks: [], summary: emptySummary() });
    return;
  }

  const studentIdArray = [...studentIdSet];

  const [studentMap, serviceTypeMap] = await Promise.all([
    buildStudentMap(studentIdArray),
    buildServiceTypeMap(districtId),
  ]);

  const [evalRisks, serviceRisks, iepRisks] = await Promise.all([
    getEvaluationDeadlineRisks(studentIdArray, studentMap, today, horizon90),
    getServiceShortfallRisks(studentIdArray, studentMap, serviceTypeMap, today),
    getIepAnnualReviewRisks(studentIdArray, studentMap, today, horizon90),
  ]);

  risks.push(...evalRisks, ...serviceRisks, ...iepRisks);

  risks.sort((a, b) => {
    const urgencyOrder: Record<UrgencyLevel, number> = { critical: 0, high: 1, medium: 2, watch: 3 };
    const diff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (diff !== 0) return diff;
    return a.daysRemaining - b.daysRemaining;
  });

  const summary = buildSummary(risks);
  res.json({ risks, summary });
});

router.get("/cost-avoidance/summary", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const horizon90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const activeStudentIds = await db.select({ id: studentsTable.id })
    .from(studentsTable)
    .where(and(
      eq(studentsTable.status, "active"),
      sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${districtId})`,
    ));
  const studentIdSet = new Set(activeStudentIds.map(s => s.id));
  if (studentIdSet.size === 0) {
    res.json(emptySummary());
    return;
  }

  const studentIdArray = [...studentIdSet];
  const [studentMap, serviceTypeMap] = await Promise.all([
    buildStudentMap(studentIdArray),
    buildServiceTypeMap(districtId),
  ]);

  const [evalRisks, serviceRisks, iepRisks] = await Promise.all([
    getEvaluationDeadlineRisks(studentIdArray, studentMap, today, horizon90),
    getServiceShortfallRisks(studentIdArray, studentMap, serviceTypeMap, today),
    getIepAnnualReviewRisks(studentIdArray, studentMap, today, horizon90),
  ]);

  const allRisks = [...evalRisks, ...serviceRisks, ...iepRisks];
  res.json(buildSummary(allRisks));
});

router.get("/cost-avoidance/snapshots", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const weeksBack = Math.min(parseInt(String(req.query.weeks ?? "12"), 10) || 12, 52);
  const cutoff = new Date(Date.now() - weeksBack * 7 * 24 * 60 * 60 * 1000);

  const snapshots = await db.select()
    .from(costAvoidanceSnapshotsTable)
    .where(and(
      eq(costAvoidanceSnapshotsTable.districtId, districtId),
      gte(costAvoidanceSnapshotsTable.weekStart, cutoff),
    ))
    .orderBy(costAvoidanceSnapshotsTable.weekStart);

  res.json({ snapshots });
});

router.post(
  "/cost-avoidance/capture-snapshot",
  requireRoles("admin", "coordinator"),
  async (req, res): Promise<void> => {
    const districtId = getDistrictId(req as AuthedRequest);
    if (!districtId) {
      res.status(403).json({ error: "District context required" });
      return;
    }
    await captureSnapshotForDistrict(districtId);
    res.json({ ok: true });
  },
);

router.post(
  "/cost-avoidance/generate-alerts",
  requireRoles("admin", "coordinator", "case_manager"),
  async (req, res): Promise<void> => {
    const districtId = getDistrictId(req as AuthedRequest);
    if (!districtId) {
      res.status(403).json({ error: "District context required" });
      return;
    }

    const result = await generateAlertsForDistrict(districtId);
    res.json(result);
  },
);

function emptySummary() {
  return {
    totalExposure: 0,
    unpricedRiskCount: 0,
    defaultRateCount: 0,
    totalRisks: 0,
    byUrgency: {
      critical: { count: 0, exposure: 0, unpricedCount: 0 },
      high: { count: 0, exposure: 0, unpricedCount: 0 },
      medium: { count: 0, exposure: 0, unpricedCount: 0 },
      watch: { count: 0, exposure: 0, unpricedCount: 0 },
    },
    byCategory: {
      evaluation_deadline: { count: 0, exposure: 0, unpricedCount: 0 },
      service_shortfall: { count: 0, exposure: 0, unpricedCount: 0 },
      iep_annual_review: { count: 0, exposure: 0, unpricedCount: 0 },
    },
    studentsAtRisk: 0,
    rateConfigNote: null as string | null,
  };
}

function buildSummary(risks: RiskItem[]) {
  let totalExposure = 0;
  let unpricedRiskCount = 0;
  let defaultRateCount = 0;
  const byUrgency: Record<UrgencyLevel, { count: number; exposure: number; unpricedCount: number }> = {
    critical: { count: 0, exposure: 0, unpricedCount: 0 },
    high: { count: 0, exposure: 0, unpricedCount: 0 },
    medium: { count: 0, exposure: 0, unpricedCount: 0 },
    watch: { count: 0, exposure: 0, unpricedCount: 0 },
  };
  const byCategory: Record<string, { count: number; exposure: number; unpricedCount: number }> = {
    evaluation_deadline: { count: 0, exposure: 0, unpricedCount: 0 },
    service_shortfall: { count: 0, exposure: 0, unpricedCount: 0 },
    iep_annual_review: { count: 0, exposure: 0, unpricedCount: 0 },
  };

  const studentIds = new Set<number>();
  for (const r of risks) {
    byUrgency[r.urgency].count++;
    byCategory[r.category].count++;
    if (r.estimatedExposure != null) {
      totalExposure += r.estimatedExposure;
      byUrgency[r.urgency].exposure += r.estimatedExposure;
      byCategory[r.category].exposure += r.estimatedExposure;
      if (r.rateSource === 'system') defaultRateCount++;
    } else {
      unpricedRiskCount++;
      byUrgency[r.urgency].unpricedCount++;
      byCategory[r.category].unpricedCount++;
    }
    studentIds.add(r.studentId);
  }

  let rateConfigNote: string | null = null;
  if (defaultRateCount > 0) {
    rateConfigNote = `${defaultRateCount} service shortfall risk${defaultRateCount !== 1 ? "s are" : " is"} estimated using the system default rate of $${SYSTEM_DEFAULT_HOURLY_RATE}/hr. Configure district-specific rates in Settings → Billing Rates for more accurate estimates.`;
  }

  return {
    totalExposure: Math.round(totalExposure),
    unpricedRiskCount,
    defaultRateCount,
    totalRisks: risks.length,
    byUrgency,
    byCategory,
    studentsAtRisk: studentIds.size,
    rateConfigNote,
  };
}

async function buildStudentMap(ids: number[]): Promise<Map<number, { name: string; caseManagerId: number | null }>> {
  if (ids.length === 0) return new Map();
  const students = await db.select({
    id: studentsTable.id,
    firstName: studentsTable.firstName,
    lastName: studentsTable.lastName,
    caseManagerId: studentsTable.caseManagerId,
  }).from(studentsTable).where(inArray(studentsTable.id, ids));

  const map = new Map<number, { name: string; caseManagerId: number | null }>();
  for (const s of students) {
    map.set(s.id, { name: `${s.firstName} ${s.lastName}`, caseManagerId: s.caseManagerId });
  }
  return map;
}

// System-wide fallback rate used when a service type has no configured billing
// rate. Clearly labelled in exposureBasis so districts can distinguish default
// estimates from those backed by their own configured rate.
const SYSTEM_DEFAULT_HOURLY_RATE = 75;

/**
 * Build a per-service-type rate map for cost avoidance.
 * Rate priority (highest wins):
 *   1. District-specific in_house_rate from service_rate_configs (most recent effective date)
 *   2. District-specific contracted_rate from service_rate_configs
 *   3. Global defaultBillingRate on service_types (shared catalog baseline)
 *   4. System default $75/hr
 */
async function buildServiceTypeMap(
  districtId: number,
): Promise<Map<number, { name: string; hourlyRate: number; isDefaultRate: boolean; rateSource: 'district' | 'catalog' | 'system' }>> {
  const [types, districtRateRows] = await Promise.all([
    db.select({
      id: serviceTypesTable.id,
      name: serviceTypesTable.name,
      defaultBillingRate: serviceTypesTable.defaultBillingRate,
    }).from(serviceTypesTable),

    // Fetch the most recent rate config row per service type for this district.
    db.select({
      serviceTypeId: serviceRateConfigsTable.serviceTypeId,
      inHouseRate: serviceRateConfigsTable.inHouseRate,
      contractedRate: serviceRateConfigsTable.contractedRate,
      effectiveDate: serviceRateConfigsTable.effectiveDate,
    }).from(serviceRateConfigsTable)
      .where(eq(serviceRateConfigsTable.districtId, districtId))
      .orderBy(desc(serviceRateConfigsTable.effectiveDate)),
  ]);

  // Build a map of district rates keyed by serviceTypeId (most recent row wins due to ORDER BY).
  const districtRateMap = new Map<number, { inHouseRate: string | null; contractedRate: string | null }>();
  for (const r of districtRateRows) {
    if (!districtRateMap.has(r.serviceTypeId)) {
      districtRateMap.set(r.serviceTypeId, { inHouseRate: r.inHouseRate, contractedRate: r.contractedRate });
    }
  }

  const map = new Map<number, { name: string; hourlyRate: number; isDefaultRate: boolean; rateSource: 'district' | 'catalog' | 'system' }>();
  for (const t of types) {
    const districtRate = districtRateMap.get(t.id);

    // Try district-specific rates first.
    const inHouse = districtRate?.inHouseRate ? parseFloat(districtRate.inHouseRate) : NaN;
    const contracted = districtRate?.contractedRate ? parseFloat(districtRate.contractedRate) : NaN;
    const global = t.defaultBillingRate ? parseFloat(t.defaultBillingRate) : NaN;

    let hourlyRate: number;
    let rateSource: 'district' | 'catalog' | 'system';

    if (Number.isFinite(inHouse) && inHouse > 0) {
      hourlyRate = inHouse;
      rateSource = 'district';
    } else if (Number.isFinite(contracted) && contracted > 0) {
      hourlyRate = contracted;
      rateSource = 'district';
    } else if (Number.isFinite(global) && global > 0) {
      hourlyRate = global;
      rateSource = 'catalog';
    } else {
      hourlyRate = SYSTEM_DEFAULT_HOURLY_RATE;
      rateSource = 'system';
    }

    map.set(t.id, { name: t.name, hourlyRate, isDefaultRate: rateSource === 'system', rateSource });
  }
  return map;
}

async function getEvaluationDeadlineRisks(
  studentIds: number[],
  studentMap: Map<number, { name: string; caseManagerId: number | null }>,
  today: string,
  horizon: string,
): Promise<RiskItem[]> {
  const risks: RiskItem[] = [];

  const referrals = await db.select({
    id: evaluationReferralsTable.id,
    studentId: evaluationReferralsTable.studentId,
    evaluationDeadline: evaluationReferralsTable.evaluationDeadline,
    status: evaluationReferralsTable.status,
    assignedEvaluatorId: evaluationReferralsTable.assignedEvaluatorId,
  }).from(evaluationReferralsTable).where(and(
    inArray(evaluationReferralsTable.studentId, studentIds),
    inArray(evaluationReferralsTable.status, ["open", "in_progress", "pending"]),
    isNull(evaluationReferralsTable.deletedAt),
  ));

  for (const ref of referrals) {
    if (!ref.evaluationDeadline) continue;
    const days = daysBetween(ref.evaluationDeadline, today);
    if (days > 90) continue;

    const student = studentMap.get(ref.studentId);
    if (!student) continue;

    const overdue = days < 0;
    const absDays = Math.abs(days);

    risks.push({
      id: `eval-${ref.id}`,
      category: "evaluation_deadline",
      urgency: overdue ? "critical" : getUrgency(days),
      studentId: ref.studentId,
      studentName: student.name,
      staffId: ref.assignedEvaluatorId,
      staffName: null,
      title: overdue
        ? `Evaluation ${absDays} days overdue`
        : `Evaluation deadline in ${days} days`,
      description: overdue
        ? `Evaluation for ${student.name} is ${absDays} days past the deadline (${ref.evaluationDeadline}). Compensatory services likely required.`
        : `Evaluation for ${student.name} is due by ${ref.evaluationDeadline}. ${days <= 7 ? "Immediate action required." : "Schedule completion soon."}`,
      daysRemaining: days,
      estimatedExposure: null,
      exposureBasis: overdue
        ? `${absDays} days past statutory evaluation deadline`
        : `Evaluation due in ${days} days`,
      actionNeeded: overdue
        ? "Complete evaluation immediately and assess compensatory obligation"
        : "Ensure all evaluation components are scheduled and on track for completion",
      eventType: "evaluation",
    });
  }

  const complianceEvals = await db.select({
    id: complianceEventsTable.id,
    studentId: complianceEventsTable.studentId,
    eventType: complianceEventsTable.eventType,
    dueDate: complianceEventsTable.dueDate,
    status: complianceEventsTable.status,
    title: complianceEventsTable.title,
  }).from(complianceEventsTable).where(and(
    inArray(complianceEventsTable.studentId, studentIds),
    inArray(complianceEventsTable.eventType, ["initial_evaluation", "reevaluation", "triennial"]),
    inArray(complianceEventsTable.status, ["upcoming", "overdue"]),
    lte(complianceEventsTable.dueDate, horizon),
  ));

  const seenEvalStudents = new Set(risks.map(r => r.studentId));
  for (const ce of complianceEvals) {
    if (seenEvalStudents.has(ce.studentId)) continue;
    const days = daysBetween(ce.dueDate, today);
    if (days > 90) continue;

    const student = studentMap.get(ce.studentId);
    if (!student) continue;

    const overdue = days < 0;
    const absDays = Math.abs(days);

    risks.push({
      id: `ce-eval-${ce.id}`,
      category: "evaluation_deadline",
      urgency: overdue ? "critical" : getUrgency(days),
      studentId: ce.studentId,
      studentName: student.name,
      staffId: student.caseManagerId,
      staffName: null,
      title: overdue
        ? `${ce.title || ce.eventType} ${absDays} days overdue`
        : `${ce.title || ce.eventType} due in ${days} days`,
      description: `${ce.title || ce.eventType} for ${student.name} — deadline: ${ce.dueDate}`,
      daysRemaining: days,
      estimatedExposure: null,
      exposureBasis: overdue
        ? `${absDays} days past statutory ${ce.eventType.replace(/_/g, " ")} deadline`
        : `${ce.eventType.replace(/_/g, " ")} due in ${days} days`,
      actionNeeded: overdue
        ? "Schedule and complete evaluation immediately"
        : "Ensure evaluation is progressing on schedule",
      eventType: ce.eventType,
    });
  }

  return risks;
}

async function getServiceShortfallRisks(
  studentIds: number[],
  studentMap: Map<number, { name: string; caseManagerId: number | null }>,
  serviceTypeMap: Map<number, { name: string; hourlyRate: number; isDefaultRate: boolean; rateSource: 'district' | 'catalog' | 'system' }>,
  today: string,
): Promise<RiskItem[]> {
  const risks: RiskItem[] = [];

  const requirements = await db.select({
    id: serviceRequirementsTable.id,
    studentId: serviceRequirementsTable.studentId,
    serviceTypeId: serviceRequirementsTable.serviceTypeId,
    providerId: serviceRequirementsTable.providerId,
    requiredMinutes: serviceRequirementsTable.requiredMinutes,
    intervalType: serviceRequirementsTable.intervalType,
    startDate: serviceRequirementsTable.startDate,
    endDate: serviceRequirementsTable.endDate,
  }).from(serviceRequirementsTable).where(and(
    inArray(serviceRequirementsTable.studentId, studentIds),
    eq(serviceRequirementsTable.active, true),
  ));

  if (requirements.length === 0) return risks;

  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const monthStart = `${currentMonth}-01`;

  const currentWeekStart = getWeekStart(now);
  const currentWeekEnd = new Date(currentWeekStart);
  currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);

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

  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthProgress = dayOfMonth / daysInMonth;

  for (const req of requirements) {
    const student = studentMap.get(req.studentId);
    if (!student) continue;

    const svcType = serviceTypeMap.get(req.serviceTypeId);
    const svcName = svcType?.name || "Unknown Service";
    const hourlyRate: number = svcType?.hourlyRate ?? SYSTEM_DEFAULT_HOURLY_RATE;
    const rateSource = svcType?.rateSource ?? 'system';

    let requiredForPeriod = req.requiredMinutes;
    let deliveredMinutes = sessionMap.get(`${req.studentId}-${req.serviceTypeId}`) || 0;
    let expectedByNow: number;

    if (req.intervalType === "weekly") {
      requiredForPeriod = req.requiredMinutes;
      expectedByNow = requiredForPeriod;
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
      deliveredMinutes = weekSessionTotals[0]?.totalMinutes || 0;

      const dayOfWeek = now.getDay();
      const daysLeftInWeek = Math.max(0, 5 - dayOfWeek);
      if (daysLeftInWeek <= 1 && deliveredMinutes < requiredForPeriod * 0.5) {
        const shortfall = requiredForPeriod - deliveredMinutes;
        if (shortfall < 15) continue;
        const estimatedExposure = Math.round((shortfall / 60) * hourlyRate);

        risks.push({
          id: `svc-${req.id}`,
          category: "service_shortfall",
          urgency: deliveredMinutes === 0 ? "critical" : "high",
          studentId: req.studentId,
          studentName: student.name,
          staffId: req.providerId,
          staffName: null,
          title: `${svcName}: ${shortfall} min shortfall this week`,
          description: `${student.name} has received ${deliveredMinutes} of ${requiredForPeriod} required weekly minutes for ${svcName}. ${daysLeftInWeek === 0 ? "Week ends today." : `${daysLeftInWeek} day(s) remaining.`}`,
          daysRemaining: daysLeftInWeek,
          estimatedExposure,
          rateSource,
          exposureBasis: rateSource === 'system'
            ? `${shortfall} min shortfall × $${hourlyRate}/hr (system default — configure your rate in Settings → Billing Rates)`
            : rateSource === 'catalog'
            ? `${shortfall} min shortfall × $${hourlyRate}/hr (catalog default rate)`
            : `${shortfall} min shortfall × $${hourlyRate}/hr (district-configured rate)`,
          actionNeeded: `Schedule ${shortfall} minutes of ${svcName} immediately`,
          serviceTypeName: svcName,
        });
      }
    } else {
      expectedByNow = Math.round(requiredForPeriod * monthProgress);
      const projectedDelivery = monthProgress > 0 ? Math.round(deliveredMinutes / monthProgress) : 0;
      const projectedShortfall = requiredForPeriod - projectedDelivery;

      if (projectedShortfall > 0 && deliveredMinutes < expectedByNow * 0.85) {
        const daysLeft = daysInMonth - dayOfMonth;
        if (projectedShortfall < 15) continue;
        const estimatedExposure = Math.round((projectedShortfall / 60) * hourlyRate);

        const pctDelivered = requiredForPeriod > 0 ? Math.round((deliveredMinutes / requiredForPeriod) * 100) : 0;

        risks.push({
          id: `svc-${req.id}`,
          category: "service_shortfall",
          urgency: pctDelivered < 30 && monthProgress > 0.5 ? "critical" :
                   pctDelivered < 50 && monthProgress > 0.5 ? "high" :
                   daysLeft <= 7 ? "high" : "medium",
          studentId: req.studentId,
          studentName: student.name,
          staffId: req.providerId,
          staffName: null,
          title: `${svcName}: trending ${projectedShortfall} min short`,
          description: `${student.name} has ${deliveredMinutes} of ${requiredForPeriod} required monthly minutes for ${svcName} (${pctDelivered}% at ${Math.round(monthProgress * 100)}% through month). Projected shortfall: ${projectedShortfall} min.`,
          daysRemaining: daysLeft,
          estimatedExposure,
          rateSource,
          exposureBasis: rateSource === 'system'
            ? `${projectedShortfall} min projected shortfall × $${hourlyRate}/hr (system default — configure your rate in Settings → Billing Rates)`
            : rateSource === 'catalog'
            ? `${projectedShortfall} min projected shortfall × $${hourlyRate}/hr (catalog default rate)`
            : `${projectedShortfall} min projected shortfall × $${hourlyRate}/hr (district-configured rate)`,
          actionNeeded: `Schedule additional ${svcName} sessions to close ${projectedShortfall} minute gap`,
          serviceTypeName: svcName,
        });
      }
    }
  }

  return risks;
}

async function getIepAnnualReviewRisks(
  studentIds: number[],
  studentMap: Map<number, { name: string; caseManagerId: number | null }>,
  today: string,
  horizon: string,
): Promise<RiskItem[]> {
  const risks: RiskItem[] = [];

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

  if (activeIeps.length === 0) return risks;

  const iepStudentIds = [...new Set(activeIeps.map(i => i.studentId))];

  const futureMeetings = await db.select({
    studentId: teamMeetingsTable.studentId,
    scheduledDate: teamMeetingsTable.scheduledDate,
    meetingType: teamMeetingsTable.meetingType,
  }).from(teamMeetingsTable).where(and(
    inArray(teamMeetingsTable.studentId, iepStudentIds),
    gte(teamMeetingsTable.scheduledDate, today),
    inArray(teamMeetingsTable.meetingType, ["Annual", "Annual Review", "annual", "annual_review"]),
    ne(teamMeetingsTable.status, "cancelled"),
  ));

  const scheduledStudents = new Set(futureMeetings.map(m => m.studentId));

  const annualReviewEvents = await db.select({
    studentId: complianceEventsTable.studentId,
    completedDate: complianceEventsTable.completedDate,
  }).from(complianceEventsTable).where(and(
    inArray(complianceEventsTable.studentId, iepStudentIds),
    eq(complianceEventsTable.eventType, "annual_review"),
    eq(complianceEventsTable.status, "completed"),
  ));
  const completionsByStudent = new Map<number, string[]>();
  for (const e of annualReviewEvents) {
    const list = completionsByStudent.get(e.studentId) || [];
    if (e.completedDate) list.push(typeof e.completedDate === "string" ? e.completedDate : new Date(e.completedDate).toISOString().slice(0, 10));
    completionsByStudent.set(e.studentId, list);
  }

  for (const iep of activeIeps) {
    if (scheduledStudents.has(iep.studentId)) continue;
    const completions = completionsByStudent.get(iep.studentId) || [];
    const hasCurrentCycleCompletion = completions.some(d => d >= (iep.iepStartDate || ""));
    if (hasCurrentCycleCompletion) continue;

    const student = studentMap.get(iep.studentId);
    if (!student) continue;

    const days = daysBetween(iep.iepEndDate, today);
    if (days > 90) continue;

    const overdue = days < 0;
    const absDays = Math.abs(days);

    risks.push({
      id: `iep-${iep.id}`,
      category: "iep_annual_review",
      urgency: overdue ? "critical" : getUrgency(days),
      studentId: iep.studentId,
      studentName: student.name,
      staffId: iep.preparedBy || student.caseManagerId,
      staffName: null,
      title: overdue
        ? `IEP annual review ${absDays} days overdue`
        : `IEP annual review due in ${days} days — no meeting scheduled`,
      description: overdue
        ? `IEP for ${student.name} expired on ${iep.iepEndDate}. No annual review meeting has been scheduled. This is a compliance violation.`
        : `IEP for ${student.name} expires ${iep.iepEndDate}. No annual review meeting is currently scheduled.`,
      daysRemaining: days,
      estimatedExposure: null,
      exposureBasis: overdue
        ? `IEP expired ${absDays} days ago — out-of-compliance for entire active service plan`
        : `Annual review window closes in ${days} days`,
      actionNeeded: overdue
        ? "Schedule emergency IEP team meeting and notify parents immediately"
        : "Schedule annual review team meeting and send parent notice",
      eventType: "annual_review",
    });
  }

  return risks;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default router;
