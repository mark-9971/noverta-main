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
  staffTable,
  alertsTable,
  costAvoidanceSnapshotsTable,
  districtsTable,
} from "@workspace/db/schema";
import { eq, and, sql, gte, lte, isNull, or, inArray, ne, desc } from "drizzle-orm";
import type { AuthedRequest } from "../middlewares/auth";
import { getEnforcedDistrictId, requireRoles } from "../middlewares/auth";
import { generateAlertsForDistrict } from "../lib/costAvoidanceAlerts";
import { captureSnapshotForDistrict } from "../lib/costAvoidanceSnapshots";
import { computeAllActiveMinuteProgress } from "../lib/minuteCalc";

const router = Router();

function getDistrictId(req: AuthedRequest): number | null {
  return getEnforcedDistrictId(req);
}

type UrgencyLevel = "critical" | "high" | "medium" | "watch";

// Rate sources, ordered from most to least specific.
//   'school'           = district-specific rate scoped to the student's school
//   'program'          = district-specific rate scoped to the student's program
//   'district'         = district-wide rate config for this service type
//   'catalog'          = global defaultBillingRate on service_types
//   'district_default' = district-wide default hourly rate set by admin
//   'system'           = hardcoded $75/hr fallback
type RateSource = 'school' | 'program' | 'district' | 'catalog' | 'district_default' | 'system';

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
  rateSource?: RateSource;
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
  const districtId = getDistrictId(req as unknown as AuthedRequest);
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

  const [studentMap, rateLookup] = await Promise.all([
    buildStudentMap(studentIdArray),
    buildRateLookup(districtId),
  ]);

  const [evalRisks, serviceRisks, iepRisks] = await Promise.all([
    getEvaluationDeadlineRisks(studentIdArray, studentMap, today, horizon90),
    getServiceShortfallRisks(studentIdArray, studentMap, rateLookup, today),
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
  const districtId = getDistrictId(req as unknown as AuthedRequest);
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
  const [studentMap, rateLookup] = await Promise.all([
    buildStudentMap(studentIdArray),
    buildRateLookup(districtId),
  ]);

  const [evalRisks, serviceRisks, iepRisks] = await Promise.all([
    getEvaluationDeadlineRisks(studentIdArray, studentMap, today, horizon90),
    getServiceShortfallRisks(studentIdArray, studentMap, rateLookup, today),
    getIepAnnualReviewRisks(studentIdArray, studentMap, today, horizon90),
  ]);

  const allRisks = [...evalRisks, ...serviceRisks, ...iepRisks];
  res.json(buildSummary(allRisks));
});

router.get("/cost-avoidance/snapshots", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as unknown as AuthedRequest);
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
    const districtId = getDistrictId(req as unknown as AuthedRequest);
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
    const districtId = getDistrictId(req as unknown as AuthedRequest);
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
    districtDefaultRateCount: 0,
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
  let districtDefaultRateCount = 0;
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
      if (r.rateSource === 'district_default') districtDefaultRateCount++;
    } else {
      unpricedRiskCount++;
      byUrgency[r.urgency].unpricedCount++;
      byCategory[r.category].unpricedCount++;
    }
    studentIds.add(r.studentId);
  }

  let rateConfigNote: string | null = null;
  if (defaultRateCount > 0 && districtDefaultRateCount > 0) {
    rateConfigNote = `${districtDefaultRateCount} risk${districtDefaultRateCount !== 1 ? "s are" : " is"} estimated using your district default rate. ${defaultRateCount} risk${defaultRateCount !== 1 ? "s are" : " is"} estimated using the system default rate of $${SYSTEM_DEFAULT_HOURLY_RATE}/hr — configure per-service rates in Settings → Billing Rates for more accuracy.`;
  } else if (defaultRateCount > 0) {
    rateConfigNote = `${defaultRateCount} service shortfall risk${defaultRateCount !== 1 ? "s are" : " is"} estimated using the system default rate of $${SYSTEM_DEFAULT_HOURLY_RATE}/hr. Set a district default rate or per-service rates in Settings → Billing Rates for more accurate estimates.`;
  } else if (districtDefaultRateCount > 0) {
    rateConfigNote = `${districtDefaultRateCount} service shortfall risk${districtDefaultRateCount !== 1 ? "s are" : " is"} estimated using your district default rate. Configure per-service rates in Settings → Billing Rates for greater accuracy.`;
  }

  return {
    totalExposure: Math.round(totalExposure),
    unpricedRiskCount,
    defaultRateCount,
    districtDefaultRateCount,
    totalRisks: risks.length,
    byUrgency,
    byCategory,
    studentsAtRisk: studentIds.size,
    rateConfigNote,
  };
}

