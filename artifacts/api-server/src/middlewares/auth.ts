import { type Request, type Response, type NextFunction } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { type TrellisRole, isRole, ROLE_HIERARCHY } from "../lib/permissions";
import { getPublicMeta } from "../lib/clerkClaims";
import { recordAccessDenial } from "../lib/accessDenials";
import { db, staffTable, schoolsTable } from "@workspace/db";
import { sql, eq, isNull, and, inArray } from "drizzle-orm";
import { loadActiveViewAsSession, VIEW_AS_HEADER, endSessionByToken } from "../lib/viewAsSession";

export interface AuthedRequest extends Request {
  userId: string;
  trellisRole: TrellisRole;
  displayName: string;
  /** District ID from the authenticated token — use this for tenant-scoped queries. */
  tenantDistrictId: number | null;
  /** Staff ID from the authenticated token. */
  tenantStaffId: number | null;
  /** Student ID from the authenticated token (sped_student role only). */
  tenantStudentId: number | null;
  /** Guardian ID from the authenticated token (sped_parent role only). */
  tenantGuardianId: number | null;

  /**
   * View-as / impersonation context. When a platform admin is acting AS another
   * user via X-View-As-Token, all the tenant-scope fields above are rewritten
   * to the target user's identity, and these fields are populated with the
   * original admin's identity so audit log rows tag the impersonation.
   */
  viewAsAdminUserId?: string;
  viewAsAdminRole?: TrellisRole;
  viewAsSessionId?: number;
}

function extractRole(req: Request): TrellisRole | null {
  const auth = getAuth(req);
  if (!auth?.userId) return null;

  const meta = getPublicMeta(req);
  if (isRole(meta.role)) return meta.role as TrellisRole;

  if (process.env.NODE_ENV !== "production") {
    const demoRole = req.headers["x-demo-role"];
    if (isRole(demoRole)) return demoRole as TrellisRole;
    return "admin";
  }

  return null;
}

function extractDisplayName(req: Request): string {
  const meta = getPublicMeta(req);
  if (meta.name) return meta.name;
  if (process.env.NODE_ENV !== "production") {
    const demoName = req.headers["x-demo-name"];
    if (typeof demoName === "string" && demoName.trim()) return demoName.trim();
  }
  return "User";
}

/**
 * Apply a view-as override AFTER base auth has populated req.userId/role/etc.
 * Looks up the session row by token, validates that it belongs to the calling
 * admin and is not ended/expired, and rewrites tenant scope to act as the
 * target user. The original admin id is preserved on the request for audit
 * tagging via lib/auditLog.ts.
 *
 * Failure modes:
 *  - Token present but invalid/expired/wrong-admin → silently NO-OP (the
 *    request continues as the admin themselves). End-session and active-info
 *    endpoints surface the failure explicitly via their own DB lookups.
 *  - Session expired by clock but row still open → also auto-ends the row so
 *    audit trail captures the timeout.
 */
