import { db, pool } from "@workspace/db";
import { complianceTrendSnapshotsTable, districtsTable } from "@workspace/db/schema";
import { logger } from "./logger";
import { computeAllActiveMinuteProgress } from "./minuteCalc";

const RISK_ORDER: Record<string, number> = {
  out_of_compliance: 0,
  at_risk: 1,
  slightly_behind: 2,
  on_track: 3,
  completed: 4,
};

export interface ComplianceTrendMetrics {
  overallComplianceRate: number;
  studentsOutOfCompliance: number;
  studentsAtRisk: number;
  studentsOnTrack: number;
}

async function ensureComplianceTrendSnapshotsTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS compliance_trend_snapshots (
        id                         serial PRIMARY KEY,
        district_id                integer NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
        snapshot_date              date NOT NULL,
        overall_compliance_rate    numeric(5,1) NOT NULL,
        students_out_of_compliance integer NOT NULL DEFAULT 0,
        students_at_risk           integer NOT NULL DEFAULT 0,
        students_on_track          integer NOT NULL DEFAULT 0,
        captured_at                timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS cts_district_date_idx
      ON compliance_trend_snapshots (district_id, snapshot_date)
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS cts_district_date_unique
      ON compliance_trend_snapshots (district_id, snapshot_date)
    `);
  } catch (err) {
    logger.warn({ err }, "ensureComplianceTrendSnapshotsTable: DDL failed (non-fatal)");
  }
}

/**
 * Compute the same headline compliance metrics that the week-trend endpoint
 * exposes (overall rate, plus the student bucket triplet) for a given district
 * as of the supplied date. Mirrors the bucket logic in
 * artifacts/api-server/src/routes/reports/weekTrend.ts so the snapshot stays
 * apples-to-apples with the canonical compliance-risk-report definitions.
 */
export async function computeComplianceTrendMetricsForDistrict(
  districtId: number,
  asOfDate: Date,
): Promise<ComplianceTrendMetrics | null> {
  const endDateStr = asOfDate.toISOString().substring(0, 10);

  const progress = await computeAllActiveMinuteProgress({
    districtId,
    endDate: endDateStr,
    asOfDate,
  });

  if (progress.length === 0) return null;

  let totalRequired = 0;
  let totalDelivered = 0;
  const studentWorstStatus = new Map<number, string>();

  for (const p of progress) {
    totalRequired += p.requiredMinutes;
    totalDelivered += p.deliveredMinutes;

    const current = studentWorstStatus.get(p.studentId);
    const currentOrder = current !== undefined ? (RISK_ORDER[current] ?? 99) : 99;
    const newOrder = RISK_ORDER[p.riskStatus] ?? 99;
    if (newOrder < currentOrder) {
      studentWorstStatus.set(p.studentId, p.riskStatus);
    }
  }

  const overallComplianceRate =
    totalRequired > 0 ? Math.round((totalDelivered / totalRequired) * 1000) / 10 : 100;

  let studentsOutOfCompliance = 0;
  let studentsAtRisk = 0;
  let studentsOnTrack = 0;
  for (const status of studentWorstStatus.values()) {
    if (status === "out_of_compliance") studentsOutOfCompliance++;
    else if (status === "at_risk") studentsAtRisk++;
    else if (status === "on_track" || status === "completed") studentsOnTrack++;
  }

  return {
    overallComplianceRate,
    studentsOutOfCompliance,
    studentsAtRisk,
    studentsOnTrack,
  };
}

export async function captureComplianceTrendSnapshotForDistrict(
  districtId: number,
  snapshotDate: Date = new Date(),
): Promise<void> {
  const metrics = await computeComplianceTrendMetricsForDistrict(districtId, snapshotDate);
  if (!metrics) return;

  const dateStr = snapshotDate.toISOString().substring(0, 10);

  await db.insert(complianceTrendSnapshotsTable)
    .values({
      districtId,
      snapshotDate: dateStr,
      overallComplianceRate: metrics.overallComplianceRate.toFixed(1),
      studentsOutOfCompliance: metrics.studentsOutOfCompliance,
      studentsAtRisk: metrics.studentsAtRisk,
      studentsOnTrack: metrics.studentsOnTrack,
    })
    .onConflictDoUpdate({
      target: [
        complianceTrendSnapshotsTable.districtId,
        complianceTrendSnapshotsTable.snapshotDate,
      ],
      set: {
        overallComplianceRate: metrics.overallComplianceRate.toFixed(1),
        studentsOutOfCompliance: metrics.studentsOutOfCompliance,
        studentsAtRisk: metrics.studentsAtRisk,
        studentsOnTrack: metrics.studentsOnTrack,
        capturedAt: new Date(),
      },
    });
}

export async function captureComplianceTrendSnapshotsForAllDistricts(): Promise<void> {
  const districts = await db.select({ id: districtsTable.id }).from(districtsTable);
  const snapshotDate = new Date();
  let written = 0;
  for (const d of districts) {
    try {
      await captureComplianceTrendSnapshotForDistrict(d.id, snapshotDate);
      written++;
    } catch (err) {
      logger.warn(
        { err, districtId: d.id },
        "Failed to capture compliance trend snapshot for district (non-fatal)",
      );
    }
  }
  logger.info({ written, total: districts.length }, "Compliance trend snapshots captured");
}

let snapshotTimeout: ReturnType<typeof setTimeout> | null = null;

function msUntilNext0230UTC(): number {
  // Run at 02:30 UTC nightly — late enough that any rolling end-of-day
  // session imports have settled but well before US-Eastern morning use.
  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    2, 30, 0, 0,
  ));
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - now.getTime();
}

function scheduleNextRun(): void {
  const delay = msUntilNext0230UTC();
  logger.info(
    { nextRunMs: delay, nextRunMin: Math.round(delay / 60000) },
    "Compliance trend snapshot: next run scheduled",
  );
  snapshotTimeout = setTimeout(() => {
    captureComplianceTrendSnapshotsForAllDistricts()
      .catch((err) =>
        logger.warn({ err }, "Scheduled compliance trend snapshot run failed (non-fatal)"),
      )
      .finally(() => scheduleNextRun());
  }, delay);
}

export function startComplianceTrendSnapshotScheduler(): void {
  if (snapshotTimeout) return;

  ensureComplianceTrendSnapshotsTable()
    .then(() => captureComplianceTrendSnapshotsForAllDistricts())
    .catch((err) =>
      logger.warn({ err }, "Initial compliance trend snapshot run failed (non-fatal)"),
    );

  scheduleNextRun();

  logger.info("Compliance trend snapshot scheduler started");
}
