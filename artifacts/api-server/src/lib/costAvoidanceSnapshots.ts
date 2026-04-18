import { db, pool } from "@workspace/db";
import {
  costAvoidanceSnapshotsTable,
  studentsTable,
  serviceRequirementsTable,
  serviceTypesTable,
  complianceEventsTable,
  evaluationReferralsTable,
  iepDocumentsTable,
  teamMeetingsTable,
  sessionLogsTable,
  districtsTable,
} from "@workspace/db/schema";
import { eq, and, sql, gte, lte, isNull, inArray, ne } from "drizzle-orm";
import { logger } from "./logger";
import {
  ensureWeeklyDigestColumn,
  sendWeeklyRiskDigestsForAllDistricts,
} from "./costAvoidanceWeeklyDigest";

async function ensureCostAvoidanceSnapshotsTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cost_avoidance_snapshots (
        id              serial PRIMARY KEY,
        district_id     integer NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
        week_start      timestamptz NOT NULL,
        total_risks     integer NOT NULL DEFAULT 0,
        critical_count  integer NOT NULL DEFAULT 0,
        high_count      integer NOT NULL DEFAULT 0,
        medium_count    integer NOT NULL DEFAULT 0,
        watch_count     integer NOT NULL DEFAULT 0,
        total_exposure  integer NOT NULL DEFAULT 0,
        students_at_risk integer NOT NULL DEFAULT 0,
        unpriced_risk_count integer NOT NULL DEFAULT 0,
        captured_at     timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS cas_district_week_idx
      ON cost_avoidance_snapshots (district_id, week_start)
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS cas_district_week_unique
      ON cost_avoidance_snapshots (district_id, week_start)
    `);
  } catch (err) {
    logger.warn({ err }, "ensureCostAvoidanceSnapshotsTable: DDL failed (non-fatal)");
  }
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(dateStr: string, today: string): number {
  const d = new Date(dateStr);
  const t = new Date(today);
  return Math.ceil((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
}

function getUrgency(daysRemaining: number): "critical" | "high" | "medium" | "watch" {
  if (daysRemaining <= 7) return "critical";
  if (daysRemaining <= 14) return "high";
  if (daysRemaining <= 30) return "medium";
  return "watch";
}

interface SnapshotCounts {
  totalRisks: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  watchCount: number;
  totalExposure: number;
  studentsAtRisk: number;
  unpricedRiskCount: number;
}

async function computeDistrictRiskCounts(districtId: number): Promise<SnapshotCounts> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const activeStudentIds = await db.select({ id: studentsTable.id })
    .from(studentsTable)
    .where(and(
      eq(studentsTable.status, "active"),
      sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${districtId})`,
    ));

  const studentIdArray = activeStudentIds.map(s => s.id);
  if (studentIdArray.length === 0) {
    return { totalRisks: 0, criticalCount: 0, highCount: 0, mediumCount: 0, watchCount: 0, totalExposure: 0, studentsAtRisk: 0, unpricedRiskCount: 0 };
  }

  type UrgencyLevel = "critical" | "high" | "medium" | "watch";
  const risks: Array<{ urgency: UrgencyLevel; studentId: number; estimatedExposure: number | null }> = [];

  const referrals = await db.select({
    id: evaluationReferralsTable.id,
    studentId: evaluationReferralsTable.studentId,
    evaluationDeadline: evaluationReferralsTable.evaluationDeadline,
  }).from(evaluationReferralsTable).where(and(
    inArray(evaluationReferralsTable.studentId, studentIdArray),
    inArray(evaluationReferralsTable.status, ["open", "in_progress", "pending"]),
    isNull(evaluationReferralsTable.deletedAt),
  ));

  for (const ref of referrals) {
    if (!ref.evaluationDeadline) continue;
    const days = daysBetween(ref.evaluationDeadline, today);
    if (days > 90) continue;
    const overdue = days < 0;
    risks.push({ urgency: overdue ? "critical" : getUrgency(days), studentId: ref.studentId, estimatedExposure: null });
  }

  const complianceEvals = await db.select({
    id: complianceEventsTable.id,
    studentId: complianceEventsTable.studentId,
    dueDate: complianceEventsTable.dueDate,
  }).from(complianceEventsTable).where(and(
    inArray(complianceEventsTable.studentId, studentIdArray),
    inArray(complianceEventsTable.eventType, ["initial_evaluation", "reevaluation", "triennial"]),
    inArray(complianceEventsTable.status, ["upcoming", "overdue"]),
    lte(complianceEventsTable.dueDate, horizon90),
  ));

  const seenEvalStudents = new Set(risks.map(r => r.studentId));
  for (const ce of complianceEvals) {
    if (seenEvalStudents.has(ce.studentId)) continue;
    const days = daysBetween(ce.dueDate, today);
    if (days > 90) continue;
    const overdue = days < 0;
    risks.push({ urgency: overdue ? "critical" : getUrgency(days), studentId: ce.studentId, estimatedExposure: null });
  }

  const serviceTypes = await db.select({
    id: serviceTypesTable.id,
    defaultBillingRate: serviceTypesTable.defaultBillingRate,
  }).from(serviceTypesTable);
  const rateMap = new Map<number, number | null>();
  for (const t of serviceTypes) {
    const parsed = t.defaultBillingRate ? parseFloat(t.defaultBillingRate) : NaN;
    rateMap.set(t.id, Number.isFinite(parsed) && parsed > 0 ? parsed : null);
  }

  const requirements = await db.select({
    id: serviceRequirementsTable.id,
    studentId: serviceRequirementsTable.studentId,
    serviceTypeId: serviceRequirementsTable.serviceTypeId,
    requiredMinutes: serviceRequirementsTable.requiredMinutes,
    intervalType: serviceRequirementsTable.intervalType,
  }).from(serviceRequirementsTable).where(and(
    inArray(serviceRequirementsTable.studentId, studentIdArray),
    eq(serviceRequirementsTable.active, true),
  ));

  if (requirements.length > 0) {
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

    for (const req of requirements) {
      if (req.intervalType !== "monthly" && req.intervalType !== "weekly") continue;
      const hourlyRate = rateMap.get(req.serviceTypeId) ?? null;
      const deliveredMinutes = sessionMap.get(`${req.studentId}-${req.serviceTypeId}`) || 0;

      if (req.intervalType === "monthly") {
        const expectedByNow = Math.round(req.requiredMinutes * monthProgress);
        const projectedDelivery = monthProgress > 0 ? Math.round(deliveredMinutes / monthProgress) : 0;
        const projectedShortfall = req.requiredMinutes - projectedDelivery;
        if (projectedShortfall >= 15 && deliveredMinutes < expectedByNow * 0.85) {
          const daysLeft = daysInMonth - dayOfMonth;
          const pctDelivered = req.requiredMinutes > 0 ? Math.round((deliveredMinutes / req.requiredMinutes) * 100) : 0;
          const urgency: UrgencyLevel = pctDelivered < 30 && monthProgress > 0.5 ? "critical" :
            pctDelivered < 50 && monthProgress > 0.5 ? "high" :
            daysLeft <= 7 ? "high" : "medium";
          const estimatedExposure = hourlyRate != null ? Math.round((projectedShortfall / 60) * hourlyRate) : null;
          risks.push({ urgency, studentId: req.studentId, estimatedExposure });
        }
      }
    }
  }

  const activeIeps = await db.select({
    studentId: iepDocumentsTable.studentId,
    iepEndDate: iepDocumentsTable.iepEndDate,
    iepStartDate: iepDocumentsTable.iepStartDate,
  }).from(iepDocumentsTable).where(and(
    inArray(iepDocumentsTable.studentId, studentIdArray),
    eq(iepDocumentsTable.active, true),
    lte(iepDocumentsTable.iepEndDate, horizon90),
  ));

  if (activeIeps.length > 0) {
    const iepStudentIds = [...new Set(activeIeps.map(i => i.studentId))];
    const futureMeetings = await db.select({
      studentId: teamMeetingsTable.studentId,
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
      const days = daysBetween(iep.iepEndDate, today);
      const overdue = days < 0;
      risks.push({ urgency: overdue ? "critical" : getUrgency(days), studentId: iep.studentId, estimatedExposure: null });
    }
  }

  const counts = { totalRisks: risks.length, criticalCount: 0, highCount: 0, mediumCount: 0, watchCount: 0, totalExposure: 0, unpricedRiskCount: 0 };
  const studentIds = new Set<number>();
  for (const r of risks) {
    if (r.urgency === "critical") counts.criticalCount++;
    else if (r.urgency === "high") counts.highCount++;
    else if (r.urgency === "medium") counts.mediumCount++;
    else counts.watchCount++;

    if (r.estimatedExposure != null) {
      counts.totalExposure += r.estimatedExposure;
    } else {
      counts.unpricedRiskCount++;
    }
    studentIds.add(r.studentId);
  }

  return { ...counts, studentsAtRisk: studentIds.size };
}