interface StudentInfo {
  name: string;
  caseManagerId: number | null;
  schoolId: number | null;
  programId: number | null;
}

async function buildStudentMap(ids: number[]): Promise<Map<number, StudentInfo>> {
  if (ids.length === 0) return new Map();
  const students = await db.select({
    id: studentsTable.id,
    firstName: studentsTable.firstName,
    lastName: studentsTable.lastName,
    caseManagerId: studentsTable.caseManagerId,
    schoolId: studentsTable.schoolId,
    programId: studentsTable.programId,
  }).from(studentsTable).where(inArray(studentsTable.id, ids));

  const map = new Map<number, StudentInfo>();
  for (const s of students) {
    map.set(s.id, {
      name: `${s.firstName} ${s.lastName}`,
      caseManagerId: s.caseManagerId,
      schoolId: s.schoolId,
      programId: s.programId,
    });
  }
  return map;
}

// System-wide fallback rate used when a service type has no configured billing
// rate. Clearly labelled in exposureBasis so districts can distinguish default
// estimates from those backed by their own configured rate.
const SYSTEM_DEFAULT_HOURLY_RATE = 75;

interface ResolvedRate {
  name: string;
  hourlyRate: number;
  isDefaultRate: boolean;
  rateSource: RateSource;
}

interface RateLookup {
  resolve(serviceTypeId: number, schoolId: number | null, programId: number | null): ResolvedRate;
}

function rateSourceLabel(src: RateSource): string {
  switch (src) {
    case 'school': return 'school-specific rate';
    case 'program': return 'program-specific rate';
    case 'district': return 'district-configured rate';
    case 'catalog': return 'catalog default rate';
    case 'district_default': return 'district default rate';
    case 'system': return 'system default — set a district default or per-service rate in Settings → Billing Rates';
  }
}

/**
 * Build a per-service-type rate lookup for cost avoidance. Returns a function
 * that resolves the most-specific rate for a (serviceType, school, program) tuple.
 *
 * Rate priority (highest wins):
 *   1. School-scoped district rate config (school_id matches student's school)
 *   2. Program-scoped district rate config (program_id matches student's program)
 *   3. District-wide rate config for the service type (no school/program scope)
 *   4. District-wide default hourly rate (Settings → Billing Rates)
 *   5. Global defaultBillingRate on service_types (shared catalog baseline)
 *   6. System default $75/hr
 *
 * Within a rate config row, in_house_rate is preferred over contracted_rate.
 * When multiple rows match the same scope, the row with the most recent
 * effective_date wins.
 */
