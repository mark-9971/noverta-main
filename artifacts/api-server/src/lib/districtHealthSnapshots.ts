import { db, pool } from "@workspace/db";
import {
  districtHealthSnapshotsTable,
  districtsTable,
} from "@workspace/db/schema";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { logger } from "./logger";
import { computeAllActiveMinuteProgress } from "./minuteCalc";
import { getRateMap, minutesToDollars, type RateInfo } from "../routes/compensatoryFinance/shared";
import { computeProviderLoggingRate } from "./providerLoggingRate";

/**
 * Composite "district health" score (0-100) computed and persisted DAILY so
 * the dashboard badge can show a week-over-week trend ("+3 pts vs. last week")
 * and a small sparkline. Mirrors the client-side computeHealthScore formula in
 * artifacts/trellis/src/lib/health-score.ts so the persisted history stays
 * apples-to-apples with what the badge currently shows.
 *
 * Cadence: a snapshot is captured for every district once per day at ~02:45
 * UTC (and lazily on first read for brand-new districts). The reader
 * (`getHealthScoreTrendForDistrict`) collapses those daily rows into one
 * point per ISO week for the sparkline so the tooltip shows ~6 evenly spaced
 * weekly samples instead of a noisy 40-day-line.
 */

interface ComputedHealth {
  numeric: number;
  grade: "A" | "B" | "C" | "D" | "F";
  compliancePoints: number;
  exposurePoints: number;
  loggingPoints: number;
}

const MAX_EXPOSURE_PER_STUDENT = 500;

function gradeFor(numeric: number): ComputedHealth["grade"] {
  if (numeric >= 90) return "A";
  if (numeric >= 80) return "B";
  if (numeric >= 70) return "C";
  if (numeric >= 60) return "D";
  return "F";
}

async function ensureDistrictHealthSnapshotsTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS district_health_snapshots (
        id                serial PRIMARY KEY,
        district_id       integer NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
        snapshot_date     date NOT NULL,
        numeric_score     integer NOT NULL,
        grade             varchar(1) NOT NULL,
        compliance_points integer NOT NULL DEFAULT 0,
        exposure_points   integer NOT NULL DEFAULT 0,
        logging_points    integer NOT NULL DEFAULT 0,
        captured_at       timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS dhs_district_date_idx
      ON district_health_snapshots (district_id, snapshot_date)
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS dhs_district_date_unique
      ON district_health_snapshots (district_id, snapshot_date)
    `);
  } catch (err) {
    logger.warn({ err }, "ensureDistrictHealthSnapshotsTable: DDL failed (non-fatal)");
  }
}

export async function computeDistrictHealthScore(
  districtId: number,
  asOfDate: Date = new Date(),
): Promise<ComputedHealth | null> {
  const endDateStr = asOfDate.toISOString().substring(0, 10);

  // Use the SAME inputs the dashboard badge derives from compliance-risk-report:
  // - overallComplianceRate from progress totals
  // - combinedExposure from getRateMap(districtId) + minutesToDollars (district-aware rates)
  // - exposurePerStudent uses the unique-students-in-progress count (matches the
  //   `summary.totalStudents` field in compliance-risk-report, NOT all active
  //   students in the district)
  const [progress, rateMap, loggingRate] = await Promise.all([
    computeAllActiveMinuteProgress({ districtId, endDate: endDateStr, asOfDate }),
    getRateMap(districtId),
    computeProviderLoggingRate({ districtId, endDate: endDateStr, lookbackDays: 30 }),
  ]);

  if (progress.length === 0) return null;

  let totalRequired = 0;
  let totalDelivered = 0;
  let totalExposure = 0;
  const uniqueStudents = new Set<number>();
  for (const p of progress) {
    totalRequired += p.requiredMinutes;
    totalDelivered += p.deliveredMinutes;
    uniqueStudents.add(p.studentId);

    const shortfall = Math.max(0, p.requiredMinutes - p.deliveredMinutes);
    if (shortfall <= 0) continue;
    const rateInfo: RateInfo = rateMap.get(p.serviceTypeId)?.inHouse ?? { rate: null, source: "unconfigured" };
    const dollars = minutesToDollars(shortfall, rateInfo);
    if (dollars != null) totalExposure += dollars;
  }

  const totalStudents = uniqueStudents.size;
  if (totalStudents === 0) return null;

  const overallComplianceRate =
    totalRequired > 0 ? Math.round((totalDelivered / totalRequired) * 1000) / 10 : 100;
  const exposurePerStudent = totalExposure / totalStudents;

  const compliancePoints = Math.max(0, Math.min(100, overallComplianceRate));
  const exposurePoints = Math.max(
    0,
    Math.min(100, 100 - (exposurePerStudent / MAX_EXPOSURE_PER_STUDENT) * 100),
  );
  // Provider logging rate: real timely-logging adoption over the trailing 30
  // days (see lib/providerLoggingRate.ts). When no sessions are expected yet
  // (brand-new district with no mandates) we fall back to 100 so the score
  // isn't penalised before any signal exists.
  const loggingPoints = loggingRate.rate == null
    ? 100
    : Math.max(0, Math.min(100, loggingRate.rate * 100));

  const numeric = Math.round(
    compliancePoints * 0.6 + exposurePoints * 0.2 + loggingPoints * 0.2,
  );

  return {
    numeric,
    grade: gradeFor(numeric),
    compliancePoints: Math.round(compliancePoints),
    exposurePoints: Math.round(exposurePoints),
    loggingPoints: Math.round(loggingPoints),
  };
}

export async function captureDistrictHealthSnapshot(
  districtId: number,
  snapshotDate: Date = new Date(),
): Promise<void> {
  const health = await computeDistrictHealthScore(districtId, snapshotDate);
  if (!health) return;

  const dateStr = snapshotDate.toISOString().substring(0, 10);

  await db.insert(districtHealthSnapshotsTable)
    .values({
      districtId,
      snapshotDate: dateStr,
      numericScore: health.numeric,
      grade: health.grade,
      compliancePoints: health.compliancePoints,
      exposurePoints: health.exposurePoints,
      loggingPoints: health.loggingPoints,
    })
    .onConflictDoUpdate({
      target: [
        districtHealthSnapshotsTable.districtId,
        districtHealthSnapshotsTable.snapshotDate,
      ],
      set: {
        numericScore: health.numeric,
        grade: health.grade,
        compliancePoints: health.compliancePoints,
        exposurePoints: health.exposurePoints,
        loggingPoints: health.loggingPoints,
        capturedAt: new Date(),
      },
    });
}

export async function captureDistrictHealthSnapshotsForAllDistricts(): Promise<void> {
  const districts = await db.select({ id: districtsTable.id }).from(districtsTable);
  const snapshotDate = new Date();
  let written = 0;
  for (const d of districts) {
    try {
      await captureDistrictHealthSnapshot(d.id, snapshotDate);
      written++;
    } catch (err) {
      logger.warn(
        { err, districtId: d.id },
        "Failed to capture district health snapshot (non-fatal)",
      );
    }
  }
  logger.info({ written, total: districts.length }, "District health snapshots captured");
}

export interface HealthScoreTrend {
  current: { numeric: number; grade: string; snapshotDate: string } | null;
  priorWeek: { numeric: number; grade: string; snapshotDate: string } | null;
  /** numeric points delta vs. the snapshot taken ~7 days ago. null if no prior snapshot. */
  deltaPts: number | null;
  /** Up to ~6 weeks of weekly snapshots, oldest → newest, for sparkline rendering. */
  sparkline: { snapshotDate: string; numeric: number; grade: string }[];
}

export async function getHealthScoreTrendForDistrict(
  districtId: number,
): Promise<HealthScoreTrend> {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 49); // ~7 weeks back
  const sinceStr = sinceDate.toISOString().substring(0, 10);

  const rows = await db
    .select({
      snapshotDate: districtHealthSnapshotsTable.snapshotDate,
      numeric: districtHealthSnapshotsTable.numericScore,
      grade: districtHealthSnapshotsTable.grade,
    })
    .from(districtHealthSnapshotsTable)
    .where(and(
      eq(districtHealthSnapshotsTable.districtId, districtId),
      gte(districtHealthSnapshotsTable.snapshotDate, sinceStr),
    ))
    .orderBy(asc(districtHealthSnapshotsTable.snapshotDate));

  // Latest snapshot overall (could be older than 49 days, but we already
  // filtered by sinceStr — fall back to a separate lookup if needed).
  let current: HealthScoreTrend["current"] = null;
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    current = { numeric: last.numeric, grade: last.grade, snapshotDate: last.snapshotDate };
  } else {
    const latestRows = await db
      .select({
        snapshotDate: districtHealthSnapshotsTable.snapshotDate,
        numeric: districtHealthSnapshotsTable.numericScore,
        grade: districtHealthSnapshotsTable.grade,
      })
      .from(districtHealthSnapshotsTable)
      .where(eq(districtHealthSnapshotsTable.districtId, districtId))
      .orderBy(desc(districtHealthSnapshotsTable.snapshotDate))
      .limit(1);
    if (latestRows.length > 0) {
      current = {
        numeric: latestRows[0].numeric,
        grade: latestRows[0].grade,
        snapshotDate: latestRows[0].snapshotDate,
      };
    }
  }

  // Prior week: the snapshot closest to (current.snapshotDate - 7 days),
  // taken from rows already loaded.
  let priorWeek: HealthScoreTrend["priorWeek"] = null;
  if (current && rows.length > 0) {
    const targetDate = new Date(current.snapshotDate + "T00:00:00Z");
    targetDate.setUTCDate(targetDate.getUTCDate() - 7);
    const targetTs = targetDate.getTime();

    let bestRow: typeof rows[number] | null = null;
    let bestDiff = Infinity;
    for (const r of rows) {
      if (r.snapshotDate === current.snapshotDate) continue;
      const diff = Math.abs(new Date(r.snapshotDate + "T00:00:00Z").getTime() - targetTs);
      // Accept rows within +/-3 days of the target so a missing day doesn't
      // hide the trend; bias to the closest one.
      if (diff < bestDiff && diff <= 4 * 24 * 60 * 60 * 1000) {
        bestDiff = diff;
        bestRow = r;
      }
    }
    if (bestRow) {
      priorWeek = { numeric: bestRow.numeric, grade: bestRow.grade, snapshotDate: bestRow.snapshotDate };
    }
  }

  const deltaPts = current && priorWeek ? current.numeric - priorWeek.numeric : null;

  // Sparkline: collapse to weekly samples (one point per ISO week, the latest
  // snapshot in that week wins) so the tooltip shows ~6 evenly spaced points.
  const byWeek = new Map<string, { snapshotDate: string; numeric: number; grade: string }>();
  for (const r of rows) {
    const d = new Date(r.snapshotDate + "T00:00:00Z");
    // Compute Monday-anchored ISO week key.
    const day = d.getUTCDay();
    const diff = (day === 0 ? -6 : 1 - day);
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() + diff);
    const weekKey = monday.toISOString().substring(0, 10);
    byWeek.set(weekKey, { snapshotDate: r.snapshotDate, numeric: r.numeric, grade: r.grade });
  }
  const sparkline = Array.from(byWeek.values()).slice(-6);

  return { current, priorWeek, deltaPts, sparkline };
}

let snapshotTimeout: ReturnType<typeof setTimeout> | null = null;

function msUntilNext0245UTC(): number {
  // Run shortly after the compliance trend snapshot scheduler (02:30 UTC)
  // so both share the same nightly cadence without overlapping work.
  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    2, 45, 0, 0,
  ));
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - now.getTime();
}

function scheduleNextRun(): void {
  const delay = msUntilNext0245UTC();
  logger.info(
    { nextRunMs: delay, nextRunMin: Math.round(delay / 60000) },
    "District health snapshot: next run scheduled",
  );
  snapshotTimeout = setTimeout(() => {
    captureDistrictHealthSnapshotsForAllDistricts()
      .catch((err) =>
        logger.warn({ err }, "Scheduled district health snapshot run failed (non-fatal)"),
      )
      .finally(() => scheduleNextRun());
  }, delay);
}

export function startDistrictHealthSnapshotScheduler(): void {
  if (snapshotTimeout) return;

  ensureDistrictHealthSnapshotsTable()
    .then(() => captureDistrictHealthSnapshotsForAllDistricts())
    .catch((err) =>
      logger.warn({ err }, "Initial district health snapshot run failed (non-fatal)"),
    );

  scheduleNextRun();

  logger.info("District health snapshot scheduler started");
}

