import { db, pool } from "@workspace/db";
import {
  pilotBaselineSnapshotsTable,
  districtsTable,
  studentsTable,
  serviceRequirementsTable,
  serviceTypesTable,
  iepDocumentsTable,
  evaluationReferralsTable,
  complianceEventsTable,
  compensatoryObligationsTable,
  sessionLogsTable,
} from "@workspace/db/schema";
import { eq, and, sql, gte, lte, isNull, inArray, ne, lt } from "drizzle-orm";
import { logger } from "./logger";
import { computeAllActiveMinuteProgress } from "./minuteCalc";

/**
 * Defensive DDL — the baseline snapshots table is recreated on startup
 * (matching the pattern used by cost_avoidance_snapshots) so the feature
 * works in environments that haven't run an explicit drizzle migration yet.
 */
export async function ensurePilotBaselineSnapshotsTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pilot_baseline_snapshots (
        id                          serial PRIMARY KEY,
        district_id                 integer NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
        compliance_percent          integer,
        exposure_dollars            integer NOT NULL DEFAULT 0,
        comp_ed_minutes_outstanding integer NOT NULL DEFAULT 0,
        overdue_evaluations         integer NOT NULL DEFAULT 0,
        expiring_ieps_next_60       integer NOT NULL DEFAULT 0,
        captured_at                 timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS pbs_district_unique
      ON pilot_baseline_snapshots (district_id)
    `);
  } catch (err) {
    logger.warn({ err }, "ensurePilotBaselineSnapshotsTable: DDL failed (non-fatal)");
  }
}

export interface PilotBaselineMetrics {
  compliancePercent: number | null;
  exposureDollars: number;
  compEdMinutesOutstanding: number;
  overdueEvaluations: number;
  expiringIepsNext60: number;
}

/**
 * Compute the same five metrics that get frozen into the baseline. Used both
 * to capture the Day-0 row AND to render the live "current vs. baseline"
 * comparison panel — keeping the comparison apples-to-apples.
 */
export async function computePilotBaselineMetrics(districtId: number): Promise<PilotBaselineMetrics> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon60 = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const window30Start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const activeStudents = await db.select({ id: studentsTable.id })
    .from(studentsTable)
    .where(and(
      eq(studentsTable.status, "active"),
      sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${districtId})`,
    ));
  const studentIds = activeStudents.map((s) => s.id);

  // ── Compliance % ───────────────────────────────────────────────────────
  let compliancePercent: number | null = null;
  try {
    const progress = await computeAllActiveMinuteProgress({ districtId });
    let onTrack = 0;
    let tracked = 0;
    const seen = new Set<number>();
    type Risk = "out_of_compliance" | "at_risk" | "slightly_behind" | "on_track" | "completed" | "no_data";
    const priority: Record<Risk, number> = {
      out_of_compliance: 4, at_risk: 3, slightly_behind: 2, on_track: 1, completed: 0, no_data: -1,
    };
    const worst = new Map<number, Risk>();
    for (const p of progress) {
      const r = p.riskStatus as Risk;
      const cur = worst.get(p.studentId);
      if (!cur || (priority[r] ?? -1) > (priority[cur] ?? -1)) worst.set(p.studentId, r);
    }
    for (const r of worst.values()) {
      if (r === "no_data") continue;
      tracked++;
      if (r === "on_track" || r === "completed") onTrack++;
      seen.add(1);
    }
    compliancePercent = tracked > 0 ? Math.round((onTrack / tracked) * 100) : null;
  } catch (err) {
    logger.warn({ err, districtId }, "computePilotBaselineMetrics: compliance calc failed");
  }

  if (studentIds.length === 0) {
    return {
      compliancePercent,
      exposureDollars: 0,
      compEdMinutesOutstanding: 0,
      overdueEvaluations: 0,
      expiringIepsNext60: 0,
    };
  }

  // ── Exposure $ over the last 30 days ───────────────────────────────────
  // Estimate the dollar value of mandated minutes that have NOT been
  // delivered in the trailing 30-day window, priced at the service type's
  // default billing rate. We deliberately avoid pulling in the projected
  // 90-day risk surface — the baseline is a snapshot of pre-Noverta state,
  // not a forward forecast.
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
    studentId: serviceRequirementsTable.studentId,
    serviceTypeId: serviceRequirementsTable.serviceTypeId,
    requiredMinutes: serviceRequirementsTable.requiredMinutes,
    intervalType: serviceRequirementsTable.intervalType,
  }).from(serviceRequirementsTable).where(and(
    inArray(serviceRequirementsTable.studentId, studentIds),
    eq(serviceRequirementsTable.active, true),
  ));

  const sessionTotals = await db.select({
    studentId: sessionLogsTable.studentId,
    serviceTypeId: sessionLogsTable.serviceTypeId,
    totalMinutes: sql<number>`coalesce(sum(${sessionLogsTable.durationMinutes}), 0)::int`,
  }).from(sessionLogsTable).where(and(
    inArray(sessionLogsTable.studentId, studentIds),
    inArray(sessionLogsTable.status, ["completed", "makeup"]),
    gte(sessionLogsTable.sessionDate, window30Start),
    lte(sessionLogsTable.sessionDate, today),
    isNull(sessionLogsTable.deletedAt),
  )).groupBy(sessionLogsTable.studentId, sessionLogsTable.serviceTypeId);
  const deliveredMap = new Map<string, number>();
  for (const s of sessionTotals) deliveredMap.set(`${s.studentId}-${s.serviceTypeId}`, s.totalMinutes);

  let exposureDollars = 0;
  for (const req of requirements) {
    // Express the requirement as expected minutes per 30-day window.
    let expected30: number;
    if (req.intervalType === "weekly") expected30 = req.requiredMinutes * (30 / 7);
    else if (req.intervalType === "monthly") expected30 = req.requiredMinutes;
    else if (req.intervalType === "quarterly") expected30 = req.requiredMinutes / 3;
    else continue;
    const delivered = deliveredMap.get(`${req.studentId}-${req.serviceTypeId}`) || 0;
    const shortfallMin = Math.max(0, expected30 - delivered);
    if (shortfallMin <= 0) continue;
    const hourlyRate = rateMap.get(req.serviceTypeId);
    if (hourlyRate == null) continue;
    exposureDollars += Math.round((shortfallMin / 60) * hourlyRate);
  }

  // ── Comp-ed minutes outstanding ────────────────────────────────────────
  const compRows = await db.select({
    minutesOwed: compensatoryObligationsTable.minutesOwed,
    minutesDelivered: compensatoryObligationsTable.minutesDelivered,
  }).from(compensatoryObligationsTable).where(and(
    inArray(compensatoryObligationsTable.studentId, studentIds),
    ne(compensatoryObligationsTable.status, "completed"),
    ne(compensatoryObligationsTable.status, "fulfilled"),
    ne(compensatoryObligationsTable.status, "cancelled"),
  ));
  let compEdMinutesOutstanding = 0;
  for (const r of compRows) {
    compEdMinutesOutstanding += Math.max(0, r.minutesOwed - r.minutesDelivered);
  }

  // ── Overdue evaluations ────────────────────────────────────────────────
  // Combines two tracking surfaces (referrals + compliance events) and
  // de-duplicates by student so a student tracked in both isn't double-counted.
  const overdueRefs = await db.select({ studentId: evaluationReferralsTable.studentId })
    .from(evaluationReferralsTable).where(and(
      inArray(evaluationReferralsTable.studentId, studentIds),
      inArray(evaluationReferralsTable.status, ["open", "in_progress", "pending"]),
      lt(evaluationReferralsTable.evaluationDeadline, today),
      isNull(evaluationReferralsTable.deletedAt),
    ));
  const overdueEvents = await db.select({ studentId: complianceEventsTable.studentId })
    .from(complianceEventsTable).where(and(
      inArray(complianceEventsTable.studentId, studentIds),
      inArray(complianceEventsTable.eventType, ["initial_evaluation", "reevaluation", "triennial"]),
      inArray(complianceEventsTable.status, ["upcoming", "overdue"]),
      lt(complianceEventsTable.dueDate, today),
    ));
  const overdueStudentSet = new Set<number>();
  for (const r of overdueRefs) overdueStudentSet.add(r.studentId);
  for (const r of overdueEvents) overdueStudentSet.add(r.studentId);
  const overdueEvaluations = overdueStudentSet.size;

  // ── Expiring IEPs in the next 60 days ──────────────────────────────────
  const expiringRows = await db.select({ studentId: iepDocumentsTable.studentId })
    .from(iepDocumentsTable).where(and(
      inArray(iepDocumentsTable.studentId, studentIds),
      eq(iepDocumentsTable.active, true),
      gte(iepDocumentsTable.iepEndDate, today),
      lte(iepDocumentsTable.iepEndDate, horizon60),
    ));
  const expiringStudentSet = new Set<number>();
  for (const r of expiringRows) expiringStudentSet.add(r.studentId);
  const expiringIepsNext60 = expiringStudentSet.size;

  return {
    compliancePercent,
    exposureDollars,
    compEdMinutesOutstanding,
    overdueEvaluations,
    expiringIepsNext60,
  };
}