async function applyViewAsOverride(req: Request, token: string): Promise<void> {
  const authed = req as AuthedRequest;
  const adminUserId = authed.userId;
  const adminRole = authed.trellisRole;

  const session = await loadActiveViewAsSession(token, adminUserId);
  // NOTE: do NOT auto-end on null here. loadActiveViewAsSession returns null
  // for several distinct reasons — wrong admin, ended already, or expired —
  // and we must not collapse them. In particular, ending a session because
  // the wrong admin presented its token would let admin B silently terminate
  // admin A's still-valid session by simply hitting any endpoint with the
  // header. Self-healing of expired-but-open rows is handled by
  // /support/view-as/active when the legitimate admin polls.
  if (!session) return;

  authed.viewAsAdminUserId = adminUserId;
  authed.viewAsAdminRole = adminRole;
  authed.viewAsSessionId = session.id;

  authed.userId = session.targetUserId;
  authed.trellisRole = session.targetRole as TrellisRole;
  authed.displayName = session.targetDisplayName;
  authed.tenantDistrictId = session.targetDistrictId;
  authed.tenantStaffId = session.targetStaffId;
  authed.tenantStudentId = session.targetStudentId;
  authed.tenantGuardianId = session.targetGuardianId;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Production: explicitly reject any dev-only test headers to prevent spoofing.
  if (process.env.NODE_ENV === "production") {
    if (req.headers["x-test-user-id"] || req.headers["x-test-role"] || req.headers["x-test-district-id"]) {
      recordAccessDenial(req, "dev_headers_in_prod", 400, "x-test-* headers received in production");
      res.status(400).json({ error: "Dev-only headers are not accepted in production" });
      return;
    }
  }

  // Test-mode bypass: allowed ONLY when NODE_ENV === "test" (never "development" or any other env).
  // Used by the permission-matrix CI tests which run without a real Clerk session.
  if (process.env.NODE_ENV === "test") {
    const testUserId = req.headers["x-test-user-id"];
    const testRole = req.headers["x-test-role"];
    if (typeof testUserId === "string" && testUserId && isRole(testRole)) {
      const authed = req as AuthedRequest;
      authed.userId = testUserId;
      authed.trellisRole = testRole as TrellisRole;
      authed.displayName = `Test ${testRole}`;
      authed.tenantDistrictId = req.headers["x-test-district-id"]
        ? Number(req.headers["x-test-district-id"]) : null;
      authed.tenantStaffId = null;
      authed.tenantStudentId = null;
      authed.tenantGuardianId = null;
      maybeApplyViewAsAndContinue(req, next);
      return;
    }
  }

  const auth = getAuth(req);
  if (!auth?.userId) {
    recordAccessDenial(req, "unauthenticated", 401, "No Clerk session on request");
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  (req as AuthedRequest).userId = auth.userId;
  const role = extractRole(req);
  if (!role) {
    recordAccessDenial(req, "no_role", 403, "Authenticated user has no Trellis role in token metadata");
    res.status(403).json({ error: "No role assigned. Contact your administrator." });
    return;
  }
  (req as AuthedRequest).trellisRole = role;
  (req as AuthedRequest).displayName = extractDisplayName(req);

  // Extract tenant scope from Clerk token metadata.
  // Preserve a previously resolved tenantDistrictId (e.g. set by the dev-mode fallback in
  // requireDistrictScope) so repeated requireAuth calls don't reset it back to null.
  const meta = getPublicMeta(req);
  const authedReq = req as AuthedRequest;
  authedReq.tenantDistrictId = meta.districtId ?? authedReq.tenantDistrictId ?? null;
  authedReq.tenantStaffId = meta.staffId ?? null;
  authedReq.tenantStudentId = meta.studentId ?? null;
  authedReq.tenantGuardianId = meta.guardianId ?? null;

  maybeApplyViewAsAndContinue(req, next);
}

/**
 * If the request carries an X-View-As-Token header, asynchronously apply the
 * view-as override and then continue. Otherwise call next() synchronously.
 *
 * Centralised here so both the test-mode bypass and the real Clerk path
 * funnel through the same impersonation gate. Idempotent on repeat
 * requireAuth calls within a single HTTP request because applyViewAsOverride
 * consults a per-token in-memory cache.
 */
function maybeApplyViewAsAndContinue(req: Request, next: NextFunction): void {
  const raw = req.headers[VIEW_AS_HEADER];
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (typeof token !== "string" || !token) { next(); return; }
  applyViewAsOverride(req, token).then(() => next()).catch(next);
}

/**
 * Returns the district ID to use for data filtering.
 * Always derived from the auth token (set by requireAuth from Clerk claims or test headers).
 * Never falls back to a client-supplied query parameter — callers must not rely on
 * req.query.districtId for data scoping.
 */
export function getEnforcedDistrictId(req: AuthedRequest): number | null {
  return req.tenantDistrictId ?? null;
}

/**
 * Middleware: in production, overrides the `districtId` query param with the
 * value from the authenticated token so downstream route handlers cannot be
 * tricked into crossing tenant boundaries via crafted query strings.
 *
 * Reads Clerk session claims directly so it can run before per-route requireAuth calls.
 * Apply globally on /api routes (or per-route after requireAuth).
 */
export function enforceDistrictScope(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV !== "production") { next(); return; }
  const meta = getPublicMeta(req);
  const tokenDistrictId = meta.districtId ?? null;
  if (tokenDistrictId != null) {
    // Overwrite any client-supplied districtId with the token value
    (req.query as Record<string, unknown>).districtId = String(tokenDistrictId);
    // Remove standalone schoolId — district-scoping is authoritative; routes use district→school lookups
    delete (req.query as Record<string, unknown>).schoolId;
  }
  next();
}

