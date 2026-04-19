// tenant-scope: platform-admin
// All routes in this file are protected by requirePlatformAdmin (see below).
// This router is registered under /api/support and is inaccessible to district users.
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db, districtsTable, districtSubscriptionsTable, schoolsTable, studentsTable,
  staffTable, sisConnectionsTable, sisSyncLogsTable, importsTable,
  communicationEventsTable, onboardingProgressTable, auditLogsTable,
  viewAsSessionsTable, demoReadinessRunsTable,
  TIER_MODULES, MODULE_FEATURES, MODULE_LABELS, TIER_LABELS,
  type DistrictTier, type ProductModule, type FeatureKey,
} from "@workspace/db";
import { and, eq, inArray, isNull, sql, desc, ilike, or } from "drizzle-orm";
import { requirePlatformAdmin, type AuthedRequest } from "../middlewares/auth";
import { logAudit } from "../lib/auditLog";
import {
  generateToken, hashToken, loadActiveViewAsSession,
  endActiveSessionsForAdmin, endSessionByToken,
  invalidateViewAsTokenCache, VIEW_AS_HEADER, VIEW_AS_TTL_MS,
} from "../lib/viewAsSession";
import { isRole } from "../lib/permissions";
import { runDataHealthChecks } from "../lib/dataHealthChecks";
import { runDistrictReadinessChecks } from "../lib/pilotReadiness";
import { deriveDistrictMode } from "../lib/districtMode";
import { getRecentAccessDenials } from "../lib/accessDenials";
import { isSisWorkerRunning } from "../lib/sis/worker";
import { clerkClient } from "@clerk/express";
import { seedDemoDistrict } from "../../../../lib/db/src/seed-demo-district";
import { seedDemoComplianceVariety } from "../../../../lib/db/src/seed-demo-compliance-variety";

const router: IRouter = Router();

// All endpoints in this router are platform-admin only. Path-scoped to "/support"
// so the middleware does NOT leak into other routers mounted after this one in
// routes/index.ts (a path-less router.use() would block every subsequently-mounted
// route because Express enters this sub-router for every request that reaches it).
router.use("/support", requirePlatformAdmin);

