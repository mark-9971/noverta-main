/**
 * In-process scheduler for automatic demo resets.
 *
 * Reads the cadence from the `demo_reset_schedule` singleton row on startup
 * and after every PUT to the config endpoint (caller invokes `reloadSchedule()`).
 *
 * Supported cadences:
 *   "off"         – no automatic resets
 *   "hourly"      – fire once per hour, at the top of the hour, 08:00–18:00
 *                   ET on weekdays (falls back to UTC if timezone lib absent)
 *   "before-demo" – poll every minute; reset 5 minutes before any upcoming
 *                   demo_requests row whose `scheduled_for` is within the
 *                   next 6–5 minute window
 */
import { db } from "@workspace/db";
import {
  demoResetScheduleTable,
  demoResetAuditTable,
  demoRequestsTable,
} from "@workspace/db";
import { eq, and, gte, lte, isNotNull } from "drizzle-orm";
import { logger } from "./logger";
// T-V2-08: scheduler now drives the canonical V2 + overlay reset chain
// instead of the legacy global-TRUNCATE seedDemoDistrict() + additive
// shaping passes. The hourly + before-demo schedulers are real runtime
// reset paths and must use the same engine the HTTP routes use.
import { runDemoResetV2 } from "../routes/sampleData";

export type ResetCadence = "off" | "hourly" | "before-demo";

let currentCadence: ResetCadence = "off";
let hourlyTimer: ReturnType<typeof setInterval> | null = null;
let beforeDemoTimer: ReturnType<typeof setInterval> | null = null;

// Track which demo request IDs we've already scheduled a reset for so we
// don't fire twice for the same slot.
const firedForRequestIds = new Set<number>();

// Process-wide mutex shared with the manual reset route.
// Exported so sampleData.ts can re-use / check the same flag.
export let schedulerResetInFlight = false;