export async function captureSnapshotForDistrict(districtId: number): Promise<void> {
  const counts = await computeDistrictRiskCounts(districtId);
  const weekStart = getWeekStart(new Date());

  await db.insert(costAvoidanceSnapshotsTable)
    .values({
      districtId,
      weekStart,
      ...counts,
    })
    .onConflictDoUpdate({
      target: [costAvoidanceSnapshotsTable.districtId, costAvoidanceSnapshotsTable.weekStart],
      set: {
        ...counts,
        capturedAt: new Date(),
      },
    });
}

export async function captureSnapshotsForAllDistricts(): Promise<void> {
  const districts = await db.select({ id: districtsTable.id }).from(districtsTable);
  for (const d of districts) {
    try {
      await captureSnapshotForDistrict(d.id);
    } catch (err) {
      logger.warn({ err, districtId: d.id }, "Failed to capture cost avoidance snapshot for district (non-fatal)");
    }
  }
  logger.info({ count: districts.length }, "Cost avoidance snapshots captured for all districts");

  // Send weekly digest emails to district admins after snapshots are fresh.
  sendWeeklyRiskDigestsForAllDistricts().catch((err) =>
    logger.warn({ err }, "Weekly risk digest run failed (non-fatal)"),
  );
}

let snapshotTimeout: ReturnType<typeof setTimeout> | null = null;