function parseDistrictId(req: Request): number | null {
  const raw = req.params.id;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function loadDistrictSchoolIds(districtId: number): Promise<number[]> {
  const rows = await db.select({ id: schoolsTable.id }).from(schoolsTable)
    .where(and(eq(schoolsTable.districtId, districtId), isNull(schoolsTable.deletedAt)));
  return rows.map(r => r.id);
}

/**
 * GET /api/support/districts
 * One row per district with the rollup metrics a support engineer needs to triage:
 * mode (demo/pilot/paid/unconfigured), counts, last session, last sync,
 * open critical alerts, and active import status.
 */
router.get("/support/districts", async (_req, res) => {
  try {
    const result = await db.execute(sql`
      WITH district_rows AS (
        SELECT d.id, d.name, d.state, d.is_demo, d.is_pilot, d.tier, d.tier_override
        FROM districts d
        ORDER BY d.name
      ),
      sub AS (
        SELECT district_id, status, plan_tier, current_period_end
        FROM district_subscriptions
      ),
      schools_per_district AS (
        SELECT district_id, ARRAY_AGG(id) AS school_ids
        FROM schools WHERE deleted_at IS NULL GROUP BY district_id
      ),
      counts AS (
        SELECT
          d.id AS district_id,
          COALESCE((
            SELECT COUNT(*)::int FROM students s
            WHERE s.school_id = ANY(spd.school_ids)
              AND s.status = 'active' AND s.deleted_at IS NULL
          ), 0) AS active_students,
          COALESCE((
            SELECT COUNT(*)::int FROM staff st
            WHERE st.school_id = ANY(spd.school_ids)
              AND st.status = 'active' AND st.deleted_at IS NULL
          ), 0) AS active_staff,
          COALESCE((
            SELECT COUNT(*)::int FROM session_logs sl
            JOIN students s ON s.id = sl.student_id
            WHERE s.school_id = ANY(spd.school_ids)
              AND sl.session_date >= (CURRENT_DATE - INTERVAL '7 days')::text
              AND sl.deleted_at IS NULL
          ), 0) AS sessions_last_7d,
          (
            SELECT MAX(sl.session_date) FROM session_logs sl
            JOIN students s ON s.id = sl.student_id
            WHERE s.school_id = ANY(spd.school_ids)
              AND sl.deleted_at IS NULL
          ) AS last_session_date,
          (
            SELECT MAX(sc.last_sync_at) FROM sis_connections sc
            WHERE sc.district_id = d.id
          ) AS last_sync_at,
          COALESCE((
            SELECT COUNT(*)::int FROM alerts a
            JOIN students s ON s.id = a.student_id
            WHERE s.school_id = ANY(spd.school_ids)
              AND a.resolved = false AND a.severity = 'critical'
          ), 0) AS open_critical_alerts
        FROM district_rows d
        LEFT JOIN schools_per_district spd ON spd.district_id = d.id
      )
      SELECT
        dr.*,
        sub.status AS subscription_status,
        sub.plan_tier AS subscription_plan,
        sub.current_period_end,
        c.active_students, c.active_staff, c.sessions_last_7d,
        c.last_session_date, c.last_sync_at, c.open_critical_alerts
      FROM district_rows dr
      LEFT JOIN sub ON sub.district_id = dr.id
      LEFT JOIN counts c ON c.district_id = dr.id
    `);

    const districts = (result.rows as Array<Record<string, unknown>>).map(r => {
      const subscriptionStatus = r.subscription_status as string | null;
      const mode = deriveDistrictMode({
        isDemo: !!r.is_demo,
        isPilot: !!r.is_pilot,
        subscriptionStatus,
      });

      return {
        districtId: Number(r.id),
        name: r.name as string,
        state: r.state as string | null,
        mode,
        tier: (r.tier_override || r.tier || "essentials") as string,
        subscriptionStatus,
        subscriptionPlan: r.subscription_plan as string | null,
        currentPeriodEnd: r.current_period_end as string | null,
        activeStudents: Number(r.active_students || 0),
        activeStaff: Number(r.active_staff || 0),
        sessionsLast7d: Number(r.sessions_last_7d || 0),
        lastSessionDate: r.last_session_date as string | null,
        lastSyncAt: r.last_sync_at as string | null,
        openCriticalAlerts: Number(r.open_critical_alerts || 0),
      };
    });

    res.json({ districts });
  } catch (err) {
    console.error("[Support] districts list error:", err);
    res.status(500).json({ error: "Failed to load districts" });
  }
});

/**
 * GET /api/support/districts/:id
 * Detail summary for a single district: identity, mode, counts, latest activity timestamps.
 */
router.get("/support/districts/:id", async (req: Request, res: Response) => {
  const districtId = parseDistrictId(req);
  if (!districtId) {
    res.status(400).json({ error: "Invalid district id" });
    return;
  }
  try {
    const [district] = await db.select().from(districtsTable).where(eq(districtsTable.id, districtId)).limit(1);
    if (!district) {
      res.status(404).json({ error: "District not found" });
      return;
    }

    const [subscription] = await db.select().from(districtSubscriptionsTable)
      .where(eq(districtSubscriptionsTable.districtId, districtId)).limit(1);

    const schoolIds = await loadDistrictSchoolIds(districtId);

    const [counts] = schoolIds.length > 0
      ? await db.select({
          activeStudents: sql<number>`COUNT(DISTINCT CASE WHEN ${studentsTable.status} = 'active' AND ${studentsTable.deletedAt} IS NULL THEN ${studentsTable.id} END)`.mapWith(Number),
          totalStudents: sql<number>`COUNT(DISTINCT ${studentsTable.id})`.mapWith(Number),
        }).from(studentsTable).where(inArray(studentsTable.schoolId, schoolIds))
      : [{ activeStudents: 0, totalStudents: 0 }];

    const [staffCounts] = schoolIds.length > 0
      ? await db.select({
          activeStaff: sql<number>`COUNT(DISTINCT CASE WHEN ${staffTable.status} = 'active' AND ${staffTable.deletedAt} IS NULL THEN ${staffTable.id} END)`.mapWith(Number),
          totalStaff: sql<number>`COUNT(DISTINCT ${staffTable.id})`.mapWith(Number),
        }).from(staffTable).where(inArray(staffTable.schoolId, schoolIds))
      : [{ activeStaff: 0, totalStaff: 0 }];

    const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    // Two separate aggregates: windowed counts (7d), and all-time MAX(session_date).
    // Combining them previously caused last_session_date to be NULL whenever the most
    // recent session was older than 7 days, contradicting the rollup endpoint.
    const [sessionMetrics] = schoolIds.length > 0
      ? await db.execute(sql`
          SELECT
            COUNT(*) FILTER (WHERE sl.session_date >= ${sevenDaysAgoIso})::int AS sessions_last_7d,
            COUNT(*) FILTER (WHERE sl.session_date >= ${sevenDaysAgoIso} AND sl.status = 'missed')::int AS missed_last_7d,
            MAX(sl.session_date) AS last_session_date
          FROM session_logs sl
          JOIN students s ON s.id = sl.student_id
          WHERE s.school_id = ANY(${schoolIds})
            AND sl.deleted_at IS NULL
        `).then(r => r.rows as Array<Record<string, unknown>>)
      : [{ sessions_last_7d: 0, missed_last_7d: 0, last_session_date: null }];

    const sisConnections = await db.select().from(sisConnectionsTable)
      .where(eq(sisConnectionsTable.districtId, districtId));

    const lastSyncAt = sisConnections.reduce<Date | null>((acc, c) => {
      if (!c.lastSyncAt) return acc;
      const d = new Date(c.lastSyncAt as unknown as string);
      return !acc || d > acc ? d : acc;
    }, null);

    const mode = deriveDistrictMode({
      isDemo: district.isDemo,
      isPilot: district.isPilot,
      subscriptionStatus: subscription?.status,
    });

    res.json({
      district: {
        id: district.id,
        name: district.name,
        state: district.state,
        isDemo: district.isDemo,
        isPilot: district.isPilot,
        tier: district.tierOverride || district.tier || "essentials",
        createdAt: district.createdAt,
      },
      mode,
      subscription: subscription ? {
        planTier: subscription.planTier,
        status: subscription.status,
        seatLimit: subscription.seatLimit,
        currentPeriodEnd: subscription.currentPeriodEnd,
        addOns: subscription.addOns ?? [],
        stripeCustomerId: subscription.stripeCustomerId,
      } : null,
      counts: {
        schools: schoolIds.length,
        activeStudents: counts?.activeStudents ?? 0,
        totalStudents: counts?.totalStudents ?? 0,
        activeStaff: staffCounts?.activeStaff ?? 0,
        totalStaff: staffCounts?.totalStaff ?? 0,
        sessionsLast7d: Number(sessionMetrics?.sessions_last_7d || 0),
        missedLast7d: Number(sessionMetrics?.missed_last_7d || 0),
      },
      activity: {
        lastSessionDate: sessionMetrics?.last_session_date as string | null,
        lastSyncAt: lastSyncAt ? lastSyncAt.toISOString() : null,
        sisConnections: sisConnections.map(c => ({
          id: c.id, provider: c.provider, label: c.label, status: c.status,
          enabled: c.enabled, lastSyncAt: c.lastSyncAt,
        })),
      },
    });
  } catch (err) {
    console.error("[Support] district detail error:", err);
    res.status(500).json({ error: "Failed to load district detail" });
  }
});

/**
 * GET /api/support/districts/:id/data-health
 * Reuses the same per-district data quality checks the district admin sees,
 * but accessible to platform admins for any district.
 */
router.get("/support/districts/:id/data-health", async (req: Request, res: Response) => {
  const districtId = parseDistrictId(req);
  if (!districtId) {
    res.status(400).json({ error: "Invalid district id" });
    return;
  }
  try {
    const report = await runDataHealthChecks(districtId);
    res.json(report);
  } catch (err) {
    console.error("[Support] data-health error:", err);
    res.status(500).json({ error: "Failed to run data health check" });
  }
});

/**
 * GET /api/support/districts/:id/inactive-staff?days=14
 * Clinical staff who haven't logged a session in the lookback window.
 * Useful for spotting providers who need outreach or training.
 */
router.get("/support/districts/:id/inactive-staff", async (req: Request, res: Response) => {
  const districtId = parseDistrictId(req);
  if (!districtId) {
    res.status(400).json({ error: "Invalid district id" });
    return;
  }
  const days = Math.max(1, Math.min(180, Number(req.query.days) || 14));
  try {
    const schoolIds = await loadDistrictSchoolIds(districtId);
    if (schoolIds.length === 0) {
      res.json({ days, inactiveStaff: [] });
      return;
    }

    const cutoffIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const result = await db.execute(sql`
      SELECT
        st.id, st.first_name, st.last_name, st.role, st.email,
        MAX(sl.session_date) AS last_session_date,
        COUNT(sl.id) FILTER (WHERE sl.session_date >= ${cutoffIso} AND sl.deleted_at IS NULL) AS sessions_in_window,
        COUNT(DISTINCT sa.student_id) AS assigned_students,
        COUNT(DISTINCT sb.id) FILTER (WHERE sb.deleted_at IS NULL) AS schedule_blocks
      FROM staff st
      LEFT JOIN session_logs sl ON sl.staff_id = st.id
      LEFT JOIN staff_assignments sa ON sa.staff_id = st.id
      LEFT JOIN schedule_blocks sb ON sb.staff_id = st.id
      WHERE st.school_id = ANY(${schoolIds})
        AND st.status = 'active'
        AND st.deleted_at IS NULL
        AND st.role IN ('provider', 'bcba', 'slp', 'ot', 'pt', 'para', 'counselor', 'sped_teacher')
      GROUP BY st.id
      HAVING COUNT(sl.id) FILTER (WHERE sl.session_date >= ${cutoffIso} AND sl.deleted_at IS NULL) = 0
      ORDER BY MAX(sl.session_date) ASC NULLS FIRST, st.last_name
    `);

    const inactiveStaff = (result.rows as Array<Record<string, unknown>>).map(r => ({
      id: Number(r.id),
      name: `${r.first_name} ${r.last_name}`,
      role: r.role as string,
      email: r.email as string | null,
      lastSessionDate: r.last_session_date as string | null,
      sessionsInWindow: Number(r.sessions_in_window || 0),
      assignedStudents: Number(r.assigned_students || 0),
      scheduleBlocks: Number(r.schedule_blocks || 0),
    }));

    res.json({ days, inactiveStaff });
  } catch (err) {
    console.error("[Support] inactive-staff error:", err);
    res.status(500).json({ error: "Failed to load inactive staff" });
  }
});

/**
 * GET /api/support/districts/:id/recent-syncs?limit=20
 * Recent SIS sync log entries for this district's connections, with errors/warnings.
 */
router.get("/support/districts/:id/recent-syncs", async (req: Request, res: Response) => {
  const districtId = parseDistrictId(req);
  if (!districtId) {
    res.status(400).json({ error: "Invalid district id" });
    return;
  }
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
  try {
    const connections = await db.select({ id: sisConnectionsTable.id, provider: sisConnectionsTable.provider, label: sisConnectionsTable.label })
      .from(sisConnectionsTable).where(eq(sisConnectionsTable.districtId, districtId));
    if (connections.length === 0) {
      res.json({ syncs: [] });
      return;
    }
    const connMap = new Map(connections.map(c => [c.id, c]));
    const connectionIds = connections.map(c => c.id);

    const syncs = await db.select().from(sisSyncLogsTable)
      .where(inArray(sisSyncLogsTable.connectionId, connectionIds))
      .orderBy(desc(sisSyncLogsTable.startedAt))
      .limit(limit);

    res.json({
      syncs: syncs.map(s => {
        const conn = connMap.get(s.connectionId);
        return {
          id: s.id,
          connectionId: s.connectionId,
          connectionLabel: conn?.label ?? `Connection #${s.connectionId}`,
          provider: conn?.provider ?? null,
          syncType: s.syncType,
          status: s.status,
          studentsAdded: s.studentsAdded,
          studentsUpdated: s.studentsUpdated,
          studentsArchived: s.studentsArchived,
          staffAdded: s.staffAdded,
          staffUpdated: s.staffUpdated,
          totalRecords: s.totalRecords,
          errors: s.errors,
          warnings: s.warnings,
          triggeredBy: s.triggeredBy,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
        };
      }),
    });
  } catch (err) {
    console.error("[Support] recent-syncs error:", err);
    res.status(500).json({ error: "Failed to load sync logs" });
  }
});

/**
 * GET /api/support/imports/recent?limit=20&districtId=42
 * Recent CSV imports across all districts (platform-admin only).
 * Now includes districtId attribution per row. Optionally filter by ?districtId=.
 */
router.get("/support/imports/recent", async (req: Request, res: Response) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));

  // Strict districtId validation — must be a positive integer if supplied.
  // A malformed value (NaN, float, negative) returns 400 instead of a DB error.
  let filterDistrictId: number | null = null;
  if (req.query.districtId !== undefined) {
    const raw = req.query.districtId;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      res.status(400).json({ error: "districtId must be a positive integer" });
      return;
    }
    filterDistrictId = n;
  }
  try {
    const baseQuery = db.select().from(importsTable).orderBy(desc(importsTable.createdAt)).limit(limit);
    const imports = filterDistrictId != null
      ? await baseQuery.where(eq(importsTable.districtId, filterDistrictId))
      : await baseQuery;
    res.json({
      imports: imports.map(i => ({
        id: i.id,
        districtId: i.districtId,
        importType: i.importType,
        fileName: i.fileName,
        status: i.status,
        rowsProcessed: i.rowsProcessed,
        rowsImported: i.rowsImported,
        rowsErrored: i.rowsErrored,
        errorSummary: i.errorSummary,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
      })),
    });
  } catch (err) {
    console.error("[Support] recent-imports error:", err);
    res.status(500).json({ error: "Failed to load imports" });
  }
});