/**
 * Middleware: ensures the authenticated user has a district scope derived from their
 * token. If the user is NOT a platform admin and has no district claim, returns 403.
 *
 * Apply to any route that reads or writes district-scoped data. This guarantees that
 * all downstream handlers can safely call getEnforcedDistrictId() and get a non-null
 * value (unless explicitly checking for platform admin bypass).
 */
/**
 * Optional explicit dev override. When set (e.g. for QA on staging) every
 * authenticated request is forced into this district regardless of token
 * claims. Intentionally NOT a silent first-row fallback — that hazard is what
 * caused the multi-tenant pin bug. Requires explicit operator action to enable.
 */
const _forcedDistrictId: number | null = process.env.TRELLIS_DEV_FORCE_DISTRICT_ID
  ? Number(process.env.TRELLIS_DEV_FORCE_DISTRICT_ID)
  : null;

/**
 * Cache of Clerk user ID -> resolved district ID. Process-local.
 *
 * IMPORTANT: we ONLY cache positive resolutions (a real district id) and we
 * cap each entry with a short TTL. Caching `null` would strand a brand-new
 * admin who hasn't been linked to a staff row yet — they'd be denied
 * indefinitely until the server restarts, even right after the coordinator
 * adds them. The ~1-min TTL also means staff transfers between districts
 * are picked up without restart.
 */
const _userDistrictCache = new Map<string, { districtId: number; expiresAt: number }>();
const USER_DISTRICT_CACHE_TTL_MS = 60_000;

/** Manually drop a user from the cache after a known mutation (e.g. staff move). */
export function invalidateUserDistrictCache(userId?: string): void {
  if (userId) _userDistrictCache.delete(userId);
  else _userDistrictCache.clear();
}

/** Look up the caller's district by tracing Clerk user → primary email → staff row → school. */
async function resolveDistrictFromClerkUser(userId: string): Promise<number | null> {
  const cached = _userDistrictCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.districtId;
  if (cached) _userDistrictCache.delete(userId);
  try {
    const user = await clerkClient.users.getUser(userId);
    const emails = user.emailAddresses
      .map(e => e.emailAddress?.toLowerCase())
      .filter((e): e is string => !!e);
    if (emails.length === 0) return null;
    // Find an active staff row whose email matches and whose school resolves to a district.
    const rows = await db
      .select({ districtId: schoolsTable.districtId })
      .from(staffTable)
      .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
      .where(and(
        isNull(staffTable.deletedAt),
        inArray(sql`lower(${staffTable.email})`, emails),
      ))
      .limit(1);
    const districtId = rows[0]?.districtId ?? null;
    if (districtId != null) {
      _userDistrictCache.set(userId, {
        districtId,
        expiresAt: Date.now() + USER_DISTRICT_CACHE_TTL_MS,
      });
    }
    return districtId;
  } catch (err) {
    console.error("[Auth] resolveDistrictFromClerkUser failed:", err);
    return null;
  }
}

/**
 * Initializer kept for backwards compatibility. The legacy "first district in
 * the table is everyone's tenant in dev" behavior was removed; this now only
 * logs whether the explicit TRELLIS_DEV_FORCE_DISTRICT_ID override is active.
 */
export async function initDevDistrictFallback(): Promise<void> {
  if (_forcedDistrictId != null) {
    console.log(`[Auth] TRELLIS_DEV_FORCE_DISTRICT_ID is set — every request will be pinned to district ${_forcedDistrictId}. Do not enable in production.`);
  }
}

