/**
 * Noverta-support read-only session lifecycle + district-admin recent-sessions view.
 *
 * Routes:
 *   POST /api/support-session/open      { districtId, reason }   trellis_support
 *   POST /api/support-session/end                                trellis_support
 *   GET  /api/support-session/active                             trellis_support
 *   GET  /api/support-session/districts                          trellis_support
 *   GET  /api/support-session/recent                             district admin/coordinator
 *
 * The lifecycle endpoints are mounted BEFORE requireDistrictScope (in
 * routes/index.ts) so a trellis_support user with no active session — and
 * therefore no tenantDistrictId — can still pick a district. The "recent"
 * endpoint is mounted AFTER requireDistrictScope so it can read the calling
 * admin's tenantDistrictId.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import {
  db, supportSessionsTable, districtsTable, auditLogsTable,
} from "@workspace/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { requireAuth, type AuthedRequest, requireRoles } from "../middlewares/auth";
import { logAudit } from "../lib/auditLog";
import {
  endActiveSupportSessions, loadActiveSupportSession,
  invalidateSupportSessionCache, SUPPORT_SESSION_TTL_MS,
} from "../lib/supportSession";

const router: IRouter = Router();

const REASON_MIN_LENGTH = 8;
const REASON_MAX_LENGTH = 500;

/**
 * Gate the lifecycle endpoints to the trellis_support role.
 *
 * IMPORTANT: applySupportSessionOverride in middlewares/auth.ts rewrites the
 * effective trellisRole to `case_manager` while a session is active. We need
 * to recognise both: a support user with NO active session (real role
 * trellis_support) and one WITH an active session (role rewritten, but the
 * underlying user still owns the lifecycle). We detect the latter via the
 * supportUserId / supportSessionId markers populated by the override.
 */
function requireSupportRole(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const authed = req as unknown as AuthedRequest;
    const isSupportUser = authed.trellisRole === "trellis_support" || !!authed.supportUserId;
    if (!isSupportUser) {
      res.status(403).json({ error: "trellis_support role required" });
      return;
    }
    next();
  });
}

/**
 * GET /api/support-session/districts
 * Lightweight picker list (id + name + state) for trellis_support users to
 * choose a target district. Intentionally distinct from the platform-admin
 * /api/support/districts rollup — that one carries sensitive subscription
 * counts that support engineers should only see while pinned to that district.
 */
router.get("/support-session/districts", requireSupportRole, async (_req: Request, res: Response) => {
  try {
    const rows = await db.select({
      id: districtsTable.id, name: districtsTable.name, state: districtsTable.state,
    }).from(districtsTable).orderBy(districtsTable.name);
    res.json({ districts: rows });
  } catch (err) {
    console.error("[SupportSession] districts list error:", err);
    res.status(500).json({ error: "Failed to load districts" });
  }
});

/**
 * GET /api/support-session/active
 * Returns the calling support user's current open session (if any) and
 * self-heals stale rows past expires_at.
 */
router.get("/support-session/active", requireSupportRole, async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const supportUserId = authed.supportUserId ?? authed.userId;
  const session = await loadActiveSupportSession(supportUserId);
  if (!session) {
    // Self-heal an open-but-expired row so audit trail captures the timeout.
    const [row] = await db.select().from(supportSessionsTable)
      .where(and(
        eq(supportSessionsTable.supportUserId, supportUserId),
        isNull(supportSessionsTable.endedAt),
      )).limit(1);
    if (row && row.expiresAt.getTime() <= Date.now()) {
      await endActiveSupportSessions(supportUserId, "expired");
    }
    res.status(404).json({ active: false });
    return;
  }
  res.json({ active: true, session: serializeSession(session) });
});

/**
 * POST /api/support-session/open  { districtId: number, reason: string }
 * Opens (or supersedes) the calling user's support session.
 */
router.post("/support-session/open", requireSupportRole, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { districtId?: unknown; reason?: unknown };
  const districtId = Number(body.districtId);
  const reason = String(body.reason ?? "").trim();

  if (!Number.isInteger(districtId) || districtId <= 0) {
    res.status(400).json({ error: "districtId must be a positive integer" });
    return;
  }
  if (reason.length < REASON_MIN_LENGTH) {
    res.status(400).json({ error: `reason is required (min ${REASON_MIN_LENGTH} chars)` });
    return;
  }
  if (reason.length > REASON_MAX_LENGTH) {
    res.status(400).json({ error: `reason must be ${REASON_MAX_LENGTH} chars or fewer` });
    return;
  }

  // Verify the district exists. We don't reveal subscription/mode here — the
  // picker is just for choosing a target.
  const [district] = await db.select({ id: districtsTable.id, name: districtsTable.name })
    .from(districtsTable).where(eq(districtsTable.id, districtId)).limit(1);
  if (!district) {
    res.status(404).json({ error: "District not found" });
    return;
  }

  const authed = req as unknown as AuthedRequest;
  const supportUserId = authed.supportUserId ?? authed.userId;
  const supportDisplayName = authed.displayName || supportUserId;

  // One active session per support user. Supersede any prior open row so the
  // audit trail captures the swap, then insert the new row.
  const supersededCount = await endActiveSupportSessions(supportUserId, "superseded");

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SUPPORT_SESSION_TTL_MS);

  const [row] = await db.insert(supportSessionsTable).values({
    supportUserId,
    supportDisplayName,
    districtId,
    reason,
    openedAt: now,
    expiresAt,
  }).returning();

  // Drop the cache so the next request immediately sees the new active row.
  invalidateSupportSessionCache(supportUserId);

  // Tag the OPEN audit row with the just-created session id. The override
  // middleware ran before this handler executed (the row didn't exist yet),
  // so we set the marker manually here so logAudit's tagging fires.
  authed.supportSessionId = row.id;
  authed.supportUserId = supportUserId;

  logAudit(req, {
    action: "create",
    targetTable: "support_sessions",
    targetId: row.id,
    summary: `Noverta support opened read-only session for district ${district.name} (#${district.id})`,
    metadata: {
      districtId, districtName: district.name, reason,
      expiresAt: expiresAt.toISOString(), supersededCount,
    },
  });

  res.json({ session: serializeSession(row), district: { id: district.id, name: district.name } });
});