/**
 * GET /api/support/districts/:id/metric-debug
 * Surfaces the raw counts behind the headline dashboard numbers so support
 * engineers can quickly diagnose "why does my dashboard look wrong?".
 * Returns: students/staff/services snapshot, plus this-week vs last-week session counts
 * (scheduled, completed, missed) so seat-cap, compliance, and delivery numbers can be
 * checked against the source data.
 */
router.get("/support/districts/:id/metric-debug", async (req: Request, res: Response) => {
  const districtId = parseDistrictId(req);
  if (!districtId) {
    res.status(400).json({ error: "Invalid district id" });
    return;
  }
  try {
    const schoolIds = await loadDistrictSchoolIds(districtId);
    if (schoolIds.length === 0) {
      res.json({ districtId, schoolCount: 0, snapshot: null, sessions: null });
      return;
    }

    const [snapshot] = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM students WHERE school_id = ANY(${schoolIds}) AND status = 'active' AND deleted_at IS NULL) AS active_students,
        (SELECT COUNT(*)::int FROM students WHERE school_id = ANY(${schoolIds}) AND deleted_at IS NULL) AS total_students,
        (SELECT COUNT(*)::int FROM staff WHERE school_id = ANY(${schoolIds}) AND status = 'active' AND deleted_at IS NULL) AS active_staff,
        (SELECT COUNT(*)::int FROM service_requirements sr JOIN students s ON s.id = sr.student_id WHERE s.school_id = ANY(${schoolIds}) AND sr.active = true) AS active_service_reqs,
        (SELECT COUNT(*)::int FROM service_requirements sr JOIN students s ON s.id = sr.student_id WHERE s.school_id = ANY(${schoolIds}) AND sr.active = true AND sr.provider_id IS NULL) AS reqs_missing_provider,
        (SELECT COUNT(*)::int FROM schedule_blocks sb JOIN staff st ON st.id = sb.staff_id WHERE st.school_id = ANY(${schoolIds}) AND sb.deleted_at IS NULL) AS active_schedule_blocks,
        (SELECT COUNT(*)::int FROM iep_documents id_ JOIN students s ON s.id = id_.student_id WHERE s.school_id = ANY(${schoolIds}) AND id_.deleted_at IS NULL) AS iep_documents,
        (SELECT COUNT(*)::int FROM iep_goals g JOIN students s ON s.id = g.student_id WHERE s.school_id = ANY(${schoolIds}) AND g.active = true) AS active_goals
    `).then(r => r.rows as Array<Record<string, unknown>>);

    // Buckets: this week (last 7d), previous 7d, last 30d. Compute as windows ending today.
    const today = new Date();
    const isoDaysAgo = (n: number) => new Date(today.getTime() - n * 86400000).toISOString().slice(0, 10);
    const [sessions] = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE sl.session_date >= ${isoDaysAgo(7)} AND sl.deleted_at IS NULL)::int AS total_7d,
        COUNT(*) FILTER (WHERE sl.session_date >= ${isoDaysAgo(7)} AND sl.status = 'completed' AND sl.deleted_at IS NULL)::int AS completed_7d,
        COUNT(*) FILTER (WHERE sl.session_date >= ${isoDaysAgo(7)} AND sl.status = 'missed' AND sl.deleted_at IS NULL)::int AS missed_7d,
        COUNT(*) FILTER (WHERE sl.session_date >= ${isoDaysAgo(14)} AND sl.session_date < ${isoDaysAgo(7)} AND sl.deleted_at IS NULL)::int AS total_prev_7d,
        COUNT(*) FILTER (WHERE sl.session_date >= ${isoDaysAgo(30)} AND sl.deleted_at IS NULL)::int AS total_30d,
        COUNT(*) FILTER (WHERE sl.session_date >= ${isoDaysAgo(30)} AND sl.status = 'completed' AND sl.deleted_at IS NULL)::int AS completed_30d,
        COUNT(*) FILTER (WHERE sl.session_date >= ${isoDaysAgo(30)} AND sl.status = 'missed' AND sl.deleted_at IS NULL)::int AS missed_30d,
        COUNT(DISTINCT sl.staff_id) FILTER (WHERE sl.session_date >= ${isoDaysAgo(30)} AND sl.deleted_at IS NULL)::int AS distinct_loggers_30d
      FROM session_logs sl
      JOIN students s ON s.id = sl.student_id
      WHERE s.school_id = ANY(${schoolIds})
    `).then(r => r.rows as Array<Record<string, unknown>>);

    res.json({
      districtId,
      schoolCount: schoolIds.length,
      snapshot: {
        activeStudents: Number(snapshot?.active_students || 0),
        totalStudents: Number(snapshot?.total_students || 0),
        activeStaff: Number(snapshot?.active_staff || 0),
        activeServiceReqs: Number(snapshot?.active_service_reqs || 0),
        reqsMissingProvider: Number(snapshot?.reqs_missing_provider || 0),
        activeScheduleBlocks: Number(snapshot?.active_schedule_blocks || 0),
        iepDocuments: Number(snapshot?.iep_documents || 0),
        activeGoals: Number(snapshot?.active_goals || 0),
      },
      sessions: {
        last7d: {
          total: Number(sessions?.total_7d || 0),
          completed: Number(sessions?.completed_7d || 0),
          missed: Number(sessions?.missed_7d || 0),
        },
        prev7d: { total: Number(sessions?.total_prev_7d || 0) },
        last30d: {
          total: Number(sessions?.total_30d || 0),
          completed: Number(sessions?.completed_30d || 0),
          missed: Number(sessions?.missed_30d || 0),
          distinctLoggers: Number(sessions?.distinct_loggers_30d || 0),
        },
      },
    });
  } catch (err) {
    console.error("[Support] metric-debug error:", err);
    res.status(500).json({ error: "Failed to load metric debug" });
  }
});

/**
 * GET /api/support/districts/:id/readiness
 * Wraps the in-app pilot-readiness checks (data + config + operations groups)
 * so support can answer "is this district production-ready?" without asking
 * the customer admin to log in and run it themselves.
 */
router.get("/support/districts/:id/readiness", async (req: Request, res: Response) => {
  const districtId = parseDistrictId(req);
  if (!districtId) { res.status(400).json({ error: "Invalid district id" }); return; }
  try {
    const report = await runDistrictReadinessChecks(districtId);
    res.json(report);
  } catch (err) {
    console.error("[Support] readiness error:", err);
    res.status(500).json({ error: "Failed to run readiness checks" });
  }
});

/**
 * GET /api/support/districts/:id/onboarding
 * Returns the per-step onboarding_progress rows so support can see exactly
 * which steps a district has skipped (e.g. "they never completed the SIS step,
 * which is why nothing imported").
 */
