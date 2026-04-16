import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { type TrellisRole, isRole, ROLE_HIERARCHY } from "../lib/permissions";
import { getPublicMeta } from "../lib/clerkClaims";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

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

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Production: explicitly reject any dev-only test headers to prevent spoofing.
  if (process.env.NODE_ENV === "production") {
    if (req.headers["x-test-user-id"] || req.headers["x-test-role"] || req.headers["x-test-district-id"]) {
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
      next();
      return;
    }
  }

  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  (req as AuthedRequest).userId = auth.userId;
  const role = extractRole(req);
  if (!role) {
    res.status(403).json({ error: "No role assigned. Contact your administrator." });
    return;
  }
  (req as AuthedRequest).trellisRole = role;
  (req as AuthedRequest).displayName = extractDisplayName(req);

  // Extract tenant scope from Clerk token metadata
  const meta = getPublicMeta(req);
  (req as AuthedRequest).tenantDistrictId = meta.districtId ?? null;
  (req as AuthedRequest).tenantStaffId = meta.staffId ?? null;
  (req as AuthedRequest).tenantStudentId = meta.studentId ?? null;
  (req as AuthedRequest).tenantGuardianId = meta.guardianId ?? null;

  next();
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
export function requireDistrictScope(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const authed = req as AuthedRequest;
    const meta = getPublicMeta(req);
    if (meta.platformAdmin) { next(); return; }
    if (authed.tenantDistrictId != null) { next(); return; }

    // In dev mode, auto-resolve the district from the DB so dev accounts without
    // a districtId claim in their Clerk metadata can still access the app.
    if (process.env.NODE_ENV !== "production") {
      db.execute(sql`SELECT id FROM districts ORDER BY id LIMIT 1`)
        .then((result) => {
          const rows = result.rows as Array<{ id: number }>;
          if (rows.length > 0) {
            authed.tenantDistrictId = Number(rows[0].id);
            next();
          } else {
            res.status(403).json({ error: "No district found. Seed your database with at least one district." });
          }
        })
        .catch(() => {
          res.status(403).json({ error: "Your account is not assigned to a district. Contact your administrator." });
        });
      return;
    }

    res.status(403).json({ error: "Your account is not assigned to a district. Contact your administrator." });
  });
}

export function requireRoles(...allowedRoles: TrellisRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      const authed = req as AuthedRequest;
      if (!allowedRoles.includes(authed.trellisRole)) {
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
        res.status(403).json({ error: "You don't have permission to access this resource" });
        return;
      }
      next();
    });
  };
}

export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const meta = getPublicMeta(req);
    if (!meta.platformAdmin) {
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