function msUntilNextMondayMidnightUTC(): number {
  const now = new Date();
  const day = now.getUTCDay();
  const daysUntilMonday = day === 0 ? 1 : (8 - day) % 7 || 7;
  const nextMonday = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday,
    0, 0, 0, 0,
  ));
  return nextMonday.getTime() - now.getTime();
}

function scheduleNextSnapshot(): void {
  const delay = msUntilNextMondayMidnightUTC();
  logger.info({ nextRunMs: delay, nextRunMin: Math.round(delay / 60000) }, "Cost avoidance snapshot: next run scheduled");
  snapshotTimeout = setTimeout(() => {
    captureSnapshotsForAllDistricts()
      .catch((err) => logger.warn({ err }, "Scheduled cost avoidance snapshot run failed (non-fatal)"))
      .finally(() => scheduleNextSnapshot());
  }, delay);
}

export function startCostAvoidanceSnapshotScheduler(): void {
  if (snapshotTimeout) return;

  ensureCostAvoidanceSnapshotsTable()
    .then(() => ensureWeeklyDigestColumn())
    .then(() => captureSnapshotsForAllDistricts())
    .catch((err) =>
      logger.warn({ err }, "Initial cost avoidance snapshot run failed (non-fatal)")
    );

  scheduleNextSnapshot();

  logger.info("Cost avoidance snapshot scheduler started");
}