router.get("/support/districts/:id/onboarding", async (req: Request, res: Response) => {
  const districtId = parseDistrictId(req);
  if (!districtId) { res.status(400).json({ error: "Invalid district id" }); return; }
  try {
    const rows = await db.select().from(onboardingProgressTable)
      .where(eq(onboardingProgressTable.districtId, districtId))
      .orderBy(onboardingProgressTable.stepKey);
    res.json({
      districtId,
      steps: rows.map(r => ({
        stepKey: r.stepKey,
        completed: r.completed,
        completedAt: r.completedAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (err) {
    console.error("[Support] onboarding error:", err);
    res.status(500).json({ error: "Failed to load onboarding progress" });
  }
});

/**
 * GET /api/support/districts/:id/feature-access
 * Resolves the effective tier (override vs base), enumerates which modules
 * and features are accessible, and flags add-ons. Lets support quickly
 * confirm whether a missing screen is a tier-gate problem vs a real bug.
 */
router.get("/support/districts/:id/feature-access", async (req: Request, res: Response) => {
  const districtId = parseDistrictId(req);
  if (!districtId) { res.status(400).json({ error: "Invalid district id" }); return; }
  try {
    const [district] = await db.select({
      tier: districtsTable.tier,
      tierOverride: districtsTable.tierOverride,
      isDemo: districtsTable.isDemo,
      isPilot: districtsTable.isPilot,
    }).from(districtsTable).where(eq(districtsTable.id, districtId)).limit(1);
    if (!district) { res.status(404).json({ error: "District not found" }); return; }

    const [sub] = await db.select({
      addOns: districtSubscriptionsTable.addOns,
      planTier: districtSubscriptionsTable.planTier,
      status: districtSubscriptionsTable.status,
    }).from(districtSubscriptionsTable).where(eq(districtSubscriptionsTable.districtId, districtId)).limit(1);

    const baseTier = (district.tier || "essentials") as DistrictTier;
    const effectiveTier = (district.tierOverride || district.tier || "essentials") as DistrictTier;
    const addOns = sub?.addOns ?? [];
    const includedModules = new Set<ProductModule>(TIER_MODULES[effectiveTier]);
    const grantsAllAccess = district.isDemo || district.isPilot;

    const modules = (Object.keys(MODULE_FEATURES) as ProductModule[]).map((modKey) => {
      const includedByTier = includedModules.has(modKey);
      const includedByAddOn = addOns.includes(modKey);
      const accessible = grantsAllAccess || includedByTier || includedByAddOn;
      return {
        moduleKey: modKey,
        moduleLabel: MODULE_LABELS[modKey],
        accessible,
        accessReason: grantsAllAccess
          ? (district.isDemo ? "demo district — all access" : "pilot district — all access")
          : includedByTier
            ? `included in ${TIER_LABELS[effectiveTier]} tier`
            : includedByAddOn
              ? "purchased as add-on"
              : `requires upgrade or add-on`,
        features: MODULE_FEATURES[modKey].map(fk => ({ featureKey: fk, accessible })),
      };
    });

    res.json({
      districtId,
      isDemo: district.isDemo,
      isPilot: district.isPilot,
      baseTier,
      baseTierLabel: TIER_LABELS[baseTier],
      effectiveTier,
      effectiveTierLabel: TIER_LABELS[effectiveTier],
      tierOverridden: !!district.tierOverride,
      subscriptionPlanTier: sub?.planTier ?? null,
      subscriptionStatus: sub?.status ?? null,
      addOns,
      grantsAllAccess,
      modules,
    });
  } catch (err) {
    console.error("[Support] feature-access error:", err);
    res.status(500).json({ error: "Failed to load feature access" });
  }
});

/**
 * GET /api/support/districts/:id/recent-emails?limit=50
 * Recent communication_events for students in this district, with status,
 * type, and failure reason. Surfaces "guardian never got the notification"
 * complaints quickly.
 */
router.get("/support/districts/:id/recent-emails", async (req: Request, res: Response) => {
  const districtId = parseDistrictId(req);
  if (!districtId) { res.status(400).json({ error: "Invalid district id" }); return; }
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
  try {
    const schoolIds = await loadDistrictSchoolIds(districtId);
    if (schoolIds.length === 0) {
      res.json({ providerConfigured: !!process.env.RESEND_API_KEY, summary: null, events: [] });
      return;
    }

    // Aggregate counts (last 7 days) by status, then list recent events.
    const summaryRows = await db.execute(sql`
      SELECT ce.status, COUNT(*)::int AS n
      FROM communication_events ce
      JOIN students s ON s.id = ce.student_id
      WHERE s.school_id = ANY(${schoolIds})
        AND ce.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY ce.status
    `);
    const summary: Record<string, number> = {};
    for (const r of summaryRows.rows as Array<Record<string, unknown>>) {
      summary[String(r.status)] = Number(r.n || 0);
    }

    const eventsResult = await db.execute(sql`
      SELECT ce.id, ce.status, ce.type, ce.subject, ce.to_email, ce.to_name,
             ce.failed_reason, ce.sent_at, ce.delivered_at, ce.failed_at, ce.created_at,
             s.first_name, s.last_name
      FROM communication_events ce
      JOIN students s ON s.id = ce.student_id
      WHERE s.school_id = ANY(${schoolIds})
      ORDER BY ce.created_at DESC
      LIMIT ${limit}
    `);

    const events = (eventsResult.rows as Array<Record<string, unknown>>).map(r => ({
      id: Number(r.id),
      status: r.status as string,
      type: r.type as string,
      subject: r.subject as string,
      toEmail: r.to_email as string | null,
      toName: r.to_name as string | null,
      failedReason: r.failed_reason as string | null,
      sentAt: r.sent_at as string | null,
      deliveredAt: r.delivered_at as string | null,
      failedAt: r.failed_at as string | null,
      createdAt: r.created_at as string,
      studentName: `${r.first_name} ${r.last_name}`,
    }));

    res.json({
      providerConfigured: !!process.env.RESEND_API_KEY,
      summary,
      events,
    });
  } catch (err) {
    console.error("[Support] recent-emails error:", err);
    res.status(500).json({ error: "Failed to load recent emails" });
  }
});

/**
 * GET /api/support/email-status
 * Global email-provider health: is RESEND_API_KEY configured, 7-day platform-wide
 * counts by status, and the most recent failures across all districts.
 */
router.get("/support/email-status", async (_req: Request, res: Response) => {
  try {
    const summaryRows = await db.execute(sql`
      SELECT status, COUNT(*)::int AS n
      FROM communication_events
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY status
    `);
    const summary: Record<string, number> = {};
    for (const r of summaryRows.rows as Array<Record<string, unknown>>) {
      summary[String(r.status)] = Number(r.n || 0);
    }

    const failures = await db.select({
      id: communicationEventsTable.id,
      type: communicationEventsTable.type,
      subject: communicationEventsTable.subject,
      toEmail: communicationEventsTable.toEmail,
      failedReason: communicationEventsTable.failedReason,
      failedAt: communicationEventsTable.failedAt,
      createdAt: communicationEventsTable.createdAt,
    }).from(communicationEventsTable)
      .where(or(
        eq(communicationEventsTable.status, "failed"),
        eq(communicationEventsTable.status, "not_configured"),
      ))
      .orderBy(desc(communicationEventsTable.createdAt))
      .limit(20);

    res.json({
      providerConfigured: !!process.env.RESEND_API_KEY,
      providerName: "Resend",
      window: "last 7 days",
      summary,
      recentFailures: failures.map(f => ({
        id: f.id,
        type: f.type,
        subject: f.subject,
        toEmail: f.toEmail,
        failedReason: f.failedReason,
        failedAt: f.failedAt,
        createdAt: f.createdAt,
      })),
    });
  } catch (err) {
    console.error("[Support] email-status error:", err);
    res.status(500).json({ error: "Failed to load email status" });
  }
});

/**
 * GET /api/support/access-denials?limit=100
 * Reads the in-memory ring buffer of recent 401/403 decisions emitted by
 * auth, role, district-scope, platform-admin, and tier-gate middlewares.
 * Newest first. Process-local — restarts wipe it. See lib/accessDenials.ts.
 */
router.get("/support/access-denials", async (req: Request, res: Response) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
  try {
    const denials = getRecentAccessDenials(limit);
    res.json({
      note: "In-memory ring buffer (max 200 entries). Cleared on server restart.",
      denials,
    });
  } catch (err) {
    console.error("[Support] access-denials error:", err);
    res.status(500).json({ error: "Failed to load access denials" });
  }
});

/**
 * GET /api/support/users/lookup?q=...
 * Resolves a Trellis user by email or Clerk userId. Returns:
 *  - matching staff rows (with district + school + role)
 *  - Clerk public metadata (role / districtId / platformAdmin) if available
 *  - recent audit log entries by the actor
 *
 * Lets support answer "this user says they can't log in / has the wrong role
 * — what does the system actually think they are?".
 */
router.get("/support/users/lookup", async (req: Request, res: Response) => {
  const q = String(req.query.q || "").trim();
  if (!q) { res.status(400).json({ error: "q is required (email or Clerk userId)" }); return; }

  try {
    const looksLikeClerkId = q.startsWith("user_");
    const lower = q.toLowerCase();

    // Staff matches by email (case-insensitive).
    const staffRows = await db.select({
      staffId: staffTable.id,
      firstName: staffTable.firstName,
      lastName: staffTable.lastName,
      email: staffTable.email,
      role: staffTable.role,
      status: staffTable.status,
      schoolId: staffTable.schoolId,
      schoolName: schoolsTable.name,
      districtId: schoolsTable.districtId,
      districtName: districtsTable.name,
      deletedAt: staffTable.deletedAt,
    }).from(staffTable)
      .leftJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
      .leftJoin(districtsTable, eq(schoolsTable.districtId, districtsTable.id))
      .where(ilike(staffTable.email, lower))
      .limit(20);

    // Clerk lookup (best-effort — may be missing in dev).
    let clerk: {
      userId: string;
      primaryEmail: string | null;
      role: string | null;
      districtId: number | null;
      staffId: number | null;
      platformAdmin: boolean;
      createdAt: number | null;
      lastSignInAt: number | null;
    } | null = null;
    try {
      let clerkUser = null;
      if (looksLikeClerkId) {
        clerkUser = await clerkClient.users.getUser(q).catch(() => null);
      } else {
        const list = await clerkClient.users.getUserList({ emailAddress: [lower] }).catch(() => null);
        clerkUser = list?.data?.[0] ?? null;
      }
      if (clerkUser) {
        const meta = (clerkUser.publicMetadata ?? {}) as Record<string, unknown>;
        clerk = {
          userId: clerkUser.id,
          primaryEmail: clerkUser.primaryEmailAddress?.emailAddress ?? null,
          role: typeof meta.role === "string" ? meta.role : null,
          districtId: typeof meta.districtId === "number" ? meta.districtId : null,
          staffId: typeof meta.staffId === "number" ? meta.staffId : null,
          platformAdmin: meta.platformAdmin === true,
          createdAt: clerkUser.createdAt ?? null,
          lastSignInAt: clerkUser.lastSignInAt ?? null,
        };
      }
    } catch (e) {
      console.warn("[Support] Clerk lookup failed:", e);
    }

    // Recent audit log activity by the resolved Clerk user id (if any).
    const actorUserId = clerk?.userId ?? (looksLikeClerkId ? q : null);
    const recentAudit = actorUserId
      ? await db.select({
          id: auditLogsTable.id,
          action: auditLogsTable.action,
          targetTable: auditLogsTable.targetTable,
          targetId: auditLogsTable.targetId,
          summary: auditLogsTable.summary,
          createdAt: auditLogsTable.createdAt,
        }).from(auditLogsTable)
          .where(eq(auditLogsTable.actorUserId, actorUserId))
          .orderBy(desc(auditLogsTable.createdAt))
          .limit(20)
      : [];

    // Compare what Clerk says vs what staff table says — surface drift explicitly.
    const drift: string[] = [];
    if (clerk && staffRows.length > 0) {
      const districtIdsFromStaff = new Set(staffRows.map(s => s.districtId).filter(d => d != null));
      if (clerk.districtId != null && !districtIdsFromStaff.has(clerk.districtId)) {
        drift.push(`Clerk districtId=${clerk.districtId} does not match any staff row's district (${Array.from(districtIdsFromStaff).join(", ")})`);
      }
      if (clerk.staffId != null && !staffRows.some(s => s.staffId === clerk!.staffId)) {
        drift.push(`Clerk staffId=${clerk.staffId} does not match any staff row found by email`);
      }
    }
    if (clerk && staffRows.length === 0 && !clerk.platformAdmin) {
      drift.push("Clerk user exists but no staff row matches their email — they will get 'no district scope' on protected routes");
    }
    if (!clerk && staffRows.length > 0) {
      drift.push("Staff row(s) exist but no Clerk user found by this identifier — they cannot sign in yet");
    }

    // Determine whether view-as is permitted for this Clerk user.
    // We evaluate this server-side so the frontend never needs to duplicate
    // the exclusion logic — it just reads the flag.
    const viewAsAllowed = clerk && !clerk.platformAdmin
      ? await isViewAsAllowed(clerk.role, clerk.districtId).catch(() => false)
      : false;

    res.json({
      query: q,
      staffMatches: staffRows.map(s => ({
        ...s,
        name: `${s.firstName} ${s.lastName}`,
        active: !s.deletedAt && s.status === "active",
      })),
      clerk: clerk ? { ...clerk, viewAsAllowed } : null,
      recentAudit,
      drift,
    });
  } catch (err) {
    console.error("[Support] user lookup error:", err);
    res.status(500).json({ error: "Failed to look up user" });
  }
});

/**
 * GET /api/support/demo-readiness
 * Composite "is the demo in a good state to show?" check. Aggregates the
 * existing per-piece signals into a single vertical list of pass/warn/fail
 * checks so an SE can hit one URL minutes before a demo and know whether
 * to reseed, restart the worker, or otherwise scramble.
 *
 * Each check returns: id, label, status, message, optional remediation.
 * No mutations — purely a read-only roll-up of state.
 */
router.get("/support/demo-readiness", async (_req: Request, res: Response) => {
  type Status = "pass" | "warn" | "fail";
  interface Check {
    id: string;
    label: string;
    status: Status;
    message: string;
    remediation?: string;
    href?: string;
  }
  const checks: Check[] = [];

  try {
    // 1. Demo district present.
    const [demoRow] = await db.select({
      id: districtsTable.id,
      name: districtsTable.name,
    }).from(districtsTable)
      .where(eq(districtsTable.isDemo, true))
      .orderBy(districtsTable.id)
      .limit(1);

    if (!demoRow) {
      checks.push({
        id: "demo-district",
        label: "Demo district present",
        status: "fail",
        message: "No district with is_demo=true was found",
        remediation: "Run pnpm --filter @workspace/db exec tsx src/seed-demo-district.ts",
      });
      // Without a demo district most other checks are meaningless — emit
      // a single roll-up so the SE knows where to start.
      const summary = { pass: 0, warn: 0, fail: 1, total: 1 };
      res.json({ generatedAt: new Date().toISOString(), demoDistrict: null, checks, summary });
      return;
    }
    checks.push({
      id: "demo-district",
      label: "Demo district present",
      status: "pass",
      message: `${demoRow.name} (id ${demoRow.id})`,
    });

    const districtId = demoRow.id;
    const schoolIds = await loadDistrictSchoolIds(districtId);

    // 2. Sample data loaded for the demo district.
    const studentCount = schoolIds.length === 0 ? 0 : Number(((await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM students
      WHERE school_id = ANY(${schoolIds}) AND deleted_at IS NULL
    `)).rows[0] as { n: number } | undefined)?.n ?? 0);
    const staffCount = schoolIds.length === 0 ? 0 : Number(((await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM staff
      WHERE school_id = ANY(${schoolIds}) AND deleted_at IS NULL
    `)).rows[0] as { n: number } | undefined)?.n ?? 0);
    checks.push({
      id: "sample-data",
      label: "Sample data loaded",
      status: studentCount >= 40 ? "pass" : studentCount >= 10 ? "warn" : "fail",
      message: `${studentCount} students, ${staffCount} staff in ${schoolIds.length} school(s)`,
      remediation: studentCount >= 40
        ? undefined
        : studentCount >= 10
          ? "Demo district has fewer students than expected — re-run pnpm --filter @workspace/db exec tsx src/seed-demo-district.ts to refresh the full sample"
          : "Run pnpm --filter @workspace/db exec tsx src/seed-demo-district.ts",
    });

    // 3. Compliance variety — variety alerts present and overall compliance ~80%.
    const varietyRow = ((await db.execute(sql`
      SELECT COUNT(*)::int AS n,
             COUNT(DISTINCT type)::int AS t
      FROM alerts a
      JOIN students s ON s.id = a.student_id
      WHERE s.school_id = ANY(${schoolIds})
        AND a.resolved = false
        AND a.message LIKE '%[demo-variety:%'
    `)).rows[0] as { n: number; t: number } | undefined) ?? { n: 0, t: 0 };
    const varietyAlerts = Number(varietyRow.n || 0);
    const varietyTypes = Number(varietyRow.t || 0);

    const compRow = ((await db.execute(sql`
      WITH d_students AS (
        SELECT id FROM students
        WHERE school_id = ANY(${schoolIds}) AND deleted_at IS NULL
      ),
      affected AS (
        SELECT DISTINCT a.student_id FROM alerts a
        JOIN d_students ds ON ds.id = a.student_id
        WHERE a.resolved = false
      )
      SELECT (SELECT COUNT(*) FROM d_students)::int AS total,
             (SELECT COUNT(*) FROM affected)::int  AS affected
    `)).rows[0] as { total: number; affected: number } | undefined) ?? { total: 0, affected: 0 };
    const total = Number(compRow.total || 0);
    const affected = Number(compRow.affected || 0);
    const compliancePct = total > 0 ? Math.round((1 - affected / total) * 100) : 0;
    let varietyStatus: Status;
    if (varietyAlerts >= 8 && varietyTypes >= 5 && compliancePct >= 70 && compliancePct <= 90) varietyStatus = "pass";
    else if (varietyAlerts >= 4 && compliancePct >= 60 && compliancePct <= 95) varietyStatus = "warn";
    else varietyStatus = "fail";
    checks.push({
      id: "compliance-variety",
      label: "Compliance variety alerts present (~80%)",
      status: varietyStatus,
      message: `${varietyAlerts} variety alerts across ${varietyTypes} type(s); overall compliance ${compliancePct}%`,
      remediation: varietyStatus === "pass" ? undefined
        : "Run pnpm --filter @workspace/db exec tsx src/seed-demo-compliance-variety.ts",
    });

    // 4. SIS worker running.
    const workerRunning = isSisWorkerRunning();
    checks.push({
      id: "sis-worker",
      label: "SIS worker running",
      status: workerRunning ? "pass" : "fail",
      message: workerRunning
        ? "Worker poll loop is active in this process"
        : "Worker is stopped — scheduled syncs will not run",
      remediation: workerRunning ? undefined
        : "Restart the API server (the worker starts during boot)",
    });

    // 5. Job queue health — no stuck/stale jobs.
    const stuckRow = ((await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'running' AND locked_at < now() - INTERVAL '15 minutes')::int AS stale_running,
        COUNT(*) FILTER (WHERE status = 'queued' AND scheduled_for < now() - INTERVAL '30 minutes')::int AS old_queued,
        COUNT(*) FILTER (WHERE status = 'failed' AND completed_at >= now() - INTERVAL '24 hours')::int AS recent_failed,
        COUNT(*) FILTER (WHERE status IN ('queued','running'))::int AS active
      FROM sis_sync_jobs
    `)).rows[0] as Record<string, number> | undefined) ?? { stale_running: 0, old_queued: 0, recent_failed: 0, active: 0 };
    const staleRunning = Number(stuckRow.stale_running || 0);
    const oldQueued = Number(stuckRow.old_queued || 0);
    const recentFailed = Number(stuckRow.recent_failed || 0);
    const active = Number(stuckRow.active || 0);
    let queueStatus: Status;
    if (staleRunning > 0 || oldQueued > 0) queueStatus = "fail";
    else if (recentFailed > 0) queueStatus = "warn";
    else queueStatus = "pass";
    checks.push({
      id: "job-queue",
      label: "Job queue clean",
      status: queueStatus,
      message: queueStatus === "pass"
        ? `${active} active job(s); no stuck or recently failed syncs`
        : `${staleRunning} stale running, ${oldQueued} stuck queued, ${recentFailed} recent failures (24h)`,
      remediation: queueStatus === "pass" ? undefined
        : "Open SIS Settings → Sync logs to inspect or cancel stuck jobs",
      href: queueStatus === "pass" ? undefined : "/sis-settings",
    });

    // 6. Resend configured.
    const resendConfigured = !!process.env.RESEND_API_KEY;
    checks.push({
      id: "resend",
      label: "Resend (RESEND_API_KEY) configured",
      status: resendConfigured ? "pass" : "warn",
      message: resendConfigured
        ? "RESEND_API_KEY is present — outbound email will attempt real delivery"
        : "RESEND_API_KEY is missing — emails will be queued as not_configured",
      remediation: resendConfigured ? undefined
        : "Set the RESEND_API_KEY secret to enable real email delivery",
    });

    // 7. No API errors in the last hour.
    const errorRow = ((await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM error_logs
      WHERE occurred_at >= now() - INTERVAL '1 hour'
    `)).rows[0] as { n: number } | undefined) ?? { n: 0 };
    const errors1h = Number(errorRow.n || 0);
    checks.push({
      id: "api-errors",
      label: "No API errors in the last hour",
      status: errors1h === 0 ? "pass" : errors1h < 5 ? "warn" : "fail",
      message: errors1h === 0
        ? "No 5xx errors logged in the last 60 minutes"
        : `${errors1h} server error(s) logged in the last 60 minutes`,
      remediation: errors1h === 0 ? undefined
        : "Open System Status to inspect recent error log entries",
      href: errors1h === 0 ? undefined : "/settings?tab=system-status",
    });

    // 8. Last reseed timestamp — best signal we have without a dedicated
    //    table is the most recent created_at on the demo-variety alert
    //    rows (rewritten on every reseed of the variety script). Falls
    //    back to most recent student created_at if the variety script
    //    was never run.
    const reseedRow = ((await db.execute(sql`
      SELECT MAX(a.created_at) AS variety_at,
             (SELECT MAX(s.created_at) FROM students s WHERE s.school_id = ANY(${schoolIds})) AS student_at
      FROM alerts a
      JOIN students s ON s.id = a.student_id
      WHERE s.school_id = ANY(${schoolIds})
        AND a.message LIKE '%[demo-variety:%'
    `)).rows[0] as { variety_at: string | null; student_at: string | null } | undefined) ?? { variety_at: null, student_at: null };
    const reseedAt = reseedRow.variety_at ?? reseedRow.student_at;
    let reseedStatus: Status = "fail";
    let reseedMessage = "No reseed timestamp could be determined";
    if (reseedAt) {
      const ageMs = Date.now() - new Date(reseedAt).getTime();
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      reseedMessage = `Last reseed activity ${reseedAt} (${ageDays < 1 ? `${Math.round(ageMs / (60 * 60 * 1000))}h` : `${Math.round(ageDays)}d`} ago)`;
      reseedStatus = ageDays <= 30 ? "pass" : ageDays <= 90 ? "warn" : "fail";
    }
    checks.push({
      id: "last-reseed",
      label: "Last demo reseed",
      status: reseedStatus,
      message: reseedMessage,
      remediation: reseedStatus === "pass" ? undefined
        : "Run pnpm --filter @workspace/db exec tsx src/seed-demo-district.ts then src/seed-demo-compliance-variety.ts",
    });

    const summary = checks.reduce(
      (acc, c) => { acc[c.status]++; acc.total++; return acc; },
      { pass: 0, warn: 0, fail: 0, total: 0 },
    );

    const generatedAt = new Date();

    // Persist this run to history (fire-and-forget; never blocks the response).
    db.insert(demoReadinessRunsTable).values({
      generatedAt,
      pass: summary.pass,
      warn: summary.warn,
      fail: summary.fail,
      total: summary.total,
      checks: checks as unknown as Record<string, unknown>[],
    }).then(() =>
      // Cap at last 50 runs.
      db.execute(sql`
        DELETE FROM demo_readiness_runs
        WHERE id NOT IN (
          SELECT id FROM demo_readiness_runs
          ORDER BY generated_at DESC
          LIMIT 50
        )
      `)
    ).catch((e: unknown) => {
      console.error("[Support] demo-readiness history write error:", e);
    });

    res.json({
      generatedAt: generatedAt.toISOString(),
      demoDistrict: { id: demoRow.id, name: demoRow.name },
      checks,
      summary,
    });
  } catch (err) {
    console.error("[Support] demo-readiness error:", err);
    res.status(500).json({ error: "Failed to compute demo readiness" });
  }
});

/**
 * GET /api/support/demo-readiness/history?limit=50
 * Returns the last N demo-readiness check runs (most-recent first).
 * Each row contains the timestamp and pass/warn/fail summary counts.
 * The per-check detail is omitted here to keep payloads small — the
 * UI only needs the summary for the sparkline.
 */
router.get("/support/demo-readiness/history", async (req: Request, res: Response) => {
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 50));
  try {
    const rows = await db
      .select({
        id: demoReadinessRunsTable.id,
        generatedAt: demoReadinessRunsTable.generatedAt,
        pass: demoReadinessRunsTable.pass,
        warn: demoReadinessRunsTable.warn,
        fail: demoReadinessRunsTable.fail,
        total: demoReadinessRunsTable.total,
      })
      .from(demoReadinessRunsTable)
      .orderBy(desc(demoReadinessRunsTable.generatedAt))
      .limit(limit);

    res.json({
      runs: rows.map(r => ({
        id: r.id,
        generatedAt: r.generatedAt,
        summary: { pass: r.pass, warn: r.warn, fail: r.fail, total: r.total },
      })),
    });
  } catch (err) {
    console.error("[Support] demo-readiness history error:", err);
    res.status(500).json({ error: "Failed to load demo readiness history" });
  }
});