async function buildRateLookup(districtId: number): Promise<RateLookup> {
  const [types, rateRows, districtRow] = await Promise.all([
    db.select({
      id: serviceTypesTable.id,
      name: serviceTypesTable.name,
      defaultBillingRate: serviceTypesTable.defaultBillingRate,
    }).from(serviceTypesTable),

    db.select({
      serviceTypeId: serviceRateConfigsTable.serviceTypeId,
      schoolId: serviceRateConfigsTable.schoolId,
      programId: serviceRateConfigsTable.programId,
      inHouseRate: serviceRateConfigsTable.inHouseRate,
      contractedRate: serviceRateConfigsTable.contractedRate,
      effectiveDate: serviceRateConfigsTable.effectiveDate,
    }).from(serviceRateConfigsTable)
      .where(eq(serviceRateConfigsTable.districtId, districtId))
      .orderBy(desc(serviceRateConfigsTable.effectiveDate)),

    db.select({ defaultHourlyRate: districtsTable.defaultHourlyRate })
      .from(districtsTable)
      .where(eq(districtsTable.id, districtId))
      .limit(1),
  ]);

  const districtDefaultRate = districtRow[0]?.defaultHourlyRate
    ? parseFloat(districtRow[0].defaultHourlyRate)
    : NaN;

  // Index rate configs by scope. Most recent effective date wins per scope.
  const schoolScoped = new Map<string, { inHouseRate: string | null; contractedRate: string | null }>();   // key: `${schoolId}:${serviceTypeId}`
  const programScoped = new Map<string, { inHouseRate: string | null; contractedRate: string | null }>(); // key: `${programId}:${serviceTypeId}`
  const districtScoped = new Map<number, { inHouseRate: string | null; contractedRate: string | null }>(); // key: serviceTypeId

  for (const r of rateRows) {
    if (r.schoolId != null) {
      const key = `${r.schoolId}:${r.serviceTypeId}`;
      if (!schoolScoped.has(key)) schoolScoped.set(key, { inHouseRate: r.inHouseRate, contractedRate: r.contractedRate });
    } else if (r.programId != null) {
      const key = `${r.programId}:${r.serviceTypeId}`;
      if (!programScoped.has(key)) programScoped.set(key, { inHouseRate: r.inHouseRate, contractedRate: r.contractedRate });
    } else {
      if (!districtScoped.has(r.serviceTypeId)) districtScoped.set(r.serviceTypeId, { inHouseRate: r.inHouseRate, contractedRate: r.contractedRate });
    }
  }

  const typeNameMap = new Map<number, { name: string; defaultBillingRate: string | null }>();
  for (const t of types) typeNameMap.set(t.id, { name: t.name, defaultBillingRate: t.defaultBillingRate });

  function pickRate(row: { inHouseRate: string | null; contractedRate: string | null } | undefined): number | null {
    if (!row) return null;
    const inHouse = row.inHouseRate ? parseFloat(row.inHouseRate) : NaN;
    if (Number.isFinite(inHouse) && inHouse > 0) return inHouse;
    const contracted = row.contractedRate ? parseFloat(row.contractedRate) : NaN;
    if (Number.isFinite(contracted) && contracted > 0) return contracted;
    return null;
  }

  return {
    resolve(serviceTypeId, schoolId, programId) {
      const t = typeNameMap.get(serviceTypeId);
      const name = t?.name || "Unknown Service";

      let hourlyRate: number | null = null;
      let rateSource: RateSource = 'system';

      if (schoolId != null) {
        hourlyRate = pickRate(schoolScoped.get(`${schoolId}:${serviceTypeId}`));
        if (hourlyRate != null) rateSource = 'school';
      }
      if (hourlyRate == null && programId != null) {
        hourlyRate = pickRate(programScoped.get(`${programId}:${serviceTypeId}`));
        if (hourlyRate != null) rateSource = 'program';
      }
      if (hourlyRate == null) {
        hourlyRate = pickRate(districtScoped.get(serviceTypeId));
        if (hourlyRate != null) rateSource = 'district';
      }
      if (hourlyRate == null && Number.isFinite(districtDefaultRate) && districtDefaultRate > 0) {
        hourlyRate = districtDefaultRate;
        rateSource = 'district_default';
      }
      if (hourlyRate == null) {
        const catalog = t?.defaultBillingRate ? parseFloat(t.defaultBillingRate) : NaN;
        if (Number.isFinite(catalog) && catalog > 0) {
          hourlyRate = catalog;
          rateSource = 'catalog';
        }
      }
      if (hourlyRate == null) {
        hourlyRate = SYSTEM_DEFAULT_HOURLY_RATE;
        rateSource = 'system';
      }

      return { name, hourlyRate, isDefaultRate: rateSource === 'system', rateSource };
    },
  };
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
  studentMap: Map<number, StudentInfo>,
  rateLookup: RateLookup,
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

  // School Calendar v0 — Slice 4B alignment.
  //
  // The on-demand /cost-avoidance/risks route used to do its own
  // dayOfMonth / daysInMonth math AND a separate per-week delivered
  // query, both of which ignored per-school closures and early-release
  // days. Now it delegates to the shared `computeAllActiveMinuteProgress`
  // engine — the same one used by compliance, the alert generator
  // (Slice 4A), and the snapshot archive — so closure-discounted
  // expected/projected math flows through automatically. requiredMinutes
  // is unchanged; only the pacing-derived consequences change.
  const reqStudentIds = [...new Set(requirements.map(r => r.studentId))];
  const progressResults = await computeAllActiveMinuteProgress({
    studentIds: reqStudentIds,
    asOfDate: now,
  });
  const progressByReqId = new Map<number, typeof progressResults[number]>();
  for (const mp of progressResults) {
    progressByReqId.set(mp.serviceRequirementId, mp);
  }

  for (const req of requirements) {
    const student = studentMap.get(req.studentId);
    if (!student) continue;
    const mp = progressByReqId.get(req.id);
    if (!mp) continue;

    const resolved = rateLookup.resolve(req.serviceTypeId, student.schoolId, student.programId);
    const svcName = resolved.name;
    const hourlyRate: number = resolved.hourlyRate;
    const rateSource = resolved.rateSource;

    const deliveredMinutes = mp.deliveredMinutes;
    const expectedByNow = mp.expectedMinutesByNow;

    const intervalEnd = new Date(mp.intervalEnd);
    const daysLeft = Math.max(
      0,
      Math.ceil((intervalEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    );

    // Calendar-aware suffix for the exposure description so reviewers
    // can see why a number is what it is. Mirrors the alert path.
    const calendarNote =
      mp.closureDayCount > 0 || mp.earlyReleaseDayCount > 0
        ? ` (school calendar applied: ${
            mp.closureDayCount > 0
              ? `${mp.closureDayCount} closure day${mp.closureDayCount === 1 ? "" : "s"}`
              : ""
          }${mp.closureDayCount > 0 && mp.earlyReleaseDayCount > 0 ? ", " : ""}${
            mp.earlyReleaseDayCount > 0
              ? `${mp.earlyReleaseDayCount} early-release day${mp.earlyReleaseDayCount === 1 ? "" : "s"}`
              : ""
          })`
        : "";

    if (req.intervalType === "weekly") {
      // Anchor "days left in the week" to the engine's intervalEnd so
      // the route, the alert generator, and the compliance UI all agree
      // on what "this week" means (engine uses Monday → Sunday).
      if (daysLeft <= 1 && deliveredMinutes < req.requiredMinutes * 0.5) {
        const shortfall = req.requiredMinutes - deliveredMinutes;
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
          description: `${student.name} has received ${deliveredMinutes} of ${req.requiredMinutes} required weekly minutes for ${svcName}. ${daysLeft === 0 ? "Week ends today." : `${daysLeft} day(s) remaining.`}`,
          daysRemaining: daysLeft,
          estimatedExposure,
          rateSource,
          exposureBasis: `${shortfall} min shortfall × $${hourlyRate}/hr (${rateSourceLabel(rateSource)})${calendarNote}`,
          actionNeeded: `Schedule ${shortfall} minutes of ${svcName} immediately`,
          serviceTypeName: svcName,
        });
      }
    } else if (req.intervalType === "monthly") {
      const projectedShortfall = Math.max(
        0,
        Math.round(req.requiredMinutes - mp.projectedMinutes),
      );

      if (projectedShortfall > 0 && deliveredMinutes < expectedByNow * 0.85) {
        if (projectedShortfall < 15) continue;
        const estimatedExposure = Math.round((projectedShortfall / 60) * hourlyRate);

        const pctDelivered =
          req.requiredMinutes > 0
            ? Math.round((deliveredMinutes / req.requiredMinutes) * 100)
            : 0;
        // Same urgency rule as the alert path (Slice 4A): anchor on
        // expected-by-now (already calendar-discounted), not on
        // delivered minutes, so a zero-delivery student isn't capped at
        // "medium" early in a long-shortfall month.
        const periodHalfPassed = expectedByNow >= req.requiredMinutes * 0.5;
        const urgency: UrgencyLevel =
          pctDelivered < 30 && periodHalfPassed ? "critical" :
          pctDelivered < 50 && periodHalfPassed ? "high" :
          daysLeft <= 7 ? "high" : "medium";

        const pctOfPeriod =
          req.requiredMinutes > 0
            ? Math.round((expectedByNow / req.requiredMinutes) * 100)
            : 0;

        risks.push({
          id: `svc-${req.id}`,
          category: "service_shortfall",
          urgency,
          studentId: req.studentId,
          studentName: student.name,
          staffId: req.providerId,
          staffName: null,
          title: `${svcName}: trending ${projectedShortfall} min short`,
          description: `${student.name} has ${deliveredMinutes} of ${req.requiredMinutes} required monthly minutes for ${svcName} (${pctDelivered}% at ${pctOfPeriod}% through month). Projected shortfall: ${projectedShortfall} min.`,
          daysRemaining: daysLeft,
          estimatedExposure,
          rateSource,
          exposureBasis: `${projectedShortfall} min projected shortfall × $${hourlyRate}/hr (${rateSourceLabel(rateSource)})${calendarNote}`,
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
  studentMap: Map<number, StudentInfo>,
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

export default router;