async function runScheduledReset(
  triggeredBy: "scheduler" | "manual",
  cadenceSnapshot: string,
): Promise<void> {
  if (schedulerResetInFlight) {
    logger.warn("demo-reset scheduler: reset already in flight, skipping");
    return;
  }
  schedulerResetInFlight = true;
  const startedAt = new Date();

  // Insert audit row immediately so we have a record even if it crashes.
  const [auditRow] = await db
    .insert(demoResetAuditTable)
    .values({ triggeredBy, cadenceSnapshot, startedAt })
    .returning();

  const auditId = auditRow?.id;
  logger.info({ auditId, cadenceSnapshot }, "demo-reset scheduler: starting reset");

  try {
    // T-V2-08: canonical V2 + overlay engine. No legacy additive passes.
    // runDemoResetV2 runs ensureDemoDistrictId -> teardownSampleData ->
    // seedSampleDataForDistrict (which executes the W5 overlay + builds
    // the PostRunSummary internally).
    const outcome = await runDemoResetV2();

    const finishedAt = new Date();
    const elapsedMs = finishedAt.getTime() - startedAt.getTime();
    // PostRunSummary doesn't surface a single compliance percentage the
    // same way the legacy seedDemoComplianceVariety did. Fall back to
    // null on the audit row so we record provenance honestly instead of
    // synthesising a number.
    const overlayRan = outcome.summary?.layers?.overlay === true;

    if (auditId) {
      await db
        .update(demoResetAuditTable)
        .set({
          finishedAt,
          success: true,
          elapsedMs,
          districtId: outcome.districtId,
          compliancePct: null,
        })
        .where(eq(demoResetAuditTable.id, auditId));
    }

    logger.info(
      {
        auditId,
        elapsedMs,
        districtId: outcome.districtId,
        runId: outcome.summary?.runId,
        overlayRan,
        showcaseCaseCounts: outcome.summary?.showcaseCaseCounts,
      },
      "demo-reset scheduler: reset complete (V2 canonical)",
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const finishedAt = new Date();
    const elapsedMs = finishedAt.getTime() - startedAt.getTime();

    if (auditId) {
      await db
        .update(demoResetAuditTable)
        .set({ finishedAt, success: false, errorMessage, elapsedMs })
        .where(eq(demoResetAuditTable.id, auditId));
    }

    logger.error({ err, auditId }, "demo-reset scheduler: reset failed");
  } finally {
    schedulerResetInFlight = false;
  }
}

// ── Hourly scheduler ───────────────────────────────────────────────────────

function msUntilNextHour(): number {
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(now.getHours() + 1);
  return next.getTime() - now.getTime();
}

function isBusinessHour(): boolean {
  // UTC-based business hours 13:00–23:00 UTC ≈ 08:00–18:00 ET.
  const hour = new Date().getUTCHours();
  const day = new Date().getUTCDay(); // 0=Sun, 6=Sat
  return day >= 1 && day <= 5 && hour >= 13 && hour < 23;
}

function startHourlySchedule(): void {
  const delay = msUntilNextHour();
  logger.info(
    { delayMs: delay },
    "demo-reset scheduler: hourly cadence armed, first fire in",
  );

  const fireAndReschedule = () => {
    if (isBusinessHour()) {
      runScheduledReset("scheduler", "hourly").catch(() => {});
    } else {
      logger.debug("demo-reset scheduler: outside business hours, skipping hourly reset");
    }
    // Reschedule for the next hour.
    hourlyTimer = setTimeout(() => {
      fireAndReschedule();
      // Switch to a precise interval after the first aligned tick.
    }, msUntilNextHour());
  };

  hourlyTimer = setTimeout(fireAndReschedule, delay);
}

// ── Before-demo scheduler ──────────────────────────────────────────────────

function startBeforeDemoSchedule(): void {
  const POLL_INTERVAL_MS = 60_000; // check every minute

  const tick = async () => {
    try {
      const now = new Date();
      // Window: demos scheduled 5–6 minutes from now.
      const windowStart = new Date(now.getTime() + 5 * 60_000);
      const windowEnd = new Date(now.getTime() + 6 * 60_000);

      const upcoming = await db
        .select({ id: demoRequestsTable.id })
        .from(demoRequestsTable)
        .where(
          and(
            isNotNull(demoRequestsTable.scheduledFor),
            gte(demoRequestsTable.scheduledFor, windowStart),
            lte(demoRequestsTable.scheduledFor, windowEnd),
          ),
        );

      for (const row of upcoming) {
        if (!firedForRequestIds.has(row.id)) {
          firedForRequestIds.add(row.id);
          logger.info({ requestId: row.id }, "demo-reset scheduler: firing before-demo reset");
          runScheduledReset("scheduler", "before-demo").catch(() => {});
        }
      }

      // Prune the fired set to avoid unbounded growth (keep last 200 IDs).
      if (firedForRequestIds.size > 200) {
        const sorted = [...firedForRequestIds].slice(-200);
        firedForRequestIds.clear();
        sorted.forEach(id => firedForRequestIds.add(id));
      }
    } catch (err) {
      logger.error({ err }, "demo-reset scheduler: before-demo poll error");
    }
  };

  beforeDemoTimer = setInterval(tick, POLL_INTERVAL_MS);
  logger.info("demo-reset scheduler: before-demo cadence armed (polling every 60 s)");
}

// ── Teardown helpers ───────────────────────────────────────────────────────

function clearTimers(): void {
  if (hourlyTimer) { clearTimeout(hourlyTimer); hourlyTimer = null; }
  if (beforeDemoTimer) { clearInterval(beforeDemoTimer); beforeDemoTimer = null; }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Load the persisted cadence and arm the appropriate timer(s).
 * Safe to call on startup and after a config change.
 */
export async function reloadSchedule(): Promise<void> {
  clearTimers();

  let cadence: ResetCadence = "off";
  try {
    const [row] = await db
      .select({ cadence: demoResetScheduleTable.cadence })
      .from(demoResetScheduleTable)
      .where(eq(demoResetScheduleTable.id, 1));
    cadence = (row?.cadence as ResetCadence) ?? "off";
  } catch (err) {
    logger.warn({ err }, "demo-reset scheduler: could not read schedule config, defaulting to off");
  }

  currentCadence = cadence;
  logger.info({ cadence }, "demo-reset scheduler: loaded cadence");

  if (cadence === "hourly") {
    startHourlySchedule();
  } else if (cadence === "before-demo") {
    startBeforeDemoSchedule();
  }
}

/** Return the in-memory cadence (may differ from DB until reloadSchedule() is called). */
export function getCurrentCadence(): ResetCadence { return currentCadence; }