/**
 * Capture the immutable Day-0 snapshot for a single district. No-op if a
 * baseline already exists — the snapshot is captured exactly once per
 * district and is never updated by the system or by a user.
 */
export async function captureBaselineForDistrict(districtId: number): Promise<{ created: boolean }> {
  const [existing] = await db.select({ id: pilotBaselineSnapshotsTable.id })
    .from(pilotBaselineSnapshotsTable)
    .where(eq(pilotBaselineSnapshotsTable.districtId, districtId))
    .limit(1);
  if (existing) return { created: false };

  const metrics = await computePilotBaselineMetrics(districtId);
  await db.insert(pilotBaselineSnapshotsTable)
    .values({ districtId, ...metrics })
    // Race-safe: a parallel call beat us to the insert. Keep the existing row
    // (the baseline is immutable — first writer wins).
    .onConflictDoNothing({ target: pilotBaselineSnapshotsTable.districtId });
  logger.info({ districtId, metrics }, "Pilot baseline snapshot captured");
  return { created: true };
}

/**
 * Backfill: for every district currently in pilot mode that is missing a
 * baseline row, capture one now. Called once at server startup so existing
 * pilots get a baseline (the comparison panel will be flat for them, but the
 * Pilot Readout has something to anchor to).
 */
export async function backfillPilotBaselines(): Promise<void> {
  try {
    const pilots = await db.select({ id: districtsTable.id })
      .from(districtsTable)
      .where(eq(districtsTable.isPilot, true));
    let created = 0;
    for (const d of pilots) {
      try {
        const r = await captureBaselineForDistrict(d.id);
        if (r.created) created++;
      } catch (err) {
        logger.warn({ err, districtId: d.id }, "backfillPilotBaselines: capture failed for district (non-fatal)");
      }
    }
    if (created > 0) {
      logger.info({ created, scanned: pilots.length }, "Pilot baseline backfill complete");
    }
  } catch (err) {
    logger.warn({ err }, "backfillPilotBaselines failed (non-fatal)");
  }
}
