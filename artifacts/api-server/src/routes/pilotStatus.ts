// tenant-scope: district-join
// In-app Pilot Status page data + admin form to set pilot config.
//
// Read access: any authenticated user in the district whose isPilot=true,
// plus platform admins (who can pass ?districtId=N to inspect any district).
// Write access (PATCH /districts/:id/pilot-config): admin role for the
// caller's own district, or platform admin for any district.
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, districtsTable, schoolsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getEnforcedDistrictId, requireAuth, type AuthedRequest } from "../middlewares/auth";
import { getPublicMeta } from "../lib/clerkClaims";

const router: IRouter = Router();

/**
 * Pilot status read access: district admins (own district) and platform
 * admins / Trellis support (any district via ?districtId=). All other
 * roles (providers, paras, coordinators, students, parents) are denied
 * server-side so this can't be probed by lower-privilege staff.
 */
function requirePilotReadAccess(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const authed = req as unknown as AuthedRequest;
    const meta = getPublicMeta(req);
    if (meta.platformAdmin) { next(); return; }
    if (authed.trellisRole === "admin") { next(); return; }
    res.status(403).json({ error: "You don't have permission to access this resource" });
  });
}

interface ProviderStatsRow { total_providers: number | string; active_providers_7d: number | string }
interface SessionsRow { total: number | string }
interface AlertsCountRow { total: number | string; acknowledged: number | string }
interface SisRow { last_sync_at: string | Date | null }

const VALID_STAGES = ["kickoff", "mid_pilot", "readout"] as const;
type PilotStage = (typeof VALID_STAGES)[number];

function isValidStage(v: unknown): v is PilotStage {
  return typeof v === "string" && (VALID_STAGES as readonly string[]).includes(v);
}

function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * Resolve the district the caller wants pilot status for.
 *  - Platform admins may pass ?districtId=N (or omit it for their own scope).
 *  - Everyone else gets their tenant district. Forbidden if a districtId
 *    query param disagrees with that.
 */
function resolveTargetDistrictId(req: AuthedRequest): { ok: true; districtId: number } | { ok: false; status: number; error: string } {
  const meta = getPublicMeta(req);
  const enforced = getEnforcedDistrictId(req);
  const raw = req.query.districtId;
  let queried: number | null = null;
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) return { ok: false, status: 400, error: "Invalid districtId" };
    queried = n;
  }
  if (meta.platformAdmin) {
    const id = queried ?? enforced;
    if (!id) return { ok: false, status: 400, error: "districtId is required for platform admins without a tenant district" };
    return { ok: true, districtId: id };
  }
  if (!enforced) return { ok: false, status: 403, error: "District context required" };
  if (queried != null && queried !== enforced) {
    return { ok: false, status: 403, error: "You don't have access to this district" };
  }
  return { ok: true, districtId: enforced };
}

type Health = "green" | "yellow" | "red" | "neutral";

function adoptionHealth(pct: number, totalProviders: number): Health {
  if (totalProviders === 0) return "neutral";
  if (pct >= 70) return "green";
  if (pct >= 40) return "yellow";
  return "red";
}

function alertAckHealth(total: number, acked: number): Health {
  if (total === 0) return "neutral";
  const ratio = acked / total;
  if (ratio >= 0.8) return "green";
  if (ratio >= 0.5) return "yellow";
  return "red";
}

function syncHealth(lastSyncAt: Date | null): Health {
  if (!lastSyncAt) return "neutral";
  const ageMs = Date.now() - lastSyncAt.getTime();
  const hours = ageMs / (1000 * 60 * 60);
  if (hours <= 24) return "green";
  if (hours <= 72) return "yellow";
  return "red";
}

function timelineHealth(daysRemaining: number | null, totalDays: number | null, stage: PilotStage | null): Health {
  if (stage === "readout") return "neutral";
  if (daysRemaining == null) return "neutral";
  if (daysRemaining < 0) return "red";
  if (totalDays && totalDays > 0) {
    const pctRemaining = daysRemaining / totalDays;
    if (pctRemaining < 0.1) return "yellow";
  }
  return "green";
}