// ---------------------------------------------------------------------------
// Demo reseed: one-click seed-demo-district + seed-demo-compliance-variety.
//
// Because the full reseed can take 30-90 seconds, the endpoint is fire-and-
// forget: POST starts the job and returns a jobId, GET /:jobId polls status.
// ---------------------------------------------------------------------------

type ReseedJobStatus = "running" | "done" | "failed";
interface ReseedJob {
  id: string;
  status: ReseedJobStatus;
  startedAt: string;
  finishedAt?: string;
  result?: {
    districtId: number;
    alertsInserted: number;
    alertsSkipped: number;
    totalStudents: number;
    nonCompliantStudents: number;
    compliancePct: string;
  };
  error?: string;
}

// In-memory store (cleared on server restart, which is fine for a dev/demo tool).
// Capped at 20 entries to avoid unbounded growth during a long session.
const reseedJobs = new Map<string, ReseedJob>();
function pruneReseedJobs() {
  if (reseedJobs.size > 20) {
    const oldest = Array.from(reseedJobs.keys())[0];
    if (oldest) reseedJobs.delete(oldest);
  }
}

/**
 * POST /api/support/demo-reseed
 * Kicks off seed-demo-district + seed-demo-compliance-variety in the background.
 * Returns { jobId } immediately. Poll GET /api/support/demo-reseed/:jobId for status.
 *
 * Safety: rejects upfront if the database contains non-demo districts so this
 * endpoint can never be used to accidentally wipe pilot or production data.
 * The seeder itself enforces the same guard — this pre-check surfaces the
 * error to the caller before any async work begins.
 */
