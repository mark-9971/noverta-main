/**
 * Tests for runScheduledReports — the scheduler that generates and emails
 * scheduled report exports, then advances each schedule's next run timestamp.
 *
 * Covers:
 *  - A due, enabled scheduled report writes an export_history row, sets
 *    last_run_at, and advances next_run_at into the future.
 *  - Disabled schedules are skipped.
 *  - Schedules whose next_run_at is still in the future are skipped.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  db,
  scheduledReportsTable,
  exportHistoryTable,
} from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import {
  createDistrict,
  createSchool,
  cleanupDistrict,
} from "./helpers";
import { runScheduledReports } from "../src/lib/reminders";

let districtId: number;
const insertedScheduleIds: number[] = [];

beforeAll(async () => {
  const district = await createDistrict({ name: "Test District Scheduled Reports" });
  districtId = district.id;
  // student-roster does not require students to succeed (returns 0-row report).
  await createSchool(districtId);
});

afterAll(async () => {
  if (insertedScheduleIds.length > 0) {
    await db.delete(exportHistoryTable).where(
      sql`(parameters->>'scheduleId')::int IN (${sql.join(insertedScheduleIds.map(id => sql`${id}`), sql`, `)})`
    );
    await db.delete(scheduledReportsTable).where(inArray(scheduledReportsTable.id, insertedScheduleIds));
  }
  await cleanupDistrict(districtId);
});

async function makeSchedule(opts: {
  enabled?: boolean;
  nextRunAt: Date;
  frequency?: string;
}) {
  const [s] = await db.insert(scheduledReportsTable).values({
    districtId,
    reportType: "student-roster",
    frequency: opts.frequency ?? "weekly",
    format: "csv",
    filters: {},
    recipientEmails: ["scheduled-report-test@example.com"],
    createdBy: "test-user",
    enabled: opts.enabled ?? true,
    nextRunAt: opts.nextRunAt,
  }).returning();
  insertedScheduleIds.push(s.id);
  return s;
}

async function fetchExportHistory(scheduleId: number) {
  return db.execute(sql`
    SELECT * FROM export_history
    WHERE (parameters->>'scheduleId')::int = ${scheduleId}
  `);
}

describe("runScheduledReports", () => {
  it("processes a due, enabled schedule — writes export_history and advances next_run_at", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const schedule = await makeSchedule({ nextRunAt: yesterday, frequency: "weekly" });

    await runScheduledReports();

    // export_history row created for this schedule
    const hist = await fetchExportHistory(schedule.id);
    expect(hist.rows.length).toBe(1);
    expect((hist.rows[0] as { report_type: string }).report_type).toBe("student-roster");

    // schedule timestamps updated
    const [updated] = await db.select().from(scheduledReportsTable).where(eq(scheduledReportsTable.id, schedule.id));
    expect(updated.lastRunAt).not.toBeNull();
    expect(updated.nextRunAt).not.toBeNull();
    expect(updated.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("skips a disabled schedule even when it is past due", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const schedule = await makeSchedule({ enabled: false, nextRunAt: yesterday });

    await runScheduledReports();

    const hist = await fetchExportHistory(schedule.id);
    expect(hist.rows.length).toBe(0);

    const [unchanged] = await db.select().from(scheduledReportsTable).where(eq(scheduledReportsTable.id, schedule.id));
    expect(unchanged.lastRunAt).toBeNull();
  });

  it("skips a schedule whose next_run_at is still in the future", async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const schedule = await makeSchedule({ enabled: true, nextRunAt: tomorrow });

    await runScheduledReports();

    const hist = await fetchExportHistory(schedule.id);
    expect(hist.rows.length).toBe(0);

    const [unchanged] = await db.select().from(scheduledReportsTable).where(eq(scheduledReportsTable.id, schedule.id));
    expect(unchanged.lastRunAt).toBeNull();
  });
});