/**
 * GET /api/pilot-status
 * Returns a snapshot of the pilot for the caller's district (or
 * ?districtId=N for platform admins). The page is a read-only dashboard;
 * pilot config is edited via PATCH /districts/:id/pilot-config.
 */
router.get("/pilot-status", requirePilotReadAccess, async (req, res): Promise<void> => {
  const authed = req as AuthedRequest;
  const target = resolveTargetDistrictId(authed);
  if (!target.ok) { res.status(target.status).json({ error: target.error }); return; }
  const districtId = target.districtId;

  const [district] = await db.select().from(districtsTable).where(eq(districtsTable.id, districtId));
  if (!district) { res.status(404).json({ error: "District not found" }); return; }

  const schoolRows = await db.select({ id: schoolsTable.id }).from(schoolsTable)
    .where(eq(schoolsTable.districtId, districtId));
  const schoolIds = schoolRows.map((s: { id: number }) => s.id);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoIso = sevenDaysAgo.toISOString().slice(0, 10);

  // Provider adoption: % of active "provider-style" staff (case_manager,
  // bcba, sped_teacher, provider) who have logged at least one session in
  // the last 7 days. Gives a single honest "are people using this" number.
  const providerRoles = ["case_manager", "bcba", "sped_teacher", "provider"];

  const [providerStats, sessionsLast7d, alertCounts, sisRow] = await Promise.all([
    schoolIds.length > 0
      ? db.execute(sql`
          WITH active_providers AS (
            SELECT id FROM staff
            WHERE school_id = ANY(${schoolIds})
              AND status = 'active'
              AND deleted_at IS NULL
              AND role = ANY(${providerRoles})
          )
          SELECT
            (SELECT COUNT(*)::int FROM active_providers) AS total_providers,
            (
              SELECT COUNT(DISTINCT sl.staff_id)::int
              FROM session_logs sl
              WHERE sl.staff_id IN (SELECT id FROM active_providers)
                AND sl.session_date >= ${sevenDaysAgoIso}
                AND sl.deleted_at IS NULL
            ) AS active_providers_7d
        `)
      : Promise.resolve({ rows: [{ total_providers: 0, active_providers_7d: 0 }] satisfies ProviderStatsRow[] }),
    schoolIds.length > 0
      ? db.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM session_logs sl
          JOIN students s ON s.id = sl.student_id
          WHERE s.school_id = ANY(${schoolIds})
            AND sl.session_date >= ${sevenDaysAgoIso}
            AND sl.deleted_at IS NULL
        `)
      : Promise.resolve({ rows: [{ total: 0 }] satisfies SessionsRow[] }),
    schoolIds.length > 0
      ? db.execute(sql`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE resolved = true)::int AS acknowledged
          FROM alerts a
          LEFT JOIN students s ON s.id = a.student_id
          WHERE (a.student_id IS NULL OR s.school_id = ANY(${schoolIds}))
        `)
      : Promise.resolve({ rows: [{ total: 0, acknowledged: 0 }] satisfies AlertsCountRow[] }),
    db.execute(sql`
      SELECT MAX(last_sync_at) AS last_sync_at
      FROM sis_connections
      WHERE district_id = ${districtId}
    `),
  ]);

  const provRow = (providerStats.rows[0] ?? {}) as Partial<ProviderStatsRow>;
  const totalProviders = Number(provRow.total_providers ?? 0);
  const activeProviders7d = Number(provRow.active_providers_7d ?? 0);
  const adoptionPct = totalProviders > 0 ? Math.round((activeProviders7d / totalProviders) * 100) : 0;

  const sessRow = (sessionsLast7d.rows[0] ?? {}) as Partial<SessionsRow>;
  const sessions7d = Number(sessRow.total ?? 0);

  const alertRow = (alertCounts.rows[0] ?? {}) as Partial<AlertsCountRow>;
  const alertsTotal = Number(alertRow.total ?? 0);
  const alertsAck = Number(alertRow.acknowledged ?? 0);

  const sisRowParsed = (sisRow.rows[0] ?? {}) as Partial<SisRow>;
  const lastSyncRaw = sisRowParsed.last_sync_at ?? null;
  const lastSyncAt = lastSyncRaw ? new Date(lastSyncRaw) : null;

  // Date math. We treat both bounds as inclusive: a 30-day pilot starting
  // today has 30 days remaining today, and 1 day remaining the day before
  // it ends. After end_date we report 0 remaining and a negative elapsed
  // overrun via daysRemaining < 0 if the pilot is still flagged isPilot.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = district.pilotStartDate ? new Date(`${district.pilotStartDate}T00:00:00`) : null;
  const end = district.pilotEndDate ? new Date(`${district.pilotEndDate}T00:00:00`) : null;

  const dayMs = 24 * 60 * 60 * 1000;
  const totalDays = start && end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / dayMs) + 1) : null;
  const daysElapsed = start ? Math.max(0, Math.floor((today.getTime() - start.getTime()) / dayMs) + (today >= start ? 0 : -1)) : null;
  // daysRemaining counts inclusive of today, so an end_date of today reports 1.
  const daysRemaining = end ? Math.floor((end.getTime() - today.getTime()) / dayMs) + 1 : null;

  const stage = isValidStage(district.pilotStage) ? district.pilotStage : null;

  res.json({
    district: {
      id: district.id,
      name: district.name,
      isPilot: district.isPilot,
    },
    pilot: {
      startDate: district.pilotStartDate,
      endDate: district.pilotEndDate,
      stage,
      accountManagerName: district.pilotAccountManagerName,
      accountManagerEmail: district.pilotAccountManagerEmail,
    },
    timeline: {
      totalDays,
      daysElapsed,
      daysRemaining,
      health: timelineHealth(daysRemaining, totalDays, stage),
    },
    adoption: {
      totalProviders,
      activeProviders7d,
      percent: adoptionPct,
      sessionsLast7d: sessions7d,
      health: adoptionHealth(adoptionPct, totalProviders),
    },
    sync: {
      lastSyncAt: lastSyncAt ? lastSyncAt.toISOString() : null,
      health: syncHealth(lastSyncAt),
    },
    alerts: {
      total: alertsTotal,
      acknowledged: alertsAck,
      open: Math.max(0, alertsTotal - alertsAck),
      health: alertAckHealth(alertsTotal, alertsAck),
    },
    stage: {
      value: stage,
      // The stage badge is informational rather than green/yellow/red — we
      // only flag "readout" with a neutral color since there's no threshold.
      health: "neutral" as Health,
    },
  });
});

/**
 * PATCH /api/districts/:id/pilot-config
 * Admin form for setting pilot start/end dates, stage, and account manager.
 * District admins may set their own; platform admins may set any.
 */
function requirePilotConfigWriteAccess(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const authed = req as unknown as AuthedRequest;
    const meta = getPublicMeta(req);
    if (meta.platformAdmin) { next(); return; }
    if (authed.trellisRole === "admin") { next(); return; }
    res.status(403).json({ error: "You don't have permission to access this resource" });
  });
}

router.patch("/districts/:id/pilot-config", requirePilotConfigWriteAccess, async (req, res): Promise<void> => {
  const authed = req as AuthedRequest;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }

  const meta = getPublicMeta(req);
  const enforced = getEnforcedDistrictId(authed);
  if (!meta.platformAdmin && enforced != null && enforced !== id) {
    res.status(403).json({ error: "You don't have access to this district" }); return;
  }

  const body = req.body ?? {};
  const updateData: Partial<typeof districtsTable.$inferInsert> = {};

  if (body.pilotStartDate !== undefined) {
    if (body.pilotStartDate === null || body.pilotStartDate === "") updateData.pilotStartDate = null;
    else if (isIsoDate(body.pilotStartDate)) updateData.pilotStartDate = body.pilotStartDate;
    else { res.status(400).json({ error: "pilotStartDate must be YYYY-MM-DD or null" }); return; }
  }
  if (body.pilotEndDate !== undefined) {
    if (body.pilotEndDate === null || body.pilotEndDate === "") updateData.pilotEndDate = null;
    else if (isIsoDate(body.pilotEndDate)) updateData.pilotEndDate = body.pilotEndDate;
    else { res.status(400).json({ error: "pilotEndDate must be YYYY-MM-DD or null" }); return; }
  }
  // Cross-field validation: end can't precede start when both are being set
  // or one is being set against an existing other. We re-load only when one
  // side is partially updated so we don't waste a query in the common case.
  if (updateData.pilotStartDate !== undefined || updateData.pilotEndDate !== undefined) {
    let s = updateData.pilotStartDate as string | null | undefined;
    let e = updateData.pilotEndDate as string | null | undefined;
    if (s === undefined || e === undefined) {
      const [existing] = await db.select({
        startDate: districtsTable.pilotStartDate,
        endDate: districtsTable.pilotEndDate,
      }).from(districtsTable).where(eq(districtsTable.id, id));
      if (!existing) { res.status(404).json({ error: "District not found" }); return; }
      if (s === undefined) s = existing.startDate;
      if (e === undefined) e = existing.endDate;
    }
    if (s && e && s > e) {
      res.status(400).json({ error: "pilotEndDate cannot be before pilotStartDate" }); return;
    }
  }

  if (body.pilotStage !== undefined) {
    if (body.pilotStage === null || body.pilotStage === "") updateData.pilotStage = null;
    else if (isValidStage(body.pilotStage)) updateData.pilotStage = body.pilotStage;
    else { res.status(400).json({ error: `pilotStage must be one of ${VALID_STAGES.join(", ")} or null` }); return; }
  }
  if (body.pilotAccountManagerName !== undefined) {
    if (body.pilotAccountManagerName === null) updateData.pilotAccountManagerName = null;
    else if (typeof body.pilotAccountManagerName === "string") {
      const trimmed = body.pilotAccountManagerName.trim();
      updateData.pilotAccountManagerName = trimmed === "" ? null : trimmed;
    } else { res.status(400).json({ error: "pilotAccountManagerName must be a string or null" }); return; }
  }
  if (body.pilotAccountManagerEmail !== undefined) {
    if (body.pilotAccountManagerEmail === null) updateData.pilotAccountManagerEmail = null;
    else if (typeof body.pilotAccountManagerEmail === "string") {
      const trimmed = body.pilotAccountManagerEmail.trim();
      if (trimmed === "") {
        updateData.pilotAccountManagerEmail = null;
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        res.status(400).json({ error: "pilotAccountManagerEmail must be a valid email" }); return;
      } else {
        updateData.pilotAccountManagerEmail = trimmed;
      }
    } else { res.status(400).json({ error: "pilotAccountManagerEmail must be a string or null" }); return; }
  }

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "No fields to update" }); return;
  }

  const [district] = await db.update(districtsTable).set(updateData).where(eq(districtsTable.id, id)).returning({
    id: districtsTable.id,
    pilotStartDate: districtsTable.pilotStartDate,
    pilotEndDate: districtsTable.pilotEndDate,
    pilotStage: districtsTable.pilotStage,
    pilotAccountManagerName: districtsTable.pilotAccountManagerName,
    pilotAccountManagerEmail: districtsTable.pilotAccountManagerEmail,
  });
  if (!district) { res.status(404).json({ error: "District not found" }); return; }
  res.json(district);
});

export default router;
