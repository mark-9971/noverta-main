import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { type TrellisRole, isRole } from "../lib/permissions";

export interface AuthedRequest extends Request {
  userId: string;
  trellisRole: TrellisRole;
}

function extractRole(req: Request): TrellisRole | null {
  const auth = getAuth(req);
  if (!auth?.userId) return null;
  const meta = (auth.sessionClaims as any)?.publicMetadata;
  const role = meta?.role;
  if (isRole(role)) return role;

  // In non-production environments, accept the X-Demo-Role header as a
  // fallback so that dev/demo users can operate without Clerk metadata.
  if (process.env.NODE_ENV !== "production") {
    const demoRole = req.headers["x-demo-role"];
    if (isRole(demoRole)) return demoRole as TrellisRole;
    return "admin"; // default demo role for full access
  }

  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
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
    const { ROLE_HIERARCHY } = require("../lib/permissions");
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