/**
 * POST /api/support-session/end
 * Ends the caller's currently-active support session (no-op if none).
 */
router.post("/support-session/end", requireSupportRole, async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const supportUserId = authed.supportUserId ?? authed.userId;

  // Snapshot the row first so we can audit-log the end with the session id
  // and district context even after the row is closed.
  const [existing] = await db.select().from(supportSessionsTable)
    .where(and(
      eq(supportSessionsTable.supportUserId, supportUserId),
      isNull(supportSessionsTable.endedAt),
    )).limit(1);
  if (!existing) {
    res.json({ ended: false });
    return;
  }
  await endActiveSupportSessions(supportUserId, "manual");

  // Same self-tagging as /open: the override loaded the session id earlier
  // when the request started, but if it didn't (e.g. cache was cold), make
  // sure the END audit row carries the session id we just closed.
  authed.supportSessionId = existing.id;
  authed.supportUserId = supportUserId;

  logAudit(req, {
    action: "update",
    targetTable: "support_sessions",
    targetId: existing.id,
    summary: `Noverta support ended read-only session for district #${existing.districtId}`,
    metadata: {
      districtId: existing.districtId,
      endReason: "manual",
      durationMs: Date.now() - existing.openedAt.getTime(),
    },
  });

  res.json({ ended: true, sessionId: existing.id });
});

// ---------------------------------------------------------------------------
// District-admin facing surface: recent support sessions affecting this district.
// Mounted with requireDistrictScope upstream so authedReq.tenantDistrictId is set.
// Restricted to admin/coordinator — the same roles that already see the audit log.
// ---------------------------------------------------------------------------
const recentRouter: IRouter = Router();
recentRouter.get("/support-sessions/recent",
  requireRoles("admin", "coordinator"),
  async (req: Request, res: Response) => {
    const authed = req as unknown as AuthedRequest;
    const districtId = authed.tenantDistrictId;
    if (districtId == null) {
      res.status(403).json({ error: "District scope required" });
      return;
    }
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    try {
      const rows = await db.select().from(supportSessionsTable)
        .where(eq(supportSessionsTable.districtId, districtId))
        .orderBy(desc(supportSessionsTable.openedAt))
        .limit(limit);
      // For each session, count audit_logs rows tagged with this session id so
      // the district admin can see "session X touched 47 records". Done as a
      // single batched query to avoid N+1.
      const ids = rows.map(r => r.id);
      // Drizzle parameterizes JS arrays as positional parameters, but
      // Postgres rejects them in `= ANY($n)` without an explicit cast and
      // some driver versions stringify int[] oddly. Easier and safer: build
      // a typed Postgres array literal from the integer ids (which we
      // control — they came from our own SELECT just above) and inline it.
      const idLiteral = sql.raw(`ARRAY[${ids.map(n => Number(n)).join(",")}]::int[]`);
      const counts = ids.length === 0 ? [] : (await db.execute(sql`
        SELECT (metadata->'supportSession'->>'sessionId')::int AS session_id,
               COUNT(*)::int AS n
        FROM audit_logs
        WHERE metadata IS NOT NULL
          AND (metadata->'supportSession'->>'sessionId')::int = ANY(${idLiteral})
        GROUP BY session_id
      `)).rows as Array<{ session_id: number; n: number }>;
      const countByid = new Map(counts.map(c => [Number(c.session_id), Number(c.n)]));
      res.json({
        sessions: rows.map(r => ({
          ...serializeSession(r),
          supportDisplayName: r.supportDisplayName,
          auditEntryCount: countByid.get(r.id) ?? 0,
        })),
      });
    } catch (err) {
      console.error("[SupportSession] recent-for-district error:", err);
      res.status(500).json({ error: "Failed to load recent support sessions" });
    }
  });

function serializeSession(row: typeof supportSessionsTable.$inferSelect) {
  return {
    sessionId: row.id,
    supportUserId: row.supportUserId,
    supportDisplayName: row.supportDisplayName,
    districtId: row.districtId,
    reason: row.reason,
    openedAt: row.openedAt,
    expiresAt: row.expiresAt,
    endedAt: row.endedAt,
    endReason: row.endReason,
  };
}

export default router;
export { recentRouter as supportSessionsDistrictAdminRouter };