router.post("/support/demo-reseed", async (_req: Request, res: Response) => {
  // Pre-flight guard: refuse if any non-demo district exists. This mirrors
  // the seeder's internal check but gives a clean HTTP 409 before any job
  // is created, preventing data-loss in environments that have real data.
  try {
    const allDistricts = await db
      .select({ id: districtsTable.id, name: districtsTable.name, isDemo: districtsTable.isDemo })
      .from(districtsTable);
    const realDistricts = allDistricts.filter(d => !d.isDemo);
    if (realDistricts.length > 0) {
      res.status(409).json({
        error: `Cannot reseed: database contains ${realDistricts.length} non-demo district(s) ` +
          `(${realDistricts.map(d => `"${d.name}"`).join(", ")}). ` +
          `This operation is only permitted when all districts are demo districts.`,
      });
      return;
    }
  } catch (err) {
    console.error("[demo-reseed] Pre-flight district check failed:", err);
    res.status(500).json({ error: "Failed to verify district safety guard before reseeding" });
    return;
  }

  const jobId = `reseed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job: ReseedJob = { id: jobId, status: "running", startedAt: new Date().toISOString() };
  reseedJobs.set(jobId, job);
  pruneReseedJobs();

  (async () => {
    try {
      console.log(`[demo-reseed] Job ${jobId}: starting seed-demo-district…`);
      // Do NOT pass allowReset: true — let the seeder's own guard serve as a
      // second line of defence against accidental data loss.
      await seedDemoDistrict();
      console.log(`[demo-reseed] Job ${jobId}: starting seed-demo-compliance-variety…`);
      const result = await seedDemoComplianceVariety();
      job.status = "done";
      job.finishedAt = new Date().toISOString();
      job.result = result;
      console.log(`[demo-reseed] Job ${jobId}: done.`);
    } catch (err: unknown) {
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      job.error = err instanceof Error ? err.message : String(err);
      console.error(`[demo-reseed] Job ${jobId} failed:`, err);
    }
  })();

  res.status(202).json({ jobId });
});

/**
 * GET /api/support/demo-reseed/:jobId
 * Returns the current status of a reseed job.
 */
router.get("/support/demo-reseed/:jobId", (req: Request, res: Response) => {
  const job = reseedJobs.get(String(req.params.jobId));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

// ---------------------------------------------------------------------------
// Audited "view-as" / impersonation sessions for platform admins.
//
// Lifecycle:
//   POST /api/support/view-as/start   { targetUserId, reason, [targetSnapshot] }
//     -> { token, sessionId, expiresAt, target: { ... } }
//   GET  /api/support/view-as/active  (header X-View-As-Token: <token>)
//     -> { active: true, session: { ... } } | 404
//   POST /api/support/view-as/end     (header X-View-As-Token: <token>)
//     -> { ended: true, sessionId }
//
// All three endpoints sit under requirePlatformAdmin, which means a non-admin
// can never start, query, or extend a session. Hijack protection is layered
// inside loadActiveViewAsSession: a token only resolves when the caller's
// userId matches the session's adminUserId, so even a leaked token cannot be
// replayed by a different platform-admin account.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// View-as allow/deny policy helpers
// ---------------------------------------------------------------------------

// Roles that are ALWAYS excluded from view-as regardless of district config.
// This is a platform-level safeguard; districts cannot override this list.
const VIEW_AS_GLOBALLY_EXCLUDED_ROLES: ReadonlySet<string> = new Set([
  "platform_admin",
]);

/**
 * Returns true if impersonating a user with the given role in the given
 * district is permitted, false if it is blocked by policy.
 *
 * Policy precedence (highest first):
 *  1. Global hard-exclusions (VIEW_AS_GLOBALLY_EXCLUDED_ROLES) — always blocked.
 *  2. District-level viewAsExcludedRoles — blocked if role appears in the list.
 *  3. Otherwise allowed.
 */
async function isViewAsAllowed(role: string | null, districtId: number | null): Promise<boolean> {
  if (!role) return true; // no role metadata — allow (server will validate at session time)
  if (VIEW_AS_GLOBALLY_EXCLUDED_ROLES.has(role)) return false;
  if (districtId == null) return true;
  const [district] = await db
    .select({ viewAsExcludedRoles: districtsTable.viewAsExcludedRoles })
    .from(districtsTable)
    .where(eq(districtsTable.id, districtId))
    .limit(1);
  if (!district) return true; // district not found — don't block, let start handler 404
  const excluded: string[] = Array.isArray(district.viewAsExcludedRoles)
    ? (district.viewAsExcludedRoles as string[])
    : [];
  return !excluded.includes(role);
}

const REASON_MIN_LENGTH = 8;
const REASON_MAX_LENGTH = 500;

interface StartBody {
  targetUserId?: string;
  reason?: string;
  // Dev/test-only override: in production we resolve the snapshot via Clerk +
  // staff lookup so admins cannot fabricate a fake target identity. Outside
  // production (no Clerk user available in unit tests) the snapshot is honored.
  targetSnapshot?: {
    role?: string;
    displayName?: string;
    districtId?: number | null;
    staffId?: number | null;
    studentId?: number | null;
    guardianId?: number | null;
  };
}

router.post("/support/view-as/start", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as StartBody;
  const targetUserId = String(body.targetUserId ?? "").trim();
  const reason = String(body.reason ?? "").trim();

  if (!targetUserId) { res.status(400).json({ error: "targetUserId is required" }); return; }
  if (reason.length < REASON_MIN_LENGTH) {
    res.status(400).json({ error: `reason is required (min ${REASON_MIN_LENGTH} chars)` });
    return;
  }
  if (reason.length > REASON_MAX_LENGTH) {
    res.status(400).json({ error: `reason must be ${REASON_MAX_LENGTH} chars or fewer` });
    return;
  }

  const authed = req as unknown as AuthedRequest;
  const adminUserId = authed.userId;
  if (targetUserId === adminUserId) {
    // No-op vanity impersonation; reject so audit reviewers don't see noise.
    res.status(400).json({ error: "Cannot start a view-as session targeting yourself" });
    return;
  }

  // Resolve target snapshot. Production: prefer Clerk + staff lookup so the
  // admin cannot synthesize a fake target identity. Non-production: accept the
  // body snapshot as a fallback (test suites supply this directly).
  const snap = await resolveTargetSnapshot(targetUserId, body.targetSnapshot ?? null);
  if (!snap) {
    res.status(404).json({ error: "Could not resolve target user — no Clerk record or staff row found" });
    return;
  }

  // Enforce per-district (and global) view-as exclusion policy.
  // Returns 403 — not 400 — so the caller knows the identity check passed but
  // the action is contractually or policy-forbidden for this target.
  const allowed = await isViewAsAllowed(snap.role ?? null, snap.districtId ?? null).catch(() => false);
  if (!allowed) {
    const scope = snap.districtId != null ? `district ${snap.districtId}` : "this district";
    res.status(403).json({
      error: `View-as is not permitted for the role "${snap.role}" in ${scope}. ` +
        "This restriction may be contractual (e.g. PHI access under a clinical provider identity). " +
        "Contact your compliance team before attempting impersonation.",
    });
    return;
  }

  // End any pre-existing open sessions for this admin so there is exactly one
  // active impersonation per admin at any time. Captures the supersede in audit.
  const supersededCount = await endActiveSessionsForAdmin(adminUserId, "superseded");

  const { token, tokenHash } = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + VIEW_AS_TTL_MS);

  const [row] = await db.insert(viewAsSessionsTable).values({
    adminUserId,
    reason,
    targetUserId: snap.userId,
    targetRole: snap.role,
    targetDisplayName: snap.displayName,
    targetDistrictId: snap.districtId,
    targetStaffId: snap.staffId,
    targetStudentId: snap.studentId,
    targetGuardianId: snap.guardianId,
    tokenHash,
    startedAt: now,
    expiresAt,
  }).returning();

  // Audit the start. We capture this BEFORE the override would apply (this
  // request is the admin themselves) so actorUserId/actorRole reflect the
  // real platform admin, not the target.
  logAudit(req, {
    action: "create",
    targetTable: "view_as_sessions",
    targetId: row.id,
    summary: `Platform admin started view-as session for ${snap.displayName} (${snap.userId})`,
    metadata: {
      reason,
      targetUserId: snap.userId,
      targetRole: snap.role,
      targetDistrictId: snap.districtId,
      expiresAt: expiresAt.toISOString(),
      supersededCount,
    },
  });

  res.json({
    token,
    sessionId: row.id,
    startedAt: row.startedAt,
    expiresAt: row.expiresAt,
    target: {
      userId: snap.userId,
      role: snap.role,
      displayName: snap.displayName,
      districtId: snap.districtId,
      staffId: snap.staffId,
      studentId: snap.studentId,
      guardianId: snap.guardianId,
    },
  });
});

router.get("/support/view-as/active", async (req: Request, res: Response) => {
  const raw = req.headers[VIEW_AS_HEADER];
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (typeof token !== "string" || !token) {
    res.status(404).json({ active: false });
    return;
  }
  // requirePlatformAdmin already populated req.userId (and the view-as middleware
  // will have ALSO overridden it if the token is valid). Resolve the admin id
  // from either viewAsAdminUserId (already overridden) or req.userId (not).
  const authed = req as unknown as AuthedRequest;
  const adminUserId = authed.viewAsAdminUserId ?? authed.userId;
  const session = await loadActiveViewAsSession(token, adminUserId);
  if (!session) {
    // Self-heal: if the row exists, belongs to this admin, and is past
    // expires_at but still ended_at IS NULL, mark it expired so the audit
    // trail captures the timeout. Done here (not in middleware) so we only
    // ever auto-end a session for its owning admin.
    const tokenHash = hashToken(token);
    const [row] = await db.select().from(viewAsSessionsTable)
      .where(eq(viewAsSessionsTable.tokenHash, tokenHash)).limit(1);
    if (row && row.adminUserId === adminUserId && !row.endedAt && row.expiresAt.getTime() <= Date.now()) {
      await endSessionByToken(token, "expired");
    }
    res.status(404).json({ active: false });
    return;
  }
  res.json({
    active: true,
    session: {
      sessionId: session.id,
      reason: session.reason,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      target: {
        userId: session.targetUserId,
        role: session.targetRole,
        displayName: session.targetDisplayName,
        districtId: session.targetDistrictId,
        staffId: session.targetStaffId,
        studentId: session.targetStudentId,
        guardianId: session.targetGuardianId,
      },
    },
  });
});

router.post("/support/view-as/end", async (req: Request, res: Response) => {
  const raw = req.headers[VIEW_AS_HEADER];
  const headerToken = Array.isArray(raw) ? raw[0] : raw;
  const bodyToken = typeof (req.body as { token?: string } | undefined)?.token === "string"
    ? (req.body as { token: string }).token : undefined;
  const token = (typeof headerToken === "string" && headerToken) ? headerToken : bodyToken;
  if (typeof token !== "string" || !token) {
    res.status(400).json({ error: "X-View-As-Token header (or body.token) is required" });
    return;
  }

  const authed = req as unknown as AuthedRequest;
  const adminUserId = authed.viewAsAdminUserId ?? authed.userId;

  // Find the row first so we can verify admin ownership BEFORE ending it; this
  // prevents a different platform admin from ending someone else's session by
  // submitting a token they happen to know.
  const tokenHash = hashToken(token);
  const [existing] = await db.select().from(viewAsSessionsTable)
    .where(eq(viewAsSessionsTable.tokenHash, tokenHash)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  if (existing.adminUserId !== adminUserId) {
    res.status(403).json({ error: "Cannot end another admin's view-as session" });
    return;
  }
  if (existing.endedAt) {
    invalidateViewAsTokenCache(tokenHash);
    res.json({ ended: true, sessionId: existing.id, alreadyEnded: true });
    return;
  }

  const ended = await endSessionByToken(token, "manual");
  // logAudit reads viewAsAdminUserId from the request (set by middleware when
  // the token is still active), so the row is correctly tagged as a view-as op.
  logAudit(req, {
    action: "update",
    targetTable: "view_as_sessions",
    targetId: existing.id,
    summary: `Platform admin ended view-as session for ${existing.targetDisplayName} (${existing.targetUserId})`,
    metadata: {
      endReason: "manual",
      durationMs: ended ? ended.endedAt!.getTime() - ended.startedAt.getTime() : null,
    },
  });

  res.json({ ended: true, sessionId: existing.id });
});

interface TargetSnapshot {
  userId: string;
  role: string;
  displayName: string;
  districtId: number | null;
  staffId: number | null;
  studentId: number | null;
  guardianId: number | null;
}

async function resolveTargetSnapshot(
  targetUserId: string,
  bodySnapshot: StartBody["targetSnapshot"] | null,
): Promise<TargetSnapshot | null> {
  // Production: pull role/district from Clerk publicMetadata. Resolve staffId
  // either from Clerk metadata or by emailing back into the staff table.
  if (process.env.NODE_ENV === "production") {
    return await resolveFromClerk(targetUserId);
  }

  // Non-production: if the caller supplied a snapshot, accept it. This is how
  // the test suite drives end-to-end coverage without a real Clerk session.
  if (bodySnapshot && isRole(bodySnapshot.role)) {
    return {
      userId: targetUserId,
      role: bodySnapshot.role,
      displayName: bodySnapshot.displayName ?? "Target User",
      districtId: bodySnapshot.districtId ?? null,
      staffId: bodySnapshot.staffId ?? null,
      studentId: bodySnapshot.studentId ?? null,
      guardianId: bodySnapshot.guardianId ?? null,
    };
  }
  // Fall back to Clerk lookup if available (real dev with Clerk).
  return await resolveFromClerk(targetUserId);
}

async function resolveFromClerk(targetUserId: string): Promise<TargetSnapshot | null> {
  try {
    const user = await clerkClient.users.getUser(targetUserId);
    if (!user) return null;
    const meta = (user.publicMetadata ?? {}) as Record<string, unknown>;
    const role = isRole(meta.role) ? (meta.role as string) : null;
    if (!role) return null;
    const displayName =
      user.fullName
      ?? [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
      ?? user.primaryEmailAddress?.emailAddress
      ?? targetUserId;
    return {
      userId: targetUserId,
      role,
      displayName: displayName || targetUserId,
      districtId: typeof meta.districtId === "number" ? meta.districtId : null,
      staffId: typeof meta.staffId === "number" ? meta.staffId : null,
      studentId: typeof meta.studentId === "number" ? meta.studentId : null,
      guardianId: typeof meta.guardianId === "number" ? meta.guardianId : null,
    };
  } catch {
    return null;
  }
}

export default router;
