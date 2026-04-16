import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { type TrellisRole, isRole, ROLE_HIERARCHY } from "../lib/permissions";
import { getPublicMeta } from "../lib/clerkClaims";

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
  // Test-mode bypass: allows CI permission-matrix tests to run without a real Clerk session.
  // Activated only when NODE_ENV=test AND both x-test-user-id and x-test-role are present.
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

  next();
}

/**
 * Returns the district ID to use for data filtering.
 * - Production: always returns the value from the auth token (cannot be overridden by query).
 * - Dev/test: prefers token value when present; falls back to client query param.
 */
export function getEnforcedDistrictId(req: AuthedRequest): number | null {
  const tokenDistrict = req.tenantDistrictId;
  if (process.env.NODE_ENV === "production") {
    return tokenDistrict;
  }
  if (tokenDistrict) return tokenDistrict;
  const qd = req.query.districtId ? Number(req.query.districtId) : null;
  return qd || null;
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