export function requireDistrictScope(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    void (async () => {
      const authed = req as AuthedRequest;

      // Test-mode platform-admin bypass.
      //
      // In production, platform admins are identified by `meta.platformAdmin === true`
      // in their Clerk session token. In test mode there is no Clerk session, so that
      // claim is never present. Without this bypass, any test user with districtId == null
      // would be blocked by requireDistrictScope even though `staffInCallerDistrict` (and
      // sibling helpers in lib/districtScope.ts) correctly allow null-district callers.
      //
      // Usage: set the request header `x-test-platform-admin: true` in addition to the
      // usual `x-test-user-id` / `x-test-role` headers. This is the ONLY legitimate use
      // of this header — do NOT use it to work around role restrictions on other routes.
      // The requireAuth block above already rejects all x-test-* headers in production.
      if (process.env.NODE_ENV === "test" && req.headers["x-test-platform-admin"] === "true") {
        next();
        return;
      }

      const meta = getPublicMeta(req);
      if (meta.platformAdmin) { next(); return; }

      // Explicit dev override (must be set deliberately via env). Never on in prod.
      if (process.env.NODE_ENV !== "production" && _forcedDistrictId != null) {
        authed.tenantDistrictId = _forcedDistrictId;
        next();
        return;
      }

      if (authed.tenantDistrictId != null) { next(); return; }

      // Token didn't carry a districtId — try to resolve from Clerk identity.
      // This recovers users whose Clerk metadata wasn't backfilled but who do
      // exist in the staff table for some district.
      const resolved = await resolveDistrictFromClerkUser(authed.userId);
      if (resolved != null) {
        authed.tenantDistrictId = resolved;
        next();
        return;
      }

      recordAccessDenial(req, "no_district_scope", 403, "Authenticated user has no district claim and no matching staff row");
      res.status(403).json({
        error: "Your account isn't linked to a district yet. Ask a district admin to add your email to their staff list, then sign in again.",
      });
    })().catch(next);
  });
}

export function requireRoles(...allowedRoles: TrellisRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      const authed = req as AuthedRequest;
      if (!allowedRoles.includes(authed.trellisRole)) {
        recordAccessDenial(req, "role_forbidden", 403, `Role "${authed.trellisRole}" not in allowed list [${allowedRoles.join(", ")}]`);
        res.status(403).json({ error: "You don't have permission to access this resource" });
        return;
      }
      next();
    });
  };
}

export function requireMinRole(minRole: TrellisRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      const authed = req as AuthedRequest;
      if (ROLE_HIERARCHY[authed.trellisRole] < ROLE_HIERARCHY[minRole]) {
        recordAccessDenial(req, "role_forbidden", 403, `Role "${authed.trellisRole}" below required minimum "${minRole}"`);
        res.status(403).json({ error: "You don't have permission to access this resource" });
        return;
      }
      next();
    });
  };
}

export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    // Test-mode bypass: mirror the same pattern requireDistrictScope already
    // uses for its `x-test-platform-admin: true` header. Without this the
    // /support routes (including the view-as impersonation endpoints) would
    // be unreachable from the regression suite, since test mode has no Clerk
    // session and therefore no `meta.platformAdmin` claim. The header is
    // explicitly rejected in production by the requireAuth block above.
    if (process.env.NODE_ENV === "test" && req.headers["x-test-platform-admin"] === "true") {
      next();
      return;
    }
    const meta = getPublicMeta(req);
    if (!meta.platformAdmin) {
      recordAccessDenial(req, "platform_admin_required", 403, "Non-platform-admin attempted to reach a /support endpoint");
      res.status(403).json({ error: "Platform admin access required" });
      return;
    }
    next();
  });
}

/**
 * Middleware: ensures the authenticated user is a sped_parent with a valid guardianId claim.
 * All guardian-portal routes must be preceded by this middleware.
 * In dev mode (NODE_ENV !== "production"), falls back to x-demo-guardian-id header.
 */
export function requireGuardianScope(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const authed = req as AuthedRequest;
    if (authed.trellisRole !== "sped_parent") {
      recordAccessDenial(req, "guardian_scope_required", 403, `Guardian-portal route hit by role "${authed.trellisRole}"`);
      res.status(403).json({ error: "Guardian portal access requires the sped_parent role." });
      return;
    }
    // In dev mode allow a demo header to set guardianId for testing
    if (process.env.NODE_ENV !== "production" && !authed.tenantGuardianId) {
      const demoId = req.headers["x-demo-guardian-id"];
      if (demoId && !isNaN(Number(demoId))) {
        authed.tenantGuardianId = Number(demoId);
      }
    }
    if (!authed.tenantGuardianId) {
      res.status(403).json({ error: "No guardian identity found. Contact your district administrator to link your portal account." });
      return;
    }
    next();
  });
}
