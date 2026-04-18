import { db, districtsTable, medicaidReportSnapshotsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";
import {
  computeAgingReport,
  computeDenialsReport,
  computeProviderProductivityReport,
  computeRevenueTrendReport,
} from "./medicaidReports";

const SYSTEM_CLERK_ID = "system:auto-snapshot";
const SYSTEM_NAME = "Auto Snapshot";

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekStartLabel(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function captureSnapshotsForDistrict(districtId: number, weekStart: Date): Promise<void> {
  const label = `Auto — Week of ${formatWeekStartLabel(weekStart)}`;

  const [aging, denials, productivity, revenue] = await Promise.all([
    computeAgingReport(districtId),
    computeDenialsReport(districtId),
    computeProviderProductivityReport(districtId),
    computeRevenueTrendReport(districtId),
  ]);

  const rows: Array<{ reportType: string; data: Record<string, unknown> }> = [
    { reportType: "aging", data: aging as unknown as Record<string, unknown> },
    { reportType: "denials", data: denials as unknown as Record<string, unknown> },
    { reportType: "provider-productivity", data: productivity as unknown as Record<string, unknown> },
    { reportType: "revenue-trend", data: { ...revenue, _view: "monthly" } as unknown as Record<string, unknown> },
  ];

  for (const r of rows) {
    // Idempotency guard: skip if an auto snapshot for this (district, reportType, week)
    // already exists. Multiple app instances racing on Monday morning will all see
    // the same row and skip insertion. Manual snapshots are not affected since they
    // use a different savedByClerkId.
    const existing = await db
      .select({ id: medicaidReportSnapshotsTable.id })
      .from(medicaidReportSnapshotsTable)
      .where(and(
        eq(medicaidReportSnapshotsTable.districtId, districtId),
        eq(medicaidReportSnapshotsTable.reportType, r.reportType),
        eq(medicaidReportSnapshotsTable.label, label),
        eq(medicaidReportSnapshotsTable.savedByClerkId, SYSTEM_CLERK_ID),
      ))
      .limit(1);
    if (existing.length > 0) continue;

    await db.insert(medicaidReportSnapshotsTable).values({
      districtId,
      reportType: r.reportType,
      label,
      dateFrom: null,
      dateTo: null,
      savedByClerkId: SYSTEM_CLERK_ID,
      savedByName: SYSTEM_NAME,
      data: r.data,
    });
  }
}

export async function captureWeeklyMedicaidReportSnapshots(): Promise<void> {
  const weekStart = getWeekStart(new Date());
  const districts = await db.select({ id: districtsTable.id }).from(districtsTable);
  let success = 0;
  for (const d of districts) {
    try {
      await captureSnapshotsForDistrict(d.id, weekStart);
      success++;
    } catch (err) {
      logger.warn({ err, districtId: d.id }, "Failed to capture weekly billing report snapshots for district (non-fatal)");
    }
  }
  logger.info({ districts: districts.length, success }, "Weekly billing report snapshots captured");
}

let snapshotTimeout: ReturnType<typeof setTimeout> | null = null;

function msUntilNextMondayAt6AmUTC(): number {
  const now = new Date();
  const target = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    6, 0, 0, 0,
  ));
  const day = target.getUTCDay();
  const daysUntilMonday = day === 1 ? 0 : (day === 0 ? 1 : 8 - day);
  target.setUTCDate(target.getUTCDate() + daysUntilMonday);
  if (target.getTime() <= now.getTime()) {
    target.setUTCDate(target.getUTCDate() + 7);
  }
  return target.getTime() - now.getTime();
}

function scheduleNext(): void {
  const delay = msUntilNextMondayAt6AmUTC();
  logger.info({ nextRunMs: delay, nextRunMin: Math.round(delay / 60000) }, "Weekly billing report snapshot: next run scheduled");
  snapshotTimeout = setTimeout(() => {
    captureWeeklyMedicaidReportSnapshots()
      .catch((err) => logger.warn({ err }, "Scheduled weekly billing report snapshot run failed (non-fatal)"))
      .finally(() => scheduleNext());
  }, delay);
}

export function startMedicaidReportSnapshotScheduler(): void {
  if (snapshotTimeout) return;
  scheduleNext();
  logger.info("Weekly billing report snapshot scheduler started");
}
