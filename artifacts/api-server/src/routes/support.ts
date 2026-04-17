import { Router, type IRouter, type Request, type Response } from "express";
import {
  db, districtsTable, districtSubscriptionsTable, schoolsTable, studentsTable,
  staffTable, sisConnectionsTable, sisSyncLogsTable, importsTable,
} from "@workspace/db";
import { and, eq, inArray, isNull, sql, desc } from "drizzle-orm";
import { requirePlatformAdmin } from "../middlewares/auth";
import { runDataHealthChecks } from "../lib/dataHealthChecks";
import { deriveDistrictMode } from "../lib/districtMode";

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
        isDemo,
        isPilot,
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
 * GET /api/support/imports/recent?limit=20
 * Recent CSV imports across all districts (the imports table has no districtId column —
 * this is a global view used to spot stuck/failed imports during pilot rollouts).
 */
router.get("/support/imports/recent", async (req: Request, res: Response) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
  try {
    const imports = await db.select().from(importsTable)
      .orderBy(desc(importsTable.createdAt))
      .limit(limit);
    res.json({
      imports: imports.map(i => ({
        id: i.id,
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

export default router;
